import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  bool loseCreate = false;
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
    FocusManager.instance.primaryFocus?.unfocus();
    await frames(t, 2);
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
      if (o.method == 'POST' && o.path.endsWith('/invite-links')) {
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
      if (loseCreate &&
          r.statusCode == 200 &&
          r.requestOptions.method == 'POST' &&
          r.requestOptions.path.endsWith('/invite-links')) {
        loseCreate = false;
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

  testWidgets(
      'native host retry and guest claim same room without automatic participation',
      (t) async {
    addTearDown(() => Clipboard.setData(const ClipboardData(text: '')));
    await boot(t, 'buyer');
    final room = fixture['room_id'] as String;
    final before = await control('count');
    await open(t, '/cocreation?view=room&recordId=$room');
    await reveal(t, find.text('生成一次邀请'));
    loseCreate = true;
    await tap(t, find.text('生成一次邀请'));
    await wait(t, find.text('恢复同一次请求'));
    await tap(t, find.text('恢复同一次请求'));
    await wait(t, find.text('复制邀请凭证'));
    expect(keys.length, 2);
    expect(keys[0], keys[1]);
    await tap(t, find.text('复制邀请凭证'));
    final credential = (await Clipboard.getData('text/plain'))?.text;
    expect(credential, isNotNull);
    expect(credential, hasLength(101));
    await control('record', {'name': 'native-host-create-lost-retry-same-key'});
    await boot(t, 'co_actor_2');
    await open(t, '/cocreation?view=claim');
    final field = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == '邀请链接或凭证');
    await reveal(t, field);
    await t.enterText(field, credential!);
    await frames(t);
    final dropdown = find.byWidgetPredicate((w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == '本人档案');
    await tap(t, dropdown);
    final options = find.byType(DropdownMenuItem<String>);
    expect(options, findsWidgets);
    await t.tap(options.last.hitTestable());
    await frames(t);
    await tap(t, find.text('确认领取邀请'));
    await wait(t, find.textContaining('已领取邀请'));
    final after = await control('count');
    expect(after['joined_count'], before['joined_count']);
    await tap(t, find.text('进入同一房间并填写我的参加资料'));
    await reveal(t, find.text('填写我本人的参加资料'));
    await control(
        'record', {'name': 'native-guest-claim-same-room-count-unchanged'});
    await Clipboard.setData(const ClipboardData(text: ''));
    await control('complete');
  });
}
