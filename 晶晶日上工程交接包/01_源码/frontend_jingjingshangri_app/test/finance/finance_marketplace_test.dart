import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/finance/finance_models.dart';
import 'package:jingjingshangri_app/trade/trade_models.dart';
import '../account/fake_account_api.dart';
import '../customization/customization_round2_api_test.dart' show storyTrade;
import '../navigation/app_navigation_test.dart' as nav;
import '../production/production_widgets_test.dart' show reveal;
import '../trade/trade_api_test.dart' show buyerSession;
import 'finance_fixtures.dart';

Map<String, dynamic> allocation() => {
      'model': 'V5_TWO_LAYER',
      'product_type': 'COMMERCIAL',
      'fee_base': 'NET_PAID',
      'platform_party_id': orgId,
      'platform_bps': 2200,
      'supplier_party_id': personId,
      'mcn_party_id': null,
      'mcn_supply_bps': 0,
      'referrer_party_id': null,
      'referral_bps': 0,
      'rounding': 'LARGEST_REMAINDER_PLATFORM_MAX_ONE_FEN',
    };
Map<String, dynamic> marketplaceAgreement() {
  final r = financeData('AGREEMENT');
  r['data']['rules']['lines'] = [
    {'line_id': 'service', 'allocation': allocation(), 'deductions': []}
  ];
  r['content_sha256'] = financeDigest(r['data']);
  return r;
}

void main() {
  test('人工自营定制保留固定份额，不接受误用商单两层分配', () {
    final valid = storyTrade('QUOTE');
    expect(TradeRecord.parse(valid, personId).kind, 'QUOTE');
    final wrong = storyTrade('QUOTE');
    wrong['data']['customization_finance']['rules']['lines'] = [
      {'line_id': 'production', 'allocation': allocation(), 'deductions': []}
    ];
    expect(() => TradeRecord.parse(wrong, personId), throwsA(isA<AccountError>()));
  });
  test('有效商单两层分配可读取，旧固定份额协议仍可读取', () {
    expect(FinanceRecord.parse(marketplaceAgreement(), party: personId).kind,
        'AGREEMENT');
    expect(FinanceRecord.parse(financeData('AGREEMENT'), party: personId).kind,
        'AGREEMENT');
  });
  test('两层分配拒绝重叠主体、无归因抽佣、非法费率和混用旧份额', () {
    for (final mutate in <void Function(Map<String, dynamic>)>[
      (a) => a['platform_party_id'] = personId,
      (a) => a['referral_bps'] = 100,
      (a) => a['mcn_supply_bps'] = 2000,
      (a) => a['platform_bps'] = -1,
      (a) => a['platform_bps'] = 2200.5,
      (a) => a['referrer_party_id'] = personId,
      (a) {
        a['referrer_party_id'] = invitationId;
        a['referral_bps'] = 2300;
      },
      (a) => a['unapproved_rate'] = 12,
    ]) {
      final r = marketplaceAgreement();
      final a = r['data']['rules']['lines'][0]['allocation'];
      mutate(a);
      r['content_sha256'] = financeDigest(r['data']);
      expect(() => FinanceRecord.parse(r, party: personId),
          throwsA(isA<AccountError>()));
    }
    final mixed = marketplaceAgreement();
    mixed['data']['rules']['lines'][0]['shares'] = [];
    mixed['content_sha256'] = financeDigest(mixed['data']);
    expect(() => FinanceRecord.parse(mixed, party: personId),
        throwsA(isA<AccountError>()));
  });
  testWidgets('本人结算展示平台总收入及供给收入，区别两层比例基数', (tester) async {
    final a = financeAdapter(
        override: (r) => r.path == '/api/v1/finance/records/$agreementKey'
            ? envelope(marketplaceAgreement())
            : null);
    final s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s,
        route: '/finance/record?recordId=$agreementKey');
    await nav.frames(tester);
    final tile = find.widgetWithText(ExpansionTile, '分配明细 · service');
    await reveal(tester, tile);
    await tester.tap(tile);
    await nav.frames(tester);
    expect(find.textContaining('平台总收入'), findsWidgets);
    expect(find.textContaining('供给侧收入'), findsWidgets);
    expect(find.text('22.00%'), findsOneWidget);
    expect(find.textContaining('当前没有机构抽成'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
