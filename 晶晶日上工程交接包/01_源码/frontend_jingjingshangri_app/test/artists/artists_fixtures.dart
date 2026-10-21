import 'dart:async';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import '../account/fake_account_api.dart';

const personKey = 'a1111111-1111-4111-8111-111111111111';
const avatarKey = 'a2222222-2222-4222-8222-222222222222';
const recordKey = 'a3333333-3333-4333-8333-333333333333';
const assetKey = 'a4444444-4444-4444-8444-444444444444';
const specKey = 'a5555555-5555-4555-8555-555555555555';
const listingKey = 'a6666666-6666-4666-8666-666666666666';
const relationKey = 'a7777777-7777-4777-8777-777777777777';
const artistRoot = '/api/v1/artists';
final artistBytes = Uint8List.fromList([1, 2, 3, 4]);
Map<String, dynamic> personData(
        {String owner = personId,
        bool verified = true,
        String age = 'ADULT'}) =>
    {
      'id': personKey,
      'owner_party_id': owner,
      'display_name': '本人测试艺人',
      'current_status': 'ACTIVE',
      'identity_status': verified ? 'VERIFIED' : 'UNVERIFIED',
      'age_band': verified ? age : 'UNKNOWN',
      'identity_valid_until': verified ? '2099-01-01T00:00:00.000Z' : null,
      'object_version': 1
    };
Map<String, dynamic> avatarData() => {
      'id': avatarKey,
      'person_id': personKey,
      'owner_party_id': personId,
      'object_version': 1,
      'data': {
        'display_name': '本人的测试数字人',
        'material_asset_ids': <String>[],
        'provider_asset_ref': null,
        'artist_person_id': personKey,
        'archive_status': 'EMPTY',
        'long_lived_model_status': 'NOT_ENABLED'
      }
    };
Map<String, dynamic> detailData({bool verified = true, String age = 'ADULT'}) =>
    {
      'person': personData(verified: verified, age: age),
      'avatars': [avatarData()],
      'halo_level': 1
    };
Map<String, dynamic> serviceSpec({String kind = 'AVATAR_HOSTING'}) => {
      'version': 'test-v1',
      'service_tier': '隔离测试档位',
      'service': {
        'kind': kind,
        'unit': kind == 'AVATAR_CREATION'
            ? 'PERSON_FIRST'
            : kind == 'AVATAR_HOSTING'
                ? 'AVATAR_MONTH'
                : 'HALO_APPLICATION',
        'rule_version': 'test-rule',
        'source_ref': 'synthetic:only',
        'retry_limit': kind == 'AVATAR_CREATION' ? 1 : 0,
        'hosting_months': kind == 'AVATAR_HOSTING' ? 1 : null,
        'halo_level': kind == 'HALO_REVIEW' ? 2 : null,
        'failure_policy': 'REFUND_UNDELIVERED'
      },
      'deliverables': ['隔离测试档案服务'],
      'terms': '仅合成测试约定'
    };
Map<String, dynamic> servicesData() => {
      'identity': {
        'current_status': 'NOT_ENABLED',
        'reason_code': 'PROVIDER_NOT_IMPLEMENTED'
      },
      'long_lived_model': {
        'current_status': 'NOT_ENABLED',
        'reason_code': 'PROVIDER_NOT_IMPLEMENTED'
      },
      'offers': {
        'current_status': 'CONFIGURED',
        'reason_code': null,
        'items': [
          {
            'spec_id': specKey,
            'merchant_party_id': orgId,
            'title': '合成托管服务',
            'price_minor': 2900,
            'currency': 'CNY',
            'specification': serviceSpec(),
            'product_profile': {'version': 'V5', 'type': 'AVATAR_HOSTING'}
          }
        ]
      }
    };
Map<String, dynamic> artistRecord(
    {String kind = 'CONSENT', String status = 'APPROVED', int version = 2}) {
  final periods = {
    'valid_from': '2020-01-01T00:00:00.000Z',
    'valid_until': '2099-01-01T00:00:00.000Z'
  };
  final body = switch (kind) {
    'CONSENT' => {
        'features': ['FACE', 'VOICE'],
        'purposes': ['PRIVATE_ARCHIVE', 'PUBLIC_DISPLAY'],
        'grantee_party_id': personId,
        'territories': ['CN'],
        ...periods,
        'terms': '本人私有同意原约定',
        'evidence_asset_ids': <String>[],
        'declared_by': accountId,
        'declared_at': '2026-10-21T00:00:00.000Z',
        'review': null
      },
    'DELEGATION' => {
        'organization_party_id': orgId,
        'relation_id': relationKey,
        'actions': ['READ_PROFILE'],
        'evidence_asset_ids': <String>[],
        'terms': '本人委托',
        'accepted_by': accountId,
        'accepted_at': '2026-10-21T00:00:00.000Z',
        ...periods
      },
    'LOOK' || 'VOICE' => {
        'previous_version_id': null,
        'display_name': '本人的历史版本',
        'material_asset_ids': <String>[],
        'consent_id': recordKey,
        'revision': 1
      },
    'HALO' => {
        'level': 1,
        'service_id': null,
        'ownership_promise': true,
        'evidence_asset_ids': <String>[],
        'review': null,
        'valid_from': null,
        'valid_until': null
      },
    'SERVICE' => {
        'kind': 'AVATAR_HOSTING',
        'spec_id': specKey,
        'specification': serviceSpec(),
        'price_minor': 2900,
        'currency': 'CNY',
        'renewal_reminder': false,
        'auto_debit_enabled': false,
        'delivery': null,
        'hosting_period': null,
        'refund': null,
        'attempts': 0
      },
    _ => <String, dynamic>{},
  };
  return {
    'id': recordKey,
    'person_id': personKey,
    'kind': kind,
    'avatar_id': avatarKey,
    'counterparty_id': kind == 'DELEGATION' ? orgId : null,
    'created_by': accountId,
    'current_status': status,
    'object_version': version,
    'content_sha256': 'a' * 64,
    'data': body
  };
}

Map<String, dynamic> assetData(
        {Uint8List? bytes, String purpose = 'CONSENT_EVIDENCE'}) =>
    {
      'id': assetKey,
      'owner_party_id': personId,
      'purpose': purpose,
      'media_type': 'text/plain',
      'byte_size': (bytes ?? artistBytes).length,
      'content_sha256': sha256.convert(bytes ?? artistBytes).toString(),
      'current_status': 'READY'
    };
FakeAccountAdapter artistAdapter(
    {FutureOr<ResponseBody?> Function(RequestOptions)? override}) {
  late FakeAccountAdapter a;
  a = FakeAccountAdapter(handler: (r) async {
    final other = await override?.call(r);
    if (other != null) return other;
    if (r.path == '$artistRoot/services') return envelope(servicesData());
    if (r.path == '$artistRoot/people') {
      return envelope(r.method == 'GET'
          ? {
              'items': [personData()],
              'next_cursor': null
            }
          : (personData(verified: false)
            ..['display_name'] = r.data['display_name']));
    }
    if (r.path == '$artistRoot/people/$personKey') {
      return envelope(detailData());
    }
    if (r.path == '$artistRoot/people/$personKey/avatars') {
      return envelope(avatarData());
    }
    if (r.path == '$artistRoot/people/$personKey/records') {
      final kind = r.queryParameters['kind'] as String;
      return envelope({
        'items': kind == 'DELEGATION'
            ? [artistRecord(kind: kind, status: 'ACTIVE')]
            : <Map<String, dynamic>>[],
        'next_cursor': null
      });
    }
    if (r.path == '$artistRoot/people/$personKey/records/$recordKey') {
      return envelope(artistRecord());
    }
    if (r.path == '$artistRoot/catalog') {
      return envelope({'items': <Map<String, dynamic>>[], 'next_cursor': null});
    }
    if (r.path == '$artistRoot/people/$personKey/assets') {
      return envelope(
          assetData(bytes: r.data, purpose: r.queryParameters['purpose']));
    }
    if (r.path == '$artistRoot/assets/$assetKey') return envelope(assetData());
    if (r.path == '$artistRoot/assets/$assetKey/content') {
      return ResponseBody.fromBytes(artistBytes, 200, headers: {
        'content-type': ['application/octet-stream']
      });
    }
    return a.defaultReply(r);
  });
  return a;
}

Future<AccountSession> artistSession(FakeAccountAdapter a) async {
  final s = AccountSession(api: a.createApi());
  await s.login('13800000000', invitationId, '123456');
  s.select(identity(personId));
  return s;
}
