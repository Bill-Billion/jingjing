"""Read-only R0.6 governance validation. --render refreshes the task table only.

Python 3.10+, standard library; no application imports, DB, network or providers.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))


def render_tasks(board):
    lines = [
        '# Stage 0–6任务与认领', '',
        '机器台账：[board.json](board.json)。修改JSON后运行 '
        '`python scripts/collaboration_check.py --render`，再运行不带参数的校验。', '',
        '30项是执行任务组，后续可拆成更小任务；详细交付、验收、REQ、依赖和共享边界均在JSON。'
        '旧14个WORK用于可追溯映射，旧人时仅预算参考，不用旧周数或每阶段外部批准限制推进。', '',
        '**依赖是整项验收依赖。** Experience可以在对应契约合入integration后先开发隔离stub；'
        '不必等Core整个任务实现结束。双方按契约切片并行，禁止production fallback。', '',
        '认领只代表任务归属；完成还需测试/证据/状态更新和集成。共享边界必须真实跨流review。'
        '其他59项业务需求不因文档初始化完成而标为验收通过。', '',
        '|Task|Stage|流|内容|状态|Owner|依赖|', '|---|---|---|---|---|---|---|'
    ]
    for t in board['tasks']:
        lines.append('|{}|{}|{}|{}|{}|{}|{}|'.format(
            t['id'], t['stage'], t['stream'], t['title'], t['status'],
            t['owner'] or '待本人认领', ', '.join(t['dependencies']) or '—'))
    lines.extend(['', '首次Core认领与验证见 [CORE-S0-000记录](records/CORE-S0-000.md)；'
                  '[Core CURRENT](../status/CORE_CURRENT.md) / '
                  '[Experience CURRENT](../status/EXPERIENCE_CURRENT.md)。', ''])
    return '\n'.join(lines)


def validate():
    errors = []

    def check(ok, msg):
        if not ok:
            errors.append(msg)

    def within_repo(path):
        p = (ROOT / path).resolve()
        check(p.is_relative_to(ROOT), 'Path escapes repository: ' + path)
        return p

    manifest = read_json('docs/baselines/IMPORT_MANIFEST.json')
    destinations = set()
    for f in manifest['files']:
        path = f['destination']
        check(path not in destinations, 'Duplicate import: ' + path)
        destinations.add(path)
        p = within_repo(path)
        check(p.is_file(), 'Missing original: ' + path)
        if p.is_file():
            data = p.read_bytes()
            check(hashlib.sha256(data).hexdigest() == f['sha256'], 'Original changed: ' + path)
            check(len(data) == f['bytes'], 'Size changed: ' + path)
    baseline = read_json('docs/requirements/baseline.json')
    rows = baseline['requirements']
    reqs = {r['id']: r for r in rows}
    check(len(rows) == len(reqs) == 60, 'Expected 60 unique requirements')
    check(set(reqs) == {f'REQ-{i:03}' for i in range(1, 61)}, 'Requirement IDs changed')
    included = {r['id'] for r in rows if r['scope'] == 'IN_SCOPE'}
    check(included == set(reqs) - {'REQ-027'}, 'Scope must be 59 requirements, excluding REQ-027')
    historical = read_json('docs/baselines/r03/intake_reports/02_REQUIREMENTS_RECONCILED.json')
    originals = {r['id']: r for r in historical['requirements']}
    for r in rows:
        for field in ('original_meeting_result', 'implementation_status', 'commercial_enablement', 'repository_commit'):
            check(r[field] == originals[r['id']][field], r['id'] + ' unexpectedly changed ' + field)
        for e in r['source_evidence'] + r['code_evidence']:
            check(within_repo(e['path']).is_file(), r['id'] + ' missing evidence ' + e['path'])

    board = read_json('docs/tasks/board.json')
    check(board['baseline_id'] == baseline['baseline_id'] == manifest['baseline_id'], 'Baseline IDs differ')
    tasks = {t['id']: t for t in board['tasks']}
    check(len(tasks) == len(board['tasks']), 'Duplicate task ID')
    check({t['stage'] for t in tasks.values()} == set(range(7)), 'Stages 0–6 missing')
    check({w for t in tasks.values() for w in t['work_refs']} == {f'WORK-{i:02}' for i in range(1, 15)}, 'WORK coverage incomplete')
    covered = set()
    boundaries = {'schema/migration', 'OpenAPI', 'auth/permission', 'payments/refunds', 'rights/licenses',
                  'settlement', 'provider interfaces', 'revoke/delete', 'production release config'}
    for t in tasks.values():
        check(t['stream'] in ('Core', 'Experience'), 'Unknown stream: ' + t['id'])
        prefix = 'core/' if t['stream'] == 'Core' else 'ux/'
        if t['owner']:
            check(bool(t['branch']) and t['branch'].startswith(prefix), 'Claim must have correct branch: ' + t['id'])
        check(t['status'] in ('READY', 'PLANNED', 'CLAIMED', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED'), 'Unknown status: ' + t['id'])
        if t['status'] in ('CLAIMED', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'):
            check(bool(t['owner']), 'Missing owner: ' + t['id'])
        check(bool(t['acceptance']) and bool(t['deliverables']), 'Missing acceptance/deliverables: ' + t['id'])
        check(set(t['shared_boundaries']) <= boundaries, 'Unknown shared boundary: ' + t['id'])
        if t['status'] == 'DONE':
            check(t['test_status'] == 'PASS' and bool(t['evidence']), 'Done without evidence: ' + t['id'])
            if t['shared_boundaries']:
                check(t['review_status'] == 'APPROVED', 'Shared boundary not reviewed: ' + t['id'])
            for dep in t['dependencies']:
                check(dep in tasks and tasks[dep]['status'] == 'DONE', 'Done before dependency: ' + t['id'])
        for e in t['evidence']:
            check(within_repo(e).is_file(), 'Missing task evidence: ' + e)
        for dep in t['dependencies']:
            check(dep in tasks and dep != t['id'], 'Invalid dependency: ' + t['id'] + ' -> ' + dep)
        for req in t['req_refs']:
            check(req in included, 'Task references excluded/unknown requirement: ' + t['id'] + ' ' + req)
            covered.add(req)
    check(covered == included, 'Requirement task coverage incomplete: ' + str(sorted(included - covered)))
    for r in rows:
        expected = sorted(t['id'] for t in tasks.values() if r['id'] in t['req_refs'])
        check(sorted(r['task_refs']) == expected, 'Inverse task mapping differs: ' + r['id'])
    visited, visiting = set(), set()

    def visit(tid):
        if tid in visiting:
            errors.append('Dependency cycle: ' + tid)
            return
        if tid in visited or tid not in tasks:
            return
        visiting.add(tid)
        for dep in tasks[tid]['dependencies']:
            visit(dep)
        visiting.remove(tid)
        visited.add(tid)

    for tid in tasks:
        visit(tid)
    check((ROOT / 'docs/tasks/README.md').read_text(encoding='utf-8') == render_tasks(board), 'Task README stale; run --render')
    # Archives preserve received links exactly. Only current Markdown navigation is checked.
    active = [ROOT / 'README.md', ROOT / 'AGENTS.md', ROOT / 'docs/START_HERE.md',
              ROOT / 'docs/sources/README.md', ROOT / 'contracts/README.md']
    for folder in ('architecture', 'collaboration', 'operations', 'requirements', 'status', 'tasks'):
        active.extend((ROOT / 'docs' / folder).rglob('*.md'))
    links = 0
    for p in active:
        body = p.read_text(encoding='utf-8')
        check(not re.search(r'\b[A-Za-z]:[\\/](?!/)', body), 'Machine-specific absolute path in current document: ' + str(p.relative_to(ROOT)))
        for raw in re.findall(r'\[[^\]]*\]\(([^)]+)\)', body):
            url = unquote(raw.split('#', 1)[0])
            if not url or re.match(r'\w+://', url):
                continue
            links += 1
            check((p.parent / url).exists(), 'Broken link: ' + str(p.relative_to(ROOT)) + ' -> ' + url)
    print(json.dumps({'result': 'FAIL' if errors else 'PASS', 'original_files':len(manifest['files']),
                      'requirements':len(rows), 'in_scope':len(included), 'tasks':len(tasks),
                      'current_doc_links':links, 'application_tests':'NOT_RUN', 'errors':errors}, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args()
    if args.render:
        (ROOT / 'docs/tasks/README.md').write_text(render_tasks(read_json('docs/tasks/board.json')), encoding='utf-8')
    raise SystemExit(validate())
