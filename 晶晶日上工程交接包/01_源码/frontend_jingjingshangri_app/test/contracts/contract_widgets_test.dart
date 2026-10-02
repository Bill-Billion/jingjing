import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/app.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/account/account_theme.dart';
import 'package:jingjingshangri_app/contracts/contract_page.dart';
import 'package:jingjingshangri_app/contracts/contract_text.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import '../account/fake_account_api.dart';
import 'contract_fixtures.dart';

void main() {
  testWidgets('开放条款按段落和数组递归显示，零、false、null和HTML作为原文保留', (tester) async {
    const paragraph = '第一段\n第二段';
    const html = '<b>只是原文</b>';
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                child: ContractText(value: {
      '条款': {
        '段落': paragraph,
        '数量': 0,
        '开关': false,
        '未约定': null,
        '内容': [html]
      }
    })))));
    expect(find.text(paragraph), findsOneWidget);
    expect(find.text('0'), findsOneWidget);
    expect(find.text('false'), findsOneWidget);
    expect(find.text('null'), findsOneWidget);
    expect(find.text(html), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('可选字段中文名递归到数组，保留原值且默认调用仍显示原字段', (tester) async {
    final original = {
      'quote': [
        {
          'title': '原服务',
          'amount': 0,
          'flag': false,
          'empty': null,
          'unknown': '保留原文'
        }
      ]
    };
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                child: ContractText(
      value: original,
      fieldLabels: const {'quote': '成交报价', 'title': '服务名称'},
    )))));
    expect(find.text('成交报价'), findsOneWidget);
    expect(find.text('服务名称'), findsOneWidget);
    expect(find.text('原服务'), findsOneWidget);
    expect(find.text('0'), findsOneWidget);
    expect(find.text('false'), findsOneWidget);
    expect(find.text('null'), findsOneWidget);
    expect(find.text('unknown'), findsOneWidget);
    expect((original['quote'] as List).first['title'], '原服务');
    await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: ContractText(value: original))));
    expect(find.text('quote'), findsOneWidget);
    expect(find.text('title'), findsOneWidget);
    expect(find.text('成交报价'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('限流按服务端秒数禁用读取按钮，不展示之前的合同', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.contains('/content')) {
        final response =
            envelope({'code': 'RATE_LIMITED'}, status: 429, error: true);
        response.headers['retry-after'] = ['7'];
        return response;
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: const MaterialApp(home: ContractPage(snapshotId: snapshotId))));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('read-contract')))
            .onPressed,
        isNull);
    expect(find.textContaining('秒后可重新读取'), findsOneWidget);
    expect(find.text('当时保存的承诺'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('携带合同编号的启动路由不会被延迟开屏替换', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.platformDispatcher.defaultRouteNameTestValue =
        '/contract?snapshotId=$snapshotId';
    addTearDown(tester.platformDispatcher.clearDefaultRouteNameTestValue);
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.contains('/content')
            ? envelope(snapshotData())
            : adapter.defaultReply(r));
    final session = (await tester.runAsync(() => contractSession(adapter)))!;
    await tester.pumpWidget(MultiProvider(providers: [
      ChangeNotifierProvider.value(value: session),
      ChangeNotifierProvider(create: (_) => UserProvider())
    ], child: const JingjingShangriApp()));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 2));
    expect(find.byType(ContractPage), findsOneWidget);
    expect(
        tester
            .widget<TextField>(find.byKey(const Key('contract-number')))
            .controller!
            .text,
        snapshotId);
    expect(adapter.requests.where((r) => r.path.contains('/content')),
        hasLength(1));
    expect(tester.takeException(), isNull);
  });
  testWidgets('小屏合同只读展示任意JSON文本，服务就绪无签署或付款操作，退出清空', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.contains('business-readiness')) {
        return envelope(readinessData(status: 'SERVICE_READY', reason: null));
      }
      if (r.path.contains('rule-versions')) return envelope(ruleData());
      if (r.path.contains('/content')) return envelope(snapshotData());
      return adapter.defaultReply(r);
    });
    final session =
        (await tester.runAsync(() => contractSession(adapter, owner: false)))!;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: const ContractPage(snapshotId: snapshotId))));
    await tester.pumpAndSettle();
    expect(find.textContaining('尚未签署'), findsOneWidget);
    expect(
        Theme.of(tester.element(find.byKey(const Key('contract-number'))))
            .scaffoldBackgroundColor,
        AccountTheme.canvas);
    await tester.scrollUntilVisible(find.text('历史制作规则\n版本 2026.1'), 500,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('历史制作规则\n版本 2026.1'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.textContaining('alert'), 400,
        scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('alert'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('检查服务条件'), 500,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('检查服务条件'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('服务条件已具备'), 250,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('服务条件已具备'), findsOneWidget);
    expect(find.text('立即付款'), findsNothing);
    expect(find.text('签署合同'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.runAsync(session.logout);
    await tester.pumpAndSettle();
    expect(find.textContaining('alert'), findsNothing);
    expect(find.text('服务条件已具备'), findsNothing);
    expect(find.text('前往登录'), findsOneWidget);
  });
  testWidgets('无身份显示选择入口，未请求内容且不假装有合同列表', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await tester
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: const MaterialApp(home: ContractPage(snapshotId: snapshotId))));
    await tester.pumpAndSettle();
    expect(find.text('前往选择身份'), findsOneWidget);
    expect(adapter.requests, hasLength(1));
    expect(find.text('合同列表'), findsNothing);
  });
}
