"""Batch equivalence and failure-closed checks; synthetic files, no services."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import validate_contract as single
import validate_contract_batch as batch


class BatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.root=Path(cls.temp.name)
        fixtures=json.loads((single.ROOT/'contracts/examples/platform.json').read_text(encoding='utf-8'))['cases']
        example=deepcopy(next(x for x in fixtures if 'path' in x and 'method' in x and x['schema']!='ErrorResponse'))
        bad=deepcopy(example);bad['path']='/api/v1/route-that-does-not-exist'
        invalid=deepcopy(example);invalid['value']={}
        cls.paths=[]
        for name,case in [('good',example),('bad-route',bad),('bad-value',invalid)]:
            p=cls.root/('.local/'+name+'.json');p.parent.mkdir(parents=True,exist_ok=True)
            p.write_text(json.dumps({'synthetic_only':True,'cases':[case]}),encoding='utf-8');cls.paths.append(p)
        cls.manifest=cls.root/'manifest.json'
        cls.entries=[{'fixtures':'.local/'+p.name,'report':'.local/ci-evidence/'+p.name} for p in cls.paths]
        cls.manifest.write_text(json.dumps({'version':1,'entries':cls.entries}),encoding='utf-8')
        with patch('socket.socket.connect',side_effect=RuntimeError('No network')):
            cls.single_good=single.validate(cls.paths[0])
            cls.result=batch.run(cls.manifest,cls.root)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_same_pass_counts_and_contract_for_good_file(self):
        got=json.loads((self.root/self.entries[0]['report']).read_text())
        for key in ['result','checks','runtime_response_cases','contract_sha256','contract_version','operations','schemas','valid_fixtures','negative_cases','failures']:
            self.assertEqual(got[key],self.single_good[key],key)
        self.assertEqual(got['result'],'PASS')

    def test_bad_route_and_bad_payload_each_fail_without_hiding_other_results(self):
        self.assertEqual(self.result['result'],'FAIL')
        self.assertEqual(self.result['runtime_file_count'],3)
        self.assertEqual(self.result['runtime_response_cases'],3)
        for entry in self.entries[1:]:
            self.assertEqual(json.loads((self.root/entry['report']).read_text())['result'],'FAIL')
        self.assertEqual(len(self.result['runtime_files']),3)

    def test_shared_contract_is_loaded_once(self):
        with patch.object(single.yaml,'load',wraps=single.yaml.load) as load:
            # Exercising malformed input still loads/checks the contract once before failing.
            with self.assertRaises(FileNotFoundError):
                single.validate([self.root/'.local/missing.json',self.paths[0]])
            self.assertEqual(load.call_count,1)

    def test_missing_file_replaces_stale_pass_in_every_report(self):
        manifest=self.root/'missing-manifest.json'
        entries=[{'fixtures':'.local/missing.json','report':'.local/ci-evidence/missing.json'}]
        output=self.root/entries[0]['report'];batch.write_report(output,{'result':'PASS'})
        manifest.write_text(json.dumps({'version':1,'entries':entries}),encoding='utf-8')
        with patch.object(batch,'validate',side_effect=FileNotFoundError('Synthetic missing input')):
            result=batch.run(manifest,self.root)
        self.assertEqual(result['result'],'FAIL')
        self.assertEqual(json.loads(output.read_text())['result'],'FAIL')

    def test_common_failure_is_in_every_individual_report(self):
        combined=deepcopy(self.result);combined['common_failures']=['Synthetic protocol invariant failed'];combined['result']='FAIL'
        for group,p in zip(combined['runtime_files'],self.paths):group['fixtures']=str(p)
        with patch.object(batch,'validate',return_value=combined):
            batch.run(self.manifest,self.root)
        try:
            for entry in self.entries:
                report=json.loads((self.root/entry['report']).read_text())
                self.assertIn('Synthetic protocol invariant failed',report['failures']);self.assertEqual(report['result'],'FAIL')
        finally:
            # Restore original test artifacts for the independent equivalence assertion.
            good={**self.single_good,'runtime_fixture_sha256':self.result['runtime_files'][0]['sha256']}
            batch.write_report(self.root/self.entries[0]['report'],good)

    def test_empty_duplicate_and_escaping_manifests_are_rejected(self):
        for entries in [[],[self.entries[0],self.entries[0]],[{**self.entries[0],'report':'.local/../bad.json'}],[{**self.entries[0],'report':'.local/good.json'}]]:
            with self.subTest(entries=entries):
                manifest=self.root/'invalid-manifest.json';manifest.write_text(json.dumps({'version':1,'entries':entries}),encoding='utf-8')
                with self.assertRaises(ValueError):batch.load_manifest(manifest,self.root)

    def test_workflow_uses_all_manifest_inputs_without_redundant_single_runs(self):
        manifest=single.ROOT/'scripts/runtime-contract-manifest.json'
        entries=batch.load_manifest(manifest)
        previous=json.loads((single.ROOT/'docs/reviews/contract-batch-20261109/previous-inputs.json').read_text(encoding='utf-8'))
        current=json.loads(manifest.read_text(encoding='utf-8'))
        # New cases may be added later; none of the original 66 may disappear.
        self.assertTrue(all(e in current['entries'] for e in previous['entries']))
        self.assertEqual(len(entries),len(current['entries']))
        workflow=(single.ROOT/'.github/workflows/backend-checks.yml').read_text(encoding='utf-8')
        self.assertIn('scripts/validate_contract_batch.py --manifest scripts/runtime-contract-manifest.json',workflow)
        self.assertNotIn('scripts/validate_contract.py --runtime-fixtures',workflow)


if __name__=='__main__':
    unittest.main(verbosity=2)
