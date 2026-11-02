# 新合同付款后端：本批工作记录

2026年11月2日，后端负责人 chengcongcong222。起点c0c8532d，当前工作树client-testing，仍使用原PR39集中交付。前端负责人Bill-Billion负责页面，用户已转发上批恢复任务，本批不代其认领。

## 实现与边界

新规格按30/40/30及脚本确认中款执行，旧规格按原计划。统一报价和权益抵扣的整数金额计算；制作放行与最终尾款采用冻结规则，取消审核按已确认阶段限制上限。没有新增数据表或改写历史快照；修订附加订单仍独立一次付款，代做样片仍50/50。

[详细规则、前端接法和发布限制](../../collaboration/client-complete-20261028/PAYMENT_CONTRACT_HANDOFF_20261102.md)。新能力已开发，不等于全站新订单已经切换：旧规格尚可报价，工作日验收、发布新规格/停止旧规格新报价、页面联调和真实启用仍未完成。

## 验证

- 相关检查76通过、0失败、0跳过，含隔离MySQL和真实本机HTTP。
- 制作373份、用券76份实际响应通过OpenAPI检查；539操作/686结构，171正例/147反例。
- 初次检查发现新增测试直接从样片跳最终版，违反既有粗剪确认门槛；已修正测试按真实顺序走，不放宽业务门槛。
- 整体后端1074项：1073通过、0失败、1项因未提供旧SQLite脱敏样本跳过。媒体工具已指定，不跳过媒体检查。本批未做浏览器/App实测，无收费或真实供应商调用。
- 证据见 ../../testing/evidence/payment-contract-20261102/README.md。没有将原151条判为已通过。

## 版本与下一步

候选接口0.31.15-rc.1、数据库0192；本批先本地自验，再集中上传原PR39；未合并或部署。后端继续工作日验收及正式规格切换、现货准入，然后与前端完整验收人工视频链。昆山API/OSS不阻塞这些独立开发。

## 独立复验

在仓库根目录，先将 JX_MYSQL_TEST_ENV_FILE 指向独立本机MySQL测试配置（本机沿用 worktrees/full-flow/.local/mysql/runtime/test-env.json，不上传其内容）。测试会检查本机地址并新建、销毁随机隔离库。

```powershell
node --require ./晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs --test ./晶晶日上工程交接包/01_源码/backend_server/test/customization-payment-version.test.cjs ./晶晶日上工程交接包/01_源码/backend_server/test/customization-delivery.integration.test.cjs ./晶晶日上工程交接包/01_源码/backend_server/test/redemption-checkout.integration.test.cjs ./晶晶日上工程交接包/01_源码/backend_server/test/customization-policy.test.cjs ./晶晶日上工程交接包/01_源码/backend_server/test/customization-delivery-policy.test.cjs ./晶晶日上工程交接包/01_源码/backend_server/test/customization-trade.integration.test.cjs
python scripts/validate_contract.py --runtime-fixtures .local/customization-delivery-http-fixtures.json
python scripts/validate_contract.py --runtime-fixtures .local/redemption-checkout-http-fixtures.json
```

接口格式检查需要仓库既有Python依赖环境。完整后端命令为 `node ./晶晶日上工程交接包/01_源码/backend_server/scripts/run-tests.cjs`；媒体检查另指定本机FFmpeg/ffprobe/font路径。全量检查不代替前端实际复测及共享规则审阅。
