"""Validate test registration; --require-ready additionally checks a frozen candidate.

Standard library only. Does not run product tests, approve a PR, or deploy anything.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
REGISTER = 'docs/testing/FULL_BUSINESS_ACCEPTANCE_20261028.json'
SOURCE = 'docs/baselines/v5-d1/data/acceptance.json'
PAIR_IDS = {f'{side}-CLIENT-COMPLETE-{i:02}' for side in ('CORE', 'UX') for i in range(1, 19)}
E2E_CASES = {'normal', 'reverse', 'unauthorized', 'duplicate', 'state_change', 'recovery'}
DELIVERY_CASES = {'candidate_ci', 'build_freeze', 'backup_restore', 'rollback_preserves_orders_and_feedback', 'access_expiry', 'client_smoke'}
UX_CASES = {'normal', 'reverse', 'login_return', 'dirty_form', 'field_error', 'pagination', 'pending_recovery'}
SHA = re.compile(r'^[0-9a-f]{40}$')
HASH = re.compile(r'^[0-9a-f]{64}$')
CODE_SUFFIXES = {'.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.dart', '.sh', '.bash', '.sql'}


def blocks_source_freeze(path):
    return path != 'AGENTS.md' and (not path.startswith('docs/') or Path(path).suffix.lower() in CODE_SUFFIXES)


def read(root, path):
    return json.loads((root / path).read_text(encoding='utf-8'))


def validate(root, data, board, source, require_ready=False, candidate=None):
    errors = []
    def check(ok, message):
        if not ok:
            errors.append(message)

    def local_file(ref, label):
        if not isinstance(ref, str) or not ref or Path(ref).is_absolute():
            check(False, label + ': relative file required')
            return None
        path = (root / ref.split('#', 1)[0]).resolve()
        if not path.is_relative_to(root.resolve()) or not path.is_file():
            check(False, label + ': missing/outside repository file')
            return None
        return path

    def artifact(ref, label):
        if not isinstance(ref, dict):
            check(False, label + ': artifact reference required')
            return None
        path = local_file(ref.get('path'), label)
        digest = ref.get('sha256', '')
        check(bool(HASH.fullmatch(digest)), label + ': SHA256 required')
        if path:
            check(hashlib.sha256(path.read_bytes()).hexdigest() == digest, label + ': artifact changed')
        return path

    def review(value, label):
        if not isinstance(value, dict):
            check(False, label + ': actual independent review required')
            return
        check(bool(value.get('reviewer')) and value.get('reviewer') != value.get('author'), label + ': independent reviewer required')
        check(bool(value.get('author')) and bool(value.get('reason')), label + ': author/reason required')
        local_file(value.get('decision'), label)

    source_by_id = {item['id']: item for item in source}
    items = data.get('items', [])
    extras = data.get('supplemental_items', [])
    check(data.get('source_count') == len(source) == 133, 'source count must remain 133')
    check(len(items) == len(source) and {i.get('id') for i in items} == set(source_by_id), 'source IDs missing, duplicated or invented')
    check(len(extras) == 18 and {i.get('id') for i in extras} == {f'TASK-{i:02}' for i in range(1, 19)}, '18 task-specific acceptance cases required separately from the 133 sources')
    check({r for item in extras for r in item.get('rule_refs', [])} == {f'P{i:02}' for i in range(1, 24)}, 'all 23 provisional rules need task-specific acceptance')
    tasks = {task['id']: task for task in board['tasks']}
    check(PAIR_IDS <= set(tasks), '18 Core/UX task pairs required')
    for tid in PAIR_IDS:
        expected_ids = {i.get('id') for i in items + extras if tid in i.get('task_refs', [])}
        check(set(tasks.get(tid, {}).get('acceptance_ids', [])) == expected_ids, tid + ': task/acceptance mapping differs')
    implementation_ids = {tid for tid in PAIR_IDS if int(tid[-2:]) <= 16}
    for side in ('CORE', 'UX'):
        task = tasks.get(f'{side}-CLIENT-COMPLETE-17', {})
        check(implementation_ids <= set(task.get('dependencies', [])), side + ' final acceptance must depend on all 16 implementation pairs')
        if task.get('test_status') == 'PASS' or task.get('implementation') == 'COMPLETE':
            check(all(tasks.get(tid, {}).get('implementation') == 'COMPLETE' and tasks.get(tid, {}).get('test_status') == 'PASS' for tid in implementation_ids), side + ' cannot finish full acceptance before implementation pairs')

    release = data.get('release', {})
    rules_file = root / 'docs/collaboration/client-complete-20261028/PROVISIONAL_RULES.md'
    contract_file = root / 'contracts/openapi.yaml'
    check('版本：' + str(release.get('rules_version')) in rules_file.read_text(encoding='utf-8'), 'release rule version differs from current rules')
    contract_version = re.search(r'^  version:\s*(\S+)\s*$', contract_file.read_text(encoding='utf-8'), re.M)
    check(contract_version is not None and release.get('contract_version') == contract_version.group(1), 'release contract version differs from OpenAPI')
    ready = require_ready or board.get('client_complete_20261028', {}).get('client_test_version_ready') is True
    if ready:
        commit = release.get('code_sha', '')
        check(bool(SHA.fullmatch(commit or '')), 'freeze requires full candidate code SHA')
        check(candidate is not None and commit == candidate, 'freeze candidate must be explicitly supplied and match the release record')
        for key in ('dataset_id', 'contract_version', 'rules_version'):
            check(bool(release.get(key)), 'freeze missing ' + key)
        check(set(release.get('builds', {})) == {'app', 'web'}, 'freeze needs both actual App and Web build files')
        for kind, ref in release.get('builds', {}).items():
            artifact(ref, 'build ' + kind)
        review(release.get('review'), 'release review')
        for tid in sorted(PAIR_IDS):
            task = tasks.get(tid, {})
            check(task.get('implementation') == 'COMPLETE' and task.get('test_status') == 'PASS', tid + ': implementation/testing incomplete')
            check(task.get('status') in ('IN_REVIEW', 'DONE'), tid + ': not delivered for review')
            if task.get('shared_boundaries'):
                check(task.get('review_status') == 'APPROVED', tid + ': shared boundary not reviewed')
                review(task.get('review_evidence'), tid + ' review')

    reports = {}
    for item in items + extras:
        label = item.get('id', '<missing id>')
        if label in source_by_id:
            check(item.get('source') == SOURCE and item.get('source_expected') == source_by_id[label]['expected'], label + ': original requirement changed')
        refs = item.get('task_refs', [])
        check(bool(refs) and len(refs) == len(set(refs)) and set(refs) <= set(tasks), label + ': valid task mapping required')
        if label.startswith('TASK-'):
            expected_tasks = {f'{side}-CLIENT-COMPLETE-{label[-2:]}' for side in ('CORE', 'UX')}
            check(expected_tasks <= set(refs), label + ': both task owners must be mapped')
            check(set(item.get('source_acceptance_ids', [])) <= set(source_by_id), label + ': unknown original acceptance ID')
            expected_rules = {r for tid in expected_tasks for r in tasks.get(tid, {}).get('provisional_rule_refs', [])}
            check(set(item.get('rule_refs', [])) == expected_rules, label + ': rules must match the paired task scope')
        check(set(item.get('rule_refs', [])) <= {f'P{i:02}' for i in range(1, 24)}, label + ': unknown provisional rule')
        if item.get('effective_expected'):
            check(bool(item.get('decision_refs')), label + ': changed expectation needs decision references')
        for ref in item.get('decision_refs', []):
            local_file(ref, label + ' decision')
        status = item.get('status')
        check(status in ('NOT_RUN', 'BLOCKED', 'PASS', 'NOT_APPLICABLE'), label + ': unknown acceptance status')
        # The old boolean was not consumed anywhere and must not reintroduce a second truth.
        check('full_flow_pass' not in item, label + ': use status, not the old full_flow_pass flag')
        cases, surfaces = set(item.get('required_cases', [])), set(item.get('required_surfaces', []))
        check(bool(cases) and bool(surfaces), label + ': cases and surfaces required')
        if label == 'TASK-18':
            check(DELIVERY_CASES <= cases and 'operations' in surfaces, label + ': delivery checks cannot be reduced')
        elif label == 'TASK-17':
            check(UX_CASES <= cases and {'app', 'web'} <= surfaces, label + ': interaction checks cannot be reduced')
        elif label.startswith('TASK-'):
            check({'normal', 'reverse'} <= cases and {'api', 'app', 'web'} <= surfaces, label + ': paired feature checks cannot be reduced')
        if label.startswith('E2E-'):
            check(E2E_CASES <= cases and {'api', 'app', 'web'} <= surfaces, label + ': full-flow coverage cannot be reduced')
            check(status != 'NOT_APPLICABLE', label + ': complete business chain cannot be waived')
        if label.startswith('TASK-'):
            check(status != 'NOT_APPLICABLE', label + ': current agreed task scope cannot be waived')
        if ready:
            check(status in ('PASS', 'NOT_APPLICABLE'), label + ': acceptance still ' + str(status))
        if status == 'NOT_APPLICABLE':
            check(item.get('boundary', {}).get('kind') == 'SUPERSEDED', label + ': missing implementation/provider access is not an applicability waiver')
            review(item.get('boundary'), label + ' scope decision')
        if status != 'PASS':
            continue
        check(bool(item.get('evidence')), label + ': PASS needs actual run reports')
        covered_cases, covered_surfaces, covered_pairs = set(), set(), set()
        normal_records = {}
        run_contexts = set()
        for ref in item.get('evidence', []):
            path = artifact(ref, label)
            if not path:
                continue
            try:
                if path not in reports:
                    reports[path] = read(root, path)
                report = reports[path]
                checks = report.get('checks', [])
                check(report.get('result') == 'PASS' and bool(checks), label + ': empty/failed report')
                check(all(c.get('result') == 'PASS' for c in checks), label + ': report contains failed/skipped checks')
                check(report.get('summary') == {'passed': len(checks), 'failed': 0, 'skipped': 0}, label + ': counts must include zero failures and skips')
                check(bool(SHA.fullmatch(report.get('code_sha', ''))), label + ': full tested SHA required')
                check(report.get('environment') == 'isolated' and bool(report.get('dataset_id')), label + ': isolated dataset required')
                for key in ('contract_version', 'rules_version'):
                    check(bool(report.get(key)), label + ': report missing ' + key)
                check(bool(report.get('artifacts')), label + ': raw run artifacts required')
                for raw in report.get('artifacts', []):
                    artifact(raw, label + ' raw evidence')
                if ready:
                    for key in ('code_sha', 'dataset_id', 'contract_version', 'rules_version'):
                        check(report.get(key) == release.get(key), label + ': stale/mismatched ' + key)
                matching = [c for c in checks if c.get('acceptance_id') == label]
                check(bool(matching), label + ': report does not cover this acceptance ID')
                for c in matching:
                    covered_cases.add(c.get('case'))
                    covered_surfaces.add(c.get('surface'))
                    covered_pairs.add((c.get('case'), c.get('surface')))
                    if c.get('surface') in ('app', 'web'):
                        build_hash = report.get('build_hashes', {}).get(c['surface'], '')
                        check(bool(HASH.fullmatch(build_hash)), label + ': actual frontend build hash required')
                        if ready:
                            check(build_hash == release.get('builds', {}).get(c['surface'], {}).get('sha256'), label + ': frontend build differs')
                    if c.get('case') == 'normal':
                        if label.startswith('E2E-'):
                            check(bool(c.get('record_id')) and bool(c.get('actor')), label + ': same-record cross-client evidence required')
                            record = normal_records.setdefault(c.get('record_id'), {'surfaces': set(), 'actors': set()})
                            record['surfaces'].add(c.get('surface'))
                            record['actors'].add(c.get('actor'))
                run_contexts.add((report.get('code_sha'), report.get('dataset_id')))
            except (ValueError, TypeError, AttributeError, OSError):
                check(False, label + ': malformed run report')
        check(cases <= covered_cases, label + ': missing required cases ' + ','.join(sorted(cases - covered_cases)))
        check(surfaces <= covered_surfaces, label + ': missing required surfaces')
        check({(case, surface) for case in cases for surface in surfaces} <= covered_pairs, label + ': missing required case/surface pairs')
        if label.startswith('E2E-'):
            check(len(run_contexts) == 1, label + ': cannot splice different versions/datasets into one chain')
            check(any({'api', 'app', 'web'} <= record['surfaces'] and len(record['actors']) >= 2 for record in normal_records.values()), label + ': normal chain must use same business record across clients and roles')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-ready', action='store_true')
    parser.add_argument('--candidate', help='Full SHA of the frozen source commit; required for readiness')
    args = parser.parse_args()
    try:
        data, board, source = read(ROOT, REGISTER), read(ROOT, 'docs/tasks/board.json'), read(ROOT, SOURCE)
        ready = args.require_ready or board.get('client_complete_20261028', {}).get('client_test_version_ready') is True
        errors = validate(ROOT, data, board, source, ready, args.candidate)
        if ready and args.candidate and SHA.fullmatch(args.candidate):
            # Evidence/docs can be committed after the tested source; executable files cannot differ.
            command = ['git', 'diff', '--name-only', '-z', args.candidate, '--']
            diff = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
            if diff.returncode or any(blocks_source_freeze(p) for p in diff.stdout.split('\0') if p):
                errors.append('working source differs from candidate (or candidate is unavailable)')
            untracked = subprocess.check_output(['git', 'ls-files', '-z', '--others', '--exclude-standard'], cwd=ROOT, text=True).split('\0')
            if any(blocks_source_freeze(p) for p in untracked if p):
                errors.append('untracked executable inputs prevent freezing')
        statuses = [i['status'] for i in data['items'] + data['supplemental_items']]
        print(json.dumps({'registration': 'FAIL' if errors else 'PASS',
                          'readiness_checked': ready, 'client_test_version_ready': ready and not errors,
                          'source_items': len(data['items']), 'supplemental_items': len(data['supplemental_items']),
                          'acceptance_counts': {s: statuses.count(s) for s in sorted(set(statuses))},
                          'product_tests': 'NOT_RUN_BY_THIS_CHECK', 'errors': errors}, ensure_ascii=False, indent=2))
        return 1 if errors else 0
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(json.dumps({'registration': 'FAIL', 'error': type(error).__name__}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
