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
        'NATIVE_SIX_STEP $action ${args['scenario'] ?? args['name'] ?? args['decision'] ?? ''}');
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

  Future<void> fill(WidgetTester t, String label, String value) async {
    final f = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == label);
    await reveal(t, f);
    await t.enterText(f.first, value);
    FocusManager.instance.primaryFocus?.unfocus();
    await frames(t);
  }

  Future<void> submit(WidgetTester t) async {
    await press(t, find.text('提交本次明确办理'));
    await frames(t, 15);
  }

  Future<void> choose(WidgetTester t, String v) => select(t, '本次办理事项', v);

  testWidgets(
      'Native same modern audition and actually completed closure clock',
      (t) async {
    await boot(t, 'finish', 'buyer');
    await open(t, '/auditions/booking?bookingId=${data['booking_id']}');
    await reveal(t, find.textContaining('交付审核通过'));
    await shot(t, 'native-audition-server-48h-clock');
    await boot(t, 'finish', 'outsider');
    await open(
        t, '/contract-six/closure?id=${data['closure_id']}&operations=true');
    await reveal(t, find.textContaining('实际执行后已结案'));
    await shot(t, 'native-actually-completed-closure-clock');
    await control('complete');
    session?.dispose();
  }, timeout: const Timeout(Duration(minutes: 8)));
}
