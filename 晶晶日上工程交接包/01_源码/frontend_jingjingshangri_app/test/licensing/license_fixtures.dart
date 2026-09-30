import '../account/fake_account_api.dart';
import '../contracts/contract_fixtures.dart';

const productId = 'a0000000-0000-4000-8000-000000000001';
const reserveId = 'a0000000-0000-4000-8000-000000000002';
const grantId = 'a0000000-0000-4000-8000-000000000003';
const projectId = 'a0000000-0000-4000-8000-000000000004';
const readingId = 'a0000000-0000-4000-8000-000000000005';
const bindingId = 'a0000000-0000-4000-8000-000000000006';
Map<String, dynamic> termsData() => {
      'exclusive': false,
      'rights': ['PRODUCE', 'ADAPT'],
      'purposes': ['PRIVATE'],
      'territories': ['CN'],
      'languages': ['zh'],
      'valid_from': '2020-01-01T00:00:00.000Z',
      'development_until': '2099-12-01T00:00:00.000Z',
      'valid_until': '2099-12-31T00:00:00.000Z',
      'project_limit': 2,
      'episode_limit': 4,
      'terms_text': '明确条款，禁止另行训练。'
    };
Map<String, dynamic> licenseData(String kind, {String? status}) {
  final record = {
    'id': {
      'PRODUCT': productId,
      'RESERVATION': reserveId,
      'GRANT': grantId,
      'PROJECT': projectId,
      'READING': readingId,
      'BINDING': bindingId
    }[kind],
    'kind': kind,
    'owner_party_id': kind == 'PRODUCT' || kind == 'READING' ? personId : orgId,
    'counterparty_id': kind == 'READING'
        ? orgId
        : kind == 'PRODUCT' || kind == 'PROJECT'
            ? null
            : personId,
    'work_id': kind == 'PROJECT' ? null : productId,
    'parent_id': {
      'RESERVATION': productId,
      'GRANT': reserveId,
      'BINDING': grantId
    }[kind],
    'created_by': accountId,
    'current_status': status ??
        {
          'PRODUCT': 'LISTED',
          'RESERVATION': 'HELD',
          'GRANT': 'ACTIVE',
          'PROJECT': 'ACTIVE',
          'READING': 'APPROVED',
          'BINDING': 'ACTIVE'
        }[kind],
    'object_version': 2,
    'data': <String, dynamic>{}
  };
  final d = record['data'] as Map<String, dynamic>;
  if (['PRODUCT', 'RESERVATION'].contains(kind)) {
    d.addAll({
      'work_version_id': productId,
      'title': '回到那年夏天',
      'preview_text': '久别重逢，在旧车站完成迟来的告别。',
      'terms': termsData(),
      'price': {'currency': 'CNY', 'amount_minor': 12345},
      'payment_due_minor': 12345,
      'reservation_minutes': 90,
      'rule_id': ruleId,
      'review': null
    });
  }
  if (kind == 'RESERVATION') {
    d.addAll(
        {'contract': snapshotData(), 'expires_at': '2099-12-31T00:00:00.000Z'});
  }
  if (kind == 'GRANT') {
    d.addAll({
      'work_version_id': productId,
      'terms': termsData(),
      'price': {'currency': 'CNY', 'amount_minor': 12345},
      'contract': snapshotData(),
      'evidence_id': productId,
      'activated_at': '2026-09-30T00:00:00.000Z',
      'reason': '外部事实已核验'
    });
  }
  if (kind == 'PROJECT') {
    d.addAll({
      'title': '夏日私人短片',
      'purpose': 'PRIVATE',
      'territory': 'CN',
      'language': 'zh',
      'episodes': 1
    });
  }
  if (kind == 'BINDING') {
    d.addAll({
      'project_id': projectId,
      'work_version_id': productId,
      'terms_sha256': 'a' * 64
    });
  }
  if (kind == 'READING') {
    d.addAll({
      'work_version_id': productId,
      'reader_account_id': accountId,
      'valid_until': '2099-12-31T00:00:00.000Z',
      'basis_type': 'NDA',
      'basis_asset_id': productId,
      'review': null,
      'allows_generation': false
    });
  }
  return record;
}
