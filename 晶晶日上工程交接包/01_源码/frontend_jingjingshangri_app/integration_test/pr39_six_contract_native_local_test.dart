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
      'Actual Android six contract same-record roles and recovery boundaries',
      (t) async {
    if (const String.fromEnvironment('NATIVE_PHASE') != 'infringement') {
      await boot(t, 'six', 'seller');
      final records = Map<String, dynamic>.from(data['records']);
      final link = records['guardian_link'];
      await open(t, '/contract-six/guardians?id=$link');
      await press(t, find.text('读取使用量与休息提醒'));
      await shot(t, 'native-guardian-usage');
      await choose(t, '调整或一键关闭使用');
      await press(t, find.text('允许在已审限制内使用（取消即一键关闭）'));
      await submit(t);
      await control('assert-controls', {'enabled': false});
      await boot(t, 'six', 'buyer');
      await open(t, '/contract-six/guardians?id=$link');
      await press(t, find.text('明确申请本次一分钟使用'));
      await reveal(t, find.textContaining('监护人已关闭使用'));
      await shot(t, 'native-child-disabled');
      await choose(t, '调整或一键关闭使用');
      await reveal(t, find.textContaining('只能由本关系监护人办理'));
      await shot(t, 'native-child-cannot-remove-limits');
      await boot(t, 'six', 'seller');
      await open(t, '/contract-six/guardians?id=$link');
      await choose(t, '调整或一键关闭使用');
      await press(t, find.text('允许在已审限制内使用（取消即一键关闭）'));
      await submit(t);
      await control('assert-controls', {'enabled': true});
      await boot(t, 'six', 'buyer');
      await open(t, '/contract-six/guardians?id=$link');
      await press(t, find.text('明确申请本次一分钟使用'));
      await control('assert-usage');
      await press(t, find.text('读取已审核适龄预览'));
      await reveal(t, find.text('合成适龄预览'));
      await shot(t, 'native-approved-preview-list');
      await boot(t, 'six', 'seller');
      await open(t, '/contract-six/guardians?id=${records['guardian_refund']}');
      await shot(t, 'native-original-payment-refund-result');
      await open(
          t, '/contract-six/guardians?id=${records['guardian_privacy']}');
      await shot(t, 'native-information-request-still-pending');
      await boot(t, 'six', 'buyer2');
      await open(t, '/contract-six/closure?id=${data['closure_id']}');
      await reveal(t, find.text('当前执行期限'));
      await shot(t, 'native-original-and-extended-closure-deadlines');
    }
    await boot(t, 'six', 'buyer2');
    await open(t, '/contract-six/infringement');
    await choose(t, '提出侵权通知');
    await select(t, '具体涉案对象', '现货影片');
    await fill(t, '原对象编号', data['listing_id']);
    await fill(t, '完整权利说明', '原生合成侵权通知：只用于本地流程测试');
    await fill(t, '仅供运营联系，不自动转交对方', 'native-synthetic-contact');
    await fill(t, '已有本人私有材料编号（可选，逗号分隔）', data['proof']);
    await submit(t);
    final c = await control('native-case');
    final id = c['id'];
    await shot(t, 'native-notice-submitted');
    await boot(t, 'six', 'reviewer');
    await open(t, '/contract-six/infringement?id=$id&operations=true');
    await choose(t, '冻结本案内容');
    await fill(t, '本次明确理由', '原生合成冻结核对');
    await submit(t);
    await choose(t, '送达必要通知材料');
    await fill(t, '已脱敏的必要送达正文', '合成必要通知，无联系人或原件');
    await fill(t, '本次明确理由', '逐项核对最小送达');
    await submit(t);
    await boot(t, 'six', 'seller');
    await open(t, '/contract-six/infringement?id=$id');
    expect(find.textContaining('native-synthetic-contact'), findsNothing);
    await choose(t, '明确确认已读送达材料');
    await fill(t, '本次明确理由', '原生本人已实际阅读');
    await submit(t);
    await choose(t, '提交反通知');
    await fill(t, '完整权利说明', '原生合成反通知');
    await fill(t, '仅供运营联系，不自动转交对方', 'native-synthetic-counter-contact');
    await fill(t, '已有本人私有材料编号（可选，逗号分隔）', data['proof']);
    await fill(t, '本次明确理由', '合成原权利依据');
    await submit(t);
    await shot(t, 'native-counter-submitted');
    await boot(t, 'six', 'reviewer');
    await open(t, '/contract-six/infringement?id=$id&operations=true');
    await choose(t, '送达必要反通知材料');
    await fill(t, '已脱敏的必要送达正文', '合成必要反通知正文');
    await fill(t, '本次明确理由', '不转交无关原件');
    await submit(t);
    await choose(t, '提出处理结论');
    await select(t, '拟处理结论', '仅解除本案限制');
    await fill(t, '本次明确理由', '合成独立复核前提议');
    await submit(t);
    await choose(t, '独立复核本案处理');
    await reveal(t, find.textContaining('提议人不能复核自己的结论'));
    await shot(t, 'native-self-review-blocked');
    await boot(t, 'six', 'outsider');
    await open(t, '/contract-six/infringement?id=$id&operations=true');
    await choose(t, '独立复核本案处理');
    await select(t, '独立复核结论', '通过本提议');
    await fill(t, '本次明确理由', '合成另一岗位实际复核');
    await submit(t);
    await control('assert-native-case', {'id': id});
    await shot(t, 'native-independent-restoration');
    await boot(t, 'six', 'buyer2');
    await open(t, '/contract-six/infringement?id=$id');
    await shot(t, 'native-claimant-final-result');
    await control('complete');
    session?.dispose();
  }, timeout: const Timeout(Duration(minutes: 15)));
}
