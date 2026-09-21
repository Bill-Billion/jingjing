# 旧接口与R0.6首批候选映射

源码核对起点ac34c48（业务代码同eba5dae）。旧后端目录为`晶晶日上工程交接包/01_源码/backend_server`；本次只读盘点，没有修改旧路由或客户端。

|旧代码/契约|新候选|迁移差异/后续实现|
|---|---|---|
|docs/openapi.yaml：OpenAPI3.0.3，生产server，返回形态不同|contracts/openapi.yaml：3.1.1、仅本地server、统一meta|两个版本不自动等价；旧文档不删除，不用新文件宣称旧后端通过|
|routes/auth.js:77、99，POST /api/auth/phone、/sms|POST /api/v1/auth/sms-challenges、/sessions|新增challenge_id、幂等、统一错误和响应；旧数字userId通过显式映射转不透明账户ID；不能直接复用未校验audience/状态的token|
|routes/auth.js:14、49，微信/Apple登录|首批暂不定义新v1操作|保留旧代码；后续认证切片按真实上游权限接入，不宣称移除这些登录方式|
|middleware/auth.js:5，JWT中userId/role|GET /api/v1/me + Bearer账户身份|新增账户状态/受限动作/会话失效检查；旧role不可直接升级为平台权限|
|routes/identity.js:22、60、89，personal/company/mcn、缺Provider自动approved|本人核验状态 + Party/Membership/Capability|分离个人账户、签约主体、机构多能力及核验；unverified_auto→REVIEW_REQUIRED，真实核验不足不能放行|
|routes/mcn.js:45，无感添加艺人|本切片只读Membership及Party；邀请写流程后续定义|ACTIVE关系必须有本人接受/委托事实，不能把旧关系直接认证为同意|
|旧X-Admin-Token后台|GET /api/v1/admin/provider-readiness|新平台权限独立判断，无全局共享token绕过|
|缺统一Readiness及客户端业务能力查询|GET /api/v1/capabilities、运营Readiness|两种可见范围分开；未配置/未验证不能报成功|
|旧规则/合同未闭合|GET /api/v1/rule-versions/{id}、/contract-snapshots/{id}|只读版本与元数据；后续补规则审批、私有下载及完整交易快照|
|app.js:83，/api/health|/health、/ready|存活与必要运行依赖分离；保留旧路由直到实际迁移|

新端点全部NOT_IMPLEMENTED。旧客户端继续走原接口，不能一键改base URL后假定兼容；未来由受控feature flag/明确版本迁移切换。新接口不可用时客户端显示真实错误/未启用，不能退回Demo或误回旧付款路径。

后续实现前需补齐：旧ID映射、token兼容边界、真实数据库字段/约束、请求幂等留存、角色/委托权限矩阵及旧未核验记录清单。金额/支付/许可写接口由各自任务扩展，不在本切片暗中改变旧业务。
