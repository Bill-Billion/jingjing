import '../account/fake_account_api.dart';
import '../contracts/contract_fixtures.dart';

const quoteId = 'd0000000-0000-4000-8000-000000000001';
const orderId = 'd0000000-0000-4000-8000-000000000002';
const paymentId = 'd0000000-0000-4000-8000-000000000003';
const refundId = 'd0000000-0000-4000-8000-000000000004';
const legacyId = 'd0000000-0000-4000-8000-000000000005';
Map<String, dynamic> quoteData() => {
      'lines': [
        {
          'title': '私人短片制作',
          'provider_party_id': orgId,
          'line_kind': 'PRODUCTION',
          'unit_minor': 128001,
          'currency': 'CNY',
          'specification': {
            'version': '2026.1',
            'service_tier': '原约定档位',
            'sample_seconds': 30,
            'final_seconds': 120,
            'revision_limit': 2,
            'deliverables': ['完整成片'],
            'terms': '按原约定逐项交付，不另行训练。'
          },
          'review': {
            'decision': 'APPROVED',
            'reason': '规格已核对',
            'account_id': accountId
          },
          'line_id': 'production',
          'spec_id': snapshotId,
          'spec_version': 1,
          'quantity': 1,
          'total_minor': 128001
        }
      ],
      'installments': [
        {
          'key': 'deposit',
          'trigger': 'ORDER_ACCEPTED',
          'allocations': [
            {'line_id': 'production', 'amount_minor': 38001}
          ],
          'apple_product_id': null
        },
        {
          'key': 'sample',
          'trigger': 'SAMPLE_ACCEPTED',
          'allocations': [
            {'line_id': 'production', 'amount_minor': 90000}
          ],
          'apple_product_id': null
        }
      ],
      'total_minor': 128001,
      'currency': 'CNY',
      'channel': 'ALIPAY',
      'transaction_model': 'DIRECT_SUPPLIER',
      'rule_id': ruleId,
      'expires_at': '2099-10-01T00:00:00.000Z',
      'payment_window_minutes': 30,
      'license_reservation_id': null,
      'review': {
        'decision': 'APPROVED',
        'reason': '报价已核对',
        'account_id': accountId
      },
    };
Map<String, dynamic> tradeData(String kind,
    {String? status, String provider = 'ALIPAY'}) {
  final data = <String, dynamic>{};
  if (kind == 'QUOTE') data.addAll(quoteData());
  if (kind == 'ORDER') {
    data.addAll({
      'quote': quoteData(),
      'contract': {
        ...snapshotData(),
        'commitments': {
          'quote_id': quoteId,
          'quote_sha256': 'c' * 64,
          'quote': quoteData()
        },
      },
      'buyer_acknowledged_by': accountId,
      'financial': {'received_minor': 0, 'refunded_minor': 0, 'net_minor': 0}
    });
  }
  if (kind == 'PAYMENT' || kind == 'REFUND') {
    data.addAll({
      'provider': provider,
      'environment': 'SANDBOX',
      'app_id': 'app',
      'merchant_id': 'merchant',
      'currency': 'CNY',
      'amount_minor': 38001,
      'allocations': [
        {'line_id': 'production', 'amount_minor': 38001}
      ],
      'apple_product_id': provider == 'APPLE' ? 'deposit' : null,
      'transaction_id': 'real-fixture-transaction'
    });
  }
  if (kind == 'PAYMENT') {
    data.addAll({
      'config_revision': '1',
      'installment_key': 'deposit',
      'title': '私人短片制作',
      'payment_window_minutes': 30,
      'expires_at': '2099-10-01T00:00:00.000Z',
      'checkout': {'kind': 'ALIPAY_APP', 'order_string': 'must-never-display'},
      'proof': {
        'provider': provider,
        'environment': 'SANDBOX',
        'app_id': 'app',
        'merchant_id': 'merchant',
        'currency': 'CNY',
        'amount_minor': 38001,
        'payment_id': paymentId,
        'transaction_id': 'real-fixture-transaction',
        'status': 'SUCCEEDED',
        'product_id': provider == 'APPLE' ? 'deposit' : null,
        'app_account_token': provider == 'APPLE' ? paymentId : null
      }
    });
  }
  if (kind == 'REFUND') {
    data.addAll(
        {'payment_id': paymentId, 'reason': '按原约定申请退回', 'review': null});
  }
  if (kind == 'LEGACY') {
    data.addAll({
      'source_system': 'legacy-import',
      'source_order_id': 'original-001',
      'original_lines': [
        {
          'line_id': 'original',
          'amount_minor': 128001,
          'reported_status': 'REPORTED_PAID'
        }
      ],
      'original_terms': '原始条款，仅留存核对。',
      'evidence_asset_id': snapshotId,
      'currency': 'CNY',
      'payment_verified': false,
      'review': null
    });
  }
  return {
    'id': {
      'QUOTE': quoteId,
      'ORDER': orderId,
      'PAYMENT': paymentId,
      'REFUND': refundId,
      'LEGACY': legacyId
    }[kind],
    'kind': kind,
    'buyer_party_id': personId,
    'merchant_party_id': orgId,
    'parent_id': kind == 'ORDER'
        ? quoteId
        : kind == 'REFUND'
            ? paymentId
            : null,
    'order_id': ['ORDER', 'PAYMENT', 'REFUND'].contains(kind) ? orderId : null,
    'created_by': accountId,
    'current_status': status ??
        {
          'QUOTE': 'APPROVED',
          'ORDER': 'OPEN',
          'PAYMENT': 'SUCCEEDED',
          'REFUND': 'REQUESTED',
          'LEGACY': 'VERIFIED_REFERENCE_ONLY'
        }[kind],
    'object_version': 2,
    'content_sha256': 'c' * 64,
    'data': data
  };
}
