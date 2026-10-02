import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import 'package:flutter/services.dart';
import '../licensing/license_pages.dart';

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
  (int, String?, String?)? _sessionContext;
  static const _labels = ['首页', '入戏', '培育', '成角', '我的'];
  static const _routes = ['/home', '/enter', '/cultivate', '/roles', '/my'];
  static const _icons = [
    Icons.home_outlined,
    Icons.menu_book_outlined,
    Icons.eco_outlined,
    Icons.star_outline,
    Icons.person_outline,
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

  void _open(String route) => Navigator.pushNamed(context, route);

  Widget _entry(
          String title, String description, IconData icon, VoidCallback open) =>
      Card(
          child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Icon(icon, color: AccountTheme.accent, size: 32),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(description,
                style:
                    const TextStyle(color: AccountTheme.muted, height: 1.5))),
        trailing: const Icon(Icons.chevron_right, color: AccountTheme.muted),
        onTap: open,
      ));

  Widget _heading(String title) => Padding(
      padding: const EdgeInsets.fromLTRB(0, 12, 0, 16),
      child: Text(title,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)));

  List<Widget> _currentTools() => [
        _heading('现在可以办理'),
        _entry('选剧本与许可', '了解许可范围，预留、提交材料并绑定用途项目。', Icons.menu_book_outlined,
            () => _open('/licensing/catalog')),
        _entry('作者与作品', '申请作者资格，管理投稿与私有权利材料。', Icons.edit_note_outlined,
            () => _open('/supply')),
        _entry('合同与原约定', '按权限查看合同当时保存的内容和规则。', Icons.description_outlined,
            () => _open('/contract')),
      ];

  List<Widget> _home(AccountSession session) => [
        const HomeStationHero(),
        const SizedBox(height: 16),
        LayoutBuilder(
            builder: (context, c) =>
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  for (var i = 1; i <= 3; i++) ...[
                    if (i > 1) const SizedBox(width: 8),
                    Expanded(
                        child: Card(
                            child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      Align(
                                          alignment: Alignment.centerLeft,
                                          child: Icon(_icons[i],
                                              size: 32,
                                              color: AccountTheme.accent)),
                                      const SizedBox(height: 10),
                                      Text(_labels[i],
                                          textAlign: TextAlign.left,
                                          style: const TextStyle(
                                              fontSize: 18,
                                              fontWeight: FontWeight.w700)),
                                      const SizedBox(height: 6),
                                      Text(['', '私人定制', '商业委托', '公开项目'][i],
                                          textAlign: TextAlign.left,
                                          style: const TextStyle(
                                              fontSize: 14,
                                              color: AccountTheme.muted)),
                                      const SizedBox(height: 12),
                                      FilledButton(
                                          style: FilledButton.styleFrom(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                      horizontal: 4),
                                              textStyle: const TextStyle(
                                                  fontSize: 12)),
                                          onPressed: () => _select(i),
                                          child: Text(
                                              ['', '去选剧本', '看商单', '看项目'][i],
                                              textAlign: TextAlign.center)),
                                    ])))),
                  ],
                ])),
        _entry('数字人资料', '管理本人的脸部、声音与用途授权 · 暂未开放', Icons.face_outlined,
            () => _open('/my-humans')),
        ..._currentTools(),
        appNotice('艺人发现暂未开放。当前没有可展示的公开人物目录。', icon: Icons.people_outline),
      ];

  List<Widget> _business(String subtitle, String description) => [
        supplyBusinessIntro(subtitle, description),
        _entry('业务通知', '查看与你相关的业务动态 · 暂未开放', Icons.notifications_outlined,
            () => _open('/messages')),
        appNotice('这部分业务仍在准备。可以先整理作者与作品资料，或查看已有合同。',
            icon: Icons.hourglass_empty),
        ..._currentTools(),
      ];

  Widget supplyBusinessIntro(String title, String description) => Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(title,
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        Text(description,
            style: const TextStyle(
                fontSize: 14, color: AccountTheme.muted, height: 1.6)),
      ]));

  Widget _menuGrid() => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('我的业务',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (final item in [
                ('数字人资料', Icons.face_outlined, '/my-humans'),
                ('订单与付款', Icons.receipt_long_outlined, '/orders'),
                ('我的项目', Icons.folder_open_outlined, '/my-projects'),
                ('我的结算', Icons.account_balance_outlined, '/wallet'),
              ])
                Expanded(
                    child: InkWell(
                        borderRadius: BorderRadius.circular(10),
                        onTap: () => _open(item.$3),
                        child: Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 4, vertical: 12),
                            child: Column(children: [
                              Icon(item.$2,
                                  size: 28, color: AccountTheme.accent),
                              const SizedBox(height: 10),
                              Text(item.$1,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(fontSize: 12)),
                            ])))),
            ]),
          ])));

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
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(children: [
                    const CircleAvatar(
                        radius: 28,
                        backgroundColor: Color(0xFFF0E8DE),
                        child: Icon(Icons.person_outline,
                            size: 32, color: AccountTheme.accent)),
                    const SizedBox(width: 16),
                    Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text(session.account?['display_name'] ?? '我的账号',
                              style: const TextStyle(
                                  fontSize: 20, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 6),
                          const Text('我的账号',
                              style: TextStyle(
                                  fontSize: 12, color: AccountTheme.muted)),
                        ])),
                    IconButton(
                        tooltip: '复制账号编号',
                        onPressed: () => Clipboard.setData(
                            ClipboardData(text: session.account?['id'] ?? '')),
                        icon: const Icon(Icons.copy_outlined, size: 20)),
                  ]))),
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(children: [
                    const Icon(Icons.badge_outlined,
                        size: 32, color: AccountTheme.accent),
                    const SizedBox(width: 12),
                    Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          const Text('当前操作身份',
                              style: TextStyle(
                                  fontSize: 12, color: AccountTheme.muted)),
                          const SizedBox(height: 6),
                          Text(session.party?['display_name'] ?? '尚未选择办事身份',
                              style: const TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w600)),
                        ])),
                    const SizedBox(width: 8),
                    FilledButton(
                        onPressed: () => _open('/account'),
                        child: const Text('切换身份')),
                  ]))),
        ],
        _entry('账号与机构', '管理账号、机构、邀请和办事身份。', Icons.manage_accounts_outlined,
            () => _open('/account')),
        _entry('业务通知', '查看与你相关的业务动态 · 暂未开放', Icons.notifications_outlined,
            () => _open('/messages')),
        _menuGrid(),
        _heading('订单与付款'),
        _entry('订单、报价与旧记录', '核对原报价、付款节点与退款状态。', Icons.receipt_long_outlined,
            () => _open('/orders')),
        _heading('剧本许可'),
        _entry('我的许可办理', '签署、身份、权属核验与许可生效条件。', Icons.verified_outlined,
            () => _open('/licensing')),
        _heading('创作与供给'),
        _entry('作者与作品', '申请作者资格，管理供给与作品资料。', Icons.edit_note_outlined,
            () => _open('/supply')),
        _entry('创作工具', '创作任务与历史作品 · 暂未开放', Icons.auto_awesome_outlined,
            () => _open('/ai-create')),
        _entry('合同与原约定', '按权限查看合同当时保存的内容和规则。', Icons.description_outlined,
            () => _open('/contract')),
        _heading('帮助与设置'),
        _entry('设置与帮助', '账号入口、用户协议和隐私政策。', Icons.settings_outlined,
            () => _open('/settings')),
      ];

  Widget _section(int index, AccountSession session) {
    final identityName = session.party?['display_name'] as String?;
    final children = switch (index) {
      1 => [
          _entry('查看已有报价', '私人定制：确认服务方已审核报价，付款与签署另行办理。',
              Icons.receipt_long_outlined, () => _open('/orders?kind=QUOTE')),
          const LicenseCatalog(embedded: true)
        ],
      2 => _business('让创作连接真实需求', '培育承接商业委托：发布品牌需求、确认接单约定，并按用途完成交付。'),
      3 => _business('在故事里找到你的角色', '成角承接公开项目与发行：了解招募、参与项目，并逐项确认授权与发行条件。'),
      4 => _mine(session),
      _ => _home(session),
    };
    return ListView(
        key: PageStorageKey('app-section-$index:$_sessionContext'),
        primary: false,
        padding: const EdgeInsets.all(16),
        children: [
          if (index == 0)
            Padding(
                padding: const EdgeInsets.only(bottom: 24),
                child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: () => _open('/account'),
                    child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Row(children: [
                          const Icon(Icons.person_outline,
                              color: AccountTheme.muted, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                              child: Text(
                                  session.isLoggedIn
                                      ? (identityName ?? '请选择办事身份')
                                      : '登录后选择办事身份',
                                  style: const TextStyle(
                                      color: AccountTheme.muted))),
                          const Icon(Icons.chevron_right,
                              size: 20, color: AccountTheme.muted),
                        ])))),
          ...children,
          const SizedBox(height: 24),
        ]);
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<AccountSession>();
    return AccountTheme(
        child: Scaffold(
      appBar: AppBar(
          automaticallyImplyLeading: false,
          centerTitle: false,
          title: Text(_selected == 0 ? '晶晶日上' : _labels[_selected],
              style:
                  const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
          actions: [
            IconButton(
                tooltip: _selected == 4 ? '设置与帮助' : '通知',
                onPressed: () =>
                    _open(_selected == 4 ? '/settings' : '/messages'),
                icon: Icon(_selected == 4
                    ? Icons.settings_outlined
                    : Icons.notifications_outlined)),
          ]),
      body: SafeArea(
          child: Center(
              child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 760),
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
      bottomNavigationBar: NavigationBar(
          animationDuration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 140),
          height: 72,
          elevation: 0,
          backgroundColor: AccountTheme.surface,
          indicatorColor: Colors.transparent,
          selectedIndex: _selected,
          onDestinationSelected: _select,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: List.generate(
              5,
              (i) => NavigationDestination(
                  key: Key('app-tab-$i'),
                  icon: Icon(_icons[i]),
                  selectedIcon: Icon([
                    Icons.home,
                    Icons.menu_book,
                    Icons.eco,
                    Icons.star,
                    Icons.person
                  ][i]),
                  label: _labels[i]))),
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
  Widget _section(String title, String description, IconData icon,
          List<Widget> actions) =>
      Card(
          child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(icon, size: 32, color: AccountTheme.accent),
                          const SizedBox(width: 16),
                          Expanded(
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                Text(title,
                                    style: const TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w700)),
                                const SizedBox(height: 8),
                                Text(description,
                                    style: const TextStyle(
                                        fontSize: 14,
                                        color: AccountTheme.muted,
                                        height: 1.5))
                              ])),
                        ]),
                    if (actions.isNotEmpty) const SizedBox(height: 16),
                    ...actions,
                  ])));
  @override
  Widget build(BuildContext context) => _ChildPage(title: '设置与帮助', children: [
        const Text('设置与帮助',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
        const SizedBox(height: 24),
        _section('隐私与协议', '查看保存的条款文本与当前说明。', Icons.description_outlined, [
          OutlinedButton(
              onPressed: () => Navigator.pushNamed(context, '/agreement'),
              child: const Text('用户协议')),
          const SizedBox(height: 12),
          OutlinedButton(
              onPressed: () => Navigator.pushNamed(context, '/privacy'),
              child: const Text('隐私政策')),
        ]),
        _section('账号与机构', '管理本人账号、办事身份与机构成员。', Icons.person_outline, [
          FilledButton(
              onPressed: () => Navigator.pushNamed(context, '/account'),
              child: const Text('管理账号与机构'))
        ]),
        _section('产品工作名', '晶晶日上', Icons.info_outline, []),
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
                      constraints: const BoxConstraints(maxWidth: 760),
                      child: ListView(
                          padding: const EdgeInsets.all(16),
                          children: children))))));
}
