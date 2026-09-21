# CCR-001｜首批平台契约交叉评审

- 提出人：chengcongcong222 / Core；日期2026-09-21。
- Task：CORE-S0-001；Stage0；REQ-006/007/010/023/033/034/042/043/044/045/046/047/059/060。
- 起点：origin/integration@ac34c48；候选0.1.0-rc.1在core/s0-001-openapi-baseline。
- 共享边界：OpenAPI、auth/permission、provider interfaces；Core唯一修改主文件。
- Experience review：**PENDING**；没有代填评审人或批准结论。

评审对象：[OpenAPI](../../contracts/openapi.yaml)、[协议语义](../../contracts/PROTOCOL.md)、[旧接口映射](../../contracts/LEGACY_MAPPING.md)及[本地验证](../../contracts/README.md)。

需要Experience检查：

1. Flutter/Web能否消费OpenAPI3.1及字符串ID、nullable字段、meta/data/error、cursor；客户端未知字段/动作处理是否适合。
2. 主体选择按请求传递是否支持多窗口/多设备，邀请与ACTIVE关系展示是否清晰。
3. 五入口的未启用原因和allowed_actions能否表达真实错误，而非Demo回退。
4. If-Match/幂等冲突后的刷新与重试是否可落地；登录challenge与旧认证迁移的端侧工作是否完整。
5. 规则/合同只读元数据与私有下载后续切片边界是否明确，是否缺本轮登录/shell必须字段。

普通UI细节不在此CCR逐项审批。评审通过后Core修订并集成；此前可读取候选、运行解析试验和给出评论，但不能宣称契约已冻结或生产可用。

运行时待验：跨主体/管理员权限拒绝、幂等竞态/事务、实名/Provider证据、私有资产访问、客户端SDK生成和实际构建。本次Schema正反例不替代这些验收。
