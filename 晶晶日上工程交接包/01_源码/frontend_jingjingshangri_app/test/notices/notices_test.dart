import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/read_failure_widgets.dart';
import 'package:jingjingshangri_app/notices/notices_api.dart';
import 'package:jingjingshangri_app/notices/notices_models.dart';
import 'package:jingjingshangri_app/notices/notices_pages.dart';
import 'package:jingjingshangri_app/stock/v5_support.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../stock/v5_test_host.dart';

const noticeId = 'b2000000-0000-4000-8000-000000000001';
const submissionId = 'b2000000-0000-4000-8000-000000000002';
const consentId = 'b2000000-0000-4000-8000-000000000003';
const avatarId = 'b2000000-0000-4000-8000-000000000004';
Map<String, dynamic> noticeData(String type) => {
      'type': type,
      'title': '合成通告',
      'description': '明确业务说明',
      'city': '上海',
      'valid_from': '2026-10-22T00:00:00Z',
      'valid_until': '2027-10-28T00:00:00Z',
      'details': {
        for (final k in noticeDetailFields[type]!.keys) k: '明确本类型的条件'
      },
      'project_id': null,
      'accept_submissions': ['DRAMA', 'RECRUITMENT'].contains(type)
    };
Map<String, dynamic> noticeRecord({int version = 4, String status = 'SENT'}) =>
    {
      'id': submissionId,
      'kind': 'SUBMISSION',
      'owner_party_id': personId,
      'counterparty_id': orgId,
      'parent_id': noticeId,
      'created_by': accountId,
      'current_status': status,
      'object_version': version,
      'content_sha256': 'c' * 64,
      'data': {
        'submission': {
          'kind': 'ROLE',
          'target_party_id': orgId,
          'notice_id': noticeId,
          'person_id': personId,
          'avatar_id': avatarId,
          'consent_id': consentId,
          'purpose': '投递明确角色',
          'content': '本次单向意向',
          'role': '本角色',
          'material_asset_ids': []
        },
        'rule_id': noticeId,
        'expires_at': '2027-10-28T00:00:00Z',
        'review': null,
        'decision': null,
        'case_id': null
      },
      'chat_enabled': false,
      'next_action': 'WAIT_RECIPIENT',
      'order_id': null,
      'order_status': null,
      'expired': false
    };
void main() {
  for (final context in ['initial', 'input', 'pending']) {
    testWidgets('C07只替换无数据无本地输入无pending的首次读取：$context', (t) async {
      final waiting = Completer<void>();
      final a = FakeAccountAdapter(handler: (r) async {
        if (r.path == '/api/v1/notices/announcements' && r.method == 'POST') {
          return envelope({'code': 'SERVICE_UNAVAILABLE'},
              status: 503, error: true);
        }
        if (r.path == '/api/v1/notices/catalog') {
          await waiting.future;
          return envelope({'items': [], 'next_cursor': null});
        }
        return FakeAccountAdapter().defaultReply(r);
      });
      final s = (await t.runAsync(() => buyerSession(a)))!;
      if (context == 'pending') {
        await t.runAsync(() async {
          try {
            await s.write('POST', '/api/v1/notices/announcements',
                actingParty: s.partyId,
                body: {'notice': noticeData('RECRUITMENT')});
          } on AccountError {/* Retain the original uncertain fixture write. */}
        });
      }
      await host(
          t, s, NoticesPage(initialCity: context == 'input' ? '杭州' : ''));
      expect(find.byType(ReadLoadingContent),
          context == 'initial' ? findsOneWidget : findsNothing);
      expect(find.text('当前筛选没有仍有效的已审公开通告。'), findsNothing);
      if (context == 'input') {
        expect(
            t
                .widget<TextField>(find.widgetWithText(TextField, '城市（可留空）'))
                .controller!
                .text,
            '杭州');
      }
      if (context == 'pending') {
        expect(find.text('原操作结果待核对'), findsOneWidget);
        expect(s.noticesPending, hasLength(1));
      }
      waiting.complete();
      await frames(t);
      expect(find.byType(ReadLoadingContent), findsNothing);
      await reveal(t, find.text('当前筛选没有仍有效的已审公开通告。'));
      expect(t.takeException(), isNull);
    });
  }

  for (final status in [401, 403, 404]) {
    testWidgets('只有实际401展示C09并保留原记录分类，$status不混成网络或登录过期', (t) async {
      final a = FakeAccountAdapter(
          handler: (r) => r.path == '/api/v1/notices/records'
              ? envelope({
                  'code':
                      status == 401 ? 'AUTHENTICATION_REQUIRED' : 'NOT_FOUND'
                }, status: status, error: true)
              : FakeAccountAdapter().defaultReply(r));
      final s = (await t.runAsync(() => buyerSession(a)))!;
      await host(t, s, const NoticesPage(mode: 'records', kind: 'NOTICE'));
      if (status == 401) {
        expect(find.byType(ReadSessionExpiredPage), findsOneWidget);
        expect(find.text('回来，\n继续这个故事'), findsOneWidget);
        expect(
            t
                .widget<ReadSessionExpiredPage>(
                    find.byType(ReadSessionExpiredPage))
                .returnRoute,
            '/notices/records?kind=NOTICE');
        expect(s.isLoggedIn, isFalse);
        expect(s.account, isNull);
        await t.tap(find.byKey(const ValueKey('read-expired-login')));
        await frames(t);
        expect(t.widget<LoginPage>(find.byType(LoginPage)).returnRoute,
            '/notices/records?kind=NOTICE');
      } else {
        expect(find.byType(ReadSessionExpiredPage), findsNothing);
        expect(s.isLoggedIn, isTrue);
        expect(s.noticesAccessDenied, isTrue);
      }
      expect(
          a.requests.where((r) =>
              r.method == 'POST' && r.path.startsWith('/api/v1/notices/')),
          isEmpty);
      expect(t.takeException(), isNull);
    });
  }

  for (final mode in ['catalog', 'records']) {
    for (final failed in [true, false]) {
      testWidgets('$mode 读取${failed ? '失败不显示成功空态' : '成功空列表有明确空态'}', (t) async {
        final path =
            '/api/v1/notices/${mode == 'catalog' ? 'catalog' : 'records'}';
        final a = FakeAccountAdapter(
            handler: (r) => r.path == path
                ? (failed
                    ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                        status: 503, error: true)
                    : envelope({'items': [], 'next_cursor': null}))
                : FakeAccountAdapter().defaultReply(r));
        final s = (await t.runAsync(() => buyerSession(a)))!;
        await host(
            t, s, NoticesPage(mode: mode, kind: 'NOTICE', initialCity: '杭州'));
        final empty = mode == 'catalog' ? '当前筛选没有仍有效的已审公开通告。' : '当前没有本类型的可读记录。';
        expect(a.requests.where((r) => r.path == path), isNotEmpty);
        if (failed) {
          expect(find.byType(ReadFailureContent), findsOneWidget);
          expect(find.text('这页还没\n加载出来'), findsOneWidget);
          expect(find.text(empty), findsNothing);
          expect(find.textContaining('重读不会重复提交业务'), findsOneWidget);
          expect(find.textContaining('本次操作结果待核对'), findsNothing);
          expect(
              a.requests.where((r) =>
                  r.method == 'POST' && r.path.startsWith('/api/v1/notices/')),
              isEmpty);
          await t.tap(find.byKey(const ValueKey('read-failure-retry')));
          await frames(t);
          expect(find.byType(ReadFailureContent), findsOneWidget);
          await t.tap(find.byKey(const ValueKey('read-failure-back')));
          await frames(t);
          expect(find.byType(ReadFailureContent), findsNothing);
          expect(find.text(empty), findsNothing);
          if (mode == 'catalog') {
            expect(
                t
                    .widget<TextField>(
                        find.widgetWithText(TextField, '城市（可留空）'))
                    .controller!
                    .text,
                '杭州');
            expect(
                a.requests
                    .lastWhere((r) => r.path == path)
                    .queryParameters['city'],
                '杭州');
          } else {
            expect(
                t
                    .widget<DropdownButtonFormField<String>>(
                        find.byType(DropdownButtonFormField<String>))
                    .initialValue,
                'NOTICE');
          }
        } else {
          await reveal(t, find.text(empty));
          expect(find.text(empty), findsOneWidget);
        }
        expect(t.takeException(), isNull);
      });
    }
  }
  test('六类通告按各自字段，不把商单、活动强制变成到场表', () {
    for (final type in noticeTypes.keys) {
      final r = NoticePublic({
        'id': noticeId,
        'owner_party_id': type == 'OFFICIAL' ? null : orgId,
        'object_version': 1,
        'rule_id': noticeId,
        'notice': noticeData(type),
        'official': type == 'OFFICIAL',
        'chat_enabled': false
      });
      expect(r.notice['type'], type);
    }
    final bad = noticeData('COMMERCIAL');
    bad['details'] = {'venue': '错误字段'};
    expect(() => validateNotice(bad), throwsA(isA<AccountError>()));
  });
  test('资格只用服务器类型，普通实名不自行推出等级，官方不能普通发布', () {
    final d = {
      'rule_id': noticeId,
      'rule_sha256': 'c' * 64,
      'active': true,
      'level': 1,
      'types': ['COMMERCIAL', 'RECRUITMENT'],
      'source_ids': [],
      'reason': null
    };
    final e = NoticeEligibility(d, noticeId);
    expect(e.canPublish('EVENT'), false);
    expect(e.canPublish('COMMERCIAL'), true);
    d['types'] = ['OFFICIAL'];
    expect(() => NoticeEligibility(d, noticeId), throwsA(isA<AccountError>()));
  });
  test('私有投稿必须绑定本人或接收方，公开聊天标志不可放开', () {
    expect(() => NoticeRecord(noticeRecord(), invitedOrgId),
        throwsA(isA<AccountError>()));
    final d = noticeRecord();
    d['chat_enabled'] = true;
    expect(() => NoticeRecord(d, personId), throwsA(isA<AccountError>()));
  });
  test('未知撤回先读同一记录，再按原说明版本与同键恢复', () async {
    var posts = 0;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/close')) {
        posts++;
        return posts == 1
            ? envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                status: 503, error: true)
            : envelope(noticeRecord(version: 5, status: 'WITHDRAWN'));
      }
      if (r.path.endsWith('/records/$submissionId')) {
        return envelope(noticeRecord(version: 9));
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a),
        api = NoticesApi(s),
        suffix = '/records/$submissionId/close';
    await expectLater(
        api.post(suffix, {'reason': '原撤回说明'}, (d) => NoticeRecord(d, personId),
            version: 4),
        throwsA(isA<AccountError>()));
    await api.restoreOperation(api.path(suffix));
    final writes = a.requests.where((r) => r.path.endsWith('/close')).toList();
    expect(writes.length, 2);
    expect(writes.last.data, {'reason': '原撤回说明'});
    expect(writes.last.headers['If-Match'], '"4"');
    expect(writes.last.headers['Idempotency-Key'],
        writes.first.headers['Idempotency-Key']);
  });
  testWidgets('公开邀约缺安全引用时无编号手输和私有资料兜底', (t) async {
    final a = FakeAccountAdapter(),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const NoticesPage(mode: 'submit', kind: 'INVITATION'));
    expect(find.textContaining('暂不能从公开艺人主页发起新的邀约'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(a.requests.where((r) => r.path.startsWith('/api/v1/artists/')),
        isEmpty);
    expect(a.requests.where((r) => r.path == '/api/v1/notices/submissions'),
        isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets('412保留说明，最新版本必须读后明确重核再提交', (t) async {
    var posts = 0, reads = 0;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/close')) {
        posts++;
        return posts == 1
            ? envelope({'code': 'VERSION_CONFLICT'}, status: 412, error: true)
            : envelope(noticeRecord(version: 10, status: 'WITHDRAWN'));
      }
      if (r.path.endsWith('/records/$submissionId')) {
        return ++reads == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope(noticeRecord(version: 9));
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!, api = NoticesApi(s);
    await host(
        t,
        s,
        V5Frame(api: api, title: '本次撤回', children: [
          V5Form(
              api: api,
              title: '本次撤回',
              action: '确认本次撤回',
              suffix: '/records/$submissionId/close',
              version: 4,
              fields: const [V5Field('reason', '撤回说明')],
              buildBody: (v) => {'reason': v['reason']},
              parse: api.validateRecord,
              reload: () async => (await api.record(submissionId)).version)
        ]));
    await t.enterText(find.byType(TextFormField), '保留这份原说明');
    await t.tap(find.text('确认本次撤回'));
    await frames(t);
    await t.tap(find.text('确认办理'));
    await frames(t);
    expect(find.text('保留这份原说明'), findsOneWidget);
    expect(posts, 1);
    await reveal(t, find.text('读取最新状态并保留输入'));
    await t.tap(find.text('读取最新状态并保留输入'));
    await frames(t);
    expect(posts, 1);
    expect(find.text('我已核对最新记录，确认沿用本页输入办理'), findsNothing);
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '确认本次撤回'))
            .onPressed,
        isNull);
    await t.tap(find.text('读取最新状态并保留输入'));
    await frames(t);
    await reveal(t, find.text('我已核对最新记录，确认沿用本页输入办理'));
    await t.tap(find.text('我已核对最新记录，确认沿用本页输入办理'));
    await frames(t);
    await reveal(t, find.text('确认本次撤回'));
    await t.tap(find.text('确认本次撤回'));
    await frames(t);
    await t.tap(find.text('确认办理'));
    await frames(t);
    final last = a.requests.where((r) => r.path.endsWith('/close')).last;
    expect(last.headers['If-Match'], '"9"');
    expect(last.data, {'reason': '保留这份原说明'});
    expect(t.takeException(), isNull);
  });

  testWidgets('确认弹窗随身份切换清除私有说明并禁止继续写入', (t) async {
    final a = FakeAccountAdapter(),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await host(
        t,
        s,
        V5Gate(
            domain: 'notices',
            route: '/notices/records',
            builder: (session) {
              final api = NoticesApi(session);
              return V5Frame(api: api, title: '本次撤回', children: [
                V5Form(
                    api: api,
                    title: '本次撤回',
                    action: '确认本次撤回',
                    suffix: '/records/$submissionId/close',
                    fields: const [V5Field('reason', '本次私有说明')],
                    buildBody: (v) => {'reason': v['reason']},
                    parse: (_) {})
              ]);
            }));
    await t.enterText(find.byType(TextFormField), '仅原身份可见的私有说明');
    await t.tap(find.text('确认本次撤回'));
    await frames(t);
    expect(
        find.descendant(
            of: find.byType(AlertDialog), matching: find.text('仅原身份可见的私有说明')),
        findsOneWidget);
    s.select(identity(orgId));
    await frames(t);
    expect(
        find.descendant(
            of: find.byType(AlertDialog), matching: find.text('仅原身份可见的私有说明')),
        findsNothing);
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '确认办理'))
            .onPressed,
        isNull);
    expect(a.requests.where((r) => r.path.endsWith('/close')), isEmpty);
    expect(t.takeException(), isNull);
  });
}
