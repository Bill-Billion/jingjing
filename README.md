# 晶晶日上 / 晶选片场

这是双方共同开发项目的仓库。按最新R0.6方案推进，原始材料保留；功能“写完”“测过”“正式能用”分别说明。

当前先看[第一阶段交付：分工、获取代码与验收方法](docs/collaboration/STAGE_1_HANDOFF.md)。开发分支为core/stage-1-foundation-handoff；合入前默认main不会自动获得这些材料。

日常只需先看这三份：

- [我们各自做什么，现在从哪里开始](docs/collaboration/TEAM_ONBOARDING.md)
- [现在做到哪里，下一步做什么](docs/status/MAINLINE_PROGRESS.md)
- [全部工作安排及完成标准](docs/tasks/README.md)

交给Codex执行时，从 [开工说明](docs/START_HERE.md) 和 [项目指令](AGENTS.md) 开始。两个Codex也必须用直白中文汇报，不能让人先翻译缩写才能看懂分工。

需要查细节时： [需求清单](docs/requirements/README.md) · [业务与技术设计](docs/architecture/TARGET_DESIGN.md) · [尚缺的外部条件](docs/operations/EXTERNAL_READINESS.md) · [上传和合并代码的方法](docs/collaboration/GIT_WORKFLOW.md) · [原始资料](docs/sources/README.md)。

代码继续放在 [工程交接包](晶晶日上工程交接包/01_源码)，没有移动。旧README保存在[历史记录](docs/history/README_20260918.md)。

技术补充：共同开发版本叫integration；各自在自己的任务分支工作。main只保留经过关键检查的版本，不能直接上传覆盖。文档检查命令是 `python scripts/collaboration_check.py`，只检查资料和任务记录，不代表App通过测试。
