# PM03 W18 充值退款 App 接入（未运行验收）

基线 f15b5cc2。此次不是消费订单售后，专用接口位于 /api/v1/wallet。

## 实际实现
- 本人 /wallet/refunds：分页读取真实充值退款申请、详情；从 WalletApi.records('RECHARGE') 已到账记录中选择原充值，填写金额/原因，通过既有 SupplyFiles 上传 REVIEW_EVIDENCE，明确核对后提交 recharge-refunds。
- 金额仅以原充值减已退款作输入上界，不用 available_for_refund 或消费/冻结余额阻挡建案；审核与渠道仍决定能否退回。
- 本人 IN_REVIEW/APPROVED 记录提供取消原因及二次确认，POST recharge-refunds/:id/cancellation 携带原版本。确认后核页面、身份、记录ID和版本。监护模式没有取消端点，不显示假取消。
- 监护 /wallet/guardian-refunds：账户级读取 guardian-recharge-refunds 列表及详情，不发送 X-Acting-Party。钱包和原监护管理均有入口，后者保留原未提交草稿离开确认。
- 退款投影无 kind/data/owner/content_sha256，使用专用扁平DTO，不套 WalletRecord。本人原充值仍使用既有 WalletRecord。申请、审核核定、任务安排、提交渠道、UNKNOWN、SUCCEEDED/CLOSED明确区分，APPROVED不称到账。
- 独立恢复前缀与模式沿 CommunityPageState/AccountSession 保留原 body/version/幂等编号；先重读再按原请求恢复，不用当前新输入替换。恢复回执另核原pending申请的recharge_id/amount_minor/applicant_kind，或原取消路径的record ID，不要求当前状态仍是初次状态。私有页面与充值分页关联原 epoch/ticket；跨身份不发布旧结果。PrivateDraftGuard保护本页未提交输入。

## 明确未接：监护人新充值退款申请
后端 POST guardian-recharge-refunds 已有，但现有监护 LINK 只给 child_account_id。guardians information 的 PROFILE 给账户基础字段，TRANSACTIONS 为 trade ORDER 索引，未找到获准 child_party_id 或子女 RECHARGE 选择目录。不能手填未成年人主体/充值ID、猜映射或借监护权读取本人钱包冒充子女选择。新申请保持明确不可办理；既有监护申请的读取不受这一前端选择源缺口替代。

本人/监护投影不含 evidence_asset_ids；本页不冒造申请人证据下载。运营原受控证据端点由管理网页独立接入。

## 范围与待验
5个App文件：wallet/recharge_refunds.dart、app.dart、wallet/wallet_pages.dart、pages/login/login_destination.dart、contract_six/contract_six_pages.dart。后四者仅必要入口注册。没有后端、ops或公共恢复代码改动。
仅源码静态复核，未编译、analyzer、格式化、功能测试或实际申请/退款。整批联合测试应覆盖本人/监护身份、原证据上传、原充值上界、未知结果原编号恢复、审核与到账区别、取消版本冲突、监护失权、分页与离页。当前没有整组完成声明。
