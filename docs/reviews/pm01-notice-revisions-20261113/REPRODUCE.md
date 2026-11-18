# 本轮复验入口

最终业务源码：64730abc4ca00cc3d37e5e51d15ef43c6c37437b。最终完整运行：backend-acceptance-2026-11-13T08-24-21-339Z-7c21c9；以最终summary、冻结源码清单和接口批量报告为准。

仅使用隔离MySQL 127.0.0.1:33316，jx_local/jx_dev配置从相邻full-flow/.local/mysql/runtime/test-env.json读取；测试创建并清理随机库。不要打印凭证，不碰3490。

1. 后端目录设置JX_MYSQL_TEST_ENV_FILE后，执行 `node --require ./scripts/test-network-guard.cjs --test --test-concurrency=3 test/notices-revisions.integration.test.cjs test/refund-restore.integration.test.cjs`。早期两份25通过见FINAL_FOCUSED_RUN.txt；最终新增consumer-controls、migration-rollback、recharge-refund-api、recharge-refund-recovery、recharge-refunds、refund-restore-authority、wallet七份关联测试一起执行，九份104通过见FINAL_CLOCK_FOCUSED_RUN.txt。
2. 根目录执行 `node scripts/run-backend-acceptance.cjs`。媒体配置使用已登记ffmpeg-9.0.2、ffprobe及Arial，分别设置JX_TEST_FFMPEG、JX_TEST_FFPROBE、JX_TEST_FONT。脚本固定全部源码并记录变更，不能运行中更换代码。
3. 按scripts/runtime-contract-manifest.json收集同次完整运行生成的81份HTTP文件；校对生成时间、文件摘要和冻结源码。执行 `python scripts/validate_contract_batch.py --manifest <本次隔离运行目录>/runtime-contract-manifest.json --report <本次隔离运行目录>/contract-batch.json`。
4. 新接口、示例和响应按contracts/openapi.yaml 0.31.60-rc.1核验，迁移0212未变。既有账户权限分类增加官方修订/历史入口，不放宽响应和失败规则。

## 历史运行与失败证据

- 初版c219f6c6完整1679通过、0失败、1旧库样本跳过，保留INTERMEDIATE_BACKEND；不作最终源码证据。
- 中间版本ec82d637完整1677通过、3失败、1跳过，保留INTERMEDIATE_SECOND_BACKEND和SECOND_FULL_FAILURE。退款恢复失败的原始字段差值未采集，具体原因仍是推断；CLOCK_FINDING区分只读时钟采样事实、夹具修正和验证限制。
- 早期两份25项、四份关联59项、初版58项及已付款专项11项均属于中间版本，和最终检查重叠，不相加。
- FIRST_FAILURE保留重复授予权限时夹具误用版本0的首次失败；已改用实际授权版本和独立合成规则键。三个CONTRACT失败文件分别保留重复YAML锚点、缺历史样例和样例name缺失。
- AUTHORITY_FAILURE记录独立审核误需官方发布权限的403；发布方权限继续保留，审核员使用既有独审权限。HISTORY_WITHDRAWAL_FAILURE记录已批准修订被通用撤回的200；最终仅待审修订可撤回。

外置AUTHORITY_PROBE、HISTORY_WITHDRAWAL_PROBE复现各自历史版本问题，不应在最终源码上期待同样失败。CLOCK_PROBE仅只读采样数据库与Node时钟差，不等于确定了原失败字段。

第三次0464ee52完整1670通过/8失败/1跳过见INTERMEDIATE_THIRD_BACKEND、THIRD_FULL_FAILURE；七份模拟回执生成统一数据库时钟，实际资金规则未改。两版外置充值诊断探针及其限制见RECHARGE_CLOCK_FINDING。最终64730abc及08-24运行独立记录。
