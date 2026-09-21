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
    explanations = read_json('docs/tasks/plain_language.json')
    names = {key: value['name'] for key, value in explanations.items()}
    stages = ['先打好开发基础', '修旧问题，做好账号身份和历史承诺',
              '做好作者、数字人、作品和使用许可', '把选本、下单、制作和验收连起来',
              '做好商单、MCN合作、项目和发行', '算清钱，做好通知、留言和报表', '检查正式发布所需条件']
    states = {'READY': '可开始，尚未接手', 'PLANNED': '已列入计划，尚未接手',
              'CLAIMED': '已接手，尚未记录开工', 'IN_PROGRESS': '正在做',
              'IN_REVIEW': '已提交，等另一方检查', 'DONE': '已完成所列检查并加入共同版本',
              'BLOCKED': '遇到阻碍，见具体任务记录'}
    lines = [
        '# 全部工作安排：谁做什么，怎样算做完', '',
        '**本侧负责服务器和数据库；队友负责App和网页。** '
        '下面共30组工作，按建设顺序排列。日常看工作名称即可，不需要记编号。', '',
        '外部服务状态和私密文件保护已在本次开发分支完成基础实现与自验；本侧下一步修旧付款假成功、实名自动批准和付款查询归属等问题；'
        '队友可先运行现有App、整理五个主入口，并搭建运营和合作方网页。'
        '具体操作见 [双方分工](../collaboration/TEAM_ONBOARDING.md)，'
        '最新成果和限制见 [当前进度](../status/MAINLINE_PROGRESS.md)。', '',
        '表中的“需先完成”指整项工作最后验收前需要的其他成果。'
        '队友可先整理页面；双方约好数据格式后，可以用明确标注的测试数据做页面，'
        '不必等服务器全部功能结束。测试数据不能冒充真实付款、实名或制作结果。', '',
        '“本侧／队友”是分工，“尚未接手”是仓库中的实际登记状态。'
        '一项基础工作完成，不代表整个相关业务正式可用，也不代表原有问题都已修复。', ''
    ]
    for stage, title in enumerate(stages):
        lines.extend(['## ' + title, '', '|具体工作|谁负责／是否接手|做到哪了|怎样算做完|需先完成什么|',
                      '|---|---|---|---|---|'])
        for t in board['tasks']:
            if t['stage'] != stage:
                continue
            who = '本侧：服务器和数据' if t['stream'] == 'Core' else '队友：App和网页'
            who += '；已接手' if t['owner'] else '；尚未接手'
            dependencies = '；'.join(names[d] for d in t['dependencies']) or '可独立开始'
            lines.append('|{}|{}|{}|{}|{}|'.format(names[t['id']], who,
                ('已写好并测过，等所需代码先合入' if t['status'] == 'IN_REVIEW' and t['review_status'] == 'NOT_REQUIRED' else states[t['status']]), explanations[t['id']]['done_when'], dependencies))
        lines.append('')
    lines.extend(['## 需要查文件或交给Codex操作时再看这里', '',
                  '工作名称与技术记录的对应关系如下。编号只用于查找；'
                  '它们不另增工作，也不改变需求范围。', '',
                  '|工作名称|查找编号|已登记账号|', '|---|---|---|'])
    for t in board['tasks']:
        lines.append('|{}|{}|{}|'.format(names[t['id']], t['id'], t['owner'] or '尚未登记'))
    lines.extend(['', '详细状态、需求对应、分支和测试证据仍在 [任务记录文件](board.json)。'
                  '直白中文名称和完成标准在 [文字说明文件](plain_language.json)。'
                  '修改后运行 `python scripts/collaboration_check.py --render` 更新本页，'
                  '再运行不带参数的检查。自动更新也必须遵守 [沟通写法](../collaboration/WRITING_RULES.md)。', ''])
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
    explanations = read_json('docs/tasks/plain_language.json')
    check(board['baseline_id'] == baseline['baseline_id'] == manifest['baseline_id'], 'Baseline IDs differ')
    tasks = {t['id']: t for t in board['tasks']}
    check(set(explanations) == set(tasks), 'Every task must have a plain-language explanation')
    for tid, explanation in explanations.items():
        for field in ('name', 'done_when'):
            value = explanation.get(field, '')
            check(isinstance(value, str) and bool(value.strip()), tid + ' missing ' + field)
            if isinstance(value, str):
                check('|' not in value and '\n' not in value, tid + ' breaks task table')
                check(not re.search(r'\b(?:Handshake|CCR|Readiness|IN_REVIEW|NOT_IMPLEMENTED|SKU|Grant|Binding|CP[1-4]|CORE-S\d-\d+|UX-S\d-\d+)\b', value),
                      tid + ' uses unexplained shorthand in reader-facing ' + field)
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
