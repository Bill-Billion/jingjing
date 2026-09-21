#!/usr/bin/env python3
"""Verify this handoff package. Standard library only; no network or writes."""
from pathlib import Path
import hashlib
import json
import sys

def main() -> int:
    base = Path(__file__).resolve().parents[1]
    errors = []
    manifest_path = base / 'MANIFEST.json'
    if not manifest_path.is_file():
        print('FAIL: MANIFEST.json is missing')
        return 1
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    for row in manifest['files']:
        target = (base / row['path']).resolve()
        if not target.is_relative_to(base):
            errors.append('Unsafe path: '+row['path']); continue
        if not target.is_file():
            errors.append('Missing: '+row['path']); continue
        actual = hashlib.sha256(target.read_bytes()).hexdigest()
        if actual != row['sha256']:
            errors.append('Hash mismatch: '+row['path'])
    req = json.loads((base/'data/requirements_intake.json').read_text(encoding='utf-8'))['requirements']
    ids = [r['id'] for r in req]
    if ids != [f'REQ-{i:03d}' for i in range(1,61)]:
        errors.append('Requirement IDs are not exactly REQ-001 through REQ-060')
    original = json.loads((base/'extracted/V3_WORKBOOK_VALUES.json').read_text(encoding='utf-8'))
    rows = original['决策总表']['values']
    if len(rows) != 33 or any(r[8] not in (None,'') for r in rows[1:]):
        errors.append('Original 32 meeting-result cells changed or count differs')
    for r in req:
        if r['local_verification']['test_result'] != 'NOT_RUN':
            errors.append('Handoff unexpectedly asserts local test execution: '+r['id'])
        if r['implementation_approval'] != 'NOT_GRANTED_IN_THIS_PACKAGE':
            errors.append('Handoff unexpectedly asserts implementation approval: '+r['id'])
    for row in json.loads((base/'data/source_index.json').read_text(encoding='utf-8'))['sources']:
        p=base/row['path']
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=row['sha256']:
            errors.append('Source integrity failure: '+row['id'])
    if errors:
        for e in errors: print('FAIL:', e)
        return 1
    print('PASS:',len(manifest['files']),'files match their SHA-256 manifest')
    print('PASS: 60 unique requirement IDs; original 32 meeting results remain blank')
    print('PASS: source copies intact; no application test or implementation approval claimed')
    print('NOTE: This checks handoff integrity, not business correctness or app readiness.')
    return 0

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print('FAIL:',str(exc),file=sys.stderr)
        raise SystemExit(1)
