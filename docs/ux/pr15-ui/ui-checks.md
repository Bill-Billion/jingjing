# 第15份前端：实际检查与复现

2026-10-02。本批使用正常短信挑战与登录、真实OWNER及独立审核权限、真实HTTP和随机隔离MySQL。页面没有注入登录令牌或审核角色。短信、文件存储和支付平台传输是本机测试替身；以下通过不代表真实支付SDK、正式服务或真机已验证。

## 最终结果

|检查|实际结果|证据|
|---|---|---|
|App交易及现有账号、合同、供给、许可、导航、交互和启动检查|125项通过；最终修复后重跑|[App日志](evidence/app-tests.log)|
|网页交易、合同、许可、供给检查|17+17+21+19，共74项通过|[网页日志](evidence/web-tests.log)|
|静态检查与生产构建|Dart静态分析、Vue类型检查、Flutter Web和Vue生产构建通过|[检查摘要](evidence/verification-summary.json)、[App构建](evidence/app-build.log)、[网页构建](evidence/web-build.log)|
|后端交易与许可规则/支付证明|13项通过|[规则及提供方日志](evidence/backend-policy-provider-tests.log)|
|真实交易MySQL专项|25项通过，0跳过|[日志](evidence/trade-mysql-tests.log)|
|真实许可MySQL专项|27项通过，0跳过|[日志](evidence/licensing-mysql-tests.log)|
|最终App浏览器|8组通过，390×844及320×693，运行错误0|[流程与构建指纹](evidence/app-browser-results.json)|
|最终管理网页浏览器|11组通过，1440×1000及390×844，运行错误0|[流程](evidence/web-browser-results.json)|
|隔离启动和停服清理|8组组合启动检查通过；实际停服删除状态、关闭两端口、删除随机库；随后重启保留预览|[启动](evidence/fixture-results.json)、[清理](evidence/fixture-cleanup-results.json)|

额外登录返回和App只读展示复核与上述范围重叠，不相加计数。已有构建分包提示不影响构建通过；本轮没有重新安装原生插件。

## 实际办理覆盖

1. 商家通过真实表单填写服务规格，多行报价、数量及各节点分配；独立审核采用单独账号，审批不会建立买方订单。
2. 买方按原报价指纹确认。管理网页模拟响应读取断流，但订单实际已提交；页面先查原报价取得已有订单，不再另建。普通换页被拦，已知结果保留。
3. 实际付款创建超时返回503，两端保留原请求内容、幂等编号及已知付款；先读取再用同一编号恢复。恢复后仍是UNKNOWN付款，金融状态不会被客户端改为成功。
4. 通过本机签名/查询传输核对付款，再验证服务器改变订单已收金额。客户端返回与建立记录都不能替代这一步。
5. 逐项申请1234人民币分退款；管理网页独立批准、另行执行，再核对实际退款结果。App申请后显示待审核；Apple样本显示等待用户申请。
6. 历史原单保存99元样片已报告支付、4901元成片未支付，保留原条款及私有附件。另一账号独立核对与按权限下载材料，仍不追认为渠道到账。
7. 实际撤销退款权限返回403并清理私有内容；实际412重新读最新报价、清空旧确认，不自动重放；取消未付款订单保留理由。
8. 许可订单可回到关联预留。启动检查证明原10000/25000门槛之前无法发放，达到门槛后仍经独立合成签署、身份和权属证据核验；订单部分收款与许可生效分别保留。
9. 管理网页全部共用菜单、正确高亮、登录返回与窄屏无横向整页溢出；App旧许可地址映射新版，五个主栏目和子页返回保留。

Flutter的可选择文本在画布上绘制，部分金额不作为DOM文本暴露。对应检查核对实际接口原值，并由真实截图及Widget检查验证显示；没有把错误DOM选择器计为页面失败或伪造通过。

## 本轮发现并处理

- 已知合同字段默认用中文显示，完整原值放折叠区；订单合同和原报价不改写。
- 退出再登录会清理旧的拒绝标记，不能让新会话沿用旧身份的无权结果。
- 原请求恢复成功后清理已过时的“尚未确认”提示；UNKNOWN付款本身仍显示待核实，不当作到账。
- 浏览器脚本改为精确等待登录目标pathname，避免把登录页跳转参数误判为登录完成；等待实际短信返回，避免读取前一条验证码。
- Flutter浏览器脚本滚动实际画布后填写可见控件；没有通过修改DOM数据来绕过业务提交。

## 复现方法

已有依赖和隔离MySQL就绪后，在根目录启动（不得使用正式配置）：

```sh
JX_MYSQL_TEST_ENV_FILE=/path/to/test-env.json node scripts/pr15-ui-test-server.cjs --test-only
```

配置必须是NODE_ENV=test、MySQL127.0.0.1:33316、jx_local/jx_dev。每次创建随机测试库；API3262、私有控制3263。运行状态 `.local/pr15-ui-runtime.json` 为0600，已有状态不覆盖，不能提交或发给网页。合成账户见[审查入口](README.md)。获取验证码后只在本机终端读取（只输出当前合成验证码）：

```sh
node -e 'const s=require("./.local/pr15-ui-runtime.json"); if(s.testOnly!==true)throw Error("test-only"); fetch(s.controlUrl+"/code?phone="+process.argv[1],{headers:{Authorization:"Bearer "+s.controlToken}}).then(r=>r.json()).then(j=>console.log(j.code))' 13900009302
```

网页源码目录：

```sh
VITE_API_ORIGIN=http://127.0.0.1:3262 npm run build
npm run preview -- --host 127.0.0.1 --port 5204 --strictPort
```

App源码目录使用已有固定Flutter3.47.5工具，不安装iOS工具：

```sh
flutter test --no-pub test/account test/contracts test/supply test/licensing test/trade test/navigation test/interaction_flows_test.dart test/widget_test.dart
flutter build web --no-pub --dart-define=JX_ACCOUNT_API_URL=http://127.0.0.1:3262
python3 -m http.server 8772 --bind 127.0.0.1 --directory build/web
```

根目录使用已安装playwright-core与Chrome执行（两端付款流程依次执行，避免共用下一次支付传输开关）：

```sh
PR15_WEB_URL=http://127.0.0.1:5204 node scripts/pr15-ui-browser-check.mjs
PR15_APP_URL=http://127.0.0.1:8772 node scripts/pr15-app-browser-check.mjs
```

`CHROME_PATH`可指定已有Chromium。`--only-login-return`和App的`--only-display`可分别复核登录返回和只读页面，不另计完整流程组数。GitHub原网页和App检查工作流已加入交易检查及管理网页真实流程；本次集中交付已获用户授权，新增远端检查实际结果以[PR15](https://github.com/Bill-Billion/jingjing/pull/15)当前版本为准，不沿用上传前结果。

对启动器发送SIGTERM/SIGINT会关闭本轮端口、删除其随机库及状态；不能停止共享MySQL或强杀后删除其他任务状态。截图和报告只包含合成记录，真实SDK、真机和生产环境未验证。
