import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import '../account/account_theme.dart';
import 'demo_flows.dart';
import 'demo_models.dart';
import 'demo_organization.dart';
import 'demo_store.dart';
import 'demo_widgets.dart';

class OfflineDemoApp extends StatelessWidget {
  const OfflineDemoApp({super.key, required this.store});
  final DemoStore store;
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: '晶晶日上 · 离线演示',
        debugShowCheckedModeBanner: false,
        theme: AccountTheme.data.copyWith(
            appBarTheme: AccountTheme.data.appBarTheme.copyWith(
          systemOverlayStyle: SystemUiOverlayStyle.dark,
        )),
        locale: const Locale('zh', 'CN'),
        supportedLocales: const [Locale('zh', 'CN')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: _DemoHome(store: store),
      );
}

class _DemoHome extends StatefulWidget {
  const _DemoHome({required this.store});
  final DemoStore store;
  @override
  State<_DemoHome> createState() => _DemoHomeState();
}

class _DemoHomeState extends State<_DemoHome> {
  int tab = 0;
  DemoStore get store => widget.store;
  Widget link(String title, String subtitle, VoidCallback onTap,
          {IconData icon = Icons.chevron_right}) =>
      Card(
        child: ListTile(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            title: Text(title),
            subtitle: Text(subtitle),
            trailing: Icon(icon),
            onTap: onTap),
      );

  List<Widget> square(BuildContext context) => [
        Text('每个心意\n都值得被看见', style: Theme.of(context).textTheme.headlineLarge),
        const SizedBox(height: 18),
        DemoPicture(
            store.actor == 'artist'
                ? store.artist['avatar'] as String
                : 'assets/images/scene_birthday.jpg',
            height: 220),
        const SizedBox(height: 10),
        const Text('四组核心流程 · 本机持续保存',
            style: TextStyle(color: AccountTheme.muted, fontSize: 12)),
        const SizedBox(height: 22),
        if (store.actor == 'customer') ...[
          link('定制祝福视频', '提交需求 → 确认报价 → 模拟付款 → 制作与收讫',
              () => newDemoOrder(context, store)),
          for (final row in store.list('orders'))
            link(
                '${row['recipient']}的${row['occasion']}祝福',
                demoLabel(row['status']),
                () => demoOpen(
                    context, demoOrderPage(store, row['id'] as String))),
          link('预约艺人试镜', '客户预约，切换艺人接单，再回客户确认', () => setState(() => tab = 1)),
        ],
        if (store.actor == 'artist') ...[
          link('我的艺人形象', '资料、头像、模卡与本人展示授权',
              () => demoOpen(context, demoArtistPage(store))),
          link('试镜工作', '接受客户预约，提交本地样照和视频', () => setState(() => tab = 1)),
          link(
              '参演项目',
              '${store.project['title']} · ${demoLabel(store.project['status'])}',
              () => demoOpen(context, demoProjectPage(store))),
          link('查看招募通告', '选择角色并提交本人艺人资料', () => setState(() => tab = 2)),
        ],
        if (['owner', 'member'].contains(store.actor))
          link('机构资料与成员', '资料维护、邀请接受、权限与成员移除',
              () => demoOpen(context, demoOrganizationPage(store))),
        if (store.actor == 'producer') ...[
          link('发布新通告', '填写角色要求、确认条件、提交模拟审核',
              () => editDemoNotice(context, store)),
          link('我的通告与投稿', '查看发布状态，处理艺人投稿', () => setState(() => tab = 2)),
        ],
        const SizedBox(height: 16),
        DemoPanel(title: '演示怎么走', children: const [
          Text(
              '① 普通客户：祝福视频下单到收讫\n② 艺人：形象、试镜与独立参演项目\n③ 机构负责人／成员：邀请与权限\n④ 出品方／艺人：通告发布到投稿处理'),
          SizedBox(height: 8),
          Text('右上角切换账号。“模拟平台”按钮推进审核和制作；客户与艺人仍亲自确认关键步骤。'),
        ]),
      ];

  List<Widget> auditions(BuildContext context) => [
        Text('试镜', style: Theme.of(context).textTheme.headlineLarge),
        const SizedBox(height: 16),
        if (store.actor == 'customer') ...[
          DemoPanel(title: '${store.artist['name']} · 试镜服务', children: [
            DemoPicture(store.artist['avatar'] as String),
            const SizedBox(height: 12),
            const Text('演示价 ¥200.00 / 次 · 样照与短视频'),
            const SizedBox(height: 12),
            DemoAction(
                label: '预约试镜',
                run: () async {
                  newDemoAudition(context, store);
                }),
          ]),
        ],
        if (!['customer', 'artist'].contains(store.actor))
          const Text('切换普通客户预约试镜，或切换艺人办理收到的预约。'),
        for (final row in store.list('auditions'))
          link(
              '试镜 ${row['id']}',
              '${demoLabel(row['status'])} · ${demoDate(row['date'])}',
              () => demoOpen(
                  context, demoAuditionPage(store, row['id'] as String))),
        if (store.actor == 'artist' && store.list('auditions').isEmpty)
          const Text('还没有预约。切换普通客户创建预约并模拟付款后，这里会显示同一笔记录。'),
      ];

  List<Widget> notices(BuildContext context) => [
        Text(store.actor == 'producer' ? '我的通告' : '招募通告',
            style: Theme.of(context).textTheme.headlineLarge),
        const SizedBox(height: 16),
        if (store.actor == 'producer')
          DemoAction(
              label: '发布新通告',
              run: () async {
                editDemoNotice(context, store);
              }),
        if (store.list('notices').isEmpty)
          const DemoPanel(
              title: '等待一份新的邀请',
              children: [Text('切换出品方账号，从填写通告到模拟审核发布。艺人随后可以在这里投稿。')]),
        for (final row in store.list('notices'))
          link(
              row['title'] as String,
              '${demoLabel(row['status'])} · ${row['role']} · ${row['city']}',
              () => demoOpen(
                  context, demoNoticePage(store, row['id'] as String))),
      ];

  void openMessage(BuildContext context, DemoRow message) {
    final id = message['record'] as String? ?? '';
    final page = switch (message['domain']) {
      'orders' => demoOrderPage(store, id),
      'auditions' => demoAuditionPage(store, id),
      'notices' => demoNoticePage(store, id),
      'application' => demoApplicationPage(store, id),
      'artist' => demoArtistPage(store),
      'project' => demoProjectPage(store),
      'organization' => demoOrganizationPage(store),
      _ => null,
    };
    if (page != null) demoOpen(context, page);
  }

  List<Widget> messages(BuildContext context) => [
        Text('消息', style: Theme.of(context).textTheme.headlineLarge),
        const SizedBox(height: 16),
        const Text('只展示当前演示账号收到的本机通知。'),
        const SizedBox(height: 16),
        if (store.list('messages').isEmpty) const Text('暂无消息，办理流程后会在这里收到结果。'),
        for (final message in store.list('messages'))
          link('${message['read'] == true ? '' : '● '}${message['text']}',
              demoDate(message['at']), () async {
            try {
              await store.send('read_message', {'id': message['id']});
              if (context.mounted) openMessage(context, message);
            } catch (error) {
              if (context.mounted) demoError(context, error);
            }
          }),
      ];

  List<Widget> mine(BuildContext context) => [
        Row(children: [
          Image.asset(store.account.image,
              width: 76, height: 76, fit: BoxFit.cover),
          const SizedBox(width: 16),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(store.account.name,
                    style: Theme.of(context).textTheme.headlineMedium),
                Text(store.account.role),
              ])),
        ]),
        const SizedBox(height: 22),
        link('切换演示账号', '五个虚构身份 · 共享同一份本机业务数据',
            () => switchDemoAccount(context, store),
            icon: Icons.switch_account_outlined),
        if (store.actor == 'artist') ...[
          link('我的艺人形象', demoLabel(store.artist['status']),
              () => demoOpen(context, demoArtistPage(store))),
          link('我的参演项目', demoLabel(store.project['status']),
              () => demoOpen(context, demoProjectPage(store))),
        ],
        if (['owner', 'member'].contains(store.actor))
          link('我的机构', store.organization['name'] as String,
              () => demoOpen(context, demoOrganizationPage(store))),
        if (store.actor == 'customer')
          for (final row in store.list('orders'))
            link(
                '${row['recipient']}的祝福视频',
                demoLabel(row['status']),
                () => demoOpen(
                    context, demoOrderPage(store, row['id'] as String))),
        if (store.actor == 'producer')
          link('管理通告', '草稿、发布状态和收到的投稿', () => setState(() => tab = 2)),
        DemoPanel(title: '本机模拟付款记录', children: [
          if (store.list('payments').isEmpty) const Text('暂无模拟付款'),
          for (final row in store.list('payments'))
            Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                    '${row['record']} · ${demoMoney(row['cents'] as int)}\n${demoDate(row['at'])} · 模拟')),
        ]),
        const DemoPanel(title: '离线演示说明', children: [
          Text(
              '资料和进度保存在此设备。退出应用后仍保留；无需手机号、验证码或网络。\n所有人物和机构均为虚构；付款、审核、制作与签署只产生演示记录。'),
        ]),
        DemoAction(
            label: '重置演示数据',
            simulated: true,
            run: () async {
              if (await demoConfirm(context, '重置全部演示进度？',
                  '将清除本机五个演示账号的订单、投稿、邀请、付款和消息，恢复初始资料。此操作无法撤销。')) {
                await store.reset(confirmed: true);
                if (mounted) setState(() => tab = 0);
              }
            }),
      ];

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: store,
      builder: (context, _) => Scaffold(
            appBar: AppBar(
                automaticallyImplyLeading: false,
                title: const Padding(
                    padding: EdgeInsets.only(left: 20),
                    child: Text('晶晶日上 / 离线演示')),
                actions: [
                  IconButton(
                      tooltip: '切换演示账号',
                      icon: const Icon(Icons.switch_account_outlined),
                      onPressed: () => switchDemoAccount(context, store))
                ]),
            body: SafeArea(
                child: Column(children: [
              const DemoBanner(),
              Expanded(
                  child: ListView(
                      key: ValueKey('${store.actor}/$tab'),
                      padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
                      children: [
                    Text('${store.account.name} · ${store.account.role}',
                        style: const TextStyle(
                            fontSize: 12, color: AccountTheme.muted)),
                    const SizedBox(height: 18),
                    ...[
                      square,
                      auditions,
                      notices,
                      messages,
                      mine
                    ][tab](context),
                  ])),
            ])),
            bottomNavigationBar: NavigationBar(
                selectedIndex: tab,
                onDestinationSelected: (value) => setState(() => tab = value),
                destinations: const [
                  NavigationDestination(
                      icon: Icon(Icons.grid_view_outlined), label: '广场'),
                  NavigationDestination(
                      icon: Icon(Icons.videocam_outlined), label: '试镜'),
                  NavigationDestination(
                      icon: Icon(Icons.campaign_outlined), label: '通告'),
                  NavigationDestination(
                      icon: Icon(Icons.chat_bubble_outline), label: '消息'),
                  NavigationDestination(
                      icon: Icon(Icons.person_outline), label: '我的'),
                ]),
          ));
}
