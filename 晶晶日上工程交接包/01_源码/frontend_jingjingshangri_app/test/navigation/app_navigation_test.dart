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
import '../licensing/license_fixtures.dart';

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
  for (final label in ['首页', '入戏', '培育', '成角', '我的']) {
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
    await openApp(tester, AccountSession(api: adapter.createApi()));
    await tester.drag(find.byType(ListView), const Offset(0, -420));
    await frames(tester);
    final homePosition = sectionScroll(tester).position.pixels;
    expect(homePosition, greaterThan(0));
    await tester.tap(find.byKey(const Key('app-tab-4')));
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

  testWidgets('入戏首次进入才读取，切换及详情返回保留已加载目录与位置', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/records')
            ? envelope({
                'items': [licenseData('PRODUCT')],
                'next_cursor': null
              })
            : r.path.endsWith(productId)
                ? envelope(licenseData('PRODUCT'))
                : adapter.defaultReply(r));
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await openApp(tester, session);
    int catalogReads() =>
        adapter.requests.where((r) => r.path.endsWith('/records')).length;
    expect(catalogReads(), 0);
    await tester.tap(find.byKey(const Key('app-tab-1')));
    await frames(tester);
    expect(catalogReads(), 1);
    expect(find.text('回到那年夏天'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -180));
    await frames(tester);
    final position = sectionScroll(tester).position.pixels;
    expect(position, greaterThan(0));
    for (final index in [4, 0, 2, 1, 1]) {
      await tester.tap(find.byKey(Key('app-tab-$index')));
      await frames(tester);
    }
    expect(catalogReads(), 1);
    expect(sectionScroll(tester).position.pixels, closeTo(position, 0.1));
    await tester.ensureVisible(find.text('查看剧本'));
    await frames(tester);
    final beforeDetail = sectionScroll(tester).position.pixels;
    await tester.tap(find.text('查看剧本'));
    await frames(tester);
    expect(find.byType(NavigationBar), findsNothing);
    await tester.tap(find.byType(BackButton));
    await frames(tester);
    expect(catalogReads(), 1);
    expect(sectionScroll(tester).position.pixels, closeTo(beforeDetail, 0.1));
    expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
        1);
    expect(
        ModalRoute.of(tester.element(find.byType(NavigationBar)))!
            .settings
            .name,
        '/enter');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('隐藏栏目的私有状态在更换身份和退出时清空，再进入才重新读取', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/records')) {
        final product = licenseData('PRODUCT');
        (product['data'] as Map)['title'] =
            r.headers['X-Acting-Party'] == personId ? '个人目录' : '机构目录';
        return envelope({
          'items': [product],
          'next_cursor': null
        });
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await openApp(tester, session, route: '/enter');
    expect(find.text('机构目录'), findsOneWidget);
    await tester.tap(find.byKey(const Key('app-tab-0')));
    await frames(tester);
    final reads =
        adapter.requests.where((r) => r.path.endsWith('/records')).length;
    session.select(identity(personId));
    await frames(tester);
    expect(find.text('机构目录', skipOffstage: false), findsNothing);
    expect(adapter.requests.where((r) => r.path.endsWith('/records')),
        hasLength(reads));
    await tester.tap(find.byKey(const Key('app-tab-1')));
    await frames(tester);
    expect(adapter.requests.where((r) => r.path.endsWith('/records')),
        hasLength(reads + 1));
    expect(find.text('个人目录'), findsOneWidget);
    await tester.tap(find.byKey(const Key('app-tab-4')));
    await frames(tester);
    await tester.runAsync(session.logout);
    await frames(tester);
    expect(find.text('个人目录', skipOffstage: false), findsNothing);
    expect(find.text('手机号登录'), findsOneWidget);
    await tester.tap(find.byKey(const Key('app-tab-1')));
    await frames(tester);
    expect(find.textContaining('登录后选择办事身份'), findsOneWidget);
    expect(adapter.requests.where((r) => r.path.endsWith('/records')),
        hasLength(reads + 1));
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
          ['/home', '/enter', '/cultivate', '/roles', '/my'][i]);
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
    await tester.tap(find.byTooltip('通知'));
    await frames(tester);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('先确认办事身份'), findsOneWidget);
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

  testWidgets('旧命名入口转到规划中的新五入口或明确未开放页', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await tester
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    await openApp(tester, session);
    const tabAliases = <String, int>{
      '/theater': 1,
      '/launch': 1,
      '/role-market': 3,
      '/projects': 3,
      '/profile': 4,
    };
    final nav = tester.state<NavigatorState>(find.byType(Navigator).last);
    for (final entry in tabAliases.entries) {
      nav.pushNamed(entry.key);
      await frames(tester);
      expectFiveTabs();
      expect(
          tester
              .widget<NavigationBar>(find.byType(NavigationBar))
              .selectedIndex,
          entry.value,
          reason: entry.key);
      expect(tester.takeException(), isNull, reason: entry.key);
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
      expect(find.text('暂未开放'), findsOneWidget, reason: route);
      expect(find.text('页面不存在'), findsNothing, reason: route);
      expect(find.byType(NavigationBar), findsNothing, reason: route);
      expect(tester.takeException(), isNull, reason: route);
      nav.pop();
      await frames(tester);
    }
    expect(adapter.requests.where((r) => r.path.startsWith('/api/')),
        hasLength(1)); // Only the explicit new-account login was sent.
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
