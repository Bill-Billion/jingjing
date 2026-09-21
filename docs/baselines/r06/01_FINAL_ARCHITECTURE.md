# 最终技术架构基线

## 1. 为什么选择 MySQL 8
本项目是典型事务平台，核心热点是支付、退款、授权、独家许可、角色名额、制作版本和结算，而不是海量内容查询。
MySQL 8 / InnoDB 足以支撑这些事务，并且仓库已有MySQL DDL/迁移准备，迁移与运维风险低于重新建立PostgreSQL体系。

### PostgreSQL为什么不选
PostgreSQL在JSONB、复杂约束等方面有优势，但当前业务并不依赖这些能力，不足以抵消新的迁移、运维和团队认知成本。

### SQLite定位
只用于：
- 旧库数据导入来源
- 本地快速测试
- 隔离单元测试
生产MySQL连接失败时绝不回退SQLite。

## 2. 数据量判断
事务数据库不是容量瓶颈。即使增长到：
- 100万账户
- 50万数字人
- 30万作品
- 200万+累计订单
核心OLTP数据仍适合单一MySQL主库配合合理索引和归档。

真正的大容量来自媒体：
- 真人照片/语音
- 剧本全文/合同
- 样片/粗剪/成片
- AI中间产物
应放对象存储。10万项目就可能达到10～100TB级媒体量，因此OSS生命周期和成本控制比DB容量更重要。

## 3. 后端
保留 Node/Express，不做框架级重写。
新增领域按模块化单体组织：
identity / party / avatar / rights / works / licensing / commerce / production / gigs / projects / release / settlement / governance / providers

旧路由可以逐步调用新service，不要求一次搬迁全部文件。

## 4. 数据库访问
- mysql2/promise
- async repository/service
- 明确transaction boundary
- migration version table
- 不为兼容better-sqlite3同步接口把新代码继续写成同步结构
- 不引入重ORM做整体改写

## 5. Worker
同一代码库运行独立Node Worker。
任务持久化MySQL，字段至少包括：
task_type / business_key / provider / provider_task_id / status / attempts / next_run_at / lease_owner / lease_until / last_error / payload_ref / result_ref

支持：
- 重启恢复
- 多实例租约
- 幂等
- provider查单
- 指数退避/人工重试

当前不加Redis。只有真实测量证明MySQL job表成为主要瓶颈时才重评。

## 6. 对象存储
业务层通过 ObjectStorageProvider。
优先阿里OSS。
敏感内容默认private；建议公共营销资产和私密业务资产逻辑/物理隔离。
数据库只保存metadata、object key、hash、owner、project、version、permission。

## 7. 搜索/缓存
当前不加Redis共享缓存，不加ES/OpenSearch。
目录、艺人、项目使用MySQL结构化字段、标签和索引。
以后如果中文全文质量或性能成为真实问题，通过SearchProvider增加独立搜索，不改业务事实模型。

## 8. API
OpenAPI 3.1为共享契约，Core单一Owner。
统一：
- amount_minor + currency
- request_id
- idempotency_key
- object_version
- actor / acting_party
- current_status
- allowed_actions

Flutter/Web不自行复制完整业务状态机。

## 9. A/B Web
单一Vue3 TS工程，A运营、作者/版权方、制作、MCN、企业客户通过Party/Membership/Capability和权限呈现不同工作区。

## 10. Flutter
继续现有工程，不重建App。
建立Design Tokens/Components，五入口重新组合。
release/production禁止API失败后回退Demo。

## 11. Provider
统一Adapter：
IdentityProvider / PaymentProvider / ObjectStorageProvider / ModerationProvider / DigitalHumanProvider / ESignProvider

Readiness：
NOT_IMPLEMENTED / IMPLEMENTED / CONFIGURED / SANDBOX_VERIFIED / PRODUCTION_VERIFIED / WAITING_PROVIDER_APPROVAL / DISABLED_BY_PRODUCT

## 12. 支付与财务
支付至少区分Alipay App Pay和Apple IAP。
客户付款、合作方应付/实付、发行收入/项目结算三类事实分开。
如果自动多主体出款产品未PRODUCTION_VERIFIED，系统仍形成应付/结算单，由公司现实财务付款并回填凭证——这是可正式运营模式，不是假实现。

## 13. 电子签
Provider未选定前，支持归档外部/线下真实签署PDF和证据；不能显示“平台电子签成功”。

## 14. 部署
目标：
Nginx -> Node API(PM2) + A/B Web静态文件
             Node Worker(PM2)
             Managed MySQL 8
             OSS

本地/CI可以用Docker启动MySQL，但不为容器化本身重做生产部署。

## 15. 观测
首版必须有：
- JSON结构化日志
- request_id / actor / acting_party
- provider request id
- job id / payment tx id
- health / ready
- audit_events
- A端Provider Readiness和失败任务查看
