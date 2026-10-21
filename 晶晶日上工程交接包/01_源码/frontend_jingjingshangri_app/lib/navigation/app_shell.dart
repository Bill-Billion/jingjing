import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
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
    Icons.grid_view_outlined,
    Icons.video_camera_front_outlined,
    Icons.article_outlined,
    Icons.chat_bubble_outline,
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
      Material(
          color: AccountTheme.canvas,
          child: InkWell(
              onTap: open,
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: const BoxDecoration(
                    border:
                        Border(bottom: BorderSide(color: AccountTheme.border))),
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
                            const SizedBox(height: 6),
                            Text(description,
                                style: const TextStyle(
                                    fontSize: 12,
                                    color: AccountTheme.muted,
                                    height: 1.6)),
                          ])),
                      const SizedBox(width: 16),
                      const Icon(Icons.north_east,
                          size: 20, color: AccountTheme.text),
                    ]),
              )));

  Widget _heading(String title) => Padding(
      padding: const EdgeInsets.only(top: 28, bottom: 4),
      child: Text(title,
          style: const TextStyle(
              fontFamily: AccountTheme.serif,
              fontSize: 23,
              fontWeight: FontWeight.w700)));

  Widget _storyFeature() =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Divider(color: AccountTheme.text, height: 16),
        const Padding(
            padding: EdgeInsets.only(top: 18, bottom: 12),
            child: Text('平台制作 / 由专员对接',
                style: TextStyle(fontSize: 11, color: AccountTheme.accent))),
        const Text('让故事\n与你有关',
            style: TextStyle(
                fontFamily: AccountTheme.serif,
                fontSize: 42,
                fontWeight: FontWeight.w700,
                height: 1.18)),
        const SizedBox(height: 18),
        Image.asset('assets/images/editorial-rain.webp',
            height: 205,
            fit: BoxFit.cover,
            excludeFromSemantics: true,
            alignment: const Alignment(0, -.25)),
        Container(
            color: AccountTheme.text,
            padding: const EdgeInsets.all(14),
            child: const Text('写下自己的故事，交由平台制作专员接收。',
                style: TextStyle(
                    color: AccountTheme.canvas, fontSize: 13, height: 1.6))),
      ]);

  List<Widget> _currentTools() => [
        _heading('已有业务'),
        _entry(
          '订单与报价',
          '查看已收到的报价、原订单和付款记录。',
          Icons.receipt_long_outlined,
          () => _open('/orders'),
        ),
        _entry(
          '制作与交付',
          '查看具体项目、审片反馈和已获准交付的作品。',
          Icons.movie_outlined,
          () => _open('/production'),
        ),
        _entry(
          '合同与原约定',
          '按权限查看合同当时保存的内容和规则。',
          Icons.description_outlined,
          () => _open('/contract'),
        ),
      ];

  List<Widget> _home(AccountSession session) => [
        _storyFeature(),
        const SizedBox(height: 16),
        _entry(
          '把我的故事拍成片',
          '选择品类，写下想记录的内容；没写完可以先存草稿。',
          Icons.edit_note_outlined,
          () => _open('/customization/new'),
        ),
        _entry(
          '我的故事与草稿',
          '继续填写、查看已提交内容和平台受理进度。',
          Icons.drafts_outlined,
          () => _open('/customization'),
        ),
        _heading('发现与合作'),
        _entry(
          '艺人与视频',
          '查看已审核的公开艺人；现成视频目录仍待接入。',
          Icons.people_outline,
          () => _open('/discover'),
        ),
        _entry(
          '试镜预约',
          '查看试镜服务的接入进度。',
          Icons.video_camera_front_outlined,
          () => _select(1),
        ),
        _entry('通告与合作', '查看通告分类与已有合作业务。', Icons.article_outlined,
            () => _select(2)),
        ..._currentTools(),
      ];

  List<Widget> _audition() => [
        supplyBusinessIntro('试镜', '公开可约艺人、含交通的总价和预约接拒流程正在接入。'),
        appNotice('试镜预约暂未开放。预约、艺人接受、付款核实和后续出演授权会分别确认。'),
        _entry(
          '已有订单',
          '继续查看本人已有订单及其实际状态。',
          Icons.receipt_long_outlined,
          () => _open('/orders'),
        ),
        _entry(
          '写下制作意向',
          '暂未确定演员，也可以先提交文字故事。',
          Icons.edit_note_outlined,
          () => _open('/customization/new'),
        ),
      ];

  List<Widget> _notices() => [
        supplyBusinessIntro('通告', '剧、商演、商单、活动、招募和平台通告将分别提供发布与投稿入口。'),
        appNotice('六类通告与单向投稿正在接入。下面保留已有业务入口，各自按原约定办理。'),
        _entry(
          '公开项目与角色',
          '查看当前公开项目和角色摘要。',
          Icons.movie_filter_outlined,
          () => _open('/projects/catalogue'),
        ),
        _entry(
          '商业委托',
          '查看已有商业需求，按实际资格提交或处理提案。',
          Icons.work_outline,
          () => _open('/gigs'),
        ),
      ];

  List<Widget> _messages() => [
        supplyBusinessIntro('消息', '把业务变化、合作意向与具体订单沟通分开查看。'),
        _entry(
          '系统与业务通知',
          '查看当前账号和办理身份获准的通知。',
          Icons.notifications_outlined,
          () => _open('/operations/notifications'),
        ),
        _entry(
          '订单与项目留言',
          '围绕本人有权参与的订单和项目查看现有留言。',
          Icons.chat_bubble_outline,
          () => _open('/chat'),
        ),
        appNotice('单向投稿和客服处理会话正在接入。提交故事后的进度可在“我的故事与草稿”查看。'),
        _entry(
          '我的故事与草稿',
          '查看平台待查看、受理中等实际状态。',
          Icons.drafts_outlined,
          () => _open('/customization'),
        ),
      ];

  Widget supplyBusinessIntro(String title, String description) => Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
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
                        borderRadius: BorderRadius.zero,
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
          Container(
              color: AccountTheme.text,
              padding: const EdgeInsets.fromLTRB(20, 22, 16, 22),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                const Text('我',
                    style: TextStyle(
                        fontFamily: AccountTheme.serif,
                        color: AccountTheme.canvas,
                        fontSize: 86,
                        fontWeight: FontWeight.w700,
                        height: 1.15)),
                const SizedBox(width: 20),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(session.account?['display_name'] ?? '我的账号',
                          style: const TextStyle(
                              color: AccountTheme.canvas,
                              fontSize: 17,
                              fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      const Text('把每一次出场，留成作品。',
                          style: TextStyle(
                              color: AccountTheme.canvas,
                              fontSize: 11,
                              height: 1.7)),
                    ])),
                IconButton(
                    tooltip: '复制账号编号',
                    onPressed: () => Clipboard.setData(
                        ClipboardData(text: session.account?['id'] ?? '')),
                    icon: const Icon(Icons.copy_outlined,
                        size: 18, color: AccountTheme.canvas)),
              ])),
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
        _entry('业务通知', '查看当前账号和办事身份获准的业务变化。', Icons.notifications_outlined,
            () => _open('/operations/notifications')),
        _heading('我的故事'),
        _entry('我的故事与草稿', '找回草稿、查看提交内容和受理进度。', Icons.drafts_outlined,
            () => _open('/customization')),
        _entry('发起制作需求', '选一个品类，先写下你的故事。', Icons.edit_note_outlined,
            () => _open('/customization/new')),
        _menuGrid(),
        _heading('商单与直接合作'),
        _entry('商单通知', '查看商单暂停与直接合作结束记录', Icons.notifications_outlined,
            () => _open('/gigs/notifications')),
        _entry('我的商单与接单约定', '查看当前身份的需求、约定与审核状态。', Icons.work_outline,
            () => _open('/gigs/records?kind=GIG')),
        _entry('MCN 直接合作', '本人确认、拒绝或结束双方直接合作。', Icons.handshake_outlined,
            () => _open('/mcn')),
        _entry('佣金核算', '按真实净额计提；没有出款与提现接入。', Icons.account_balance_outlined,
            () => _open('/gigs/records?kind=COMMISSION')),
        _heading('订单与付款'),
        _entry('我的结算', '先选约定，核对本人金额、确认、付款申请与真实实付。',
            Icons.account_balance_wallet_outlined, () => _open('/finance')),
        _entry('结算业务通知', '仅当前身份获准参与的结算业务。', Icons.notifications_outlined,
            () => _open('/finance/notifications')),
        _entry('订单、报价与旧记录', '核对原报价、付款节点与退款状态。', Icons.receipt_long_outlined,
            () => _open('/orders')),
        _heading('公开项目与发行'),
        _entry('我的参与项目', '回应邀请、本人入组、逐版确认与发行进度。', Icons.folder_open_outlined,
            () => _open('/my-projects')),
        _heading('制作与交付'),
        _entry('参与制作项目', '审阅具体版本、提交本版意见与查看修改记录。', Icons.movie_outlined,
            () => _open('/production')),
        _entry('我的交付作品', '当前最终成片、验收付款与受控下载。', Icons.lock_outline,
            () => _open('/production/works')),
        _heading('剧本许可'),
        _entry('我的许可办理', '签署、身份、权属核验与许可生效条件。', Icons.verified_outlined,
            () => _open('/licensing')),
        _entry('我的许可项目', '查看公开项目与许可绑定。', Icons.folder_open_outlined,
            () => _open('/licensing?kind=PROJECT')),
        _heading('创作与供给'),
        _entry('历史作品资料', '查看此前保存的作品和权利资料。', Icons.edit_note_outlined,
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
      1 => _audition(),
      2 => _notices(),
      3 => _messages(),
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
                padding: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                    borderRadius: BorderRadius.zero,
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
          centerTitle: _selected == 0,
          titleSpacing: 16,
          toolbarHeight: _selected > 0 && _selected < 4 ? 78 : 56,
          title: Text(_selected == 0 ? '晶晶日上' : _labels[_selected],
              style: TextStyle(
                  fontFamily: AccountTheme.serif,
                  fontSize: _selected > 0 && _selected < 4 ? 42 : 20,
                  fontWeight: FontWeight.w700)),
          actions: [
            IconButton(
                tooltip: _selected == 4 ? '设置与帮助' : '通知',
                onPressed: () => _open(
                    _selected == 4 ? '/settings' : '/operations/notifications'),
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
      bottomNavigationBar: DecoratedBox(
          decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: AccountTheme.border))),
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
              labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
              destinations: List.generate(
                  5,
                  (i) => NavigationDestination(
                      key: Key('app-tab-$i'),
                      icon: Icon(_icons[i]),
                      selectedIcon: Stack(clipBehavior: Clip.none, children: [
                        Icon(_icons[i]),
                        const Positioned(
                            bottom: -20,
                            left: 10,
                            child: SizedBox(
                                width: 3,
                                height: 3,
                                child:
                                    ColoredBox(color: AccountTheme.vermilion))),
                      ]),
                      label: _labels[i])))),
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
                      constraints: const BoxConstraints(maxWidth: 560),
                      child: ListView(
                          padding: const EdgeInsets.all(16),
                          children: children))))));
}
