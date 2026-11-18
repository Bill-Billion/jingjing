import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/privacy/privacy_copy_panel.dart';
import '../account/fake_account_api.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import '../stock/v5_test_host.dart' show frames;

const rid = 'c1000000-0000-4000-8000-000000000001';
Map<String, dynamic> request([List<String> scopes = const ['ALL']]) => {
      'id': rid,
      'object_version': 1,
      'request': {'type': 'COPY', 'scopes': scopes}
    };
Map<String, dynamic> page(
        {String section = 'ACCOUNT',
        String? cursor,
        List<Object> items = const []}) =>
    {
      'section': section,
      'items': items,
      'next_cursor': cursor,
      'coverage': 'OWN_ACCOUNT_RECORDS_ONLY',
      'request_completion': 'NOT_CONFIRMED'
    };
void choose(WidgetTester t, String label, String value) {
  final f = find.byWidgetPredicate((w) =>
      w is DropdownButtonFormField<String> && w.decoration.labelText == label);
  t.widget<DropdownButtonFormField<String>>(f).onChanged!(value);
}

Future<void> open(WidgetTester t, FakeAccountAdapter a,
    {List<String> scopes = const ['ALL']}) async {
  final s = (await t.runAsync(() => communitySession(a)))!;
  t.view.devicePixelRatio = 1;
  t.view.physicalSize = const Size(1000, 2600);
  addTearDown(t.view.resetDevicePixelRatio);
  addTearDown(t.view.resetPhysicalSize);
  await t.pumpWidget(MaterialApp(
      home: Scaffold(
          body: SingleChildScrollView(
              child: PrivacyCopyPanel(session: s, request: request(scopes))))));
  await t.tap(find.text('账户、交易与故事历史副本'));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('本人同申请分类分页保留空页游标，不发送机构身份', (t) async {
    late FakeAccountAdapter a;
    var calls = 0;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/account-data')) {
        calls++;
        expect(r.path, '/api/v1/privacy/requests/$rid/account-data');
        expect(r.headers.containsKey('X-Acting-Party'), false);
        expect(r.queryParameters['section'], 'ACCOUNT');
        return envelope(page(
            cursor: calls == 1 ? 'cursor-one' : null,
            items: calls == 1
                ? []
                : [
                    {'id': accountId, 'display_name': '本人范围'}
                  ]));
      }
      return a.defaultReply(r);
    });
    await open(t, a);
    choose(t, '选择资料分类', 'account:ACCOUNT');
    await t.pumpAndSettle();
    await t.tap(find.text('读取此类第一页'));
    await frames(t);
    expect(find.text('尚有下一页，本类别未读完。'), findsOneWidget);
    await t.tap(find.text('继续读取此类下一页'));
    await frames(t);
    expect(calls, 2);
    expect(a.requests.last.queryParameters['cursor'], 'cursor-one');
    expect(find.text('第 2 页 · 1 条'), findsOneWidget);
    choose(t, '选择资料分类', 'account:PREFERENCES');
    await t.pumpAndSettle();
    expect(find.text('第 2 页 · 1 条'), findsNothing);
    expect(t.takeException(), isNull);
  });
  for (final status in [403, 503]) {
    testWidgets('再次读取失败 $status 清除拒绝内容或保留可重试状态', (t) async {
      late FakeAccountAdapter a;
      var calls = 0;
      a = FakeAccountAdapter(handler: (r) {
        if (r.path.endsWith('/account-data')) {
          calls++;
          return calls == 1
              ? envelope(page(items: [
                  {'id': accountId, 'display_name': '本人私有内容'}
                ]))
              : envelope({
                  'code':
                      status == 403 ? 'ACCESS_DENIED' : 'SERVICE_UNAVAILABLE'
                }, status: status, error: true);
        }
        return a.defaultReply(r);
      });
      await open(t, a);
      choose(t, '选择资料分类', 'account:ACCOUNT');
      await t.pumpAndSettle();
      await t.tap(find.text('读取此类第一页'));
      await frames(t);
      expect(find.text('第 1 页 · 1 条'), findsOneWidget);
      await t.tap(find.text('读取此类第一页'));
      await frames(t);
      expect(find.text('第 1 页 · 1 条'),
          status == 403 ? findsNothing : findsOneWidget);
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('申请范围过滤类别且损坏回复不能显示为空记录', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/account-data')
            ? envelope(page(section: 'WALLET'))
            : a.defaultReply(r));
    await open(t, a, scopes: ['PROFILE']);
    final field =
        t.widget<DropdownButton<String>>(find.byType(DropdownButton<String>));
    expect(field.items!.any((x) => x.value == 'trade:ORDERS'), false);
    expect(field.items!.any((x) => x.value == 'story:SUBMISSIONS'), false);
    choose(t, '选择资料分类', 'account:ACCOUNT');
    await t.pumpAndSettle();
    await t.tap(find.text('读取此类第一页'));
    await frames(t);
    expect(find.textContaining('返回内容未通过核对'), findsOneWidget);
    expect(find.text('第 1 页 · 0 条'), findsNothing);
  });
  testWidgets('读取中退出会话，迟到回复不能恢复私有资料', (t) async {
    final delayed = Completer<ResponseBody>();
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/account-data')
            ? delayed.future
            : a.defaultReply(r));
    await open(t, a);
    final s = t.widget<PrivacyCopyPanel>(find.byType(PrivacyCopyPanel)).session;
    choose(t, '选择资料分类', 'account:ACCOUNT');
    await t.pumpAndSettle();
    await t.tap(find.text('读取此类第一页'));
    await t.pump();
    await t.runAsync(() => s.logout());
    delayed.complete(envelope(page(items: [
      {'id': accountId, 'display_name': '不应返回的私有资料'}
    ])));
    await frames(t);
    expect(find.text('第 1 页 · 1 条'), findsNothing);
    expect(find.text('不应返回的私有资料'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
