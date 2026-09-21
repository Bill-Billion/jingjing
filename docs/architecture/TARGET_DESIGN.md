# 当前目标设计（R0.6）

本文件是当前决策入口；业务实体/流程详见 [R0.3设计原件](../baselines/r03/intake_reports/03_TARGET_DESIGN.md)，R0.6技术裁定见 [最终架构](../baselines/r06/01_FINAL_ARCHITECTURE.md)。两者有执行差异时按下列明确覆盖项，不改写历史原件。

|方面|当前决定|实现事实|
|---|---|---|
|三端|C Flutter；A运营/B合作方单一Vue3+TS+Vite+Router+Pinia+Element Plus|Flutter旧工程存在；独立A/B Web尚未建立|
|数据|MySQL8/InnoDB，正式优先托管；SQLite仅旧库来源/隔离测试；媒体入私有OSS|CORE-S0-002异步MySQL基础已在隔离8.4.11自验；旧业务路由和真实旧数据尚未迁移，待跨流评审|
|后端|Node/Express JavaScript模块化单体，async repository/service、mysql2/promise；独立Worker|已形成异步连接/事务/迁移基础候选；旧同步路由和独立Worker仍待改造|
|队列|MySQL jobs/lease/outbox；API与Worker进程分开；不用Redis/BullMQ/Kafka/ES/微服务|原scheduler不能视为持久任务实现|
|契约|REST + OpenAPI3.1；金额minor/currency、request_id、idempotency_key、object_version、actor/acting_party、current_status/allowed_actions|canonical `contracts/openapi.yaml`尚未创建；历史接口不能标作R0.6契约|
|生产形态|Nginx+API/Worker pm2+Web静态资源+托管MySQL+OSS；本地CI可Docker|本次不部署，不宣称容量/可用性已验证|

模块：identity / party / avatar / rights / works / licensing / commerce / production / gigs / projects / release / settlement / governance / providers。数据库事务边界与幂等应随契约和状态迁移评审；媒体及大文件不入事务表。

业务主线：Account → 个人/机构Party与多Capability → 数字人脸声授权、Work/Version与权利证据 → LicenseSKU → Grant → ProjectBinding → 改稿与制作版本 → 最终成片/验收 → 符合用途的项目/发行 → 应付及真实收入对账。独家、地域、期限、用途分开；受控阅读不授予制作权。

三类钱独立：客户交易款、供给应付款、发行后项目收入。没有真实成功回调/查单不得置已付。自动多方出款未验证时，真实财务线下付款并附凭证是允许的运营路径；仍需应付、审批、付款方式、凭证、对账、冲正，不把它记成自动Provider成功。

电子签未选型时，真实外部/线下签署PDF及对应主体、签署证据可归档；平台电子签Readiness仍按真实接入状态记录。登记/公证仅为外部证据，不建代办收费/发证产品。

Provider覆盖Identity/Payment/ObjectStorage/Moderation/DigitalHuman/ESign，状态为NOT_IMPLEMENTED、IMPLEMENTED、CONFIGURED、SANDBOX_VERIFIED、PRODUCTION_VERIFIED、WAITING_PROVIDER_APPROVAL、DISABLED_BY_PRODUCT。按能力/环境保存证据，等待/停用不抹掉历史验证；每次业务启用匹配实际所用路径。

规则版本、合同快照和历史订单承诺强制保留。三档与2分钟旗舰仅作为待明确商品规格线索，未知价格/时长/次数不作为生产默认；REQ-060不阻断基础开发。

明确排除：通用竞拍、多层分销、独立版权交易所、独立高额阅稿商品、登记公证代办、通用IM。保留直接MCN/经纪关系和单笔佣金，成角报名/邀请/筛选/固定价或报价/最终确认；通知与订单/项目内评论。

连续推进按Stage 0–6依赖，不按旧周数限制Codex。任务拆分与细粒度契约交付后可并行，只有共享边界交叉review及CP1–4集中检查；新增重大业务范围仍走变更记录。
