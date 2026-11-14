# 后端联调交接与准入（2026-11-15）

本文件落实用户最新推进重点，属于PM01 W10既有交付，不新增平行计划或测试系统。目标是把各项主要功能交付成可供前端接续的后端基线，后续以实际联调结论完善。当前222文件统一回归exec55674实际2334通过/0失败/1真实旧库缺样本跳过；128同次HTTP/9624响应格式通过，源码63446d6505612bf26dd8afbfe13ed32838475338。候选上传和该候选远端检查尚未完成，当前不宣称联调已经开始或本阶段正式验收通过。

## 当前交付与进入联调的条件

1. 固定同一后端候选和接口0.31.78-rc.11/0225。以当前完整回归及同次接口结果说明主要链情况；有实际主链阻断则先处理，不把所有潜在边角都变成准入门槛。
2. 同步原草稿PR39，观察准确候选的后端与工具检查。保持草稿，不合入。自动App/Web结果另列，不手动运行、重启或修补前端。
3. 提供下表业务链入口、角色/合同/授权和已知限制。前端接续时间由其实际安排确认；Bill-Billion当前仅UI，不能写成已认领联调。
4. 后续双方按同一业务记录联调正常办理及关键逆向；新增问题记录到既有任务/证据，按是否阻断链条决定修复顺序。

## 十二条主要链的接续入口

以下主要功能已有前批隔离后端证据，当前统一回归已核本候选仍能执行。表中为现有可复跑后端测试，不能把它们当成已启动的页面或常驻测试账号。主要接口前缀省略`/api/v1`，完整方法、参数和共同交易接口以[OpenAPI契约](../../../contracts/openapi.yaml)为准。

|PM01任务|主要办理目标|接口域（以契约为准）|现有复跑入口|
|---|---|---|---|
|W11 现货购买|上架、购买、发权/下载、逐案部分及余款退款；KEEP/REVOKE独审|/stock|[stock.integration.test.cjs](../../../晶晶日上工程交接包/01_源码/backend_server/test/stock.integration.test.cjs)|
|W12 人工定制|报价30/40/30、四阶段交付、企业代表交接、成片下载/退款|/customization-requests、/trade、/production|[customization-delivery.integration.test.cjs](../../../晶晶日上工程交接包/01_源码/backend_server/test/customization-delivery.integration.test.cjs)|
|W13 试镜|预约付款、接拒、交样确认、售后与T+1、企业买方代办|/auditions|[auditions.integration.test.cjs](../../../晶晶日上工程交接包/01_源码/backend_server/test/auditions.integration.test.cjs)|
|W14 通告商单|发布/投稿/意向、报价到订单、履约、撤回与售后|/notices、/gigs|[notices.integration.test.cjs](../../../晶晶日上工程交接包/01_源码/backend_server/test/notices.integration.test.cjs)|
|W15 共创|邀请授权、成团/未成团、分期交付、退出与退款|/cocreation|[cocreation-modern-journey.integration.test.cjs](../../../晶晶日上工程交接包/01_源码/backend_server/test/cocreation-modern-journey.integration.test.cjs)|
|W16 晶钻与制作券|领取/兑换、实际订单抵扣、重复与退款权益恢复|/wallet、/redemption|[redemption-checkout.integration.test.cjs](../../../晶晶日上工程交接包/01_源码/backend_server/test/redemption-checkout.integration.test.cjs)|
|W17 抽奖奖品兑现|开奖、领券/奖品、制作金订单与履约、退款追溯|/redemption|[redemption-lottery.integration.test.cjs](../../../晶晶日上工程交接包/01_源码/backend_server/test/redemption-lottery.integration.test.cjs)|
|W18 钱包会员|充值与会员、消费、未知付款恢复、原路退款/成长冲回|/wallet、/trade|[wallet-cross-period.integration.test.cjs](../../../晶晶日上工程交接包/01_源码/backend_server/test/wallet-cross-period.integration.test.cjs)|
|W19 曝光月冠军|投票/评分、排行、公示、奖励凭据及申诉/撤回|/engagement、/redemption|[championship-contract.integration.test.cjs](../../../晶晶日上工程交接包/01_源码/backend_server/test/championship-contract.integration.test.cjs)|
|W20 机构与企业代办|明确代表授权、多人交接、批量、离职撤权、原订单归因|/parties、/organizations、/engagement|[mcn-stock-orders.integration.test.cjs](../../../晶晶日上工程交接包/01_源码/backend_server/test/mcn-stock-orders.integration.test.cjs)|
|W21 隐私注销|本人副本、同申请独审/文件、撤权、删除及恢复|/privacy|[privacy-copy.integration.test.cjs](../../../晶晶日上工程交接包/01_源码/backend_server/test/privacy-copy.integration.test.cjs)|
|W22 参演发行|角色合同/改价退款、作品交付与发行证据、独审/清算|/projects、/finance|[participation-amendment.integration.test.cjs](../../../晶晶日上工程交接包/01_源码/backend_server/test/participation-amendment.integration.test.cjs)|

企业代办另接audition-representative、notice-representative、invitation-representative、customization-representative及customization-delivery；佣金结算及逆向接referral-customization-fulfillment、referral-audition-fulfilled、referral-commercial-fulfillment、referral-mcn-history和settlement；奖品实际兑现另接redemption-delivery-evidence。以上均是backend_server/test下既有.integration.test.cjs，不要求重做主功能。

## 复跑方式与资料边界

从正式client-testing工作树、固定提交执行既有[完整后端入口](../../reviews/pm01-current-backend-20261114/RUN_BACKEND.cjs)，所需隔离MySQL、媒体工具环境沿[当前报告](../../reviews/pm01-supplier-recovery-20261115/REPORT.md)及本机已登记测试环境。入口使用127.0.0.1隔离库、合成身份/款项与文件；不读取生产库，不启用真实供应商。该入口执行后清理临时数据库，输出中的业务编号只用于该次证据；不是能直接交给前端继续操作的常驻账号。

前端确定接续后，再按同一候选和实际选择的业务链准备限时隔离服务、角色与资料，记录真实端口、过期时间及停止办法；不沿用过期会话，不改人工3490。当前不为了等待前端而开公网或常驻实例。

## 已知限制与后续条件

真实58表旧库缺样本；九项真实服务未启用；真实身份/资金/签署/媒体/奖品资源、私有文件、实体机及运营财务/发行签收均另验。所需页面、缓存/深链、系统保存等端侧义务保留，不能由接口检查代替。原网页PR17准备阶段的买方实名409是上一候选已知问题，未进入浏览器业务；本侧不修补前端，本候选自动结果按实际另记。

这些限制不抹去已实现的后端主链，也不能被“可联调”替代为正式可用。151仍19通过/124部分/8证据不足，18组关闭0/18、12整链部分；不虚报全部完成或未开发数量。维护者阶段末审阅，用户目前暂不需要补资料；昆山材料仍申请中、OSS按既定顺序最后。

来源：[PM01 W10](../../sources/pm01-20261111/03_本轮施工任务与验收.md)要求“明确哪些前置由助手完成，不能算成页面操作通过”“每条任务能由另一位开发者按说明复跑，环境缺项明确列出”。用户2026-11-15明确主要功能优先、尽快后端联调；因此不再将主动穷尽所有部分标准或边角反例作为当前交付前提。
