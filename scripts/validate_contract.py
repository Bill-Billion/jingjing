"""Validate the R0.6 OpenAPI candidate and protocol payloads, with no network/DB.

Install contracts/requirements.txt into an isolated development venv first.
"""
import argparse
from copy import deepcopy
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform
import sys
from unittest.mock import patch

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import OpenAPIV31SpecValidator

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts/openapi.yaml'


class UniqueKeyLoader(yaml.SafeLoader):
    """Reject silent shadowing of a duplicated route/schema/response key."""


def mapping(loader, node, deep=False):
    loader.flatten_mapping(node)
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise ValueError(f'Duplicate YAML key {key!r} at line {key_node.start_mark.line + 1}')
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)


def refs(node):
    if isinstance(node, dict):
        if '$ref' in node:
            yield node['$ref']
        for value in node.values():
            yield from refs(value)
    elif isinstance(node, list):
        for value in node:
            yield from refs(value)


def resolve(spec, pointer):
    if not pointer.startswith('#/'):
        raise ValueError('Only bundled local references allowed: ' + pointer)
    result = spec
    for key in pointer[2:].split('/'):
        result = result[key.replace('~1', '/').replace('~0', '~')]
    return result


def validate(runtime_fixtures=None):
    spec = yaml.load(CONTRACT.read_text(encoding='utf-8'), Loader=UniqueKeyLoader)
    for pointer in refs(spec):
        resolve(spec, pointer)
    OpenAPIV31SpecValidator(spec).validate()
    schemas = spec['components']['schemas']
    fixtures = json.loads((ROOT/'contracts/examples/platform.json').read_text(encoding='utf-8'))
    negatives = json.loads((ROOT/'contracts/tests/schema_cases.json').read_text(encoding='utf-8'))['cases']
    failures, checks = [], []
    runtime_cases = []
    if runtime_fixtures:
        runtime_data=json.loads(runtime_fixtures.read_text(encoding='utf-8'))
        if runtime_data.get('synthetic_only') is not True or not runtime_data.get('cases'):
            raise ValueError('Runtime fixtures must contain explicitly synthetic cases')
        runtime_cases=runtime_data['cases']

    def check(condition, name):
        checks.append(name)
        if not condition:
            failures.append(name)

    def valid(schema, value):
        root = {'$schema':'https://json-schema.org/draft/2020-12/schema',
                '$ref':'#/components/schemas/'+schema,'components':spec['components']}
        return Draft202012Validator(root, format_checker=FormatChecker()).is_valid(value)

    check(fixtures['synthetic_only'] is True, 'Examples explicitly synthetic')
    fixture_map = {x['schema']:x for x in fixtures['cases']}
    for x in fixtures['cases']:
        check(valid(x['schema'], x['value']), 'Valid example: '+x['name'])
    for x in negatives:
        if 'fixture' in x:
            fixture = fixture_map[x['fixture']]
            schema, value = fixture['schema'], deepcopy(fixture['value'])
            path = x.get('mutate_path', x.get('remove_path'))
            target = value
            for key in path[:-1]:
                target = target[key]
            if 'remove_path' in x:
                del target[path[-1]]
            else:
                target[path[-1]] = x['replace_with']
        else:
            schema, value = x['schema'], x['value']
        check(not valid(schema, value), 'Rejected example: '+x['name'])

    for x in runtime_cases:
        check(valid(x['schema'],x['value']), 'Actual HTTP response: '+x['schema'])

    # Candidate protocol invariants. These are not server behavioral tests.
    implemented_ids=set(json.loads((ROOT/'contracts/implementation.json').read_text(encoding='utf-8'))['isolated_tested_operations'])
    operations = []
    public_ids = {'createSmsChallenge','createSession','getLiveness','getReadiness'}
    for path, item in spec['paths'].items():
        for method, op in item.items():
            if method not in {'get','post','patch','put','delete'}:
                continue
            operations.append(op['operationId'])
            security = op.get('security', spec.get('security'))
            check((security == []) == (op['operationId'] in public_ids), 'Security: '+op['operationId'])
            params = [resolve(spec, p['$ref']) if '$ref' in p else p for p in op.get('parameters',[])]
            headers = {p['name']:p for p in params if p['in']=='header'}
            if method in {'post','patch','put','delete'}:
                check(headers.get('Idempotency-Key',{}).get('required') is True, 'Mutation idempotency: '+path)
                check('409' in op['responses'], 'Mutation replay conflict: '+path)
            if method == 'patch':
                check(headers.get('If-Match',{}).get('required') is True, 'Mutation version: '+path)
                check({'412','428'} <= set(op['responses']), 'Version error statuses: '+path)
            if path.startswith('/api/v1/') and path not in {
                    '/api/v1/auth/sms-challenges','/api/v1/auth/sessions','/api/v1/me',
                    '/api/v1/me/parties','/api/v1/identity-verifications/current',
                    '/api/v1/auth/sessions/current','/api/v1/organizations','/api/v1/me/invitations'}:
                check(headers.get('X-Acting-Party',{}).get('required') is True, 'Acting party: '+path)
            check(op['x-implementation-status'] in {'NOT_IMPLEMENTED','IMPLEMENTED_ISOLATED_TESTS'}, 'Implementation status declared: '+op['operationId'])
            if op['x-implementation-status']=='IMPLEMENTED_ISOLATED_TESTS':
                check(op['operationId'] in implemented_ids, 'Runtime evidence declared: '+op['operationId'])
            else:
                check(op['operationId'] not in implemented_ids, 'Unimplemented boundary: '+op['operationId'])
            for code, response in op['responses'].items():
                response = resolve(spec,response['$ref']) if '$ref' in response else response
                check('X-Request-Id' in response.get('headers',{}), f'Request correlation: {path} {code}')
                schema_ref = response['content']['application/json']['schema']['$ref']
                check(schema_ref.split('/')[-1] in fixture_map, f'Response fixture: {path} {code}')
                if int(code)>=400 and path!='/ready':
                    check(schema_ref.endswith('/ErrorResponse'), f'Consistent error body: {path} {code}')
    check(len(operations)==len(set(operations)), 'Unique operation IDs')
    check(all(s['url'].startswith('http://127.0.0.1:') for s in spec['servers']), 'Local server only')
    check(set(spec['paths']['/api/v1/contract-snapshots/{snapshot_id}'])=={'get'}, 'Snapshot is read-only')
    # Positive boundary cases prevent rejection tests from passing on an always-invalid schema.
    check(valid('Money',{'amount_minor':0,'currency':'CNY'}), 'Zero minor amount valid')
    check(valid('Money',{'amount_minor':9007199254740991,'currency':'JPY'}), 'Maximum safe integer and non-CNY valid')
    check(valid('IdentityVerification',{'current_status':'VERIFIED','verification_id':'verification_test',
              'verified_at':'2026-09-21T00:00:00Z','allowed_actions':[]}), 'Verified with evidence structurally valid')
    production = deepcopy(fixture_map['ProviderReadinessPageResponse']['value']['data']['items'][0])
    production['current_status']='PRODUCTION_VERIFIED'
    production['verification_history'].append({'verified_state':'PRODUCTION_VERIFIED','environment':'PRODUCTION',
        'verified_at':'2026-09-21T00:00:00Z','evidence_ref':'production_synthetic'})
    check(valid('ProviderReadiness',production), 'Production with matching evidence structurally valid')
    report = {'result':'FAIL' if failures else 'PASS','contract_version':spec['info']['version'],
              'contract_sha256':hashlib.sha256(CONTRACT.read_bytes()).hexdigest(),
              'openapi_version':spec['openapi'],'operations':len(operations),'schemas':len(schemas),
              'runtime_response_cases':len(runtime_cases),'valid_fixtures':len(fixtures['cases']),'negative_cases':len(negatives),
              'checks':len(checks),'failures':failures,'python':platform.python_version(),
              'tools':{p:version(p) for p in ['openapi-spec-validator','jsonschema','PyYAML']},
              'network_during_validation':'DISABLED','runtime_tests':'NOT_RUN',
              'limits':'Schema and declared protocol only. Runtime permissions, SMS/payment, DB transactions, idempotency races and client SDK generation remain unverified.'}
    return report


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report',type=Path,help='Optional JSON result file')
    parser.add_argument('--runtime-fixtures',type=Path,help='Synthetic responses captured by real loopback HTTP tests')
    args=parser.parse_args()
    try:
        with patch('socket.socket.connect',side_effect=RuntimeError('Network forbidden during contract validation')):
            report=validate(args.runtime_fixtures)
    except Exception as exc:
        report={'result':'FAIL','error':str(exc),'runtime_tests':'NOT_RUN'}
    output=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    print(output,end='')
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(output,encoding='utf-8',newline='\n')
    sys.exit(0 if report['result']=='PASS' else 1)
