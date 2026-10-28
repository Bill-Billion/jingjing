import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/account/business_library.dart';
import 'package:jingjingshangri_app/pages/login/login_destination.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';

void main() {
  test('登录仅返回已注册的本地页面，保留业务参数', () {
    const route =
        '/auditions/book?offerId=$personId&invitationId=$invitationId';
    expect(loginDestination(route), route);
    expect(loginDestination('/privacy/requests?view=requests'),
        '/privacy/requests?view=requests');
    expect(loginDestination('/stock/purchase?orderId=$personId'),
        '/stock/purchase?orderId=$personId');
    for (final route in [
      null,
      '',
      '/login',
      '//evil.test/auditions/book',
      'https://evil.test/orders',
      '/orders#other',
      r'/orders\evil',
      '/unknown'
    ]) {
      expect(loginDestination(route), '/my');
    }
  });

  testWidgets('完成登录后回到原预约上下文，不自动提交业务请求', (t) async {
    SharedPreferences.setMockInitialValues({});
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    String? opened;
    const route =
        '/auditions/book?offerId=$personId&invitationId=$invitationId';
    await t.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: session),
          ChangeNotifierProvider(create: (_) => UserProvider()),
        ],
        child: MaterialApp(
            home: const LoginPage(returnRoute: route),
            onGenerateRoute: (settings) {
              opened = settings.name;
              return MaterialPageRoute<void>(
                  settings: settings,
                  builder: (_) => const Scaffold(body: Text('继续预约')));
            })));
    await t.enterText(find.byType(TextField).first, '13800000000');
    await t.pump();
    await t.tap(find.text('获取验证码'));
    await frames(t);
    await t.enterText(find.byType(TextField).last, '123456');
    await reveal(t, find.byType(Checkbox));
    await t.tap(find.byType(Checkbox));
    await t.pump();
    await reveal(t, find.text('登录并继续'));
    await t.tap(find.text('登录并继续'));
    await frames(t);
    expect(opened, route);
    expect(find.text('继续预约'), findsOneWidget);
    expect(
        adapter.requests.where((r) => r.path.contains('/auditions/')), isEmpty);
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('业务目录保留分区，作品回到原购买记录且没有合并金额', (t) async {
    String? opened;
    await t.pumpWidget(MaterialApp(
        home: const BusinessLibraryPage(section: 'works'),
        onGenerateRoute: (settings) {
          opened = settings.name;
          return MaterialPageRoute<void>(
              builder: (_) => const Scaffold(body: Text('购买记录')));
        }));
    await t.tap(find.text('我购买的现成视频'));
    await frames(t);
    expect(opened, '/stock/purchases');
    t.state<NavigatorState>(find.byType(Navigator)).pop();
    await frames(t);
    expect(
        t.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, '我的作品')).selected,
        isTrue);
    await t.tap(find.widgetWithText(ChoiceChip, '我的收入'));
    await t.pump();
    expect(find.text('经营结算'), findsOneWidget);
    expect(find.textContaining('总到账'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
