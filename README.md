# 晶晶日上 / 晶选片场

当前执行基线：**JX-R06-EXECUTION-BASELINE-20260921**。R0.6汇总历次需求并确定工程执行方式，业务范围继承R0.3。代码实现和商业启用分别验收。

**新成员及 Codex 从 [统一入口](docs/START_HERE.md) 开始。协作开发使用 `integration`，任务分支使用 `core/*` 或 `ux/*`，`main` 保留关键检查点版本。**

- [当前任务与认领](docs/tasks/README.md) · [Core状态](docs/status/CORE_CURRENT.md) · [Experience状态](docs/status/EXPERIENCE_CURRENT.md)
- [队友同步步骤](docs/collaboration/TEAM_ONBOARDING.md) · [Git协作](docs/collaboration/GIT_WORKFLOW.md) · [根指令](AGENTS.md)
- [60项需求](docs/requirements/README.md) · [目标架构](docs/architecture/TARGET_DESIGN.md) · [外部条件](docs/operations/EXTERNAL_READINESS.md)
- [原始R0.6](docs/baselines/r06/00_START_HERE.md) · [历史材料索引](docs/sources/README.md)

现有代码仍在 [工程交接包](晶晶日上工程交接包/01_源码)，本次不重命名源码目录。旧README作为[2026-09-18历史快照](docs/history/README_20260918.md)原样保留，其中实现/上线声明须结合代码证据核对。

文档与协作台账校验：`python scripts/collaboration_check.py`。这不是App测试、MySQL验收或上线验收。
