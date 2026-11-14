import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/account/consumer_confirmation.dart';
import 'package:jingjingshangri_app/engagement/engagement_pages.dart';

const origin = String.fromEnvironment('NATIVE_ORIGIN');
const controlToken = String.fromEnvironment('NATIVE_CONTROL');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  Future<Map<String, dynamic>> control(String action) async {
    final client = HttpClient();
    try {
      final request =
          await client.postUrl(Uri.parse('$origin/__champion/control'));
      request.headers.set('Authorization', 'Bearer $controlToken');
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({'action': action}));
      final response = await request.close();
      final text = await utf8.decoder.bind(response).join();
      expect(response.statusCode, 200, reason: action);
      return Map<String, dynamic>.from(jsonDecode(text) as Map);
    } finally {
      client.close(force: true);
    }
  }

  Future<void> frames(WidgetTester t, [int n = 5]) async {
    for (var i = 0; i < n; i++) {
      await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)));
      await t.pump(const Duration(milliseconds: 150));
    }
  }

  Future<void> reveal(WidgetTester t, Finder finder) async {
    FocusManager.instance.primaryFocus?.unfocus();
    await frames(t, 2);
    if (finder.evaluate().isEmpty &&
        find.byType(Scrollable).evaluate().isNotEmpty) {
      t
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .jumpTo(0);
      await frames(t, 2);
    }
    for (var i = 0; i < 50 && finder.evaluate().isEmpty; i++) {
      if (find.byType(Scrollable).evaluate().isNotEmpty) {
        await t.drag(find.byType(Scrollable).first, const Offset(0, -280));
      }
      await frames(t, 1);
    }
    expect(finder, findsWidgets);
    await Scrollable.ensureVisible(t.element(finder.first), alignment: .4);
    await frames(t, 2);
  }

  Future<void> tap(WidgetTester t, Finder finder) async {
    await reveal(t, finder);
    await t.tap(finder.first.hitTestable());
    await frames(t);
  }

  testWidgets('模拟月冠军投票原生响应丢失后按原键恢复，网页读取同一活动', (t) async {
    final fixture = await control('setup');
    final account = fixture['account'] as Map,
        event = fixture['event_id'] as String;
    final dio = Dio(BaseOptions(
        baseUrl: origin,
        validateStatus: (_) => true,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 30)));
    final api = AccountApi(dio: dio),
        me = await api.request('GET', '/api/v1/me',
            token: account['bearer_token']);
    var bootstrap = true, lose = true;
    final keys = <String>[], bodies = <String>[];
    dio.interceptors.add(InterceptorsWrapper(onRequest: (r, h) {
      if (bootstrap &&
          r.method == 'POST' &&
          r.path == '/api/v1/auth/sessions') {
        bootstrap = false;
        h.resolve(Response<dynamic>(requestOptions: r, statusCode: 200, data: {
          'data': {
            'access_token': account['bearer_token'],
            'token_type': 'Bearer',
            'account': me
          }
        }));
        return;
      }
      if (r.method == 'POST' && r.path == '/api/v1/engagement/votes') {
        keys.add('${r.headers['Idempotency-Key']}');
        bodies.add(jsonEncode(r.data));
      }
      h.next(r);
    }, onResponse: (r, h) {
      if (lose &&
          r.statusCode == 200 &&
          r.requestOptions.method == 'POST' &&
          r.requestOptions.path == '/api/v1/engagement/votes') {
        lose = false;
        h.reject(DioException(
            requestOptions: r.requestOptions,
            type: DioExceptionType.connectionError,
            message: 'synthetic response lost after vote commit'));
        return;
      }
      h.next(r);
    }));
    final session = AccountSession(api: api);
    await session.login('synthetic', 'synthetic', 'synthetic');
    await session.loadParties();
    session.select(session.parties
        .singleWhere((p) => p['party']['id'] == account['party_id']));
    EngagementPage page(Uri u) => EngagementPage(
        view: u.queryParameters['view'] ?? 'rankings',
        recordId: u.queryParameters['recordId']);
    await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: session,
        child: MaterialApp(
            home: ConsumerConfirmation(
                child: EngagementPage(view: 'competition', recordId: event)),
            onGenerateRoute: (settings) => MaterialPageRoute<void>(
                settings: settings,
                builder: (_) =>
                    page(Uri.parse(settings.name ?? '/engagement'))))));
    await frames(t, 20);
    await tap(t, find.text('确认本次扣分投票'));
    await tap(t, find.text('确认扣分并投票'));
    await tap(t, find.text('先核对当前记录'));
    await tap(t, find.text('使用原编号继续核对'));
    for (var i = 0;
        i < 100 && find.text('已按原编号核对原请求结果。').evaluate().isEmpty;
        i++) {
      await frames(t, 1);
    }
    expect(find.text('已按原编号核对原请求结果。'), findsOneWidget);
    expect(keys, hasLength(2));
    expect(keys.first, keys.last);
    expect(bodies.first, bodies.last);
    expect(t.takeException(), isNull);
    await control('verify');
    await tap(t, find.text('重新读取当前结果'));
    for (var i = 0; i < 100 && find.text('已核定结果').evaluate().isEmpty; i++) {
      await frames(t, 1);
    }
    expect(find.text('已核定结果'), findsOneWidget);
    await t.pumpWidget(const SizedBox.shrink());
    session.dispose();
  });
}
