import '../account/fake_account_api.dart';
import '../trade/trade_fixtures.dart' show orderId;

const walletRuleId = 'd1000000-0000-4000-8000-000000000001';
const walletAccountId = 'd1000000-0000-4000-8000-000000000002';
const walletEarningId = 'd1000000-0000-4000-8000-000000000003';
Map<String, dynamic> walletRuleBody() => {
      'version': 'wallet-test-v1',
      'terms': '按原订单实际净付、履约和售后核对；资金托管尚未接通。',
      'topup_threshold_minor': 30000,
      'membership_days': 365,
      'points_days': 365,
      'points_rounding': 'FLOOR_NET_PAID',
      'points_per_yuan': 10,
      'hold_minutes': 10,
      'growth_thresholds': [10000, 50000, 200000, 500000, 1000000],
      'aftercare_days': {
        'STOCK': 7,
        'CUSTOMIZATION': null,
        'AUDITION': null,
        'COMMERCIAL': null
      },
      'topup_limits': {
        'single_minor': 50000,
        'daily_minor': 100000,
        'monthly_minor': 300000,
        'cooling_minutes': 1
      },
      'free_awards': {
        'REGISTER': 100,
        'DAILY_CHECKIN': null,
        'REVIEW': null,
        'SHARE': null
      }
    };
Map<String, dynamic> walletRule() =>
    {'id': walletRuleId, 'content_sha256': 'c' * 64, 'rule': walletRuleBody()};
Map<String, dynamic> walletSummary() => {
      'account_id': walletAccountId,
      'rule_id': walletRuleId,
      'currency': 'CNY',
      'recorded_balance_minor': 2901,
      'available_balance_minor': 2801,
      'reserved_balance_minor': 100,
      'available_points': 91,
      'points_pending_reversal': 9,
      'points_actions_enabled': false,
      'points_block_reason': 'POINTS_REVERSAL_PENDING',
      'point_uses': {
        'vote_enabled': true,
        'redemption_enabled': false,
        'lottery_enabled': false
      },
      'qualifying_growth': 290,
      'membership': {
        'active': false,
        'level': 0,
        'attained_level': 1,
        'qualifying_growth': 290,
        'valid_until': null,
        'renewal_credit_minor': 0,
        'level_six_review_required': false,
        'reason': 'TOPUP_THRESHOLD_NOT_MET'
      },
      'custody': {'enabled': false, 'reason': 'CUSTODY_PROVIDER_NOT_CONNECTED'},
      'spending': {
        'enabled': false,
        'reason': 'CUSTODY_PROVIDER_NOT_CONNECTED'
      },
      'withdrawal_enabled': false,
      'transfer_enabled': false
    };
Map<String, dynamic> walletEarning({int version = 2}) => {
      'id': walletEarningId,
      'kind': 'EARNING',
      'owner_party_id': personId,
      'object_version': version,
      'content_sha256': 'c' * 64,
      'current_status': 'ISSUED',
      'data': {
        'source_kind': 'CONSUMPTION',
        'order_id': orderId,
        'category': 'STOCK',
        'points': 290,
        'reversed': 9,
        'growth_reversed': 9,
        'spent': 100,
        'expired': 90,
        'pending_shortfall': 0,
        'debt_offset': 0,
        'paid_minor': 2901,
        'refunded_minor': 90,
        'issued_at': '2026-10-22T02:00:00.000Z',
        'expires_at': '2027-10-22T02:00:00.000Z'
      }
    };
