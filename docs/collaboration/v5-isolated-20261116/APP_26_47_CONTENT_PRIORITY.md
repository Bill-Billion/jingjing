# 实际 App 26/47 内容优先级续补

依据此前原画布交接 PREVIEW_23_27_RIGHTS_CLEAR_CANVAS.md 与 PREVIEW_43_50_GROWTH_WALLET_CLEAR_CANVAS.md；未新增画布读取。

26：仅非 quote 选择模式，将原核销/释放完整说明从本人权益条目前移到所有条目或空态之后，局部深底分区。真实 rows、有效期、状态、条目按钮、HELD 提示与 quote 选择模式不变；不以示例入口替代真实数据。

47：合格消费成长卡及两条独立进度置于累计净发放晶钻卡之前。下一门槛进度以真实 qualifying_growth/对应 rule growth_thresholds 显示20px数值；充值进度以原 renewal_credit_minor/topup_threshold_minor 显示20px金额，辅助状态不重复金额。无对应规则仍保留原缺项提示；最高门槛及六级独审说明不变。不把充值当成长、门槛当等级通过、累计晶钻当可用余额。

数值使用普通可换行 Text，无固定高度、截断或屏宽锁定。保留前批50响应式金额布局和44独立文件、所有读票据/锁/写入/恢复机制。库外备份后修改，只做源码与diff静态核查，未测试、编译、分析器、格式化、浏览器或推送。真实窄屏/大字及数据状态展示待同事整批验证。

累计源码 SHA256：
- wallet_pages.dart：`bb68cea99145acc63702a1b088a3ddc98e010aef0b2a14b2cb25c31ab9e2b8a8`
- redemption_pages.dart：`9bd0ecae1e0d56dbd523f866eb092585fc9a239fd8669661b949de87c50baa2d`
