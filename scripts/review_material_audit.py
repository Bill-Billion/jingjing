"""Read a pinned Git tree without checking out files or reading local configuration.
Reports paths/categories only. Text patterns cannot certify private data or binary safety.
"""
import argparse
import codecs
import json
from pathlib import Path, PurePosixPath
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MAX_BLOB = 20 * 1024 * 1024
PATTERNS = [
    ('PRIVATE_KEY_BLOCK', re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]{32,}')),
    ('CLOUD_ACCESS_KEY', re.compile(r'(?<![A-Za-z0-9])(?:AKIA[A-Z0-9]{16}|LTAI[A-Za-z0-9]{16,32}|AKLT[A-Za-z0-9]{20,64})(?![A-Za-z0-9])')),
    ('GITHUB_TOKEN', re.compile(r'(?<![A-Za-z0-9])(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{50,255})(?![A-Za-z0-9])')),
    ('SLACK_TOKEN', re.compile(r'(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{20,255}(?![A-Za-z0-9])')),
    ('DATABASE_URL_CREDENTIAL', re.compile(r'(?i)(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?|redis)://[^\s/@:]+:[^\s/@]{12,}@')),
]


class AuditError(Exception):
    pass


def git(root, *args):
    result = subprocess.run(['git', '-C', str(root), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise AuditError('GIT_READ_FAILED')
    return result.stdout


def path_category(name, mode):
    p = PurePosixPath(name)
    parts = [x.lower() for x in p.parts]
    leaf = p.name.lower()
    if mode == '120000':
        return 'SYMLINK_NOT_PACKAGED'
    if p.is_absolute() or '..' in p.parts:
        return 'UNSAFE_GIT_PATH'
    if leaf == '.env' or (leaf.startswith('.env.') and leaf not in {'.env.example', '.env.sample', '.env.template'}):
        return 'RUNTIME_ENV_FILE'
    if leaf.endswith('.env') or '.local' in parts or 'secrets' in parts:
        return 'LOCAL_RUNTIME_OR_SECRET_PATH'
    if p.suffix.lower() in {'.zip', '.7z', '.rar', '.gz', '.tar', '.db', '.sqlite', '.sqlite3', '.jxb', '.p12', '.pfx', '.jks', '.keystore', '.key', '.pem'}:
        return 'ARCHIVE_DATABASE_OR_KEY_MATERIAL'
    return None


def decode_text(data):
    try:
        if data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
            return data.decode('utf-16')
        if b'\0' in data:
            return None
        return data.decode('utf-8-sig')
    except UnicodeError:
        return None


def audit(root, commit):
    if not re.fullmatch('[a-f0-9]{40}', commit or ''):
        raise AuditError('FULL_COMMIT_REQUIRED')
    if git(root, 'rev-parse', '--verify', commit + '^{commit}').decode().strip() != commit:
        raise AuditError('COMMIT_MISMATCH')
    tree = git(root, 'ls-tree', '-r', '-l', '-z', commit).split(b'\0')
    entries = []
    for row in tree:
        if row:
            metadata, raw_name = row.split(b'\t', 1)
            mode, kind, oid, size = metadata.decode('ascii').split()
            entries.append((raw_name.decode('utf-8'), mode, kind, oid, int(size) if size.isdigit() else None))
    findings, uninspected = [], []
    counters = {'tree_entries': len(entries), 'text_files_scanned': 0, 'restricted_paths': 0, 'uninspected_files': 0}
    blobs = subprocess.Popen(['git', '-C', str(root), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        for name, mode, kind, oid, size in entries:
            category = path_category(name, mode)
            if category:
                findings.append({'path': name, 'category': category})
                counters['restricted_paths'] += 1
                # Do not open known runtime/key/database/archive material even when tracked.
                continue
            if kind != 'blob' or size is None or size > MAX_BLOB:
                category = 'NON_BLOB_UNINSPECTED' if kind != 'blob' else 'SIZE_LIMIT_UNINSPECTED'
                uninspected.append({'path': name, 'category': category})
                continue
            blobs.stdin.write((oid + '\n').encode('ascii'))
            blobs.stdin.flush()
            header = blobs.stdout.readline().split()
            if header != [oid.encode('ascii'), b'blob', str(size).encode('ascii')]:
                raise AuditError('GIT_BLOB_READ_FAILED')
            data = blobs.stdout.read(size)
            if len(data) != size or blobs.stdout.read(1) != b'\n':
                raise AuditError('GIT_BLOB_READ_FAILED')
            text = decode_text(data)
            if text is None:
                uninspected.append({'path': name, 'category': 'BINARY_OR_ENCODING_UNINSPECTED'})
                continue
            counters['text_files_scanned'] += 1
            for category, pattern in PATTERNS:
                if pattern.search(text):
                    findings.append({'path': name, 'category': category})
        blobs.stdin.close()
        if blobs.wait(timeout=30):
            raise AuditError('GIT_BLOB_READ_FAILED')
    finally:
        if blobs.poll() is None:
            blobs.kill()
            blobs.wait()
        if not blobs.stdin.closed:
            blobs.stdin.close()
        blobs.stdout.close()
    counters['uninspected_files'] = len(uninspected)
    return {'format': 'JX_REVIEW_MATERIAL_AUDIT_V1', 'commit': commit,
            'result': 'REVIEW_REQUIRED' if findings else 'NO_LISTED_TEXT_PATTERN_FOUND',
            'counts': counters, 'findings': findings, 'uninspected': uninspected,
            'working_tree_read': False, 'history_scanned': False, 'network_used': False,
            'binary_privacy_verified': False, 'all_personal_data_identified': False,
            'all_credentials_identified': False, 'merge_approved': False,
            'limits': 'Pinned tree only; known path and text patterns. No archive/image OCR, history scan, live credential validation or approval. Inspect uninspected files separately.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    try:
        report = audit(ROOT, args.commit)
        if args.report:
            with args.report.open('x', encoding='utf-8', newline='\n') as f:
                json.dump(report, f, ensure_ascii=False, indent=2)
                f.write('\n')
        # Deliberately omit file bodies, matching values, line excerpts and exception messages.
        print(json.dumps({k: v for k, v in report.items() if k != 'uninspected'}, ensure_ascii=False))
        return 1 if report['findings'] else 0
    except (AuditError, OSError, ValueError, subprocess.SubprocessError) as e:
        print(json.dumps({'result': 'BLOCKED', 'code': str(e) if isinstance(e, AuditError) else 'AUDIT_OPERATION_FAILED'}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
