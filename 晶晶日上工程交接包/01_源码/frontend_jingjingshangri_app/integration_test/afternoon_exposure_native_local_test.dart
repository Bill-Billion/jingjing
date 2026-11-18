import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/redemption/redemption_pages.dart';

const origin = String.fromEnvironment('NATIVE_ORIGIN');
const controlToken = String.fromEnvironment('NATIVE_CONTROL');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  Future<Map<String, dynamic>> control(String action,
      [Map<String, dynamic> extra = const {}]) async {
    final client = HttpClient();
    try {
      final request =
          await client.postUrl(Uri.parse('$origin/__native/control'));
      request.headers.set('Authorization', 'Bearer $controlToken');
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({'action': action, ...extra}));
      final response = await request.close();
      expect(response.statusCode, 200, reason: action);
      return Map<String, dynamic>.from(
          jsonDecode(await utf8.decoder.bind(response).join()));
    } finally {
      client.close(force: true);
    }
  }

  Future<void> frames(WidgetTester tester, [int count = 5]) async {
    for (var i = 0; i < count; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
  }

  Future<void> reveal(WidgetTester tester, Finder finder) async {
    if (finder.evaluate().isEmpty &&
        find.byType(Scrollable).evaluate().isNotEmpty) {
      tester
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .jumpTo(0);
      await frames(tester, 2);
    }
    for (var i = 0; i < 40 && finder.evaluate().isEmpty; i++) {
      if (find.byType(Scrollable).evaluate().isNotEmpty) {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -300));
      }
      await frames(tester, 2);
    }
    expect(finder, findsWidgets);
    await Scrollable.ensureVisible(tester.element(finder.first), alignment: .4);
    await frames(tester, 2);
  }

  Future<void> tap(WidgetTester tester, Finder finder) async {
    await reveal(tester, finder);
    await tester.tap(finder.first.hitTestable());
    await frames(tester);
  }

  Finder dropdown(String label) => find.byWidgetPredicate((w) =>
      w is DropdownButtonFormField<String> && w.decoration.labelText == label);

  testWidgets('本人曝光绑定响应丢失后沿原请求恢复', (tester) async {
    final fixture = await control('setup');
    final account = fixture['account'] as Map<String, dynamic>;
    final dio = Dio(BaseOptions(
        baseUrl: origin,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        validateStatus: (_) => true));
    final api = AccountApi(dio: dio);
    final me =
        await api.request('GET', '/api/v1/me', token: account['bearer_token']);
    var first = true;
    dio.interceptors.add(InterceptorsWrapper(onRequest: (request, handler) {
      if (first &&
          request.method == 'POST' &&
          request.path == '/api/v1/auth/sessions') {
        first = false;
        handler.resolve(
            Response<dynamic>(requestOptions: request, statusCode: 200, data: {
          'data': {
            'access_token': account['bearer_token'],
            'token_type': 'Bearer',
            'account': me
          }
        }));
      } else {
        handler.next(request);
      }
    }));
    final session = AccountSession(api: api);
    await session.login('synthetic-local', 'synthetic', 'synthetic');
    await session.loadParties();
    session.select(session.parties
        .singleWhere((p) => p['party']['id'] == account['party_id']));
    await tester.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: session,
        child: MaterialApp(
            home:
                RedemptionPage(view: 'grant', recordId: fixture['grant_id']))));
    await frames(tester, 15);
    await tap(tester, dropdown('本人艺人'));
    await tap(tester, find.textContaining('synthetic person').last);
    await frames(tester, 10);
    await tap(tester, dropdown('本人数字人'));
    await tap(tester, find.text('synthetic avatar').last);
    await tap(tester, dropdown('本人有效公开榜单资料'));
    await tap(tester,
        find.text('synthetic-city · synthetic-area · synthetic-category').last);
    await tap(tester, find.text('我已核对本人、授权用途和该权益原条款'));
    await tap(tester, find.text('确认绑定本人'));
    debugPrint(
        'EXPOSURE_SCREEN_TEXTS: ${find.byType(Text).evaluate().map((e) => (e.widget as Text).data).whereType<String>().join(' | ')}');
    await reveal(tester, find.text('上次操作结果尚未确定'));
    await control('capture', {'name': 'native-pending'});
    await tap(tester, find.text('先核对当前记录'));
    await tap(tester, find.text('使用原编号继续核对'));
    await reveal(tester, find.text('已绑定本人'));
    await control('capture', {'name': 'native-bound'});
    final verified = await control('verify');
    expect(verified['bind_requests'], 2);
    expect(verified['same_key'], true);
    expect(verified['status'], 'BOUND');
    await control('complete');
    session.dispose();
  });
}
