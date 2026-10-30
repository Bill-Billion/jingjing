# 个人中心：集中找到合同、作品和收入

后端负责人 **chengcongcong222**，前端负责人 **Bill-Billion**。本批属于原第11组，沿原PR39交付；候选接口 **0.31.10-rc.1**，数据库仍到 **0181**，无新建表或旧账改写。上传事实看CURRENT。本文件发布不代表伙伴已阅读或接好；由用户转发。

## 用户现在要能办什么

个人或机构进入“我的”，在当前身份下查看合同和约定、自己的作品和已购买视频，以及自己的收入核算；点一条记录回原业务。三类页面都要支持分页、失败后重试和身份切换。汇总不产生新合同、不重新算旧费率，也不扩大文件下载权限。

## 可直接接入的三个接口

全部是带登录凭据和 `X-Acting-Party` 的 GET：

|页面|地址|内容|
|---|---|---|
|合同和约定|`/api/v1/me/business/contracts`|封存合同内容、订单约定、参演约定、发行收入约定、剧本许可预留及已取得许可、商单接单和MCN合作约定|
|作品|`/api/v1/me/business/works`|本人提交的作品版本、定制项目、发行成片版本、本人销售及购买的现成视频|
|收入|`/api/v1/me/business/income`|已经登记到结算台账的本人份额，以及单列的商单佣金来源；保留原核算入口|

不传查询条件时，各来源返回首批20条候选记录。`limit` 可设1—50。列表采用**按来源分类展示、各来源按创建时间倒序**；不把每类的首批混排成“全业务全量时间线”。同源同时间按编号稳定排序，服务端游标保留原时间精度。

响应 `data.sections` 每项包含 `source`、中文 `label`、`status`、`items`、`next_cursor`、`error_code`、`retryable`。`data.partial=true` 表示有来源查询失败；保留其他来源成果。失败卡片显示“这部分暂时未能加载，请重试”，不能当作“没有记录”。

- 下一页：原地址带 `source=原source&cursor=原next_cursor`，同一来源内追加去重。
- 单项重试：原地址带 `source=失败source`。若原先在翻页时失败，保留并复用本次请求原cursor；错误响应没有新的cursor，不能误判到尾页。
- 来源不匹配、跨账号／跨身份／跨来源游标或伪造游标返回400。不要自动换身份重试。
- 无权记录在返回前重新过滤，因此允许中间空页仍有next_cursor；继续取下一页才可判断最终为空。
- 切身份、退出或失权时清空旧数据与分页状态；迟到响应必须按账号+身份+类别+来源隔离，不能画回旧身份内容。

## 记录与原业务对应

每条的 `key=source_domain:record_id` 是去重键；不能只用编号。`current_status` 是原业务状态，`object_version` 是原对象版本，`created_at` 是数据库实际创建时间。`target` 返回原业务域和编号。不要把列表记录当作文件直链。普通原详情地址为 `/api/v1/{trade|projects|licensing|supply|production|finance|gigs}/records/{record_id}`；合同内容为 `/api/v1/contract-snapshots/{record_id}/content`，现货卖家为 `/api/v1/stock/listings/{record_id}`，已购为 `/api/v1/stock/purchases/{record_id}`。均沿用原接口参数和权限。

|类别|source|原业务域 / 回原页面|
|---|---|---|
|合同|CONTRACT_SNAPSHOTS|CONTRACT_SNAPSHOTS，已有合同内容页|
|合同|TRADE_ORDERS|TRADE，原订单详情|
|合同|PARTICIPATION_CONTRACTS / INCOME_AGREEMENTS|PROJECTS，原参演或收入约定详情|
|合同|LICENSE_RESERVATIONS / LICENSE_GRANTS|LICENSE，原许可详情|
|合同|COMMERCIAL_OFFERS / MCN_RELATIONS|GIGS，原接单约定或MCN合作详情；邀请/审核中的内容不代表生效|
|作品|SUPPLY_WORKS|SUPPLY，原作品版本详情|
|作品|PRODUCTION_PROJECTS|PRODUCTION，原制作项目及阶段交付|
|作品|PROJECT_EDITIONS|PROJECTS，原发行版本详情|
|作品|STOCK_LISTINGS|STOCK，原卖家现货详情|
|作品|STOCK_PURCHASES|STOCK_PURCHASE，原买家已购详情；编号是order_id|
|收入|FINANCE|FINANCE，原结算约定详情／核算明细|
|收入|COMMISSIONS|GIGS，原商单佣金详情；income为null，属于来源核对，不能与财务份额再次相加|

重要状态：`SEALED` 仅说明内容封存，不能显示“已签约／已付款”。作品中的在制项目不能显示“已交付”；已购列表不保证仍可下载，退款、处置、文件状态由原下载接口检查。历史作品版本逐条保留，不用新版本覆盖旧订单承诺。预留、订单约定和封存内容是不同事实，标题不要都翻译成“正式合同”。

## 收入怎么显示

下述金额仅适用于FINANCE来源；COMMISSIONS来源只提供原记录入口，income为null，不能把它显示成0元或现金到账。消费者钱包仍保留原钱包入口，不并入经营收入。

金额单位是分，每条明确 `currency` 和 `environment`。`basis=POSTED_LEDGER_ONLY`：只含已经登记的核算，尚未登记或未来预期不算零收入，也不替用户预测。空列表写“暂无已登记的收入核算”，不能写“你没有收入”。

|字段|面向用户的含义|
|---|---|
|accrued_minor|已入账应计金额，可包含退款后的冲回|
|adjustment_minor|已审核的调整，正负分别显示|
|verified_paid_minor|已有核验记录的净支付，已扣支付退回；不是实时银行余额|
|pending_minor|非商家收款方的账面待付，不代表已满足付款条件|
|retained_minor|商家的账面留存，不能再当作应向商家转账的待付款|
|recovery_due_minor|账面需要冲回／追回的金额，不自动追收用户现金|

`meaning=MERCHANT_RETAINED_NOT_TRANSFER` 时突出“商家留存”；否则为 `PAYABLE_NOT_BANK_BALANCE`。`bank_arrival_verified=false` 表示本汇总接口不作银行到账核验；原核算的付款凭据仍需在原详情查看。不要跨测试／正式环境或币种相加，不显示“账户到账总额”，不把同笔订单的各参与人总价分别算为本人的收入。

## 这次前端需要做的事与完成标准

Bill-Billion 复用已有分类目录，接三类来源摘要；每类展示真实状态、分页、独立重试和原单跳转。当前接口支持的是当前身份 OWNER 的原业务权限；不因机构成员登录就自动赋予全部收入权限。

同版合成资料依次验收：

1. 同一用户购买现货，合同页找到原订单，作品页找到同一已购订单；能返回原页，重复刷新不重复追加。
2. 同一制作项目出现在本人作品页；尚未交付时没有“已完成”或直接下载承诺。
3. 同一个账号切个人／机构，列表和分页均切换；撤销成员权限后不能靠缓存或深链继续读取。
4. 同类多页无重复漏翻；坏游标有明确提示；中间空页继续查下一页。
5. 一个来源损坏时只该来源显示重试，其他来源仍可看；恢复原资料后原请求可以继续。
6. 合同封存不等同签署；收入对照同笔已核算分账、付款退回与退款调整，商家留存单列。
7. 旧规则或旧作品版本仍回原历史记录，不能用新列表入口静默改承诺。

后端已做HTTP及原账目对照；这些不能代替上述App／网页实际办理。真实支付、银行核验与正式税务服务未因本批启用。完整18组和151条仍按原计划继续。
