import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/account/account_page.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/privacy/privacy_pages.dart';
import 'package:jingjingshangri_app/privacy/closure_reference.dart';
import '../account/fake_account_api.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import '../stock/v5_test_host.dart';

const requestId = 'd2000000-0000-4000-8000-000000000001';
const executionId = 'd2000000-0000-4000-8000-000000000002';
const policyId = 'd2000000-0000-4000-8000-000000000003';
const nextId = 'd2000000-0000-4000-8000-000000000004';

Map<String, dynamic> requestData(String type) => {
      'id': requestId,
      'account_id': accountId,
      'object_version': 2,
      'current_status': 'FOLLOW_UP',
      'request': {
        'type': type,
        'scopes': type == 'CORRECT' ? ['PROFILE'] : ['ALL'],
        'details': '本人提出申请'
      },
      'events': []
    };

FakeAccountAdapter adapterFor(String type,
    {bool mismatch = false,
    bool closure = false,
    bool wrongTarget = false,
    int executeStatus = 503,
    bool Function()? retired}) {
  late FakeAccountAdapter a;
  a = FakeAccountAdapter(handler: (r) {
    if (r.path == '/api/v1/privacy/requests/$requestId') {
      return envelope(requestData(type));
    }
    if (r.path.endsWith('/history')) return envelope({'responses': []});
    if (r.path.endsWith('/execution-policy-options')) {
      final action =
          type == 'CORRECT' ? 'PROFILE_CORRECTION' : 'ACCOUNT_CLOSURE';
      if (retired?.call() == true) {
        return envelope({
          'request_id': requestId,
          'action': action,
          'items': [],
          'next_cursor': null
        });
      }
      return envelope({
        'request_id': mismatch ? executionId : requestId,
        'action': action,
        'items': r.queryParameters['cursor'] == null
            ? []
            : [
                {
                  'id': policyId,
                  'version': 'v1',
                  'basis': '已审合成依据',
                  'contact_reference': '合成联系渠道',
                  'retention_rule_id': null
                }
              ],
        'next_cursor': r.queryParameters['cursor'] == null ? nextId : null
      });
    }
    if (r.path.endsWith('/file-options') ||
        r.path.endsWith('/model-assets') ||
        r.path.endsWith('/model-creations') ||
        r.path.endsWith('/actions')) {
      return envelope({'items': [], 'next_cursor': null});
    }
    if (r.path.endsWith('/executions') && r.method == 'GET') {
      return envelope({
        'items': closure
            ? [
                {
                  'id': executionId,
                  'request_id': requestId,
                  'action': 'ACCOUNT_CLOSURE',
                  'target_id': wrongTarget ? orgId : accountId,
                  'object_version': 2,
                  'current_status': 'APPROVED',
                  'proposal_sha256': 'a' * 64
                }
              ]
            : [],
        'next_cursor': null
      });
    }
    if (r.path.endsWith('/executions') && r.method == 'POST') {
      return envelope({'request_id': requestId, 'object_version': 1});
    }
    if (r.path.endsWith('/execute')) {
      return envelope({'code': 'SERVICE_UNAVAILABLE'},
          status: executeStatus, error: true);
    }
    return a.defaultReply(r);
  });
  return a;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    ClosureReferenceStore.resetQueueForTesting();
  });

  testWidgets('本人更正规则跨空页，提交只针对本人账号', (t) async {
    final a = adapterFor('CORRECT');
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const PrivacyPage(view: 'request', recordId: requestId));
    await reveal(t, find.text('提交本人的更正方案'));
    expect(
        a.requests
            .where((r) => r.path.endsWith('/execution-policy-options'))
            .length,
        2);
    await reveal(t, find.byKey(const ValueKey('privacy-account-policy')));
    await t.tap(find.byKey(const ValueKey('privacy-account-policy')));
    await frames(t);
    await t.tap(find.text('v1 · 已审合成依据').last);
    await frames(t);
    await reveal(t, find.byKey(const ValueKey('privacy-display-name')));
    await t.enterText(
        find.byKey(const ValueKey('privacy-display-name')), '新的展示名');
    await reveal(t, find.byKey(const ValueKey('privacy-plan-reason')));
    await t.enterText(
        find.byKey(const ValueKey('privacy-plan-reason')), '本人明确更正');
    await reveal(t, find.text('提交本人的更正方案'));
    await t.tap(find.text('提交本人的更正方案'));
    await frames(t);
    final sent = a.requests.singleWhere(
        (r) => r.method == 'POST' && r.path.endsWith('/executions'));
    expect(sent.data, {
      'action': 'PROFILE_CORRECTION',
      'target_id': accountId,
      'policy_rule_id': policyId,
      'details': {'display_name': '新的展示名', 'reason': '本人明确更正'}
    });
    expect(sent.headers['If-Match'], '"2"');
    expect(sent.headers.containsKey('X-Acting-Party'), false);
  });

  testWidgets('规则目录返回其他申请时拒绝选择且不提交', (t) async {
    final a = adapterFor('CORRECT', mismatch: true);
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const PrivacyPage(view: 'request', recordId: requestId));
    expect(find.text('已审合成依据'), findsNothing);
    expect(find.textContaining('适用处理依据读取失败'), findsOneWidget);
    expect(
        a.requests
            .where((r) => r.method == 'POST' && r.path.endsWith('/executions')),
        isEmpty);
  });

  testWidgets('注销响应未知保存申请编号，重开后可核对且不自动重发', (t) async {
    final a = adapterFor('CLOSE_ACCOUNT', closure: true);
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const PrivacyPage(view: 'request', recordId: requestId));
    await reveal(t, find.text('本人确认注销访问'));
    await t.tap(find.text('本人确认注销访问'));
    await frames(t);
    await t.tap(find.text('本人明确确认'));
    await frames(t);
    expect(a.requests.where((r) => r.path.endsWith('/execute')).length, 1);
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('jx.privacy.closure.references.v1');
    expect(raw, isNotNull);
    expect(jsonDecode(raw!).toString(), contains(requestId));
    expect(find.textContaining('结果尚未确认'), findsWidgets);
    await t.pumpWidget(const SizedBox.shrink());
    await host(t, s, const PrivacyPage(view: 'request', recordId: requestId));
    expect(find.text('使用原编号继续核对'), findsNothing);
    expect(find.textContaining('结果尚未确认'), findsWidgets);
    expect(a.requests.where((r) => r.path.endsWith('/execute')).length, 1);
    await t.pumpWidget(const SizedBox.shrink());
    final loggedOut = AccountSession(api: a.createApi());
    await host(t, loggedOut, const AccountPage());
    await t.tap(find.text('查看本机保存的注销申请编号'));
    await frames(t);
    expect(find.textContaining(requestId), findsWidgets);
    expect(find.textContaining('结果尚未确认'), findsWidgets);
    expect(a.requests.where((r) => r.path.endsWith('/execute')).length, 1);
  });

  testWidgets('注销后401保留原编号并清除登录，不假称成功', (t) async {
    final a = adapterFor('CLOSE_ACCOUNT', closure: true, executeStatus: 401);
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const PrivacyPage(view: 'request', recordId: requestId));
    await reveal(t, find.text('本人确认注销访问'));
    await t.tap(find.text('本人确认注销访问'));
    await frames(t);
    await t.tap(find.text('本人明确确认'));
    await frames(t);
    expect(s.isLoggedIn, false);
    await host(t, s, const AccountPage());
    await t.tap(find.text('查看本机保存的注销申请编号'));
    await frames(t);
    expect(find.textContaining(requestId), findsWidgets);
    expect(find.textContaining('结果尚未确认'), findsWidgets);
    expect(find.textContaining('资料已删除'), findsNothing);
    expect(a.requests.where((r) => r.path.endsWith('/execute')).length, 1);
  });

  test('本机未知结果按账号隔离，损坏记录不会被覆盖', () async {
    await ClosureReferenceStore.begin(accountId, requestId);
    expect(await ClosureReferenceStore.read(accountId: orgId), isEmpty);
    await expectLater(
        ClosureReferenceStore.begin(accountId, executionId), throwsStateError);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(ClosureReferenceStore.key, '{broken');
    await expectLater(
        ClosureReferenceStore.begin(orgId, executionId), throwsStateError);
    expect(prefs.getString(ClosureReferenceStore.key), '{broken');
  });

  testWidgets('返回的注销方案目标不是本人时拒绝发送', (t) async {
    final a = adapterFor('CLOSE_ACCOUNT', closure: true, wrongTarget: true);
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const PrivacyPage(view: 'request', recordId: requestId));
    await reveal(t, find.text('本人确认注销访问'));
    await t.tap(find.text('本人确认注销访问'));
    await frames(t);
    await t.tap(find.text('本人明确确认'));
    await frames(t);
    expect(a.requests.where((r) => r.path.endsWith('/execute')), isEmpty);
    expect(await ClosureReferenceStore.read(), isEmpty);
  });

  testWidgets('更换账号后迟到的旧账号规则不能写回', (t) async {
    final oldPolicy = Completer<ResponseBody>();
    final base = adapterFor('CORRECT');
    var logins = 0;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/auth/sessions') && r.method == 'POST') {
        logins++;
        if (logins > 1) {
          return envelope({
            'access_token': 'y' * 43,
            'token_type': 'Bearer',
            'account': {
              'id': orgId,
              'display_name': '另一合成账号',
              'allowed_actions': []
            }
          });
        }
      }
      if (r.path.endsWith('/execution-policy-options') && logins == 1) {
        return oldPolicy.future;
      }
      if (r.path.startsWith('/api/v1/privacy/') && logins > 1) {
        return envelope({'code': 'PRIVACY_REQUEST_NOT_FOUND'},
            status: 404, error: true);
      }
      return base.handler!(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const PrivacyPage(view: 'request', recordId: requestId));
    expect(a.requests.any((r) => r.path.endsWith('/execution-policy-options')),
        isTrue);
    await t.runAsync(() async {
      await s.logout();
      await s.login('13800000000', invitationId, '123456');
    });
    await frames(t);
    oldPolicy.complete(envelope({
      'request_id': requestId,
      'action': 'PROFILE_CORRECTION',
      'items': [
        {
          'id': policyId,
          'version': 'old',
          'basis': '旧账号迟到依据',
          'contact_reference': 'synthetic',
          'retention_rule_id': null
        }
      ],
      'next_cursor': null
    }));
    await frames(t);
    expect(find.textContaining('旧账号迟到依据'), findsNothing);
    expect(
        a.requests
            .where((r) => r.method == 'POST' && r.path.endsWith('/executions')),
        isEmpty);
  });

  testWidgets('多个本地申请编号可滚动查看，不遮住登录入口', (t) async {
    for (var i = 1; i <= 5; i++) {
      final id = i.toString().padLeft(12, '0');
      await ClosureReferenceStore.begin(
          'a0000000-0000-4000-8000-$id', 'b0000000-0000-4000-8000-$id');
    }
    final a = adapterFor('CLOSE_ACCOUNT');
    await host(t, AccountSession(api: a.createApi()), const AccountPage());
    await t.tap(find.text('查看本机保存的注销申请编号'));
    await frames(t);
    expect(t.takeException(), isNull);
    await reveal(t, find.text('手机号登录'));
    expect(find.text('手机号登录'), findsOneWidget);
  });

  testWidgets('规则失效后保留说明并要求重新选择，不发送旧方案', (t) async {
    var retired = false;
    final a = adapterFor('CORRECT', retired: () => retired);
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const PrivacyPage(view: 'request', recordId: requestId));
    await reveal(t, find.byKey(const ValueKey('privacy-account-policy')));
    await t.tap(find.byKey(const ValueKey('privacy-account-policy')));
    await frames(t);
    await t.tap(find.text('v1 · 已审合成依据').last);
    await frames(t);
    await reveal(t, find.byKey(const ValueKey('privacy-display-name')));
    await t.enterText(
        find.byKey(const ValueKey('privacy-display-name')), '本人新名字');
    await reveal(t, find.byKey(const ValueKey('privacy-plan-reason')));
    await t.enterText(
        find.byKey(const ValueKey('privacy-plan-reason')), '需要更正');
    retired = true;
    await reveal(t, find.text('提交本人的更正方案'));
    await t.tap(find.text('提交本人的更正方案'));
    await frames(t);
    expect(find.textContaining('处理依据已变化'), findsOneWidget);
    expect(
        a.requests
            .where((r) => r.method == 'POST' && r.path.endsWith('/executions')),
        isEmpty);
    retired = false;
    await reveal(t, find.text('重新读取当前记录'));
    await t.tap(find.text('重新读取当前记录'));
    await frames(t);
    await reveal(t, find.byKey(const ValueKey('privacy-display-name')));
    expect(
        t
            .widget<TextField>(
                find.byKey(const ValueKey('privacy-display-name')))
            .controller!
            .text,
        '本人新名字');
  });
}
