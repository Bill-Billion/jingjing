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
  bool loseLimit = false, loseAck = false, offlineLimits = false;
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
      if (offlineLimits &&
          o.method == 'GET' &&
          o.path.endsWith('/consumer-controls')) {
        h.reject(DioException(
            requestOptions: o, type: DioExceptionType.connectionError));
        return;
      }
      if (o.method == 'POST' && o.path.endsWith('/consumer-controls'))
        commandKeys.add('${o.headers['Idempotency-Key']}');
      if (o.method == 'POST' && o.path.endsWith('/usage/acknowledge'))
        ackKeys.add('${o.headers['Idempotency-Key']}');
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
      if (r.statusCode == 200 &&
          ((loseLimit &&
                  r.requestOptions.method == 'POST' &&
                  r.requestOptions.path.endsWith('/consumer-controls')) ||
              (loseAck &&
                  r.requestOptions.path.endsWith('/usage/acknowledge')))) {
        loseLimit = false;
        loseAck = false;
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

  Future<void> agree(WidgetTester t) =>
      press(t, find.text('已核对当前额度、占用与本次办理事项'));
  testWidgets('Native four pages on the same synthetic records', (t) async {
    await boot(t, 'four', 'buyer2');
    await open(t, '/wallet/limits');
    await wait(t, find.text('本人充值与现金消费限额'));
    await select(t, '本次额度类别', '本人充值');
    await fill(t, '新月度上限（元；留空申请取消本人上限）', '5.00');
    await agree(t);
    loseLimit = true;
    await press(t, find.text('修改本人的月度上限'));
    await wait(t, find.text('上次操作结果尚未确定'));
    await press(t, find.text('先核对当前记录'));
    await press(t, find.text('使用原编号继续核对'));
    expect(commandKeys.length, 2);
    expect(commandKeys[0], commandKeys[1]);
    await wait(t, find.textContaining('¥5.00'));
    await shot(t, 'native-personal-limit-original-recovery');
    await fill(t, '新月度上限（元；留空申请取消本人上限）', '10.00');
    await agree(t);
    await press(t, find.text('修改本人的月度上限'));
    await reveal(t, find.text('本人确认已到期的提额申请'));
    final confirm = find.widgetWithText(ElevatedButton, '本人确认已到期的提额申请');
    if (confirm.evaluate().isNotEmpty)
      expect(t.widget<ElevatedButton>(confirm).onPressed, isNull);
    await agree(t);
    await press(t, find.text('取消待生效的提额申请'));
    await press(t, find.text('查看本人变更记录'));
    await wait(t, find.text('额度变更记录'));
    offlineLimits = true;
    await press(t, find.text('刷新本人限额'));
    await frames(t, 8);
    expect(find.text('当前月度上限'), findsNothing);
    offlineLimits = false;
    await press(t, find.text('刷新本人限额'));
    await wait(t, find.text('当前月度上限'));
    await open(t, '/privacy?view=preferences');
    await fill(t, '休息提醒间隔（分钟）', '15');
    await press(t, find.text('保存本次偏好'));
    await frames(t, 10);
    await control('usage-due');
    await press(t, find.text('刷新本人统计'));
    await wait(t, find.text('已连续使用一段时间，建议休息。'));
    await shot(t, 'native-server-rest-due');
    loseAck = true;
    await press(t, find.text('知道了'));
    await wait(t, find.text('恢复同一次提醒确认'));
    await press(t, find.text('恢复同一次提醒确认'));
    await frames(t, 10);
    expect(find.text('已连续使用一段时间，建议休息。'), findsNothing);
    expect(ackKeys.length, 2);
    expect(ackKeys[0], ackKeys[1]);
    await control('background');
    await frames(t, 10);
    await press(t, find.text('刷新本人统计'));
    await shot(t, 'native-foreground-resumed');
    await fill(t, '休息提醒间隔（分钟）', '0');
    await press(t, find.text('保存本次偏好'));
    await wait(t, find.text('定时休息已关闭，不报告使用状态。'));
    await open(t, '/redemption?view=pools&recordId=${data['pool_id']}');
    await reveal(t, find.textContaining('公示'));
    await shot(t, 'native-same-pool-publication');
    await boot(t, 'four', 'reviewer');
    await open(t, '/wallet/limits');
    await wait(t, find.text('本人充值与现金消费限额'));
    expect(find.textContaining('¥5.00'), findsNothing);
    await shot(t, 'native-new-account-private-isolation');
    await control('complete');
    session?.dispose();
  }, timeout: const Timeout(Duration(minutes: 12)));
}
