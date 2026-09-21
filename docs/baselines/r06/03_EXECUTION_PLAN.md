# 连续执行计划（阶段表示依赖，不表示周数）

## Stage 0｜基础工具链
Core：
- MySQL8环境、mysql2/promise、migration runner
- 旧SQLite导入工具
- module skeleton
- OpenAPI基线
- MySQL jobs/outbox/lease
- OSS/provider/readiness基础
- structured logs/health
- backend CI

Experience：
- Flutter version/pub get/analyze/tests/debug build
- 旧页面→五入口映射
- Flutter Design System
- 新建A/B Web正式工程
- Web Design System
- OpenAPI client消费
- login/app shell
- UI reference board
- client CI

退出：两端可构建，OpenAPI可消费，MySQL可运行，CURRENT机制已入repo。

## Stage 1｜Platform Foundation
Core：
- 修复已识别F01～F14真实性问题
- Account/Party/Membership/Capability
- permission service
- audit
- Provider Readiness
- rule/version/snapshot
- private storage access
- task worker基础

Experience：
- 登录/主体切换
- 五入口
- disabled/readiness状态
- A/B shell
- 通用Loading/Empty/Error/Permission
- 旧页面映射

退出：生产不再有假成功；权限/主体/私密文件/快照基础可依赖。

## Stage 2｜Rights & Supply
Core：
数字人权利、脸声同意、作者/机构、Work/Version、权利证据、双审、LicenseSKU/Grant/Binding、结构化独家、合同快照、受控阅读。

Experience：
数字人授权中心、作者/机构入驻、投稿/补正、作品/版本、许可商品、试读/受控阅读、A审核、B作者工作台。

退出：供给方提交→审核→上架→取得许可→项目绑定闭环。

## Stage 3｜Trade & Production
Core：
Quote/QuoteVersion、Order/OrderLine、PaymentAttempt、Alipay、Apple IAP、Refund、ProductionTask、样片/粗剪/成片版本、acceptance、长期数字人Adapter、AI任务恢复。

Experience：
选本/定制向导、商品规格、报价、订单、收银、样片反馈、成片验收、制作方工作台、A订单/制作/售后。

退出：选数字人/剧本→报价→下单→许可→制作→样片→修改→尾款条件→成片→验收的内部完整闭环。

## Stage 4｜Marketplace & Projects
Core：
Service/Gig、直接MCN关系、单笔佣金、榜单事实、Project、角色报名/邀请/筛选、多方确认、release submission/status。

Experience：
培育、商单、MCN、三榜、成角、项目、报名/邀请、版本/里程碑、发行状态。

退出：商单和项目两条线闭环；内部通过与外部已发行严格区分。

## Stage 5｜Finance & Operations
Core：
Payable/Payout、ChannelStatement、Revenue、Settlement、Adjustment、对账、争议、报表。

Experience：
A财务、B结算、C本人收入、异议/确认、经营报表。

退出：三类钱可完整追溯。

## Stage 6｜Delivery
Core：
正式迁移演练、backup/restore、Provider真实验收、安全、负载并发、部署、runbook。

Experience：
Android release、iOS、Web prod build、真机、适配、商店材料。

退出：形成Production Candidate。

## Critical Checkpoints
平时无需外部逐阶段复核，只在：
- CP1：Stage 1完成
- CP2：Stage 3第一条完整定制闭环
- CP3：Stage 5财务闭环
- CP4：Production Candidate
或发生架构级需求变化/Provider严重不符/迁移高风险时集中同步。
