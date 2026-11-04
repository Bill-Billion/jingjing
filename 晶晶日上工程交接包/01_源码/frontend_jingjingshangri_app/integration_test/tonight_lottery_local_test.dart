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
import 'package:jingjingshangri_app/redemption/redemption_pages.dart';

const origin = String.fromEnvironment('NATIVE_ORIGIN');
const controlToken = String.fromEnvironment('NATIVE_CONTROL');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  Future<Map<String, dynamic>> control(String action) async {
    final client = HttpClient();
    try {
      final request =
          await client.postUrl(Uri.parse('$origin/__lottery/control'));
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

  testWidgets('模拟十连的原生结果未知后按原键恢复，网页读取同一记录', (t) async {
    final fixture = await control('setup');
    final account = fixture['account'] as Map,
        pool = fixture['pool_id'] as String;
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
      if (r.method == 'POST' && r.path == '/api/v1/redemption/draws') {
        keys.add('${r.headers['Idempotency-Key']}');
        bodies.add(jsonEncode(r.data));
      }
      h.next(r);
    }, onResponse: (r, h) {
      if (lose &&
          r.statusCode == 200 &&
          r.requestOptions.method == 'POST' &&
          r.requestOptions.path == '/api/v1/redemption/draws') {
        lose = false;
        h.reject(DioException(
            requestOptions: r.requestOptions,
            type: DioExceptionType.connectionError,
            message: 'synthetic response lost after draw commit'));
        return;
      }
      h.next(r);
    }));
    final session = AccountSession(api: api);
    await session.login('synthetic', 'synthetic', 'synthetic');
    await session.loadParties();
    session.select(session.parties
        .singleWhere((p) => p['party']['id'] == account['party_id']));
    RedemptionPage page(Uri u) => RedemptionPage(
        view: u.queryParameters['view'] ?? 'catalog',
        recordId: u.queryParameters['recordId']);
    await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: session,
        child: MaterialApp(
            home: ConsumerConfirmation(
                child: RedemptionPage(view: 'pool', recordId: pool)),
            onGenerateRoute: (settings) => MaterialPageRoute<void>(
                settings: settings,
                builder: (_) =>
                    page(Uri.parse(settings.name ?? '/redemption'))))));
    await frames(t, 20);
    await tap(
        t, find.widgetWithText(CheckboxListTile, '我已核对本次条款、实际概率、扣用晶钻及库存不足处理'));
    await tap(t, find.text('按本次规则十连'));
    await tap(t, find.text('确认本次操作'));
    await tap(t, find.text('先核对当前记录'));
    await tap(t, find.text('使用原编号继续核对'));
    for (var i = 0; i < 100 && find.text('这一次的抽取结果').evaluate().isEmpty; i++) {
      await frames(t, 1);
    }
    expect(find.text('这一次的抽取结果'), findsOneWidget);
    expect(keys, hasLength(2));
    expect(keys.first, keys.last);
    expect(bodies.first, bodies.last);
    expect(t.takeException(), isNull);
    await control('verify');
    await t.pumpWidget(const SizedBox.shrink());
    session.dispose();
  });
}
