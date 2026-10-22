import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/engagement/community_support.dart';
import 'package:jingjingshangri_app/engagement/engagement_pages.dart';
import '../account/fake_account_api.dart';

Future<AccountSession> communitySession(FakeAccountAdapter adapter) async {
  final s = AccountSession(api: adapter.createApi());
  await s.login('13800000000', invitationId, '123456');
  s.select(identity(personId));
  return s;
}

Map<String, dynamic> validCommunityRecord(
    {String kind = 'GRANT', int version = 2}) {
  final body = {'reason': '这次明确的原说明', 'amount_minor': 101};
  return {
    'id': invitationId,
    'kind': kind,
    'owner_party_id': personId,
    'object_version': version,
    'current_status': 'AVAILABLE',
    'data': body,
    'content_sha256': communityDigest(body)
  };
}

class RecoveryHarness extends StatefulWidget {
  const RecoveryHarness({super.key, required this.session});
  final AccountSession session;
  @override
  State<RecoveryHarness> createState() => RecoveryHarnessState();
}

class RecoveryHarnessState extends CommunityPageState<RecoveryHarness> {
  @override
  AccountSession get session => widget.session;
  @override
  String get domain => 'redemption';
  @override
  void clearPrivate() {}
  @override
  Future<void> load() async {}
  @override
  Future<void> reconcilePending() async {
    await api.read('grants/$invitationId');
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      body:
          ListView(children: [...feedback, Text(enabled ? '可提交' : '先核对原请求')]));
}

void main() {
  test('整数分及百分比输入精确，不接受指数或多余小数', () {
    expect(communityMinor('100.01', '金额'), 10001);
    expect(communityMinor('0', '金额', zero: true), 0);
    for (final x in ['1e3', '1.001', '-1', '']) {
      expect(() => communityMinor(x, '金额'), throwsA(isA<AccountError>()));
    }
    expect(communityMoney(101), '¥1.01');
  });
  test('业务原文校验不依赖键顺序，内容改动必须拒绝并保留未知结果', () {
    final r = validCommunityRecord();
    expect(communityRecord(r)['id'], invitationId);
    (r['data'] as Map)['amount_minor'] = 102;
    expect(
        () => communityRecord(r),
        throwsA(
            isA<AccountError>().having((e) => e.uncertain, 'uncertain', true)));
    expect(
        communityDigest({
          'z': 1,
          'a': [
            2,
            {'b': 3}
          ]
        }),
        communityDigest({
          'a': [
            2,
            {'b': 3}
          ],
          'z': 1
        }));
  });
  test('隐私只用本人账号，机构身份不附主体头且0版偏好可保存', () async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.startsWith('/api/v1/privacy/')
            ? envelope({'ok': true})
            : a.defaultReply(r));
    final s = await communitySession(a);
    s.select(identity(orgId));
    final api = CommunityApi(s, 'privacy');
    await api.read('preferences');
    await api.write(
        'preferences',
        {
          'personalization': false,
          'marketing': false,
          'rest_reminder_minutes': 0
        },
        method: 'PATCH',
        version: 0);
    final req =
        a.requests.where((r) => r.path.startsWith('/api/v1/privacy/')).toList();
    expect(req.every((r) => !r.headers.containsKey('X-Acting-Party')), true);
    expect(req.last.headers['If-Match'], '"0"');
  });
  for (final domain in [
    'engagement',
    'cocreation',
    'redemption',
    'privacy',
    'projects'
  ]) {
    test('$domain身份切换后拒绝迟到私有回复', () async {
      final start = Completer<void>(), reply = Completer<ResponseBody>();
      late FakeAccountAdapter a;
      a = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/$domain/private') {
          start.complete();
          return reply.future;
        }
        return a.defaultReply(r);
      });
      final s = await communitySession(a),
          api = CommunityApi(s, domain),
          pending = api.read('private');
      await start.future;
      s.select(identity(orgId));
      reply.complete(envelope({'private_story': '不可显示的旧故事'}));
      await expectLater(
          pending,
          throwsA(isA<AccountError>()
              .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    });
  }
  test('MCN成员只展示明确受派订单，不渲染服务器混入的全机构关系和总额', () {
    Map<String, dynamic> assignment(String account, String order) {
      final r = validCommunityRecord(kind: 'ASSIGNMENT');
      r['data'] = {
        'account_id': account,
        'order_id': order,
        'booking_id': null,
        'person_id': personId
      };
      r['content_sha256'] = communityDigest(r['data']);
      return r;
    }

    final d = {
      'assignments': [
        assignment(accountId, personId),
        assignment(orgId, orgId)
      ],
      'orders': [
        {
          'order_id': personId,
          'mcn_accrual_minor': 101,
          'environment': 'PRODUCTION'
        },
        {
          'order_id': orgId,
          'mcn_accrual_minor': 99999,
          'environment': 'PRODUCTION'
        }
      ],
      'relations': [
        {'private_terms': '其他艺人的关系条款'}
      ],
      'total_accrual_minor': 100100
    };
    final scoped = mcnDashboardForAccount(d, accountId, owner: false);
    expect(scoped['relations'], isEmpty);
    expect(scoped['orders'], hasLength(1));
    expect(scoped['total_accrual_minor'], 101);
    expect(scoped['staff_scope_limited'], true);
    expect(
        mcnDashboardForAccount(d, accountId,
            owner: true)['total_accrual_minor'],
        100100);
  });
  testWidgets('日期与时间须由本人选择，本地显示，提交ISO且不默认填期限', (tester) async {
    final c = TextEditingController();
    var changes = 0;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Builder(
                builder: (context) => communityDateField(context, c, '委托截止',
                    onChanged: () => changes++)))));
    expect(c.text, isEmpty);
    expect(find.text('选择日期和时间'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.calendar_today_outlined));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(DateTime.tryParse(c.text)?.isUtc, true);
    expect(changes, 1);
    expect(find.text(c.text), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    c.dispose();
  });
  testWidgets('离开后再进入仍先GET核对，再以原body/version/key恢复，损坏回复不丢原请求', (tester) async {
    var writes = 0;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/redemption/grants/$invitationId/checkout') {
        writes++;
        if (writes == 1) {
          return envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
              status: 503, error: true);
        }
        if (writes == 2) {
          final damaged = validCommunityRecord();
          damaged['content_sha256'] = '0' * 64;
          return envelope(damaged);
        }
        return envelope(validCommunityRecord());
      }
      if (r.path == '/api/v1/redemption/grants/$invitationId') {
        return envelope(validCommunityRecord());
      }
      return a.defaultReply(r);
    });
    final s = (await tester.runAsync(() => communitySession(a)))!,
        api = CommunityApi(s, 'redemption');
    await tester.runAsync(() => expectLater(
        api.write('grants/$invitationId/checkout', {'quote_id': personId},
            version: 7),
        throwsA(isA<AccountError>())));
    final original = a.requests.last;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: s, child: MaterialApp(home: RecoveryHarness(session: s))));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 35)));
    await tester.pumpAndSettle();
    expect(find.text('先核对原请求'), findsOneWidget);
    await tester.tap(find.text('先核对当前记录'));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 35)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('使用原编号继续核对'));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 35)));
    await tester.pumpAndSettle();
    expect(find.text('先核对原请求'), findsOneWidget);
    await tester.tap(find.text('先核对当前记录'));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 35)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('使用原编号继续核对'));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 35)));
    await tester.pumpAndSettle();
    final mutations = a.requests
        .where((r) => r.method == 'POST' && r.path.contains('/redemption/'))
        .toList();
    expect(mutations, hasLength(3));
    expect(mutations.last.data, original.data);
    expect(mutations.last.headers['If-Match'], '"7"');
    expect(mutations.last.headers['Idempotency-Key'],
        original.headers['Idempotency-Key']);
    final reads = a.requests
        .where((r) => r.path.endsWith('/grants/$invitationId'))
        .toList();
    expect(reads, hasLength(2));
    expect(find.text('可提交'), findsOneWidget);
  });
}
