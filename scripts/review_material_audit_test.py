import codecs
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import review_material_audit as audit


class ReviewMaterialAuditTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='jx-material-audit-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'empty-hooks').mkdir()
        self.git('init', '-q')
        self.git('config', 'user.name', 'Synthetic audit test')
        self.git('config', 'user.email', 'synthetic@example.invalid')

    def git(self, *args):
        return subprocess.check_output(['git', '-c', 'core.hooksPath=' + str(self.root / 'empty-hooks'), '-c', 'commit.gpgsign=false', '-C', str(self.root), *args], stderr=subprocess.DEVNULL)

    def write(self, name, data):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data if isinstance(data, bytes) else data.encode('utf8'))

    def commit(self):
        self.git('add', '-A')
        self.git('commit', '-qm', 'Synthetic fixture')
        return self.git('rev-parse', 'HEAD').decode().strip()

    def test_clean_tree_never_reads_untracked_environment(self):
        self.write('docs/review.md', '合成审阅说明')
        head = self.commit()
        self.write('.env', 'PRIVATE_LOCAL_VALUE=untracked-local-only')
        r = audit.audit(self.root, head)
        self.assertEqual(r['counts']['text_files_scanned'], 1)
        self.assertEqual(r['findings'], [])
        self.assertFalse(r['working_tree_read'])
        self.assertFalse(r['merge_approved'])

    def test_restricted_paths_report_only_path_and_category(self):
        for name in ['.env', '.env.production', '.local/runtime.json', 'secrets/token.txt', 'customer.zip', 'data.sqlite', 'signing.pem']:
            self.write(name, 'PRIVATE_SYNTHETIC_CONTENT')
        r = audit.audit(self.root, self.commit())
        self.assertEqual(r['counts']['restricted_paths'], 7)
        self.assertEqual(r['counts']['text_files_scanned'], 0)
        self.assertNotIn('PRIVATE_SYNTHETIC_CONTENT', json.dumps(r))
        self.assertTrue(all(set(x) == {'path', 'category'} for x in r['findings']))

    def test_patterns_are_found_without_exposing_values(self):
        values = [('PRIVATE_KEY_BLOCK', '-----BEGIN ' + 'PRIVATE KEY-----\n' + 'A' * 64),
                  ('CLOUD_ACCESS_KEY', 'AK' + 'IA' + 'B' * 16),
                  ('GITHUB_TOKEN', 'gh' + 'p_' + 'c' * 36),
                  ('SLACK_TOKEN', 'xox' + 'b-' + '9' * 25),
                  ('DATABASE_URL_CREDENTIAL', 'mysql://' + 'fixture:' + 'z' * 20 + '@example.invalid/db')]
        for n, (_, value) in enumerate(values):
            self.write(f'proof{n}.txt', value)
        r = audit.audit(self.root, self.commit())
        self.assertEqual({x['category'] for x in r['findings']}, {c for c, _ in values})
        for _, value in values:
            self.assertNotIn(value, json.dumps(r))

    def test_utf16_and_disguised_image_text_are_scanned(self):
        value = 'gh' + 'p_' + 'd' * 36
        self.write('windows.tap', codecs.BOM_UTF16_LE + value.encode('utf-16-le'))
        self.write('disguised.png', value)
        r = audit.audit(self.root, self.commit())
        self.assertEqual({x['path'] for x in r['findings']}, {'windows.tap', 'disguised.png'})

    def test_environment_template_is_not_exempt_from_content_scan(self):
        self.write('.env.example', 'TOKEN=' + 'gh' + 'p_' + 'e' * 36)
        r = audit.audit(self.root, self.commit())
        self.assertEqual(r['findings'][0]['category'], 'GITHUB_TOKEN')

    def test_immutable_commit_does_not_scan_changed_working_copy_or_other_commit(self):
        self.write('record.txt', 'safe synthetic')
        original = self.commit()
        self.write('record.txt', 'gh' + 'p_' + 'f' * 36)
        newer = self.commit()
        self.assertEqual(audit.audit(self.root, original)['findings'], [])
        self.assertEqual(len(audit.audit(self.root, newer)['findings']), 1)
        self.assertFalse(audit.audit(self.root, original)['history_scanned'])

    def test_binary_and_oversize_are_explicitly_uninspected(self):
        self.write('image.png', b'\x89PNG\0\xff')
        self.write('large.txt', 'x' * 100)
        head = self.commit()
        with patch.object(audit, 'MAX_BLOB', 20):
            r = audit.audit(self.root, head)
        self.assertEqual(r['counts']['uninspected_files'], 2)
        self.assertFalse(r['binary_privacy_verified'])
        self.assertFalse(r['all_credentials_identified'])

    def test_path_guard_does_not_follow_symlinks_or_archive_material(self):
        self.assertEqual(audit.path_category('link', '120000'), 'SYMLINK_NOT_PACKAGED')
        self.assertEqual(audit.path_category('../outside', '100644'), 'UNSAFE_GIT_PATH')
        self.assertEqual(audit.path_category('KEY.P12', '100644'), 'ARCHIVE_DATABASE_OR_KEY_MATERIAL')

    def test_full_commit_is_required(self):
        for value in ['HEAD', 'abc123', '--all', 'a' * 39, 'z' * 40]:
            with self.subTest(value=value), self.assertRaisesRegex(audit.AuditError, '^FULL_COMMIT_REQUIRED$'):
                audit.audit(self.root, value)

    def test_cli_blocks_findings_without_echo_and_does_not_overwrite_report(self):
        self.write('scripts/review_material_audit.py', Path(audit.__file__).read_bytes())
        value = 'gh' + 'p_' + 'g' * 36
        self.write('record.txt', value)
        head = self.commit()
        report = self.root / 'report.json'
        cmd = [sys.executable, str(self.root / 'scripts/review_material_audit.py'), '--commit', head, '--report', str(report)]
        r = subprocess.run(cmd, capture_output=True, encoding='utf8')
        self.assertEqual(r.returncode, 1)
        self.assertNotIn(value, r.stdout + r.stderr + report.read_text(encoding='utf8'))
        first = report.read_bytes()
        again = subprocess.run(cmd, capture_output=True, encoding='utf8')
        self.assertEqual(again.returncode, 2)
        self.assertEqual(report.read_bytes(), first)
        self.assertNotIn(value, again.stdout + again.stderr)


if __name__ == '__main__':
    unittest.main()
