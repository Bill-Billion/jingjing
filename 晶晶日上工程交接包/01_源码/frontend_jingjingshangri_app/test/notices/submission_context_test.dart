import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/notices/notices_api.dart';
import 'package:jingjingshangri_app/notices/notices_pages.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../stock/v5_test_host.dart';
import 'notices_test.dart' show noticeId, submissionId, consentId, avatarId;

void main() {
  test('首次代投只读本次通告授权，空页仍按游标继续，不读取历史投稿', () async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/submission-options')) {
        return envelope({
          'notice_id': noticeId,
          'rule_id': noticeId,
          'items': r.queryParameters['cursor'] == null
              ? []
              : [
                  {
                    'person_id': personId,
                    'avatar_id': avatarId,
                    'consent_id': consentId,
                    'target_party_id': orgId,
                    'valid_from': '2026-01-01T00:00:00Z',
                    'valid_until': '2099-01-01T00:00:00Z'
                  }
                ],
          'next_cursor':
              r.queryParameters['cursor'] == null ? submissionId : null
        });
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a);
    final rows = await NoticesApi(s).submissionOptions(personId, noticeId);
    expect(rows.single['consent_id'], consentId);
    expect(a.requests.where((r) => r.path.endsWith('/submission-options')),
        hasLength(2));
    expect(a.requests.where((r) => r.path.endsWith('/records')), isEmpty);
    s.dispose();
  });
  testWidgets('从公开艺人开始新邀约，明确选规则和填写用途后提交原公开引用', (t) async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/notices/rules')) {
        return envelope({
          'items': [
            {
              'id': noticeId,
              'content_sha256': 'a' * 64,
              'rule': {
                'version': '已审测试规则',
                'terms': '测试规则',
                'submission_days': 30,
                'minimum_levels': {
                  'EVENT': 3,
                  'COMMERCIAL': 1,
                  'RECRUITMENT': 1,
                  'OFFICIAL': null
                }
              }
            }
          ],
          'next_cursor': null
        });
      }
      if (r.path.endsWith('/invitation-context')) {
        return envelope({
          'rule_id': noticeId,
          'listing_id': submissionId,
          'person_id': personId,
          'avatar_id': avatarId,
          'consent_id': consentId,
          'target_party_id': orgId,
          'display_name': '本次公开艺人'
        });
      }
      if (r.path.endsWith('/submissions') && r.method == 'POST') {
        return envelope({'code': 'SERVICE_UNAVAILABLE'},
            status: 503, error: true);
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(
        t,
        s,
        const NoticesPage(
            mode: 'submit', kind: 'INVITATION', listingId: submissionId));
    await reveal(t, find.byType(DropdownButtonFormField<String>));
    await t.tap(find.byType(DropdownButtonFormField<String>));
    await frames(t);
    await t.tap(find.text('已审测试规则').last);
    await frames(t);
    expect(find.text('本次公开艺人'), findsOneWidget);
    for (final pair in [
      ['本次真实用途', '本次项目合作'],
      ['本次意向内容', '希望沟通明确项目的表演合作']
    ]) {
      final field = find.widgetWithText(TextFormField, pair[0]);
      await reveal(t, field);
      await t.enterText(field, pair[1]);
    }
    await reveal(t, find.text('提交本次邀约审核'));
    await t.tap(find.text('提交本次邀约审核'));
    await frames(t);
    await t.tap(find.text('确认办理'));
    await frames(t);
    final posts = a.requests
        .where((r) => r.path.endsWith('/submissions') && r.method == 'POST')
        .toList();
    expect(posts, hasLength(1));
    expect(posts.single.data['submission']['source_listing_id'], submissionId);
    expect(posts.single.data['submission']['avatar_id'], avatarId);
    expect(posts.single.data['submission']['target_party_id'], orgId);
    expect(posts.single.data['rule_id'], noticeId);
    expect(t.takeException(), isNull);
  });
}
