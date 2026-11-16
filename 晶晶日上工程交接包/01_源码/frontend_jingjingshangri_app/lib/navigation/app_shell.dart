import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../auditions/auditions_pages.dart';
import '../notices/notices_pages.dart';
import '../operations/identity_notifications.dart';
import '../plaza/plaza_pages.dart';
import '../widgets/editorial_icons.dart';
import 'package:flutter/services.dart';

/// Keep the current tab address without replacing the mounted shell. Child
/// routes still use ordinary Material routes and return to this updated address.
class AppShellRoute extends MaterialPageRoute<dynamic> {
  AppShellRoute({required RouteSettings settings, required AppShell shell})
      : _shellSettings = settings,
        super(settings: settings, builder: (_) => shell);

  RouteSettings _shellSettings;

  @override
  RouteSettings get settings => _shellSettings;

  @override
  Duration get transitionDuration => Duration.zero;

  @override
  Duration get reverseTransitionDuration => Duration.zero;

  void selectTab(String address) {
    _shellSettings = RouteSettings(name: address);
    changedInternalState();
    if (kIsWeb) {
      unawaited(SystemNavigator.routeInformationUpdated(
          uri: Uri.parse(address), replace: true));
    }
  }
}

/// The five business entrances share one shell. Private tasks open as child
/// routes and keep their own permission gates and back navigation.
class AppShell extends StatefulWidget {
  const AppShell({super.key, this.initialTab = 0});
  final int initialTab;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  late int _selected = widget.initialTab.clamp(0, 4);
  final _visited = <int>{};
  String _city = '';
  (int, String?, String?)? _sessionContext;
  static const _labels = ['广场', '试镜', '通告', '消息', '我的'];
  static const _routes = [
    '/square',
    '/audition',
    '/notices',
    '/messages',
    '/my'
  ];
  static const _icons = [
    EditorialIcons.house,
    EditorialIcons.film,
    EditorialIcons.document,
    EditorialIcons.chatDotRound,
    EditorialIcons.user,
  ];

  void _select(int index) {
    if (index != _selected) {
      setState(() {
        _selected = index;
        _visited.add(index);
      });
      final route = ModalRoute.of(context);
      if (route is AppShellRoute) route.selectTab(_routes[index]);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = context.watch<AccountSession>();
    final next =
        (session.epoch, session.account?['id'] as String?, session.partyId);
    if (_sessionContext != next) {
      _sessionContext = next;
      // Drop inactive tabs on an identity/session change. Their private gates
      // will read fresh data only when the user opens that section again.
      _visited
        ..clear()
        ..add(_selected);
    }
  }

  Future<void> _open(String route) async {
    await Navigator.pushNamed(context, route);
  }

  Widget _entry(
          String title, String description, IconData icon, VoidCallback open) =>
      Material(
          color: AccountTheme.surface,
          borderRadius: BorderRadius.circular(20),
          child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: open,
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(16),
                child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            Text(title,
                                style: const TextStyle(
                                    fontFamily: AccountTheme.serif,
                                    fontSize: 20,
                                    fontWeight: FontWeight.w700)),
                            if (description.isNotEmpty)
                              const SizedBox(height: 6),
                            if (description.isNotEmpty)
                              Text(description,
                                  style: const TextStyle(
                                      fontSize: 12,
                                      color: AccountTheme.muted,
                                      height: 1.6)),
                          ])),
                      const SizedBox(width: 16),
                      const Icon(Icons.north_east,
                          size: 20, color: AccountTheme.accent),
                    ]),
              )));

  List<Widget> _audition() => [
        supplyBusinessIntro('试镜', '按公开约定选择时间、场所和含交通总价，接单与核实付款分别办理。'),
        _entry(
            '可预约艺人',
            '查看可约时间、公开价格和试镜服务范围。',
            Icons.video_camera_front_outlined,
            () => _open('/auditions/catalog')),
        _entry('我的预约', '处理接单、交通、材料收讫、售后与核实退款。', Icons.event_outlined,
            () => _open('/auditions/bookings')),
        _entry('试镜服务与接单', '本人设置可约服务并管理已经收到的预约。', Icons.perm_identity_outlined,
            () => _open('/auditions/offers')),
      ];

  List<Widget> _notices() => [
        supplyBusinessIntro('通告', '剧、商演、商单、活动、招募和平台通告，按类别办理发布与单向投稿。'),
        _entry('浏览六类通告', '核对用途、地区、截止时间与真实发布方。', Icons.article_outlined,
            () => _open('/notices/catalog')),
        _entry('发布通告', '先核对当前身份资格，再填写本次真实要求。', Icons.edit_outlined,
            () => _open('/notices/new')),
        _entry('我的通告与投稿', '逐项查看发布、投稿、合作意向和客服处理。', Icons.inbox_outlined,
            () => _open('/notices/records?kind=SUBMISSION')),
        _entry('公开项目与角色', '查看当前公开项目与可申请角色。', Icons.movie_filter_outlined,
            () => _open('/projects/catalogue')),
        _entry('商业委托', '按实际资格提交或处理商单提案。', Icons.work_outline,
            () => _open('/gigs')),
      ];

  Widget supplyBusinessIntro(String title, String description) => Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(description,
            style: const TextStyle(
                fontSize: 14, color: AccountTheme.muted, height: 1.6)),
      ]));

  List<Widget> _mine(AccountSession session) => [
        if (!session.isLoggedIn) ...[
          const Text('欢迎来到晶晶日上',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Text(session.authNotice ?? '登录后选择办事身份，管理自己的资料与合同。',
              style: const TextStyle(
                  fontSize: 14, color: AccountTheme.muted, height: 1.6)),
          const SizedBox(height: 20),
          FilledButton(
              onPressed: () => _open('/login'), child: const Text('手机号登录')),
          const SizedBox(height: 24),
        ] else ...[
          Container(
            color: AccountTheme.surface,
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                    width: 56, height: 56,
                    decoration: BoxDecoration(
                        color: AccountTheme.selectedSurface,
                        borderRadius: BorderRadius.circular(10)),
                    child: const Icon(Icons.person_outline,
                        size: 32, color: AccountTheme.text)),
                const SizedBox(width: 12),
                Expanded(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(session.account?['display_name'] ?? '我的账号',
                      style: const TextStyle(fontSize: 20,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  const Text('认证与成长以本人记录为准',
                      style: TextStyle(fontSize: 11, color: AccountTheme.muted)),
                ])),
                IconButton(
                    tooltip: '复制账号编号',
                    onPressed: () => Clipboard.setData(
                        ClipboardData(text: session.account?['id'] ?? '')),
                    icon: const Icon(Icons.copy_outlined, size: 18)),
              ]),
              const SizedBox(height: 10),
              TextButton(
                  style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: const Size(0, 32),
                      alignment: Alignment.centerLeft,
                      foregroundColor: AccountTheme.text),
                  onPressed: () => _open('/account'),
                  child: const Text('个人资料与身份 ↗')),
              Row(children: [
                Expanded(child: Text(
                    '当前身份 · ${session.party?['display_name'] ?? '尚未选择办事身份'}',
                    style: const TextStyle(fontSize: 12, color: AccountTheme.muted))),
                TextButton(onPressed: () => _open('/account'),
                    child: const Text('切换身份')),
              ]),
            ]),
          ),
        ],
        Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _myDirectory()),
      ];

  Widget _myDirectory() {
    final groups = <(String, String, List<(String, String)>)>[
      (
        '业务与作品',
        '订单 · 出品参演 · 已购作品',
        [
          ('合同、作品与收入目录', '/library'),
          ('我的故事与草稿', '/customization'),
          ('发起制作需求', '/customization/new'),
          ('订单与付款', '/orders'),
          ('我的参与项目', '/my-projects'),
          ('参与制作项目', '/production'),
          ('我的交付作品', '/production/works'),
          ('我购买的现成视频', '/stock/purchases'),
          ('参演条款与会签', '/projects/participation'),
          ('独立发行收入约定', '/projects/income'),
          ('合同与原约定', '/library?section=contracts'),
          ('多人共创', '/cocreation'),
          ('我的许可办理', '/licensing'),
          ('我的许可项目', '/licensing?kind=PROJECT'),
          ('我的预约', '/auditions/bookings'),
          ('我的通告与投稿', '/notices/records?kind=SUBMISSION'),
        ]
      ),
      (
        '艺人与商品',
        '我的艺人 · 数字人 · 视频 · 试镜设置',
        [
          ('管理我的艺人', '/artists'),
          ('数字人资料', '/my-humans'),
          ('我的现成作品上架', '/stock/listings'),
          ('试镜服务与接单', '/auditions/offers'),
          ('我的商单与接单约定', '/gigs/records?kind=GIG'),
          ('历史作品资料', '/supply'),
          ('人工短视频定制', '/ai-create'),
        ]
      ),
      (
        '认证与成长',
        '实名 · 主角光环 · 晶钻 · 星探',
        [
          ('账号与机构', '/account'),
          ('成长与推荐', '/engagement?view=growth'),
          ('晶钻中心', '/wallet/points'),
          ('星探中心', '/wallet/scout'),
          ('权益兑换与抽奖', '/redemption'),
          ('MCN 直接合作', '/mcn'),
          ('MCN 经营与委派', '/engagement?view=mcn'),
        ]
      ),
      (
        '资金与收益',
        '消费余额 · 晶钻 · 艺人收入',
        [
          ('消费钱包、晶钻与会员', '/wallet'),
          ('发票与票据', '/invoices'),
          ('我的结算', '/finance'),
          ('佣金核算', '/gigs/records?kind=COMMISSION'),
          ('结算业务通知', '/finance/notifications'),
        ]
      ),
      (
        '收藏与足迹',
        '收藏的艺人、作品与通告',
        [('收藏与足迹', '/saved')]
      ),
      (
        '账号与帮助',
        '隐私设置 · 账号管理 · 帮助反馈',
        [
          ('个人信息与隐私权益', '/privacy/requests'),
          ('监护管理与未成年退款', '/contract-six/guardians'),
          ('侵权通知与反通知', '/contract-six/infringement'),
          ('设置与帮助', '/settings'),
          ('帮助与反馈', '/help'),
          ('系统与业务通知', '/operations/notifications'),
          ('商单通知', '/gigs/notifications'),
        ]
      ),
    ];
    return Column(children: [
      for (final g in groups)
        DecoratedBox(
            decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: AccountTheme.border))),
            child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                childrenPadding: const EdgeInsets.only(left: 12),
                shape: const Border(),
                collapsedShape: const Border(),
                title: Text(g.$1,
                    style: const TextStyle(
                        fontFamily: AccountTheme.serif,
                        fontSize: 21,
                        height: 1.3,
                        fontWeight: FontWeight.w700)),
                subtitle: g.$1 == '资金与收益'
                    ? Row(children: [
                        Expanded(child: TextButton(
                            onPressed: () => _open('/wallet'),
                            child: const Text('消费余额\n查看本人钱包'))),
                        Expanded(child: TextButton(
                            onPressed: () => _open('/finance'),
                            child: const Text('收入与结算\n查看获准记录'))),
                      ])
                    : Text(g.$2, style: const TextStyle(
                        fontSize: 11, color: AccountTheme.muted)),
                trailing: const Icon(Icons.north_east, size: 22),
                children: [
                  for (final item in g.$3)
                    _entry(item.$1, '', Icons.north_east, () => _open(item.$2))
                ])),
    ]);
  }

  Widget _section(int index, AccountSession session) {
    if (index == 0) {
      return PlazaPage(
          session: session,
          initialCity: _city,
          active: _selected == 0,
          onOpen: _open,
          onCityChanged: (city) {
            if (mounted && city != _city) setState(() => _city = city);
          });
    }
    final children = switch (index) {
      1 => [
          if (session.isLoggedIn)
            AuditionsPage(embedded: true, initialCity: _city)
          else
            ..._audition(),
          _entry('我的预约', '处理接单、交付和退款。', Icons.event_outlined,
              () => _open('/auditions/bookings')),
          _entry('试镜服务与接单', '本人设置服务并管理预约。', Icons.perm_identity_outlined,
              () => _open('/auditions/offers')),
        ],
      2 => [
          if (session.isLoggedIn)
            NoticesPage(embedded: true, initialCity: _city)
          else
            ..._notices(),
          _entry('发布通告', '核对身份资格后填写要求。', Icons.edit_outlined,
              () => _open('/notices/new')),
          _entry('我的通告与投稿', '查看发布、投稿与合作意向。', Icons.inbox_outlined,
              () => _open('/notices/records?kind=SUBMISSION')),
          _entry('公开项目与角色', '查看当前项目与可申请角色。', Icons.movie_filter_outlined,
              () => _open('/projects/catalogue')),
          _entry('商业委托', '按实际资格提交或处理提案。', Icons.work_outline,
              () => _open('/gigs')),
          _entry('权益兑换与抽奖', '核对实际活动规则。', Icons.redeem_outlined,
              () => _open('/redemption')),
        ],
      3 => [
          IdentityNotificationsPage(
              key: ValueKey('messages:${session.epoch}:${session.partyId}'),
              embedded: true)
        ],
      4 => _mine(session),
      _ => <Widget>[],
    };
    return ListView(
        key: PageStorageKey('app-section-$index:$_sessionContext'),
        primary: false,
        padding: index == 0 || index == 4 && session.isLoggedIn
            ? EdgeInsets.zero
            : const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [...children, const SizedBox(height: 24)]);
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<AccountSession>();
    return AccountTheme(
        child: Scaffold(
      appBar: _selected == 0 || _selected == 3 || session.isLoggedIn && [1, 2].contains(_selected)
          ? null
          : AppBar(
              backgroundColor: _selected == 4 && session.isLoggedIn
                  ? AccountTheme.surface
                  : AccountTheme.canvas,
              foregroundColor: AccountTheme.text,
              automaticallyImplyLeading: false,
              centerTitle: false,
              titleSpacing: 16,
              toolbarHeight: 64,
              title: Text(_selected == 0 ? '晶晶日上' : _labels[_selected],
                  style: TextStyle(
                      color: AccountTheme.text,
                      fontFamily: AccountTheme.sans,
                      fontSize: 28,
                      fontWeight: FontWeight.w700)),
              actions: [
                  IconButton(
                      tooltip: _selected == 4 ? '设置与帮助' : '通知',
                      onPressed: () => _open(_selected == 4
                          ? '/settings'
                          : '/operations/notifications'),
                      icon: Icon(_selected == 4
                          ? Icons.settings_outlined
                          : Icons.notifications_outlined)),
                ]),
      body: SafeArea(
          child: Center(
              child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: KeyedSubtree(
                      key: ValueKey(_sessionContext),
                      child: IndexedStack(
                          index: _selected,
                          children: List.generate(
                              5,
                              (index) => _visited.contains(index)
                                  ? ExcludeFocus(
                                      excluding: index != _selected,
                                      child: TickerMode(
                                          enabled: index == _selected,
                                          child: _section(index, session)))
                                  : const SizedBox.shrink())))))),
      bottomNavigationBar: Column(mainAxisSize: MainAxisSize.min, children: [
        DecoratedBox(
            decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: AccountTheme.border))),
            child: NavigationBarTheme(
                data: NavigationBarThemeData(
                    iconTheme: WidgetStateProperty.resolveWith((states) =>
                        IconThemeData(size: 22, color: states.contains(WidgetState.selected)
                            ? AccountTheme.accent : AccountTheme.muted)),
                    labelTextStyle: WidgetStateProperty.resolveWith((states) =>
                        TextStyle(
                            fontFamily: AccountTheme.sans,
                            fontFamilyFallback: AccountTheme.sansFallback,
                            fontSize: 11,
                            color: states.contains(WidgetState.selected)
                                ? AccountTheme.vermilion
                                : AccountTheme.text))),
                child: NavigationBar(
                    animationDuration: MediaQuery.disableAnimationsOf(context)
                        ? Duration.zero
                        : const Duration(milliseconds: 140),
                    height: 64,
                    elevation: 0,
                    backgroundColor: AccountTheme.canvas,
                    indicatorColor: Colors.transparent,
                    selectedIndex: _selected,
                    onDestinationSelected: _select,
                    labelBehavior:
                        NavigationDestinationLabelBehavior.alwaysShow,
                    destinations: List.generate(
                        5,
                        (i) => NavigationDestination(
                            key: Key('app-tab-$i'),
                            icon: Icon(_icons[i]),
                            selectedIcon:
                                Stack(clipBehavior: Clip.none, children: [
                              Icon(_icons[i]),
                              const Positioned(
                                  top: -3,
                                  right: -3,
                                  child: SizedBox(
                                      width: 5,
                                      height: 5,
                                      child: DecoratedBox(
                                          decoration: BoxDecoration(
                                              color: AccountTheme.vermilion,
                                              shape: BoxShape.circle)))),
                            ]),
                            label: _labels[i]))))),
      ]),
    ));
  }
}

/// A child reached by a supported link; its business capability is not enabled.
class AppUnavailablePage extends StatelessWidget {
  const AppUnavailablePage(
      {super.key, required this.title, required this.description});
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) => _ChildPage(
        title: title,
        children: [
          const Icon(Icons.hourglass_empty,
              size: 40, color: AccountTheme.accent),
          const SizedBox(height: 24),
          const Text('暂未开放',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Text(description,
              style: const TextStyle(color: AccountTheme.muted, height: 1.6)),
          const SizedBox(height: 24),
          FilledButton(
              onPressed: () => Navigator.pushNamed(context, '/supply'),
              child: const Text('前往作者与作品')),
          const SizedBox(height: 12),
          OutlinedButton(
              onPressed: () => Navigator.pushNamed(context, '/account'),
              child: const Text('管理账号与机构')),
        ],
      );
}

class AppUnknownPage extends StatelessWidget {
  const AppUnknownPage({super.key});
  @override
  Widget build(BuildContext context) => _ChildPage(
        title: '页面不存在',
        children: [
          const Icon(Icons.link_off, size: 40, color: AccountTheme.muted),
          const SizedBox(height: 24),
          const Text('这个地址不存在，可能已调整。',
              style: TextStyle(fontSize: 20, height: 1.5)),
          const SizedBox(height: 12),
          const Text('请从首页的入口重新打开。',
              style: TextStyle(color: AccountTheme.muted)),
          const SizedBox(height: 24),
          FilledButton(
              onPressed: () =>
                  Navigator.pushNamedAndRemoveUntil(context, '/', (_) => false),
              child: const Text('返回首页')),
        ],
      );
}

class AppHelpPage extends StatelessWidget {
  const AppHelpPage({super.key});
  Widget _entry(BuildContext context, String title, String description,
          String route, {String action = '管理'}) =>
      InkWell(
          onTap: () => Navigator.pushNamed(context, route),
          child: Container(
              padding: const EdgeInsets.symmetric(vertical: 20),
              decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: AccountTheme.border))),
              child: Row(children: [
                Expanded(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  Text(description, style: const TextStyle(
                      fontSize: 12, color: AccountTheme.muted, height: 1.5)),
                ])),
                const SizedBox(width: 16),
                Text(action, style: const TextStyle(fontSize: 12)),
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right, size: 16),
              ])));
  @override
  Widget build(BuildContext context) =>
      _ChildPage(title: '个人资料与账号设置', children: [
        const Text('你的资料与使用偏好',
            style: TextStyle(color: AccountTheme.accent, fontSize: 12)),
        const SizedBox(height: 16),
        const Text('资料与设置',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        _entry(context, '个人资料与账号', '查看本人资料、绑定手机号与账号安全。',
            '/account', action: '编辑'),
        _entry(context, '业务消息与使用偏好',
            '管理通知、个性化和休息设置；必要业务记录仍保留在消息中心。',
            '/privacy?view=preferences'),
        _entry(context, '账号、安全与隐私权利',
            '本人资料申请、信息副本、删除与注销。',
            '/privacy?view=requests', action: '查看'),
        _entry(context, '机构经营与平台工作',
            '查看已授权的办事身份与机构成员；批量经营使用独立工作台。',
            '/account', action: '进入'),
        _entry(context, '用户协议', '查看当前保留的协议文本与更新说明。',
            '/agreement', action: '阅读'),
        _entry(context, '隐私政策', '查看隐私文本与适用范围说明。',
            '/privacy', action: '阅读'),
        _entry(context, '帮助与反馈', '查找办理问题、提交问题并查看处理进度。',
            '/help', action: '打开'),
        const SizedBox(height: 20),
        const Text('各项偏好在对应页面读取并保存；本页不显示尚未读取的开关状态。退出账号请进入账号管理。',
            style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.6)),
        const SizedBox(height: 24),
        const Text('晶晶日上', style: TextStyle(
            color: AccountTheme.muted, fontSize: 12)),
      ]);
}

/// Preserve the source text without presenting it as newly approved terms.
class AppLegalPage extends StatelessWidget {
  const AppLegalPage(
      {super.key,
      required this.title,
      required this.body,
      required this.updatedAt});
  final String title;
  final String body;
  final String updatedAt;

  @override
  Widget build(BuildContext context) => _ChildPage(
        title: title,
        children: [
          const Text('历史文本 · 待更新',
              style: TextStyle(
                  color: AccountTheme.accent, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          const Text('以下保留原版本。服务范围与联系方式仍需核对，不代表相关服务已开放。',
              style: TextStyle(color: AccountTheme.muted, height: 1.6)),
          const SizedBox(height: 12),
          Text(updatedAt,
              style: const TextStyle(color: AccountTheme.muted, fontSize: 12)),
          const SizedBox(height: 24),
          ...body
              .split('\n\n')
              .where((block) => block.trim().isNotEmpty)
              .map((block) {
            final heading = block.startsWith('## ');
            return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: SelectableText(heading ? block.substring(3) : block,
                    style: TextStyle(
                        fontSize: heading ? 18 : 14,
                        fontWeight:
                            heading ? FontWeight.w700 : FontWeight.normal,
                        height: 1.7)));
          }),
        ],
      );
}

class _ChildPage extends StatelessWidget {
  const _ChildPage({required this.title, required this.children});
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => AccountTheme(
      child: Scaffold(
          appBar: AppBar(
              title: Text(title),
              leading: BackButton(onPressed: () {
                if (Navigator.canPop(context)) {
                  Navigator.pop(context);
                } else {
                  Navigator.pushReplacementNamed(context, '/');
                }
              })),
          body: SafeArea(
              child: Center(
                  child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 560),
                      child: ListView(
                          padding: const EdgeInsets.all(16),
                          children: children))))));
}
