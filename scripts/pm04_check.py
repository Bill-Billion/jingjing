"""Render and validate PM04 records without changing claims or acceptance counts."""
from pathlib import Path
import argparse
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
PM = ROOT / 'docs/pm04'
ORIGINAL = ROOT / 'docs/sources/pm04-20261118/original'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def serialized(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def views(cycle):
    definitions = read(ORIGINAL / 'pm04/PM04_TASKS.json')
    for task, live in zip(definitions['tasks'], cycle['tasks']):
        assert task['id'] == live['id'], 'PM04_TASK_ORDER_CHANGED'
        task['status'] = live['claim_status']
        task['execution_status'] = live['execution_status']
        task['claimed_by'] = live.get('claimed_by', [])
        task['claim_scope'] = live.get('claim_scope', '')
    html = (ORIGINAL / 'pm04/PM04_DASHBOARD.html').read_text(encoding='utf-8')
    html = re.sub(r'(<script type="application/json" id="data">).*?(</script>)',
                  lambda m: m[1] + json.dumps(definitions, ensure_ascii=False).replace('</', '<\\/') + m[2],
                  html, flags=re.S)
    html = html.replace('下方任务都是 <b>建议待认领</b>，不能视为实际分配或验收通过。',
                        '下方领取状态来自本次仓库台账，未领取项仍为建议，不能代队友认领或验收。')
    html = html.replace('${esc(t.priority)} · 待领取', '${esc(t.priority)} · ${esc(t.execution_status)}')
    html = html.replace('建议责任：${esc(t.owner)}',
                        '建议责任：${esc(t.owner)}；实际领取：${esc(t.claimed_by.join("、") || "未领取")}')
    html = html.replace('<small>JT-03 / BE-05 / FE-06</small>', '<small>JT-03</small>')
    html = html.replace('<small>QA-07</small>', '<small>QA-07 / PM-04 / BE-05 / FE-06</small>')
    html = html.replace('<div class="links"><a href="https://github.com/Bill-Billion/jingjing/pull/40">',
                        '<div class="links"><a href="README.md">当前执行入口</a><a href="https://github.com/Bill-Billion/jingjing/pull/40">', 1)
    lines = ['# PM04 当前任务驾驶舱', '',
             '> 本页由 board.json 的 PM04 记录生成；原需求、历史统计和原件保留。', '',
             '[执行入口](README.md) · [计划](PM04_PLAN.md) · [原需求冻结](PM04_REQUIREMENTS_FREEZE_20261118.md)', '',
             '|任务|阶段|建议负责人|实际领取|执行状态|', '|---|---|---|---|---|']
    for task in cycle['tasks']:
        lines.append('|{}|{}|{}|{}|{}|'.format(task['id'], task['phase'], task['owner_suggested'],
                     '、'.join(task.get('claimed_by', [])) or '待本人领取', task['execution_status']))
    lines += ['', '共同节奏：独立开发、集中交付，再固定双方版本整批联测，最后维护者实际审阅。', '',
              'G0 尚未通过；G1 有局部历史证据；G2 原151条含后置未成年人专项必须全覆盖；G3 发布 NO-GO。', '',
              'PR40历史：App 1155通过/74失败/1跳过；18组0/18、12整链部分、151条19/124/8不变。', '',
              'JT-03 的本侧领取仅限后端准备，不代表前端认领或已开展新整批联测。', '',
              '更新领取：本人修改 board.json#pm04_cycle_20261118，再运行 python scripts/pm04_check.py --render。', '']
    return {'PM04_CYCLE.json': serialized(cycle), 'PM04_TASKS.json': serialized(definitions),
            'PM04_DASHBOARD.html': html, 'PM04_DASHBOARD.md': '\n'.join(lines)}


def main(render=False):
    board = read(ROOT / 'docs/tasks/board.json')
    cycle = board['pm04_cycle_20261118']
    source = read(ORIGINAL / 'pm04/PM04_CYCLE.json')
    assert cycle['snapshot'] == source['snapshot'], 'HISTORICAL_SNAPSHOT_CHANGED'
    assert cycle['task_ids'] == source['task_ids'], 'ORIGINAL_TASK_IDS_CHANGED'
    assert len(cycle['tasks']) == 8 and len(board['tasks']) == 159, 'TASK_COUNT_CHANGED'
    assert board['pm03_joint_20261118']['app_complete'] == {'passed':1155,'failed':74,'skipped':1,'exit_code':1}
    for task, old in zip(cycle['tasks'], source['tasks']):
        for key in ('id', 'title', 'owner_suggested', 'phase', 'priority', 'depends_on', 'output'):
            assert task[key] == old[key], f'ORIGINAL_TASK_DEFINITION_CHANGED: {task["id"]}/{key}'
        assert task['claim_status'] != 'UNCLAIMED' or not task.get('claimed_by'), 'UNCLAIMED_WITH_OWNER'
        if task['id'] in ('PM04-PM-04','PM04-BE-05','PM04-FE-06'):
            assert task['execution_status'] == 'NOT_STARTED_REQUIRED_DEFERRED', 'DEFERRED_SCOPE_CHANGED'
    manifest = read(ORIGINAL / 'MANIFEST.json')
    for item in manifest['files']:
        raw = (ORIGINAL / item['path']).read_bytes()
        assert len(raw) == item['bytes'] and hashlib.sha256(raw).hexdigest() == item['sha256'], item['path']
    for name, content in views(cycle).items():
        path = PM / name
        if render:
            path.write_text(content, encoding='utf-8', newline='\n')
        assert path.read_text(encoding='utf-8') == content, 'STALE_PM04_VIEW: ' + name
    print(json.dumps({'result':'PASS','original_files':len(manifest['files']),
                      'historical_tasks':len(board['tasks']),'pm04_tasks':8,'application_tests':'NOT_RUN'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--render', action='store_true')
    main(parser.parse_args().render)
