"""Adversarial checks for the acceptance register, using synthetic evidence only."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from full_business_check import ROOT, REGISTER, SOURCE, PAIR_IDS, blocks_source_freeze, read, validate


class AcceptanceGateTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = copy.deepcopy(read(ROOT, REGISTER))
        self.board = copy.deepcopy(read(ROOT, 'docs/tasks/board.json'))
        self.source = read(ROOT, SOURCE)
        # Synthetic fixtures supply explicit local decision records, not real approvals.
        for item in self.data['items'] + self.data['supplemental_items']:
            for ref in item.get('decision_refs', []):
                path = self.root / ref.split('#')[0]
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('test decision')
        self.review = {'author': 'fixture-author', 'reviewer': 'fixture-reviewer', 'reason': 'synthetic fixture only', 'decision': 'review.md'}
        (self.root / 'review.md').write_text('synthetic review')
        for ref in ('contracts/openapi.yaml', 'docs/collaboration/client-complete-20261028/PROVISIONAL_RULES.md'):
            target = self.root / ref
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((ROOT / ref).read_bytes())
        self.commit = 'a' * 40
        self.raw = self.put('raw.txt', 'synthetic run output')

    def put(self, name, value):
        payload = json.dumps(value).encode() if isinstance(value, dict) else value.encode()
        (self.root / name).write_bytes(payload)
        return {'path': name, 'sha256': hashlib.sha256(payload).hexdigest()}

    def errors(self, ready=False):
        return validate(self.root, self.data, self.board, self.source, ready, self.commit if ready else None)

    def report_for(self, items):
        checks = []
        for item in items:
            for surface in item['required_surfaces']:
                for case in item['required_cases']:
                    checks.append({'acceptance_id': item['id'], 'case': case, 'surface': surface,
                                   'result': 'PASS', 'record_id': 'same-order', 'actor': 'buyer' if surface == 'app' else 'reviewer'})
        return {'result': 'PASS', 'code_sha': self.commit, 'environment': 'isolated', 'dataset_id': 'fixture-data',
                'contract_version': self.data['release']['contract_version'], 'rules_version': self.data['release']['rules_version'],
                'build_hashes': {'app': self.raw['sha256'], 'web': self.raw['sha256']},
                'summary': {'passed': len(checks), 'failed': 0, 'skipped': 0}, 'checks': checks, 'artifacts': [self.raw]}

    def use_report(self, items, report):
        ref = self.put('report.json', report)
        for item in items:
            item.update(status='PASS', evidence=[ref])

    def complete_fixture(self):
        items = self.data['items'] + self.data['supplemental_items']
        self.use_report(items, self.report_for(items))
        self.data['release'].update(code_sha=self.commit, dataset_id='fixture-data', builds={'app': self.raw, 'web': self.raw}, review=self.review)
        for task in self.board['tasks']:
            if task['id'] in PAIR_IDS:
                task.update(implementation='COMPLETE', test_status='PASS', status='IN_REVIEW', review_status='APPROVED', review_evidence=self.review)

    def test_pending_registration_is_not_ready(self):
        self.assertEqual(self.errors(), [])
        self.assertTrue(self.errors(ready=True))

    def test_complete_synthetic_candidate_can_pass(self):
        self.complete_fixture()
        self.assertEqual(self.errors(ready=True), [])

    def test_missing_or_duplicate_source_is_rejected(self):
        self.data['items'][-1] = copy.deepcopy(self.data['items'][0])
        self.assertTrue(any('source IDs' in e for e in self.errors()))

    def test_missing_task_specific_case_is_rejected(self):
        self.data['supplemental_items'].pop()
        self.assertTrue(any('task-specific' in e for e in self.errors()))

    def test_pass_without_run_or_with_legacy_boolean_is_rejected(self):
        self.data['items'][0].update(status='PASS', full_flow_pass=True)
        errors = self.errors()
        self.assertTrue(any('actual run reports' in e for e in errors))
        self.assertTrue(any('old full_flow_pass' in e for e in errors))

    def test_skip_cannot_be_hidden_by_pass_header(self):
        item = self.data['items'][0]
        report = self.report_for([item])
        report['checks'][0]['result'] = 'SKIP'
        report['summary']['skipped'] = 1
        self.use_report([item], report)
        self.assertTrue(any('skipped' in e or 'zero failures' in e for e in self.errors()))

    def test_missing_e2e_branch_and_surface_are_rejected(self):
        item = next(i for i in self.data['items'] if i['id'] == 'E2E-01')
        report = self.report_for([item])
        report['checks'] = [c for c in report['checks'] if c['case'] != 'recovery' and c['surface'] != 'web']
        report['summary']['passed'] = len(report['checks'])
        self.use_report([item], report)
        self.assertTrue(any('missing required' in e for e in self.errors()))

    def test_unrelated_records_cannot_be_joined_into_one_chain(self):
        item = next(i for i in self.data['items'] if i['id'] == 'E2E-01')
        report = self.report_for([item])
        for check in report['checks']:
            check['record_id'] = check['surface'] + '-different-order'
        self.use_report([item], report)
        self.assertTrue(any('same business record' in e for e in self.errors()))

    def test_changed_artifact_invalidates_evidence(self):
        item = self.data['items'][0]
        self.use_report([item], self.report_for([item]))
        (self.root / 'raw.txt').write_text('edited after test')
        self.assertTrue(any('artifact changed' in e for e in self.errors()))

    def test_stale_code_and_build_cannot_release(self):
        self.complete_fixture()
        self.data['release']['code_sha'] = 'b' * 40
        self.data['release']['builds']['app'] = self.put('other-build.txt', 'different build')
        errors = self.errors(ready=True)
        self.assertTrue(any('stale/mismatched code_sha' in e for e in errors))
        self.assertTrue(any('frontend build differs' in e for e in errors))

    def test_unfinished_implementation_blocks_acceptance_claim(self):
        next(t for t in self.board['tasks'] if t['id'] == 'CORE-CLIENT-COMPLETE-17')['test_status'] = 'PASS'
        self.assertTrue(any('cannot finish' in e for e in self.errors()))

    def test_missing_provider_or_code_is_not_a_scope_waiver(self):
        self.data['items'][0].update(status='NOT_APPLICABLE', boundary={**self.review, 'kind': 'PROVIDER_UNAVAILABLE'})
        self.assertTrue(any('not an applicability waiver' in e for e in self.errors()))

    def test_delivery_checks_cannot_be_waived(self):
        self.complete_fixture()
        self.data['supplemental_items'][-1].update(status='NOT_APPLICABLE', evidence=[], boundary={**self.review, 'kind': 'SUPERSEDED'})
        self.assertTrue(any('task scope cannot be waived' in e for e in self.errors(ready=True)))

    def test_each_surface_needs_its_own_interaction_checks(self):
        item = self.data['supplemental_items'][-2]
        report = self.report_for([item])
        report['checks'] = [c for c in report['checks'] if c['surface'] != 'web' or c['case'] == 'normal']
        report['summary']['passed'] = len(report['checks'])
        self.use_report([item], report)
        self.assertTrue(any('case/surface pairs' in e for e in self.errors()))

    def test_unrelated_reviewer_does_not_complete_the_same_record(self):
        item = next(i for i in self.data['items'] if i['id'] == 'E2E-01')
        report = self.report_for([item])
        for check in report['checks']:
            check['actor'] = 'buyer'
        report['checks'].append({**report['checks'][0], 'record_id': 'unrelated-order', 'actor': 'reviewer'})
        report['summary']['passed'] = len(report['checks'])
        self.use_report([item], report)
        self.assertTrue(any('same business record' in e for e in self.errors()))

    def test_provisional_rules_cannot_disappear(self):
        for item in self.data['items'] + self.data['supplemental_items']:
            item['rule_refs'] = []
        self.assertTrue(any('all 23 provisional' in e for e in self.errors()))

    def test_self_consistent_old_rule_and_contract_versions_still_fail(self):
        self.data['release'].update(rules_version='TEST-OLD', contract_version='0.1.0')
        self.complete_fixture()
        errors = self.errors(ready=True)
        self.assertTrue(any('differs from current rules' in e for e in errors))
        self.assertTrue(any('differs from OpenAPI' in e for e in errors))

    def test_executable_docs_are_still_part_of_the_frozen_source(self):
        self.assertTrue(blocks_source_freeze('docs/testing/plaza-dense-20261026/api/browser-check.mjs'))
        self.assertTrue(blocks_source_freeze('docs/baselines/v5-d1/tools/check.py'))
        self.assertFalse(blocks_source_freeze('docs/testing/evidence/report.json'))
        self.assertFalse(blocks_source_freeze('AGENTS.md'))

    def test_board_ready_flag_requires_the_same_candidate_validation(self):
        self.complete_fixture()
        self.board['client_complete_20261028']['client_test_version_ready'] = True
        self.assertTrue(any('explicitly supplied' in e for e in self.errors()))


if __name__ == '__main__':
    unittest.main()
