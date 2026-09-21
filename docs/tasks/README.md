# Stage 0–6任务与认领

机器台账：[board.json](board.json)。修改JSON后运行 `python scripts/collaboration_check.py --render`，再运行不带参数的校验。

30项是执行任务组，后续可拆成更小任务；详细交付、验收、REQ、依赖和共享边界均在JSON。旧14个WORK用于可追溯映射，旧人时仅预算参考，不用旧周数或每阶段外部批准限制推进。

**依赖是整项验收依赖。** Experience可以在对应契约合入integration后先开发隔离stub；不必等Core整个任务实现结束。双方按契约切片并行，禁止production fallback。

认领只代表任务归属；完成还需测试/证据/状态更新和集成。共享边界必须真实跨流review。其他59项业务需求不因文档初始化完成而标为验收通过。

|Task|Stage|流|内容|状态|Owner|依赖|
|---|---|---|---|---|---|---|
|CORE-S0-000|0|Core|R0.6基线入库与协作初始化|DONE|chengcongcong222|—|
|CORE-S0-001|0|Core|OpenAPI 3.1首批契约与共享约定|IN_REVIEW|chengcongcong222|CORE-S0-000|
|CORE-S0-002|0|Core|MySQL 8、异步访问层和迁移runner|IN_REVIEW|chengcongcong222|CORE-S0-000|
|CORE-S0-003|0|Core|SQLite导入与旧事实分类|PLANNED|待本人认领|CORE-S0-002|
|CORE-S0-004|0|Core|模块边界、MySQL jobs/lease/outbox与独立Worker|IN_REVIEW|chengcongcong222|CORE-S0-002|
|CORE-S0-005|0|Core|Provider/OSS/Readiness、日志与health基础|PLANNED|待本人认领|CORE-S0-001, CORE-S0-002|
|CORE-S0-006|0|Core|后端CI与隔离测试入口|PLANNED|待本人认领|CORE-S0-002|
|UX-S0-001|0|Experience|Flutter工具链与现有页面/五入口映射|PLANNED|待本人认领|CORE-S0-000|
|UX-S0-002|0|Experience|Flutter设计系统与UI参考板|PLANNED|待本人认领|UX-S0-001|
|UX-S0-003|0|Experience|单一A/B Web正式工程与设计系统|PLANNED|待本人认领|CORE-S0-000|
|UX-S0-004|0|Experience|契约客户端、登录shell与双端CI|PLANNED|待本人认领|CORE-S0-001, UX-S0-002, UX-S0-003|
|CORE-S1-001|1|Core|Core真实性问题F01–05/07–09/11–13及事实记录F14|PLANNED|待本人认领|CORE-S0-002, CORE-S0-004, CORE-S0-005|
|CORE-S1-002|1|Core|Account/Party/Membership/Capability、权限和审计|PLANNED|待本人认领|CORE-S0-001, CORE-S0-002|
|CORE-S1-003|1|Core|规则/合同/订单快照与Readiness业务门禁|PLANNED|待本人认领|CORE-S1-002, CORE-S0-005|
|UX-S1-001|1|Experience|修复F06 Demo回退、F10 release签名及F14前端事实文档|PLANNED|待本人认领|UX-S0-001|
|UX-S1-002|1|Experience|登录主体切换、五入口、A/B shell与通用状态|PLANNED|待本人认领|UX-S0-004, CORE-S1-002, CORE-S1-003|
|CORE-S2-001|2|Core|数字人/脸声同意、作者供给、Work/Version、证据双审|PLANNED|待本人认领|CORE-S1-002, CORE-S1-003|
|CORE-S2-002|2|Core|许可SKU/Grant/Binding、结构化独家、合同与受控阅读|PLANNED|待本人认领|CORE-S2-001|
|UX-S2-001|2|Experience|授权中心、入驻投稿、作品许可、受控阅读及A/B供给台|PLANNED|待本人认领|UX-S1-002, CORE-S2-001, CORE-S2-002|
|CORE-S3-001|3|Core|Quote/Order/Payment/Alipay/IAP/Refund与旧单兼容|PLANNED|待本人认领|CORE-S2-002, CORE-S1-001|
|CORE-S3-002|3|Core|ProductionTask、数字人Adapter、版本反馈和验收|PLANNED|待本人认领|CORE-S3-001, CORE-S0-004|
|UX-S3-001|3|Experience|定制向导、报价收银、反馈验收及制作/售后台|PLANNED|待本人认领|UX-S2-001, CORE-S3-001, CORE-S3-002|
|CORE-S4-001|4|Core|商单、直接MCN合作、单笔佣金、三榜事实|PLANNED|待本人认领|CORE-S3-001, CORE-S1-002|
|CORE-S4-002|4|Core|项目、角色报名邀约筛选、多方确认及发行台账|PLANNED|待本人认领|CORE-S3-002, CORE-S2-002|
|UX-S4-001|4|Experience|培育/商单/MCN/三榜/成角/项目及发行页面|PLANNED|待本人认领|UX-S3-001, CORE-S4-001, CORE-S4-002|
|CORE-S5-001|5|Core|应付/出款/发行收入/结算/调整/对账与争议|PLANNED|待本人认领|CORE-S4-001, CORE-S4-002|
|CORE-S5-002|5|Core|业务通知、订单/项目评论、报表与运营审计|PLANNED|待本人认领|CORE-S5-001|
|UX-S5-001|5|Experience|A财务/B结算/C本人收入、异议确认与报表|PLANNED|待本人认领|UX-S4-001, CORE-S5-001, CORE-S5-002|
|CORE-S6-001|6|Core|迁移演练/备份恢复/真实Provider/安全负载与runbook|PLANNED|待本人认领|CORE-S5-001, CORE-S5-002, CORE-S0-003, CORE-S0-006|
|UX-S6-001|6|Experience|Android/iOS/Web发布构建、真机适配与商店材料|PLANNED|待本人认领|UX-S5-001, UX-S1-001|

首次Core认领与验证见 [CORE-S0-000记录](records/CORE-S0-000.md)；[Core CURRENT](../status/CORE_CURRENT.md) / [Experience CURRENT](../status/EXPERIENCE_CURRENT.md)。
