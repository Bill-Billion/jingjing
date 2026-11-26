"""Do not promote fragments, mixed versions/environments or duplicate slot events."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

import qa18_coverage as c


class CoverageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        p = self.root / 'evidence.json'
        p.write_bytes(b'{"synthetic_test_fixture":true}\n')
        self.proof = {'path': 'evidence.json', 'sha256': c.sha(p.read_bytes())}
        freeze = {k: {'sha': '1' * 40, 'digest': self.proof['sha256'], 'manifest': self.proof}
                  for k in c.VERSION_KEYS}
        self.key = 'E2E-01|app|normal'
        self.event = {'key': self.key, 'batch_id': 'final-test-fixture', 'freeze': freeze,
                      'environment': 'isolated-A', 'outcome': 'PASS', 'exit_code': 0,
                      'scope': 'COMPLETE_ORIGINAL_SLOT', 'business_id': 'order-1', 'roles': ['buyer', 'reviewer'],
                      'command': 'synthetic-validator-test', 'assertions': ['original'],
                      'raw_log': self.proof, 'evidence_summary': self.proof}
        self.batch = {'id': 'final-test-fixture', 'phase': 'T3', 'environments': ['isolated-A', 'isolated-B'],
                      'real_payments': False, 'production': False, 'freeze': freeze,
                      'chain_records': {'E2E-01': {'business_id': 'order-1', 'environment': 'isolated-A'}},
                      'events': [self.event]}

    def run_batch(self):
        return c.final_results(self.batch, {self.key}, self.root)

    def test_no_final_batch_cannot_inherit_history(self):
        self.assertEqual(c.final_results(None, {self.key})[self.key]['outcome'], 'NOT_RUN')

    def test_pinned_single_batch_is_accepted_by_validator(self):
        self.assertEqual(self.run_batch()[self.key]['outcome'], 'PASS')

    def test_changed_product_is_rejected(self):
        self.event['freeze'] = copy.deepcopy(self.event['freeze'])
        self.event['freeze']['app']['sha'] = '2' * 40
        with self.assertRaisesRegex(ValueError, 'Mixed product'):
            self.run_batch()

    def test_same_record_other_environment_is_rejected(self):
        self.event['environment'] = 'isolated-B'
        with self.assertRaisesRegex(ValueError, 'mix environments'):
            self.run_batch()

    def test_other_record_in_same_chain_is_rejected(self):
        self.event['business_id'] = 'order-2'
        with self.assertRaisesRegex(ValueError, 'records changed'):
            self.run_batch()

    def test_duplicate_slot_does_not_inflate_count(self):
        self.batch['events'].append(copy.deepcopy(self.event))
        with self.assertRaisesRegex(ValueError, 'duplicate final slot'):
            self.run_batch()

    def test_partial_and_failed_execution_cannot_pass(self):
        for key, value in [('scope', 'TAIL_ONLY'), ('exit_code', 1)]:
            original = self.event[key]
            self.event[key] = value
            with self.assertRaisesRegex(ValueError, 'Partial or failed'):
                self.run_batch()
            self.event[key] = original

    def test_altered_raw_evidence_is_rejected(self):
        (self.root / 'evidence.json').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'Evidence changed'):
            self.run_batch()

    def test_missing_migration_or_build_pin_is_rejected(self):
        del self.batch['freeze']['migrations']
        with self.assertRaisesRegex(ValueError, 'seven component'):
            self.run_batch()

    def test_machine_cannot_sign_review(self):
        self.key = 'ACC-DEL-00.01|review|review'
        self.event['key'] = self.key
        with self.assertRaisesRegex(ValueError, 'human review'):
            self.run_batch()

    def test_business_result_needs_record(self):
        del self.event['business_id']
        with self.assertRaisesRegex(ValueError, 'record ID'):
            self.run_batch()

    def test_duplicate_historical_copy_deduplicates_and_conflict_rejects(self):
        conf = {'run_id': 'old', 'backend_sha': '1'*40, 'app_sha': '1'*40, 'web_sha': '1'*40}
        event = {**conf, 'event_no': 1, 'key': self.key, 'outcome': 'PASS', 'evidence': self.proof}
        for directory in ['copy-A', 'copy-B']:
            p = self.root / directory
            p.mkdir()
            (p / 'config.json').write_bytes(c.canonical(conf))
            (p / 'events.jsonl').write_text(json.dumps(event)+'\n', encoding='utf-8')
        paths = ['copy-A/events.jsonl', 'copy-B/events.jsonl']
        events, runs = c.import_events(paths, {self.key}, self.root)
        self.assertEqual((len(events), len(runs)), (1, 1))
        event['outcome'] = 'FAIL'
        (self.root / paths[1]).write_text(json.dumps(event)+'\n', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'Conflicting duplicate'):
            c.import_events(paths, {self.key}, self.root)

    def test_metadata_does_not_infer_missing_environment(self):
        got = c.metadata({'backend': '1'*40, 'order_id': '12345678-1234-1234-1234-123456789012'})
        self.assertEqual(got['environments'], [])
        self.assertEqual(got['versions'][0]['pointer'], '/backend')

    def test_only_source_line_endings_are_portable_evidence_is_exact(self):
        p = self.root / 'source.json'
        p.write_bytes(b'{\r\n"a":1\r\n}\r\n')
        text_digest = c.source_sha(p)
        original = {'path': 'source.json', 'sha256': c.sha(p.read_bytes())}
        p.write_bytes(b'{\n"a":1\n}\n')
        self.assertEqual(c.source_sha(p), text_digest)
        with self.assertRaisesRegex(ValueError, 'Evidence changed'):
            c.require_proof(original, self.root)
        p.write_bytes(b'{\n"a":2\n}\n')
        self.assertNotEqual(c.source_sha(p), text_digest)


if __name__ == '__main__':
    unittest.main()
