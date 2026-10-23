import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../auditions/auditions_pages.dart';
import '../notices/notices_pages.dart';
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
  int _channel = 0;
  int _messageChannel = 0;
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

  Future<void> _chooseCity() async {
    final field = TextEditingController(text: _city);
    final selected = await showDialog<String>(
        context: context,
        builder: (c) => AccountTheme(
                child: AlertDialog(
              title: const Text('选择城市'),
              content: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('查看所选城市的公开内容',
                    style: TextStyle(color: AccountTheme.muted, fontSize: 13)),
                const SizedBox(height: 16),
                TextField(
                    controller: field,
                    maxLength: 40,
                    decoration: const InputDecoration(
                        labelText: '城市名称', hintText: '留空查看全部城市')),
              ]),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c), child: const Text('返回')),
                TextButton(
                    onPressed: () => Navigator.pop(c, ''),
                    child: const Text('全部城市')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, field.text.trim()),
                    child: const Text('确定')),
              ],
            )));
    // The dialog's exit animation may still reference its controller.
    if (selected != null && mounted) setState(() => _city = selected);
    await Future<void>.delayed(const Duration(milliseconds: 300));
    field.dispose();
  }

  String _catalogRoute() => Uri(
          path: _channel == 0 ? '/artists/catalog' : '/stock/catalog',
          queryParameters: _city.isEmpty ? null : {'city': _city})
      .toString();

  Widget _channelBar() => Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AccountTheme.text))),
      child: Row(children: [
        TextButton(
            onPressed: _chooseCity,
            style: TextButton.styleFrom(padding: EdgeInsets.zero),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 66),
                  child: Text(_city.isEmpty ? '城市' : _city,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12))),
              const Icon(Icons.expand_more, size: 14)
            ])),
        for (var i = 0; i < 2; i++)
          Semantics(
              selected: _channel == i,
              child: TextButton(
                  onPressed: () => setState(() => _channel = i),
                  style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 10)),
                  child: Container(
                      padding: const EdgeInsets.only(bottom: 5),
                      decoration: BoxDecoration(
                          border: Border(
                              bottom: BorderSide(
                                  color: _channel == i
                                      ? AccountTheme.vermilion
                                      : Colors.transparent,
                                  width: 2))),
                      child: Text(['艺人', '视频'][i],
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: _channel == i
                                  ? FontWeight.w700
                                  : FontWeight.w400))))),
        const Spacer(),
        TextButton(
            onPressed: () => _open('/engagement?view=buyers'),
            style: TextButton.styleFrom(padding: EdgeInsets.zero),
            child: const Text('找出品人 ↗', style: TextStyle(fontSize: 11))),
      ]));

  Widget _storyFeature() => LayoutBuilder(builder: (context, box) {
        final width = box.maxWidth;
        final titleSize = width * 72 / 390;
        final enlarged = MediaQuery.textScalerOf(context).scale(14) > 19;
        if (enlarged) {
          return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Image.asset('assets/images/editorial-sea.webp',
                    height: 320,
                    fit: BoxFit.cover,
                    semanticLabel: '海边影像示意，非在售作品'),
                const Text('我的故事',
                    style: TextStyle(
                        fontFamily: AccountTheme.serif,
                        fontSize: 52,
                        height: 1.1,
                        fontWeight: FontWeight.w900)),
                const SizedBox(height: 12),
                const Text('平台制作 · 专员对接'),
                TextButton(
                    onPressed: () => _open('/production/services'),
                    child: const Text('开始创作 ↗')),
              ]);
        }
        return SizedBox(
            height: width * 430 / 390,
            child: Stack(children: [
              Positioned(
                  left: width * 104 / 390,
                  right: 0,
                  top: 10,
                  bottom: 0,
                  child: Image.asset('assets/images/editorial-sea.webp',
                      fit: BoxFit.cover, semanticLabel: '海边影像示意，非在售作品')),
              const Positioned(
                  left: 16,
                  top: 20,
                  child: Text('故事制作',
                      style: TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w600))),
              Positioned(
                  right: 8,
                  top: 8,
                  child: TextButton(
                      onPressed: () => _open('/customization/new'),
                      child: const Text('写下故事 ↗',
                          style: TextStyle(
                              color: AccountTheme.accent,
                              fontWeight: FontWeight.w600)))),
              Positioned(
                  left: 16,
                  top: width * .506,
                  child: Semantics(
                      header: true,
                      label: '我的故事',
                      child: ExcludeSemantics(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            for (final line in ['我的', '故事'])
                              ColoredBox(
                                  color: AccountTheme.canvas,
                                  child: Padding(
                                      padding: const EdgeInsets.only(right: 8),
                                      child: Text(line,
                                          style: TextStyle(
                                              fontFamily: AccountTheme.serif,
                                              fontSize: titleSize,
                                              fontWeight: FontWeight.w900,
                                              height: 1.04,
                                              letterSpacing: -.7)))),
                          ])))),
              Positioned(
                  left: 16,
                  bottom: 0,
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const ColoredBox(
                            color: AccountTheme.canvas,
                            child: Padding(
                                padding: EdgeInsets.only(right: 4),
                                child: Text('平台制作 · 专员对接',
                                    style:
                                        TextStyle(fontSize: 11, height: 1.6)))),
                        ColoredBox(
                            color: AccountTheme.canvas,
                            child: TextButton(
                                onPressed: () => _open('/production/services'),
                                style: TextButton.styleFrom(
                                    padding: const EdgeInsets.only(right: 6),
                                    alignment: Alignment.centerLeft),
                                child: const Text('开始创作 ↗',
                                    style: TextStyle(
                                        fontSize: 14,
                                        decoration:
                                            TextDecoration.underline)))),
                      ])),
              const Positioned(
                  right: 8,
                  bottom: 8,
                  child: ColoredBox(
                      color: AccountTheme.canvas,
                      child: Padding(
                          padding:
                              EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                          child:
                              Text('影像示意', style: TextStyle(fontSize: 10))))),
            ]));
      });

  Widget _catalogFeature() => Padding(
      padding: const EdgeInsets.fromLTRB(16, 15, 16, 0),
      child: Column(children: [
        const Divider(height: 1, color: AccountTheme.text),
        const SizedBox(height: 17),
        InkWell(
            onTap: () => _open(_catalogRoute()),
            child: Row(children: [
              Image.asset('assets/images/editorial-rain.webp',
                  width: ((MediaQuery.sizeOf(context).width - 32) * .43)
                      .clamp(0.0, 154.0),
                  height: 84,
                  fit: BoxFit.cover,
                  semanticLabel: '雨巷影像示意，非艺人照片或商品封面'),
              const SizedBox(width: 14),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(_channel == 0 ? '艺人与数字人' : '现成视频',
                        style: TextStyle(
                            fontFamily: AccountTheme.serif,
                            fontSize: MediaQuery.sizeOf(context).width < 350
                                ? 17
                                : 20,
                            fontWeight: FontWeight.w900,
                            height: 1.3)),
                    const SizedBox(height: 6),
                    Text(_channel == 0 ? '公开资料 · 作品与形象' : '浏览作品 · 核对个人许可',
                        style: const TextStyle(fontSize: 11, height: 1.5)),
                    const SizedBox(height: 5),
                    const Text('查看名录 ↗',
                        style:
                            TextStyle(fontSize: 11, color: AccountTheme.muted)),
                  ])),
            ])),
      ]));

  Widget _continuation() => Material(
      color: AccountTheme.text,
      child: InkWell(
          onTap: () => _open('/customization'),
          child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(children: [
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      const Text('我的故事与草稿',
                          style: TextStyle(
                              color: AccountTheme.canvas, fontSize: 12)),
                      const SizedBox(height: 4),
                      const Text('继续填写 · 查看受理进度',
                          style: TextStyle(
                              color: AccountTheme.canvas,
                              fontSize: 14,
                              fontWeight: FontWeight.w600)),
                    ])),
                const SizedBox(width: 12),
                const ColoredBox(
                    color: AccountTheme.vermilion,
                    child: Padding(
                        padding:
                            EdgeInsets.symmetric(horizontal: 15, vertical: 12),
                        child: Text('查看 ↗',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 13,
                                fontWeight: FontWeight.w600)))),
              ]))));

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
        _channelBar(),
        _storyFeature(),
        _catalogFeature(),
        Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _heading('发现与合作'),
                  _entry('搜索与匹配', '按城市、艺人标签查找公开目录。', Icons.search,
                      () => _open('/search')),
                  _entry('艺人与数字人', '查看已审核且获准公开的艺人资料。', Icons.people_outline,
                      () => _open('/discover')),
                  _entry('现成视频', '查看现成作品、个人许可与已购内容。', Icons.movie_outlined,
                      () => _open('/stock/catalog')),
                  _entry('艺人榜单与月度评选', '查看已发布榜单与评选规则。', Icons.bar_chart_outlined,
                      () => _open('/engagement')),
                  _entry('找出品人与机构', '查看同城公开资料与合作信息。', Icons.business_outlined,
                      () => _open('/engagement?view=buyers')),
                  _entry('试镜预约', '查看公开可约服务与预约记录。',
                      Icons.video_camera_front_outlined, () => _select(1)),
                  _entry('通告与合作', '查看通告分类与已有合作业务。', Icons.article_outlined,
                      () => _select(2)),
                  ..._currentTools(),
                  _entry('我已购买的作品', '查看本人已购内容与个人许可。', Icons.movie_outlined,
                      () => _open('/stock/purchases')),
                ])),
      ];

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
              color: AccountTheme.text,
              padding: const EdgeInsets.fromLTRB(20, 22, 16, 22),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                const Text('我',
                    style: TextStyle(
                        fontFamily: AccountTheme.serif,
                        color: AccountTheme.canvas,
                        fontSize: 104,
                        fontWeight: FontWeight.w900,
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
          ('我的故事与草稿', '/customization'),
          ('发起制作需求', '/customization/new'),
          ('订单与付款', '/orders'),
          ('我的参与项目', '/my-projects'),
          ('参与制作项目', '/production'),
          ('我的交付作品', '/production/works'),
          ('我购买的现成视频', '/stock/purchases'),
          ('参演条款与会签', '/projects/participation'),
          ('独立发行收入约定', '/projects/income'),
          ('合同与原约定', '/contract'),
        ]
      ),
      (
        '艺人与商品',
        '我的艺人 · 数字人 · 视频 · 试镜设置',
        [
          ('数字人资料', '/my-humans'),
          ('我的现成作品上架', '/stock/listings'),
          ('试镜服务与接单', '/auditions/offers'),
          ('我的商单与接单约定', '/gigs/records?kind=GIG'),
          ('历史作品资料', '/supply'),
          ('创作工具 · 暂未开放', '/ai-create'),
        ]
      ),
      (
        '认证与成长',
        '实名 · 授权 · 成长与合作',
        [
          ('账号与机构', '/account'),
          ('成长与推荐', '/engagement?view=growth'),
          ('MCN 直接合作', '/mcn'),
          ('MCN 经营与委派', '/engagement?view=mcn'),
        ]
      ),
      (
        '资金与收益',
        '消费余额 · 晶钻 · 艺人收入',
        [
          ('钱包、晶钻与会员', '/wallet'),
          ('晶钻中心', '/wallet/points'),
          ('星探中心', '/wallet/scout'),
          ('发票与票据', '/invoices'),
          ('我的结算', '/finance'),
          ('佣金核算', '/gigs/records?kind=COMMISSION'),
          ('结算业务通知', '/finance/notifications'),
        ]
      ),
      (
        '共创与权益',
        '参与记录 · 制作金 · 活动规则',
        [
          ('多人共创', '/cocreation'),
          ('权益兑换与抽奖', '/redemption'),
          ('我的许可办理', '/licensing'),
          ('我的许可项目', '/licensing?kind=PROJECT'),
        ]
      ),
      (
        '业务通知',
        '系统通知 · 商单与履约变化',
        [
          ('系统与业务通知', '/operations/notifications'),
          ('商单通知', '/gigs/notifications'),
          ('我的预约', '/auditions/bookings'),
          ('我的通告与投稿', '/notices/records?kind=SUBMISSION'),
        ]
      ),
      (
        '账号与帮助',
        '隐私设置 · 账号管理 · 帮助反馈',
        [
          ('个人信息与隐私权益', '/privacy/requests'),
          ('设置与帮助', '/settings'),
          ('帮助与反馈', '/help'),
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
                        fontSize: 23,
                        height: 1.3,
                        fontWeight: FontWeight.w700)),
                subtitle: Text(g.$2,
                    style: const TextStyle(
                        fontSize: 11, color: AccountTheme.muted)),
                trailing: const Icon(Icons.north_east, size: 22),
                children: [
                  for (final item in g.$3)
                    _entry(item.$1, '', Icons.north_east, () => _open(item.$2))
                ])),
    ]);
  }

  Widget _section(int index, AccountSession session) {
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
          Row(children: [
            for (var i = 0; i < 4; i++)
              Expanded(
                  child: TextButton(
                      style: TextButton.styleFrom(padding: EdgeInsets.zero),
                      onPressed: () => setState(() => _messageChannel = i),
                      child: Container(
                          padding: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                              border: Border(
                                  bottom: BorderSide(
                                      color: _messageChannel == i
                                          ? AccountTheme.vermilion
                                          : AccountTheme.border,
                                      width: _messageChannel == i ? 2 : 1))),
                          child: Text(['订单会话', '投稿意向', '活动投票', '系统通知'][i],
                              style: const TextStyle(fontSize: 12))))),
          ]),
          const SizedBox(height: 12),
          if (_messageChannel == 0) ...[
            _entry('订单与项目留言', '围绕有权参与的原订单与项目查看留言。', Icons.chat_bubble_outline,
                () => _open('/chat')),
            _entry('试镜订单沟通', '接单且核实付款后，进入具体订单沟通。', Icons.event_note_outlined,
                () => _open('/auditions/bookings')),
          ],
          if (_messageChannel == 1)
            _entry('投稿与合作客服', '查看单向投稿、业务意向及客服处理。', Icons.inbox_outlined,
                () => _open('/notices/records?kind=CASE')),
          if (_messageChannel == 2)
            _entry('活动、投票与异议', '按城市和原规则查看已公示活动；未读总数仍由各原业务分别核对。',
                Icons.how_to_vote_outlined, () => _open('/engagement')),
          if (_messageChannel == 3)
            _entry('系统与业务通知', '查看当前账号和身份获准的通知。', Icons.notifications_outlined,
                () => _open('/operations/notifications')),
          const SizedBox(height: 28),
          const Text('订单沟通、投稿意向、活动投票与系统提醒，按原业务分别查看。',
              style: TextStyle(
                  fontSize: 12, height: 1.6, color: AccountTheme.muted)),
        ],
      4 => _mine(session),
      _ => _home(session),
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
      appBar: session.isLoggedIn && [1, 2].contains(_selected)
          ? null
          : AppBar(
              backgroundColor: _selected == 4 && session.isLoggedIn
                  ? AccountTheme.text
                  : AccountTheme.canvas,
              foregroundColor: _selected == 4 && session.isLoggedIn
                  ? AccountTheme.canvas
                  : AccountTheme.text,
              automaticallyImplyLeading: false,
              centerTitle: false,
              titleSpacing: 16,
              toolbarHeight: _selected > 0 && _selected < 4 ? 78 : 44,
              title: Text(_selected == 0 ? '晶晶日上' : _labels[_selected],
                  style: TextStyle(
                      color: _selected == 4 && session.isLoggedIn
                          ? AccountTheme.canvas
                          : AccountTheme.text,
                      fontFamily: AccountTheme.serif,
                      fontSize: _selected > 0 && _selected < 4
                          ? 52
                          : _selected == 0
                              ? 27
                              : 14,
                      fontWeight: _selected > 0 && _selected < 4
                          ? FontWeight.w900
                          : FontWeight.w700)),
              actions: [
                  if (_selected == 0)
                    TextButton(
                        onPressed: () => _open('/account'),
                        child: const Text('账号与身份 ⌄',
                            style: TextStyle(
                                fontSize: 12, color: AccountTheme.muted))),
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
        if (_selected == 0) _continuation(),
        DecoratedBox(
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
                                  child: ColoredBox(
                                      color: AccountTheme.vermilion))),
                        ]),
                        label: _labels[i])))),
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
        _section('帮助与反馈', '查找常见办理问题与当前可用入口。', Icons.help_outline, [
          OutlinedButton(
              onPressed: () => Navigator.pushNamed(context, '/help'),
              child: const Text('打开帮助与反馈'))
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
