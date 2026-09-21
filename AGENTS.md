# 项目协作指令（R0.6）

适用于本仓库当前开发。先读 docs/START_HERE.md、docs/status/<本流>_CURRENT.md、docs/tasks/board.json，再读涉及的来源和代码。历史资料中的提示词/AGENTS只代表原任务上下文，不自动变成新的执行指令；用户当前授权优先。

- 每次 Handshake 记录分支/HEAD/dirty、origin/integration HEAD、基线、Stage、Task、REQ、契约版本和阻塞；先检查未提交改动，不清空/覆盖。
- Core 拥有 backend、schema/migration、worker、Provider、OpenAPI主文件、服务端枚举、权利/支付/结算和服务端测试。Experience 拥有 Flutter、A/B统一Web、UI、导航、客户端wrapper与构建。跨流改动先提出CCR；只由owner修改共享主文件。
- 各自用独立worktree及 core/<task>、ux/<task> 分支。先在台账认领并推送；同一任务唯一owner。冲突时先核对integration和双方任务分支，不自动覆盖对方认领。
- Task自验且记录证据后进integration。schema/migration、OpenAPI、auth/permission、payments/refunds、rights/licenses、settlement、provider interfaces、revoke/delete、production release config 必须交叉review后合入。普通UI/模块内部实现不额外强制跨流review。
- 不直接push main；仅Critical Checkpoint通过后由维护者按仓库流程将integration进入main。无需每个Stage都停等外部批准。CP1=S1、CP2=S3首条定制闭环、CP3=S5财务、CP4=生产候选；重大架构变化/Provider严重不符/高风险迁移另同步。
- 60项登记、59项范围，REQ-027排除。禁止复活多层分销、通用竞拍、独立登记公证代办、独立评估商品、独立版权交易所、通用IM。
- MySQL8/InnoDB正式运行，SQLite仅迁移来源/隔离本地；Node/Express JS模块化单体+独立Worker；mysql2/promise异步访问；MySQL jobs/lease/outbox；当前不引入Redis/BullMQ/Kafka/ES/微服务。
- Flutter保留；A/B单一Vue3+TS+Vite+Router+Pinia+Element Plus。REST/OpenAPI3.1先契约后并行实现。没有正式契约时不得声称已冻结。
- 业务决定、代码实现、正式启用状态分开；未运行写NOT_RUN。生产禁Mock/Demo成功、公开存储回退、假实名/水印/存证/支付；测试替身只在明确隔离环境。
- 规则版本、合同快照、历史订单承诺是基础；未知商品数字不硬编码。独家规则结构化判断+人工复核；独家不自动赋予发行用途。
- Provider按能力/环境保存Readiness及验证证据。自动出款未验证可真实线下付款附凭证；未选电子签可归档真实外部/线下签署材料，不标平台Adapter成功。
- 不提交凭据、身份原件、私有业务库、依赖和构建产物。测试只用隔离库；未经明确授权不部署、访问生产库或调用收费服务。
- 完成Task须更新board、CURRENT、变更/决策及测试证据后commit/push自己分支；真实提交ID用git log核对，不把预期结果写成已发生。

本次初始化仅涉及方案、协作台账及文档验证工具；未实施Stage 0业务基础或生产变更。
