"""Check the declared account-copy catalogue against runtime dispatch and both API enums.

This is registration coverage only, never proof of complete personal-data delivery.
"""
import argparse
import json
from pathlib import Path
import subprocess
import yaml

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'docs/requirements/PERSONAL_COPY_CATALOG_20261114.json'
BACKEND = ROOT / '晶晶日上工程交接包/01_源码/backend_server'


def section_values(parameters, contract):
    found = []
    for parameter in parameters:
        if '$ref' in parameter:
            ref = parameter['$ref']
            prefix = '#/components/parameters/'
            if not ref.startswith(prefix):
                raise ValueError('Unsupported parameter reference: ' + ref)
            parameter = contract['components']['parameters'][ref[len(prefix):]]
        if parameter.get('name') == 'section':
            found.append(parameter['schema']['enum'])
    if len(found) != 1:
        raise ValueError('Exactly one section enum is required')
    return found[0]


def validate(catalog, runtime, contract_enums):
    failures = []
    mapped = {}
    if catalog.get('complete_personal_data_delivery') is not False:
        failures.append('Catalogue must not assert complete personal-data delivery')
    for group in catalog['groups']:
        for field in ['name', 'source', 'personal_permission', 'delivery', 'retention', 'remaining']:
            if not isinstance(group.get(field), str) or not group[field].strip():
                failures.append(f"Missing {field}: {group.get('name')}")
        for section, scope in group['sections'].items():
            if section in mapped:
                failures.append(f'Duplicate section: {section}')
            mapped[section] = scope
    if mapped != runtime:
        failures.append('Catalogue section/scope mapping differs from runtime')
    for path, values in contract_enums.items():
        if len(values) != len(set(values)) or set(values) != set(runtime):
            failures.append(f'Contract section enum differs from runtime: {path}')
    if len(contract_enums) != 2:
        failures.append('Both applicant and operator account-data endpoints are required')
    return failures


def run(catalog_path=CATALOG):
    catalog = json.loads(Path(catalog_path).read_text(encoding='utf8'))
    runtime = json.loads(subprocess.check_output(
        ['node', '-e', "console.log(JSON.stringify(require('./src/modules/privacy/account-copy').sections))"],
        cwd=BACKEND, encoding='utf8'))
    contract = yaml.safe_load((ROOT / 'contracts/openapi.yaml').read_text(encoding='utf8'))
    enums = {}
    for path, operations in contract['paths'].items():
        if path.endswith('/requests/{request_id}/account-data'):
            enums[path] = section_values(operations['get']['parameters'], contract)
    failures = validate(catalog, runtime, enums)
    for group in catalog['groups']:
        if not (ROOT / group['source']).is_file():
            failures.append(f"Source missing: {group['source']}")
    return {'result': 'FAIL' if failures else 'PASS', 'catalog': str(Path(catalog_path).relative_to(ROOT)),
            'groups': len(catalog['groups']), 'account_sections': len(runtime), 'contract_endpoints': len(enums),
            'failures': failures, 'complete_personal_data_delivery': False, 'business_tests_run': False,
            'meaning': 'Declared account-copy section/scope coverage only. Does not prove all retained data, original files, manual redaction, UI, retention approval or real providers.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = run()
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text, encoding='utf8')
    print(text, end='')
    raise SystemExit(bool(result['failures']))
