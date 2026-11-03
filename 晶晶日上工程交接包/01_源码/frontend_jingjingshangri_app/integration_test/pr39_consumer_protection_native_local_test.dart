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
  bool losePrefs = false,
      loseRiskAck = false,
      losePayment = false,
      loseDraw = false;
  String? paymentId, drawId;
  final paymentKeys = <String>[], drawKeys = <String>[];
  final commandKeys = <String>[];
  final ackKeys = <String>[];
  Future<Map<String, dynamic>> control(String action,
      [Map<String, dynamic> args = const {}]) async {
    debugPrint(
        'NATIVE_FOUR_STEP $action ${args['scenario'] ?? args['name'] ?? args['decision'] ?? ''}');
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
      if (find.byType(Scrollable).evaluate().isNotEmpty) {
        await t.drag(find.byType(Scrollable).first, const Offset(0, -400));
      }
      await frames(t, 2);
    }
    await wait(t, f);
    await Scrollable.ensureVisible(t.element(f.first), alignment: 0.4);
    await frames(t, 2);
  }

  Future<void> press(WidgetTester t, Finder f) async {
    await reveal(t, f);
    await t.tap(f.first.hitTestable());
    await frames(t);
  }

  Future<void> shot(WidgetTester t, String name) async {
    await frames(t);
    await control('capture', {'name': name});
  }

  Future<void> boot(WidgetTester t, String scenario,
      [String role = 'buyer']) async {
    session?.dispose();
    runApp(const SizedBox.shrink());
    await frames(t);
    data = await control('setup', {'role': role});
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
      if (o.method == 'PATCH' && o.path.endsWith('/privacy/preferences'))
        commandKeys.add('${o.headers['Idempotency-Key']}');
      if (o.method == 'POST' && o.path.endsWith('/consumer-risk/confirm'))
        ackKeys.add('${o.headers['Idempotency-Key']}');
      if (o.method == 'POST' && o.path == '/api/v1/trade/payments')
        paymentKeys.add('${o.headers['Idempotency-Key']}');
      if (o.method == 'POST' && o.path == '/api/v1/redemption/draws')
        drawKeys.add('${o.headers['Idempotency-Key']}');
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
      final path = r.requestOptions.path;
      if (r.statusCode == 200 &&
          r.requestOptions.method == 'POST' &&
          path == '/api/v1/trade/payments') paymentId = r.data['data']['id'];
      if (r.statusCode == 200 &&
          r.requestOptions.method == 'POST' &&
          path == '/api/v1/redemption/draws') drawId = r.data['data']['id'];
      if (r.statusCode == 200 &&
          ((losePrefs &&
                  r.requestOptions.method == 'PATCH' &&
                  path.endsWith('/privacy/preferences')) ||
              (loseRiskAck && path.endsWith('/consumer-risk/confirm')) ||
              (losePayment &&
                  r.requestOptions.method == 'POST' &&
                  path == '/api/v1/trade/payments') ||
              (loseDraw &&
                  r.requestOptions.method == 'POST' &&
                  path == '/api/v1/redemption/draws'))) {
        if (path.endsWith('/privacy/preferences')) losePrefs = false;
        if (path.endsWith('/consumer-risk/confirm')) loseRiskAck = false;
        if (path == '/api/v1/trade/payments') losePayment = false;
        if (path == '/api/v1/redemption/draws') loseDraw = false;
        h.reject(DioException(
            requestOptions: r.requestOptions,
            type: DioExceptionType.connectionError,
            message: 'Synthetic response lost after commit'));
        return;
      }
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

  Future<void> fill(WidgetTester t, String label, String value) async {
    final f = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == label);
    await reveal(t, f);
    await t.enterText(f.first, value);
    FocusManager.instance.primaryFocus?.unfocus();
    await frames(t);
  }

  testWidgets(
      'Native consumer confirmation and notification settings on actual synthetic HTTP',
      (t) async {
    await boot(t, 'consumer', 'buyer2');
    const phase = String.fromEnvironment('NATIVE_PHASE', defaultValue: 'all');
    if (phase == 'all' || phase == 'payment') {
      await open(t, '/trade/record?recordId=${data['order_id']}');
      loseRiskAck = true;
      await press(t, find.text('建立付款记录'));
      await press(t, find.text('确认办理'));
      await wait(t, find.text('本次消费提示'));
      expect(
          t
              .widget<FilledButton>(
                  find.widgetWithText(FilledButton, '已阅读，继续原操作'))
              .onPressed,
          isNull);
      await press(t, find.text('我已阅读本次提示，愿意继续原操作'));
      await press(t, find.text('已阅读，继续原操作'));
      await reveal(t, find.text('恢复原请求核对'));
      await shot(t, 'native-cp-confirmation-unknown');
      losePayment = true;
      await press(t, find.text('恢复原请求核对'));
      await press(t, find.text('确认办理'));
      await press(t, find.text('恢复原阅读确认'));
      await press(t, find.text('我已阅读本次提示，愿意继续原操作'));
      await press(t, find.text('已阅读，继续原操作'));
      await reveal(t, find.text('恢复原请求核对'));
      expect(ackKeys.length, 3);
      expect(ackKeys[0], ackKeys[1]);
      expect(paymentKeys.length, 1);
      await press(t, find.text('恢复原请求核对'));
      await press(t, find.text('确认办理'));
      await wait(t, find.text('核对这笔付款'));
      expect(paymentKeys.length, 2);
      expect(paymentKeys[0], paymentKeys[1]);
      expect(paymentId, isNotNull);
      await control(
          'sim-result', {'record_id': paymentId, 'state': 'SUCCEEDED'});
      await press(t, find.text('核对这笔付款'));
      await press(t, find.text('确认办理'));
      await wait(t, find.textContaining('模拟收款'));
      await control('record', {
        'id': 'native-cp-payment-original-recovery',
        'order_id': data['order_id'],
        'payment_id': paymentId,
        'confirmation_keys': ackKeys,
        'payment_keys': paymentKeys
      });
      await shot(t, 'native-cp-payment-success');
      await open(t, '/trade/record?recordId=${data['web_refund']}');
      await wait(t, find.textContaining('服务器已核实退款'));
      await shot(t, 'native-cp-web-same-refund');
    }
    if (phase == 'all' || phase == 'preferences') {
      await open(t, '/privacy?view=preferences');
      await wait(t, find.text('系统推送开关'));
      Future<void> toggle(String title, bool value) async {
        final f = find.widgetWithText(SwitchListTile, title);
        await reveal(t, f);
        if (t.widget<SwitchListTile>(f).value != value) {
          await press(t, find.text(title));
        }
      }

      await toggle('系统推送开关', false);
      await toggle('营销消息提醒', true);
      await toggle('夜间休息提醒', true);
      await toggle('夜间推送免打扰', true);
      await fill(t, '休息提醒间隔（分钟）', '0');
      await fill(t, '夜间开始：距北京时间零点分钟数', '0');
      await fill(t, '夜间结束：距北京时间零点分钟数', '1439');
      losePrefs = true;
      await press(t, find.text('保存本次偏好'));
      await reveal(t, find.text('上次操作结果尚未确定'));
      await press(t, find.text('先核对当前记录'));
      await press(t, find.text('使用原编号继续核对'));
      expect(commandKeys.length, 2);
      expect(commandKeys[0], commandKeys[1]);
      await press(t, find.text('关闭营销通知'));
      final prefs = await session!.read('/api/v1/privacy/preferences');
      expect(prefs['marketing'], false);
      expect(prefs['push_enabled'], false);
      expect(prefs['night_reminder_enabled'], true);
      expect(prefs['quiet_hours'],
          {'enabled': true, 'start_minute': 0, 'end_minute': 1439});
      if (find.text('本日夜间提示已读').evaluate().isNotEmpty)
        await press(t, find.text('本日夜间提示已读'));
      await open(t, '/privacy?view=preferences');
      await wait(t, find.text('系统推送开关'));
      expect(find.text('本日夜间提示已读'), findsNothing);
      await control('record', {
        'id': 'native-cp-preferences-original-recovery',
        'keys': commandKeys,
        'prefs': prefs
      });
      await shot(t, 'native-cp-notification-settings');
    }
    if (phase == 'all' || phase == 'draw') {
      await open(t, '/redemption?view=pool&id=${data['pool_id']}');
      await press(t, find.text('我已核对本次条款、实际概率、扣用晶钻及库存不足处理'));
      loseDraw = true;
      await press(t, find.text('按本次规则单抽'));
      await press(t, find.text('确认办理'));
      await wait(t, find.text('本次消费提示'));
      await wait(t, find.text('本次 300 晶钻'));
      await press(t, find.text('我已阅读本次提示，愿意继续原操作'));
      await press(t, find.text('已阅读，继续原操作'));
      await reveal(t, find.text('上次操作结果尚未确定'));
      await press(t, find.text('先核对当前记录'));
      await press(t, find.text('使用原编号继续核对'));
      expect(drawKeys.length, 2);
      expect(drawKeys[0], drawKeys[1]);
      expect(drawId, isNotNull);
      await open(t, '/redemption?view=draw&id=$drawId');
      await wait(t, find.text('这一次的抽取结果'));
      await shot(t, 'native-cp-original-draw-result');
      await control('record', {
        'id': 'native-cp-draw-original-recovery',
        'draw_id': drawId,
        'keys': drawKeys
      });
    }
    await control('complete');
    runApp(const SizedBox());
    await frames(t);
    session?.dispose();
  });
}
