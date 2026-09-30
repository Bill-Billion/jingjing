import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/app.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import '../account/fake_account_api.dart';

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

void main() {
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
    expect(find.text('暂未开放'), findsOneWidget);
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
      '/mcn': 2,
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
