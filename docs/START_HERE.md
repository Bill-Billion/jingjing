# 从这里开始：前后端统一版本的集中测试

当前目录worktrees/joint-test，分支core/v5-joint-functional-test；本侧已经按用户授权拉取前端，整合后端，实际测试并修复。先看[测试结果、问题清单及人工下一步](testing/JOINT_FUNCTIONAL_TEST_20261021.md)，再看[本侧状态](status/CORE_CURRENT.md)和[队友状态](status/EXPERIENCE_CURRENT.md)。上传和合并的最新核验在本侧状态中。

本次包括队友PR24/26以及最新后端完整依赖。上一版要求分别拼接前后端的做法已被这个统一版本替代。人工测试仍在下一阶段；真实支付、OSS及原生安卓未验，后续V5新页面仍有缺口。

[如何重建测试资料](testing/JOINT_TEST_20261022.md)；[主线历史](status/MAINLINE_PROGRESS.md)。本次不部署、不启用真实外部服务、不上传口令或临时数据库。
