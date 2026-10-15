import 'package:jingjingshangri_app/gigs/gig_models.dart';
import '../account/fake_account_api.dart';
import '../supply/supply_fixtures.dart';
import '../trade/trade_fixtures.dart';

const gigRecordId = 'e0000000-0000-4000-8000-000000000001';
const offerId = 'e0000000-0000-4000-8000-000000000002';
const relationId = 'e0000000-0000-4000-8000-000000000003';
const commercialRuleId = 'e0000000-0000-4000-8000-000000000004';
const commissionId = 'e0000000-0000-4000-8000-000000000005';
const rankingId = 'e0000000-0000-4000-8000-000000000006';
const avatarId = 'e0000000-0000-4000-8000-000000000007';
const consentId = 'e0000000-0000-4000-8000-000000000008';
const specId = 'e0000000-0000-4000-8000-000000000009';
Map<String, dynamic> scope() => {
      'purpose': 'COMMERCIAL',
      'territory': 'CN',
      'valid_until': '2099-11-01T00:00:00.000Z'
    };
Map<String, dynamic> commission() => {'platform_bps': 2000, 'mcn_bps': 500};
Map<String, dynamic> review() => {
      'decision': 'APPROVED',
      'reason': '实际独立核验',
      'checks': {
        'identity_verified': true,
        'authority_verified': true,
        'materials_reviewed': true,
        'content_reviewed': true,
        'marking_reviewed': true
      },
      'account_id': accountId,
      'method': 'EXTERNAL_MANUAL_REVIEW'
    };
Map<String, dynamic> rankingRule() => {
      'window_days': 7,
      'newcomer_days': 30,
      'minimum_orders': 1,
      'order_weight': 10,
      'net_minor_weight': 0,
      'newcomer_bonus': 2
    };
Map<String, dynamic> rule() => {
      'version': '合成测试.1',
      'categories': [
        {
          'code': 'TEST',
          'allowed': true,
          'required_proofs': ['AUTHORITY']
        },
        {'code': 'FORBIDDEN', 'allowed': false, 'required_proofs': []}
      ],
      'ranking': rankingRule(),
      'terms': '仅用于测试的实际规则，无默认费率。'
    };
Map<String, dynamic> relationSnapshot() => {
      'id': relationId,
      'version': 2,
      'sha256': 'a' * 64,
      'mcn_party_id': invitedOrgId,
      'terms': '只限本次直接合作',
      'valid_from': '2020-01-01T00:00:00.000Z',
      'valid_until': '2099-12-01T00:00:00.000Z'
    };
Map<String, dynamic> commercial({String id = offerId}) => {
      'ranking_opt_in': false,
      'offer_id': id,
      'offer_sha256': 'b' * 64,
      'gig_id': gigRecordId,
      'scope': scope(),
      'category': 'TEST',
      'terms': '精确商业约定原文',
      'commission': commission(),
      'relation': relationSnapshot(),
      'avatar_id': avatarId,
      'consent_id': consentId,
      'rule_id': commercialRuleId
    };
Map<String, dynamic> facts() => {
      'received_minor': 10001,
      'refunded_minor': 5000,
      'net_minor': 5001,
      'environment': 'SANDBOX',
      'first_at': 1800000000000,
      'journal_ids': [paymentId, refundId]
    };
Map<String, dynamic> amounts() => {
      'net_minor': 5001,
      'supplier_minor': 4001,
      'platform_minor': 750,
      'mcn_minor': 250
    };
Map<String, dynamic> gigData(String kind,
    {String? status, int version = 2, String terms = '当前完整约定原文'}) {
  final d = switch (kind) {
    'RULE' => {'rule': rule(), 'review': null},
    'GIG' => {
        'title': '合成品牌商单',
        'brief': '仅隔离测试的商业需求',
        'category': 'TEST',
        'scope': scope(),
        'rule_id': commercialRuleId,
        'rule_sha256': 'a' * 64,
        'proofs': [
          {'code': 'AUTHORITY', 'asset_id': proofId}
        ],
        'review': review(),
        'suspension': null
      },
    'OFFER' => {
        'ranking_opt_in': false,
        'spec_id': specId,
        'avatar_id': avatarId,
        'consent_id': consentId,
        'relation': relationSnapshot(),
        'commission': commission(),
        'terms': terms,
        'evidence_asset_ids': [proofId],
        'review': review(),
        'buyer_accepted_by': status == 'ACCEPTED' ? accountId : null
      },
    'RELATION' => {
        'scope': 'COMMERCIAL',
        'valid_from': '2020-01-01T00:00:00.000Z',
        'valid_until': '2099-12-01T00:00:00.000Z',
        'exclusive': false,
        'terms': terms,
        'commission': commission(),
        'evidence_asset_ids': [proofId],
        'accepted_by': status == 'ACTIVE' ? accountId : null,
        'ended_reason': null
      },
    'COMMISSION' => {
        'order_id': orderId,
        'contract_sha256': 'd' * 64,
        'agreement': commercial(),
        'relation': relationSnapshot(),
        'facts': facts(),
        'amounts': amounts(),
        'currency': 'CNY',
        'paid_out_minor': 0,
        'meaning': 'ACCRUAL_ONLY_NOT_TRANSFERRED'
      },
    _ => <String, dynamic>{}
  };
  return {
    'id': {
      'RULE': commercialRuleId,
      'GIG': gigRecordId,
      'OFFER': offerId,
      'RELATION': relationId,
      'COMMISSION': commissionId
    }[kind],
    'kind': kind,
    'owner_party_id': kind == 'RULE'
        ? null
        : kind == 'GIG'
            ? personId
            : kind == 'RELATION'
                ? invitedOrgId
                : orgId,
    'counterparty_id':
        ['OFFER', 'COMMISSION', 'RELATION'].contains(kind) ? personId : null,
    'parent_id': kind == 'OFFER'
        ? gigRecordId
        : kind == 'COMMISSION'
            ? offerId
            : null,
    'created_by': accountId,
    'current_status': status ??
        {
          'RULE': 'EFFECTIVE',
          'GIG': 'PUBLISHED',
          'OFFER': 'APPROVED',
          'RELATION': 'INVITED',
          'COMMISSION': 'CALCULATED'
        }[kind],
    'object_version': version,
    'content_sha256': gigDigest(d),
    'data': d
  };
}

Map<String, dynamic> catalogue() => {
      'items': [
        {
          'id': gigRecordId,
          'title': '合成品牌商单',
          'brief': '仅隔离测试的商业需求',
          'category': 'TEST',
          'scope': scope(),
          'buyer_party_id': personId
        }
      ],
      'rules': [
        {'id': commercialRuleId, 'rule': rule()}
      ]
    };
Map<String, dynamic> publicRanking() => {
      'id': rankingId,
      'as_of': '2026-10-01T00:00:00.000Z',
      'rule_id': commercialRuleId,
      'rule': rankingRule(),
      'source': 'VERIFIED_PRODUCTION_COMMERCIAL_RECEIPTS',
      'data_status': 'INSUFFICIENT_DATA',
      'boards': {'hot': [], 'emerging': [], 'regional': []}
    };
Map<String, dynamic> entries() => {
      'items': [
        {
          'id': assetId,
          'object_version': 2,
          'data': {
            'facts': facts(),
            'amounts': amounts(),
            'delta': {
              'supplier_minor': -4000,
              'platform_minor': -750,
              'mcn_minor': -250
            }
          }
        }
      ]
    };
Map<String, dynamic> commercialTrade(String kind, {String id = offerId}) {
  final r = tradeData(kind);
  final quote = kind == 'ORDER' ? r['data']['quote'] : r['data'];
  quote['commercial'] = commercial(id: id);
  if (kind == 'ORDER') {
    r['data']['contract']['commitments']['quote']['commercial'] =
        commercial(id: id);
  }
  return r;
}

Map<String, dynamic> supplierSpec() => {
      'id': specId,
      'kind': 'SPEC',
      'buyer_party_id': null,
      'merchant_party_id': orgId,
      'parent_id': null,
      'order_id': null,
      'created_by': accountId,
      'current_status': 'PUBLISHED',
      'object_version': 2,
      'content_sha256': 'c' * 64,
      'data': {
        'title': '合成商业制作规格',
        'provider_party_id': orgId,
        'line_kind': 'PRODUCTION',
        'unit_minor': 10001,
        'currency': 'CNY',
        'specification': quoteData()['lines'][0]['specification'],
        'review': null
      }
    };
Map<String, dynamic> supplyChoice(String kind,
        {String? id,
        String status = 'APPROVED',
        String purpose = 'COMMERCIAL'}) =>
    {
      'id': id ?? (kind == 'AVATAR' ? avatarId : consentId),
      'kind': kind,
      'stream_ref': 'actual-stream-reference',
      'revision': 1,
      'owner_party_id': orgId,
      'created_by': accountId,
      'current_status': kind == 'AVATAR' ? 'RECORDED' : status,
      'object_version': 2,
      'data': kind == 'AVATAR'
          ? {
              'display_name': '当前身份数字人',
              'material_asset_ids': [proofId],
              'provider_asset_ref': null
            }
          : {
              'consent': {
                'avatar_id': avatarId,
                'subject_party_id': orgId,
                'features': ['FACE', 'VOICE'],
                'purposes': [purpose],
                'territories': ['CN'],
                'valid_from': '2020-01-01T00:00:00.000Z',
                'valid_until': '2099-12-01T00:00:00.000Z',
                'terms': '合成本人同意原文',
                'evidence_asset_ids': [proofId]
              },
              'review': null,
              'withdrawal': null,
              'signing_method': 'IN_APP_DECLARATION',
              'identity_verification': 'NOT_VERIFIED'
            }
    };
