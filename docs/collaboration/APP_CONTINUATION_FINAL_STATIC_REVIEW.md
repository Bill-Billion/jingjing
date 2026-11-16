# 最终续批只读静态复核

读取时间：2026-11-16T13:16:17.964191+00:00。基线 fb427387，submission-isolated 当前未提交差异：26份Dart；另1份JS不在本次Dart审查范围。其他模块期间曾收尾，以下文件摘要标明最后记录内容，不是冻结或提交承诺。

## 结论与已修问题
- 先前确认的通告详情回归已在本次源代码中修正：正文恢复 /saved 以及 /support/new?domain=NOTICE_PUBLIC&recordId=原ID，已去掉与底栏重复的三种投稿按钮。仅静态确认，不是点击验证。
- 本次未发现新的可直接证实的缺符号/参数不存在或付款写入绕过回归；这不是编译通过、全量正确或正式可用的结论。

## 已查范围
已阅读先前25份Dart续批diff（含上一轮已读并本次核新变化）；第26份stock/v5_support.dart已在owner冻结后完成专项静态补审，结论见下节，重点逐项回看：
- V5Frame/tradeScaffold支持footer；V5Form支持factsBuilder/extra；CollectionDetailActions确有新增purchaseAction，默认分支保留，stock与notice紧凑调用保留收藏未知恢复。
- financeEditorialFact含description；AccountTheme.sans存在；TradeRecord.version、StockPurchase.license、publication原字段、collection城市/日期均与既有使用一致。
- auditions移出字段表的两项公开开关通过extra写回values、factsBuilder呈现；buildBody仍显式转换bool，恢复体仍读原值；未新造服务字段。
- wallet新增记录预览有epoch/owner/ticket检查、分页上限与循环保护，明确仅已读记录；app_shell个人摘要检查账号/epoch/party/owner；redemption私有余额在clearPrivate与重读时清空，并沿用基类ticket及WalletApi核验。
- privacy时间选择回调检查mounted/epoch/ticket/enabled，提交仍保存原分钟字段；新增开关纳入离开保护观察值。
- support/invoices创建footer沿用原金额、标题、说明、税号、额度与环境锁，另防eligibility为空；原税号提交原文保留。新增材料展示依赖fulfillment模型已验证的evidence_asset_ids List，未去掉私有证据读取方约束。
- stock媒体和报价版本/许可未改；excluded摘要按模型真实数组展示，commercialUses仅品牌/广告/企业展示。新收藏购买与trade收银footer均有窄屏/大字纵排。
- trade本批主要展示和footer迁移，原accept/reconcile/createInstallmentPayment/恢复方法未被重写，原locked、canCreate、cashierConfirmed条件保留；PAYMENT返回原订单只在原orderId存在时出现。
- artists/contract/license/business-library的卡片与底部入口移动，原签署边界不变；engagement发布评价动作提为helper，embedded与独立页分别一个提交入口。

## 保留为风险/差距，不当成已验证缺陷
- wallet footer后续已静态补审：所有分支复用_footerPair，小于340宽或14px文字放大超过20px改纵排。此前固定Row风险已在源码层处理，实际极端布局仍未渲染。
- help正文与footer仍有同类反馈/记录入口重复，属可简化的布局冗余，未发现更改接收方或静默提交。
- 通告底栏发布/投稿入口主要以busy控制导航，后续表单/服务端仍负责权限与pending写入门控；没有把打开页面当作授予权限。未穷举所有跨页pending场景。
- 所有横排卡在极窄窗口、超长标题和系统大字下尚未渲染；未知响应、切换身份、离开再进入、完整流程仍交同事验证。

## 明确未做
没有测试、编译、analyzer、formatter、SDK安装、接口请求或UI点击；没有更改任何Dart/JS源码、原工作树、提交或推送。没有逐条证明全部后端字段/生产数据兼容，没有覆盖所有生命周期组合。JS独立预览、像素对照、完整功能/权限联调和PM03业务链全部未验证。


## 冻结后共享底栏专项补审
- 已读取V5Frame/V5Form完整增量及注册、销毁、输入/身份变更、latest、submit相关路径；actionInFooter默认false，只在试镜预约_bookingForm和delivery分支启用。27个调用点中其余25处未选择新能力。
- 单一候选且无显式footer时承接原_action；_V5ActionScope传播所有权，正文以footerOwner!=this判断是否保留原按钮。多候选/显式footer/无Frame回退正文。原回调和原pending恢复使用同一方法，未复制业务写入。
- 新增参数和InheritedWidget构造/定义存在，两个opt-in保留原canSubmit、beforeSubmit、请求体和版本。wallet所有footer分支复用_footerPair，<340或文字缩放阈值纵排已读。
- 确认一项源码可到达风险并已报告owner：submit入口无busy/completed保护，form busy更新后父footer经post-frame才刷新，旧enabled回调可能额外存活一帧，再次触发不被入口拦截。建议仅添加 if (busy || completed) return;，不改任何业务契约。此风险未实机复现。协调者在owner保存后复读源码，已确认submit入口 `if (busy || completed) return;` 与确认返回后 `if (!mounted || busy || completed) return;` 两处即时守卫；原pending、版本及请求体不变。修正后v5_support SHA256：ef5c26c9d09a298a08a259f087e45bfe92d198f45c9b6c86000e163cfc4af963。
- 未发现其他可证实的共享改造符号缺失或业务条件删除。首帧迁移、候选切换、键盘、身份切换、未知恢复及并发仍须运行验收。

## 专项补审后文件摘要
2026-11-16T13:18:22.210057+00:00
- account/business_library.dart · 44f6707e2f33d701
- artists/artists_forms.dart · 9c9d2da21ab03210
- artists/artists_pages.dart · 039d815d0b4c17c5
- auditions/auditions_actions.dart · 8622b3ff866696dd
- auditions/auditions_offer_form.dart · ca5e24e1fd609c89
- auditions/auditions_pages.dart · b218242fcf02934c
- contracts/contract_page.dart · b9277034a5884f4b
- discovery/public_discovery.dart · b39d6a5bd96db0fd
- engagement/engagement_pages.dart · eac9b174ee4389e7
- finance/finance_forms.dart · 9e04dececdad3caf
- finance/finance_pages.dart · 244ef9c46e40572f
- licensing/license_pages.dart · 555eb257a6cd3a45
- navigation/app_shell.dart · cf4e445dd40711bd
- notices/notices_pages.dart · a88f94b5678c0f62
- privacy/privacy_pages.dart · 0141ec8cb70566d0
- production/fulfillment_pages.dart · b72e6e6c7230fcb9
- redemption/redemption_pages.dart · 80d40dd80edd2335
- stock/stock_listing_form.dart · 4ae3562692d57e85
- stock/stock_pages.dart · 10e2d9a35a3f4827
- stock/v5_support.dart · 54000fc7b55f89c0
- support/collections.dart · 93163b4d78519170
- support/invoices.dart · 62184489faf4c276
- support/support_pages.dart · 94513889d3f315be
- support/tickets.dart · 838030f5b944ae14
- trade/trade_pages.dart · 6544fd0e014a13ac
- wallet/wallet_pages.dart · 9551243c039fc97f
