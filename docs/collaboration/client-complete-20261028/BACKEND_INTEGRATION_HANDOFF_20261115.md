# 后端联调交接与准入（2026-11-15）

本文件落实用户最新推进重点，属于PM01 W10既有交付，不新增平行计划或测试系统。目标是把各项主要功能交付成可供前端接续的后端基线，后续以实际联调结论完善。当前222文件统一回归exec55674实际2334通过/0失败/1真实旧库缺样本跳过；128同次HTTP/9624响应格式通过，源码63446d6505612bf26dd8afbfe13ed32838475338。候选c1d750b4d87d20c0bd1a17a7d53b9c614bad9ed4已上传原草稿PR39，准确候选材料检查通过所列路径/文本规则，远端服务器PR/push及工具均成功，App子项成功、网页PR15准备失败；四事件已全部终态，当前不宣称联调已经开始或本阶段正式验收通过。

## 当前交付与进入联调的条件

1. 固定同一后端候选和接口0.31.78-rc.11/0225。以当前完整回归及同次接口结果说明主要链情况；有实际主链阻断则先处理，不把所有潜在边角都变成准入门槛。
2. 原草稿PR39已同步，准确候选的后端PR/push和工具检查均通过。保持草稿，不合入。自动App成功、Web准备失败另列，不手动运行、重启或修补前端。
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

表中各文件是接续入口，不代表只验这一文件就能关闭任务。当前同次完整回归的[主要功能证据索引](../../reviews/pm01-supplier-recovery-20261115/MAIN_FUNCTION_EVIDENCE.json)按17个后端工作范围列出原始检查名、源码摘要和统一结果位置；没有新跑测试、相加共享用例或提升151条状态。其中：

- 普通通告以`notices-ordinary`的新规则证据为准：无星探充值的成年人可发布五类普通通告、同通告投稿/客服转单/付款/退款；`notices`里的旧规则反例不能单独代表新政策。
- 奖品兑现同时看`redemption-lottery`的开奖与恢复、`redemption`的面试和曝光履约、`redemption-delivery-evidence`的同奖品凭据、`reward-remedy-lifecycle`的补救，以及`redemption-checkout`的同中奖制作金付款/交付/退款。实际排期资源和供应商交付仍未由合成记录替代。
- 参演发行同时看`participation-amendment`的加价/降价/换角和`fixed-income-release`的同版本制作、各方发行依据、收入到账与清算；后者使用隔离数据及合成外部凭据，不能宣称真实渠道已发行。

## 在原PM01计划中的位置

当前是后端主要功能交接，不是W01—W30全阶段签收。原任务的端侧、真实服务和人工审阅要求均保留，用户最新决定只调整当前推进顺序。

|原任务|当前可独立交付的范围|仍需的条件|
|---|---|---|
|W01 固定候选与审阅；W02 统一需求计数|原PR39候选、契约与受测源码已固定；151条及需求/队列核对通过，原始失败保留|维护者实际分域审阅、合入决定；不自动批准|
|W03 普通通告；W04 资料范围；W08 新旧合同|主要规则和实际文件/合同/交易路径均有当前后端证据，见索引|端侧展示、真实资料及保留依据仍按适用范围验收|
|W05 本人资料下载；W06 批量五动作；W07 匹配榜单|后端申请到文件、批量结果与恢复、条件匹配与榜单规则已有；前批页面成果保留|当前前端不由本侧开发修补；同候选端侧联调及异常证据需实际接续|
|W09 九服务准备；W23 实名短信签署；W24 收款托管退款清分；W25 数字人与审核；W26 存储与推送|[九服务台账](../../operations/EXTERNAL_READINESS.md)已区分已有代码、产品未定、材料未到及实际绑定缺项；合成门禁/部分适配已有|昆山产品及授权、支付/托管方案、签署模板、长期资产产品、设备通道等未定部分不可伪造协议；真实适配与联调仍未完成，OSS最后|
|W10 同记录验收包；W11—W22 十二条业务主链|当前后端完整复验、角色及复跑入口已交付；原业务编号位于各次证据，助手前置与页面操作分开|当前网页PR15准备失败已交接；所需端、同候选实际联调和独立复验尚未全部完成|
|W27 实体机；W28 部署迁移恢复；W29 正式签收|已有隔离迁移、加密备份恢复、回退/发布门禁验证；同次`release.integration.test.cjs`仍通过|真实58表旧库缺样本、私有文件、签名包/设备、实际服务、业务财务及发行签收；不因隔离通过授权部署|
|W30 驾驶舱接仓库事实|现有board/CURRENT/证据为任务事实，计数校验通过|项目总览及离线驾驶舱按用户边界不主动改，自动监测保持暂停|

本表不将“无产品资料暂不能实现真实绑定”写成“已开发待开关”，也不把已有主功能重派为未开发。当前后端候选及服务器终态已交付；后续以实际联调发现的主链问题推进，未重启旧逐条穷尽边角的安排。

## 复跑方式与资料边界

从正式client-testing工作树、固定提交执行既有[完整后端入口](../../reviews/pm01-current-backend-20261114/RUN_BACKEND.cjs)，所需隔离MySQL、媒体工具环境沿[当前报告](../../reviews/pm01-supplier-recovery-20261115/REPORT.md)及本机已登记测试环境。入口使用127.0.0.1隔离库、合成身份/款项与文件；不读取生产库，不启用真实供应商。该入口执行后清理临时数据库，输出中的业务编号只用于该次证据；不是能直接交给前端继续操作的常驻账号。

开发者复跑顺序（仅后端）：

1. 使用固定候选，按项目锁文件准备Node.js及后端依赖；沿既有[本机MySQL工具](../../../scripts/local-mysql.cjs)准备专用测试环境。完整入口明确要求`NODE_ENV=test`、`127.0.0.1:33316`、`jx_local/jx_dev`，每份测试自行使用随机`jx_test_*`库；其他环境会拒绝运行。
2. `JX_MYSQL_TEST_ENV_FILE`指向本机私有测试配置；`JX_TEST_FFMPEG`、`JX_TEST_FFPROBE`和`JX_TEST_FONT`分别指向已安装的媒体工具和字体。配置中的口令留在忽略上传的本机文件，不复制生产配置。使用按[锁定依赖](../../../contracts/requirements-lock.txt)准备的契约校验Python环境。
3. 在工作树根运行`node docs/reviews/pm01-current-backend-20261114/RUN_BACKEND.cjs`。实际进程退出后读取`.local/current-backend-latest.json`所指目录；必须同时确认完整回归、采集器及附加记录复制成功，不能仅看到`summary.json`便算结束。运行期间不改受测源文件，也不同时启动另一批会覆盖公共HTTP输出的后端检查。
4. 用上述Python运行`scripts/validate_contract_batch.py --manifest <本次输出目录>/runtime-contract-manifest.json --report <本次输出目录>/contract-batch.json`，确认实际退出0且报告无失败；使用本次输出，不借用历史接口记录。本候选基线为222文件、2334通过/0失败/1真实旧库跳过、128HTTP/9624响应。

前端确定接续后，再按同一候选和实际选择的业务链准备限时隔离服务、角色与资料，记录真实端口、过期时间及停止办法；不沿用过期会话，不改人工3490。当前不为了等待前端而开公网或常驻实例。

## 已知限制与后续条件

真实58表旧库缺样本；九项真实服务未启用；真实身份/资金/签署/媒体/奖品资源、私有文件、实体机及运营财务/发行签收均另验。所需页面、缓存/深链、系统保存等端侧义务保留，不能由接口检查代替。当前候选自动App子项通过；网页在PR15模拟卖方创建服务规格时409/VERIFIED_ADULT_REQUIRED，PR15该组浏览器业务未开始，失败日志与后续前置见[网页交接](../../reviews/pm01-supplier-recovery-20261115/remote-c1d750b4/WEB_HANDOFF.md)。上一候选PR17买方实名409仍是历史未修事项，本候选未到该步骤；本侧不修补或重跑前端。

这些限制不抹去已实现的后端主链，也不能被“可联调”替代为正式可用。151仍19通过/124部分/8证据不足，18组关闭0/18、12整链部分；不虚报全部完成或未开发数量。维护者阶段末审阅，用户目前暂不需要补资料；昆山材料仍申请中、OSS按既定顺序最后。

来源：[PM01 W10](../../sources/pm01-20261111/03_本轮施工任务与验收.md)要求“明确哪些前置由助手完成，不能算成页面操作通过”“每条任务能由另一位开发者按说明复跑，环境缺项明确列出”。用户2026-11-15明确主要功能优先、尽快后端联调；因此不再将主动穷尽所有部分标准或边角反例作为当前交付前提。
