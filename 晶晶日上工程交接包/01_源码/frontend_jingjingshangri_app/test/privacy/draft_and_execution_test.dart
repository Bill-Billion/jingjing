import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/privacy/privacy_pages.dart';
import '../account/fake_account_api.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import '../stock/v5_test_host.dart';
import 'correction_confirmation_test.dart' show requestId, executionId;

void main() {
  testWidgets('申请结果未知时锁定原输入和返回，保留原请求待核对', (t) async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.method == 'POST' && r.path == '/api/v1/privacy/requests') {
        return envelope({'code': 'SERVICE_UNAVAILABLE'},
            status: 503, error: true);
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const PrivacyPage(view: 'new'));
    await reveal(t, find.text('账号展示信息'));
    await t.tap(find.text('账号展示信息'));
    await frames(t);
    final details = find.widgetWithText(TextField, '具体说明');
    await reveal(t, details);
    await t.enterText(details, '请查询本人展示信息');
    await reveal(t, find.text('提交本次申请'));
    await t.tap(find.text('提交本次申请'));
    await frames(t);
    await reveal(t, details);
    expect(t.widget<TextField>(details).enabled, false);
    expect(t.widget<TextField>(details).controller!.text, '请查询本人展示信息');
    await t.tap(find.byType(BackButton));
    await frames(t);
    expect(find.text('离开未提交的内容？'), findsNothing);
    expect(find.text('操作仍在处理或结果尚未确定，请先核对原请求。'), findsOneWidget);
    expect(
        a.requests.where(
            (r) => r.method == 'POST' && r.path == '/api/v1/privacy/requests'),
        hasLength(1));
    expect(t.takeException(), isNull);
  });

  testWidgets('个人信息申请未提交输入离页可返回继续，未产生申请', (t) async {
    final a = FakeAccountAdapter();
    final s = (await t.runAsync(() => communitySession(a)))!;
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: s,
        child: MaterialApp(
            home: const PrivacyPage(view: 'new'),
            routes: {'/my': (_) => const Scaffold(body: Text('我的主页'))})));
    await frames(t);
    final details = find.widgetWithText(TextField, '具体说明');
    await reveal(t, details);
    await t.enterText(details, '请核对我提交过的一份资料');
    await t.tap(find.byType(BackButton));
    await frames(t);
    expect(find.text('离开未提交的内容？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    expect(t.widget<TextField>(details).controller!.text, '请核对我提交过的一份资料');
    await t.tap(find.byType(BackButton));
    await frames(t);
    await t.tap(find.text('放弃并离开'));
    await frames(t);
    expect(find.text('我的主页'), findsOneWidget);
    expect(
        a.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('/api/v1/privacy/')),
        isEmpty);
    expect(t.takeException(), isNull);
  });

  testWidgets('删除方案有可读对象边界，未知对象不得盲目执行', (t) async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/privacy/requests/$requestId') {
        return envelope({
          'id': requestId,
          'account_id': accountId,
          'object_version': 2,
          'current_status': 'FOLLOW_UP',
          'request': {
            'type': 'DELETE',
            'scopes': ['CONTENT'],
            'details': '删除本人作品'
          },
          'events': []
        });
      }
      if (r.path.endsWith('/history')) return envelope({'responses': []});
      if (r.path.endsWith('/executions')) {
        return envelope({
          'items': [
            {
              'id': executionId,
              'request_id': requestId,
              'action': 'RESTRICT_CONTENT',
              'target_id': executionId,
              'object_version': 2,
              'current_status': 'APPROVED',
              'proposal_sha256': 'a' * 64,
              'job_status': null,
              'result': null
            }
          ],
          'next_cursor': null
        });
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const PrivacyPage(view: 'request', recordId: requestId));
    await reveal(t, find.text('一项作品内容（作品名称与限制范围待核对）'));
    expect(find.text('方案已审核，待本人核对确认'), findsOneWidget);
    expect(find.textContaining('暂不开放盲目执行'), findsOneWidget);
    expect(a.requests.where((r) => r.path.endsWith('/execute')), isEmpty);
    expect(t.takeException(), isNull);
  });
}
