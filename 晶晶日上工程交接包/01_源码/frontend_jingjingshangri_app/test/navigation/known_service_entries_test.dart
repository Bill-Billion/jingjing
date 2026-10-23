import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_page.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/privacy/privacy_pages.dart';
import 'package:jingjingshangri_app/support/support_pages.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart' as v5;
import '../trade/trade_api_test.dart' show buyerSession;

Future<void> host(WidgetTester t, AccountSession session, Widget page,
    void Function(String?) opened) async {
  t.view.physicalSize = const Size(390, 844);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.reset);
  await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
      value: session,
      child: MaterialApp(
          home: page,
          onGenerateRoute: (settings) {
            opened(settings.name);
            return MaterialPageRoute<void>(
                builder: (_) => const Scaffold(body: Text('原业务入口')));
          })));
  await v5.frames(t);
}

void main() {
  for (final entry in [
    ('隐私与使用偏好', '/privacy?view=preferences'),
    ('申请更正本人展示名', '/privacy?view=correction')
  ]) {
    testWidgets('账号页${entry.$1}进入本人服务，不自动修改资料', (t) async {
      final adapter = FakeAccountAdapter();
      final session = (await t.runAsync(() => buyerSession(adapter)))!;
      String? opened;
      await host(t, session, const AccountPage(), (route) => opened = route);
      await v5.reveal(t, find.text(entry.$1));
      await t.tap(find.text(entry.$1));
      await v5.frames(t);
      expect(opened, entry.$2);
      expect(
          adapter.requests.where((r) =>
              r.path.startsWith('/api/v1/privacy/') && r.method != 'GET'),
          isEmpty);
      expect(t.takeException(), isNull);
    });
  }

  for (final preset in [
    ('correction', 'CORRECT', '更正资料'),
    ('complaint', 'COMPLAINT', '投诉与保护申请')
  ]) {
    testWidgets('${preset.$1}预选本人申请种类，明确提交后才发原契约', (t) async {
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/privacy/requests' && r.method == 'POST') {
          return envelope({
            'id': invitationId,
            'account_id': accountId,
            'object_version': 1,
            'current_status': 'RECEIVED',
            'request': r.data,
            'events': []
          });
        }
        return adapter.defaultReply(r);
      });
      final session = (await t.runAsync(() => buyerSession(adapter)))!;
      String? opened;
      await host(
          t, session, PrivacyPage(view: preset.$1), (route) => opened = route);
      expect(find.text(preset.$3), findsOneWidget);
      expect(
          adapter.requests.where((r) => r.path.startsWith('/api/v1/privacy/')),
          isEmpty,
          reason: '打开预选申请不能自动读取错误列表或提交修改');
      if (preset.$1 == 'complaint') {
        await v5.reveal(t, find.text('账号展示信息'));
        await t.tap(find.text('账号展示信息'));
        await t.pump();
      }
      final details = find.byWidgetPredicate(
          (w) => w is TextField && w.decoration?.labelText == '具体说明');
      await v5.reveal(t, details);
      await t.enterText(details, '本次本人申请的具体情况。');
      await v5.reveal(t, find.text('提交本次申请'));
      await t.tap(find.text('提交本次申请'));
      await v5.frames(t);
      final sent = adapter.requests.singleWhere(
          (r) => r.path == '/api/v1/privacy/requests' && r.method == 'POST');
      expect(sent.data['type'], preset.$2);
      expect(sent.data['scopes'], ['PROFILE']);
      expect(sent.headers.containsKey('X-Acting-Party'), isFalse);
      expect(opened, '/privacy?view=request&recordId=$invitationId');
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('帮助的个人信息投诉进入限定原服务，一般反馈仍关闭', (t) async {
    final session =
        (await t.runAsync(() => buyerSession(FakeAccountAdapter())))!;
    String? opened;
    await host(t, session, const HelpFeedbackPage(), (route) => opened = route);
    await v5.reveal(t, find.text('提交反馈 · 暂未开放'));
    expect(
        t
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, '提交反馈 · 暂未开放'))
            .onPressed,
        isNull);
    await v5.reveal(t, find.text('个人信息投诉与保护'));
    await t.tap(find.text('个人信息投诉与保护'));
    await v5.frames(t);
    expect(opened, '/privacy?view=complaint');
    expect(t.takeException(), isNull);
  });
}
