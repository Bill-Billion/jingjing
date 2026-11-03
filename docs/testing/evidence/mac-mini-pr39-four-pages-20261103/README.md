# 原四组页面局部证据

实际前提、预期、步骤、结果、标准对应及限制见 [PARTIAL_ACCEPTANCE.json](PARTIAL_ACCEPTANCE.json)；人读说明见 [报告](../../../reviews/mac-mini-pr39-four-pages-20261103/REPORT.md)。

受测后端504ae65/API0.31.26-rc.1/0209，前端20a0a25加修复工作树，文件哈希见 [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json)。无真实服务或收费；记录号均来自隔离合成数据库。访问令牌、账号引导密钥、测试数据库和APK没有入库。

`browser-results.json`为9组真实网页业务。`native-limits-first-run.*`包含限额前段通过及后段夹具失败，不能当整段通过；`native-rest-results.json`为修复夹具后的实际原生休息/切号续跑；`native-background-results.json`为绝对时间明确的实际HOME后台测试。`rest-real-time.*`为网页真正等待15分钟；Android到期用夹具，未混为同一证明。`rest-visibility.json`是Chrome无法产生hidden的未完成诊断，不是成功证据。

573/811/46分别为Web聚合、App的CI范围、后端专项测试计数。151标准正式状态未改变，本目录只关联适用局部证据。

入库日志只去除行尾空白，原始日志保留本机`.local/pr39-four-pages`；没有删除失败信息或改写检查结果。
