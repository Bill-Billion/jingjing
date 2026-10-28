import '../stock/v5_support.dart';

const walletKinds = {
  'RECHARGE': '充值批次',
  'CASH_SPEND': '消费与现金预留',
  'CASH_REFUND': '原充值批次退款',
  'CASH_RECONCILIATION': '资金对账观察',
  'EARNING': '晶钻批次、到期与冲回',
  'POINT_HOLD': '晶钻预留与使用',
  'LEVEL_REVIEW': '六级独立资格审核'
};
const walletStates = {
  'ACTIVE': '个人账本已开立',
  'PENDING': '等待履约与售后条件',
  'ISSUED': '晶钻已记入原批次',
  'REVERSAL_PENDING': '退款晶钻待由未来奖励抵扣',
  'HELD': '预留中',
  'UNKNOWN': '结果待核对，保留原预留',
  'SPENT': '实际消费已核实',
  'RELEASED': '原预留已释放',
  'EXPIRED': '原预留已到期释放',
  'SUCCEEDED': '渠道事实已核实',
  'FAILED': '明确失败',
  'CANCELLED': '已取消',
  'IN_REVIEW': '等待独立审核',
  'APPROVED': '独立审核通过',
  'REJECTED': '审核未通过',
  'MATCHED': '双方账目一致',
  'DIFFERENCE': '账目差异待核对'
};

class WalletRule {
  WalletRule(dynamic d) : raw = v5Map(d) {
    v5Require(v5Id(raw['id']) && v5Hash(raw['content_sha256']));
    rule = v5Map(raw['rule']);
    validate(rule);
  }
  final Map<String, dynamic> raw;
  late final Map<String, dynamic> rule;
  String get id => raw['id'];
  String get hash => raw['content_sha256'];
  static void validate(Map<String, dynamic> r) {
    v5Require(r['version'] is String &&
        r['terms'] is String &&
        v5Int(r['topup_threshold_minor'], min: 1) &&
        r['membership_days'] == 365 &&
        r['points_days'] == 365 &&
        r['points_rounding'] == 'FLOOR_NET_PAID' &&
        v5Int(r['points_per_yuan'], min: 1, max: 1000) &&
        v5Int(r['hold_minutes'], min: 1, max: 1440));
    final tiers = v5Rows(r['growth_thresholds'], max: 5);
    v5Require(tiers.length == 5 && tiers.every((n) => v5Int(n, min: 1)));
    for (var i = 1; i < tiers.length; i++) {
      v5Require(tiers[i] > tiers[i - 1]);
    }
    final after = v5Map(r['aftercare_days']);
    for (final k in ['STOCK', 'CUSTOMIZATION', 'AUDITION', 'COMMERCIAL']) {
      v5Require(after.containsKey(k) &&
          (after[k] == null || v5Int(after[k], max: 365)));
    }
    final limits = v5Map(r['topup_limits']);
    for (final k in ['single_minor', 'daily_minor', 'monthly_minor']) {
      v5Require(v5Int(limits[k], min: 1));
    }
    v5Require(v5Int(limits['cooling_minutes'], max: 43200) &&
        limits['single_minor'] <= limits['daily_minor'] &&
        limits['daily_minor'] <= limits['monthly_minor']);
    if (r['free_awards'] != null) {
      final free = v5Map(r['free_awards']);
      for (final k in ['REGISTER', 'DAILY_CHECKIN', 'REVIEW', 'SHARE']) {
        v5Require(free.containsKey(k) &&
            (free[k] == null || v5Int(free[k], min: 1, max: 1000000)));
      }
    }
  }
}

class WalletSummary {
  WalletSummary(dynamic d) : raw = v5Map(d) {
    v5Require(v5Id(raw['account_id']) &&
        v5Id(raw['rule_id']) &&
        raw['currency'] == 'CNY');
    for (final k in [
      'recorded_balance_minor',
      'reserved_balance_minor',
      'available_balance_minor',
      'available_points',
      'points_pending_reversal',
      'qualifying_growth'
    ]) {
      v5Require(v5Int(raw[k]));
    }
    v5Require(raw['recorded_balance_minor'] ==
            raw['reserved_balance_minor'] + raw['available_balance_minor'] &&
        raw['withdrawal_enabled'] == false &&
        raw['transfer_enabled'] == false &&
        raw['custody']?['enabled'] == false &&
        raw['spending']?['enabled'] == false &&
        raw['custody']?['reason'] == 'CUSTODY_PROVIDER_NOT_CONNECTED' &&
        raw['spending']?['reason'] == 'CUSTODY_PROVIDER_NOT_CONNECTED');
    if (raw['cumulative_points'] != null) {
      final total = v5Map(raw['cumulative_points']);
      v5Require(total['version'] == 'NET_ISSUED_V1' &&
          v5Int(total['issued']) &&
          v5Int(total['withdrawn']) &&
          v5Int(total['net_issued']) &&
          total['issued'] == total['withdrawn'] + total['net_issued']);
    }
    final uses = v5Map(raw['point_uses']);
    v5Require(uses['vote_enabled'] is bool &&
        uses['redemption_enabled'] == false &&
        uses['lottery_enabled'] == false);
    membership = v5Map(raw['membership']);
    v5Require(membership['active'] is bool &&
        v5Int(membership['level'], max: 6) &&
        v5Int(membership['attained_level'], min: 1, max: 6) &&
        membership['qualifying_growth'] == raw['qualifying_growth'] &&
        v5Int(membership['renewal_credit_minor']) &&
        membership['level_six_review_required'] is bool &&
        (membership['valid_until'] == null ||
            v5Date(membership['valid_until'])) &&
        (membership['active'] == true
            ? v5Int(membership['level'], min: 1, max: 6) &&
                v5Date(membership['valid_until'])
            : membership['level'] == 0));
  }
  final Map<String, dynamic> raw;
  late final Map<String, dynamic> membership;
}

class WalletRecord {
  WalletRecord(dynamic d, String owner, {String? kind}) : raw = v5Map(d) {
    v5Require(v5Id(raw['id']) &&
        raw['owner_party_id'] == owner &&
        (kind == null || raw['kind'] == kind) &&
        [...walletKinds.keys, 'ACCOUNT'].contains(raw['kind']) &&
        v5Int(raw['object_version'], min: 1) &&
        v5Hash(raw['content_sha256']) &&
        walletStates.containsKey(raw['current_status']));
    data = v5Map(raw['data']);
    if (this.kind == 'ACCOUNT') {
      v5Require(v5Id(data['rule_id']) &&
          v5Hash(data['rule_sha256']) &&
          v5Date(data['opened_at']));
      WalletRule.validate(v5Map(data['rule']));
    }
    if (this.kind == 'EARNING') {
      for (final k in [
        'points',
        'reversed',
        'growth_reversed',
        'spent',
        'expired',
        'pending_shortfall',
        'debt_offset',
        'paid_minor',
        'refunded_minor'
      ]) {
        v5Require(v5Int(data[k]));
      }
      v5Require(['FREE', 'CONSUMPTION'].contains(data['source_kind']) &&
          data['points'] >=
              data['reversed'] +
                  data['spent'] +
                  data['expired'] +
                  data['debt_offset'] &&
          data['growth_reversed'] <= data['points'] &&
          (data['expires_at'] == null || v5Date(data['expires_at'])));
      if (data['source_kind'] == 'CONSUMPTION') {
        v5Require(v5Id(data['order_id']));
      } else {
        v5Require(['REGISTER', 'DAILY_CHECKIN', 'REVIEW', 'SHARE']
            .contains(data['event_kind']));
      }
    }
    if (['RECHARGE', 'CASH_SPEND', 'CASH_REFUND'].contains(this.kind)) {
      v5Require(
          v5Int(data['amount_minor'], min: 1) && data['currency'] == 'CNY');
    }
    if (this.kind == 'CASH_SPEND') {
      v5Require(v5Id(data['order_id']) && v5Id(data['payment_id']));
      for (final a in v5Rows(data['allocations'])) {
        final x = v5Map(a);
        v5Require(v5Id(x['recharge_id']) &&
            v5Int(x['amount_minor'], min: 1) &&
            v5Int(x['returned_minor']) &&
            x['returned_minor'] <= x['amount_minor']);
      }
    }
    if (this.kind == 'CASH_RECONCILIATION') {
      v5Require(v5Int(data['local_available_minor']) &&
          v5Int(data['provider_available_minor']) &&
          data['meaning'] == 'OBSERVATION_ONLY_NO_BALANCE_ADJUSTMENT');
    }
    if (this.kind == 'POINT_HOLD') {
      v5Require(v5Int(data['points'], min: 1) &&
          ['VOTE', 'REDEMPTION', 'LOTTERY'].contains(data['purpose']) &&
          data['reference'] is String &&
          v5Date(data['expires_at']));
      var total = 0;
      for (final raw in v5Rows(data['allocations'], max: 10000)) {
        final allocation = v5Map(raw);
        v5Require(
            v5Id(allocation['lot_id']) && v5Int(allocation['points'], min: 1));
        total += allocation['points'] as int;
      }
      v5Require(total == data['points']);
    }
    if (this.kind == 'LEVEL_REVIEW') {
      v5Require(v5Date(data['valid_from']) &&
          v5Date(data['valid_until']) &&
          data['terms'] is String);
      v5Ids(data['evidence_asset_ids'], max: 10);
    }
  }
  final Map<String, dynamic> raw;
  late final Map<String, dynamic> data;
  String get id => raw['id'];
  String get kind => raw['kind'];
  String get status => raw['current_status'];
}
