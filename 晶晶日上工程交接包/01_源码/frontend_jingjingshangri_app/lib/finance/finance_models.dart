import '../account/account_api.dart';
import '../contracts/contract_api.dart';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../projects/project_models.dart' show projectInstant;
import '../trade/trade_models.dart' show tradeMoney;

// Rules retain arbitrary JSON terms; canonical numbers match the server's JSON.
Object? _financeCanonical(dynamic v) {
  if (v is Map) {
    financeRequire(v.keys.every((k) => k is String));
    final keys = v.keys.cast<String>().toList()..sort();
    return {for (final k in keys) k: _financeCanonical(v[k])};
  }
  if (v is List) return v.map(_financeCanonical).toList();
  if (v is num) {
    financeRequire(
        v.isFinite && v.abs() <= 9007199254740991 && !(v == 0 && v.isNegative));
    return v == v.toInt() ? v.toInt() : v;
  }
  financeRequire(v == null || v is String || v is bool);
  return v;
}

String financeDigest(dynamic v) =>
    sha256.convert(utf8.encode(jsonEncode(_financeCanonical(v)))).toString();

String financeMoneyText(int minor) =>
    minor < 0 ? '-${tradeMoney(-minor)}' : tradeMoney(minor);

const financeKinds = {
  'AGREEMENT': '结算约定',
  'SETTLEMENT': '结算单',
  'PAYOUT': '付款申请',
  'PAYOUT_EVIDENCE': '实付凭据',
  'DISPUTE': '异议',
  'RESPONSE': '异议回复',
  'ADJUSTMENT': '调整',
  'RECONCILIATION': '渠道对账',
  'STATEMENT': '发行账单',
  'RECEIPT': '实际收款'
};
const financeCategories = {
  'QUALITY': '质量',
  'REFUND': '退款',
  'RIGHTS_DEFECT': '权利瑕疵',
  'EXCLUSIVITY': '独家性',
  'SETTLEMENT': '结算',
  'OTHER': '其他'
};
const financeStatuses = {
  'IN_REVIEW': '独立审核中',
  'APPROVED': '审核通过',
  'REJECTED': '审核未通过',
  'SUPERSEDED': '已被新约定替代',
  'REQUESTED': '申请待审核',
  'CANCELLED': '申请已取消',
  'PAID': '真实付款已核实',
  'FAILED': '付款失败已核实',
  'RETURNED': '款项退回已核实',
  'OPEN': '处理中',
  'ACTION_REQUIRED': '有处理要求，补救待核实',
  'RESOLVED': '异议已解决',
  'RECORDED': '回复已保存',
  'MATCHED': '账单比对一致',
  'DIFFERENCES': '账单存在差异'
};
const financeRoles = {
  'SUPPLIER': '供给方',
  'PLATFORM': '平台',
  'MCN': 'MCN',
  'RIGHTSHOLDER': '权利方',
  'PRODUCER': '制作方',
  'PARTICIPANT': '参与方'
};
void financeRequire(bool v) {
  if (!v) {
    throw const AccountError(502, 'INVALID_FINANCE_RESPONSE', uncertain: true);
  }
}

bool financeId(dynamic v) => v is String && isContractId(v);
bool financeHash(dynamic v) =>
    v is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(v);
bool financeText(dynamic v, [int max = 8000]) =>
    v is String && v.trim().isNotEmpty && v.length <= max;
bool financeMoney(dynamic v, {bool positive = false, bool signed = false}) =>
    v is int &&
    v >=
        (signed
            ? -900000000000
            : positive
                ? 1
                : 0) &&
    v <= 900000000000;
Map<String, dynamic> financeMap(dynamic v,
    {List<String>? required, List<String> optional = const []}) {
  financeRequire(v is Map && v.keys.every((k) => k is String));
  final d = Map<String, dynamic>.from(v as Map);
  if (required != null) {
    financeRequire(required.every(d.containsKey) &&
        d.keys.every((k) => [...required, ...optional].contains(k)));
  }
  return d;
}

List<dynamic> financeList(dynamic v, {int min = 0, int max = 100}) {
  financeRequire(v is List && v.length >= min && v.length <= max);
  return List.from(v as List);
}

List<String> financeIds(dynamic v, {int min = 0}) {
  final a = financeList(v, min: min);
  financeRequire(a.every(financeId) && a.toSet().length == a.length);
  return a.cast<String>();
}

void financeReview(dynamic v) {
  if (v == null) return;
  final d = financeMap(v, required: [
    'decision',
    'reason',
    'verification',
    'reviewer_account_id',
    'method'
  ]);
  final checks = financeMap(d['verification'], required: [
    'parties_verified',
    'contract_verified',
    'amount_verified',
    'evidence_verified'
  ]);
  financeRequire(['APPROVED', 'REJECTED'].contains(d['decision']) &&
      financeText(d['reason'], 4000) &&
      financeId(d['reviewer_account_id']) &&
      d['method'] == 'INDEPENDENT_MANUAL_EVIDENCE_REVIEW' &&
      checks.values.every((v) => v is bool));
}

void financeRules(dynamic v) {
  final d = financeMap(v, required: [
    'version',
    'settlement_at',
    'release_condition',
    'terms',
    'lines'
  ]);
  financeRequire(financeText(d['version'], 128) &&
      projectInstant(d['settlement_at']) &&
      ['RECEIVED', 'DELIVERY_ACCEPTED'].contains(d['release_condition']) &&
      financeText(d['terms']));
  final lines = financeList(d['lines'], min: 1, max: 30);
  final ids = <String>{};
  for (final l in lines) {
    final x = financeMap(l, required: ['line_id', 'shares', 'deductions']);
    financeRequire(financeText(x['line_id'], 128) && ids.add(x['line_id']));
    final parties = <String>{};
    var bps = 0;
    for (final s in financeList(x['shares'], min: 1, max: 30)) {
      final z = financeMap(s, required: ['party_id', 'bps', 'role']);
      financeRequire(financeId(z['party_id']) &&
          parties.add(z['party_id']) &&
          z['bps'] is int &&
          z['bps'] >= 0 &&
          z['bps'] <= 10000 &&
          financeRoles.containsKey(z['role']));
      bps += z['bps'] as int;
    }
    financeRequire(bps == 10000);
    for (final f in financeList(x['deductions'], max: 30)) {
      final z = financeMap(f, required: [
        'category',
        'party_id',
        'amount_minor',
        'basis',
        'refund_behavior'
      ]);
      financeRequire(
          ['CHANNEL_FEE', 'TAX', 'DISCOUNT', 'OTHER'].contains(z['category']) &&
              parties.contains(z['party_id']) &&
              financeMoney(z['amount_minor']) &&
              financeText(z['basis'], 2000) &&
              ['RETAIN', 'PROPORTIONAL'].contains(z['refund_behavior']));
    }
  }
}

void financeReferences(dynamic v) {
  for (final ref in financeList(v, max: 10000)) {
    final r = financeMap(ref,
        required: ref is Map && ref.containsKey('record_id')
            ? [
                'id',
                'record_id',
                'direction',
                'provider',
                'environment',
                'external_reference',
                'amount_minor',
                'sha256'
              ]
            : ['id', 'direction', 'sha256', 'amount_minor']);
    financeRequire(financeId(r['id']) &&
        financeHash(r['sha256']) &&
        financeMoney(r['amount_minor'], signed: true));
    if (r.containsKey('record_id')) {
      financeRequire(financeId(r['record_id']) &&
          ['RECEIPT', 'REFUND'].contains(r['direction']) &&
          ['APPLE', 'ALIPAY'].contains(r['provider']) &&
          ['SANDBOX', 'PRODUCTION'].contains(r['environment']) &&
          financeText(r['external_reference'], 128) &&
          r['amount_minor'] >= 0);
    } else {
      financeRequire(['STATEMENT', 'RECEIPT'].contains(r['direction']));
    }
  }
}

List<Map<String, dynamic>> financeBalanceRows(dynamic v,
    {bool current = false}) {
  final result = <Map<String, dynamic>>[];
  for (final row in financeList(v)) {
    final d = financeMap(row, required: [
      'party_id',
      'accrued_minor',
      'adjustment_minor',
      'paid_minor',
      'balance_minor',
      if (current) ...[
        'expected_accrued_minor',
        'available_minor',
        'recovery_due_minor',
        'reason_code',
        'meaning'
      ]
    ]);
    financeRequire(financeId(d['party_id']) &&
        ['accrued_minor', 'adjustment_minor', 'paid_minor', 'balance_minor']
            .every((k) => financeMoney(d[k], signed: true)) &&
        d['balance_minor'] ==
            d['accrued_minor'] + d['adjustment_minor'] - d['paid_minor']);
    if (current) {
      financeRequire(financeMoney(d['expected_accrued_minor'], signed: true) &&
          financeMoney(d['available_minor']) &&
          financeMoney(d['recovery_due_minor']) &&
          (d['reason_code'] == null || financeText(d['reason_code'], 128)) &&
          ['MERCHANT_RETAINED_NOT_TRANSFER', 'PAYABLE_NOT_YET_TRANSFERRED']
              .contains(d['meaning']));
    }
    result.add(d);
  }
  financeRequire(
      result.map((x) => x['party_id']).toSet().length == result.length);
  return result;
}

class FinanceRecord {
  FinanceRecord._(this.raw);
  final Map<String, dynamic> raw;
  String get id => raw['id'];
  String get kind => raw['kind'];
  String get owner => raw['owner_party_id'];
  String? get agreementId => raw['agreement_id'];
  String get status => raw['current_status'];
  int get version => raw['object_version'];
  String get hash => raw['content_sha256'];
  Map<String, dynamic> get data => raw['data'];
  static FinanceRecord parse(dynamic v,
      {String? id, String? kind, String? agreementId, String? party}) {
    final r = financeMap(v, required: [
      'id',
      'kind',
      'agreement_id',
      'owner_party_id',
      'created_by',
      'current_status',
      'object_version',
      'content_sha256',
      'data'
    ]);
    financeRequire(financeId(r['id']) &&
        (id == null || r['id'] == id) &&
        financeKinds.containsKey(r['kind']) &&
        (kind == null || r['kind'] == kind) &&
        financeId(r['owner_party_id']) &&
        financeId(r['created_by']) &&
        r['object_version'] is int &&
        r['object_version'] > 0 &&
        financeHash(r['content_sha256']) &&
        (r['kind'] == 'AGREEMENT'
            ? r['agreement_id'] == null
            : financeId(r['agreement_id'])) &&
        (agreementId == null || r['agreement_id'] == agreementId));
    final k = r['kind'] as String, d = financeMap(r['data']);
    final common = ['IN_REVIEW', 'APPROVED', 'REJECTED'];
    financeRequire((k == 'AGREEMENT'
            ? [...common, 'SUPERSEDED']
            : k == 'PAYOUT'
                ? [
                    'REQUESTED',
                    'CANCELLED',
                    'APPROVED',
                    'REJECTED',
                    'PAID',
                    'FAILED',
                    'RETURNED'
                  ]
                : k == 'DISPUTE'
                    ? ['OPEN', 'ACTION_REQUIRED', 'RESOLVED']
                    : k == 'RESPONSE'
                        ? ['RECORDED']
                        : k == 'RECONCILIATION'
                            ? ['MATCHED', 'DIFFERENCES']
                            : common)
        .contains(r['current_status']));
    switch (k) {
      case 'AGREEMENT':
        financeMap(d, required: [
          'previous_agreement_id',
          'source_type',
          'source_id',
          'source_sha256',
          'environment',
          'currency',
          'rule_id',
          'rule_snapshot',
          'rules',
          'parties',
          'evidence_asset_id',
          'review'
        ]);
        financeRequire((d['previous_agreement_id'] == null ||
                financeId(d['previous_agreement_id'])) &&
            ['ORDER', 'RELEASE'].contains(d['source_type']) &&
            financeId(d['source_id']) &&
            financeHash(d['source_sha256']) &&
            ['SANDBOX', 'PRODUCTION'].contains(d['environment']) &&
            d['currency'] == 'CNY' &&
            financeId(d['rule_id']) &&
            financeId(d['evidence_asset_id']));
        financeRules(d['rules']);
        financeIds(d['parties'], min: 1);
        final rule = financeMap(d['rule_snapshot'], required: [
          'id',
          'terms',
          'version',
          'rule_key',
          'content_sha256',
          'format_version'
        ]);
        financeRequire(rule['id'] == d['rule_id'] &&
            financeHash(rule['content_sha256']) &&
            financeText(rule['version']) &&
            financeText(rule['rule_key']) &&
            financeText(rule['format_version']));
        financeMap(rule['terms']);
      case 'SETTLEMENT':
        financeMap(d, required: [
          'period_reference',
          'note',
          'facts_sha256',
          'source_references',
          'received_minor',
          'receivable_minor',
          'balances',
          'rule_sha256',
          'review'
        ]);
        financeRequire(financeText(d['period_reference']) &&
            financeText(d['note']) &&
            financeHash(d['facts_sha256']) &&
            financeHash(d['rule_sha256']) &&
            financeMoney(d['received_minor']) &&
            financeMoney(d['receivable_minor'], signed: true));
        financeReferences(d['source_references']);
        final rows = financeBalanceRows(d['balances']);
        if (party != null && party != r['owner_party_id']) {
          financeRequire(rows.every((x) => x['party_id'] == party));
        }
      case 'PAYOUT':
        financeMap(d, required: [
          'recipient_party_id',
          'amount_minor',
          'destination_asset_id',
          'destination_owner_party_id',
          'note',
          'method',
          'review'
        ], optional: [
          'cancel_reason',
          'last_evidence_id'
        ]);
        financeRequire(financeId(d['recipient_party_id']) &&
            d['recipient_party_id'] == r['owner_party_id'] &&
            financeMoney(d['amount_minor'], positive: true) &&
            financeId(d['destination_asset_id']) &&
            financeId(d['destination_owner_party_id']) &&
            financeText(d['note']) &&
            d['method'] == 'EXTERNAL_MANUAL_PAYMENT' &&
            (!d.containsKey('cancel_reason') ||
                financeText(d['cancel_reason'], 2000)) &&
            (!d.containsKey('last_evidence_id') ||
                financeId(d['last_evidence_id'])));
      case 'PAYOUT_EVIDENCE':
        financeMap(d, required: [
          'payout_id',
          'recipient_party_id',
          'outcome',
          'amount_minor',
          'external_reference',
          'occurred_at',
          'evidence_asset_id',
          'note',
          'review',
          'method'
        ]);
        financeRequire(financeId(d['payout_id']) &&
            financeId(d['recipient_party_id']) &&
            ['PAID', 'FAILED', 'RETURNED'].contains(d['outcome']) &&
            financeMoney(d['amount_minor'], positive: true) &&
            financeText(d['external_reference']) &&
            projectInstant(d['occurred_at']) &&
            financeId(d['evidence_asset_id']) &&
            financeText(d['note']) &&
            d['method'] == 'EXTERNAL_MANUAL_EVIDENCE');
      case 'DISPUTE':
        financeMap(d, required: [
          'about_record_id',
          'category',
          'reason',
          'evidence_asset_ids',
          'decision_history'
        ]);
        financeRequire(financeId(d['about_record_id']) &&
            financeCategories.containsKey(d['category']) &&
            financeText(d['reason']));
        financeIds(d['evidence_asset_ids'], min: 1);
        for (final h in financeList(d['decision_history'], max: 10000)) {
          final x = financeMap(h, required: [
            'decision',
            'reason',
            'action_record_id',
            'reviewer_account_id'
          ]);
          financeRequire(['ACTION_REQUIRED', 'RESUME', 'REMEDIED']
                  .contains(x['decision']) &&
              financeText(x['reason']) &&
              (x['action_record_id'] == null ||
                  financeId(x['action_record_id'])) &&
              financeId(x['reviewer_account_id']) &&
              (x['decision'] == 'REMEDIED'
                  ? x['action_record_id'] != null
                  : x['action_record_id'] == null));
        }
      case 'RESPONSE':
        financeMap(d,
            required: ['dispute_id', 'message', 'evidence_asset_ids']);
        financeRequire(financeId(d['dispute_id']) && financeText(d['message']));
        financeIds(d['evidence_asset_ids']);
      case 'ADJUSTMENT':
        financeMap(d,
            required: ['entries', 'reason', 'evidence_asset_id', 'review']);
        financeRequire(
            financeText(d['reason']) && financeId(d['evidence_asset_id']));
        var sum = 0;
        for (final e in financeList(d['entries'], min: 2, max: 30)) {
          final x = financeMap(e, required: ['party_id', 'amount_minor']);
          financeRequire(financeId(x['party_id']) &&
              financeMoney(x['amount_minor'], signed: true));
          sum += x['amount_minor'] as int;
        }
        financeRequire(sum == 0);
      case 'RECONCILIATION':
        financeMap(d, required: [
          'provider',
          'environment',
          'external_reference',
          'items',
          'facts_sha256',
          'differences',
          'evidence_asset_id',
          'meaning'
        ]);
        financeRequire(['APPLE', 'ALIPAY'].contains(d['provider']) &&
            ['SANDBOX', 'PRODUCTION'].contains(d['environment']) &&
            financeText(d['external_reference']) &&
            financeHash(d['facts_sha256']) &&
            financeId(d['evidence_asset_id']) &&
            d['meaning'] == 'COMPARISON_ONLY_NOT_A_PAYMENT_OR_MANUAL_APPROVAL');
        for (final item in financeList(d['items'], max: 200)) {
          final x = financeMap(item, required: [
            'record_id',
            'direction',
            'external_reference',
            'amount_minor'
          ]);
          financeRequire(financeId(x['record_id']) &&
              ['RECEIPT', 'REFUND'].contains(x['direction']) &&
              financeText(x['external_reference'], 128) &&
              financeMoney(x['amount_minor']));
        }
        for (final item in financeList(d['differences'], max: 10000)) {
          final x = financeMap(item, required: ['record_id', 'reason']);
          financeRequire(financeId(x['record_id']) &&
              [
                'MISSING_IN_EXTERNAL_STATEMENT',
                'FACT_MISMATCH',
                'UNKNOWN_PLATFORM_FACT'
              ].contains(x['reason']));
        }
      case 'STATEMENT':
        financeMap(d, required: [
          'external_reference',
          'period_start',
          'period_end',
          'gross_minor',
          'refund_minor',
          'channel_fee_minor',
          'tax_minor',
          'net_minor',
          'direction',
          'original_statement_id',
          'evidence_asset_id',
          'note',
          'environment',
          'review'
        ]);
        financeRequire(financeText(d['external_reference'], 128) &&
            projectInstant(d['period_start']) &&
            projectInstant(d['period_end']) &&
            ['gross_minor', 'refund_minor', 'channel_fee_minor', 'tax_minor']
                .every((k) => financeMoney(d[k])) &&
            financeMoney(d['net_minor'], signed: true) &&
            ['CREDIT', 'DEBIT'].contains(d['direction']) &&
            (d['original_statement_id'] == null ||
                financeId(d['original_statement_id'])) &&
            financeId(d['evidence_asset_id']) &&
            financeText(d['note'], 4000) &&
            ['SANDBOX', 'PRODUCTION'].contains(d['environment']));
        final net = d['gross_minor'] -
            d['refund_minor'] -
            d['channel_fee_minor'] -
            d['tax_minor'];
        financeRequire(net >= 0 &&
            d['net_minor'] == (d['direction'] == 'DEBIT' ? -net : net));
      case 'RECEIPT':
        financeMap(d, required: [
          'statement_id',
          'amount_minor',
          'external_reference',
          'occurred_at',
          'evidence_asset_id',
          'note',
          'environment',
          'review'
        ]);
        financeRequire(financeId(d['statement_id']) &&
            financeMoney(d['amount_minor'], positive: true) &&
            financeText(d['external_reference']) &&
            projectInstant(d['occurred_at']) &&
            financeId(d['evidence_asset_id']) &&
            financeText(d['note']) &&
            ['SANDBOX', 'PRODUCTION'].contains(d['environment']));
    }
    if (d.containsKey('review')) financeReview(d['review']);
    // A nonpayer SETTLEMENT is a server projection. Its original immutable
    // hash intentionally differs from the JSON containing only this party.
    if (k != 'SETTLEMENT' || party == r['owner_party_id']) {
      financeRequire(financeDigest(d) == r['content_sha256']);
    }
    return FinanceRecord._(r);
  }
}

String financeError(AccountError e, {bool writing = false}) {
  if (e.uncertain && writing) return '操作结果尚未确认。原请求、内容与版本已保留，请先恢复原请求核对。';
  if (e.status == 412) return '内容已更新，请重新查看当前记录并重新确认。旧决定不会自动重放。';
  return {
        'FINANCE_AGREEMENT_NOT_APPROVED': '结算约定尚未审核通过。',
        'FINANCE_CONFIRMATIONS_REQUIRED': '相关方尚未完整确认这份准确约定。',
        'CURRENT_SETTLEMENT_CONFIRMATION_REQUIRED': '当前来源的结算单尚未完成各方确认。',
        'SETTLEMENT_SOURCE_CHANGED': '收退款或调整来源已有变化，请核对新的结算单。',
        'FINANCE_SOURCE_CHANGED': '原结算来源已有变化，请重新核对。',
        'FINANCE_VERSION_NOT_CONFIRMABLE': '这份记录当前不能确认，请刷新审核状态与版本。',
        'ALREADY_CONFIRMED': '本身份已有确认决定，不能覆盖原决定。',
        'FINANCE_DISPUTED': '存在未解决异议，新的付款申请暂停。',
        'REVENUE_NOT_RECEIVED': '发行账单收入尚未实际收齐，当前不能向合作方付款。',
        'SETTLEMENT_DATE_NOT_REACHED': '约定结算日期尚未到达。',
        'FINANCE_DELIVERY_NOT_ACCEPTED': '约定要求的制作交付尚未验收。',
        'CUSTOMER_PAYMENT_REVIEW_REQUIRED': '客户收款仍待人工核对。',
        'RETAINED_INCOME_NOT_PAYOUT': '这是商户自身留存，不形成给自己的付款申请。',
        'PAYOUT_EXCEEDS_AVAILABLE': '申请金额超过当前可申请额度，请重新核对。',
        'PAYOUT_NOT_CANCELLABLE': '该申请当前不能取消，已批准申请需真实结果凭据结清。',
        'DISPUTE_NOT_OPEN': '该异议已关闭，不能继续提交回复。',
        'FINANCE_EVIDENCE_FORBIDDEN': '当前身份未获准读取这份原材料。',
        'FINANCE_PARTY_FORBIDDEN': '当前身份无权办理，请核对负责人权限。',
        'FINANCE_NOT_FOUND': '记录不存在或当前身份无权查看，私有内容已清理。',
        'INVALID_FINANCE_RESPONSE': '服务器未返回有效的结算记录，请重新核对。',
        'PRIVATE_CONTENT_MISMATCH': '私有材料完整性核对失败，未保存文件。'
      }[e.code] ??
      (e.status == 401
          ? '登录已失效，请重新验证手机号。'
          : e.status == 403
              ? '当前身份无权办理，私有内容已清理。'
              : e.status == 503 || e.status == 0
                  ? '暂时无法完成，请稍后核对真实结果。'
                  : e.message);
}
