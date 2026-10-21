# 需求来源、当前实现与差异证据

本轮只读复审代码f8d506d。下面的“缺口”是对实际字段、调用与页面的检查，不是本轮另做的手机或数据库复现。用户手机反馈另作可用性证据，不能据此声称发现了越权漏洞。

## 原文怎样演进

|依据|原文要点及位置|本轮怎样使用|
|---|---|---|
|[V1工程交接](../../sources/bootstrap-r02/sources/V1/工程交接总览_先读我.md)|第46—49行区分客户、艺人、MCN和品牌；第48行曾写MCN仅H5、不在C端下单|保留早期定位，不能覆盖后来的变化|
|[V2业务主稿](../../sources/bootstrap-r02/extracted/V2-MAIN.md)|第286—299行：App主要面向个人和数字人权利人，机构主要使用B端；320、328、331、337行：登录者/机构/数字人分开，个人可仅消费，机构可多能力和多工作人员，管理不等于拥有|是保留主体与形象区别的直接依据|
|[V3会后材料](../../sources/bootstrap-r02/extracted/V3-MEETING.md)|第16行标评审稿；551—554有MCN管理台；831允许一用户多数字人；834一张定制单有主理数字人和陪演；1057权限矩阵细节待会上确认，1065为MCN列，1110/1119列明可下单、审样片/付尾款|说明需求已演进及所期待的业务结构；不能把所有细则当最终批准|
|[V3原会议工作簿提取](../../sources/bootstrap-r02/extracted/V3_WORKBOOK_VALUES.json)|32项会议结论本轮核查仍全空；相关主理形象/机构换绑建议见110、642行附近|不填补空白、不把建议数字和代理细则伪造为已决议|
|[最新版权增量原话](../../sources/bootstrap-r02/sources/DELTA/01_最新版权与完整范围_用户原文.md)|23、34、40、63行涉及个人作者、机构供给、作品权利与许可交易|为剧本供给和许可提供依据；未明确每次预留必须先指定艺人|
|[R0.3正式收敛意见](../../baselines/r03/intake_reports/sources/晶选片场_Codex首轮设计审阅意见_R0.3.md)|130行直接MCN与单笔佣金；154报名/邀请/筛选替代通用竞拍；172—187保留许可交易和单独采购；321—330接受账号、个人机构、代表权限、多能力及形象/同意拆分；341—354许可归属、项目使用及三类资金分离|按已收敛方向执行；不能恢复竞拍或以重新设计为由删除机构采购|
|[R0.3归并目标设计](../../baselines/r03/intake_reports/03_TARGET_DESIGN.md)|第30行提出个人/企业买方App；108提出单独采购未指定项目先不分配额度、开工前绑定|这是归并设计，不是甲方原话逐字明确的时序|
|[R0.6入口](../../baselines/r06/00_START_HERE.md)与[执行计划](../../baselines/r06/03_EXECUTION_PLAN.md)|入口6—8行业务继承R0.3；执行计划64行以选数字人/剧本开始定制|保留整体范围；R0.6不是对所有未知规格、所有页面细节的额外批准|
|[已确认导航](../../ux/navigation-acceptance.md)及[图册实现标准](../../ux/gallery-implementation-standard.md)|导航9行：入戏私人定制、培育商业委托、成角公开项目；图册标准5行：示例不当真实业务规则|保留五入口和视觉基础；按任务改善流程需同步映射，不凭图片推导新商业规则|

结论：App机构功能在早期和后期材料中有变化；多类用户在App中共存有依据，缺的是明确的默认任务和责任边界。不能挑一版方便的句子覆盖全部材料。

## 当前实现逐项核对

下列代码链接均指当前仓库文件；行号为f8d506d版本。表中的业务判断不替代源码之外的正式法务或商务决定。

|发现|甲方依据/需求|实际代码证据|本轮判断与处理层次|
|---|---|---|---|
|一个账号可以代表本人和多个机构|V2:320—337；REQ-023/034/047|[机构关系](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/party/repository.js)75—117行；[身份选择](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/account/account_page.dart)511—518行|基础已有，保留。前端应统一叫“当前代表”，不能改成登录某个数字人|
|个人/机构看到相近的功能大全|V3不同用户任务；REQ-009/024/023|[主页面](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/navigation/app_shell.dart)115—178、224—334行|主要是任务与页面组织缺口；不证明服务端权限无效|
|App数字人及本人脸声办理仍未开放|V3:357/533/570；REQ-006/007/010/039|[路由](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/app.dart)101—103行；[同意保存](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/works/repository.js)114—116行|后端已有部分基础，App有明确缺口；真实数字人供应商可用性另验收|
|私人定制缺少自然的发起入口|V3:407/585/834；R06执行计划64；REQ-001/003/024|[主页面](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/navigation/app_shell.dart)339—342行只接已有报价及许可目录；[路由](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/app.dart)105—159行|产品流程和页面缺口，完整需求提交与报价衔接要核定接口，不只改按钮|
|许可预留只指定商品和买方|DELTA许可交易；R03保留单独采购；REQ-051/052/053/054|[许可表单及按钮](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/licensing/license_pages.dart)413—423、670—689行；[许可路由](../../../晶晶日上工程交接包/01_源码/backend_server/src/http/licensing-routes.js)19行；[许可处理](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/licensing/repository.js)41—48行|不是预留已经确定演员的制作合同。可先采购这一模式不直接判错；需要显眼买方确认、明确用途状态和定向后续|
|普通定制订单没有受约束的主理/陪演名单承诺|V3:834；REQ-001/010/034/042|[报价与订单](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/trade/repository.js)33—35行及[规格字段](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/trade/policy.js)9行；[制作建项](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/production/repository.js)36—43行|后端与前端共同缺口。规格/文本能记一些信息，不等于有名单关系、校验和变更规则。制作建项才带同意编号，不能替代客户订立时的出演承诺|
|商单已有形象约定，不能全部算缺失|V3商业服务；REQ-017/024|[商单交易上下文](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/gigs/context.js)9、12—14行|保留局部正确实现；普通定制与商单差别要明确|
|合作艺人不等于机构员工，更不等于机构拥有的形象|V2:337；R03直接合作；REQ-016/023|[成员关系](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/party/repository.js)162—217行；[MCN合作](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/gigs/repository.js)38—39行|分开保存正确；代理范围缺决定时不能靠增加员工或直接切换艺人身份绕过|
|机构不能自然挑选个人拥有的合作艺人形象报名/报价|V3机构管理及本人最终确认；REQ-016/023/024|[选角检查](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/projects/checks.js)9行；[商单范围](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/gigs/context.js)9、12行；[报名资料](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/projects/project_api.dart)275—304行|目前检查要求形象属于报名/报价主体。要增加代办须定义并核查被授权动作，不允许只改下拉框绕权限|
|同机构向同一项目角色提交不同艺人有去重限制|机构多艺人管理；REQ-023/026相关|[报名和受邀响应](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/projects/repository.js)22—23行按主体与项目角色去重|确有代码限制；是否必须支持该场景需决定。是静态审阅发现，未动态复现；且仍要先解决上一行形象代理范围|
|本人同意有用途时限，但结构化受用机构/指定项目不足|V2管理不等于拥有；REQ-010/012/034|[同意格式](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/works/consent-policy.js)4—14行；[制作校验](../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/production/eligibility.js)16行|不能仅凭同意编号就表述为“已授权这家机构用于这笔业务”；项目/受用主体是否必填及旧记录处置须审定。没有据此断言已发生越权|
|三个“项目”让用户自行拼接|REQ-024/054；定制和公开发行分开|[许可项目表单](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/licensing/license_forms.dart)263—410行；[主页面说明](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/navigation/app_shell.dart)322—323行；[制作跳转](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/production/production_pages.dart)1141—1146行|不合并不同权利对象；以用户的一笔业务贯穿，修正文案和错误语义链接|
|部分场景仍要输入编号、规则或费率|REQ-003/016/046/059|[作者表单](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/supply/supply_form.dart)453—518行；[MCN邀请](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/gigs/gig_forms.dart)528—531行；[商单规则及费用](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/gigs/gig_forms.dart)359—388、478—511行|可用已有对象选择、邀请确认和规则解释改善；费率由谁定、能否议价不能顺手改掉；不要新增公开手机号搜索泄露用户|
|已有订单后部分步骤能够直达|REQ-001/038/054|[订单至制作](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/trade/trade_pages.dart)469—504行；[制作角色及付款](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/production/production_pages.dart)279—335行|已有正确接续，应复用，不能宣称所有流程完全不存在|
|阶段遗留提示与当前功能不一致|REQ-043/045|[交易页](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/trade/trade_pages.dart)425—426及469—504行|按实际状态修正文字；不因消除提示而假开放真实服务|

## 阅读和验证边界

已读取V2业务主干及相关决策、V3定位/角色/页面树/定制/实体/权限/待决策章节、DELTA两份原话、R03原审阅主要业务章节与主体设计、R06入口及执行计划；看过60项登记标题与暂定基线，并核对工作簿32项会议结论空白。代码重点读取App新路由及上述后端模块，没有改程序。

未逐页重读全部R0.1/R0.2研究和参数历史，未重新核对Word插图、批注、修订痕迹，未逐页操作Vue、未新增真机测试、未重跑所有数据库或供应商检查。不能把60项索引覆盖称为60项全面验收。涉及财务、平台资质、真实供应商与正式法律口径的既有未决条件没有因本报告而解除。
