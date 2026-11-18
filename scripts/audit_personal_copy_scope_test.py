import copy
import unittest
from audit_personal_copy_scope import validate, section_values


class CatalogueAuditTest(unittest.TestCase):
    def test_referenced_common_parameters_and_section_are_resolved(self):
        contract = {'components': {'parameters': {
            'request': {'name': 'request_id', 'schema': {'type': 'string'}},
            'section': {'name': 'section', 'schema': {'enum': ['A', 'B']}}}}}
        values = section_values([{'$ref': '#/components/parameters/request'},
                                 {'$ref': '#/components/parameters/section'}], contract)
        self.assertEqual(values, ['A', 'B'])
        with self.assertRaises(ValueError):
            section_values([{'$ref': '#/components/parameters/request'}], contract)

    def setUp(self):
        self.runtime = {'A': 'PROFILE', 'B': 'TRANSACTIONS'}
        self.catalog = {'complete_personal_data_delivery': False, 'groups': [dict(
            name='example', source='source.js', personal_permission='own account', delivery='redacted records',
            retention='pending approval', remaining='originals reviewed individually', sections=dict(self.runtime))]}
        self.enums = {'applicant': ['A', 'B'], 'operator': ['A', 'B']}

    def test_matching_registration_does_not_require_delivery_complete(self):
        self.assertEqual(validate(self.catalog, self.runtime, self.enums), [])

    def test_omitted_section_and_wrong_scope_are_rejected(self):
        for sections in [{'A': 'PROFILE'}, {'A': 'TRANSACTIONS', 'B': 'TRANSACTIONS'}]:
            candidate = copy.deepcopy(self.catalog)
            candidate['groups'][0]['sections'] = sections
            self.assertTrue(validate(candidate, self.runtime, self.enums))

    def test_duplicate_and_overclaim_are_rejected(self):
        candidate = copy.deepcopy(self.catalog)
        candidate['groups'].append(copy.deepcopy(candidate['groups'][0]))
        self.assertTrue(validate(candidate, self.runtime, self.enums))
        self.catalog['complete_personal_data_delivery'] = True
        self.assertTrue(validate(self.catalog, self.runtime, self.enums))

    def test_operator_contract_drift_and_missing_limitations_are_rejected(self):
        self.enums['operator'] = ['A']
        self.assertTrue(validate(self.catalog, self.runtime, self.enums))
        self.enums['operator'] = ['A', 'B']
        self.catalog['groups'][0]['remaining'] = ''
        self.assertTrue(validate(self.catalog, self.runtime, self.enums))


if __name__ == '__main__':
    unittest.main()
