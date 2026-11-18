# 累计 Dart 静态抽查（不等于编译或测试）
时间：2026-11-16T10:38:41.758966+00:00
## 方法和范围
只读取 snapshot 与 working 文件差异、调用点和本地定义；没有formatter、analyzer、编译、测试、功能联调或业务请求。仅此报告写盘，无源码修改。
枚举时有 34 个 Dart 文件相对初始快照变化；其他worker仍可能改 artists/growth/wallet，结论仅适用观察时文本，未冻结全树，未逐行审完全部差异。
抽看：plaza_pages、artists_public_media、stock_pages/listing_form、project_pages、finance_pages/forms、production_pages、cocreation_pages、licensing模型/页面、collections，以及artists_pages、redemption_pages、auditions_actions、engagement_pages部分增量。

## 已确认问题
1. stock/stock_pages.dart：listings模式有重复正文主标题。前面的通用else if(widget.mode!='video')用title生成“视频商品”，后面的listings分支又生成同名tradeHeading。建议通用标题分支排除listings，或删除专属重复标题。已向协调者报告，本报告未改源码。

## 小问题/待核而非阻断结论
- engagement成长页新数值卡包含等级/累计/近期，旧“当前成长”段仍重复这些值；界面冗余，文件仍可能在修改。
- finance新增底栏收益流水/申请收款与原正文按钮重复，disable条件看起来保留原available/merchant-retained限制；不宣称全部权限正确。
- production固定双列底栏、其他新增底栏和4列精选，长文/大字/窄屏未渲染，不能确认无overflow。
- auditions新增进度使用v5InputIds，该函数会抛INVALID_ID，但原选择行本来这样调用且值由受控checkbox组成，因此未认定为新增确定故障。恢复输入状态仍待验证。

## 抽查定义与保留点（非通过声明）
- plaza的ArtistPublicPortrait.circular与构造器新增bool参数对应，原Image读取和失效回调仍在。
- stock_listing_form新spec_title/unit_minor展示字段在原load选项文案已使用，不是杜撰响应字段。
- tradeHeading.fontSize存在，项目/成长新增AccountTheme导入存在。
- stock CUSTODY新创建禁用及checkout早返回仅在无原pending时拒绝，原pending恢复保留；不是所有恢复路径已验。
- production当前版本来自真实current映射及versions查找，缺失禁用；原API/交付/验收/许可控制未从本次diff移除。
- 共创人数仍读count与snapshot，未写死人数、付款或开工成功；授权确认仍经原校验。
- GRANT紧凑行的r.title有本地合法回退，statusText仍保留期限判断。
- 未在这些抽查点发现可直接确认的编译缺符号问题，不代表整个工程可编译或功能完整。

## 当时变更清单
- customization/customization_page.dart
- trade/trade_pages.dart
- contracts/contract_page.dart
- projects/project_pages.dart
- navigation/app_shell.dart
- gigs/gig_pages.dart
- gigs/gig_forms.dart
- operations/identity_notifications.dart
- notices/notices_submission.dart
- notices/notices_pages.dart
- engagement/engagement_pages.dart
- plaza/plaza_pages.dart
- support/support_pages.dart
- support/tickets.dart
- support/collections.dart
- wallet/wallet_pages.dart
- production/production_pages.dart
- production/production_service_page.dart
- auditions/auditions_pages.dart
- auditions/auditions_actions.dart
- auditions/auditions_offer_form.dart
- finance/finance_forms.dart
- finance/finance_pages.dart
- artists/artists_public_media.dart
- artists/artists_forms.dart
- artists/artists_pages.dart
- cocreation/cocreation_pages.dart
- licensing/license_pages.dart
- account/business_library.dart
- account/account_page.dart
- stock/stock_pages.dart
- stock/stock_listing_form.dart
- pages/login/login_page.dart
- redemption/redemption_pages.dart
