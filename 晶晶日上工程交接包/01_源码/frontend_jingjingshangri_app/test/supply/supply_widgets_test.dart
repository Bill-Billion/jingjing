import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/supply/supply_form.dart';
import 'package:jingjingshangri_app/supply/supply_record.dart';
import 'package:jingjingshangri_app/supply/supply_page.dart';
import '../account/fake_account_api.dart';
import '../contracts/contract_fixtures.dart' show contractSession;
import 'supply_fixtures.dart';

Future<void> frames(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Future<void> pump(
    WidgetTester tester, AccountSession session, Widget page) async {
  await tester.binding.setSurfaceSize(const Size(390, 844));
  await tester.pumpWidget(ChangeNotifierProvider.value(
      value: session,
      child: MaterialApp(
          home: page,
          onGenerateRoute: (s) => MaterialPageRoute(
              settings: s,
              builder: (_) => const Scaffold(body: Text('最新回执页面'))))));
  await frames(tester);
}

Future<void> reveal(WidgetTester tester, Finder target) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await frames(tester);
  for (var i = 0; i < 30 && target.hitTestable().evaluate().isEmpty; i++) {
    await tester.drag(find.byType(ListView).first, const Offset(0, -300));
    await frames(tester);
  }
  expect(target.hitTestable(), findsOneWidget);
}

Future<void> close(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await frames(tester);
  await tester.binding.setSurfaceSize(null);
}

ResponseBody supplyReply(RequestOptions r, FakeAccountAdapter adapter,
    {String profileStatus = 'APPROVED'}) {
  if (r.path.endsWith('/records')) {
    return envelope({
      'items': r.queryParameters['kind'] == 'PROFILE'
          ? [profileData(status: profileStatus)]
          : [workData()],
      'next_cursor': null
    });
  }
  if (r.path.contains('/assets/')) {
    return envelope(assetData(
        id: r.path.split('/').last,
        purpose:
            r.path.endsWith(proofId) ? 'RIGHTS_EVIDENCE' : 'WORK_CONTENT'));
  }
  if (r.path.endsWith('/records/$versionId')) return envelope(workData());
  return adapter.defaultReply(r);
}

void main() {
  testWidgets('成员门禁不读取私有资料，切换负责人后才加载', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) => supplyReply(r, adapter));
    final session =
        (await tester.runAsync(() => contractSession(adapter, owner: false)))!;
    await pump(tester, session, const SupplyPage());
    expect(find.textContaining('当前成员身份没有私有资料权限'), findsOneWidget);
    expect(adapter.requests.where((r) => r.path.contains('/supply/')), isEmpty);
    await close(tester);
  });
  testWidgets('申请历史读取失败时禁用新建，不猜测previous null', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/records')
            ? envelope({'wrong': []})
            : adapter.defaultReply(r));
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await pump(tester, session, const SupplyForm(work: false));
    expect(find.byKey(const Key('supply-save')), findsNothing);
    expect(find.textContaining('返回的资料不完整'), findsOneWidget);
    await close(tester);
  });
  testWidgets('首次原作显示空权利人关系，必填不齐禁用保存且不代填身份或证明', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) => supplyReply(r, adapter));
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await pump(tester, session, const SupplyForm(work: true));
    final identityCard = find.byKey(const Key('supply-current-identity'));
    expect(find.descendant(of: identityCard, matching: find.text('测试机构')),
        findsOneWidget);
    expect(
        find.descendant(of: identityCard, matching: find.text('当前提交身份 · 机构')),
        findsOneWidget);
    expect(find.text(orgId), findsNothing);
    expect(find.text('权利人'), findsOneWidget);
    expect(find.text('请填写作品标题。'), findsOneWidget);
    expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('supply-save')))
            .onPressed,
        isNull);
    await tester.enterText(find.byKey(const Key('supply-title')), '新作');
    await frames(tester);
    expect(find.text('请上传一份私有稿件。'), findsOneWidget);
    await reveal(tester, find.text('使用当前身份'));
    await frames(tester);
    expect(find.text(orgId), findsNothing);
    await tester.tap(find.text('使用当前身份'));
    await frames(tester);
    expect(find.text(orgId), findsOneWidget);
    await reveal(tester, find.byKey(const Key('supply-save')));
    await frames(tester);
    expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('supply-save')))
            .onPressed,
        isNull);
    expect(
        adapter.requests.where(
            (r) => r.method == 'POST' && r.path.contains('/work-versions')),
        isEmpty);
    expect(tester.takeException(), isNull);
    await close(tester);
  });
  testWidgets('首次作者申请缺展示名介绍或证明时禁用提交并说明原因', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/records')
            ? envelope({'items': [], 'next_cursor': null})
            : adapter.defaultReply(r));
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    session.select(identity(personId));
    await pump(tester, session, const SupplyForm(work: false));
    final identityCard = find.byKey(const Key('supply-current-identity'));
    expect(find.descendant(of: identityCard, matching: find.text('我的个人身份')),
        findsOneWidget);
    expect(
        find.descendant(of: identityCard, matching: find.text('当前提交身份 · 个人')),
        findsOneWidget);
    expect(
        tester
            .widget<TextFormField>(find.byKey(const Key('supply-title')))
            .controller!
            .text,
        isEmpty);
    FilledButton saveButton() =>
        tester.widget<FilledButton>(find.byKey(const Key('supply-save')));
    expect(saveButton().onPressed, isNull);
    expect(find.text('请填写作者展示名称。'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('supply-title')), '作者资料');
    await frames(tester);
    expect(saveButton().onPressed, isNull);
    expect(find.text('请填写作者介绍。'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('supply-description')), '真实介绍');
    await frames(tester);
    expect(saveButton().onPressed, isNull);
    expect(find.text('请上传申请证明材料。'), findsOneWidget);
    await close(tester);
  });
  testWidgets('完整作者申请在清空及补齐必填内容时实时切换提交状态', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) => supplyReply(r, adapter));
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await pump(tester, session, const SupplyForm(work: false));
    FilledButton saveButton() =>
        tester.widget<FilledButton>(find.byKey(const Key('supply-save')));
    expect(saveButton().onPressed, isNotNull);
    await tester.enterText(find.byKey(const Key('supply-title')), '');
    await frames(tester);
    expect(saveButton().onPressed, isNull);
    await tester.enterText(find.byKey(const Key('supply-title')), '补正名称');
    await frames(tester);
    expect(saveButton().onPressed, isNotNull);
    await tester.enterText(find.byKey(const Key('supply-description')), '');
    await frames(tester);
    expect(saveButton().onPressed, isNull);
    await tester.enterText(find.byKey(const Key('supply-description')), '补正介绍');
    await frames(tester);
    expect(saveButton().onPressed, isNotNull);
    await reveal(tester, find.text('移除此处引用'));
    await tester.tap(find.text('移除此处引用'));
    await frames(tester);
    expect(saveButton().onPressed, isNull);
    expect(find.text('请上传申请证明材料。'), findsOneWidget);
    await close(tester);
  });
  testWidgets('最新申请待审时作品投稿禁用，即使历史申请曾通过', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) =>
            supplyReply(r, adapter, profileStatus: 'PENDING_REVIEW'));
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await pump(tester, session, const SupplyPage());
    await reveal(tester, find.widgetWithText(FilledButton, '投稿原作'));
    final button =
        tester.widget<FilledButton>(find.widgetWithText(FilledButton, '投稿原作'));
    expect(button.onPressed, isNull);
    await close(tester);
  });
  testWidgets('新修订使用读到的最新关联，保存草稿后GET核对，绝不顺带提交审核', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/records') &&
          r.queryParameters['kind'] == 'WORK_VERSION') {
        return envelope({
          'items': [workData(), workData(id: laterId, revision: 2)],
          'next_cursor': null
        });
      }
      if (r.path.endsWith('/records/$laterId')) {
        return envelope(workData(id: laterId, revision: 2));
      }
      if (r.path.endsWith('/work-versions') && r.method == 'POST') {
        return envelope(workData());
      }
      return supplyReply(r, adapter);
    });
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await pump(
        tester, session, const SupplyForm(work: true, previousId: versionId));
    await reveal(tester, find.byKey(const Key('supply-save')));
    await frames(tester);
    await tester.tap(find.byKey(const Key('supply-save')));
    await frames(tester);
    final post = adapter.requests.singleWhere(
        (r) => r.method == 'POST' && r.path.endsWith('/work-versions'));
    expect(post.data['previous_version_id'], laterId);
    expect(post.data['work_id'], workId);
    expect(post.data['kind'], 'ORIGINAL');
    expect(post.data['source_version_id'], isNull);
    expect(post.data['project_id'], isNull);
    expect((post.data as Map).length, 9);
    expect(adapter.requests.where((r) => r.path.endsWith('/actions')), isEmpty);
    expect(
        adapter.requests.skip(adapter.requests.indexOf(post) + 1).any((r) =>
            r.path == '/api/v1/supply/records/$versionId' && r.method == 'GET'),
        isTrue);
    expect(find.text('最新回执页面'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await close(tester);
  });
  testWidgets('412重新读取并要求重新确认，撤回理由输入可正常销毁', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/actions')) {
        return envelope({'code': 'OBJECT_VERSION_MISMATCH'},
            status: 412, error: true);
      }
      return supplyReply(r, adapter);
    });
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await pump(tester, session, const SupplyRecordPage(recordId: versionId));
    await reveal(tester, find.text('撤回此版'));
    await frames(tester);
    await tester.tap(find.text('撤回此版'));
    await frames(tester);
    await tester.enterText(find.byKey(const Key('withdraw-reason')), '资料需更正');
    await tester.tap(find.text('确认撤回'));
    await frames(tester);
    await frames(tester);
    final posts =
        adapter.requests.where((r) => r.path.endsWith('/actions')).toList();
    expect(posts.length, 1);
    expect(posts.single.headers['If-Match'], '"1"');
    expect(posts.single.data, {'action': 'WITHDRAW', 'reason': '资料需更正'});
    expect(
        adapter.requests
            .where((r) => r.path.endsWith('/records/$versionId'))
            .length,
        2);
    expect(tester.takeException(), isNull);
    await close(tester);
  });
  testWidgets('换合同式的版本路由更换与身份切换都丢弃迟到资料', (tester) async {
    final delayed = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/records/$versionId')) return delayed.future;
      return supplyReply(r, adapter);
    });
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await pump(tester, session, const SupplyRecordPage(recordId: versionId));
    session.select(identity(personId, owner: false));
    await frames(tester);
    delayed.complete(envelope(workData()));
    await frames(tester);
    expect(find.text('河岸边的故事'), findsNothing);
    expect(find.textContaining('当前成员身份没有私有资料权限'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await close(tester);
  });
  testWidgets('作品深链接登录后恢复指定只读版本并清除旧路由', (tester) async {
    SharedPreferences.setMockInitialValues({});
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) => supplyReply(r, adapter));
    final session = AccountSession(api: adapter.createApi());
    String? destination;
    await tester.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: session),
          ChangeNotifierProvider(create: (_) => UserProvider())
        ],
        child: MaterialApp(
            home: const SupplyRecordPage(recordId: versionId),
            onGenerateRoute: (settings) {
              destination = settings.name;
              return MaterialPageRoute(
                  settings: settings,
                  builder: (_) => const SupplyRecordPage(recordId: versionId));
            })));
    await frames(tester);
    await tester.tap(find.text('前往账号与身份'));
    await frames(tester);
    expect(find.byType(LoginPage), findsOneWidget);
    await tester.enterText(find.byType(TextField).first, '13800000000');
    await frames(tester);
    await tester.tap(find.text('获取验证码'));
    await frames(tester);
    await tester.enterText(find.byType(TextField).last, '123456');
    await tester.tap(find.byIcon(Icons.radio_button_unchecked_rounded));
    await frames(tester);
    await tester.tap(find.text('登录 / 注册'));
    await frames(tester);
    expect(destination, '/supply/record?recordId=$versionId');
    expect(find.byType(LoginPage), findsNothing);
    expect(find.text('河岸边的故事'), findsOneWidget);
    expect(
        adapter.requests
            .where((r) => r.method != 'GET' && r.path.contains('/supply/')),
        isEmpty);
    await close(tester);
  });
}
