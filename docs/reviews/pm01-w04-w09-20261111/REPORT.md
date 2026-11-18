# W04—W09：本人订单来源已补，三包接法和九项服务准备已核

2026-11-11。后端负责人 chengcongcong222 已认领本批实现/复验/接入支援；前端负责人 Bill-Billion 的新三包认领未确认。产品仍在完整测试版收尾和上线前准备。隔离资料中，申请人可在本人订单副本看来源报价，运营可将冻结约定与交易记录做成同一文件，经独审后本人下载、失权拒绝、重开保留历史；尚非本批App→网页→App完整验收。

|施工项与原组位置|本批前后变化|状态/负责人下一步|
|---|---|---|
|W04，原04/11/17组|已有六交易分区和实际交付；新增source_quote_id及父关联/冻结合同一致性保护，商品约定确认复用已有CONTRACT；类别范围与未提供原因齐备|后端代码及合成文件交付通过；正式保留依据、第三方/供应商原件及具体申请完整交付继续|
|W05，原04/17组|旧申请/答复/历史/下载已有；核查account-data/transaction-data与完整运营取数增量未接|后端同申请文件复验通过；Bill-Billion页面接续、七异常端侧证据待交|
|W06，原06/17组|五动作后端已有；重验混合结果、同键恢复、并发、撤权与新价不改旧价；页面未接batches|Bill-Billion接原MCN工作区，后端按同批编号复验|
|W07，原07/17组|四类匹配已有；复验预算/许可/关闭预约/邀请上下文；两端未接matches|Bill-Billion补条件/理由/游标及榜单解释页面，后端配合|
|W08，原11/14/17组|不改业务规则；复验新30/40/30与旧30/60/10、免费创建/托管、版权许可及现货退款权益；补切换响应持续校验|后端局部通过；全部产品及两端同记录付款/退款/下载继续|
|W09，原16/18及相关业务组|九项服务在原外部台账各列具体产品确认状态、代码/材料/联调缺口及双方动作|准备已整理；真实产品/账号与验证未完成，昆山资料申请中，OSS最后|

这些映射与原18组交叉，不是新增六组。原18组正式关闭0/18；12条路线仍均部分；151标准19通过/76部分/56未登记足够证据。本批未提升任何单条或整组状态，未开发功能精确数量尚未核清。

## 需求与实施补全

依据[PM01 W04—W09](../../sources/pm01-20261111/03_本轮施工任务与验收.md)、[后端接手指令](../../sources/pm01-20261111/04_后端接手指令.txt)。W04原文：“重点核订单来源报价、商品特定约定、供应商凭据，不重复已验证77项”。[28号第一节](../../sources/contracts-20261029/extracted/28.md)要求机器可读副本。新增来源字段/关联校验属落实追溯的流程补全，不新增收费、留存年限或全量原件自动导出承诺。

具体范围见[类别与原件](../../requirements/PERSONAL_COPY_SCOPE_PM01_20261111.md)、[新旧规则](../../requirements/RULE_COMPATIBILITY_PM01_20261111.md)、[九项服务现有台账](../../operations/EXTERNAL_READINESS.md)、[原三包当前接法](../../collaboration/client-complete-20261028/FRONTEND_UI_AND_INTEGRATION_PLAN_20261109.md)。

## 实现与验证

接口0.31.55-rc.1，迁移0211。transaction-copy.js给ORDERS/SUMMARY增加可选source_quote_id，按冻结合同和订单父记录双核；不读取后改报价取代原承诺。缺失双边均为null，单边缺失或指向另一单返回503。既有同申请范围、独审、文件摘要和失权途中保护保持。

两轮12个测试文件：69+24=93项通过，0失败/0跳过；是检查数，不是功能数。[主回归](backend.tap)、[交付与版权](delivery.tap)及各JUnit保留每个实际场景。438份本批HTTP响应、291正例/232反例通过[协议校验](runtime-contract.json)；[文件哈希](captured-files.json)区分来源。[run.json](run.json)固定开工版本与源码摘要；Git实现/交付版本在CURRENT实际登记。

|业务检查|预期|本批结果与证据|
|---|---|---|
|来源和历史|本人买卖双方同来源；修改当前报价不改旧副本；串到他人报价拒绝；双边无记录为空|privacy-transaction-copy场景通过；请求未自动结案|
|同一申请交付|来源/冻结分期写入实际文件，提交独审后下载字节相同；未知/撤权/缺件/重开保护|privacy-response-delivery现有七场景扩展通过；[同记录编号](records.json)，只选定记录/不含原件|
|新旧规则|新旧规格各自使用已审版本，免费业务不造钱账，版权明确，退款不重发权益|切换/艺人/版权/钱包对应测试通过；[W08范围](../../requirements/RULE_COMPATIBILITY_PM01_20261111.md)列出未覆盖|
|批量及匹配|逐项结果和恢复无重复/越权，真实目录筛选不能扩大许可|两个batch和matching测试通过；页面未执行|

独立复验：在正式树设置JX_MYSQL_TEST_ENV_FILE指向隔离MySQL测试配置（只读配置，不输出秘密），进入backend_server，使用node --require ./scripts/test-network-guard.cjs --test --test-concurrency=4，运行privacy-transaction-copy、privacy-response-delivery、customization-contract-cutover、copyright-policy、copyright、artists-contract、wallet-refund-entitlement-journey、organization-batch、organization-merchandise-batch、prelaunch-matching、prelaunch-matching-catalogs、provider-readiness对应test文件。协议运行scripts/validate_contract.py --runtime-fixtures docs/reviews/pm01-w04-w09-20261111/http.json --report 本地报告路径。已有全套脚本也保留，新增切换响应已加入runtime-contract-manifest，不删减检查。

## 本批问题及处理

1. 前批ef438f89工具/App-Web成功；服务器42966031270在视频工具安装timeout后dpkg中断，业务测试未起。本批重试前增加dpkg --configure -a恢复，缺依赖时先修复依赖再完成配置，安装步骤预算改为15分钟，各子命令仍有上限；Windows不冒称执行过Ubuntu修复，已通过YAML解析和Bash语法检查，实际包安装恢复需本批远端核验。
2. 查实新旧合同切换HTTP输出未进入统一响应清单；补manifest并纳入customization定向套件。既有总回归保留，不据遗漏推断以往所有业务测试均未运行。
3. W05—W07两端具体增量入口未接，旧相关页面确实存在。按PM01保留前端主办，不覆盖整包文件、不替其认领。已写清冻结接口和同记录验收，可独立接续。
4. 九项外部服务有真实产品未确认/实现缺口，不能只等待密钥。按原台账分别推进；未提供的材料和日期不伪造，当前不重复索取申请中的昆山资料。

限制：合成账号、身份、款项、商品前置与仓储助手不是真实上游；部分业务步骤用HTTP，部分助手。未测本批全App/Web、真机、全产品退款/下载和新旧全部合同。未更新3490、未启用公网/收费/生产。共享接口仍待另一方实际审阅，PR39不自动合入。

下一步后端处理具体供应商原件/保留依据收到后的映射、产品确定后的绑定及01/02/04/10/11/12路线；前端W05/W03→W06/W07及03/05/06/07/08/09路线；双方同候选互审、固定版本、全端整链、真机与恢复/签收。全部后续见[原剩余计划](../../collaboration/client-complete-20261028/REMAINING_DELIVERY_PLAN_20261102.md)。


本批阶段提交6d8553e4cd41ffb912f705f6eca551f01fbd13d0已集中上传原PR39，远端头/草稿状态及交付说明已核对；未合入。工具42978771759成功；服务器42978771537与App/Web42978771549运行中，服务器已通过前批失败的视频工具准备步骤，完整结果尚未返回。另补privacy-copy整套兼容回归70项通过/0跳过，与前93项有重叠不相加为功能数。本回执、兼容日志与原资料覆盖表文字纠正本地保存，随下一阶段同步，不重复推送取消正在运行的检查。
