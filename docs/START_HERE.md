# 从这里开始

2026-09-24：当前第三阶段已完成后端自验，完整入口见[第三阶段交付](collaboration/STAGE_3_HANDOFF.md)；实际推送、远端检查和审阅状态见[服务器进度](status/CORE_CURRENT.md)。第11份仍为前置，不得自行合并。

## 历史入口记录

2026-09-24：第三阶段本地已经接通规则/合同只读HTTP，并明确依赖待审第11份登录代码。当前进度以[服务器进度](status/CORE_CURRENT.md)和[读取说明](collaboration/STAGE_3_READ_API.md)为准；下方旧状态保留历史。

2026-09-23接线更新：为实际验证读取接口，本地合入第11份申请d2e6c93作为待审依赖。共同版本仍7d139ff，申请未获审阅/合并，不推送或自行合入。下方“不包含第11份”的描述为此前独立开发记录。

当前本地分支为core/stage-3-rule-snapshots，直接基于共同版本7d139ff；账号接口仍在待审第11份申请中，本分支暂不包含它。最新安排见[服务器进度](status/CORE_CURRENT.md)与[第三阶段计划](collaboration/STAGE_3_RULE_SNAPSHOTS.md)。下方保留前期入口。

**当前规则已更新（2026-09-22）：按[阶段计划](collaboration/STAGED_DELIVERY.md)集中推送和合并，不再逐任务上传。第4份申请此前已合并，其余8份关闭未合并；第9份不再是开放的合并入口。已有代码与历史证据保留，下面此前申请及上传记录不能当作当前操作指令。阶段流程和双方分工随第一阶段集中交付，实际上传状态见服务器当前进度，不代表队友已确认。**

最新同步方式见[一个入口获取与继续开发](collaboration/REVIEW_AND_HANDOFF.md)。原分项申请保留历史，当前改从统一待审分支获取；第一阶段已合入，当前第二阶段新增账号接口及限制见[账号API说明](collaboration/STAGE_2_ACCOUNT_API.md)。

先看 [双方分工](collaboration/TEAM_ONBOARDING.md) 和 [当前进度与下一步](status/MAINLINE_PROGRESS.md)，不需要先记任务编号。完整工作和完成标准在 [任务安排](tasks/README.md)。

给接手的Codex：

1. 先读仓库根 [项目指令](../AGENTS.md)，严格遵守直白中文写法。查看当前代码版本和已有修改，保留原有文件。
2. 确认自己负责服务器还是App/网页，读相应 [服务器进度](status/CORE_CURRENT.md) 或 [App和网页进度](status/EXPERIENCE_CURRENT.md)，检查有无别人已接手同一项任务。
3. 结合任务阅读 [当前设计](architecture/TARGET_DESIGN.md)、[需求依据](requirements/README.md) 和 [外部条件](operations/EXTERNAL_READINESS.md)。原始R0.6的架构、分工和执行规则从 [方案入口](baselines/r06/00_START_HERE.md) 查阅；不能只看摘要就声称读懂所有来源。
4. 先登记自己的任务，再修改自己负责的代码；涉及双方共用的重要规则，要由另一方检查后再加入共同版本。具体操作见 [协作方法](collaboration/GIT_WORKFLOW.md)。

当前依据是2026-09-21收到的R0.6方案，业务范围继承R0.3。第一版工程、会前材料、会后意见和后续需求都保留，原始材料在 [来源目录](sources/README.md)。旧报告“只整理、不开发”的限制已被用户后续开工要求替代。

目前已开展基础代码建设，但还没有完成整个产品。历史材料检查见 [最初整理记录](tasks/records/CORE-S0-000.md)，各项实际代码和测试以当前进度列出的提交为准。
