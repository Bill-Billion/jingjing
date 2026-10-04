# 第17份实际检查

2026-10-03。正常短信登录及真实身份权限，前端→实际HTTP→随机隔离MySQL；短信、存储与支付传输明确采用合成替身，没有外部扣款。原生设备和正式渠道未验收。

|检查|结果|证据|
|---|---|---|
|App相关回归及新业务|全部相关141项通过；分析0诊断|[检查报告](evidence/frontend-checks.json)、[实际测试](evidence/app-tests-after-upload-fix.log)、[分析](evidence/app-analyze-after-upload-fix.log)|
|网页五组回归及商单|17+19+21+17+17=91通过，类型检查通过|[已执行检查报告](evidence/frontend-checks.json)|
|两端Web构建|通过|[App](evidence/app-build.log)、[网页](evidence/web-build.log)|
|真实隔离MySQL专项|商单23、交易25、许可27通过，0跳过|[商单](evidence/backend-gigs.log)、[交易](evidence/backend-trade.log)、[许可](evidence/backend-licensing.log)|
|正常浏览器流程|App7组、网页9组全部通过；运行错误0|[App](evidence/app-browser-results.json)、[网页](evidence/web-browser-results.json)|
|隔离启动与清理|9组真实前置检查；主动停止删除自己的随机库和状态、关闭3302/3303；共享MySQL继续可查询|[启动](evidence/fixture-results.json)、[清理](evidence/fixture-cleanup-results.json)|

网页实做需求/证明提交、五项独立审核、提案与原本人同意/MCN比例、精确接受、原提案正式报价与订单、本人接受/结束合作、部分退款后负计提、重复重算、独立规则审核/退役、UTC榜单、实际412与权限403清空、24项共享菜单和390窄屏。App实做需求日期/类别/证明、接单表单、精确确认、邀请及本人决定、历史佣金与三榜、通知、五顶层栏目和320宽子页。

两端after-commit503之后保留原内容/编号/版本并拦普通返回，恢复请求不重复产生记录。接单确认前绑定读取指纹，确认后记录因增加接受人产生新指纹，随后报价封存接受后实际版本；不要求服务器整个记录指纹永不变化。Web412重读、清旧勾选并要求重新确认。Flutter画布采用实际滚动和语义标签，测试已修正错误文字、机构选择以及“恢复应再出现确认弹窗”的假设；最终完整流程结果为上述报告，调试残稿不计通过。

App390×844、320×693；网页1440×1000、390×844。34张最终实际截图在加载后保存。图册示例不转为真人、正式账款、头像授权或榜单；没有PRODUCTION付款写入，榜单不足结果真实保留。App和Web单元/组件检查由各自代理实际执行并报告给根任务，App修复后全部相关141项保留一次完整命令的实际日志，包括商单23项及文件选择前关闭编辑连接、成功/取消后保留字段的两项回归。根任务复用通过检查，构建、真实MySQL及浏览器报告独立保存，没有伪造未留存的原始日志。

## 本机复现

使用已有依赖、Flutter3.47.5与专用测试MySQL，根目录：

```sh
JX_MYSQL_TEST_ENV_FILE=/path/to/test-env.json node scripts/pr17-ui-test-server.cjs --test-only
```

启动器只接受NODE_ENV=test、127.0.0.1:33316、jx_local/jx_dev。API3302、私有控制3303；0600状态`.local/pr17-ui-runtime.json`不提交、不传前端。正常登录请求验证码后，仅输出当前合成码：

```sh
node -e 'const s=require("./.local/pr17-ui-runtime.json");if(s.testOnly!==true)throw Error("test-only");fetch(s.controlUrl+"/code?phone="+process.argv[1],{headers:{Authorization:"Bearer "+s.controlToken}}).then(r=>r.json()).then(j=>console.log(j.code))' 13900009502
```

网页使用VITE_BACKEND_ORIGIN代理3302构建和预览5205；App `--dart-define=JX_ACCOUNT_API_URL=http://127.0.0.1:3302` 构建Web，服务8774。没有新增原生依赖或真机安装。前置记录会被正常操作消费，完整复现使用fresh启动器，并按顺序运行（共用单次故障开关）：

```sh
node scripts/pr17-ui-browser-check.mjs
node scripts/pr17-app-browser-check.mjs
```

脚本`--remaining`仅本地定位用，其结果不进入最终App报告；验收必须完整7组。CI加入gigs专项、分析与Vue真实浏览器步骤，未上传运行。启动器SIGTERM只清理自己的库、状态、私有临时字节和端口；不能停止共享MySQL。正式支付SDK、签署、生成、出款及每日生产榜单调度独立验收。
