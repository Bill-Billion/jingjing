# 三组模拟业务怎样复测

给开发者使用。用户不需要手工配环境。本机MySQL8、Node依赖、Flutter及浏览器需已准备；主流程还需要FFmpeg。`JX_MYSQL_TEST_ENV_FILE`必须指向本机隔离配置，不能用生产配置。原说明在 `docs/testing/FULL_FLOW_ACCEPTANCE.md`。

|想测试什么|启动（仓库根目录）|看角色与业务编号|取当前模拟验证码|正常关闭|
|---|---|---|---|---|
|选本→许可→订单→制作→验收→结算|`node scripts/full-flow.cjs start --test-only`|`node scripts/full-flow.cjs status`|`node scripts/full-flow.cjs code payer`|`node scripts/full-flow.cjs stop`|
|商单、报价、MCN合作、佣金|`node scripts/full-flow-business.cjs gigs start --test-only`|`node scripts/full-flow-business.cjs gigs status`|`node scripts/full-flow-business.cjs gigs code seller`|`node scripts/full-flow-business.cjs gigs stop`|
|选角、本人入组、会签、发行材料|`node scripts/full-flow-business.cjs projects start --test-only`|`node scripts/full-flow-business.cjs projects status`|`node scripts/full-flow-business.cjs projects code sponsor`|`node scripts/full-flow-business.cjs projects stop`|

先在页面点击获取验证码，再由开发者运行对应code命令。验证码每次生成，不存在固定万能验证码，不会发送真实短信。status仅展示合成角色与业务编号；不要复制私有runtime文件，那里面还有控制凭证。

|测试组|后端端口|建议网页端口|主要角色名称|
|---|---|---|---|
|定制主流程|3362|5211|payer客户/机构、recipient作者制作方、independentReviewer审核员、outsider无关人|
|商单|3302|5205|seller演员、buyer客户、mcn经纪负责人、reviewer审核员、member普通成员、outsider无关人、ruleAuthor规则登记员|
|选角发行|3322|5207|sponsor项目发起方、producer制作方、reviewer审核员、channelRegistrar渠道登记人、outsider无关人、member普通成员|

网页设置 `VITE_BACKEND_ORIGIN=http://127.0.0.1:对应后端端口`，在网页工程运行 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 对应网页端口 --strictPort`。App浏览器构建使用 `--dart-define=JX_ACCOUNT_API_URL=http://127.0.0.1:对应后端端口`。不同组是不同数据库和服务，不能拿商单账号编号去另一组查项目。

本侧首次准备时已有六组独立主流程进度：待确认报价、待付首款、待审样片、要求修改、待付尾款、已交付结算。选择对应组即可开始，不必每次从注册走完整流程。操作会改变状态，重跑完整验收前正常停止并重新创建资料；不得清空其他测试库。

开发者自动复跑：服务器根目录 `node scripts/backend-check.cjs all`；App工程按 `.github/workflows/pr11-frontend-checks.yml` 中明确列出的业务目录执行（本轮另外执行不带范围的 `flutter test --no-pub`，533通过、27失败，详见索引）；网页工程 `npm test` 和 `npx vue-tsc --noEmit`。实际浏览器路径沿用full-flow、pr17、pr18脚本；只核对合作名称可用pr17两份脚本的 `--relation-names-only`。

本地地址只能供开发机访问。手机远程访问需要另行准备有边界的测试入口；不应把整个本机控制服务暴露出去。
