"""Reject incomplete evidence and mixed final batches; preserve explicit historical branches."""
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

    def test_t1_can_exit_before_final_regression_or_manual_signoff(self):
        rows = [{'key': self.key, 'discovery': {'decision': 'HISTORICAL_COVERED'},
                 'final_regression': {'outcome': 'NOT_RUN'}}]
        result = c.t1_gate(rows, [])
        self.assertEqual(result['status'], 'READY_FOR_T1_EXIT_REVIEW')
        self.assertFalse(result['formal_acceptance_granted'])
        self.assertFalse(result['final_regression_required_for_T1_exit'])

    def test_t1_pending_evidence_and_partial_scenarios_block_exit(self):
        for decision in ['PARTIAL', 'NEEDS_EVIDENCE_REVIEW']:
            result = c.t1_gate([{'key': self.key, 'discovery': {'decision': decision}}], [])
            self.assertEqual(result['status'], 'NOT_READY')
            self.assertEqual(result['unresolved_slots'], [self.key])

    def test_review_label_alone_is_not_an_external_exception(self):
        d = {'decision': 'EXTERNAL', 'required_owner': 'maintainer'}
        self.assertEqual(c.t1_gate([{'key': self.key, 'discovery': d}], [])['status'], 'NOT_READY')
        d.update(objective_condition='physical device not supplied', machine_remainder_complete=True,
                 condition_evidence=self.proof)
        self.assertEqual(c.t1_gate([{'key': self.key, 'discovery': d}], [])['status'], 'READY_FOR_T1_EXIT_REVIEW')

    def test_t1_unhandled_failure_still_blocks_after_all_slots_reviewed(self):
        result = c.t1_gate([], [{'bug_id': 'ENV-X', 'status': 'RECHECK_PASS_ROOT_CAUSE_OPEN'}])
        self.assertEqual(result['unresolved_defects'], ['ENV-X'])
        self.assertEqual(result['status'], 'NOT_READY')

    def test_archived_review_validates_original_scope_and_observation(self):
        key = 'TASK-14|api|normal'
        review = {'kind': 'T1_ARCHIVED_EVIDENCE_REVIEW', 'new_business_execution': False,
                  'slots': [{'key': key, 'scope': 'COMPLETE_ORIGINAL_SLOT', 'expected': 'original',
                             'clause_assertions': ['original clause'], 'execution_ids': ['historic']}],
                  'executions': {'historic': {'environment': 'isolated-original', 'business_ids': ['original-order'],
                                             'command': 'original-command', 'versions': {'backend': '1'*40},
                                             'limitations': ['synthetic only'], 'summary': self.proof,
                                             'raw_logs': [self.proof], 'observations': [
                                                 {'artifact': self.proof, 'json_path': ['synthetic_test_fixture'], 'equals': True}]}}}
        path = self.root / 'review.json'
        def update():
            path.write_bytes(c.canonical(review))
            return {'path': 'review.json', 'sha256': c.sha(path.read_bytes())}
        c.reviewed_history(update(), key, 'original', self.root)
        with self.assertRaisesRegex(ValueError, 'changed original expectation'):
            c.reviewed_history(update(), key, 'changed requirement', self.root)
        review['slots'][0]['scope'] = 'PARTIAL_ORIGINAL_SLOT'
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            c.reviewed_history(update(), key, 'original', self.root)
        review['slots'][0]['scope'] = 'COMPLETE_ORIGINAL_SLOT'
        review['executions']['historic']['observations'][0]['equals'] = False
        with self.assertRaisesRegex(ValueError, 'not present in original evidence'):
            c.reviewed_history(update(), key, 'original', self.root)

    def branch_review(self):
        expected = ('从合格消费、售后结束发分开始，兑换、锁定、失败释放及重付闭环；'
                    '现金制作金首笔付款确认后核销，全额服务权益另走0现金/开工核销/开工前取消释放；'
                    '退款不足晶钻记待冲回且不重复扣。')
        original = self.root / c.registry.REG
        original.parent.mkdir(parents=True, exist_ok=True)
        original.write_bytes(c.canonical({'items': [], 'supplemental_items': [
            {'id': 'E2E-06', 'effective_expected': expected}]}))
        basis = {'path': c.registry.REG.as_posix(), 'sha256': c.sha(original.read_bytes())}
        executions = {}
        branches = []
        clauses = {'cash_credit': [expected.split('；')[0], '现金制作金首笔付款确认后核销',
                                   '退款不足晶钻记待冲回且不重复扣'],
                   'full_service': ['全额服务权益另走0现金/开工核销/开工前取消释放']}
        for i, branch in enumerate(clauses):
            business = f'00000000-0000-0000-0000-{i:012d}'
            environment = 'original-' + branch
            chain = {'environment': environment, 'business_id': business}
            executions[branch] = {'environment': {'database': environment}, 'business_ids': [business],
                                  'chain': chain, 'command': 'synthetic-validator-test',
                                  'versions': {'backend': str(i+1)*40}, 'limitations': ['Historical branch only'],
                                  'summary': self.proof, 'raw_logs': [self.proof], 'observations': [
                                      {'artifact': self.proof, 'json_path': ['synthetic_test_fixture'], 'equals': True}]}
            branches.append({'id': branch, 'execution_ids': [branch], 'scope': 'COMPLETE_ORIGINAL_BRANCH',
                             'source_clauses': clauses[branch], 'chain': chain,
                             'clause_assertions': ['Actual branch facts reviewed']})
        key = 'E2E-06|api|normal'
        slot = {'key': key, 'scope': 'COMPLETE_ORIGINAL_SLOT', 'expected': expected,
                'clause_assertions': ['Both original branches, separately archived'],
                'execution_ids': list(executions), 'original_branches': branches,
                'branch_basis': basis, 'not_one_environment_or_final_batch': True}
        review = {'kind': 'T1_ARCHIVED_EVIDENCE_REVIEW', 'new_business_execution': False,
                  'slots': [slot], 'executions': executions}
        def run():
            p = self.root / 'branch-review.json'; p.write_bytes(c.canonical(review))
            return c.reviewed_history({'path': p.name, 'sha256': c.sha(p.read_bytes())}, key, expected, self.root)
        return review, slot, run

    def test_original_cash_and_full_service_alternatives_keep_separate_history(self):
        review, slot, run = self.branch_review()
        run()
        # History still has no route into the final batch.
        self.assertEqual(c.final_results(None, {slot['key']})[slot['key']]['outcome'], 'NOT_RUN')

    def test_missing_original_branch_cannot_close_whole_slot(self):
        review, slot, run = self.branch_review()
        slot['original_branches'].pop()
        with self.assertRaises(ValueError): run()

    def test_partial_branch_cannot_close_whole_slot(self):
        review, slot, run = self.branch_review()
        slot['original_branches'][1]['scope'] = 'PARTIAL'
        with self.assertRaises(ValueError): run()

    def test_extra_unmapped_branch_execution_is_rejected(self):
        review, slot, run = self.branch_review()
        review['executions']['extra'] = copy.deepcopy(review['executions']['cash_credit'])
        slot['execution_ids'].append('extra')
        with self.assertRaises(ValueError): run()

    def test_branch_cannot_borrow_another_environment_or_business(self):
        review, slot, run = self.branch_review()
        for field in ['environment', 'business_id']:
            original = review['executions']['cash_credit']['chain'][field]
            review['executions']['cash_credit']['chain'][field] = 'different'
            with self.assertRaises(ValueError): run()
            review['executions']['cash_credit']['chain'][field] = original

    def test_branch_source_must_be_unchanged_formal_requirement(self):
        review, slot, run = self.branch_review()
        (self.root / c.registry.REG).write_bytes(b'{}')
        with self.assertRaisesRegex(ValueError, 'Evidence changed'): run()

    def test_branch_source_clause_cannot_be_dropped(self):
        review, slot, run = self.branch_review()
        slot['original_branches'][0]['source_clauses'].pop()
        with self.assertRaises(ValueError): run()

    def test_branches_cannot_hide_a_final_batch_claim(self):
        review, slot, run = self.branch_review()
        slot['not_one_environment_or_final_batch'] = False
        with self.assertRaises(ValueError): run()


if __name__ == '__main__':
    unittest.main()
