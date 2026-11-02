import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/trade/trade_models.dart';
import 'package:jingjingshangri_app/finance/finance_models.dart';
import '../account/fake_account_api.dart';
import '../contracts/contract_fixtures.dart';
import 'trade_fixtures.dart';

void main() {
  test(
      'Old and new marketplace rounding snapshots remain readable; unknown fails closed',
      () {
    final quote = quoteData();
    final allocation = <String, dynamic>{
      'model': 'V5_TWO_LAYER',
      'product_type': 'STOCK_VIDEO',
      'fee_base': 'NET_PAID',
      'platform_party_id': personId,
      'supplier_party_id': orgId,
      'platform_bps': 1800,
      'mcn_party_id': null,
      'mcn_supply_bps': 0,
      'referrer_party_id': null,
      'referral_bps': 0,
    };
    quote['marketplace_finance'] = {
      'allocation': allocation,
      'captured_at': '2026-11-02T00:00:00Z',
      'rule_snapshot': {
        'content': ruleData(),
        'current_status': 'EFFECTIVE',
        'effective_at': '2026-10-01T00:00:00Z'
      },
      'relation_snapshot': null,
    };
    for (final rounding in [
      'HALF_UP_PLATFORM_REMAINDER',
      'LARGEST_REMAINDER_PLATFORM_MAX_ONE_FEN'
    ]) {
      allocation['rounding'] = rounding;
      expect(() => validateTradeQuoteData(quote), returnsNormally);
      expect(allocation['rounding'], rounding);
    }
    allocation['rounding'] = 'UNKNOWN';
    expect(() => validateTradeQuoteData(quote), throwsA(isA<AccountError>()));
  });
  test('Historical anomaly explains the payment stop without rewriting income',
      () {
    const error = AccountError(409, 'FINANCE_ROUNDING_REVIEW_REQUIRED');
    expect(tradeError(error), contains('旧账保留'));
    expect(financeError(error), contains('等待人工复核'));
  });
}
