# W16/W17 原请求回执绑定

基线2e7ed513，仅改 redemption_pages.dart，修改前库外备份。保留布局及先前弹窗上下文防御。

## 原问题与最小修复
CommunityPageState.recover 只传页面 validateResult，不执行首次 act 的局部validate。原页面只验证记录形状、摘要及结果数量，checkout恢复未校原grant/quote；draw首次和恢复未校原pool/rules/count。

本次 validateResult 在 recovery 非空时读原保存 body/recoverySuffix，不读取当前表单。仅精确 grants/{UUID}/checkout 和 draws 分支核POST；前者要求COUPON_HOLD并核data.grant_id等于路径原grant、data.quote_id等于原body；后者通过validateDrawCommand要求DRAW并核data.pool_id/rules_sha256/count等于原body。其余原形状/摘要校验保留。首次draw局部validate也绑定已冻结poolId/rulesHash/count，不从新表单取值。

## 既有后端与未知请求依据
- backend_server/src/modules/redemption/checkout.js:29 创建COUPON_HOLD的数据包含quote_id、grant_id；后续回执保存adjusted_quote及摘要。没有新增HOLD读取API。
- backend_server/src/modules/redemption/lottery.js:57 DRAW数据明确包含pool_id、rules_sha256、count及rule_snapshot。
- community_support.dart:313–330 CommunityApi.write把validate交session.write，恢复使用保存body/version；account_api.dart:322先await validate，328之后才消费pending。communityRequire抛503/uncertain=true，因此不匹配回执走原未知错误分支保留原请求。未改变body、key、If-Match或恢复重试链，不放宽服务端权限/库存/资格。

仅静态源码、diff与上述调用顺序核对，未运行测试、编译、分析器、格式化、浏览器或业务接口，未提交推送。不声称运行验证过错误回执；待同事整批覆盖原请求正常恢复、错误grant/quote/pool/rules/count回执、pending保留与重试、正常首次draw。

源码SHA256：`eb11b25ef0e137be58f06a3773b46be5fdfc419b2a87b871582a81f71b765eff`
