# 第16份实际检查

2026-10-03。正常短信登录和真实权限，前端→实际HTTP→随机隔离MySQL；短信、私有存储、付款传输使用明确合成替身。真实设备、正式供应商和生产环境未验收。

|检查|结果|证据|
|---|---|---|
|App现有与制作检查|146通过，0失败|[日志](evidence/app-tests.log)|
|网页合同/供给/许可/交易/制作|17+19+21+17+17=91通过|[日志](evidence/web-tests.log)|
|静态检查与构建|Dart0问题、Vue类型与两端Web构建通过|[摘要](evidence/verification-summary.json)、[App](evidence/app-build.log)、[网页](evidence/web-build.log)|
|真实MySQL专项|制作20、交易25、许可28、任务21通过，0跳过|[制作](evidence/production-mysql-tests.log)、[交易](evidence/trade-mysql-tests.log)、[许可](evidence/licensing-mysql-tests.log)、[任务](evidence/worker-mysql-tests.log)|
|实际浏览器|App7组、网页10组全部通过，运行错误0|[App](evidence/app-browser-results.json)、[网页](evidence/web-browser-results.json)|
|第15份浏览器回归|11组通过，运行错误0；独立临时端口与记录，原预览保留|[回归](evidence/pr15-regression-results.json)|
|隔离启动与清理|10组启动检查；实际停止关闭两端口、删状态和随机库；随后新记录重启保留预览|[启动](evidence/fixture-results.json)、[清理](evidence/fixture-cleanup-results.json)|

覆盖实际新建、指派、上传、独立开工/审片、剧本读取确认、样片播放和修改、旧历史与412重确认、尾款前拒绝下载、已付清受控下载、退款和同意撤回拒绝读取。两端after-commit503后按同一内容/编号/版本恢复，普通换页被拦。默认生成NOT_ENABLED；单独可信合成服务样本验证实际BLOCKED任务恢复，只查询原请求，不另付费创建。撤销审核权限清空证据表单。

App390×844及320×693，网页1440×1000及390×844。Flutter画布文字使用真实滚动、语义标签和截图验证，部分原值从实际接口核对。浏览器脚本已纠正错误文字定位和“历史按钮应消失”的假设：实际历史按钮禁用，业务行为正确。最终完整重播通过；截图在数据加载、视频解码后保存，生成恢复图另作只读复拍。

## 本机复现

使用已有依赖、Flutter3.47.5与专用MySQL，根目录启动：

```sh
JX_MYSQL_TEST_ENV_FILE=/path/to/test-env.json node scripts/pr16-ui-test-server.cjs --test-only
```

必须NODE_ENV=test、127.0.0.1:33316、jx_local/jx_dev；API3282/control3283，0600状态`.local/pr16-ui-runtime.json`不提交、不传网页。先在登录页请求验证码，再仅输出当前合成验证码：

```sh
node -e 'const s=require("./.local/pr16-ui-runtime.json");if(s.testOnly!==true)throw Error("test-only");fetch(s.controlUrl+"/code?phone="+process.argv[1],{headers:{Authorization:"Bearer "+s.controlToken}}).then(r=>r.json()).then(j=>console.log(j.code))' 13900009402
```

网页使用VITE_API_ORIGIN指向3282构建，或VITE_BACKEND_ORIGIN代理3282；生产预览5206。App使用`--dart-define=JX_ACCOUNT_API_URL=http://127.0.0.1:3282`构建Web，服务8773。已有SDK仅用于Web，不安装原生依赖。Vue执行test:production与现有四组测试、type-check/build-only；Flutter执行test --no-pub与analyze。根目录依次执行（共用单次传输故障开关）：

```sh
PR16_WEB_URL=http://127.0.0.1:5206 node scripts/pr16-ui-browser-check.mjs
PR16_APP_URL=http://127.0.0.1:8773 node scripts/pr16-app-browser-check.mjs
```

现有GitHub工作流加入制作专项及网页真实流程，尚未上传运行。本机已通过不替代远端检查。启动器收到SIGTERM会清理其状态、端口、私有临时视频与随机库；不能停止共享MySQL。

2026-10-03 GitHub CI补正：实际日志确认Ubuntu runner没有ffmpeg，导致合成可播放视频准备失败。仅在一次性CI runner安装该测试工具；本机不安装新依赖。追加启动失败日志后定位并修正，后续Checks仍须实际通过才计入。

修正提交 `aad2201` 的GitHub前端检查 [37083092920](https://github.com/Bill-Billion/jingjing/actions/runs/37083092920) 与服务器检查 [37083092975](https://github.com/Bill-Billion/jingjing/actions/runs/37083092975) 均已实际完成并成功。重复请求/申请触发的同提交检查也成功。原PR16未合并或部署。
