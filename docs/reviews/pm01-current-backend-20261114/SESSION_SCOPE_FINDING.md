# 会话范围的后续核查边界

第84轮只读核查，未改代码、未运行页面，也未判定存在越权漏洞。

原ACC-DEL-01.02与docs/baselines/v5-d1/02_完整交付包与双流任务.md写明：“C、MCN PC、运营各有会话范围，沿用同一主体事实。”反例要求普通用户调用运营或他机构接口拒绝。当前正式验收关联主要是历史网页财务用例，不能单凭该关联证明全部会话范围。

当前auth/repository.js在auth_sessions中按账号、令牌、到期/撤销解析；0017/0188迁移无显式终端用途字段。account-api.js建立请求级principal，具体业务仓库另核成员和运营动作权限。静态读取前端发现网页session.ts用ops.session.*与sessionStorage，App账号令牌在内存，且App已有原生运营/财务/制作入口；本轮没有运行、修补或开发它们。

因此，不能直接把“没有client_scope字段”认定为授权缺陷，也不能擅自实现“App令牌一律禁止运营”。后者可能破坏用户已要求的原生独审安排。下一步须按当前工作区用途、实际同账号/不同账号的登录、身份切换、成员失权及运营动作反例核查后端；把端侧凭据/缓存隔离与接口角色权限分别列证据。只有确认违反有效要求的具体办理后才修复；终端所需实际验证依用户当前前端暂停边界保留。

相关源路径（仓库根相对）：

- 晶晶日上工程交接包/01_源码/backend_server/src/modules/auth/repository.js
- 晶晶日上工程交接包/01_源码/backend_server/src/http/account-api.js
- 晶晶日上工程交接包/01_源码/backend_server/migrations/mysql-runtime/0017_auth_sessions.sql
- 晶晶日上工程交接包/01_源码/backend_server/migrations/mysql-runtime/0188_auth_session_verified_time.sql
- 晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/stores/session.ts（只读）
- 晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/account/account_session.dart（只读）
