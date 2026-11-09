"""Render the acceptance inventory from the authoritative register. Never promotes status."""
import argparse
from collections import Counter
from pathlib import Path
from full_business_check import ROOT, REGISTER, SOURCE, read, validate

OUTPUT = 'docs/collaboration/client-complete-20261028/ACCEPTANCE_PROGRESS_20261109.md'
LABELS = {'PASS': '单条已通过', 'PARTIAL': '部分验证', 'NOT_RUN': '未登记足够证据', 'BLOCKED': '明确受阻', 'NOT_APPLICABLE': '已批准不适用'}
CASE_LABELS = {'normal': '正常办理', 'reverse': '失败分支', 'unauthorized': '越权', 'duplicate': '重复提交', 'state_change': '状态变化', 'recovery': '中断恢复'}

def cell(value):
    return str(value).replace('|', '／').replace('\n', '<br>')

def render(data, board):
    items = data['items'] + data['supplemental_items']
    counts = Counter(i['status'] for i in items)
    lines = ['# 验收做到哪里：151条明细和双方下一步', '',
             '此表由验收登记生成；不将测试个数当功能数，不把未登记证据当未开发。来源条款和已批准更新都保留，不能通过修改标准凑通过。', '',
             f"当前151条：单条通过 **{counts['PASS']}**，部分验证 **{counts['PARTIAL']}**，未登记足够证据 **{counts['NOT_RUN']}**，明确受阻 **{counts['BLOCKED']}**。这不是开发完成率。", '',
             '单条通过只覆盖该条登记的端和场景；接口条款通过不等于App页面通过。完整交付还需18组双方交付与共享规则实审、12条同版本同记录整链，以及固定包和上线条件。', '',
             '## 原18组任务的关联验收进展', '',
             '同一条标准可能关联多个组，下表不能相加成总条数。整组关闭还须检查双方实现、交付、独立审阅和同版定版，下面不自动代批。', '',
             '|组|工作|关联标准|已通过|部分验证|尚无足够登记|双方交付状态|', '|---|---|---:|---:|---:|---:|---|']
    tasks = {t['id']: t for t in board['tasks']}
    for n in range(1, 19):
        ids = [f'{side}-CLIENT-COMPLETE-{n:02}' for side in ('CORE','UX')]
        related = [i for i in items if set(ids) & set(i['task_refs'])]
        c = Counter(i['status'] for i in related)
        title = tasks[ids[0]].get('title', '')
        states = {'IN_REVIEW': '交付待审', 'DONE': '已结束', 'IN_PROGRESS': '进行中', 'CLAIMED': '已认领', 'READY': '可开始', 'TODO': '待办', 'PLANNED': '已规划', 'BLOCKED': '受阻', 'PENDING': '待审', 'APPROVED': '已审通过', 'NOT_REQUIRED': '无需此项审阅'}
        state = '；'.join(f"{name}：{states.get(tasks[tid].get('status'), '状态待核')}／{states.get(tasks[tid].get('review_status'), '审阅待核')}" for name, tid in zip(('后端','前端'),ids))
        lines.append(f"|{n}|{cell(title)}|{len(related)}|{c['PASS']}|{c['PARTIAL']}|{c['NOT_RUN']}|{cell(state)}|")
    lines += ['', '## 12条完整办理路线', '',
              '每条需api、app、web三个端的正常、失败、越权、重复、状态变化、恢复，共18种端与场景组合；正常路径还需同一业务记录跨角色办理。已有片段保留，不要求重复开发；缺的证据由主办人汇集、补测，发现缺陷再修。', '',
              '|路线|当前有效办理内容|状态|主办人|下一步|', '|---|---|---|---|---|']
    for i in items:
        if not i['id'].startswith('E2E-'): continue
        n = int(i['id'][-2:]); owner = 'chengcongcong222' if n in (1,2,4,10,11,12) else 'Bill-Billion'
        expected = i.get('effective_expected', i.get('source_expected', ''))
        lines.append(f"|{i['id']}|原路线：{cell(i['work'])}<br>当前有效预期：{cell(expected)}|{LABELS[i['status']]}|{owner}|汇集现有原生/网页/接口证据；补缺的端和逆向；统一版本、资料与记录号后结案|")
    lines += ['', '## 151条逐项清单', '',
              '通过项查看正式报告；其余按有效预期补证。部分验证的证据范围不一定覆盖整条，不从文件名推断通过。未登记足够证据的条目先核已有代码和历史测试，不能直接转成新开发任务。', '',
              '|标准|工作及当前有效预期|状态|所需端与场景|现有证据|下一步|', '|---|---|---|---|---|---|']
    for i in items:
        expected = i.get('effective_expected', i.get('source_expected', i.get('expected', '')))
        refs = [r['path'] for r in i.get('evidence', [])]
        refs += [r['artifact']['path'] for r in i.get('partial_evidence', [])]
        refs = list(dict.fromkeys(refs))
        links = '<br>'.join(f"[证据{n+1}](../../../{ref})" for n, ref in enumerate(refs)) or '尚无合格登记'
        requirement = '、'.join(i['required_surfaces']) + ' × ' + '、'.join(CASE_LABELS.get(c,c) for c in i['required_cases'])
        follow = '单条范围已验；保留至组合版本复核，不自动关闭整组' if i['status'] == 'PASS' else ('按有效预期核现有证据，补齐所列端与场景；同版后登记结果' if refs else '先核已有实现/历史检查；补登记或测试；确有缺口再开发')
        lines.append(f"|{i['id']}|{cell(i.get('work', ''))}<br>{cell(expected)}|{LABELS[i['status']]}|{cell(requirement)}|{links}|{follow}|")
    return '\n'.join(lines) + '\n'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data, board, source = read(ROOT, REGISTER), read(ROOT, 'docs/tasks/board.json'), read(ROOT, SOURCE)
    errors = validate(ROOT, data, board, source)
    if errors: raise SystemExit('Invalid register: ' + '; '.join(errors))
    text = render(data, board)
    path = ROOT / OUTPUT
    if args.check:
        if not path.exists() or path.read_text(encoding='utf-8') != text:
            raise SystemExit('Acceptance progress stale; run python scripts/acceptance_progress.py')
        print('Acceptance progress matches all 151 entries.')
    else:
        path.write_text(text, encoding='utf-8')
        print(OUTPUT)

if __name__ == '__main__':
    main()
