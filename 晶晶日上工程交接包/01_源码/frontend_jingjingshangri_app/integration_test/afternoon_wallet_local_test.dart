import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/wallet/wallet_pages.dart';

const origin = String.fromEnvironment('NATIVE_ORIGIN');
const controlToken = String.fromEnvironment('NATIVE_CONTROL');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  Future<Map<String, dynamic>> control(String action) async {
    final client = HttpClient();
    try {
      final req = await client.postUrl(Uri.parse('$origin/__wallet/control'));
      req.headers.set('Authorization', 'Bearer $controlToken');
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({'action': action}));
      final response = await req.close();
      final text = await utf8.decoder.bind(response).join();
      expect(response.statusCode, 200, reason: '$action: $text');
      return Map<String, dynamic>.from(jsonDecode(text));
    } finally {
      client.close(force: true);
    }
  }

  Future<void> frames(WidgetTester t, [int n = 6]) async {
    for (var i = 0; i < n; i++) {
      await t.pump(const Duration(milliseconds: 200));
    }
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
        await t.drag(find.byType(Scrollable).first, const Offset(0, -300));
      }
      await frames(t, 2);
    }
    if (f.evaluate().isEmpty) {
      debugPrint(
          'WALLET_LABELS ${find.byType(Text).evaluate().map((e) => (e.widget as Text).data).whereType<String>().join(' | ')}');
    }
    expect(f, findsWidgets);
    await Scrollable.ensureVisible(t.element(f.first), alignment: .4);
    await frames(t, 2);
  }

  Future<void> tap(WidgetTester t, Finder f) async {
    FocusManager.instance.primaryFocus?.unfocus();
    await frames(t, 2);
    await reveal(t, f);
    await t.tap(f.first.hitTestable());
    await frames(t);
  }

  Future<void> submit(WidgetTester t, String name) async {
    await tap(t, find.widgetWithText(FilledButton, name));
    await tap(t, find.text('确认办理'));
    await frames(t, 12);
  }

  testWidgets('本人开户后模拟充值未知结果以原请求恢复', (t) async {
    final fixture = await control('setup'), a = fixture['account'];
    final dio = Dio(BaseOptions(
        baseUrl: origin,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 90),
        validateStatus: (_) => true));
    final api = AccountApi(dio: dio),
        me = await api.request('GET', '/api/v1/me', token: a['bearer_token']);
    var first = true;
    dio.interceptors.add(InterceptorsWrapper(onRequest: (q, h) {
      if (first && q.method == 'POST' && q.path == '/api/v1/auth/sessions') {
        first = false;
        h.resolve(Response<dynamic>(requestOptions: q, statusCode: 200, data: {
          'data': {
            'access_token': a['bearer_token'],
            'token_type': 'Bearer',
            'account': me
          }
        }));
      } else {
        h.next(q);
      }
    }));
    final session = AccountSession(api: api);
    await session.login('synthetic', 'synthetic', 'synthetic');
    await session.loadParties();
    session.select(
        session.parties.singleWhere((p) => p['party']['id'] == a['party_id']));
    WalletPage pageFor(Uri uri) => WalletPage(
        mode: switch (uri.path) {
          '/wallet/rules' => 'rules',
          '/wallet/recharge' => 'recharge',
          '/wallet/records' => 'records',
          '/wallet/scout' => 'scout',
          _ => 'summary'
        },
        kind: uri.queryParameters['kind']);
    await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: session,
        child: MaterialApp(
            home: const WalletPage(),
            onGenerateRoute: (settings) {
              return MaterialPageRoute<void>(
                  builder: (_) =>
                      pageFor(Uri.parse(settings.name ?? '/wallet')));
            })));
    await frames(t, 12);
    await tap(t, find.text('阅读规则并开立本人账本'));
    final dropdown = find.byWidgetPredicate((w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == '选择独立审核后生效的规则');
    await tap(t, dropdown);
    await tap(t, find.text('synthetic-v1').last);
    await tap(t,
        find.widgetWithText(CheckboxListTile, '我已完整阅读本版规则，理解充值、消费、晶钻和会员年分别记账'));
    await submit(t, '接受本版规则并开立个人账本');
    await control('verify-open');
    await tap(t, find.text('余额充值'));
    final amount = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == '本次申请充值金额（元）');
    await reveal(t, amount);
    await t.enterText(amount, '300.00');
    await frames(t, 2);
    await submit(t, '模拟充值');
    await reveal(t, find.text('恢复原请求核对'));
    await tap(t, find.text('恢复原请求核对'));
    for (var i = 0; i < 50 && session.walletPending.isNotEmpty; i++) {
      await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 200)));
      await frames(t, 1);
    }
    debugPrint('WALLET_PENDING_AFTER_RETRY ${session.walletPending.length}');
    debugPrint(
        'WALLET_AFTER_RETRY_LABELS ${find.byType(Text).evaluate().map((e) => (e.widget as Text).data).whereType<String>().join(' | ')}');
    await control('capture');
    final check = await control('verify-topup');
    expect(check['balance_minor'], 30000);
    expect(check['growth'], 0);
    expect(check['level'], 1);
    expect(check['same_key'], true);
    expect(t.takeException(), isNull);
  });
}
