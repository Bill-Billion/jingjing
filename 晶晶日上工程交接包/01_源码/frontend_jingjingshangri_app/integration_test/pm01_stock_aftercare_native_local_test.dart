import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/app.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';

const origin = String.fromEnvironment('NATIVE_ORIGIN');
const controlToken = String.fromEnvironment('NATIVE_CONTROL');
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  Map<String, dynamic> data = {};
  AccountSession? session;
  NavigatorState? navigator;
  Future<Map<String, dynamic>> control(String action,
      [Map<String, dynamic> args = const {}]) async {
    debugPrint(
        'NATIVE_RIGHTS_STEP $action ${args['scenario'] ?? args['name'] ?? args['decision'] ?? ''}');
    final client = HttpClient();
    try {
      final r = await client.postUrl(Uri.parse('$origin/__native/control'));
      r.headers.set('Authorization', 'Bearer $controlToken');
      r.headers.contentType = ContentType.json;
      r.write(jsonEncode({'action': action, ...args}));
      final response = await r.close();
      final j = jsonDecode(await utf8.decoder.bind(response).join())
          as Map<String, dynamic>;
      expect(response.statusCode, 200, reason: '$action: $j');
      return j;
    } finally {
      client.close(force: true);
    }
  }

  Future<void> frames(WidgetTester t, [int n = 5]) async {
    for (var i = 0; i < n; i++) {
      await t.pump(const Duration(milliseconds: 200));
    }
  }

  Future<void> wait(WidgetTester t, Finder f) async {
    for (var i = 0; i < 180 && f.evaluate().isEmpty; i++) {
      await frames(t, 1);
    }
    if (f.evaluate().isEmpty) {
      debugPrint('MISSING $f');
      debugPrint(find
          .byType(Text)
          .evaluate()
          .map((e) => (e.widget as Text).data)
          .whereType<String>()
          .join(' | '));
    }
    expect(f, findsWidgets);
  }

  Future<void> reveal(WidgetTester t, Finder f) async {
    if (f.evaluate().isEmpty && find.byType(Scrollable).evaluate().isNotEmpty) {
      t
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .jumpTo(0);
      await frames(t, 2);
    }
    for (var i = 0; i < 40 && f.evaluate().isEmpty; i++) {
      if (find.byType(Scrollable).evaluate().isNotEmpty)
        await t.drag(find.byType(Scrollable).first, const Offset(0, -400));
      await frames(t, 2);
    }
    await wait(t, f);
    await t.ensureVisible(f.first);
    await frames(t, 2);
  }

  Future<void> press(WidgetTester t, Finder f) async {
    await reveal(t, f);
    await t.tap(f.first);
    await frames(t);
  }

  Future<void> shot(WidgetTester t, String name) async {
    await frames(t);
    await control('capture', {'name': name});
  }

  Future<void> boot(WidgetTester t, String scenario,
      [String role = 'buyer']) async {
    if (session != null) await session!.logout();
    runApp(const SizedBox.shrink());
    await frames(t);
    data = await control('setup',
        {'scenario': scenario, 'role': role, 'fresh': role == 'artist'});
    final a = data['account'];
    final legacy = UserProvider();
    await legacy.logout();
    final dio = Dio(BaseOptions(
        baseUrl: origin,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        followRedirects: false,
        validateStatus: (_) => true));
    final api = AccountApi(dio: dio);
    final account =
        await api.request('GET', '/api/v1/me', token: a['bearer_token']);
    expect(account['id'], a['account_id']);
    var first = true;
    dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
      debugPrint('NATIVE_HTTP ${o.method} ${o.uri.path}');
      if (first &&
          o.method == 'POST' &&
          o.path.endsWith('/api/v1/auth/sessions')) {
        first = false;
        h.resolve(Response<dynamic>(requestOptions: o, statusCode: 200, data: {
          'data': {
            'access_token': a['bearer_token'],
            'token_type': 'Bearer',
            'account': account
          }
        }));
      } else {
        h.next(o);
      }
    }, onResponse: (r, h) {
      debugPrint(
          'NATIVE_HTTP_RESULT ${r.statusCode} ${r.requestOptions.uri.path}');
      h.next(r);
    }));
    session = AccountSession(api: api);
    await session!
        .login('local-synthetic-$role', 'local-bootstrap', 'local-only');
    await session!.loadParties();
    session!.select(
        session!.parties.singleWhere((r) => r['party']['id'] == a['party_id']));
    runApp(MultiProvider(
        providers: [
          ChangeNotifierProvider<UserProvider>.value(value: legacy),
          ChangeNotifierProvider<AccountSession>.value(value: session!)
        ],
        child: const Directionality(
            textDirection: TextDirection.ltr,
            child: Banner(
                message: '本机模拟测试',
                location: BannerLocation.topEnd,
                child: JingjingShangriApp()))));
    await wait(t, find.byType(NavigationBar));
    navigator = Navigator.of(t.element(find.byType(NavigationBar)));
    await frames(t, 8);
  }

  Future<void> open(WidgetTester t, String route) async {
    debugPrint('NATIVE_ROUTE $route');
    final nav = navigator!;
    nav.popUntil((r) => r.isFirst);
    await frames(t);
    nav.pushNamed(route);
    await frames(t, 12);
    for (var i = 0;
        i < 150 && find.byType(LinearProgressIndicator).evaluate().isNotEmpty;
        i++) {
      await frames(t, 1);
    }
  }

  Future<void> select(WidgetTester t, String label, String option) async {
    final f = find.byWidgetPredicate((w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == label);
    await press(t, f);
    await press(t, find.text(option).last);
  }

  testWidgets(
      'Native stock checkout and independently reviewed KEEP then REVOKE on the same order',
      (t) async {
    await boot(t, 'stock');
    await open(t, '/stock/video?listingId=' + data['listing_id']);
    await press(t, find.text('我已阅读本版价格、许可用途、地域、期间与售后约定'));
    await press(t, find.text('确认本版购买并查看原订单'));
    await press(t, find.text('确认办理'));
    await press(t, find.text('建立付款记录'));
    await press(t, find.text('确认办理'));
    final paid = await control('payment-ready');
    final id = paid['order_id'];
    await press(t, find.text('核对这笔付款'));
    await press(t, find.text('确认办理'));
    await control('verify-paid');
    await open(t, '/stock/purchase?orderId=' + id);
    await press(t, find.text('受控播放已购作品'));
    await wait(t, find.text('本次私有预览已打开，请核对完整内容。'));
    await shot(t, 'native-paid');
    await control('expire');
    await press(t, find.text('受控播放已购作品'));
    await frames(t, 10);
    expect(session!.isLoggedIn, isFalse);
    expect(find.text('本次私有预览已打开，请核对完整内容。'), findsNothing);
    await control('renew');
    await boot(t, 'stock');
    await open(t, '/stock/purchase?orderId=' + id);
    await control('picker', {'mode': 'cancel'});
    await press(t, find.text('下载本次私有文件'));
    await wait(t, find.text('已取消保存，本次未确认收件。'));
    await control('cancelled');
    await control('picker', {'mode': 'save'});
    await press(t, find.text('下载本次私有文件'));
    await wait(t, find.text('本次私有文件已保存。'));
    await control('saved');

    for (final action in ['KEEP', 'REVOKE']) {
      await select(t, '问题类型', '申请售后退款');
      final field = find.byWidgetPredicate(
          (w) => w is TextField && w.decoration?.labelText == '问题说明');
      await reveal(t, field);
      await t.enterText(field, '本机模拟逐案售后 ' + action);
      FocusManager.instance.primaryFocus?.unfocus();
      await frames(t);
      await press(t, find.text('提交本单售后问题'));
      await press(t, find.text('确认办理'));
      await wait(t, find.textContaining('本单售后处理中'));
      await control('refund', {'license_action': action});
      await open(t, '/stock/purchase?orderId=' + id);
      if (action == 'KEEP') {
        await press(t, find.text('受控播放已购作品'));
        await wait(t, find.text('本次私有预览已打开，请核对完整内容。'));
      } else {
        await reveal(t, find.textContaining('当前不可读取正式文件'));
        expect(find.text('受控播放已购作品'), findsNothing);
      }
      await shot(t, 'native-' + action);
    }
    await control('complete');
    await session!.logout();
    await frames(t);
    expect(find.text('本次私有预览已打开，请核对完整内容。'), findsNothing);
  }, timeout: const Timeout(Duration(minutes: 10)));
}
