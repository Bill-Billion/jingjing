# 六项合同后端验证结果

2026-11-02；后端负责人chengcongcong222。起点a82407d0，本批实现版本见同提交Git树与交付回执；接口0.31.22-rc.1，迁移0194–0201。全部在独立本机MySQL 8测试库及合成资料进行，没有调用收费服务、部署或操作生产库。

|检查|结果|范围与限制|
|---|---|---|
|完整后端自动检查|1207通过、0失败、1跳过|缺少旧SQLite脱敏样本；最后侵权小改及新增注销测试在以下专项覆盖|
|六项新规则及实际HTTP|11通过、0失败|新48小时/旧规则、10–15%/旧5%、监护绑定及限时/内容/隐私/模拟退款成功、侵权双方/补件/独立恢复、注销核验/延期/越权|
|机构关系及旧单交接|57通过、0失败|现代和旧分成，真实机构成员/本人委托/人格授权、到期、撤权、双方确认|
|隐私申请及实际执行|49通过、0失败|新增核验前阻止注销、核验后实际关闭账号/旧登录、执行和剩余事项未完成时拒绝结案、最后独立结案|
|接口格式|708实际响应、177示例、151反例，19004检查通过|只证明响应格式及声明，不代替业务或页面验收；见schema-report.json|
|资料与任务引用|通过|94来源、60需求、91原任务、有效链接；数目不是本批新增功能数|
|正式全业务验收登记|151仍NOT_RUN|18组、12路线保留，不能把局部接口测试批量改成正式通过|

## 独立复验

在backend_server目录，配置本机隔离JX_MYSQL_TEST_ENV_FILE；真实外部服务保持关闭。新测试自动建立和清理jx_test_*库。

- node scripts/test-mysql.js contract-six
- node scripts/test-mysql.js gigs
- node scripts/test-mysql.js privacy
- node scripts/run-tests.cjs（视频测试需FFmpeg/ffprobe和测试字体）

在仓库根目录：

- python scripts/validate_contract.py --runtime-fixtures .local/contract-six-combined-http.json --report .local/contract-six-schema-report.json
- python scripts/collaboration_check.py --render
- python scripts/full_business_check.py
- git diff --check

HTTP证据由专项生成在.local中，组合文件由六项、机构新旧、现货、试镜、成长、隐私两份响应合成，不携带真实账号或令牌。原日志只在本机，摘要哈希见log-manifest.json。独立复验时重建本机测试库和响应，不能直接依赖开发机的路径。

## 完整注销的实际检查

补测发现旧回复类型ACCOUNT_CLOSURE_REQUESTED要求保留待执行事项，因此结案应沿已有RETENTION_EXPLAINED回复说明已核对的保留依据，并经独立审阅，再用本批COMPLETE核对实际关闭/执行/删除结果。没有删除原防假成功规则；仅已受理、未实际关闭或仍有待办，不能结案。该流程现已加入隐私集成回归与前端接法。

App及网页新页面未在本轮编写或验收；跨端完整路线、151条正式验收、外部供应商和正式条款填写仍待后续办理。实际儿童采集/收费以及真实退款均未开启。

新增contract-six已加入共享测试清单，完整后端运行会执行它；远端后端流程同时校验其真实HTTP响应格式。新增六项不会仅在开发机手动检查。
