# 本批工作：成片5工作日与新报价切换保护

2026年11月2日。后端负责人chengcongcong222；起点29c4614d／原PR39。用户要求继续开发。本批没有修改前端文件或实际服务配置；前端负责人Bill-Billion后续按[合并接法](../../collaboration/client-complete-20261028/CONTRACT_CALENDAR_HANDOFF_20261102.md)接页面。

## 已做

纯日历计算、随规格/合同冻结的日历、最终版5工作日倒计时、前期稿件明确确认、重复收讫不延长、争议和文件失败暂停、重新交付重算、自动验收再次核对日期和当前版本；确认/争议保留原计时证据。新报价发布模式同时限制创建和报价审批，无类别制作规格也不能通过审批；旧格式规格保留给历史追加约定，不能用于普通新报价。已批准旧报价/旧订单按原承诺。

2026年官方来源日历候选已整理；正式发布需要规格审核，未知年份不补造日期。接口0.31.16-rc.1，数据库0192，无新表。实际默认服务仍保持原模式，不称全站已切换。

## 实施暂定口径

收到当日不计入，按北京时间第5个工作日结束；只有成片自动计时；争议恢复后重新正式交付、重新给完整期限。甲方材料给出5工作日，但未细化这些口径，已写入需求变更供整体审阅。不得把这里的实现决定归称为政府通知规定。

## 验证与边界

最终6个相关文件84项通过、0失败、0跳过（隔离MySQL、真实本机HTTP及纯规则）。整体后端1092项通过、0失败，1项因缺旧SQLite脱敏样本跳过。整体检查启动后补了日历过期拦截、非最终收讫不启动时钟、无类别制作报价绕过拦截和历史追加规格兼容；最终84项相关检查已覆盖这些修改，不称最终代码已全量重跑。成片523份、切换14份实际响应格式检查通过；验收登记检查通过，原151条仍未登记通过。

没有用真实账号/付款/供应商，随机隔离测试库结束清理；没有启动或重置人工会话。原151条验收登记保持原结果，App/网页需前端新版本到位后再测。未代队友认领/审阅，未合并或部署。

## 独立复验

在仓库根目录设置JX_MYSQL_TEST_ENV_FILE为本机隔离MySQL配置路径，配置内容不入Git；测试检查本机地址并新建随机库。

```powershell
node --require ./晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs --test ./晶晶日上工程交接包/01_源码/backend_server/test/working-calendar.test.cjs ./晶晶日上工程交接包/01_源码/backend_server/test/customization-contract-cutover.integration.test.cjs ./晶晶日上工程交接包/01_源码/backend_server/test/customization-delivery.integration.test.cjs ./晶晶日上工程交接包/01_源码/backend_server/test/redemption-checkout.integration.test.cjs ./晶晶日上工程交接包/01_源码/backend_server/test/customization-trade.integration.test.cjs ./晶晶日上工程交接包/01_源码/backend_server/test/customization-delivery-policy.test.cjs
python scripts/validate_contract.py --runtime-fixtures .local/customization-delivery-http-fixtures.json
python scripts/validate_contract.py --runtime-fixtures .local/contract-cutover-http-fixtures.json
```

整体后端使用仓库scripts/run-tests.cjs，媒体工具须设置本机FFmpeg/ffprobe/font路径。证据归档见[检查日志与边界](../../testing/evidence/contract-calendar-20261102/README.md)。

## 下一步

后端补现货L1+人工认证准入及模拟对照，前端先修恢复再接新合同页面；同版人工视频整链后回填正式验收。真正发布新规格、切换网站和启用供应商分别记录，不用自动检查替代。
