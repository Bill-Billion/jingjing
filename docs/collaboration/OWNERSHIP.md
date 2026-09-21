# 两流所有权

|流|负责人|单一修改范围|
|---|---|---|
|Core|chengcongcong222 + 本侧Codex|backend_server、schema/migration、worker、Provider接口、OpenAPI主文件、服务端状态枚举、权限/支付/权利/结算及测试|
|Experience|队友 + 其Codex；登录名由本人首次认领时填写|Flutter、A/B统一Web、设计系统、UI/导航、客户端SDK wrapper、Android/iOS/Web构建/真机|

仓库由队友建设，origin为Bill-Billion/jingjing。仓库owner名称不是另一位实际执行者登录名的自动证明，因此没有代填Experience owner、没有创建CODEOWNERS或改仓库权限。

跨流修改先CCR，由对应owner实施；只有schema/migration、OpenAPI、auth/permission、payments/refunds、rights/licenses、settlement、provider interfaces、revoke/delete、production release config强制交叉review。

F01–F14事实及依据在 [原仓库报告](../baselines/r03/intake_reports/01_REPOSITORY_BASELINE.md)。Core协调修复总表，F06客户端Demo回退、F10发布签名、F14前端旧记录由Experience改动；不得因“Core负责真实性”跨流覆写Flutter。
