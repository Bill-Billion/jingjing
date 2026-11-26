# 晶晶日上 PM04 v1.1 需求冻结与驾驶舱离线交付包

**生成日期：2026-11-18。来源：GitHub PR #40及本轮读取的CI日志。** GitHub连接的写操作（新建分支和Issue）返回403，所以这个包**未上传仓库、未创建任何Issue、未修改远端**。本文给双方Codex一套可直接执行的本地更新方案。

## 文件

- `pm04/PM04_PLAN.md`：审查结论、下一轮Gate、建议任务与验收门槛。
- `pm04/PM04_DASHBOARD.html`：本地双击可浏览的响应式驾驶舱（带负责人筛选和复制认领模板）；`PM04_DASHBOARD.md` 为GitHub可阅读版。
- `pm04/PM04_TASKS.json` / `PM04_CYCLE.json`：结构化任务和真实历史统计，所有任务UNCLAIMED。
- `pm04/PM04_CORE_CODEX.md`、`PM04_FRONTEND_CODEX.md`：双端直接交接提示。
- `pm04/PM04_REQUIREMENTS_FREEZE_20261118.md`：**用户确认原需求不变、未成年人后置且最终必须覆盖**的正式执行增量。`PM04_MINORS_POLICY_DECISION.md` 为不再改变商业边界的索引。
- `pm04/issues/*.md`：8个GitHub Issue现成草稿，**未创建**。
- `apply_pm04.py`：只在克隆仓库的独立分支更新 `docs/tasks/board.json`、`AGENTS.md`、`docs/START_HERE.md`、`docs/tasks/README.md`、`docs/status/MAINLINE_PROGRESS.md` 并复制 `docs/pm04/`。不会Git commit、push或部署，也不修改前端 `EXPERIENCE_CURRENT`。

## 由拥有GitHub写权限的本机/ Codex执行

```bash
git fetch origin core/pm03-joint-20261118
git switch -c pm/pm04-acceptance-20261118 origin/core/pm03-joint-20261118
python3 /path/to/unpacked-package/apply_pm04.py .
git diff --check
git diff --stat
# 实际检查后：
git add AGENTS.md docs/START_HERE.md docs/tasks/README.md docs/tasks/board.json docs/status/MAINLINE_PROGRESS.md docs/pm04
git commit -m "docs(pm04): triage PR40 and launch dual-end acceptance gates"
git push -u origin pm/pm04-acceptance-20261118
# 保持草稿PR，目标为PR40联合分支，不擅自合入main/integration
gh pr create --repo Bill-Billion/jingjing --base core/pm03-joint-20261118 --head pm/pm04-acceptance-20261118 --draft --title "PM04 产品审查与双端验收驾驶舱（PR40后继计划）" --body "PM03仍未验收。仅提交计划/驾驶舱/任务增量，不合入、不部署。"
```

如果PR40 HEAD、74项失败或原board状态已改变，脚本会拒绝覆盖，必须先同步新事实并重新生成快照。`git diff --check`和原计数对比通过后再提交。不要在main、integration或原PR40开发分支直接运行。

Issues需要有写权限者按 `pm04/PM04_ISSUES_TO_CREATE.md` 与 `issues/*.md` 单独创建；**即使创建Issue，也不代负责人自动领取或代维护者批准。**

## 双端最小起步

后端Codex先领BE-01（CI日志ffmpeg安装超时），前端Codex先领FE-02（74项失败与analyzer），双方平行准备JT-03关键同记录联测。**原未成年人需求已由用户明确冻结，PM-04/BE-05/FE-06为G2必交后置项，且不得延后实际安全漏洞修复；最后151条未全覆盖不允许发布。**历史W18监护退款保留。
