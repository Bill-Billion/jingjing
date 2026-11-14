# 当前完整回归失败观察（非终态）

当前216完整回归已经观察到定制交接与定制报价失败：接手续付代表未建立本人模拟身份；独立定制交易fixture没有给正常买方建立本人身份。前者导致后续交付及本人资料断言连带失败。已核到真实栈与对应fixture，尚未修正，也尚未取得完整终态；关联496仍只证明其21文件范围。先收同次运行全部失败，终态后补明确正常账号资料，保留无权/撤权/过期反例并复验，不关闭或弱化新实名门禁。

|入口|当前证据|终态后处理|
|---|---|---|
|企业定制同单交接|customization-handoff第58行用next即S.people.artist准备中款，verifiedAdultParty拒绝VERIFIED_ADULT_REQUIRED；测试只给owner通过newOrder补身份，first/next邀请和代表授权并不等于实名|明确为正常接手续付代表seedAdultIdentity，保留原撤权、读取、签收、期限和实际续款断言，不在pay辅助函数里自动修身份|
|定制交易报价|customization-trade独立注册正常buyer，没有artist_people本人身份；旧报价接受和新报价接受均VERIFIED_ADULT_REQUIRED，后续order依赖连带|明确正常buyer身份；普通机构成员能填故事但不能确认财务的负例仍保留，按其后续被授权角色再决定是否需显式身份；不修改全体注册用户默认状态|
|本人交稿资料/原反馈|上述交接未付中款，后续样片/反馈未建立，出现CUSTOMIZATION_INTERIM_PAYMENT_REQUIRED和undefined.id|先修实际上游资料再重跑同记录全链，不能单独跳过、伪造反馈或把隐私功能当新缺陷|

源版本655d9ff4，当前源摘要全部与启动清单相同。FULL_FAILURES_OBSERVED.tap为当时原输出快照，完整失败数以后续真实终态为准；独立报告的部分检查数不作为最终全量统计。
