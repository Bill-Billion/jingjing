# 上线前盘点：未实现部分和剩余计划

2026-11-05。后端负责人chengcongcong222，前端负责人Bill-Billion。用户暂不急于人工检查，本轮先盘点。代码f465df13已含前端157b47e3，三组远端检查全部成功；PR39仍草稿，未合入integration/468df28a。未改变业务代码、原库或公网时限。

## 计数口径

至少7类正式能力仍有实现/接线工作，另3类功能边界需核清；不能概括为只等甲方给密钥。7是工程主题数，不是全部未实现需求的精确数量；与12条整链及8个上线工作包有交叉，不相加。原18组都有实现/局部证据，正式关闭0；12条均有分层证据；151条正式NOT_RUN，82条挂局部证据。69条未挂关联不等于69个未开发功能。

本轮逐条读取151项登记并定位30个原交付包实现入口，未逐行为执行所有业务，不宣称全部需求已经彻查无遗漏。已交付前端、页面接入、整链验证和正式启用分开统计。

## 7类明确未接完的工程工作

|工作|当前事实|后端与前端分工|依赖与完成标准|
|---|---|---|---|
|D01 昆山实名与活体|默认核验binding为空；旧services文件不等于新版MySQL已接|后端补供应商提交/查询/年龄/未知恢复及主入口；前端接真实核验和返回|具体产品、权限、私密配置；同账号成功/拒绝/超时及未成年拦截可验|
|D02 App和网页真实付款|服务端已有支付宝App/Apple；两端当前不能实际发起支付|前端接真实收银及回跳；后端补网页产品/商户/回调查单退款；iOS若首发另补StoreKit|产品与商户明确，真扣款/取消/未知恢复/退款回执；回跳不代替查单|
|D03 资金托管、余额支付和实际分账|账本/冻结/退款已有；CUSTODY拒绝，自动出款未实现|后端接托管产品充值/消费/分账/退款与实际T+1和对账；前端接正式操作及资金状态|需具体持牌产品，普通支付宝不能代替；渠道与平台账一致、重复/退款/冻结有证|
|D04 真实电子签署|合同内容快照和确认已有；电子签默认无具体业务绑定|后端补任务/签署方/回调/文件/拒签；前端接真实跳转和恢复，区分已存与已签|需产品/模板/昆山印章权限；各方实际签完、摘要一致，不以付款代签署|
|D05 长期可复用数字人和声音|免费档案与托管权益已有；长期模型明确未启用且无绑定|后端接实际资产创建/查询/复用/停用/删除回执；前端分清档案受理与模型就绪|需真实可复用资产产品、授权素材和预算；真实资产ID及复用验证，不恢复客户自助生成|
|D06 内容审核供应商及音频覆盖|新版已有阿里云文字/图片/MP4；无音频分支，火山实际账号未接此链|后端按实际产品补火山或确认复用阿里云，补音频/长文本；前端展示等待/拒绝/复核|需产品、媒体范围和私有读取；四类媒体真实结果绑定原文件，未知不放行|
|D07 App离线消息推送|站内通知和偏好已有；发送器仅test环境模拟|后端接供应商/设备/发送查询及失权重核；前端接系统许可、设备和点击返回|需应用配置；关闭/免打扰/失权生效。若首发仅站内，应明确范围，不能当离线推送已交付|

D04所缺为自动电子签集成；现有真实线下签署材料归档可继续，但不能冒称供应商电子签已完成。D05不恢复客户自助生成，人工视频工单已有。D07不把站内消息当缺失，首发若不承诺离线推送须明确范围。D06不否认已实现的阿里云审核。短信和OSS已有具体适配器，主要是新主体配置、实测和迁移，不重复计为从零开发。

## 可复核代码证据


### D01 昆山实名与活体

原18组：1/2/5/13/16/17；原包：DEL-02。

- [identity-provider.js:6](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/artists/identity-provider.js)；核对锚点：implemented:false
- [main.js:13](../../../晶晶日上工程交接包/01_源码/backend_server/src/http/main.js)；核对锚点：const app=createAccountApi

### D02 App和网页真实付款

原18组：1/11/12/15/16/17；原包：DEL-07。

- [trade_pages.dart:867](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/trade/trade_pages.dart)；核对锚点：当前客户端不能发起实际支付
- [TradeView.vue:102](../../../晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/views/TradeView.vue)；核对锚点：浏览器支付客户端尚未开放

### D03 资金托管、余额支付和实际分账

原18组：11/12/14/16/17；原包：DEL-08,DEL-17。

- [providers.js:42](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/trade/providers.js)；核对锚点：CUSTODY_PROVIDER_NOT_CONNECTED
- [review.js:20](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/settlement/review.js)；核对锚点：NOT_IMPLEMENTED

### D04 真实电子签署

原18组：2/11/15/16/17；原包：DEL-07,DEL-27。

- [adapter.js:5](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/providers/adapter.js)；核对锚点：ESignProvider:
- [business-gate.js:17](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/governance/business-gate.js)；核对锚点：if(!binding)
- [account-api.js:13](../../../晶晶日上工程交接包/01_源码/backend_server/src/http/account-api.js)；核对锚点：governanceBindings={}

### D05 长期可复用数字人和声音

原18组：5/16/17；原包：DEL-03,DEL-24。

- [provider.js:11](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/production/provider.js)；核对锚点：implemented:false
- [context.js:29](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/artists/context.js)；核对锚点：long_lived_model_status:'NOT_ENABLED'

### D06 内容审核供应商及音频覆盖

原18组：1/5/9/16/17；原包：DEL-24。

- [moderation-provider.js:18](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/media/moderation-provider.js)；核对锚点：provider_code:'aliyun-green'
- [moderation-provider.js:29](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/media/moderation-provider.js)；核对锚点：MODERATION_FORMAT_UNSUPPORTED

### D07 App离线消息推送

原18组：10/16/17；原包：DEL-12,DEL-23。

- [push-delivery.js:27](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/operations/push-delivery.js)；核对锚点：environment==='test'
- [push-delivery.js:39](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/operations/push-delivery.js)；核对锚点：real_services_enabled:false

## 需求原文与实施补全

- [00号第二条](../../sources/contracts-20261029/extracted/00.md)：“发布、交易、创建数字人前须完成 L1 实名认证（免费）”。D01依据。

- [00号](../../sources/contracts-20261029/extracted/00.md)：“数字人创建（含基础形象与声音）、数字人资产/云托管均永久免费”。免费权益不代表长期资产已建成，D05须另有实际结果。

- [35号资金与清分](../../sources/contracts-20261029/extracted/35.md)：“用户资金一律通过持牌支付/清分机构托管与 T+1 清分”。D02/D03不能用模拟到账或普通支付替代。

- [17号签署栏](../../sources/contracts-20261029/extracted/17.md)：“平台（甲方·盖章/电子签）”。D04区分快照、业务确认与真实签署；不能只看按钮文字。

- [V5验收ACC-DEL-24.02](../../baselines/v5-d1/data/acceptance.json)：“文本、图、音视频自动审核结果加人工复核。”D06依据。

- [37号](../../sources/contracts-20261029/extracted/37.md)：“推送可自助关闭或设置免打扰时段”。D07偏好已有，真实送达仍未接。

- [19号](../../sources/contracts-20261029/extracted/19.md)：“平台不提供用户自助式深度 AIGC 生成。”继续人工制作，不新增提示词或拍同款产品。

上表供应商绑定、状态恢复、设备管理、回调验签和同记录核对是完成上述需求的实施补全，不冒充甲方原话；具体产品与上线范围不能由工程默认配置代替确认。

## 3项尚需核清的功能边界

|工作|现有事实|核清办法和负责人|
|---|---|---|
|U01 个人资料副本完整范围|personal-copy.js支持5类，部分仅元数据/订单索引；合同/模型还有业务读取及人工请求，不能等同全部副本已交付|后端逐类核答复附件/实际可取内容；前端核下载恢复。确认不足归原4组，不新增导出其他人的原件|
|U02 机构多艺人批量办理|单艺人授权、员工、报表已有，DEL-25.02多艺人与逐项拒绝仍缺完整证据|后端核逐项授权/失败明细，前端核批量选择与结果；不凭batch命名缺失断言全无实现|
|U03 智能匹配与普通筛选|search.js是真实字段筛选，精选是EDITORIAL_SELECTION，不是智能模型|双方核DEL-04.03有依据/明确未开通及首发承诺；若启用智能匹配需明确输入/规则/验收，不编造已上线能力|

## 12条业务继续按原分工收尾

详见[12路线逐项剩余](REMAINING_DELIVERY_PLAN_20261102.md)。后端主办01/02/04/10/11/12，前端主办03/05/06/07/08/09。先同一订单从首次入口到结果，再补退款/撤权/断网/切身份。已有六路线前端已认领交付，不再派为未开发；本次正式接入新增建议待安排，未代确认认领。

## 上线前8个工作包

|包|工作与负责人|依赖和完成条件|
|---|---|---|
|L01 需求口径与范围清理|后端补5处旧预期、核U01–U03，前端对照实际页面|旧原文保留，每个待办明确来源/缺陷/完成标准|
|L02 全业务收尾和正式验收|双方按六条/六条推进12路线，后端归档151条|同版/同记录/所需端全部正常与异常满足再结案；不能按CI批量通过|
|L03 七类正式接入及新主体迁移|后端主接服务，前端接SDK/收银/签署/回跳；甲方给产品权限|D01–D07及昆山短信；先离线验证，再按授权做真实测试，费用另核|
|L04 主体协议和经营配置|甲方定稿，后端配置/独审，前端核展示|信用代码/联系人/留存依据、签约模板、商品规格/价格期限、奖池概率成本与兑现人、财务办理人齐套；旧单不改|
|L05 正式环境与运维|后端主办，前端交固定产物|主机/MySQL8/任务进程/HTTPS/权限/密钥/告警/容量/备份恢复回退实演；使用新版start:api而非旧app.js；资源和生产授权另落实|
|L06 OSS最后购买和迁移|甲方最后采购，后端迁移，前端核文件操作|原文件字节一致、私有权限、过期/撤权/删除/失败恢复及回退；本地通过不代替|
|L07 客户端发行与数据治理|前端主办签名/商店资料/SDK时序，后端数据清单，甲方发行账号|安卓正式签名、升级、弱网、小屏大字、权限和日志；iOS/小程序若首发另列，不能默认已交付；备案等由甲方/专业人员按实际产品核适用性|
|L08 审阅、甲方验收与发布|双方共同，后端组织候选/问题单/阶段合入，甲方确认|阻断消除、共享规则实审、固定版本和回退；先测试后正式放行，合并不等于上线|

L01/L02可现在独立推进；L03先做接入契约及离线准备，供应商代码按实际产品，不能臆造API。L04资料申请与L05方案并行；L06坚持最后采购；L07可提前准备；L08取决于前面证据。本轮不报未经验证的剩余总工时或承诺明天正式上线。

## 何时向甲方要资料

现在可一次收集五包状态：①昆山短信/实名/审核/数字人产品及审核状态；②支付商户与托管/分账具体产品；③电子签产品、模板和印章权限；④主体信用代码、联系人、留存依据及正式商品/奖励参数；⑤上线主机/域名归属、发行账号/签名材料。密钥只放约定私密本机路径，不进聊天/Git。39份合同不重复索要整包，OSS不提前购买。真实联调前必须拿对应配置，缺哪项只阻塞哪项，不使全部开发等待。

## 本轮更正与验证限制

补5处有效预期：ACC-DEL-02.02分类认证、03.02免费创建与长期资产、03.03免费托管、07.01新30/40/30、20.02新10%–15%直推。依据已经确认的新材料和已实现规则补登记，原source_expected、证据和151状态不改。不是本轮新定商业规则或降低验收门槛。

这是需求/代码/远端审阅，未重跑所有业务；三组成功CI只对应f465df13。7项为明确关闭/未绑定/客户端不能执行的工程主题，下限而非所有原子需求总数。3项边界待实际办理核清。证据哈希、151项范围和30包对应见[AUDIT.json](../../reviews/prelaunch-20261105/AUDIT.json)。

## 30个原交付包实现入口索引

入口存在仅用于定位，不代表所有行为已实现/已验收；原18组及12路线执行账继续保留。

|包|原登记范围摘录|后端位置/网页位置|已知缺口|
|---|---|---|---|
|DEL-00|复核头提交、目标分支、CI、祖先关系和机密文件；只合integration。|backend/src/modules/governance, web/src/views/ContractsView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-01|同一账号可买也可供给，签约主体独立选择。|backend/src/modules/party, web/src/views/WorkspaceView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-02|服务端维护已核验/待核验/受限年龄状态及证据引用。|backend/src/modules/artists, web/src/views/ArtistsView.vue|D01|
|DEL-03|一人多个数字人；同人造型不增加独立权利人或钱包。|backend/src/modules/artists, web/src/views/ArtistsView.vue|D05|
|DEL-04|仅输出获准公开的照片、声音和资料。|backend/src/modules/directory, web/src/views/DiscoveryView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-05|现成成片许可、代做样片服务、定制预览版分别管理。|backend/src/modules/stock, web/src/views/BusinessView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-06|购买现成成片不填故事、不强制拥有数字人。|backend/src/modules/stock, web/src/views/BusinessView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-07|定制30%→累计90%→尾款10%；样片制作50/50；试镜总价一次支付。|backend/src/modules/trade, web/src/views/TradeView.vue|D02,D04|
|DEL-08|样片18%、商单/试镜22%先扣，供给余额默认艺人80/MCN20。|backend/src/modules/settlement, web/src/views/FinanceView.vue|D03|
|DEL-09|公开试镜开关与个人主页可见分开；总价含交通抽22%。|backend/src/modules/auditions, web/src/views/BusinessView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-10|按类型收集地点、用途、人数、时间或信息内容。|backend/src/modules/notices, web/src/views/BusinessView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-11|未成交只能结构化意向及素材投递。|backend/src/modules/notices, web/src/views/BusinessView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-12|按2.10具体业务检查接受及约定付款，两者与普通感兴趣区分。|backend/src/modules/gigs, web/src/views/GigsView.vue|D07|
|DEL-13|作者自助本期不开放，作者角色和历史资料保留。|backend/src/modules/licensing, web/src/views/LicensingView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-14|不同品类显示对应字段和校验，不仅改标题。|backend/src/modules/customization, web/src/views/CustomizationOwnView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-15|复杂视频由真人团队承制；内部工具不暴露为用户自助深度生成。|backend/src/modules/production, web/src/views/ProductionView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-16|发起人整包付款；按不同真实权利人计数。|backend/src/modules/cocreation, web/src/views/BusinessView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-17|现金储值、供应方应付、可用晶钻、制作券分别展示。|backend/src/modules/wallet, web/src/views/BusinessView.vue|D03|
|DEL-18|每笔合格成交只发一次积分，免费奖励独立来源。|backend/src/modules/wallet, web/src/views/BusinessView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-19|主角光环、接单成长、服务评分独立计算。|backend/src/modules/engagement, web/src/views/BusinessView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-20|直推一层、7天及末次规则有唯一命中和证据。|backend/src/modules/engagement, web/src/views/BusinessView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-21|12配置项中首期11启用按来源保留，概率和为100%。|backend/src/modules/redemption, web/src/views/BusinessView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-22|50/100/200/500元制作金分别对应6000/12000/24000/60000晶钻。|backend/src/modules/redemption, web/src/views/BusinessView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-23|查询/复制/更正/删除/注销各有请求状态、时限和结果。|backend/src/modules/privacy, web/src/views/BusinessView.vue|D07|
|DEL-24|真人/声音/合同/全本/故事附件默认私有，按对象权限访问。|backend/src/modules/media, web/src/views/SupplyView.vue|D05,D06|
|DEL-25|互认签约及具体授权；一个账号的多个员工不共用口令。|backend/src/modules/engagement, web/src/views/BusinessView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-26|审核/制作/客服/财务/管理员各看职责工作。|backend/src/modules/operations, web/src/views/OperationsView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-27|线下谈方案，线上记录报价合同、约定付款及节点。|backend/src/modules/projects, web/src/views/ProjectsView.vue|D04|
|DEL-28|新五Tab真实接线，表单详情有返回；旧地址有明确映射或禁用说明。|backend/src/modules/discovery, web/src/views/DiscoveryView.vue|本次无新增明确接入缺口，其余行为待验|
|DEL-29|现货/定制/试镜/投稿/共创/积分兑换/退款等端到端。|backend/src/modules/providers, web/src/views/DevStatusView.vue|本次无新增明确接入缺口，其余行为待验|
