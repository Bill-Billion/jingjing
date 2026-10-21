# 当前入口：新版前端与已有后端一起重测

本侧目录worktrees/android-test，集中入口PR29，吸收队友PR30/273d0d0。先看[本轮计划](testing/EDITORIAL_MERGE_20261021.md)和[当前进展](status/CORE_CURRENT.md)；下方为双方此前交付记录。

---

# 本轮从安卓模拟测试开始

当前目录worktrees/android-test、分支core/v5-android-functional-test。[本轮结果及人工操作说明](testing/ANDROID_LOCAL_TEST_20261021.md)，[当前状态和分工](status/CORE_CURRENT.md)。用户已授权本侧配置、测试、修复并记录，随后双方人工测试。本批已集中上传[PR29](https://github.com/Bill-Billion/jingjing/pull/29)，待实际审阅；旧阶段合入记录如下，不代表本批已合入。

---

> 合并后补记：已核实PR28合入integration/5fba043。下一阶段双方从共同分支开始人工测试。该核验补记本地保存，远端实际交付状态同时见PR28说明。

> 本轮集中交付：[PR28](https://github.com/Bill-Billion/jingjing/pull/28)。本文件记录随代码上传时的验证结果；实际合并状态以该申请及远端integration为准。申请合入后双方从integration继续，不再拼分支。人工测试与正式上线仍未完成。
# 从这里开始：前两轮视觉修正，再接第三轮人物业务

当前前端分支ux/v5-r01-r02-editorial，起点integration/5fba043。用户2026-10-21明确要求按“先锋电影刊物”原设计修正前两轮已做页面；本机实现、功能回归和逐页视觉检查已通过，正在集中交付远端。

- [打开原设计、修正前后和逐页截图](testing/evidence/v5-editorial/index.html)；[验收说明与技术结果](testing/evidence/v5-editorial/README.md)。
- [前端当前状态](status/EXPERIENCE_CURRENT.md)、[本轮任务](tasks/records/UX-v5-r01-r02-editorial-20261021.md)、[主线进展](status/MAINLINE_PROGRESS.md)。
- 第三轮按[人物与机构受托交接](collaboration/V5_R03_HANDOFF.md)继续，当前共同版本已含真实接口；其中旧分支起点说明是历史，不再自行拼未审分支。第三轮未开始实施，不把已有供给/剧本许可页面算成新人物页面。

PR24/26已关闭，其代码通过[PR28](https://github.com/Bill-Billion/jingjing/pull/28)进入共同版本。本轮保留队友文案、元输入及后端整合。双方人工测试操作仍见[共同功能测试](testing/JOINT_FUNCTIONAL_TEST_20261021.md)，Core状态见[本侧状态](status/CORE_CURRENT.md)。本轮不推main、不部署，真实手机和外部服务单列。
