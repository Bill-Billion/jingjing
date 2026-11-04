import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/wallet/wallet_pages.dart';

const apiOrigin = String.fromEnvironment('NATIVE_API');
const controlOrigin = String.fromEnvironment('NATIVE_CONTROL_ORIGIN');
const controlToken = String.fromEnvironment('NATIVE_CONTROL_TOKEN');
const phone = String.fromEnvironment('NATIVE_SYNTHETIC_PHONE');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<Map<String, dynamic>> control(String path, {bool post = false}) async {
    final client = HttpClient();
    try {
      final request = await client.openUrl(
          post ? 'POST' : 'GET', Uri.parse('$controlOrigin$path'));
      request.headers.set('Authorization', 'Bearer $controlToken');
      final response = await request.close();
      final body = await utf8.decoder.bind(response).join();
      expect(response.statusCode, 200);
      return Map<String, dynamic>.from(jsonDecode(body) as Map);
    } finally {
      client.close(force: true);
    }
  }

  Future<void> waitFor(WidgetTester t, bool Function() done,
      {String reason = 'timeout'}) async {
    for (var i = 0; i < 100 && !done(); i++) {
      await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 150)));
      await t.pump(const Duration(milliseconds: 100));
    }
    if (!done()) {
      debugPrint(
          'VISIBLE_LABELS ${find.byType(Text).evaluate().map((e) => (e.widget as Text).data).whereType<String>().join(' | ')}');
    }
    expect(done(), isTrue, reason: reason);
  }

  Future<void> tapVisible(WidgetTester t, Finder finder) async {
    await waitFor(t, () => finder.evaluate().isNotEmpty,
        reason: 'missing $finder');
    FocusManager.instance.primaryFocus?.unfocus();
    await t.pump(const Duration(milliseconds: 300));
    if (finder.evaluate().isEmpty &&
        find.byType(Scrollable).evaluate().isNotEmpty) {
      t
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .jumpTo(0);
      await t.pump(const Duration(milliseconds: 300));
    }
    for (var i = 0; i < 30 && finder.evaluate().isEmpty; i++) {
      if (find.byType(Scrollable).evaluate().isNotEmpty) {
        await t.drag(find.byType(Scrollable).first, const Offset(0, -250));
      }
      await t.pump(const Duration(milliseconds: 200));
    }
    await waitFor(t, () => finder.evaluate().isNotEmpty,
        reason: 'missing after keyboard closes: $finder');
    await Scrollable.ensureVisible(t.element(finder.first), alignment: .4);
    await t.pump(const Duration(milliseconds: 300));
    await t.tap(finder.first.hitTestable());
    await t.pump(const Duration(milliseconds: 300));
  }

  testWidgets('Android 模拟短信登录回原充值页，失效后明示且不自动写入', (t) async {
    SharedPreferences.setMockInitialValues({});
    final requests = <String>[];
    String? authenticated;
    final dio = Dio(BaseOptions(
        baseUrl: apiOrigin,
        validateStatus: (_) => true,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 15)));
    dio.interceptors.add(InterceptorsWrapper(onRequest: (r, h) {
      requests.add('${r.method} ${r.path}');
      if (r.path == '/api/v1/auth/sms-challenges') {
        debugPrint(
            'SYNTHETIC_CHALLENGE_PHONE ${r.data is Map && r.data['phone'] == phone ? 'second' : 'first'}');
      }
      final auth = r.headers['Authorization'] ?? r.headers['authorization'];
      if (auth is String && auth.startsWith('Bearer ')) authenticated = auth;
      h.next(r);
    }, onResponse: (r, h) {
      final body = r.data;
      final code =
          body is Map && body['error'] is Map ? body['error']['code'] : null;
      debugPrint(
          'NATIVE_HTTP ${r.requestOptions.method} ${r.requestOptions.path} ${r.statusCode} $code');
      h.next(r);
    }));
    final session = AccountSession(api: AccountApi(dio: dio));
    String? opened;
    Widget host() => MultiProvider(
            providers: [
              ChangeNotifierProvider<AccountSession>.value(value: session),
              ChangeNotifierProvider<UserProvider>(
                  create: (_) => UserProvider()),
            ],
            child: MaterialApp(
              home: const LoginPage(returnRoute: '/wallet/recharge'),
              onGenerateRoute: (settings) {
                opened = settings.name;
                return MaterialPageRoute<void>(
                    settings: settings,
                    builder: (_) => const WalletPage(mode: 'recharge'));
              },
            ));
    await t.pumpWidget(host());
    await control('/sms?enabled=false', post: true);
    await t.enterText(
        find.byType(TextField).first, '1391${phone.substring(4)}');
    await t.pump();
    await tapVisible(t, find.text('获取验证码'));
    await waitFor(t, () => find.textContaining('发送结果未确认').evaluate().isNotEmpty,
        reason: '短信不可用应说明真实结果');
    expect(session.isLoggedIn, isFalse);
    expect(find.textContaining('后可重新获取'), findsNothing);
    await control('/sms?enabled=true', post: true);
    await tapVisible(t, find.text('获取验证码'));
    await waitFor(
        t, () => find.textContaining('该次验证码已失效或不可用').evaluate().isNotEmpty,
        reason: '原挑战不可恢复时应明确说明而非声称发送成功');
    await tapVisible(t, find.text('获取验证码'));
    await waitFor(t, () => find.textContaining('操作过于频繁').evaluate().isNotEmpty,
        reason: '原手机号冷却期内不得重复发送');
    await waitFor(
        t,
        () =>
            t.widget<TextField>(find.byType(TextField).first).enabled != false,
        reason: '短信请求结束后才能编辑手机号');
    // A second synthetic number verifies login without weakening the first
    // number's real 60-second retry limit.
    await t.pumpWidget(const SizedBox.shrink());
    await t.pumpWidget(host());
    await t.enterText(find.byType(TextField).first, phone);
    await t.pump();
    expect(t.widget<TextField>(find.byType(TextField).first).controller?.text,
        phone);
    expect(t.widget<TextField>(find.byType(TextField).first).enabled,
        isNot(false));
    expect(
        t
            .widget<TextButton>(find.widgetWithText(TextButton, '获取验证码'))
            .onPressed,
        isNotNull);
    await tapVisible(t, find.text('获取验证码'));
    await waitFor(t, () => find.textContaining('后可重新获取').evaluate().isNotEmpty,
        reason: '第二个合成手机号的模拟短信挑战应成功');
    final code = (await control('/code?phone=$phone'))['code'] as String;
    await t.enterText(find.byType(TextField).last, code);
    await tapVisible(t, find.byType(Checkbox));
    await tapVisible(t, find.text('登录并继续'));
    await waitFor(t, () => session.isLoggedIn && opened == '/wallet/recharge',
        reason: '登录后应回到原业务页');
    await waitFor(t, () => find.text('余额充值').evaluate().isNotEmpty);
    await waitFor(
        t, () => find.textContaining('本人尚未开立消费者账本').evaluate().isNotEmpty,
        reason: '未开户应说明真实原因并提供开户入口');
    expect(find.text('阅读规则并开立本人账本'), findsOneWidget);
    expect(find.textContaining('当前身份不能读取或办理这份记录'), findsNothing);
    expect(session.partyId, isNotNull);
    expect(
        requests.where((x) => x.startsWith('POST /api/v1/wallet/')), isEmpty);
    expect(authenticated, isNotNull);
    debugPrint('NATIVE_LOGIN_RETURNED_WITHOUT_BUSINESS_WRITE');

    // Revoke only this synthetic session via the real isolated test API.
    final response =
        await Dio(BaseOptions(baseUrl: apiOrigin, validateStatus: (_) => true))
            .delete<dynamic>('/api/v1/auth/sessions/current',
                data: <String, dynamic>{},
                options: Options(headers: {
                  'Authorization': authenticated,
                  'Idempotency-Key': 'native-synthetic-revoke-20261104'
                }));
    expect(response.statusCode, 200);
    await tapVisible(t, find.text('重新核对本页'));
    await waitFor(t, () => !session.isLoggedIn, reason: '401 应清除私有会话');
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('登录状态已过期'), findsOneWidget);
    expect(find.text('重新登录'), findsOneWidget);
    expect(find.text('余额充值'), findsNothing);
    expect(
        requests.where((x) => x.startsWith('POST /api/v1/wallet/')), isEmpty);
    await tapVisible(t, find.text('重新登录'));
    await waitFor(t, () => find.byType(LoginPage).evaluate().isNotEmpty);
    expect(t.widget<LoginPage>(find.byType(LoginPage)).returnRoute,
        '/wallet/recharge');
    expect(t.takeException(), isNull);
    debugPrint('NATIVE_LOGIN_EXPIRY_CLEARED_PRIVATE_STATE');
    await t.pumpWidget(const SizedBox.shrink());
    session.dispose();
  });
}
