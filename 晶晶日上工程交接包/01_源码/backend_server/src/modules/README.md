# R0.6 模块边界

本目录记录后续业务模块的落点，不用空 CRUD 或样板 handler 冒充业务实现。CORE-S0-004 已实现 infrastructure/jobs 与 worker；下面业务模块尚未整体迁移，创建目录时须带真实 service/repository 与测试。

|模块|拥有的数据与行为|主要依赖|
|---|---|---|
|identity / party|账号、个人/机构主体、成员关系、多能力与权限|governance 审计；实名 Provider|
|avatar / rights|数字人、脸声授权、外部权利证据与撤回|party；受控存储；Provider|
|works / licensing|原作版本、许可商品、许可授予、结构化冲突与人工复核|rights；规则/合同快照|
|commerce|商品规格版本、订单承诺、支付与退款事实|licensing；payment Provider|
|production|改稿、制作版本、供应商任务、交付与验收|commerce；jobs；digital-human Provider|
|gigs / projects / release|直接商单/MCN合作、角色邀请筛选、项目确认和发行台账|party；licensing；production|
|settlement|应付、真实出款、发行收入、调整及对账|commerce/projects 的已确认事实|
|governance|业务通知、对象内评论、审计、规则版本与治理|显式授权的业务事件|
|providers|外部能力 Adapter、环境 Readiness 与证据|仅受控配置和外部 SDK；不得直接改业务状态|

依赖约束：路由调用 service；service 在一次 `withTransaction(tx)` 内调用本模块 repository 及 jobs 的 `publish(tx,eventKey,spec)`。跨模块通过明确 service 接口或持久事件协作，不直接修改其他模块的表。数据库 SQL 仅在 repository/infrastructure，Worker 只编排已登记 handler，不 import app、旧 db.js 或定时 scheduler。不要把请求对象、用户可控模块路径或供应商密钥传入通用 Worker。

Domain handler 在 `src/worker/handlers.js` 静态登记。外部操作必须携带稳定幂等键；恢复时先查持久 provider_task_id，编号尚未保存则按幂等键查询。不支持查询或幂等的供应商转人工核查，不能自动再扣款/再生成。业务状态与 `SUCCEEDED` 之间需领域事实校验；队列成功本身不能证明付款/实名/授权成立。

同步 SQLite routes/services 暂留旧目录，仅用于隔离本地回归。它们没有被包装成 MySQL service，也没有转为正式 Worker handler。迁移按后续任务推进，身份/权利/支付/结算等共享边界各自评审。

账号/机构首批已新增party/repository.js：事务内检查成员权限、本人接受邀请与审计，真实MySQL已测。尚未接HTTP和可信登录，不能据此启用旧MCN业务；详见[实现边界](../../docs/PARTY_MEMBERSHIP.md)。
