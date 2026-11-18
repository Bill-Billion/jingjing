# 原文与逐入口核查

[00号协议第二条](../../sources/contracts-20261029/extracted/00.md:25)原文：“用户须使用真实身份信息注册。浏览可使用基础功能；发布、交易、创建数字人前须完成 L1 实名认证（免费）。”[13号定制协议第四条](../../sources/contracts-20261029/extracted/13.md:33)另要求每位共创出镜成员各自完成肖像/声音/生物识别授权。不能把成员授权等同房主实际付款身份，不能把私人草稿等同公开发布。

|入口|实际代码与本轮证据|结论及后续|
|---|---|---|
|人工定制接受报价与重放|trade/repository.accept的change授权仅owner/买方，业务回调内检查合同/故事；当前合同实际HTTP3状态×2动作均200|已确认缺口，当前全量终态后修实际办事人实名并保留旧快照/读取|
|人工定制付款准备与重放|trade.preparePayment仅stock_video提前buyerIdentity，其他产品各有状态检查；显式当前合同仓库3状态×2动作实际成功|已确认缺口，终态后修，另外复验未知付款恢复、到账与退款不丢失|
|商品类型检查|customization/contract-policy.identity检查PRODUCTION行的product_profile，不查询用户实名|不把函数名当实名能力；无该函数新缺陷结论|
|试镜下单与付款|auditions/context.buyer核本人/机构办事人实名；trade.auditionCheckout在command前调用；paymentAllowed核预约和艺人qualified|下单静态已有对应检查；买方身份变化后的付款尚需实际对照，未计新验通过|
|通告商单发布/报价接受|gigs.repository.buyer调用party.representatives.authority核TRADE；独审另记录identity_verified；trade接受另走notice当前提交约束|未进行本轮实际反例，不能写全商单有漏洞或已通过；须分机构资质/办事人实时身份/人工独审|
|共创建房/成员/交易|creation.story调用C.owner，adult默认false；成员join经validateMember/cast，报价接受和付款另走state约束|不能凭存在adult helper声称每个入口启用，也不直接把私人建房当发布；需按原文和实际动作继续核|
|机构供货收入完整回归|mcn-supplier第58行上架409，stock-seed只给seller/buyer/buyer2建身份，outsider机构负责人没有|已定位正常fixture遗漏，未开始收入断言；终态后补办事人模拟L1，不动员工读权限、不降低真实门禁|

实施补全：新接受/新准备付款以及其成功请求重放仍应核实际办事人的当前实名；原文未逐字规定幂等算法，这属于实施口径。私人草稿、历史查询、撤回/退款、供应商已到账事实分别对待，不因统一helper误伤恢复权利。未修改运行时；本轮探针无法代替所有交易产品/真实资金/端侧验证。
