# 晶晶日上 / 晶选片场

这是双方共同开发项目的仓库。按最新R0.6方案推进，原始材料保留；功能“写完”“测过”“正式能用”分别说明。

第11份账号与机构、第12份合同与历史规则页面已进入共同版本，第12份的8项远端检查均通过。[第一批页面](docs/ux/pr12-ui/README.md) · [第一批界面验收](docs/ux/pr12-ui/design-qa.md)。页面通过测试与正式外部服务开通分别记录。

第13份对应的作者与作品资料页面已完成本地开发与联调：App与网页可申请作者资格、上传私有正文和证明、保存作品及新修订、提交与带理由撤回；网页分别审核供给资格、权属和内容。沿用暖白App和浅色深绿工作台，保留旧稿和旧意见，新稿不继承批准。[本批交付与截图](docs/ux/pr13-ui/README.md) · [界面验收](design-qa.md) · [本轮任务记录](docs/tasks/records/UX-PR13-SUPPLY-PAGES-20260929.md)。Vue供给18组、Flutter供给21项、后端供给35项及实际接口检查通过。前端提交`81a9727`与原后端统一通过[第13份申请](https://github.com/Bill-Billion/jingjing/pull/13)交付；最终交付版本`7abafab`的8项远端检查全部通过，用户已于2026-09-30将第13份合入`integration/90cb6a9`；尚未部署。正式存储和原生安装包仍待验收。

第14份对应的选本、许可办理、项目绑定和受控阅读前端已在 `ux/pr14-pages` 本地完成：App接目录、预留、历史合同、私有材料、许可与项目；网页增加商品审核、外部证据核验、发放与暂停、指定阅稿授权，两端可从有效绑定提交项目改稿。继续采用暖白App和浅色深绿工作台，新旧入口共用稳定导航。[本批交付与预览](docs/ux/pr14-ui/README.md) · [固定页面方案](docs/ux/pr14-ui/page-plan.md) · [验证记录](docs/ux/pr14-ui/ui-checks.md)。当前明确引入第14份后端 `ce576af`，本阶段功能、原图册样式和底部切换已按用户授权追加到[原第14份申请](https://github.com/Bill-Billion/jingjing/pull/14)，待审阅合入，未部署；最新远端检查以申请当前版本为准。[本轮交付与审查](docs/ux/pr14-ui/delivery-review-20261002.md)。第15–17份分支保持原状，真机测试已按用户要求取消。

所有页面的视觉基准固定为已确认原图册 `acd5f99`，按manifest最终修订图核对结构、字体、间距、控件和导航。[全页面实现标准](docs/ux/gallery-implementation-standard.md) · [已开发页面与原图对应](docs/ux/gallery-page-map.md) · [共用视觉参数](docs/ux/gallery-visual-system.json)。第11–14份已开发两端已按该基准统一布局和控件，[逐页实拍与适配说明](docs/ux/pr14-ui/style-qa.md)单独留档；尚未开放业务随后续阶段接入，不把172张参考图写成172个业务页面已完成。

日常只需先看这三份：

- [我们各自做什么，现在从哪里开始](docs/collaboration/TEAM_ONBOARDING.md)
- [现在做到哪里，下一步做什么](docs/status/MAINLINE_PROGRESS.md)
- [全部工作安排及完成标准](docs/tasks/README.md)

页面整合遵守[导航与新版页面验收](docs/ux/navigation-acceptance.md)：网页工作区保持同一套菜单，App顶层固定首页、入戏、培育、成角、我的；正式入口不跳回旧版。尚未开放的业务按阶段接入，最终所有页面按最新规划和已确认图册替换，菜单和路由检查属于每批验收的一部分。

2026-09-30现场审查发现的菜单消失与APP旧版绕行已在当前工作分支本地修复，并完成[逐项点击与截图](docs/ux/pr13-ui/README.md#现场导航问题与修复2026-09-30)；这批新增修改已按用户授权追加到[第13份申请](https://github.com/Bill-Billion/jingjing/pull/13)，最终版本已随第13份进入共同版本`integration/90cb6a9`，8项远端检查全部通过。第14份页面当前已本地接入；第15–17份业务页面按各自阶段接入真实接口。

交给Codex执行时，从 [开工说明](docs/START_HERE.md) 和 [项目指令](AGENTS.md) 开始。两个Codex也必须用直白中文汇报，不能让人先翻译缩写才能看懂分工。

需要查细节时： [需求清单](docs/requirements/README.md) · [业务与技术设计](docs/architecture/TARGET_DESIGN.md) · [尚缺的外部条件](docs/operations/EXTERNAL_READINESS.md) · [上传和合并代码的方法](docs/collaboration/GIT_WORKFLOW.md) · [原始资料](docs/sources/README.md)。

代码继续放在 [工程交接包](晶晶日上工程交接包/01_源码)，没有移动。旧README保存在[历史记录](docs/history/README_20260918.md)。

技术补充：共同开发版本叫integration；各自在自己的任务分支工作。main只保留经过关键检查的版本，不能直接上传覆盖。文档检查命令是 `python scripts/collaboration_check.py`，只检查资料和任务记录，不代表App通过测试。
