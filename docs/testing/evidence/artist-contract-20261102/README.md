# 认证与免费基础服务：本机验证证据

后端0.31.18-rc.1，数据库0192。全部使用合成资料、回环HTTP和随机隔离MySQL，没有真实短信、支付、模型、OSS；未验证前端页面或甲方网站。

- `backend-full.log`：整体1116通过、0失败、1跳过（未提供旧SQLite脱敏样本）。运行过程中最后补充了免费档案图片/声音格式检查及未成年人/取消案例，所以不冒称该日志覆盖最后修改。
- `final-targeted.log`：最终代码56项艺人/合同专项全过，覆盖最后修改、新旧服务、权限、免费失败/重试、并发去重、材料归属、补件版本、撤回与退款规则。
- `same-record-flow.json`：使用本批可复用合成环境，5个连续HTTP办理检查点通过，记录同一申请/服务编号；随机数据库与临时凭据已清理。不是浏览器或原生App验收。
- `runtime-contract.json`：103份实际HTTP响应通过统一接口校验，包含专项和同记录演练；不是103项新功能。响应原文件只留被忽略的.local，提交报告不包含登录凭据。
- `initial-targeted-failure.log`：首跑失败保留。权限正确返回ARTIST_REVIEW_FORBIDDEN，测试误写另一错误名称；已修测试并复跑。最初接口校验另报新operation尚未登记实现证据，补登记后通过，未修改校验标准绕过。

独立复验：本机隔离环境设置JX_MYSQL_TEST_ENV_FILE后运行 `node scripts/backend-check.cjs artists`；整链资料运行 `node scripts/artists-contract-sandbox-smoke.cjs`。全量运行backend_server/scripts/run-tests.cjs；媒体工具按本机既有配置设置。此处不复制任何密钥或访问凭据。

原151条正式验收未整体验收；本批新页面待Bill-Billion接入、双方同版验证。接口文件、认领与真实启用分开记录。

远端补记：61556c9d的独立检查失败于验收清单版本登记遗漏（release contract version differs from OpenAPI），非业务测试失败。已修登记并通过full_business_check及19项反例检查；新远端状态按CURRENT。
