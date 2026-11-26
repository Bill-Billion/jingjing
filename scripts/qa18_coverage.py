#!/usr/bin/env python3
"""Derived, deduplicated PM04 coverage; never modifies formal acceptance or old runs."""
import argparse
import csv
import hashlib
import io
import json
import re
from collections import Counter
from pathlib import Path

import qa18_registry as registry

ROOT = Path(__file__).resolve().parents[1]
BASE = Path('docs/pm04/qa18')
LEDGER = BASE / 'COVERAGE_LEDGER.json'
SHA = re.compile(r'^[a-f0-9]{40}$')
HASH = re.compile(r'^[a-f0-9]{64}$')
UUID = re.compile(r'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
DECISIONS = {'HISTORICAL_COVERED', 'PARTIAL', 'NEEDS_EVIDENCE_REVIEW', 'BLOCKED', 'EXTERNAL'}
VERSION_KEYS = ('backend', 'app', 'vue', 'api', 'migrations', 'build_config', 'test_scripts')


def fail(message):
    raise ValueError(message)


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_sha(path):
    # Source JSON is ordinary text in old checkouts; evidence bytes are NEVER normalized.
    return sha(path.read_bytes().replace(b'\r\n', b'\n'))


def repo_file(name, root=ROOT):
    p = (root / name).resolve()
    if not p.is_relative_to(root.resolve()) or not p.is_file():
        fail('Missing/outside evidence: ' + name)
    return p


def proof(name, expected=None, root=ROOT):
    p = repo_file(name, root)
    actual = sha(p.read_bytes())
    return {'path': name, 'sha256': actual,
            'expected_sha256': expected,
            'integrity': 'MATCH' if not expected or expected == actual else 'MISMATCH'}


def require_proof(item, root=ROOT):
    if not HASH.fullmatch(item.get('sha256', '')):
        fail('Evidence must pin SHA256')
    checked = proof(item['path'], item['sha256'], root)
    if checked['integrity'] != 'MATCH':
        fail('Evidence changed: ' + item['path'])
    return checked


def metadata(value, prefix=''):
    """Index explicit public metadata with JSON pointers; no inference of tested scope."""
    result = {'versions': [], 'environments': [], 'business_ids': [], 'results': []}

    def walk(x, path):
        if isinstance(x, dict):
            for k, v in x.items():
                pointer = path + '/' + k.replace('~', '~0').replace('/', '~1')
                if isinstance(v, str):
                    pair = {'pointer': pointer, 'value': v}
                    if SHA.fullmatch(v):
                        result['versions'].append(pair)
                    if k in {'environment', 'database', 'environment_id'}:
                        result['environments'].append(pair)
                    if (k.endswith('_id') or k in {'order', 'project', 'request'}) and UUID.fullmatch(v):
                        result['business_ids'].append(pair)
                    if k in {'result', 'status', 'conclusion'}:
                        result['results'].append(pair)
                elif isinstance(v, (dict, list)):
                    walk(v, pointer)
        elif isinstance(x, list):
            for n, v in enumerate(x):
                walk(v, path + '/' + str(n))

    walk(value, prefix)
    return result


def import_events(paths, valid_keys, root=ROOT):
    events = {}
    runs = {}
    for name in paths:
        p = repo_file(name, root)
        conf = read(p.parent / 'config.json')
        run = conf['run_id']
        if run in runs and runs[run]['config'] != conf:
            fail('Conflicting historical run config: ' + run)
        runs.setdefault(run, {'config': conf, 'journals': []})['journals'].append(proof(name, root=root))
        for line in p.read_text(encoding='utf-8-sig').splitlines():
            if not line.strip():
                continue
            e = json.loads(line)
            uid = e['run_id'] + '#' + str(e['event_no'])
            if e['run_id'] != run or e['key'] not in valid_keys:
                fail('Wrong historical run/slot: ' + uid)
            for component in ('backend_sha', 'app_sha', 'web_sha'):
                if not SHA.fullmatch(e.get(component, '')) or e[component] != conf.get(component):
                    fail('Historical event/config version mismatch: ' + uid)
            if uid in events and events[uid]['event'] != e:
                fail('Conflicting duplicate event: ' + uid)
            evidence = e.get('evidence')
            checked = proof(evidence['path'], evidence['sha256'], root) if evidence else None
            events.setdefault(uid, {'event': e, 'proof': checked, 'journal_paths': []})['journal_paths'].append(name)
    return events, runs


def final_results(batch, slots, root=ROOT):
    """Only one frozen batch may supply final PASS. History is never passed here."""
    result = {k: {'outcome': 'NOT_RUN', 'batch_id': None} for k in slots}
    if batch is None:
        return result
    if batch.get('phase') != 'T3' or not batch.get('id') or not batch.get('environments'):
        fail('Final batch requires T3 identity and declared isolated environments')
    if batch.get('real_payments') is not False or batch.get('production') is not False:
        fail('Only isolated synthetic final batch allowed')
    freeze = batch.get('freeze', {})
    if set(freeze) != set(VERSION_KEYS):
        fail('Freeze all seven component versions and digests')
    for name, identity in freeze.items():
        if not SHA.fullmatch(identity.get('sha', '')) or not HASH.fullmatch(identity.get('digest', '')):
            fail('Unpinned final component: ' + name)
        require_proof(identity['manifest'], root)
        if identity['digest'] != identity['manifest']['sha256']:
            fail('Component digest must identify the immutable frozen input manifest')
    seen = set()
    for event in batch.get('events', []):
        key = event['key']
        if key not in slots or key in seen:
            fail('Unknown/duplicate final slot: ' + key)
        seen.add(key)
        if event.get('batch_id') != batch['id'] or event.get('freeze') != freeze:
            fail('Mixed product versions or batch')
        if event.get('environment') not in batch['environments']:
            fail('Environment outside final batch')
        if event.get('outcome') not in {'PASS', 'FAIL', 'BLOCKED', 'NOT_AUTOMATABLE'}:
            fail('Invalid final outcome')
        for required in ('raw_log', 'evidence_summary'):
            require_proof(event[required], root)
        if not event.get('command') or not event.get('assertions'):
            fail('Final result requires command and original assertions')
        if event['outcome'] == 'PASS':
            if '|review|' in key:
                fail('Machine regression cannot sign human review')
            if event.get('exit_code') != 0 or event.get('scope') != 'COMPLETE_ORIGINAL_SLOT':
                fail('Partial or failed execution cannot be final PASS')
            if not event.get('business_id') and not event.get('business_id_not_applicable_reason'):
                fail('Result requires record ID or explicit non-business check reason')
            if key.startswith('E2E-'):
                chain = key.split('|')[0]
                if not event.get('business_id') or not event.get('roles'):
                    fail('E2E needs same business record and roles')
                chain_record = batch.get('chain_records', {}).get(chain, {})
                if event['business_id'] != chain_record.get('business_id'):
                    fail('E2E records changed within final batch')
                if event['environment'] != chain_record.get('environment'):
                    fail('E2E cannot mix environments even within one batch')
        elif not event.get('reason'):
            fail('Non-PASS requires objective reason')
        result[key] = event
    return result


def reviewed_history(reference, key, expected, root=ROOT):
    """Credit archived execution only after a clause/slot review; never invent a new run."""
    require_proof(reference, root)
    review = read(root / reference['path'])
    if review.get('kind') != 'T1_ARCHIVED_EVIDENCE_REVIEW' or review.get('new_business_execution') is not False:
        fail('Expected explicit historical evidence review')
    matches = [s for s in review.get('slots', []) if s['key'] == key]
    if len(matches) != 1:
        fail('Historical review must identify this unique slot')
    slot = matches[0]
    if slot.get('scope') != 'COMPLETE_ORIGINAL_SLOT' or slot.get('expected') != expected:
        fail('Incomplete or changed original expectation in historical review')
    if not slot.get('clause_assertions') or not slot.get('execution_ids'):
        fail('Historical review requires original clauses and actual execution identities')
    executions = review['executions']
    for eid in slot['execution_ids']:
        e = executions[eid]
        if not e.get('environment') or not e.get('business_ids') or not e.get('command'):
            fail('Missing historical environment, business IDs or command')
        if not e.get('versions') or not all(SHA.fullmatch(v) for v in e['versions'].values()):
            fail('Historical versions must be exact')
        if not e.get('limitations') or not e.get('raw_logs'):
            fail('Historical scope limitations and raw logs required')
        require_proof(e['summary'], root)
        for p in e['raw_logs']:
            require_proof(p, root)
        for observation in e.get('observations', []):
            require_proof(observation['artifact'], root)
            p = root / observation['artifact']['path']
            data = read(p)
            for part in observation['json_path']:
                data = data[part]
            if data != observation['equals']:
                fail('Historical observation not present in original evidence')
    if key.startswith('E2E-'):
        if slot.get('original_branches') is not None:
            original_branch_history(slot, executions, key, expected, root)
        else:
            chains = [executions[e].get('chain') for e in slot['execution_ids']]
            if not all(chains) or any(c != chains[0] for c in chains):
                fail('Historical whole chain cannot splice distinct records or environments')
    return review


def original_branch_history(slot, executions, key, expected, root=ROOT):
    """E2E06 explicitly says full service takes another branch (另走).

    Keep each branch's actual chain identity; a fixed cash-credit exchange must
    never be invented for the separately specified zero-cash service. This is
    historical T1 evidence only. final_results keeps its existing frozen-batch
    checks and cannot inherit this review.
    """
    if key.split('|')[0] != 'E2E-06' or key.split('|')[-1] not in {'normal', 'reverse'}:
        fail('Original branch review is only defined for E2E06 normal/reverse')
    if slot.get('not_one_environment_or_final_batch') is not True:
        fail('Historical branches must explicitly deny one-environment/final-batch equivalence')
    basis = slot.get('branch_basis', {})
    if basis.get('path') != registry.REG.as_posix():
        fail('Original branches require the formal acceptance source')
    require_proof(basis, root)
    formal = read(root / registry.REG)
    originals = [x for x in formal.get('items', []) + formal.get('supplemental_items', [])
                 if x['id'] == 'E2E-06']
    if len(originals) != 1 or originals[0].get('effective_expected') != expected:
        fail('Original branch requirement changed or absent')
    required = {
        'cash_credit': ['从合格消费、售后结束发分开始，兑换、锁定、失败释放及重付闭环',
                        '现金制作金首笔付款确认后核销', '退款不足晶钻记待冲回且不重复扣'],
        'full_service': ['全额服务权益另走0现金/开工核销/开工前取消释放']}
    if not all(clause in expected for clauses in required.values() for clause in clauses):
        fail('Formal source does not specify these original branches')
    branches = slot['original_branches']
    if len(branches) != len(required) or {x.get('id') for x in branches} != set(required):
        fail('Every original branch must be present exactly once')
    assigned = []
    for b in branches:
        if b.get('scope') != 'COMPLETE_ORIGINAL_BRANCH' or not b.get('clause_assertions'):
            fail('Partial branch cannot establish complete original coverage')
        if b.get('source_clauses') != required[b['id']]:
            fail('Original branch clauses omitted or changed')
        chain = b.get('chain', {})
        if not chain.get('environment') or not UUID.fullmatch(chain.get('business_id', '')):
            fail('Historical branch requires its real environment and business anchor')
        if not b.get('execution_ids'):
            fail('Historical branch has no actual execution')
        for eid in b['execution_ids']:
            if eid not in slot['execution_ids'] or eid in assigned:
                fail('Missing or reused branch execution')
            assigned.append(eid)
            e = executions[eid]
            env = e['environment'].get('database') if isinstance(e['environment'], dict) else e['environment']
            if e.get('chain') != chain or env != chain['environment']:
                fail('One historical branch cannot splice other records or environments')
            def contains(value):
                if isinstance(value, dict): return any(contains(v) for v in value.values())
                if isinstance(value, list): return any(contains(v) for v in value)
                return value == chain['business_id']
            if not contains(e['business_ids']) or not e.get('observations'):
                fail('Historical branch needs recorded business identity and observed facts')
    if sorted(assigned) != sorted(slot['execution_ids']):
        fail('Unmapped historical branch execution')


def t1_gate(slots, bugs):
    pending = []
    for s in slots:
        d = s['discovery']
        if d['decision'] == 'HISTORICAL_COVERED':
            continue
        objective_block = (d['decision'] in {'BLOCKED', 'EXTERNAL'} and d.get('objective_condition')
                           and d.get('required_owner') and d.get('machine_remainder_complete') is True
                           and d.get('condition_evidence'))
        if not objective_block:
            pending.append(s['key'])
    unresolved = [b['bug_id'] for b in bugs if b['status'] not in {'RETARGET_PASS', 'NOT_A_BUG'}]
    return {'status': 'READY_FOR_T1_EXIT_REVIEW' if not pending and not unresolved else 'NOT_READY',
            'unresolved_slots': pending, 'unresolved_defects': unresolved,
            'final_regression_required_for_T1_exit': False,
            'formal_acceptance_granted': False}


def generate(root=ROOT):
    ledger = read(root / LEDGER)
    source = registry.source()
    registry.source_matches(source)
    if len(source['slots']) != 578 or len({s['key'] for s in source['slots']}) != 578:
        fail('Expected original 578 unique slots')
    if ledger['source_hash_encoding'] != 'UTF8_LF':
        fail('Explicit portable source hashing convention required')
    for name, expected in ledger['source_pins'].items():
        if source_sha(repo_file(name, root)) != expected:
            fail('Authoritative source text changed: ' + name)
    source['source'] = {str(p).replace('\\', '/'): source_sha(root / p)
                        for p in (registry.REG, registry.BOARD, registry.DASH, registry.BASELINE)}
    criteria = {c['id']: c for c in source['criteria']}
    keys = {s['key'] for s in source['slots']}
    history, runs = import_events(ledger['historical_journals'], keys, root)
    catalog = {}
    formal = read(root / registry.REG)
    source_refs = {}
    for item in formal['items'] + formal['supplemental_items']:
        source_refs[item['id']] = []
        for n, entry in enumerate(item.get('partial_evidence', [])):
            uid = item['id'] + ':source-partial:' + str(n + 1)
            artifact = entry['artifact']
            p = repo_file(artifact['path'], root)
            catalog[uid] = {'type': 'ORIGINAL_PARTIAL_EVIDENCE', 'scope': entry.get('scope'),
                            'checks': entry.get('checks', []),
                            'proof': proof(artifact['path'], artifact['sha256'], root),
                            'metadata': metadata(read(p)) if p.suffix == '.json' else {},
                            'coverage': 'UNREVIEWED_PARTIAL_NOT_A_SLOT_PASS'}
            source_refs[item['id']].append(uid)
    package_refs = {k: [] for k in criteria}
    for package in ledger['packages']:
        uid = package['id']
        if uid in catalog or not package['criteria']:
            fail('Duplicate/empty package: ' + uid)
        summary = require_proof(package['summary'], root)
        raw = [require_proof(p, root) for p in package['raw_evidence']]
        catalog[uid] = {**package, 'type': 'SCOPED_PACKAGE', 'summary': summary,
                        'raw_evidence': raw, 'metadata': metadata(read(root / summary['path'])),
                        'coverage': 'CANDIDATE_REQUIRES_SURFACE_AND_CASE_REVIEW'}
        for cid in package['criteria']:
            if cid not in criteria:
                fail('Unknown package criterion: ' + cid)
            package_refs[cid].append(uid)
    assessments = {}
    for assessment in ledger['assessments']:
        key = assessment['key']
        if key not in keys or key in assessments or assessment['decision'] not in DECISIONS:
            fail('Invalid/duplicate assessment: ' + key)
        if not assessment.get('reason') or not assessment.get('remaining'):
            fail('Assessment needs reason and remaining obligation')
        for eid in assessment.get('events', []):
            if eid not in history or history[eid]['event']['key'] != key:
                fail('Assessment references wrong event/slot: ' + eid)
            if history[eid]['proof'] and history[eid]['proof']['integrity'] != 'MATCH':
                fail('Reviewed event evidence changed: ' + eid)
        for uid in assessment.get('packages', []):
            if uid not in package_refs[key.split('|')[0]]:
                fail('Assessment references unrelated package: ' + uid)
        if assessment.get('historical_review'):
            require_proof(assessment['historical_review'], root)
        if assessment.get('condition_evidence'):
            require_proof(assessment['condition_evidence'], root)
        if assessment['decision'] == 'HISTORICAL_COVERED':
            if assessment.get('historical_review'):
                reviewed_history(assessment['historical_review'], key,
                                 criteria[key.split('|')[0]]['effective_expected'], root)
            elif not assessment.get('events') or not any(history[e]['event']['outcome'] == 'PASS' for e in assessment['events']):
                fail('Historical covered needs explicit original PASS review')
        if assessment['decision'] == 'EXTERNAL' and not assessment.get('required_owner'):
            fail('External requires responsible human/condition')
        assessments[key] = assessment
    final = final_results(ledger['final_batch'], keys, root)
    slots = []
    routes = {x['id']: x for x in source['routes']}
    for slot in source['slots']:
        key, cid = slot['key'], slot['id']
        assessment = assessments.get(key, {
            'decision': 'NEEDS_EVIDENCE_REVIEW',
            'reason': 'Existing evidence must be checked against this exact surface and whole original scenario; not a missing-function count.',
            'remaining': 'Review attached candidate/source evidence first; execute only unsupported original assertions.'})
        slots.append({**slot, 'original_work': criteria[cid]['work'],
                      'expected': criteria[cid]['effective_expected'],
                      'original_chain_scope': routes.get(cid),
                      'historical_events': [uid for uid, e in history.items() if e['event']['key'] == key],
                      'original_partial_evidence': source_refs[cid],
                      'candidate_packages': package_refs[cid],
                      'discovery': assessment, 'final_regression': final[key]})
    bug_rows = list(csv.DictReader((root / BASE / 'BUGS.csv').read_text(encoding='utf-8-sig').splitlines()))
    if len(bug_rows) != len({b['bug_id'] for b in bug_rows}):
        fail('Duplicate defect IDs')
    defects = dict(Counter(b['status'] for b in bug_rows))
    gate = t1_gate(slots, bug_rows)
    def stats(rows):
        return {'slots': len(rows), 'discovery': dict(Counter(s['discovery']['decision'] for s in rows)),
                'with_candidates': sum(bool(s['candidate_packages'] or s['original_partial_evidence'] or s['historical_events']) for s in rows),
                'final_regression': dict(Counter(s['final_regression']['outcome'] for s in rows))}
    summary = {'phase': ledger['phase'], 'counts_are_unique_slots_not_events': True,
               'criteria': 151, 'requirements': 60, 'rules': 23, **stats(slots),
               'historical_runs': len(runs), 'historical_events': len(history),
               'formal_status_unchanged': source['formal_initial'], 'formal_groups_closed': 0,
               'groups': [{**g, **stats([s for s in slots if g['id'] in s['groups']])} for g in source['groups']],
               'routes': [{**route, **stats([s for s in slots if s['id'] == route['id']])} for route in source['routes']],
               'defects': {'total': len(bug_rows), 'status': defects,
                           'not_closed': [b['bug_id'] for b in bug_rows if b['status'] not in {'RETARGET_PASS', 'NOT_A_BUG'}]},
               'ci': ledger['ci'], 'blockers': ledger['blockers'],
               'source_partial_hash_mismatches': [k for k, v in catalog.items() if v.get('proof', {}).get('integrity') == 'MISMATCH'],
               'unmapped_packages': ledger.get('unmapped_packages', []),
               't1_exit': gate,
               'final_batch': ledger['final_batch']['id'] if ledger['final_batch'] else None}
    matrix = {'schema': 1, 'generated_from': LEDGER.as_posix(), 'source': source['source'],
              'source_hash_encoding': 'UTF8_LF; original evidence always raw byte SHA256',
              'criteria': source['criteria'], 'requirements': source['baseline_requirements'],
              'rules': source['provisional_rules'], 'candidate_versions': ledger['candidate_versions'],
              'historical_runs': runs, 'historical_events': history, 'evidence_catalog': catalog,
              'slots': slots, 'summary': summary}
    csv_text = io.StringIO(newline='')
    writer = csv.writer(csv_text, lineterminator='\n')
    writer.writerow(['slot', 'groups', 'original_work', 'dashboard_chain_scope', 'expected', 'discovery', 'remaining', 'historical_events', 'candidate_packages', 'original_partial_evidence', 'final_result'])
    for s in slots:
        writer.writerow([s['key'], ','.join(s['groups']), s['original_work'],
                         (s['original_chain_scope'] or {}).get('original_scope', ''),
                         s['expected'], s['discovery']['decision'], s['discovery']['remaining'],
                         ';'.join(s['historical_events']), ';'.join(s['candidate_packages']), ';'.join(s['original_partial_evidence']), s['final_regression']['outcome']])
    lines = ['# 统一机测覆盖摘要', '', '由 `scripts/qa18_coverage.py` 从原正式登记源和 `COVERAGE_LEDGER.json` 生成；不能手改本文件。', '',
             '阶段：T1 首轮收口。原151条、60REQ、23规则，唯一578槽位。跨组引用不相加；候选证据不等于完整场景通过。', '',
             '每槽并列保留正式登记源 original_work、原完整预期及驾驶舱 original_chain_scope；流程摘要不能替代正式原文，审定须检查两者的原义务。', '',
             f"首轮证据审定：历史完整已核 {summary['discovery'].get('HISTORICAL_COVERED',0)}，局部已核 {summary['discovery'].get('PARTIAL',0)}，待逐槽核对 {summary['discovery'].get('NEEDS_EVIDENCE_REVIEW',0)}。有历史/局部候选入口 {summary['with_candidates']}/578；候选入口数量不是通过数。", '',
             f"最终同版回归：PASS {summary['final_regression'].get('PASS',0)}，NOT_RUN {summary['final_regression'].get('NOT_RUN',0)}；批次：{summary['final_batch'] or '尚未冻结/未启动'}。正式151状态不变，18组正式关闭0。", '',
             '|组|唯一槽位|历史完整已核|局部已核|待核证据|外部/阻断|最终PASS|', '|---|---:|---:|---:|---:|---:|---:|']
    for g in summary['groups']:
        d = g['discovery']
        lines.append(f"|G{g['id']} {g['name']}|{g['slots']}|{d.get('HISTORICAL_COVERED',0)}|{d.get('PARTIAL',0)}|{d.get('NEEDS_EVIDENCE_REVIEW',0)}|{d.get('EXTERNAL',0)+d.get('BLOCKED',0)}|{g['final_regression'].get('PASS',0)}|")
    lines += ['', '以上组间重叠。全局仍只统计578槽位。', '', '|原E2E|槽位|历史完整已核|局部已核|待核证据|最终PASS|', '|---|---:|---:|---:|---:|---:|']
    for route in summary['routes']:
        d = route['discovery']
        lines.append(f"|{route['id']} {route['name']}|{route['slots']}|{d.get('HISTORICAL_COVERED',0)}|{d.get('PARTIAL',0)}|{d.get('NEEDS_EVIDENCE_REVIEW',0)}|{route['final_regression'].get('PASS',0)}|")
    lines += ['', f"缺陷登记共{summary['defects']['total']}项：专项复测通过{defects.get('RETARGET_PASS',0)}项，排除为缺陷{defects.get('NOT_A_BUG',0)}项，仍保留：{', '.join(summary['defects']['not_closed']) or '无'}。专项复测仍待最终回归，不等于正式关闭。", '',
              f"CI：准确提交 `{ledger['ci']['sha']}`，{ledger['ci']['conclusion']}；见 `{ledger['ci']['evidence']}`。不继承给后续HEAD。", '',
              f"T1退出检查：{gate['status']}；剩余{len(gate['unresolved_slots'])}槽须核定完整机器范围或客观条件，未结缺陷{len(gate['unresolved_defects'])}项。T3全量、安装包人工体验和维护者签收不是T1退出的前置。", '',
              '使用 [总表JSON](COVERAGE_MATRIX.json) 追溯版本、环境、业务ID及原始证据；[CSV](COVERAGE_MATRIX.csv)用于逐槽审查。历史原结果保持原样；首轮判定和最终批次是两列。', '']
    return {BASE / 'COVERAGE_MATRIX.json': canonical(matrix), BASE / 'COVERAGE_MATRIX.csv': csv_text.getvalue().encode('utf-8'),
            BASE / 'COVERAGE_SUMMARY.json': canonical(summary), BASE / 'COVERAGE_SUMMARY.md': '\n'.join(lines).encode('utf-8')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Reject stale generated files without writing')
    args = parser.parse_args()
    outputs = generate()
    for name, data in outputs.items():
        path = ROOT / name
        if args.check:
            if not path.is_file() or path.read_bytes() != data:
                fail('Generated coverage is stale: ' + str(name))
        else:
            path.write_bytes(data)
    summary = json.loads(outputs[BASE / 'COVERAGE_SUMMARY.json'])
    print(json.dumps({k: summary[k] for k in ('phase', 'slots', 'discovery', 'with_candidates', 'historical_runs', 'historical_events', 'final_regression', 'defects')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
