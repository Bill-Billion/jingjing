# 原12条路线：后端证据与下一步实际办理

本轮完整回归包含下表模块。最终运行结果和源码摘要见RESULTS.md、SOURCE_MANIFEST.json。表中是**后端模块及同记录场景的证据索引**，不声称同一账号在App/网页已经走完12条路线。每条最终仍需对应原151条标准的全部端、正常/逆向/权限/恢复和独立审阅。

|原路线|本轮后端回归入口（backend_server/test）|已有后端覆盖与验收剩余|
|---|---|---|
|1 现成视频|stock.integration、stock-commercial.integration、stock-admission相关测试|资格/逐人权利、个人与商用购买、旧单/退款/下载；下一步同版首次上架到买家售后跨端|
|2 私人故事和人工定制|customization.integration、customization-trade.integration、customization-delivery.integration、copyright.integration|草稿/补件/受理、报价版权选择、新30/40/30、交付和退款；已有网页局部证据，按同订单补全部端/异常|
|3 试镜|auditions.integration、auditions-supplements.integration|预约/接单、会话、已付补差、交付与安全取消；下一步用同单App/机构/运营核钱账|
|4 通告与商业订单|notices.integration、gigs.integration、gigs-contract.integration|发布资格、投稿、报价付款、会话、分成/退款和撤权；下一步首发到履约跨端|
|5 共创|cocreation.integration|首次建房、逐人授权、10/20人门槛、制作/片段、退出和补救；本批新增新合同30/40/30、脚本中款到最终下载同房间验证，旧30/60/10保留。26项专项通过，跨端口径仍须同版逐项核|
|6 晶钻和制作金|wallet.integration、redemption.integration、redemption-checkout.integration|成长/待冲回、兑换、用券后分期、首款核销、退款不返已用券；下一步页面串同一消费和权益记录|
|7 抽奖与奖品|redemption-lottery.integration、redemption-checkout.integration、consumer-risk.integration、contract-pool.test|本批实际扣钻/原中奖恢复→同一免单权益→订单→开工核销→四阶段交付下载；面试/曝光兑现及补救另有原模块检查；正式奖池需签认，跨端尚待|
|8 余额和会员|wallet.integration、custody相关测试、consumer-controls.integration|模拟托管凭据、余额预留/释放、会员与额度；真实托管未开，页面不得假到账|
|9 成长和月冠军|engagement.integration|评审/榜单/同分复核/刷票/申诉、城市权重未配置不排名；下一步同一活动跨端展示与运营办理|
|10 机构与艺人|gigs.integration、artists.integration、contract-six.integration|本人关联与授权、人员权限、解绑后7日限定旧单和撤权；已有六项页面证据，补完整接活到结算|
|11 隐私与注销|privacy.integration、privacy-actions.integration、privacy-execution.integration、usage.integration、consumer-risk.integration|请求/审核/实际关闭、保留/撤回、计时清理和通知控制；供应商实际删除与真实保留依据另验|
|12 参演与发行|participation.integration、participation-amendment.integration、project-income.integration|相关方同版确认、改价补差/退款、换艺人分别记账、发行/收入依据；下一步同一项目跨端全程|

跨路线同时回归trade、settlement/marketplace、daily-reconciliation、invoices、phone-change、operations等模块。前端四组增量由Bill-Billion接入，后端chengcongcong222继续主测与修复；已有页面可先测，不等四组全部结束。具体运行文件名和测试标题以完整日志和源码为证，表中省略统一文件后缀，不作独立测试命令。
