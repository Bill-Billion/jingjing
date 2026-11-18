import 'stock_eligibility_fixtures.dart';
import 'dart:async';
import 'package:dio/dio.dart';
import 'package:jingjingshangri_app/stock/stock_api.dart';
import 'package:jingjingshangri_app/stock/stock_models.dart';
import 'package:jingjingshangri_app/stock/v5_support.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/stock/stock_listing_form.dart';
import '../account/fake_account_api.dart';
import '../artists/artists_fixtures.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import 'supply_preflight_test.dart' show choosePerson;
import 'v5_test_host.dart';

void main() {
  test('严格核对艺人与身份，三项状态矛盾或未知政策不采用', () {
    expect(StockEligibility(eligibility(), personKey, personId).eligible, true);
    expect(
        StockEligibility(eligibility(approved: false), personKey, personId)
            .eligible,
        false);
    for (final change in <void Function(Map<String, dynamic>)>[
      (r) => r['person_id'] = avatarKey,
      (r) => r['seller_party_id'] = orgId,
      (r) => r['manual_review_approved'] = false,
      (r) => r['eligible'] = false,
      (r) => r['policy_version'] = 'OLD',
      (r) => r['blocking_reasons'] = ['UNKNOWN']
    ]) {
      final row = eligibility();
      change(row);
      expect(() => StockEligibility(row, personKey, personId),
          throwsA(isA<AccountError>()));
    }
  });
  test('不同艺人独立读取，当前身份改变后旧资格响应无效', () async {
    final pending = Completer<ResponseBody>();
    var blocked = false;
    final a = artistAdapter(override: (r) {
      if (r.path == '/api/v1/stock/seller-eligibility')
        return blocked
            ? pending.future
            : envelope(eligibility(
                person: r.queryParameters['person_id'],
                approved: r.queryParameters['person_id'] == personKey));
      return null;
    });
    final s = await communitySession(a), api = StockApi(s);
    expect((await api.sellerEligibility(personKey)).eligible, true);
    expect((await api.sellerEligibility(avatarKey)).eligible, false);
    blocked = true;
    final read = api.sellerEligibility(personKey);
    final expected = expectLater(read, throwsA(isA<AccountError>()));
    await Future<void>.delayed(Duration.zero);
    s.select(identity(orgId));
    pending.complete(envelope(eligibility()));
    await expected;
  });
  testWidgets('L1艺人明确显示人工审核缺项，不从等级推断上架资格', (t) async {
    final a = artistAdapter(override: (r) {
      if (r.path == '/api/v1/stock/seller-eligibility')
        return envelope(eligibility(approved: false));
      if (r.path == '/api/v1/stock/sales-publications' ||
          r.path == '/api/v1/stock/participant-options')
        return envelope({'items': [], 'next_cursor': null});
      return null;
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, StockListingForm(session: s));
    await choosePerson(t, '卖方具体真人');
    expect(find.textContaining('主角光环人工审核：未满足'), findsWidgets);
    expect(find.textContaining('不要求先购买'), findsNothing);
    expect(
        a.requests.where((r) => r.path == '/api/v1/stock/seller-eligibility'),
        isNotEmpty);
    expect(
        a.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('/api/v1/stock/')),
        isEmpty);
  });
  testWidgets('资格刷新变为待审立即禁新提交，切身份清旧状态且读取有界', (t) async {
    var approved = true, reads = 0;
    final a = artistAdapter(override: (r) {
      if (r.path == '/api/v1/stock/seller-eligibility') {
        reads++;
        return envelope(eligibility(approved: approved));
      }
      if (r.path == '/api/v1/stock/sales-publications')
        return envelope({
          'items': [
            {
              'id': listingKey,
              'spec_id': specKey,
              'rule_id': recordKey,
              'terms': '合成说明',
              'spec_title': '测试商品',
              'unit_minor': 10000,
              'title': '合成销售',
              'rule_version': '1'
            }
          ],
          'next_cursor': null
        });
      if (r.path == '/api/v1/stock/participant-options')
        return envelope({'items': [], 'next_cursor': null});
      return null;
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, StockListingForm(session: s));
    await choosePerson(t, '卖方具体真人');
    final count = find.byType(DropdownButtonFormField<int>);
    await reveal(t, count);
    await t.tap(count);
    await frames(t);
    await t.tap(find.text('无可识别人物').last);
    await frames(t);
    expect(t.widget<V5Form>(find.byType(V5Form)).canSubmit, true);
    approved = false;
    await reveal(t, find.text('重新核对上架资格'));
    await t.tap(find.text('重新核对上架资格'));
    await frames(t);
    expect(t.widget<V5Form>(find.byType(V5Form)).canSubmit, false);
    await reveal(t, find.textContaining('主角光环人工审核：未满足'));
    expect(find.textContaining('主角光环人工审核：未满足'), findsOneWidget);
    expect(reads, 2);
    for (var i = 0; i < 4; i++) {
      await frames(t);
    }
    expect(reads, 2);
    s.select(identity(orgId));
    await frames(t);
    expect(find.byType(V5Form), findsNothing);
    expect(find.textContaining('主角光环人工审核：未满足'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
