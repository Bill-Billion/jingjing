import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/contract_six/contract_six_models.dart';
import 'package:jingjingshangri_app/contract_six/contract_six_pages.dart';
import 'package:jingjingshangri_app/engagement/community_support.dart';
import 'package:jingjingshangri_app/pages/login/login_destination.dart';
import '../account/fake_account_api.dart';
import 'community_safety_test.dart' show communitySession;
import '../stock/v5_test_host.dart';

const child = '66666666-6666-4666-8666-666666666666';
Map<String, dynamic> link(
        {String status = 'ACTIVE',
        String guardian = accountId,
        String kid = child}) =>
    {
      'id': invitationId,
      'kind': 'LINK',
      'guardian_account_id': guardian,
      'child_account_id': kid,
      'parent_id': null,
      'object_version': 3,
      'current_status': status,
      'data': {
        'valid_until': '2099-01-01T00:00:00Z',
        'rule': {
          'terms': {
            'daily_minutes': 30,
            'single_minor': 100,
            'daily_minor': 200
          }
        },
        'controls': {
          'enabled': true,
          'daily_minutes': 10,
          'single_minor': 100,
          'daily_minor': 200
        }
      }
    };
Future<void> choose(WidgetTester t, String label) async {
  final dropdown =
      find.widgetWithText(DropdownButtonFormField<String>, '本次办理事项');
  await reveal(t, dropdown);
  await t.tap(dropdown);
  await t.pumpAndSettle();
  await t.tap(find.text(label).last);
  await frames(t);
}

void main() {
  test(
      'guardian DTO does not require unrelated digest but rejects missing family identity',
      () {
    expect(guardianRecord(link())['kind'], 'LINK');
    expect(() => guardianRecord({...link(), 'child_account_id': null}),
        throwsA(isA<AccountError>()));
  });
  test(
      'new clocks use frozen source, historical receipt terms remain and no local time is invented',
      () {
    expect(
        acceptanceOrigin({'acceptance_policy': contract20261029},
            audition: false),
        contains('原订单下单'));
    expect(
        acceptanceOrigin({'acceptance_policy': contract20261029},
            audition: true),
        contains('交付审核通过'));
    expect(acceptanceOrigin({}, audition: false), contains('历史约定'));
    expect(
        closureClock({
          'request_id': invitationId,
          'object_version': 1,
          'status': 'NOT_VERIFIED'
        })['verified_at'],
        null);
  });
  test(
      'family role, expiry, self review and original refund stage are explicit',
      () {
    expect(guardianActionReason('controls', link(), child), isNotNull);
    expect(guardianActionReason('controls', link(), accountId), null);
    expect(guardianActionReason('review', link(status: 'IN_REVIEW'), accountId),
        isNotNull);
    expect(
        guardianActionReason('accept', link(status: 'INVITED'), child), null);
    expect(
        guardianActionReason(
            'refund',
            {...link(), 'kind': 'REFUND', 'current_status': 'IN_REVIEW'},
            accountId),
        isNotNull);
    expect(
        guardianActionReason(
            'refund',
            {...link(), 'kind': 'REFUND', 'current_status': 'APPROVED'},
            accountId),
        null);
    expect(
        () => validateGuardianControls({
              'enabled': true,
              'daily_minutes': 31,
              'single_minor': 100,
              'daily_minor': 200
            }, link()),
        throwsA(isA<AccountError>()));
  });
  test('login resumes only registered six pages without replaying commands',
      () {
    expect(loginDestination('/contract-six/guardians?id=$invitationId'),
        '/contract-six/guardians?id=$invitationId');
    expect(loginDestination('/contract-six/unknown'), '/my');
    expect(
        loginDestination('https://example.com/contract-six/guardians'), '/my');
  });
  testWidgets(
      'child cannot disable controls; account requests have no acting party',
      (t) async {
    final a = FakeAccountAdapter(
        handler: (r) => r.path == '/api/v1/guardians/records/$invitationId'
            ? envelope(link(guardian: child, kid: accountId))
            : FakeAccountAdapter().defaultReply(r));
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(
        t, s, const ContractSixPage(kind: 'guardians', id: invitationId));
    await choose(t, '调整或一键关闭使用');
    await reveal(t, find.text('提交本次明确办理'));
    expect(find.textContaining('只能由本关系监护人办理'), findsWidgets);
    final button = find.ancestor(
        of: find.text('提交本次明确办理'), matching: find.byType(FilledButton));
    if (button.evaluate().isNotEmpty) {
      expect(t.widget<FilledButton>(button).onPressed, null);
    }
    expect(
        a.requests
            .where((r) => r.path.startsWith('/api/v1/guardians/'))
            .every((r) => r.headers['X-Acting-Party'] == null),
        true);
    expect(a.requests.where((r) => r.method == 'PUT'), isEmpty);
    expect(t.takeException(), null);
  });
  testWidgets(
      'PUT lost response survives page replacement and reuses original key, version and body',
      (t) async {
    var writes = 0;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/guardians/records/$invitationId') {
        return envelope(link());
      }
      if (r.path.endsWith('/controls')) {
        writes++;
        if (writes == 1) {
          return envelope({'code': 'SERVICE_UNAVAILABLE'},
              status: 503, error: true);
        }
        return envelope({...link(), 'object_version': 4});
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(
        t, s, const ContractSixPage(kind: 'guardians', id: invitationId));
    await choose(t, '调整或一键关闭使用');
    await reveal(t, find.text('提交本次明确办理'));
    await t.tap(find.text('提交本次明确办理'));
    await frames(t);
    expect(writes, 1);
    final original = a.requests.where((r) => r.method == 'PUT').single;
    await t.pumpWidget(const SizedBox());
    await frames(t);
    await host(
        t, s, const ContractSixPage(kind: 'guardians', id: invitationId));
    await reveal(t, find.text('先核对当前记录'));
    await t.tap(find.text('先核对当前记录'));
    await frames(t);
    await reveal(t, find.text('使用原编号继续核对'));
    await t.tap(find.text('使用原编号继续核对'));
    await frames(t);
    expect(writes, 2);
    final retry = a.requests.where((r) => r.method == 'PUT').last;
    expect(
        retry.headers['Idempotency-Key'], original.headers['Idempotency-Key']);
    expect(retry.headers['If-Match'], original.headers['If-Match']);
    expect(retry.data, original.data);
    expect(retry.headers['X-Acting-Party'], null);
    expect(t.takeException(), null);
  });
  testWidgets(
      'expected minute expiry clears preview scope without locking family area',
      (t) async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/content')) {
        return envelope({'code': 'GUARDIAN_USAGE_SESSION_REQUIRED'},
            status: 403, error: true);
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await t.runAsync(() async {
      try {
        await CommunityApi(s, 'guardians').read('links/$invitationId/content');
        fail('expected denial');
      } on AccountError catch (e) {
        expect(e.code, 'GUARDIAN_USAGE_SESSION_REQUIRED');
      }
    });
    expect(s.isDomainDenied('/api/v1/guardians/'), false);
  });
  testWidgets('late family response cannot repopulate a changed identity',
      (t) async {
    final pending = Completer<Map<String, dynamic>>();
    var reads = 0;
    final a = FakeAccountAdapter(handler: (r) async {
      if (r.path == '/api/v1/guardians/records/$invitationId') {
        reads++;
        if (reads == 1) return envelope(await pending.future);
        return envelope({'code': 'GUARDIAN_NOT_FOUND'},
            status: 404, error: true);
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(
        t, s, const ContractSixPage(kind: 'guardians', id: invitationId));
    s.select(identity(orgId));
    await frames(t);
    pending.complete({
      ...link(),
      'data': {
        ...link()['data'],
        'relationship': 'SYNTHETIC OLD PRIVATE FAMILY'
      }
    });
    await frames(t);
    expect(find.textContaining('SYNTHETIC OLD PRIVATE FAMILY'), findsNothing);
    expect(reads, lessThan(4));
    expect(t.takeException(), null);
  });
  testWidgets(
      'unverified closure shows response date without fabricated execution countdown',
      (t) async {
    final a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/closure-clock')
            ? envelope({
                'request_id': invitationId,
                'object_version': 1,
                'status': 'NOT_VERIFIED',
                'response_due_on': '2026-11-23'
              })
            : FakeAccountAdapter().defaultReply(r));
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const ContractSixPage(kind: 'closure', id: invitationId));
    await reveal(t, find.textContaining('不以申请时间伪造15个工作日'));
    expect(find.text('2026-11-23'), findsOneWidget);
    expect(find.text('实际核验起点'), findsNothing);
    expect(t.takeException(), null);
  });
}
