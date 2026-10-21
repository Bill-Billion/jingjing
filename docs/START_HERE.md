# 本轮从安卓模拟测试开始

当前目录worktrees/android-test、分支core/v5-android-functional-test。[本轮结果及人工操作说明](testing/ANDROID_LOCAL_TEST_20261021.md)，[当前状态和分工](status/CORE_CURRENT.md)。用户已授权本侧配置、测试、修复并记录，随后双方人工测试。旧阶段的合入记录如下，不代表本批已上传。

---

> 合并后补记：已核实PR28合入integration/5fba043。下一阶段双方从共同分支开始人工测试。该核验补记本地保存，远端实际交付状态同时见PR28说明。

> 本轮集中交付：[PR28](https://github.com/Bill-Billion/jingjing/pull/28)。本文件记录随代码上传时的验证结果；实际合并状态以该申请及远端integration为准。申请合入后双方从integration继续，不再拼分支。人工测试与正式上线仍未完成。

# 从这里开始：前后端统一版本的集中测试

当前目录worktrees/joint-test，分支core/v5-joint-functional-test；本侧已经按用户授权拉取前端，整合后端，实际测试并修复。先看[测试结果、问题清单及人工下一步](testing/JOINT_FUNCTIONAL_TEST_20261021.md)，再看[本侧状态](status/CORE_CURRENT.md)和[队友状态](status/EXPERIENCE_CURRENT.md)。上传和合并的最新核验在本侧状态中。

本次包括队友PR24/26以及最新后端完整依赖。上一版要求分别拼接前后端的做法已被这个统一版本替代。人工测试仍在下一阶段；真实支付、OSS及原生安卓未验，后续V5新页面仍有缺口。

[如何重建测试资料](testing/JOINT_TEST_20261022.md)；[主线历史](status/MAINLINE_PROGRESS.md)。本次不部署、不启用真实外部服务、不上传口令或临时数据库。
