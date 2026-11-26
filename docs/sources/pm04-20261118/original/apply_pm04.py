#!/usr/bin/env python3
"""Apply PM04 planning package in a dedicated checked-out Git branch. No network, git commits, merges or deploys.
Usage: python3 apply_pm04.py /path/to/jingjing
"""
from pathlib import Path
import json,sys,subprocess

def main(root):
    root=Path(root).resolve()
    if not (root/'docs/tasks/board.json').is_file() or not (root/'AGENTS.md').is_file():
        raise SystemExit('拒绝：这不是包含原任务台账的jingjing仓库根目录。')
    git=subprocess.run(['git','-C',str(root),'branch','--show-current'],capture_output=True,text=True)
    if git.returncode:
        raise SystemExit('拒绝：请在Git工作树中执行，不修改无版本仓库。')
    branch=git.stdout.strip()
    if branch in ('main','master','integration','core/pm03-joint-20261118','core/full-business-closure-20261028'):
        raise SystemExit('拒绝在main/integration或现有业务候选分支直接改动，请先建立独立PM04规划分支。')
    status=subprocess.run(['git','-C',str(root),'status','--porcelain'],capture_output=True,text=True)
    if status.stdout.strip():
        raise SystemExit('拒绝：工作区有未提交改动，请先保存，再应用计划。')
    package=Path(__file__).resolve().parent/'pm04'
    tasks=json.loads((package/'PM04_CYCLE.json').read_text(encoding='utf-8'))
    boardfile=root/'docs/tasks/board.json'
    original=boardfile.read_text(encoding='utf-8')
    existing=json.loads(original)
    old=existing.get('pm03_joint_20261118',{})
    if old.get('stage')!='BATCH_TESTING_WITH_OPEN_FAILURES' or old.get('app_complete',{}).get('failed')!=74:
        raise SystemExit('拒绝：旧PM03统计或阶段已改变，请核对PR40最新HEAD和失败清单后再更新计划。')
    if 'pm04_cycle_20261118' in existing:
        if existing['pm04_cycle_20261118']!=tasks:
            raise SystemExit('拒绝：board已有不同版本PM04计划，须先人工合并。')
        board_new=original
    else:
        cut=original.rfind('}')
        if cut<0: raise SystemExit('board.json结构异常')
        prefix=original[:cut].rstrip()
        board_new=prefix+',\n  "pm04_cycle_20261118": '+json.dumps(tasks,ensure_ascii=False,indent=2).replace('\n','\n  ')+'\n}\n'
        check=json.loads(board_new)
        assert check['pm03_joint_20261118']==old
        assert len(check['tasks'])==len(existing['tasks'])
        assert check.get('consumer_protection_20261103')==existing.get('consumer_protection_20261103')
    targets={}
    for f in package.rglob('*'):
        if f.is_file():
            rel=Path('docs/pm04')/f.relative_to(package)
            targets[root/rel]=f.read_text(encoding='utf-8')
    targets[boardfile]=board_new
    marker='<!-- PM04-ENTRY-20261118 -->'
    entries={
      'AGENTS.md':marker+'\n## 2026-11-18 PM04下一工作包（PM03未验收，待领取）\n\n先读 `docs/pm04/PM04_PLAN.md`、`docs/pm04/PM04_REQUIREMENTS_FREEZE_20261118.md`、`docs/pm04/PM04_DASHBOARD.md` 和对应的 `PM04_CORE_CODEX.md` / `PM04_FRONTEND_CODEX.md`。PR40仍草稿；App完整1155/74/1，远端CI不绿，实体机未测。四组W18/W14-W19/W16/W22接续已存在，不重派；原未成年人需求完整保留，BE-05/FE-06后置G2专项，最终全151条签收之前禁止发布；历史监护退款保留。任务一律UNCLAIMED直至各自本人登记。原18组0关闭、12路线部分、151条19/124/8不改；未合并、未部署、不开收费/公网/生产。前端EXPERIENCE_CURRENT由前端本人维护。\n\n',
      'docs/START_HERE.md':marker+'\n# PM04下一轮工作入口（PR40尚未通过）\n\n[PM04执行计划](pm04/PM04_PLAN.md) · [开发驾驶舱](pm04/PM04_DASHBOARD.md) · [离线HTML驾驶舱](pm04/PM04_DASHBOARD.html) · [后端Codex](pm04/PM04_CORE_CODEX.md) · [前端Codex](pm04/PM04_FRONTEND_CODEX.md) · [原需求冻结与未成年人专项](pm04/PM04_REQUIREMENTS_FREEZE_20261118.md)。此为新增待认领的PM04工作包，非PM03验收通过；原内容与计数在下方完整保留。\n\n',
      'docs/tasks/README.md':marker+'\n> **PM04接续**：新任务在 `../pm04/PM04_TASKS.json` 和本任务板 `board.json#pm04_cycle_20261118` 中，均为建议待认领；PR40仍未通过。原159任务及18/12/151验收体系不变，禁止把旧未测页面当未开发新任务。[PM04驾驶舱](../pm04/PM04_DASHBOARD.md)。\n\n',
      'docs/status/MAINLINE_PROGRESS.md':marker+'\n# PM04工作计划入口（不是已验收状态）\n\n本阶段保留此前PM03实际进度，新增 [PM04执行计划](../pm04/PM04_PLAN.md) / [开发驾驶舱](../pm04/PM04_DASHBOARD.md)。截至PR40 HEAD 0786030e，App完整1155/74/1；远端CI失败（依赖准备超时或静态分析失败）；未完成实体机、正式验收或合并部署。原18组0/18、12路线部分、151项19/124/8不变。双方领取任务后才更新各自CURRENT，不能代签。\n\n'
    }
    for name,header in entries.items():
        dest=root/name
        body=dest.read_text(encoding='utf-8')
        targets[dest]=body if marker in body else header+body
    # Validate before any modifications.
    for dest,content in targets.items():
        if dest.exists() and dest.is_relative_to(root/'docs/pm04') and dest.read_text(encoding='utf-8')!=content:
            raise SystemExit(f'拒绝覆盖不同内容的PM04文件：{dest}')
    for dest,content in targets.items():
        dest.parent.mkdir(parents=True,exist_ok=True)
        if not dest.exists() or dest.read_text(encoding='utf-8')!=content:
            dest.write_text(content,encoding='utf-8')
            print('UPDATED',dest.relative_to(root))
    print('PM04计划已在当前本地分支写入；尚未git commit/push/创建Issue/部署。请检查git diff及原始数据。')
if __name__=='__main__':
    main(sys.argv[1] if len(sys.argv)>1 else '.')
