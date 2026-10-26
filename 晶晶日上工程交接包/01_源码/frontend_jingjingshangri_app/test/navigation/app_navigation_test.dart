import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/app.dart';
import 'package:jingjingshangri_app/navigation/app_shell.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import '../account/fake_account_api.dart';
import '../contracts/contract_fixtures.dart';

Future<void> frames(WidgetTester tester) async {
  for (var i = 0; i < 25; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> openApp(WidgetTester tester, AccountSession session,
    {String route = '/', bool oldLocalToken = false}) async {
  SharedPreferences.setMockInitialValues({
    'onboarding_seen_v12_3': true,
    if (oldLocalToken) 'auth_token': 'historical-token',
    if (oldLocalToken) 'auth_user': '{"nickname":"旧版姓名"}',
  });
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  tester.binding.platformDispatcher.defaultRouteNameTestValue = route;
  addTearDown(tester.binding.platformDispatcher.clearDefaultRouteNameTestValue);
  final legacy = UserProvider();
  await legacy.restore();
  await tester.pumpWidget(MultiProvider(providers: [
    ChangeNotifierProvider.value(value: session),
    ChangeNotifierProvider.value(value: legacy),
  ], child: const JingjingShangriApp()));
  await frames(tester);
}

void expectFiveTabs() {
  for (final label in ['广场', '试镜', '通告', '消息', '我的']) {
    expect(
        find.descendant(
            of: find.byType(NavigationBar), matching: find.text(label)),
        findsOneWidget);
  }
}

ScrollableState sectionScroll(WidgetTester tester) =>
    tester.state<ScrollableState>(find.descendant(
        of: find.byType(ListView), matching: find.byType(Scrollable)));

void main() {
  testWidgets('快速切换只更新栏目，主壳、底栏和路由不重建也不播放页面动画', (tester) async {
    final adapter = FakeAccountAdapter();
    await openApp(tester, AccountSession(api: adapter.createApi()));
    final shell = tester.state(find.byType(AppShell));
    final bar = tester.element(find.byType(NavigationBar));
    final route = ModalRoute.of(bar)!;
    for (final index in [4, 1, 3, 0, 2, 4]) {
      await tester.tap(find.byKey(Key('app-tab-$index')));
      await tester.pump(); // No waiting for a route animation.
      expect(tester.state(find.byType(AppShell)), same(shell));
      expect(tester.element(find.byType(NavigationBar)), same(bar));
      expect(ModalRoute.of(bar), same(route));
      expect(
          tester
              .widget<NavigationBar>(find.byType(NavigationBar))
              .selectedIndex,
          index);
      expect(route.animation!.isCompleted, isTrue);
      expectFiveTabs();
    }
    expect(route.settings.name, '/my');
    expect(route.isFirst, isTrue); // Tab switches create no back history.
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('栏目分别保留滚动位置，重复点击不归零，详情返回仍在原栏目', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await openApp(tester, session);
    await tester.drag(find.byType(ListView), const Offset(0, -420));
    await frames(tester);
    final homePosition = sectionScroll(tester).position.pixels;
    expect(homePosition, greaterThan(0));
    await tester.tap(find.byKey(const Key('app-tab-4')));
    await frames(tester);
    await tester.tap(find.text('业务与作品'));
    await frames(tester);
    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await frames(tester);
    final minePosition = sectionScroll(tester).position.pixels;
    expect(minePosition, greaterThan(0));
    await tester.tap(find.byKey(const Key('app-tab-0')));
    await frames(tester);
    expect(sectionScroll(tester).position.pixels, closeTo(homePosition, 0.1));
    await tester.tap(find.byKey(const Key('app-tab-4')));
    await frames(tester);
    expect(sectionScroll(tester).position.pixels, closeTo(minePosition, 0.1));
    await tester.tap(find.byKey(const Key('app-tab-4')));
    await frames(tester);
    expect(sectionScroll(tester).position.pixels, closeTo(minePosition, 0.1));
    await tester.tap(find.byTooltip('设置与帮助'));
    await frames(tester);
    expect(find.byType(NavigationBar), findsNothing);
    await tester.tap(find.byType(BackButton));
    await frames(tester);
    expectFiveTabs();
    expect(sectionScroll(tester).position.pixels, closeTo(minePosition, 0.1));
    expect(
        ModalRoute.of(tester.element(find.byType(NavigationBar)))!
            .settings
            .name,
        '/my');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('通告有独立六类入口，打开已有项目后返回保留栏目且不重复读取', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) => const [
        '/api/v1/projects/catalogue',
        '/api/v1/notices/catalog'
      ].contains(r.path)
          ? envelope({'items': [], 'next_cursor': null})
          : adapter.defaultReply(r),
    );
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await openApp(tester, session, route: '/notices');
    expectFiveTabs();
    for (final type in ['剧与角色', '商演', '商单', '活动', '招募', '平台官方']) {
      expect(find.text(type), findsOneWidget);
    }
    int reads() => adapter.requests
        .where((r) => r.path == '/api/v1/projects/catalogue')
        .length;
    expect(reads(), 0);
    final projects = find.text('公开项目与角色');
    await tester.scrollUntilVisible(projects, 250,
        scrollable: find.byType(Scrollable).first);
    await Scrollable.ensureVisible(tester.element(projects), alignment: .5);
    await tester.pump();
    expect(projects.hitTestable(), findsOneWidget);
    await tester.tap(projects);
    await frames(tester);
    expect(find.byType(NavigationBar), findsNothing);
    expect(reads(), 1);
    await tester.tap(find.byType(BackButton));
    await frames(tester);
    expectFiveTabs();
    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
      2,
    );
    for (final index in [4, 0, 2, 2]) {
      await tester.tap(find.byKey(Key('app-tab-$index')));
      await frames(tester);
    }
    expect(reads(), 1);
    expect(
      ModalRoute.of(tester.element(find.byType(NavigationBar)))!.settings.name,
      '/notices',
    );
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('隐藏我的身份在切换和退出时清空，消息主页不自动读取私密通知', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await openApp(tester, session, route: '/my');
    expect(find.text('测试机构'), findsOneWidget);
    await tester.tap(find.byKey(const Key('app-tab-0')));
    await frames(tester);
    session.select(identity(personId));
    await frames(tester);
    expect(find.text('测试机构', skipOffstage: false), findsNothing);
    await tester.tap(find.byKey(const Key('app-tab-4')));
    await frames(tester);
    expect(find.text('我的个人身份'), findsOneWidget);
    await tester.runAsync(session.logout);
    await frames(tester);
    expect(find.text('我的个人身份', skipOffstage: false), findsNothing);
    expect(find.text('手机号登录'), findsOneWidget);
    final before = adapter.requests.length;
    await tester.tap(find.byKey(const Key('app-tab-3')));
    await frames(tester);
    expect(adapter.requests.length, before);
    await tester.tap(find.text('系统通知'));
    await frames(tester);
    expect(adapter.requests.length, before);
    expect(find.text('系统与业务通知'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('减少动态效果时关闭底栏动画，正文仍立即切换', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await openApp(
        tester, AccountSession(api: FakeAccountAdapter().createApi()));
    await tester.tap(find.byKey(const Key('app-tab-4')));
    await tester.pump();
    final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(bar.animationDuration, Duration.zero);
    expect(bar.selectedIndex, 4);
    expect(find.text('手机号登录'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('匿名冷启动和五入口切换始终使用暖白新壳', (tester) async {
    final adapter = FakeAccountAdapter();
    await openApp(tester, AccountSession(api: adapter.createApi()));
    expectFiveTabs();
    for (var i = 0; i < 5; i++) {
      await tester.tap(find.byKey(Key('app-tab-$i')));
      await frames(tester);
      expectFiveTabs();
      expect(
          tester
              .widget<NavigationBar>(find.byType(NavigationBar))
              .selectedIndex,
          i);
      expect(
          ModalRoute.of(tester.element(find.byType(NavigationBar)))
              ?.settings
              .name,
          ['/square', '/audition', '/notices', '/messages', '/my'][i]);
      expect(tester.takeException(), isNull);
    }
    await tester.tap(find.byTooltip('设置与帮助'));
    await frames(tester);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('用户协议'), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await frames(tester);
    await tester.tap(find.byKey(const Key('app-tab-0')));
    await frames(tester);
    await tester.tap(find.text('全部'));
    await frames(tester);
    await tester.scrollUntilVisible(find.text('系统与业务通知'), 300,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('系统与业务通知'));
    await frames(tester);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('先确认办事身份'), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await frames(tester);
    await tester.tap(find.byType(BackButton));
    await frames(tester);
    expectFiveTabs();
    expect(tester.takeException(), isNull);
    expect(adapter.requests, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('320窄屏和放大文字的五入口保持可用，无布局异常', (tester) async {
    final adapter = FakeAccountAdapter();
    await openApp(tester, AccountSession(api: adapter.createApi()));
    tester.view.physicalSize = const Size(320, 693);
    tester.platformDispatcher.textScaleFactorTestValue = 1.6;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    for (var i = 0; i < 5; i++) {
      await tester.tap(find.byKey(Key('app-tab-$i')));
      await frames(tester);
      expectFiveTabs();
      expect(tester.takeException(), isNull, reason: 'tab $i');
    }
    expect(adapter.requests, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('旧本地登录记录不能恢复旧账号、旧首页或旧请求', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await openApp(tester, session, oldLocalToken: true);
    expectFiveTabs();
    await tester.tap(find.byKey(const Key('app-tab-4')));
    await frames(tester);
    expect(find.text('手机号登录'), findsOneWidget);
    expect(find.text('旧版姓名'), findsNothing);
    expect(session.isLoggedIn, isFalse);
    expect(adapter.requests, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('旧命名入口转到五个主栏目或已有业务身份门', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await tester
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    await openApp(tester, session);
    const tabAliases = <String, int>{
      '/home': 0,
      '/audition': 1,
      '/cultivate': 2,
      '/notices': 2,
      '/messages': 3,
      '/profile': 4,
    };
    final nav = tester.state<NavigatorState>(find.byType(Navigator).last);
    for (final entry in tabAliases.entries) {
      nav.pushNamed(entry.key);
      await frames(tester);
      expectFiveTabs();
      expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
        entry.value,
        reason: entry.key,
      );
      expect(tester.takeException(), isNull, reason: entry.key);
      nav.pop();
      await frames(tester);
    }
    for (final path in [
      '/theater',
      '/launch',
      '/custom-request',
      '/video-lib',
    ]) {
      nav.pushNamed(path);
      await frames(tester);
      expect(find.byType(NavigationBar), findsNothing, reason: path);
      expect(find.text('页面不存在'), findsNothing, reason: path);
      expect(tester.takeException(), isNull, reason: path);
      nav.pop();
      await frames(tester);
    }
    nav.pushNamed('/mcn');
    await frames(tester);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('先确认办事身份'), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await frames(tester);
    expectFiveTabs();
    for (final route in ['/wallet', '/my-humans', '/my-works', '/chat']) {
      nav.pushNamed(route);
      await frames(tester);
      expect(find.text(route == '/my-humans' ? '从你的本人档案开始' : '先确认办事身份'),
          findsOneWidget,
          reason: route);
      expect(find.text('页面不存在'), findsNothing, reason: route);
      expect(find.byType(NavigationBar), findsNothing, reason: route);
      expect(tester.takeException(), isNull, reason: route);
      nav.pop();
      await frames(tester);
    }
    expect(
        adapter.requests
            .where((r) => r.path.startsWith('/api/'))
            .map((r) => r.path),
        [
          '/api/v1/auth/sessions',
          '/api/v1/privacy/preferences',
          '/api/v1/artists/catalog',
          '/api/v1/stock/catalog',
          '/api/v1/notices/catalog',
          '/api/v1/artists/catalog',
          '/api/v1/stock/catalog',
          '/api/v1/notices/catalog',
          '/api/v1/auditions/catalog',
          '/api/v1/notices/catalog',
          '/api/v1/notices/catalog',
          '/api/v1/stock/catalog'
        ]);
    // A catalog is public; rest preferences are account-scoped. No gated
    // destination may read private party data before an identity is selected.
    expect(
        adapter.requests
            .where((r) =>
                r.path.startsWith('/api/v1/') &&
                r.path != '/api/v1/auth/sessions')
            .every((r) => r.headers['X-Acting-Party'] == null),
        isTrue);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('账号、合同和作者作品是新版子页，返回后五入口仍齐全', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await openApp(tester, session);
    final nav = tester.state<NavigatorState>(find.byType(Navigator).last);
    for (final route in [
      '/account',
      '/contract',
      '/supply',
      '/orders',
      '/my-projects',
      '/licensing/catalog',
      '/licensing/record?recordId=bad',
      '/licensing/reading?recordId=bad',
      '/licensing/project/new',
      '/licensing/bind?grantId=bad',
      '/licensing/evidence?reservationId=bad'
    ]) {
      nav.pushNamed(route);
      await frames(tester);
      expect(find.byType(NavigationBar), findsNothing, reason: route);
      expect(find.byType(Scaffold), findsWidgets, reason: route);
      expect(tester.takeException(), isNull, reason: route);
      nav.pop();
      await frames(tester);
      expectFiveTabs();
    }
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('协议保留原文且清楚标记历史，登录页没有旧版入口', (tester) async {
    final adapter = FakeAccountAdapter();
    await openApp(tester, AccountSession(api: adapter.createApi()));
    final nav = tester.state<NavigatorState>(find.byType(Navigator).last);
    nav.pushNamed('/login');
    await frames(tester);
    expect(find.text('浏览旧版展示'), findsNothing);
    nav.pushNamed('/agreement');
    await frames(tester);
    expect(find.text('历史文本 · 待更新'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('已登录未知链接明确报错并能回新版首页', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await tester
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    await openApp(tester, session, route: '/does-not-exist');
    expect(find.text('页面不存在'), findsOneWidget);
    expect(find.textContaining('正在建设中'), findsNothing);
    await tester.tap(find.text('返回首页'));
    await frames(tester);
    expectFiveTabs();
    expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
        0);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
