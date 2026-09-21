# 晶选片场 R0.6｜双人+双Codex执行基线

状态：可作为后续一段时间的统一执行基线。

## 继承关系
- 业务需求仍以 R0.3 的 REQ-001～REQ-060 为准。
- 59项在当前范围，REQ-027 通用角色竞拍排除。
- R0.6 主要确定技术架构、双流分工、Git协作和持续推进方式。
- R0.6 取代“R0.4 两周Wave A立即施工”和“R0.5 Gate 0必须停下等外部复核”的执行方式。
- 后续只在关键Checkpoint或重大架构/业务变化时集中同步。

## 固定技术方向
- 主事务数据库：MySQL 8 / InnoDB，正式优先托管MySQL。
- SQLite：旧库迁移来源、本地/隔离测试；不作为生产回退。
- 大文件：对象存储，优先阿里OSS；敏感资产默认private。
- 后端：保留现有 Node/Express JavaScript，模块化单体 + 独立Worker。
- DB访问：mysql2/promise + async repository/service。
- Worker队列：MySQL持久任务 + lease/outbox；当前不加Redis/BullMQ。
- 当前不引入Kafka、Elasticsearch/OpenSearch、微服务。
- C端：继续现有Flutter。
- A/B端：单一 Vue3 + TypeScript + Vite + Router + Pinia + Element Plus 工作台。
- API：REST + OpenAPI 3.1，Contract-first。
- Production禁止Mock/Demo fallback、公开存储回退和占位成功。

## 阅读顺序
1. 01_FINAL_ARCHITECTURE.md
2. 02_TEAM_AND_GIT.md
3. 03_EXECUTION_PLAN.md
4. 04_ENGINEERING_RULES.md
5. 05_CORE_CODEX_PROMPT.txt / 06_EXPERIENCE_CODEX_PROMPT.txt
然后读取 intake_reports 中 R0.3 的需求、目标设计、外部条件和 CURRENT。
