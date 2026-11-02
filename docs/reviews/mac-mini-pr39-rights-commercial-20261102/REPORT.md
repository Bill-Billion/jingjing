# Mac mini：版权三项与独立商用许可三项本地交付报告

产品仍处于最新合同接入与完整测试版验收阶段。本批六项 App/Web 接入已实现并完成所列本地自验；可在隔离合成环境办理版权报价、IP采购和商用许可，正式新售保持关闭。用户已于14:36 UTC重新明确允许提交和推送本批到原PR39。本材料为集中交付候选；最终准确提交及CI状态随本机交付回执记录，不沿用基线CI。

原范围为18组、12条业务路线、151条标准。本轮位于版权/许可收尾，六项实现6/6、对应本地分层验证6/6；同事复验0/6、真实启用0/6，集中远端交付单独核对。这里的6/6不等于六条全原生完整业务通过。原18组的开发完成数仍未逐组核清；12条完整路线未统一关闭；151条正式登记保持0通过、151 NOT_RUN，已有局部证据按标准编号单列。

## 版本与交付状态

- 基线与当前本地HEAD：`a509d64462aeefbd7a13d058a3aeeb270c564c15`，接口 `0.31.22-rc.1`，迁移 `0201`。本批修改在工作树，准确文件摘要见 SOURCE_MANIFEST.json。
- 2026-11-02本次只读复核 [PR39](https://github.com/Bill-Billion/jingjing/pull/39)：OPEN草稿，目标integration，远端仍为上述SHA，7项检查成功。这是基线CI，不是本批新改动的CI。
- 既有认领：[PR评论](https://github.com/Bill-Billion/jingjing/pull/39#issuecomment-6577663243)。本次没有再次发表。
- 授权事实：父任务此前报告两次授权校验未接受历史授权，暂停期间无本批远端动作。用户2026-11-02 14:36:07 UTC明确回复“允许”，现恢复本批提交/推送。按原PR39集中交付并核准确SHA CI，不合并、部署或开启新售。
- 未合入integration、未部署、未更改生产商用开关。原用户仓库及历史报告保留。

## 六项结果及实际边界

### RC-01 定制版权主动选择与原合同

预期：新报价明确选两种版权之一，客户付款前看到归属和许可；30/40/30、脚本确认、交付及原单不变。

实际：两种模式各一单真实Vue办理至成片下载；无选择、陌生账号及旧单保护由MySQL专项验证。App字段、展示及校验已接并经单元/构建验证，本批未重走完整原生定制付款链。

映射：原组11,15,16,17；标准 ACC-DEL-15.03, TASK-15, E2E-02。限制：原ACC-DEL-15.03保留旧90%/10%原文；新30/40/30依据20261029合同单列。未覆盖完整E2E-02所有跨端案例。

证据：[copyright-buyer.json](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/copyright-buyer.json), [copyright-producer.json](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/copyright-producer.json), [copyright-ip-stock-mysql.log](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/copyright-ip-stock-mysql.log), [app-tests.log](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/app-tests.log)。

### RC-02 样片版权和人格权、本人确认

预期：新记录分开成片版权人及人格权人，机构只能代办，不能代本人确认；旧ARTIST_RETAINS_OWNERSHIP原文保留。

实际：Vue三个绑定含真实本人提交；Android机构与艺人同一新/旧绑定读取、勾选及确认，API持久化后Vue复核；机构API拒绝404、页面禁用。新旧50/50完整交付/取消/撤权另有20项MySQL专项。

映射：原组1,2,5,11；标准 ACC-DEL-05.01, ACC-DEL-05.02, TASK-02。限制：原生本场覆盖绑定与本人确认，不冒称原生50/50付款交付全链；TASK-02其他机构权限场景尚需统一验收。

证据：[sample-web.json](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/sample-web.json), [sample-native.json](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/sample-native.json), [sample-mysql.log](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/sample-mysql.log)。

### RC-03 IP买断/分红采购与依据收益

预期：按合同选择买断或分红；权属与签署材料独审、项目绑定、开发上线事实及分红独审；8%应计不显示转账。

实际：Vue两种采购各一组实际材料上传、预留、证据、生效和绑定；分红开发/上线及40000分应计、断网刷新同键恢复。Android读取同两份许可/应计，系统选文件上传、提交买断项目开发依据并经独立API审核。重复/重叠、撤回资格及到期旧项目边界有MySQL专项。

映射：原组11,16,17；标准 ACC-DEL-13.03, ACC-DEL-13.04, TASK-11。限制：独立审核部分由本地认证API执行；作者撤回与到期分支未逐一原生办理。原13.03/13.04仅相关子项，不等于整个参演发行验收。

证据：[ip-web.json](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/ip-web.json), [ip-native.json](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/ip-native.json), [copyright-ip-stock-mysql.log](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/copyright-ip-stock-mysql.log)。

### RC-04 商用逐人授权和上架双审

预期：每个人明确商用用途和地域期间；仅个人授权不足；独立权利审核必须核商用依据。

实际：真实Vue填写商用规格、本人用途授权及权利/内容双审；未选具体用途禁提交。机构及授权覆盖拒绝由隔离MySQL专项验证；App对应表单与选项已接。

映射：原组1,2,5；标准 ACC-DEL-05.02, TASK-01, TASK-02。限制：商品准备与认证使用合成夹具，上架创建走真实仓库；此场未在Android重新填完全部卖家/运营表单。

证据：[stock-web.json](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/stock-web.json), [copyright-ip-stock-mysql.log](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/copyright-ip-stock-mysql.log), [app-tests.log](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/app-tests.log), [web-tests.log](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/web-tests.log)。

### RC-05 商用商品、机构付款前许可

预期：按原商品明示价格、用途、地域、期间，不默认同意；合格机构负责人可购买商用，旧个人许可不升级；默认新售关闭。

实际：Vue合格机构确认品牌宣传范围，下单已落库后断网、刷新并同键恢复到同一订单；模拟付款后私有字节哈希相同；Android同机构读取同一有效订单。默认商用关闭与旧个人单兼容有专项。

映射：原组1,11；标准 ACC-DEL-05.03, TASK-01, E2E-01。限制：ACC-DEL-05.03原文针对个人非商用，新商用作为合同扩展；原生本场读取订单，不冒称原生下单或系统保存。

证据：[stock-web.json](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/stock-web.json), [stock-native-active.json](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/stock-native-active.json), [copyright-ip-stock-mysql.log](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/copyright-ip-stock-mysql.log)。

### RC-06 原单下载、撤权到期退款及恢复

预期：每次受控下载核当前权限；撤权、到期及独立退款阻止下载，订单原许可和合同哈希不改；未知结果不重复下单。

实际：同一Vue订单撤权返回409，到期返回STOCK_COMMERCIAL_LICENSE_NOT_ACTIVE；恢复夹具后售后独立处理与模拟退款，REVOKED且原合同哈希及许可相同。Android再读同订单显示撤销；两端退出清旧信息。

映射：原组1,11,16,17；标准 ACC-DEL-06.03, E2E-01。限制：日期/撤权切换在隔离夹具进行，退款网关为模拟回执；未作真实收费、退款、媒体质量或151条完整验收。

证据：[stock-web.json](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/stock-web.json), [stock-native-revoked.json](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/stock-native-revoked.json), [copyright-ip-stock-mysql.log](../../testing/evidence/mac-mini-pr39-rights-commercial-20261102/copyright-ip-stock-mysql.log)。

## 可复验步骤与记录

全部使用独立随机MySQL库、合成角色/文件，实际Chrome页面和Android API35 ARM64原生APK；App启动用合成登录引导，之后请求走本地真实API/MySQL。支付、签署及权利材料是模拟事实，不代表真实认证或到账。记录库已按任务清理，以下编号用于关联证据；重跑脚本会生成新编号。

1. 定制：分别运行人工视频浏览器脚本，设置 BUYER_OWNERSHIP 和 PRODUCER_OWNERSHIP_LICENSE。客户提交故事，运营按已审规格选版权报价、独立审批，客户核对并接受；模拟付款、脚本改版重确认、样片/成片收讫、争议暂停重发、尾款后下载。两种均通过；旧30/60/10合同未被新比例覆盖。
2. 样片：机构和艺人分别打开同一新/旧绑定，机构无本人确认入口；艺人在Android核具体真人、数字人和条款后确认，再由独立Web会话读取已保存结果。第三份绑定由Vue本人实际确认。两端退出使用各自会话，退出后不可沿用该令牌。
3. IP：供稿方新建买断/分红产品并上传分类材料，独立审核；采购方预留、提交签署/付款或结算附件，独审生效后绑定项目。分红提交开发/上线及账期，故意丢弃已落库回复，再刷新同键恢复；8%应计40000分，状态仍未转账。Android读取同两份许可、实际系统选文件上传并新建开发事实，独立API审后回读。后端专项另验证撤回资格、永久/期限边界及重复账期拒绝。
4. 商用：本人声明具体用途，卖家选独立商用规格，运营分别权利/内容审核，合格机构确认范围。下单已落库后断网/刷新，同键恢复同一订单；模拟付款后Vue下载字节哈希相同，Android读同单。撤权/到期拒绝下载，售后独审及模拟退款后再用Android读同单撤销，原合同及许可不变。

本批标准映射纠正：初始认领表把ACC-DEL-07.03、16.02、E2E-10/12宽泛关联到版权/IP；重新读取原文后，取消这些直接覆盖映射，因其分别涉及报价变更、共创人数、完整机构分账或参演发行等未完整覆盖的流程。原标准不改写，局部证据不伪装成正式PASS。

### copyright-buyer 实际记录

```json
{
  "story": "e01dabff-476b-48fe-bb47-98dd62f853ba",
  "quote": "6713713b-b191-4649-89c4-7405584d4a33",
  "order": "86aed105-eaee-402d-9c29-8a955cbf7f7d",
  "project": "c321c774-1fa1-4a42-b634-26abfa27767e",
  "receipt": "b5cb1c1f-e648-4780-99cd-fe73fdd4a816"
}
```

### copyright-producer 实际记录

```json
{
  "story": "b3f8f7f6-0416-4c9d-99c9-8fea21f53b84",
  "quote": "e45b3bb1-eab4-4a0d-aac9-9c41aeeb7933",
  "order": "936ee372-4071-45b3-b499-042d9271bec4",
  "project": "60fd9f85-6b1e-4b41-aef8-4fd8dfcf78ff",
  "receipt": "357aeca0-ed2d-4b79-aebf-a6dd7bca1089"
}
```

### sample-web 实际记录

```json
[
  {
    "request_id": "3813a633-7713-459a-801e-ddb5553fb985",
    "mode": "modern",
    "merchant_party_id": "638afc8c-f269-4d7e-8a53-d39176f94295",
    "artist_party_id": "ae25b6d4-cfb6-4a7f-a70e-2805cd0e17b6"
  },
  {
    "request_id": "e5e49efc-ff4f-4a9e-a85c-c26ddfc40de2",
    "mode": "legacy",
    "merchant_party_id": "638afc8c-f269-4d7e-8a53-d39176f94295",
    "artist_party_id": "ae25b6d4-cfb6-4a7f-a70e-2805cd0e17b6"
  },
  {
    "request_id": "65006252-792b-4c6f-84d9-8cb6ee8508fb",
    "mode": "web",
    "merchant_party_id": "638afc8c-f269-4d7e-8a53-d39176f94295",
    "artist_party_id": "ae25b6d4-cfb6-4a7f-a70e-2805cd0e17b6"
  }
]
```

### ip-web 实际记录

```json
[
  {
    "mode": "BUYOUT",
    "product_id": "8ba943dd-0901-44ed-a83a-157f6cf03756",
    "reservation_id": "fc7b8d33-9288-4e13-928b-e40301b29bef",
    "evidence_id": "4c34cad5-017d-4e07-a809-636a9b616c11",
    "grant_id": "729770b5-a373-4183-8ca4-8705b81f94fd",
    "project_id": "28c352e5-0f1b-4ae4-8bd6-2f62531a8c9f"
  },
  {
    "mode": "REVENUE_SHARE",
    "product_id": "1dfcb9b3-d87b-4614-a4bd-6b7edbe12c83",
    "reservation_id": "b91f1049-cd40-4b79-ab2b-eeb004613020",
    "evidence_id": "4da5e7d8-f5f4-464b-88aa-4fa699b3e2a3",
    "grant_id": "8251c619-b4cd-47ec-ba7c-b5bcaa236d36",
    "project_id": "3c62d972-2413-4b8c-b2c4-579360077da4",
    "DEVELOPMENT": "828e7e12-c1a1-4d0c-9c72-b6076f67a3b2",
    "PUBLICATION": "14f3d687-99d0-4d6d-9cc0-5e38f423bef6",
    "statement_id": "c91d32b3-c905-402b-b453-01651d040d80"
  }
]
```

### ip-native 实际记录

```json
[
  {
    "mode": "BUYOUT",
    "product_id": "8ba943dd-0901-44ed-a83a-157f6cf03756",
    "reservation_id": "fc7b8d33-9288-4e13-928b-e40301b29bef",
    "evidence_id": "4c34cad5-017d-4e07-a809-636a9b616c11",
    "grant_id": "729770b5-a373-4183-8ca4-8705b81f94fd",
    "project_id": "28c352e5-0f1b-4ae4-8bd6-2f62531a8c9f"
  },
  {
    "mode": "REVENUE_SHARE",
    "product_id": "1dfcb9b3-d87b-4614-a4bd-6b7edbe12c83",
    "reservation_id": "b91f1049-cd40-4b79-ab2b-eeb004613020",
    "evidence_id": "4da5e7d8-f5f4-464b-88aa-4fa699b3e2a3",
    "grant_id": "8251c619-b4cd-47ec-ba7c-b5bcaa236d36",
    "project_id": "3c62d972-2413-4b8c-b2c4-579360077da4",
    "DEVELOPMENT": "828e7e12-c1a1-4d0c-9c72-b6076f67a3b2",
    "PUBLICATION": "14f3d687-99d0-4d6d-9cc0-5e38f423bef6",
    "statement_id": "c91d32b3-c905-402b-b453-01651d040d80"
  }
]
```

### stock-web 实际记录

```json
{
  "spec": "2dee089d-c599-489d-be09-3c895803b13c",
  "consent": "e28c3523-7fe1-41be-86ba-8c447a447d36",
  "listing": "1f9bb824-20c9-48f7-8499-11197a816814",
  "order": "351ef6a2-7aa8-4ae7-ba27-a8c151c00db9"
}
```

## 实际发现并修复的问题

|问题|复现与根因|修复与证据|
|---|---|---|
|App新采购事件/账单不能解析|真实IP许可带PROCUREMENT_EVENT/ROYALTY_STATEMENT关联记录，旧兜底当READING解析|只对READING走阅稿分支；真实合成响应回归先失败后通过，Android同记录读取通过|
|App采购项目下拉超出窄屏|原生实际布局溢出118px|下拉展开占宽并省略长标题；干净原生复跑通过|
|网页商用原单被写成个人永久许可|旧BusinessOverview固定个人用途文本|共用StockLicenseFacts按原单scope/期间/用途显示；渲染断言及实际机构页面通过|
|IP未知写入结果刷新后丢失|许可办理只保留内存中的原请求|按账号/身份/权限/路由保存原键与正文，恢复前核对；401保留登录续办，403/权限变化清理，迟到响应不回写；实际账单已落库断网刷新保持同键同记录|
|采购数据被旧产品/数量上限误判|新采购付款条件、无限集数仍受旧许可校验|按采购分支校验；实际200000集项目绑定通过，旧普通许可约束保留|
|样片机构网页仍能点本人确认|后端拒绝404，但按钮缺本人权限判断|按当前owner及rights_owner_party_id禁用，已确认版也禁重复；先失败回归后通过，Vue与Android双角色验证|
|样片正式文件动作缺类型|请求字段未附media type|补video/mp4并加断言；不是放宽后端媒体审核|

相邻规则补全：版权选择切换到样片时清不适用模式；逐人授权选项显示实际用途、地域和期限；新增页面沿原导航、权限和失败恢复流程。没有修改后端业务实现或抢接同事另一批六项工作。

测试执行中另有脚本问题：系统文件选择需点击可点击父节点、样片确认漏点对话框、两端共用令牌导致退出后401。均调整测试脚本后单次完整复跑；未为测试放松权限。重复开发事件返回IP_EVENT_ALREADY_VERIFIED是正常防重，改用尚无开发事实的买断项目测试新建。

## 检查结果

|检查|结果及边界|
|---|---|
|App CI同范围测试|794通过；Dart分析无错误/警告，9条既有info；普通Flutter web构建通过|
|网页全套与构建|548检查通过；vue-tsc和Vite构建通过；构建仍有既有大chunk提示|
|后端实际MySQL|版权/IP/商用21通过，样片新旧20通过；未宣称重跑完整1207套后端|
|真实Vue页面|定制两种各5组、IP两种与恢复、样片双角色新旧确认、商用机构购买到退款限制均有实际证据|
|原生Android|IP同两份许可及上传/开发复核1场；样片机构/本人新旧确认1场；商用同单有效/撤销各1场。不是iOS、安卓物理真机或所有页面完整原生链|
|结构与合同|协作检查、151登记结构、19个登记检查测试、OpenAPI检查、6个动作结果检查通过；结构通过不代表业务标准通过|

证据截图为真实本地运行画面。合成下载文件校验字节一致，但并非可播放成片，不作为画质、水印或播放质量验收。安装包/构建和临时凭据未上传；真实媒体、系统保存和全量异常跨端检查仍按统一验收计划补齐。

## 实现位置与复验入口

文件相对源码包 `晶晶日上工程交接包/01_源码`：

|事项|App|Vue|
|---|---|---|
|版权选择和合同|`lib/rights/rights_models.dart`、`rights_widgets.dart`；`lib/trade/trade_{models,widgets,pages}.dart`|`src/api/modules/rights.ts`、`CopyrightChoice.vue`、`CopyrightFacts.vue`、`TradeSpecForm.vue`、`TradeRecordPanel.vue`|
|样片本人权限与双权利|`lib/production/manual_sample_page.dart`|`src/business/availability.ts`、`participation.ts`、`BusinessDetails.vue`|
|IP采购、事件及收益|`lib/licensing/{procurement_models,procurement_form,procurement_widgets,license_models,license_api,license_pages}.dart`|`src/api/modules/{procurement,licensing}.ts`、`IPProductForm.vue`、`IPGrantActions.vue`、`IPProcurementFacts.vue`、`LicensingView.vue`、`useLicensing.ts`|
|商用逐人/原单|`lib/artists/artists_{models,forms}.dart`、`lib/stock/stock_{models,pages,listing_form,api}.dart`|`src/api/modules/artists.ts`、`ArtistForm.vue`、`src/business/stock.ts`、`StockLicenseFacts.vue`、`BusinessOverview.vue`|

本地复验工具：`scripts/pr39-rights-sandbox.cjs` 与 `pr39-rights-browser-check.mjs` 建IP同单场景；`pr39-rights-native-check.mjs` 运行原生；`pr39-sample-rights-browser-check.mjs`、`pr39-stock-commercial-browser-check.mjs` 编排同记录浏览器/Android（后者设置 `JX_NATIVE_STOCK=1`）；人工定制脚本设置 `JX_PR39_COPYRIGHT_MODE`。工具使用本机隔离MySQL 33316、合成API及Android模拟器；必须引用本地私有环境文件，不能复制真实凭据。实际操作系统文件选择脚本在 `pr39-rights-native-picker.py`。

执行环境：Flutter3.47.5/Dart3.13.4、JDK17、Android API35 ARM64、MySQL8.4.11；原生测试与源码放在同一工作区。标准App和网页命令按当前CI范围执行，完整输出已归档。无后端业务代码或OpenAPI字段修改。

## 全局剩余与双方下一步

- 本批前端：本地代码、自验与材料齐备；新的用户确认已到，集中提交/推送原PR39并检查准确SHA的CI；随后由后端负责人chengcongcong222实际组合复验和共享规则审阅。不能把本地自验写成同事已验。
- 待页面：同事另一个SIX_CONTRACT_HANDOFF的机构7日交接、现货/试镜48小时、直推10–15%、监护退款、核验后注销时限、侵权/反通知，均不在本次认领中。当前六项不重复开发，新增批次需另行确认范围。
- 后端仍独立推进：财务日批次、手续费/流水、退款尾差核查，12条路线同版资料与151条证据整理；未确认缺口总数，不能说后端只等前端。
- 待完整验收：12路线全部正常/逆向/越权/重复/状态变化/恢复，原18组逐项关闭；固定同版App/Web产物、独立审阅、备份恢复/回滚、甲方人工体验。当前无完整甲方候选冻结。
- 真实启用：昆山API各产品账号权限、正式主体/联系人/合同附件，OSS上线前最后购买测试；真实支付退款/短信/人脸/签署/供应商与媒体质量另行验证。商用新售、真实儿童采集及真实收费均保持关闭。

用户已明确允许本批提交推送，不再重复索要授权。新六项工作包若决定继续，再转达相应认领。真实资源等到对应联调/发布节点再提供，不通过聊天发送密钥。
