# 契约变更记录

## 0.1.0-rc.1 — 2026-09-21

- 首次建立Core主契约，OpenAPI3.1.1；12路径/13操作/42Schema，均为待实现候选。
- 定义账户/主体/Membership/Capability、手机号challenge/session、本人核验状态、客户端业务能力、运营Readiness和规则/合同快照元数据。
- 定义统一错误/meta、幂等、If-Match/object_version、金额、私有内容引用及探针边界。
- 提供合成示例、负例与离线验证工具；保留旧3.0.3文档和运行时接口。
- 状态：PENDING_EXPERIENCE_REVIEW；未冻结、未集成、没有运行时上线承诺。评审请求CCR-001。

后续兼容新增、枚举或必填变化均注明受影响端、迁移策略、review与提交证据。不能仅改文件版本号宣称双方同步完成。
