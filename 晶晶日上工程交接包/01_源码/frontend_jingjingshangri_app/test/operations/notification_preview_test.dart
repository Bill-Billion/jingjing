import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/operations/notification_preview.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../stock/v5_test_host.dart';
import 'operation_fixtures.dart';

void main() {
  testWidgets('系统通知在320宽两倍字号仍可阅读和操作', (t) async {
    t.view.physicalSize = const Size(320, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final adapter = operationsAdapter();
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await t.pumpWidget(MaterialApp(
        home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Scaffold(
                body: ListView(children: [
              NotificationPreview(session: session),
            ])))));
    await frames(t);
    expect(find.text('有新的对象留言'), findsOneWidget);
    expect(find.byTooltip('刷新通知'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('消息预览读取当前身份，打开详情不隐式已读，也不从分页推算总数', (t) async {
    final adapter = operationsAdapter();
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    String? opened;
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ListView(children: [
          NotificationPreview(session: session),
        ])),
        onGenerateRoute: (settings) {
          opened = settings.name;
          return MaterialPageRoute<void>(
              builder: (_) => const Scaffold(body: Text('通知详情')));
        }));
    await frames(t);
    expect(find.text('有新的对象留言'), findsOneWidget);
    expect(find.textContaining('总未读'), findsNothing);
    expect(adapter.requests.last.headers['X-Acting-Party'], personId);
    await t.tap(find.text('有新的对象留言'));
    await frames(t);
    expect(opened, '/operations/notification?eventId=7');
    expect(adapter.requests.where((r) => r.path.endsWith('/read')), isEmpty);
    expect(t.takeException(), isNull);
  });

  testWidgets('通知读失败显示重试状态，不冒充空列表', (t) async {
    var unavailable = true;
    final adapter = operationsAdapter(
        override: (r) => r.path == '/api/v1/operations/notifications' &&
                unavailable
            ? envelope({'code': 'TEMPORARY_FAILURE'}, status: 503, error: true)
            : null);
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await host(
        t,
        session,
        Scaffold(
            body: ListView(children: [
          NotificationPreview(session: session),
        ])));
    expect(find.text('当前身份暂无业务通知。'), findsNothing);
    expect(find.text('有新的对象留言'), findsNothing);
    unavailable = false;
    await t.tap(find.byTooltip('刷新通知'));
    await frames(t);
    expect(find.text('有新的对象留言'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
