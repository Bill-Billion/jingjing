import 'dart:async';
import 'package:dio/dio.dart';
import 'package:jingjingshangri_app/finance/finance_models.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_fixtures.dart' show orderId;

const agreementKey = 'f2000000-0000-4000-8000-000000000001';
const settlementKey = 'f2000000-0000-4000-8000-000000000002';
const payoutKey = 'f2000000-0000-4000-8000-000000000003';
const evidenceKey = 'f2000000-0000-4000-8000-000000000004';
const disputeKey = 'f2000000-0000-4000-8000-000000000005';
const responseKey = 'f2000000-0000-4000-8000-000000000006';
const adjustmentKey = 'f2000000-0000-4000-8000-000000000007';
const reconciliationKey = 'f2000000-0000-4000-8000-000000000008';
const statementKey = 'f2000000-0000-4000-8000-000000000009';
const receiptKey = 'f2000000-0000-4000-8000-000000000010';
const ruleKey = 'f2000000-0000-4000-8000-000000000011';
const materialKey = 'f2000000-0000-4000-8000-000000000012';
const financeConfirmPath =
    '/api/v1/finance/records/$settlementKey/confirmations';
const financePayoutPath = '/api/v1/finance/agreements/$agreementKey/payouts';
const financeIdsByKind = {
  'AGREEMENT': agreementKey,
  'SETTLEMENT': settlementKey,
  'PAYOUT': payoutKey,
  'PAYOUT_EVIDENCE': evidenceKey,
  'DISPUTE': disputeKey,
  'RESPONSE': responseKey,
  'ADJUSTMENT': adjustmentKey,
  'RECONCILIATION': reconciliationKey,
  'STATEMENT': statementKey,
  'RECEIPT': receiptKey,
};
Map<String, dynamic> financeReviewData() => {
      'decision': 'APPROVED',
      'reason': '已独立核对实际材料。',
      'verification': {
        for (final k in [
          'parties_verified',
          'contract_verified',
          'amount_verified',
          'evidence_verified'
        ])
          k: true
      },
      'reviewer_account_id': invitationId,
      'method': 'INDEPENDENT_MANUAL_EVIDENCE_REVIEW',
    };
Map<String, dynamic> financeBalanceData(
        {bool current = false, int paid = 2000, int available = 6000}) =>
    {
      'party_id': personId,
      'accrued_minor': 8000,
      'adjustment_minor': 0,
      'paid_minor': paid,
      'balance_minor': 8000 - paid,
      if (current) ...{
        'expected_accrued_minor': 8000,
        'available_minor': available,
        'recovery_due_minor': paid > 8000 ? paid - 8000 : 0,
        'reason_code': null,
        'meaning': 'PAYABLE_NOT_YET_TRANSFERRED'
      },
    };
Map<String, dynamic> financeData(String kind,
    {String? status,
    int version = 2,
    bool projected = true,
    String source = 'ORDER'}) {
  final d = <String, dynamic>{};
  switch (kind) {
    case 'AGREEMENT':
      d.addAll({
        'previous_agreement_id': null,
        'source_type': source,
        'source_id': orderId,
        'source_sha256': 'a' * 64,
        'environment': 'SANDBOX',
        'currency': 'CNY',
        'rule_id': ruleKey,
        'rule_snapshot': {
          'id': ruleKey,
          'terms': {'说明': '分配按本约定核对。', '比例示例': 2.5},
          'version': '1',
          'rule_key': 'SETTLEMENT',
          'content_sha256': 'b' * 64,
          'format_version': 'rule-content-v1'
        },
        'rules': {
          'version': '1',
          'settlement_at': '2020-01-01T00:00:00.000Z',
          'release_condition': 'RECEIVED',
          'terms': '本人参与方份额为八成；申请不代表转账，到账须有真实凭据。',
          'lines': [
            {
              'line_id': 'production',
              'shares': [
                {'party_id': personId, 'bps': 8000, 'role': 'PARTICIPANT'},
                {'party_id': orgId, 'bps': 2000, 'role': 'PRODUCER'}
              ],
              'deductions': <dynamic>[]
            }
          ]
        },
        'parties': [personId, orgId],
        'evidence_asset_id': materialKey,
        'review': financeReviewData()
      });
    case 'SETTLEMENT':
      d.addAll({
        'period_reference': '2026年9月',
        'note': '本人结算以本次原始快照为准。',
        'facts_sha256': 'c' * 64,
        'source_references': <dynamic>[],
        'received_minor': 10000,
        'receivable_minor': 0,
        'balances': [
          financeBalanceData(),
          {
            'party_id': orgId,
            'accrued_minor': 2000,
            'adjustment_minor': 0,
            'paid_minor': 0,
            'balance_minor': 2000
          }
        ],
        'rule_sha256': 'd' * 64,
        'review': financeReviewData()
      });
    case 'PAYOUT':
      d.addAll({
        'recipient_party_id': personId,
        'amount_minor': 3000,
        'destination_asset_id': materialKey,
        'destination_owner_party_id': personId,
        'note': '按本人收款资料申请。',
        'method': 'EXTERNAL_MANUAL_PAYMENT',
        'review': null
      });
    case 'PAYOUT_EVIDENCE':
      d.addAll({
        'payout_id': payoutKey,
        'recipient_party_id': personId,
        'outcome': 'PAID',
        'amount_minor': 3000,
        'external_reference': 'bank-ref-1',
        'occurred_at': '2026-10-01T00:00:00.000Z',
        'evidence_asset_id': materialKey,
        'note': '真实外部付款凭据。',
        'review': null,
        'method': 'EXTERNAL_MANUAL_EVIDENCE'
      });
    case 'DISPUTE':
      d.addAll({
        'about_record_id': settlementKey,
        'category': 'SETTLEMENT',
        'reason': '请核对本人的分配依据。',
        'evidence_asset_ids': [materialKey],
        'decision_history': status == 'RESOLVED'
            ? [
                {
                  'decision': 'REMEDIED',
                  'reason': '已核实真实调整。',
                  'action_record_id': adjustmentKey,
                  'reviewer_account_id': invitationId
                }
              ]
            : <dynamic>[]
      });
    case 'RESPONSE':
      d.addAll({
        'dispute_id': disputeKey,
        'message': '补充本人的实际核对说明。',
        'evidence_asset_ids': <dynamic>[]
      });
    case 'ADJUSTMENT':
      d.addAll({
        'entries': [
          {'party_id': personId, 'amount_minor': -100},
          {'party_id': orgId, 'amount_minor': 100}
        ],
        'reason': '按实际依据作零和调整。',
        'evidence_asset_id': materialKey,
        'review': financeReviewData()
      });
    case 'RECONCILIATION':
      d.addAll({
        'provider': 'ALIPAY',
        'environment': 'SANDBOX',
        'external_reference': 'statement-ref-1',
        'items': <dynamic>[],
        'facts_sha256': 'c' * 64,
        'differences': <dynamic>[],
        'evidence_asset_id': materialKey,
        'meaning': 'COMPARISON_ONLY_NOT_A_PAYMENT_OR_MANUAL_APPROVAL'
      });
    case 'STATEMENT':
      d.addAll({
        'external_reference': 'release-bill-1',
        'period_start': '2026-09-01T00:00:00.000Z',
        'period_end': '2026-10-01T00:00:00.000Z',
        'gross_minor': 10000,
        'refund_minor': 1000,
        'channel_fee_minor': 100,
        'tax_minor': 0,
        'net_minor': 8900,
        'direction': 'CREDIT',
        'original_statement_id': null,
        'evidence_asset_id': materialKey,
        'note': '渠道收入账单，未自动视为收款。',
        'environment': 'SANDBOX',
        'review': financeReviewData()
      });
    case 'RECEIPT':
      d.addAll({
        'statement_id': statementKey,
        'amount_minor': 5000,
        'external_reference': 'bank-receipt-1',
        'occurred_at': '2026-10-01T00:00:00.000Z',
        'evidence_asset_id': materialKey,
        'note': '本笔真实收款凭据。',
        'environment': 'SANDBOX',
        'review': financeReviewData()
      });
  }
  final hash = financeDigest(d);
  if (kind == 'SETTLEMENT' && projected) d['balances'] = [financeBalanceData()];
  return {
    'id': financeIdsByKind[kind],
    'kind': kind,
    'agreement_id': kind == 'AGREEMENT' ? null : agreementKey,
    'owner_party_id':
        ['PAYOUT', 'DISPUTE', 'RESPONSE'].contains(kind) ? personId : orgId,
    'created_by': accountId,
    'current_status': status ??
        {
          'PAYOUT': 'REQUESTED',
          'PAYOUT_EVIDENCE': 'IN_REVIEW',
          'DISPUTE': 'OPEN',
          'RESPONSE': 'RECORDED',
          'RECONCILIATION': 'MATCHED'
        }[kind] ??
        'APPROVED',
    'object_version': version,
    'content_sha256': hash,
    'data': d
  };
}

Map<String, dynamic> financeBalances({int paid = 2000, int available = 6000}) =>
    {
      'agreement_id': agreementKey,
      'currency': 'CNY',
      'environment': 'SANDBOX',
      'customer_payment_separate': true,
      'received_minor': 10000,
      'receivable_minor': 0,
      'items': [
        financeBalanceData(current: true, paid: paid, available: available)
      ],
    };
FakeAccountAdapter financeAdapter(
    {FutureOr<ResponseBody?> Function(RequestOptions)? override,
    Map<String, dynamic> Function(String kind)? records}) {
  late FakeAccountAdapter a;
  final confirmations = <String, Map<String, dynamic>>{};
  final record = records ?? financeData;
  a = FakeAccountAdapter(handler: (r) async {
    final special = await override?.call(r);
    if (special != null) return special;
    if (r.path.endsWith('/confirmations')) {
      final id = r.path.split('/')[5],
          kind = financeIdsByKind.entries.firstWhere((e) => e.value == id).key;
      if (r.method == 'POST') {
        confirmations[id] = {
          'party_id': personId,
          ...Map<String, dynamic>.from(r.data)
        };
        return envelope(record(kind));
      }
      return envelope({
        'items': [if (confirmations[id] != null) confirmations[id]]
      });
    }
    if (r.path.endsWith('/balances')) return envelope(financeBalances());
    if (r.path.endsWith('/readiness')) {
      return envelope({
        'environment': 'SANDBOX',
        'automatic_payout': {
          'current_status': 'NOT_IMPLEMENTED',
          'reason_code': 'PAYOUT_PROVIDER_NOT_VERIFIED'
        },
        'manual_payment': {
          'current_status': 'IMPLEMENTED',
          'meaning':
              'REAL_EXTERNAL_MANUAL_PAYMENT_WITH_INDEPENDENT_EVIDENCE_REVIEW'
        }
      });
    }
    if (r.path == '/api/v1/finance/notifications' ||
        r.path.endsWith('/entries')) {
      return envelope({'items': [], 'next_cursor': null});
    }
    if (r.path == '/api/v1/finance/agreements') {
      return envelope({
        'items': [record('AGREEMENT')],
        'next_cursor': null
      });
    }
    if (r.method == 'GET' && r.path.endsWith('/records')) {
      final kind = r.queryParameters['kind'] as String;
      return envelope({
        'items': ['RESPONSE', 'PAYOUT_EVIDENCE', 'RECEIPT'].contains(kind)
            ? []
            : [record(kind)],
        'next_cursor': null
      });
    }
    if (r.method == 'GET' && r.path.startsWith('/api/v1/finance/records/')) {
      final kind = financeIdsByKind.entries
          .firstWhere((e) => e.value == r.path.split('/').last)
          .key;
      return envelope(record(kind));
    }
    if (r.path == financePayoutPath) return envelope(record('PAYOUT'));
    if (r.path.endsWith('/disputes')) return envelope(record('DISPUTE'));
    if (r.path.endsWith('/responses')) return envelope(record('RESPONSE'));
    if (r.path.endsWith('/cancellation')) return envelope(record('PAYOUT'));
    return a.defaultReply(r);
  });
  return a;
}
