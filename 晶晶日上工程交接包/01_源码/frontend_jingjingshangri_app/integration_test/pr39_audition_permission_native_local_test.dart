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
  AccountSession? session;
  NavigatorState? nav;
  Map<String, dynamic> fixture = {};
  final keys = <String>[];
  bool loseDelivery = false;
  Future<Map<String, dynamic>> control(String action,
      [Map<String, dynamic> args = const {}]) async {
    final client = HttpClient();
    try {
      final req = await client.postUrl(Uri.parse('$origin/__native/control'));
      req.headers.set('Authorization', 'Bearer $controlToken');
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({'action': action, ...args}));
      final response = await req.close();
      expect(response.statusCode, 200, reason: action);
      return Map<String, dynamic>.from(
          jsonDecode(await utf8.decoder.bind(response).join()));
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
    for (var i = 0; i < 150 && f.evaluate().isEmpty; i++) {
      await frames(t, 1);
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
    for (var i = 0; i < 35 && f.evaluate().isEmpty; i++) {
      if (find.byType(Scrollable).evaluate().isNotEmpty) {
        await t.drag(find.byType(Scrollable).first, const Offset(0, -350));
      }
      await frames(t, 2);
    }
    await wait(t, f);
    await Scrollable.ensureVisible(t.element(f.first), alignment: 0.4);
    await frames(t, 2);
  }

  Future<void> tap(WidgetTester t, Finder f) async {
    await reveal(t, f);
    await t.tap(f.first.hitTestable());
    await frames(t);
  }

  Future<void> boot(WidgetTester t, String role) async {
    session?.dispose();
    runApp(const SizedBox.shrink());
    await frames(t);
    fixture = await control('setup', {'role': role});
    final a = fixture['account'];
    final legacy = UserProvider();
    await legacy.logout();
    final dio = Dio(BaseOptions(
        baseUrl: origin,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        followRedirects: false,
        validateStatus: (_) => true));
    final api = AccountApi(dio: dio),
        account =
            await api.request('GET', '/api/v1/me', token: a['bearer_token']);
    var first = true;
    dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
      if (o.method == 'POST' && o.path.endsWith('/delivery')) {
        keys.add('${o.headers['Idempotency-Key']}');
      }
      if (first && o.method == 'POST' && o.path == '/api/v1/auth/sessions') {
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
      if (loseDelivery &&
          r.statusCode == 200 &&
          r.requestOptions.method == 'POST' &&
          r.requestOptions.path.endsWith('/delivery')) {
        loseDelivery = false;
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
    nav = Navigator.of(t.element(find.byType(NavigationBar)));
    await frames(t, 5);
  }

  Future<void> open(WidgetTester t, String route) async {
    nav!.popUntil((r) => r.isFirst);
    await frames(t);
    nav!.pushNamed(route);
    await frames(t, 10);
  }

  testWidgets('native revocation clears options and explicit regrant recovers', (t) async {
    await boot(t, 'mcn_staff');
    final booking = fixture['booking_id'] as String;
    final photo = (fixture['photo_ids'] as List).first as String;
    await open(t, '/auditions/action?bookingId=$booking&action=delivery');
    await reveal(t, find.textContaining('当前缺少本艺人试镜或材料管理授权'));
    expect(session!.auditionsAccessDenied, isFalse);
    expect(find.byKey(ValueKey('audition-photos-$photo')), findsNothing);
    await control('grant');
    await tap(t, find.text('重新读取本预约材料与授权'));
    await reveal(t, find.byKey(ValueKey('audition-photos-$photo')));
    expect(session!.auditionsAccessDenied, isFalse);
    await control('record', {'name': 'native-revoke-and-explicit-regrant'});
    await control('complete');
  });
}
