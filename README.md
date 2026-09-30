# 晶晶日上 / 晶选片场

这是双方共同开发项目的仓库。按最新R0.6方案推进，原始材料保留；功能“写完”“测过”“正式能用”分别说明。

第11份账号与机构、第12份合同与历史规则页面已进入共同版本，第12份的8项远端检查均通过。[第一批页面](docs/ux/pr12-ui/README.md) · [第一批界面验收](docs/ux/pr12-ui/design-qa.md)。页面通过测试与正式外部服务开通分别记录。

第13份对应的作者与作品资料页面已完成本地开发与联调：App与网页可申请作者资格、上传私有正文和证明、保存作品及新修订、提交与带理由撤回；网页分别审核供给资格、权属和内容。沿用暖白App和浅色深绿工作台，保留旧稿和旧意见，新稿不继承批准。[本批交付与截图](docs/ux/pr13-ui/README.md) · [界面验收](design-qa.md) · [本轮任务记录](docs/tasks/records/UX-PR13-SUPPLY-PAGES-20260929.md)。Vue供给18组、Flutter供给21项、后端供给35项及实际接口检查通过。前端提交`81a9727`与原后端统一通过[第13份申请](https://github.com/Bill-Billion/jingjing/pull/13)交付；最新上传版本及远端检查见申请页，当前待审、未合入或部署。正式存储和原生安装包仍待验收。

日常只需先看这三份：

- [我们各自做什么，现在从哪里开始](docs/collaboration/TEAM_ONBOARDING.md)
- [现在做到哪里，下一步做什么](docs/status/MAINLINE_PROGRESS.md)
- [全部工作安排及完成标准](docs/tasks/README.md)

页面整合遵守[导航与新版页面验收](docs/ux/navigation-acceptance.md)：网页工作区保持同一套菜单，App顶层固定首页、入戏、培育、成角、我的；正式入口不跳回旧版。尚未开放的业务按阶段接入，最终所有页面按最新规划和已确认图册替换，菜单和路由检查属于每批验收的一部分。

2026-09-30现场审查发现的菜单消失与APP旧版绕行已在当前工作分支本地修复，并完成[逐项点击与截图](docs/ux/pr13-ui/README.md#现场导航问题与修复2026-09-30)；这批新增修改已按用户授权追加到[第13份申请](https://github.com/Bill-Billion/jingjing/pull/13)，最新上传版本与自动检查以申请页为准，尚未合入共同版本。第14–17份业务页面仍按各自阶段接入真实接口。

交给Codex执行时，从 [开工说明](docs/START_HERE.md) 和 [项目指令](AGENTS.md) 开始。两个Codex也必须用直白中文汇报，不能让人先翻译缩写才能看懂分工。

需要查细节时： [需求清单](docs/requirements/README.md) · [业务与技术设计](docs/architecture/TARGET_DESIGN.md) · [尚缺的外部条件](docs/operations/EXTERNAL_READINESS.md) · [上传和合并代码的方法](docs/collaboration/GIT_WORKFLOW.md) · [原始资料](docs/sources/README.md)。

代码继续放在 [工程交接包](晶晶日上工程交接包/01_源码)，没有移动。旧README保存在[历史记录](docs/history/README_20260918.md)。

技术补充：共同开发版本叫integration；各自在自己的任务分支工作。main只保留经过关键检查的版本，不能直接上传覆盖。文档检查命令是 `python scripts/collaboration_check.py`，只检查资料和任务记录，不代表App通过测试。
