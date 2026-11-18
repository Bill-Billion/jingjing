# 复验说明

这些是诊断脚本：成功退出表示当前版本的缺陷被稳定复现，并不表示缺陷已修复。全部业务请求使用合成数据；不需要真实验证码、支付或供应商 API。

## 已保留的执行目录

`/Users/yanghaoran/Documents/Codex/2026-11-02/task/jingjing-investigation`

目录中的 `repo` 为独立浅克隆，受测 HEAD 必须为 `8df249b59d3c83cdd8ca9aee0db08068b546d296`。`node_modules` 链接到隔离 WEB 的依赖。原 `/Users/yanghaoran/Code/jingjing` 保持旧 main，不能在旧 main 上运行后标记为本报告的最新版本结果。

```sh
cd /Users/yanghaoran/Documents/Codex/2026-11-02/task/jingjing-investigation
git -C repo rev-parse HEAD
node tests/reproduce-web.mjs
node tests/browser-reproduce.mjs
```

第二个脚本需要允许本机 127.0.0.1 监听，使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`；临时服务和浏览器在 finally 关闭。所有网页 API 拦截为合成响应，非本机请求终止。它会更新 `evidence/browser-reproductions.json` 和五张截图。报告附带的 `tests/` 为上述脚本快照；交接目录没有 `repo/node_modules`，直接在那里执行不能找到依赖。

状态层脚本覆盖 R1/R1b/R2/R3/R4 与 A→B→A 正常对照；浏览器脚本覆盖 R2/R3/R4，身份分页使用 20+1 项。R3 中断请求只能证明前端未知结果恢复和新键行为，不能证明数据库提交/重复记录；要证明后者需隔离 MySQL 的提交后丢响应故障点。

## 既有网页专项

以下命令在隔离仓库的 `晶晶日上工程交接包/01_源码/frontend_ops_workspace` 中运行，本次已完成共 141 个检查点：

```sh
node tools/test-invoices-phone.mjs
node tools/test-contracts.mjs
node tools/test-customization-own.mjs
node tools/test-story-attachments.mjs
node tools/test-client-services.mjs
node tools/test-personal-center.mjs
node tools/test-stock-media.mjs
```

依赖本次通过 `npm ci --ignore-scripts --no-audit --no-fund` 安装在隔离目录。无需修改业务代码。现有日志见 `evidence/web-*.log`。

## 后端局部检查

在隔离 `backend_server` 目录：

```sh
node --test test/invoices-policy.test.cjs test/legacy-video-manual.test.cjs
```

4 项通过。旧入口测试会启动仅本机 HTTP；第一次沙箱监听失败日志和随后获准运行通过的日志均保留。未启动生产服务器、未访问真实生成服务。

本报告付款策略探针的等价复验：在隔离 backend_server 运行以下代码。它只调用纯校验函数：

```sh
node - <<'JS'
const {plan}=require('./src/modules/customization/quote-policy');
const lines=[{line_id:'synthetic',total_minor:10000}];
const triggers=['ORDER_ACCEPTED','CUSTOMIZATION_INTERIM_CONFIRMED','FINAL_ACCEPTED'];
for(const amounts of [[3000,6000,1000],[3000,4000,3000]]){
  const steps=amounts.map((amount_minor,i)=>({trigger:triggers[i],allocations:[{line_id:'synthetic',amount_minor}]}));
  try{plan(lines,steps);console.log(amounts,'accepted')}catch(e){console.log(amounts,e.code)}
}
JS
```

在隔离仓库根运行 `python3 scripts/full_business_check.py` 只检查登记完整性，本次显示 151 NOT_RUN；它不执行 151 条业务。

## 尚缺的完整复验

本机未配置可用 Flutter/Dart、MySQL/Docker。完整 App 和数据库业务链没有在本机执行。仓库 `docs/testing/evidence/contract-intake-20261102/README.md` 记录了现有隔离 MySQL 浏览器方式：配置专用 `JX_MYSQL_TEST_ENV_FILE` 和 `CHROME_PATH`，用 `node scripts/run-ui-browser-check.cjs 19 --built`、`20 --built`；证据必须另指定目录，不能覆盖历史结果。需要先配置真正隔离测试库，不能将正式数据库或真实订单用于本报告负例。

本轮未保存真实密钥、验证码或用户会话。脚本中 `synthetic-only` 字样只是无法登录真实系统的测试占位符。
