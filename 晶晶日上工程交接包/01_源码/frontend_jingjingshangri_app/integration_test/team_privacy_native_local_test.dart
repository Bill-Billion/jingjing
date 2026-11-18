// Synthetic-only integration entrypoint; the controller accepts loopback only.
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
import 'package:jingjingshangri_app/privacy/closure_reference.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';

const origin = String.fromEnvironment('NATIVE_ORIGIN');
const controlToken = String.fromEnvironment('NATIVE_CONTROL');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  AccountSession? session;
  NavigatorState? nav;
  String? requestId, executionId;
  bool loseClosure = false;
  final closureKeys = <String>[];

  Future<Map<String, dynamic>> control(String action,
      [Map<String, dynamic> args = const {}]) async {
    final client = HttpClient();
    try {
      final req = await client.postUrl(Uri.parse('$origin/__native/control'));
      req.headers.set('Authorization', 'Bearer $controlToken');
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({'action': action, ...args}));
      final response = await req.close();
      final body = await utf8.decoder.bind(response).join();
      expect(response.statusCode, 200, reason: '$action: $body');
      return Map<String, dynamic>.from(jsonDecode(body));
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
    for (var i = 0; i < 45 && f.evaluate().isEmpty; i++) {
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
    final fixture = await control('setup', {'role': role}),
        a = fixture['account'];
    final legacy = UserProvider();
    await legacy.logout();
    final dio = Dio(BaseOptions(
        baseUrl: origin,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 30),
        followRedirects: false,
        validateStatus: (_) => true));
    final api = AccountApi(dio: dio),
        account =
            await api.request('GET', '/api/v1/me', token: a['bearer_token']);
    var first = true;
    dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
      if (o.method == 'POST' && o.path.endsWith('/execute') && loseClosure) {
        closureKeys.add('${o.headers['Idempotency-Key']}');
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
      if (r.statusCode == 200 && r.requestOptions.method == 'POST') {
        final data = r.data is Map ? r.data['data'] : null;
        if (r.requestOptions.path == '/api/v1/privacy/requests' &&
            data is Map) {
          requestId = data['id'];
        }
        if (r.requestOptions.path.endsWith('/executions') && data is Map) {
          executionId = data['id'];
        }
        if (loseClosure && r.requestOptions.path.endsWith('/execute')) {
          loseClosure = false;
          h.reject(DioException(
              requestOptions: r.requestOptions,
              type: DioExceptionType.connectionError,
              message: 'synthetic response lost after commit'));
          return;
        }
      }
      h.next(r);
    }));
    session = AccountSession(api: api);
    await session!.login('synthetic-$role', 'synthetic', 'synthetic');
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

  Future<void> refresh(WidgetTester t) async {
    await tap(t, find.text('重新读取当前记录'));
    await frames(t, 12);
  }

  Future<void> choosePolicy(WidgetTester t) async {
    await tap(t, find.byKey(const ValueKey('privacy-account-policy')));
    await tap(t, find.textContaining('synthetic reviewed policy only').last);
  }

  testWidgets(
      'new closure and correction use same request across native and independent operations',
      (t) async {
    expect(origin.startsWith('http://127.0.0.1:'), true);
    expect(controlToken.isNotEmpty, true);
    await boot(t, 'buyer');
    expect(await ClosureReferenceStore.read(accountId: session!.account!['id']),
        isEmpty,
        reason: 'a newly created synthetic account has no previous closure');
    await open(t, '/privacy?view=new');
    await tap(t, find.byKey(const ValueKey('希望办理的事项:QUERY')));
    await tap(t, find.text('注销账号').last);
    await tap(t, find.text('全部相关资料'));
    final details = find.widgetWithText(TextField, '具体说明');
    await reveal(t, details);
    await t.enterText(details, '合成测试：本人申请注销，历史合同及留存分别核对');
    await tap(t, find.text('提交本次申请'));
    for (var i = 0; i < 150 && requestId == null; i++) {
      await frames(t, 1);
    }
    expect(requestId, isNotNull);
    final closureId = requestId!;
    await wait(t, find.text('核对回复与核验后执行期限'));
    await control('verify-closure', {'request_id': closureId});
    await refresh(t);
    await choosePolicy(t);
    await reveal(t, find.byKey(const ValueKey('privacy-plan-reason')));
    await t.enterText(
        find.byKey(const ValueKey('privacy-plan-reason')), '合成测试：本人明确提出注销方案');
    executionId = null;
    await tap(t, find.text('提交本人的注销方案'));
    for (var i = 0; i < 150 && executionId == null; i++) {
      await frames(t, 1);
    }
    expect(executionId, isNotNull);
    await control('review-execution',
        {'request_id': closureId, 'execution_id': executionId});
    await refresh(t);
    await tap(t, find.text('本人确认注销访问'));
    await wait(t, find.text('本人明确确认'));
    loseClosure = true;
    await tap(t, find.text('本人明确确认'));
    await wait(t, find.textContaining('注销结果尚未确认'));
    expect(closureKeys.length, 1);
    await control('check-closure',
        {'request_id': closureId, 'execution_id': executionId});
    ScaffoldMessenger.of(nav!.context).hideCurrentSnackBar();
    await frames(t, 3);
    await tap(t, find.text('重新读取当前记录'));
    await wait(t, find.text('请先登录，再查看属于你的业务。'));
    nav!.pushNamed('/account');
    await frames(t, 10);
    await tap(t, find.text('查看本机保存的注销申请编号'));
    await wait(t, find.textContaining(closureId));
    expect(find.textContaining('注销结果尚未确认'), findsWidgets);
    await control('record', {
      'name': 'native-close-unknown-reference-and-401',
      'request_id': closureId
    });

    requestId = null;
    executionId = null;
    await boot(t, 'corrector');
    await open(t, '/privacy?view=correction');
    final cDetails = find.widgetWithText(TextField, '具体说明');
    await reveal(t, cDetails);
    await t.enterText(cDetails, '合成测试：更正本人展示名');
    await tap(t, find.text('提交本次申请'));
    for (var i = 0; i < 150 && requestId == null; i++) {
      await frames(t, 1);
    }
    expect(requestId, isNotNull);
    final correctionId = requestId!;
    await control('start-correction', {'request_id': correctionId});
    await refresh(t);
    await choosePolicy(t);
    await reveal(t, find.byKey(const ValueKey('privacy-display-name')));
    await t.enterText(
        find.byKey(const ValueKey('privacy-display-name')), '合成更正展示名');
    await reveal(t, find.byKey(const ValueKey('privacy-plan-reason')));
    await t.enterText(
        find.byKey(const ValueKey('privacy-plan-reason')), '本人明确更正');
    executionId = null;
    await tap(t, find.text('提交本人的更正方案'));
    for (var i = 0; i < 150 && executionId == null; i++) {
      await frames(t, 1);
    }
    expect(executionId, isNotNull);
    await control('review-execution',
        {'request_id': correctionId, 'execution_id': executionId});
    await refresh(t);
    await tap(t, find.text('本人确认更正展示名'));
    await tap(t, find.text('本人明确确认'));
    await wait(t, find.textContaining('展示名已更新'));
    await control('check-correction',
        {'request_id': correctionId, 'execution_id': executionId});
    await control('record', {
      'name': 'native-correction-independently-reviewed-and-executed',
      'request_id': correctionId
    });
    await control('complete');
  });
}
