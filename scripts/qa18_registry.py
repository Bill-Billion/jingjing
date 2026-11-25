#!/usr/bin/env python3
"""PM04 18组统一机测：只读原验收簿，追加执行记录，严禁自动晋级正式验收。
Python标准库。放置到项目 scripts/qa18_registry.py 后运行。资料保存在 .local/qa18/。
"""
import argparse
import csv
import hashlib
import json
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REG = Path('docs/testing/FULL_BUSINESS_ACCEPTANCE_20261028.json')
BOARD = Path('docs/tasks/board.json')
DASH = Path('docs/sources/pm03-20261115/dashboard-data.json')
BASELINE = Path('docs/requirements/baseline.json')
WORK = Path('.local/qa18')
ALLOWED = {'PASS', 'FAIL', 'BLOCKED', 'NOT_AUTOMATABLE'}
SHA40 = re.compile(r'^[0-9a-f]{40}$')
SHA64 = re.compile(r'^[0-9a-f]{64}$')
GROUP = re.compile(r'^(?:CORE|UX)-CLIENT-COMPLETE-(\d{2})$')
RUNID = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9._-]{2,90}$')


def die(msg):
    raise SystemExit('QA18 ERROR: ' + msg)


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_repo_file(text, *, required=True):
    if not text and not required:
        return None
    if not text or '\\' in text or ':' in text or text.startswith('/'):
        die('evidence must be an existing repository-relative path')
    p = (ROOT / text).resolve()
    if not p.is_relative_to(ROOT.resolve()) or not p.is_file():
        die('evidence missing or outside repository: ' + text)
    if p.stat().st_size > 30 * 1024 * 1024:
        die('evidence too large; store a bounded redacted excerpt with sha: ' + text)
    return p


def gitsha():
    try:
        return subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    except Exception:
        return None


def source():
    for p in (REG, BOARD, DASH, BASELINE):
        if not (ROOT / p).is_file():
            die('authoritative input missing: ' + str(p))
    official = load(ROOT / REG)
    items = official.get('items', []) + official.get('supplemental_items', [])
    if len(items) != 151 or len({x['id'] for x in items}) != 151:
        die('151 authoritative acceptance entries required; not safe to modify')
    dash = load(ROOT / DASH)
    groups = dash.get('groups', [])
    routes = dash.get('routes', [])
    if len(groups) != 18 or {g['id'] for g in groups} != {f'{n:02}' for n in range(1, 19)}:
        die('18 original groups changed/missing')
    if len(routes) != 12 or {r['acceptance_id'] for r in routes} != {f'E2E-{n:02}' for n in range(1, 13)}:
        die('12 original E2E changed/missing')
    linked = []
    cases = []
    for item in items:
        ids = sorted({m.group(1) for t in item['task_refs'] if (m := GROUP.fullmatch(t))})
        if not ids:
            die('acceptance has no original group mapping: ' + item['id'])
        entry = {
            'id': item['id'], 'work': item.get('work', ''),
            'source_expected': item.get('source_expected', item.get('expected', '')),
            'effective_expected': item.get('effective_expected', item.get('source_expected', item.get('expected', ''))),
            'required_surfaces': item.get('required_surfaces', []),
            'required_cases': item.get('required_cases', []),
            'rule_refs': item.get('rule_refs', []), 'groups': ids,
            'task_refs': item.get('task_refs', []),
            'formal_status_at_start': item.get('status'),
        }
        linked.append(entry)
        if not entry['required_surfaces'] or not entry['required_cases']:
            die('missing required layer/case: ' + item['id'])
        for surface in entry['required_surfaces']:
            for case in entry['required_cases']:
                cases.append({'key': '|'.join((item['id'], surface, case)), 'id': item['id'],
                              'surface': surface, 'case': case, 'groups': ids})
    checks = {g['id']: {'id': g['id'], 'name': g['name'], 'exit': g['exit']} for g in groups}
    baseline = load(ROOT / BASELINE)
    reqs = baseline.get('requirements', [])
    if len(reqs) != 60 or len({x['id'] for x in reqs}) != 60:
        die('original 60 REQ baseline missing; inspect scope before proceeding')
    return {
        'source': {str(p): digest(ROOT / p) for p in (REG, BOARD, DASH, BASELINE)},
        'formal_initial': dict(Counter(i['formal_status_at_start'] for i in linked)),
        'groups': [checks[f'{n:02}'] for n in range(1, 19)],
        'routes': [{'id': x['acceptance_id'], 'name': x['name'], 'test_hint': x.get('test_path'),
                    'original_scope': x.get('flow'), 'checks': x.get('checks', [])} for x in routes],
        'criteria': linked, 'slots': cases,
        'baseline_requirements': [
            {'id': r['id'], 'title': r.get('title', ''), 'scope': r.get('scope', ''),
             'task_refs': r.get('task_refs', []), 'baseline_status': r.get('implementation_status', ''),
             'trace_status': 'EXCLUDED_BY_BASELINE' if r.get('scope') == 'EXCLUDED' else 'TO_VERIFY_SOURCE_TO_ACCEPTANCE',
             'acceptance_refs': ''}
            for r in reqs
        ],
        'provisional_rules': [
            {'id': f'P{i:02}', 'criteria': [x['id'] for x in linked if f'P{i:02}' in x['rule_refs']]}
            for i in range(1, 24)
        ],
    }


def session(run_id):
    if not RUNID.fullmatch(run_id):
        die('invalid run id')
    path = ROOT / WORK / run_id
    if not path.is_dir():
        die('run not initialized: ' + str(path))
    conf = load(path / 'config.json')
    manifest = load(path / 'manifest.json')
    return path, conf, manifest


def events(path):
    p = path / 'events.jsonl'
    if not p.exists():
        return []
    rows = []
    for index, line in enumerate(p.read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except ValueError as e:
            die(f'invalid audit journal {p}:{index}: {e}')
    return rows


def source_matches(manifest):
    for p, sha in manifest['source'].items():
        f = ROOT / p
        if not f.is_file():
            die('authoritative input missing: ' + p)
        if p == str(BOARD):
            # Progress/claim status is expected to change during testing; compare only
            # the authoritative CORE/UX acceptance-to-task mappings, not every byte.
            tasks = {x['id']: x for x in load(f).get('tasks', [])}
            for n in range(1, 19):
                for side in ('CORE', 'UX'):
                    tid = f'{side}-CLIENT-COMPLETE-{n:02}'
                    wanted = {x['id'] for x in manifest['criteria'] if tid in x['task_refs']}
                    if tid not in tasks or set(tasks[tid].get('acceptance_ids', [])) != wanted:
                        die('18-group mapping changed; freeze a NEW run: ' + tid)
        elif digest(f) != sha:
            die('authoritative requirements changed since this run. Create a NEW run: ' + p)


def command_init(args):
    manifest = source()
    if not all(SHA40.fullmatch(getattr(args, k)) for k in ('backend_sha', 'app_sha', 'web_sha')):
        die('backend/app/web 40-hex SHAs are required, even if app and web are the same commit')
    if not args.environment or args.environment.lower() in {'production', 'prod'}:
        die('explicit isolated test environment identifier required')
    path = ROOT / WORK / args.run_id
    if path.exists():
        die('run already exists; events are append-only')
    path.mkdir(parents=True)
    conf = {'run_id': args.run_id, 'round': args.round, 'created_at': datetime.now(timezone.utc).isoformat(),
            'repo_head_at_init': gitsha(), 'backend_sha': args.backend_sha, 'app_sha': args.app_sha,
            'web_sha': args.web_sha, 'environment': args.environment,
            'real_payments': False, 'production_enabled': False,
            'formal_acceptance_upgraded': False,
            'machine_only': True, 'note': args.note or ''}
    dump(path / 'config.json', conf)
    dump(path / 'manifest.json', manifest)
    (path / 'events.jsonl').write_text('', encoding='utf-8')
    print(json.dumps({'run_id': args.run_id, 'slots': len(manifest['slots']), 'criteria': 151,
                      'groups': 18, 'routes': 12, 'requirements': 60, 'directory': str(path.relative_to(ROOT))}, ensure_ascii=False))


def command_record(args):
    path, conf, manifest = session(args.run_id)
    source_matches(manifest)
    slotkey = '|'.join((args.criterion, args.surface, args.case))
    valid = {v['key'] for v in manifest['slots']}
    if slotkey not in valid:
        die('case is not demanded by authoritative register: ' + slotkey)
    if args.outcome not in ALLOWED:
        die('invalid outcome')
    if not args.owner or not args.note:
        die('owner and factual note are required')
    if args.outcome == 'PASS':
        if args.exit_code != 0 or not args.evidence or not args.assertion:
            die('PASS requires exit-code 0, local evidence file and exact assertion identifier')
        if args.criterion.startswith('E2E-') and (not args.chain_id or not args.record_id or not args.roles):
            die('E2E PASS needs original cross-role chain_id, record_id and roles; no fragment promotion')
        if args.environment != conf['environment']:
            die('do not mix different environments in one run')
    if args.outcome in ('FAIL', 'BLOCKED') and (not args.evidence or not args.defect):
        die('FAIL/BLOCKED requires evidence and a defect/blocker id')
    if args.outcome == 'NOT_AUTOMATABLE' and not args.reason:
        die('nonautomatable requires a specific reason and required manual owner')
    proof = safe_repo_file(args.evidence, required=False)
    history = events(path)
    past = next((x for x in reversed(history) if x['key'] == slotkey and x['outcome'] in ('FAIL', 'BLOCKED')), None)
    if args.outcome == 'PASS' and past and not args.resolution:
        die('after FAIL/BLOCKED, PASS requires explanation or fix/fixture evidence in --resolution')
    item = {
        'event_no': len(history) + 1, 'occurred_at': datetime.now(timezone.utc).isoformat(),
        'run_id': conf['run_id'], 'round': conf['round'], 'key': slotkey,
        'criterion': args.criterion, 'surface': args.surface, 'case': args.case,
        'outcome': args.outcome, 'owner': args.owner,
        'backend_sha': conf['backend_sha'], 'app_sha': conf['app_sha'], 'web_sha': conf['web_sha'],
        'environment': conf['environment'], 'chain_id': args.chain_id or None,
        'record_id': args.record_id or None, 'roles': args.roles or None,
        'assertion_id': args.assertion or None,
        'test_command': args.command or None, 'exit_code': args.exit_code,
        'evidence': {'path': args.evidence, 'sha256': digest(proof)} if proof else None,
        'defect_or_blocker': args.defect or None, 'reason': args.reason or None,
        'resolution': args.resolution or None, 'note': args.note
    }
    with (path / 'events.jsonl').open('a', encoding='utf-8') as f:
        f.write(json.dumps(item, ensure_ascii=False) + '\n')
    print(json.dumps({'recorded': slotkey, 'outcome': args.outcome, 'event_no': item['event_no']}, ensure_ascii=False))


def totals(manifest, journal):
    slots = {x['key']: x for x in manifest['slots']}
    latest = {}
    for e in journal:
        if e['key'] not in slots:
            die('journal references unknown standard/case: ' + e['key'])
        latest[e['key']] = e
    for x in latest.values():
        ev = x.get('evidence')
        if ev:
            f = safe_repo_file(ev['path'])
            if digest(f) != ev['sha256']:
                die('evidence changed since execution: ' + ev['path'])
    for cid in [f'E2E-{i:02}' for i in range(1, 13)]:
        by_scenario = {}
        for e in latest.values():
            if e['criterion'] == cid and e['outcome'] == 'PASS':
                by_scenario.setdefault(e['case'], set()).add(e.get('chain_id'))
        if any(len(ids) > 1 for ids in by_scenario.values()):
            die(cid + ' uses inconsistent cross-surface chain IDs for same scenario')
    return slots, latest


def command_report(args):
    path, conf, manifest = session(args.run_id)
    source_matches(manifest)
    slots, latest = totals(manifest, events(path))
    counts = Counter(latest[k]['outcome'] if k in latest else 'NOT_RUN' for k in slots)
    total = len(slots)
    group_rows = []
    for g in manifest['groups']:
        group_cases = [v for v in slots.values() if g['id'] in v['groups']]
        stats = Counter(latest[v['key']]['outcome'] if v['key'] in latest else 'NOT_RUN' for v in group_cases)
        group_rows.append({**g, 'required_slots': len(group_cases), 'pass': stats['PASS'],
                           'fail': stats['FAIL'], 'blocked': stats['BLOCKED'],
                           'not_automatable': stats['NOT_AUTOMATABLE'], 'not_run': stats['NOT_RUN'],
                           'machine_all_pass': stats['PASS'] == len(group_cases) and len(group_cases) > 0})
    route_rows = []
    for r in manifest['routes']:
        route_cases = [v for v in slots.values() if v['id'] == r['id']]
        stats = Counter(latest[v['key']]['outcome'] if v['key'] in latest else 'NOT_RUN' for v in route_cases)
        route_rows.append({**r, 'required_slots': len(route_cases), 'pass': stats['PASS'],
                           'fail': stats['FAIL'], 'blocked': stats['BLOCKED'],
                           'not_automatable': stats['NOT_AUTOMATABLE'], 'not_run': stats['NOT_RUN'],
                           'machine_all_pass': stats['PASS'] == len(route_cases) and len(route_cases) > 0})
    criteria_rows = []
    for a in manifest['criteria']:
        keys = [s['key'] for s in slots.values() if s['id'] == a['id']]
        st = Counter(latest[k]['outcome'] if k in latest else 'NOT_RUN' for k in keys)
        criteria_rows.append({'id': a['id'], 'groups': a['groups'], 'required_slots': len(keys),
                              'pass': st['PASS'], 'fail': st['FAIL'], 'blocked': st['BLOCKED'],
                              'not_automatable': st['NOT_AUTOMATABLE'], 'not_run': st['NOT_RUN'],
                              'machine_all_pass': st['PASS'] == len(keys) and len(keys) > 0,
                              'formal_status_at_start': a['formal_status_at_start']})
    report = {'run': conf, 'totals': {'criteria': 151, 'groups': 18, 'routes': 12, 'slots': total,
                                    'observed': sum(counts[x] for x in ('PASS','FAIL')),
                                    'passed': counts['PASS'], 'failed': counts['FAIL'],
                                    'blocked': counts['BLOCKED'],
                                    'not_automatable': counts['NOT_AUTOMATABLE'], 'not_run': counts['NOT_RUN'],
                                    'machine_complete_groups': sum(x['machine_all_pass'] for x in group_rows),
                                    'machine_complete_routes': sum(x['machine_all_pass'] for x in route_rows),
                                    'machine_complete_criteria': sum(x['machine_all_pass'] for x in criteria_rows),
                                    'formal_promotions': 0},
              'groups': group_rows, 'routes': route_rows, 'criteria': criteria_rows,
              'release_go': False, 'formal_acceptance_upgraded': False}
    dump(path / 'report.json', report)
    md = [f"# {conf['run_id']} — PM04统一机测执行报告", '',
          f"轮次：{conf['round']}；环境：{conf['environment']}；前端：{conf['app_sha']}；网页：{conf['web_sha']}；后端：{conf['backend_sha']}", '',
          f"151个标准 / 18组 / 12条E2E；执行槽位 {total}，PASS {counts['PASS']}，FAIL {counts['FAIL']}，BLOCKED {counts['BLOCKED']}，需人工或外部 {counts['NOT_AUTOMATABLE']}，NOT_RUN {counts['NOT_RUN']}。", '',
          f"完整机器槽位全部PASS的组：{report['totals']['machine_complete_groups']}/18；完整机器槽位全部PASS的E2E：{report['totals']['machine_complete_routes']}/12；对应标准：{report['totals']['machine_complete_criteria']}/151。", '',
          '> 本报告不改变正式验收登记；不能当成18组正式关闭或真实上线同意。', '',
          '|组|名称|槽位|PASS|FAIL|BLOCKED|人工/外部|NOT_RUN|全部机测PASS|',
          '|---|---|---:|---:|---:|---:|---:|---:|---|']
    for row in group_rows:
        md.append(f"|{row['id']}|{row['name']}|{row['required_slots']}|{row['pass']}|{row['fail']}|{row['blocked']}|{row['not_automatable']}|{row['not_run']}|{'是' if row['machine_all_pass'] else '否'}|")
    md += ['', '|E2E|业务链|槽位|PASS|FAIL|未执行/阻断/人工|', '|---|---|---:|---:|---:|---:|']
    for row in route_rows:
        md.append(f"|{row['id']}|{row['name']}|{row['required_slots']}|{row['pass']}|{row['fail']}|{row['not_run']+row['blocked']+row['not_automatable']}|")
    md += ['', '## 当前缺口（逐条，不删除）', '']
    miss = [s for s in slots.values() if s['key'] not in latest or latest[s['key']]['outcome'] != 'PASS']
    for s in miss[:100]:
        st = latest.get(s['key'], {})
        md.append(f"- `{s['key']}`：{st.get('outcome', 'NOT_RUN')}；{st.get('defect_or_blocker') or st.get('reason') or '待执行'}")
    if len(miss) > 100:
        md.append(f'- 还有{len(miss)-100}条详见report.json或执行簿，不截掉计数')
    (path / 'report.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
    print(json.dumps({'report': str((path/'report.md').relative_to(ROOT)), **report['totals']}, ensure_ascii=False))


def command_check(args):
    path, conf, manifest = session(args.run_id)
    source_matches(manifest)
    totals(manifest, events(path))
    print(json.dumps({'run_id': args.run_id, 'audit_journal': 'VALID', 'evidence_sha': 'VALID',
                      'original_source': 'UNCHANGED', 'formal_acceptance_unchanged': True}, ensure_ascii=False))


def command_export(args):
    _, _, manifest = session(args.run_id)
    path = ROOT / WORK / args.run_id
    out = path / 'matrix.csv'
    fields = ['key', 'id', 'surface', 'case', 'groups']
    with out.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in manifest['slots']:
            w.writerow({**row, 'groups': ','.join(row['groups'])})
    out2 = path / 'requirements.csv'
    with out2.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['id', 'title', 'scope', 'baseline_status', 'task_refs', 'trace_status', 'acceptance_refs'])
        w.writeheader()
        for row in manifest['baseline_requirements']:
            w.writerow({**row, 'task_refs': ','.join(row['task_refs'])})
    out3 = path / 'provisional_rules.csv'
    with out3.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['id', 'criteria'])
        w.writeheader()
        for row in manifest['provisional_rules']:
            w.writerow({**row, 'criteria': ','.join(row['criteria'])})
    print(json.dumps({'matrix_csv': str(out.relative_to(ROOT)), 'requirements_csv': str(out2.relative_to(ROOT)),
                      'rules_csv': str(out3.relative_to(ROOT))}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=None, help='repository root; default script parent')
    sub = parser.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('init', help='freeze 151/18/12 and record exact source/env')
    p.add_argument('--run-id', required=True)
    p.add_argument('--round', choices=['discovery', 'retest', 'full_regression'], required=True)
    for name in ('backend_sha', 'app_sha', 'web_sha', 'environment'):
        p.add_argument('--' + name.replace('_','-'), required=True)
    p.add_argument('--note', default='')
    q = sub.add_parser('record', help='append one actually performed test fact')
    for x in ('run_id', 'criterion', 'surface', 'case', 'outcome', 'owner', 'note'):
        q.add_argument('--' + x.replace('_','-'), required=True)
    q.add_argument('--evidence', default='')
    q.add_argument('--assertion', default='')
    q.add_argument('--command', default='')
    q.add_argument('--exit-code', type=int, default=None)
    q.add_argument('--environment', default='')
    q.add_argument('--chain-id', default='')
    q.add_argument('--record-id', default='')
    q.add_argument('--roles', default='')
    q.add_argument('--defect', default='')
    q.add_argument('--reason', default='')
    q.add_argument('--resolution', default='')
    for name in ('report', 'check', 'export'):
        p = sub.add_parser(name)
        p.add_argument('--run-id', required=True)
    args = parser.parse_args()
    if args.root:
        global ROOT
        ROOT = args.root.resolve()
    if args.cmd == 'init':
        command_init(args)
    elif args.cmd == 'record':
        command_record(args)
    elif args.cmd == 'report':
        command_report(args)
    elif args.cmd == 'check':
        command_check(args)
    elif args.cmd == 'export':
        command_export(args)


if __name__ == '__main__':
    main()
