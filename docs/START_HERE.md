# 从这里开始：指定版本已可开始集中测试

先看[集中测试操作单](testing/JOINT_TEST_20261022.md)，再看[本侧进度](status/CORE_CURRENT.md)、[队友进度](status/EXPERIENCE_CURRENT.md)及[远端核验](tasks/records/CORE-v5-remote-readiness-20261021.md)。

测试后端是core/v5-privacy-protection的6a7c6bb，页面是core/v5-r02-page-clarity的7d4668f，包含队友PR26/888a649和本侧文案修正。两侧独立运行，已用同一隔离数据库实际复验前两轮流程；不需要再拼接旧后端。后端PR27四项检查全部成功，队友PR26六项成功；本机服务现已关闭，开始测试时重新生成账号和数据。

可以先共同测试故事→补件→报价复核→未付款订单，再接人物/受托和制作交付。真实付款、OSS、云服务与原生手机另行核验。PR27仍为草稿、未经过实际批准审阅，integration仍28662ab；不要只拉integration就以为取得了最新成果。

[新接口页面接法](collaboration/V5_PRIVACY_HANDOFF.md)；[本轮开发证据](testing/evidence/v5-test-readiness-20261021/README.md)；[主线历史](status/MAINLINE_PROGRESS.md)。本次状态记录只在本地保存，按阶段同步。
