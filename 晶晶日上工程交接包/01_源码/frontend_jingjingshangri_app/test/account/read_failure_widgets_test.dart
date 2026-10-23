import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/account/read_failure_widgets.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/trade/trade_widgets.dart';
import '../stock/v5_test_host.dart' show frames, reveal;
import 'fake_account_api.dart';

void main() {
  testWidgets('C08在320宽大字体下可滚动，原重核动作可用且不推测记录存在', (t) async {
    t.view.physicalSize = const Size(320, 700);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    var retries = 0;
    await t.pumpWidget(MaterialApp(
        home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: ReadAccessDeniedPage(
                reason: '当前暂时无法读取这页，私有内容已清空。请核对当前账号、参与身份和有效权限。',
                onRetry: () => retries++))));
    await t.pump();
    await t.tap(find.byKey(const ValueKey('read-denied-retry')));
    expect(retries, 1);
    await t.drag(find.byType(ListView), const Offset(0, -600));
    await t.pumpAndSettle();
    expect(
        t.state<ScrollableState>(find.byType(Scrollable).first).position.pixels,
        greaterThan(0));
    expect(find.textContaining('已下架'), findsNothing);
    expect(find.textContaining('不存在'), findsNothing);
    expect(t.takeException(), isNull);
  });

  for (final route in [
    '/notices/catalog?city=Shanghai',
    '/notices/records?kind=NOTICE',
    '/stock/catalog?city=Shanghai',
    '/artists/catalog?city=Shanghai&tag=actor',
  ]) {
    testWidgets('C09重新登录真实恢复既有只读目录与查询，不重放业务：$route', (t) async {
      SharedPreferences.setMockInitialValues({});
      final a = FakeAccountAdapter(), s = AccountSession(api: a.createApi());
      String? destination;
      t.view.physicalSize = const Size(390, 844);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(MultiProvider(
          providers: [
            ChangeNotifierProvider.value(value: s),
            ChangeNotifierProvider(create: (_) => UserProvider()),
          ],
          child: MaterialApp(
              home: LoginPage(returnRoute: route),
              onGenerateRoute: (settings) {
                destination = settings.name;
                return MaterialPageRoute(
                    settings: settings,
                    builder: (_) => const Scaffold(body: Text('已恢复只读目录')));
              })));
      await frames(t);
      await t.enterText(find.byType(TextField).first, '13800000000');
      await frames(t);
      await t.tap(find.text('获取验证码'));
      await frames(t);
      await t.enterText(find.byType(TextField).last, '123456');
      await reveal(t, find.byType(Checkbox));
      await t.tap(find.byType(Checkbox));
      await frames(t);
      await t.tap(find.text('登录并继续'));
      await frames(t);
      expect(destination, route);
      expect(find.text('已恢复只读目录'), findsOneWidget);
      expect(
          a.requests.where(
              (r) => r.method == 'POST' && !r.path.startsWith('/api/v1/auth/')),
          isEmpty);
      expect(t.takeException(), isNull);
    });
  }

  for (final expired in [false, true]) {
    testWidgets('C07/C09在320宽大字体下长内容可滚动，过期=$expired', (t) async {
      t.view.physicalSize = const Size(320, 700);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(
          home: MediaQuery(
              data: const MediaQueryData(textScaler: TextScaler.linear(2)),
              child: Builder(
                  builder: (context) => expired
                      ? const ReadSessionExpiredPage(
                          returnRoute: '/notices/records?kind=NOTICE',
                          label: '我的通告与投稿')
                      : tradeScaffold(context, '读取本页',
                          [const ReadLoadingContent(label: '通告现场')])))));
      await t.pump(const Duration(milliseconds: 50));
      await t.drag(find.byType(ListView), const Offset(0, -600));
      await t.pump(const Duration(milliseconds: 50));
      expect(
          t
              .state<ScrollableState>(find.byType(Scrollable).first)
              .position
              .pixels,
          greaterThan(0));
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('C06在320宽大字体下可滚动完整原因，返回与重读动作仍可用', (t) async {
    t.view.physicalSize = const Size(320, 700);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    var backs = 0, retries = 0;
    final reason = '当前账号尚不能读取这份记录，请核对办事身份和实际授权。' * 6;
    await t.pumpWidget(MaterialApp(
        home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Builder(builder: (context) {
              return tradeScaffold(
                  context, '读取本页', [ReadFailureContent(reason: reason)],
                  footer: ReadFailureActions(
                      onBack: () => backs++, onRetry: () => retries++));
            }))));
    await t.pumpAndSettle();
    final title = t.widget<Text>(find.text('这页还没\n加载出来'));
    expect(title.style!.fontSize, 36);
    expect(title.style!.fontWeight, FontWeight.w900);
    final body = t.widget<Text>(find.text(reason));
    expect(body.maxLines, isNull);
    expect(body.overflow, isNot(TextOverflow.ellipsis));
    await t.tap(find.byKey(const ValueKey('read-failure-back')));
    await t.tap(find.byKey(const ValueKey('read-failure-retry')));
    expect(backs, 1);
    expect(retries, 1);
    await t.drag(find.byType(ListView), const Offset(0, -600));
    await t.pumpAndSettle();
    expect(
        t.state<ScrollableState>(find.byType(Scrollable).first).position.pixels,
        greaterThan(0));
    expect(find.textContaining('网络断开'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
