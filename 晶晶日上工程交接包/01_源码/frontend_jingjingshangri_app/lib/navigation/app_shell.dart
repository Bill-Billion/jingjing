import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../licensing/license_pages.dart';

/// The five business entrances share one shell. Private tasks open as child
/// routes and keep their own permission gates and back navigation.
class AppShell extends StatefulWidget {
  const AppShell({super.key, this.initialTab = 0});
  final int initialTab;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  late final int _selected = widget.initialTab.clamp(0, 4);
  static const _labels = ['首页', '入戏', '培育', '成角', '我的'];
  static const _routes = ['/home', '/enter', '/cultivate', '/roles', '/my'];
  static const _icons = [
    Icons.home_outlined,
    Icons.menu_book_outlined,
    Icons.business_center_outlined,
    Icons.movie_outlined,
    Icons.person_outline,
  ];

  void _select(int index) {
    if (index != _selected) {
      Navigator.pushReplacementNamed(context, _routes[index]);
    }
  }

  void _open(String route) => Navigator.pushNamed(context, route);

  Widget _entry(
          String title, String description, IconData icon, VoidCallback open) =>
      Card(
          child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Icon(icon, color: AccountTheme.accent),
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
        Text('让故事与你有关',
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        const Text('选一个方向开始，管理你的创作与授权。',
            style: TextStyle(color: AccountTheme.muted, height: 1.6)),
        const SizedBox(height: 24),
        _entry('入戏 · 私人定制', '从剧本与内容方案开始，完成自己的故事。', _icons[1], () => _select(1)),
        _entry('培育 · 商业委托', '让创作连接品牌和商业需求。', _icons[2], () => _select(2)),
        _entry('成角 · 项目与发行', '参与公开项目，按约定推进制作与发行。', _icons[3], () => _select(3)),
        ..._currentTools(),
        const SizedBox(height: 8),
        const Text('艺人发现暂未开放', style: TextStyle(color: AccountTheme.muted)),
        const SizedBox(height: 8),
        const Text('当前没有可展示的公开人物目录，私有资料不会出现在这里。',
            style: TextStyle(color: AccountTheme.muted, height: 1.6)),
      ];

  List<Widget> _business(String subtitle, String description) => [
        Text(subtitle,
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        Text(description,
            style: const TextStyle(color: AccountTheme.muted, height: 1.6)),
        const SizedBox(height: 24),
        const Card(
            child: Padding(
                padding: EdgeInsets.all(20),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Icon(Icons.hourglass_empty,
                          color: AccountTheme.accent, size: 32),
                      SizedBox(height: 16),
                      Text('暂未开放',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w700)),
                      SizedBox(height: 10),
                      Text('这部分业务仍在准备。你可以先整理作者与作品资料，或查看已有合同。',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: AccountTheme.muted, height: 1.6)),
                    ]))),
        ..._currentTools(),
      ];

  List<Widget> _mine(AccountSession session) => [
        if (!session.isLoggedIn) ...[
          const Text('欢迎来到晶晶日上',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Text(session.authNotice ?? '登录后选择办事身份，管理自己的资料与合同。',
              style: const TextStyle(color: AccountTheme.muted, height: 1.6)),
          const SizedBox(height: 20),
          FilledButton(
              onPressed: () => _open('/login'), child: const Text('手机号登录')),
          const SizedBox(height: 24),
        ],
        _entry(
            '账号与机构',
            session.isLoggedIn
                ? '${session.account?['display_name'] ?? '我的账号'} · ${session.party?['display_name'] ?? '尚未选择办事身份'}'
                : '管理账号、机构、邀请和办事身份。',
            Icons.manage_accounts_outlined,
            () => _open('/account')),
        ..._currentTools(),
        _heading('我的业务'),
        _entry('数字人资料', '本人脸部、声音与用途授权 · 暂未开放', Icons.face_outlined,
            () => _open('/my-humans')),
        _entry('订单与许可', '查看预留、外部材料核验与作品使用许可', Icons.receipt_long_outlined,
            () => _open('/orders')),
        _entry('我的项目', '登记用途项目，查看许可绑定记录', Icons.movie_outlined,
            () => _open('/my-projects')),
        _entry('我的结算', '核对收付款与依据 · 暂未开放', Icons.account_balance_outlined,
            () => _open('/wallet')),
        _entry('创作工具', '创作任务与历史作品 · 暂未开放', Icons.auto_awesome_outlined,
            () => _open('/ai-create')),
        _entry('业务通知', '与订单、项目有关的通知 · 暂未开放', Icons.notifications_outlined,
            () => _open('/messages')),
        _heading('帮助与设置'),
        _entry('设置与帮助', '账号入口、用户协议和隐私政策。', Icons.settings_outlined,
            () => _open('/settings')),
      ];

  @override
  Widget build(BuildContext context) {
    final session = context.watch<AccountSession>();
    final identityName = session.party?['display_name'] as String?;
    final children = switch (_selected) {
      1 => [const LicenseCatalog(embedded: true)],
      2 => _business('让创作连接真实需求', '培育承接商业委托：发布品牌需求、确认接单约定，并按用途完成交付。'),
      3 => _business('在故事里找到你的角色', '成角承接公开项目与发行：了解招募、参与项目，并逐项确认授权与发行条件。'),
      4 => _mine(session),
      _ => _home(session),
    };
    return AccountTheme(
        child: Scaffold(
      appBar: AppBar(
          automaticallyImplyLeading: false,
          title: Text(_selected == 0 ? '晶晶日上' : _labels[_selected])),
      body: SafeArea(
          child: Center(
              child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 760),
                  child: ListView(
                      key: ValueKey('app-section-$_selected'),
                      padding: const EdgeInsets.all(16),
                      children: [
                        if (_selected != 4)
                          Padding(
                              padding: const EdgeInsets.only(bottom: 24),
                              child: InkWell(
                                  borderRadius: BorderRadius.circular(10),
                                  onTap: () => _open('/account'),
                                  child: Padding(
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 12),
                                      child: Row(children: [
                                        const Icon(Icons.person_outline,
                                            color: AccountTheme.muted,
                                            size: 20),
                                        const SizedBox(width: 8),
                                        Expanded(
                                            child: Text(
                                                session.isLoggedIn
                                                    ? (identityName ??
                                                        '请选择办事身份')
                                                    : '登录后选择办事身份',
                                                style: const TextStyle(
                                                    color:
                                                        AccountTheme.muted))),
                                        const Icon(Icons.chevron_right,
                                            size: 20,
                                            color: AccountTheme.muted),
                                      ])))),
                        ...children,
                        const SizedBox(height: 24),
                      ])))),
      bottomNavigationBar: NavigationBar(
          height: 72,
          elevation: 0,
          backgroundColor: AccountTheme.surface,
          indicatorColor: AccountTheme.accent.withValues(alpha: 0.12),
          selectedIndex: _selected,
          onDestinationSelected: _select,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: List.generate(
              5,
              (i) => NavigationDestination(
                  key: Key('app-tab-$i'),
                  icon: Icon(_icons[i]),
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
  @override
  Widget build(BuildContext context) => _ChildPage(
        title: '设置与帮助',
        children: [
          const Text('账号与资料',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          OutlinedButton(
              onPressed: () => Navigator.pushNamed(context, '/account'),
              child: const Text('管理账号与机构')),
          const SizedBox(height: 24),
          const Text('协议与隐私',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          OutlinedButton(
              onPressed: () => Navigator.pushNamed(context, '/agreement'),
              child: const Text('用户协议')),
          const SizedBox(height: 12),
          OutlinedButton(
              onPressed: () => Navigator.pushNamed(context, '/privacy'),
              child: const Text('隐私政策')),
        ],
      );
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
                          padding: const EdgeInsets.all(24),
                          children: children))))));
}
