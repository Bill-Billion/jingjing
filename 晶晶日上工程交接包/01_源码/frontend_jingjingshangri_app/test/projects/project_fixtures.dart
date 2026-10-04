import 'package:dio/dio.dart';
import 'package:jingjingshangri_app/projects/project_models.dart';
import '../account/fake_account_api.dart';

const projectKey = 'f1000000-0000-4000-8000-000000000001';
const roleKey = 'f1000000-0000-4000-8000-000000000002';
const candidateKey = 'f1000000-0000-4000-8000-000000000003';
const planKey = 'f1000000-0000-4000-8000-000000000004';
const editionKey = 'f1000000-0000-4000-8000-000000000005';
const channelKey = 'f1000000-0000-4000-8000-000000000006';
const releaseKey = 'f1000000-0000-4000-8000-000000000007';
const eventKey = 'f1000000-0000-4000-8000-000000000008';
const avatarKey = 'f1000000-0000-4000-8000-000000000009';
const consentKey = 'f1000000-0000-4000-8000-000000000010';
const assetKey = 'f1000000-0000-4000-8000-000000000011';
const confirmPath = '/api/v1/projects/records/$planKey/confirmations';
Map<String, dynamic> projectScopeData() => {
      'purpose': 'RELEASE',
      'territory': 'CN',
      'language': 'zh',
      'valid_until': '2030-01-01T00:00:00.000Z'
    };
Map<String, dynamic> projectReview(String kind) => {
      'decision': 'APPROVED',
      'reason': '已逐项核对真实依据。',
      'verification': {
        for (final k in {
          'PLAN': [
            'identity_verified',
            'signatures_verified',
            'rights_verified',
            'production_verified'
          ],
          'EDITION': [
            'rights_verified',
            'content_verified',
            'credits_verified',
            'materials_verified'
          ],
          'CHANNEL': ['channel_verified', 'requirements_verified'],
          'RELEASE': [
            'rights_verified',
            'materials_verified',
            'channel_verified'
          ],
          'EXTERNAL_EVENT': [
            'source_verified',
            'reference_verified',
            'outcome_verified'
          ]
        }[kind]!)
          k: true
      },
      'reviewer_account_id': invitationId,
      'method': 'MANUAL_EVIDENCE_REVIEW'
    };
Map<String, dynamic> projectData(String kind,
    {String? status, int version = 2, String owner = personId}) {
  final data = <String, dynamic>{};
  switch (kind) {
    case 'PROJECT':
      data.addAll({
        'title': '风从海边来',
        'scope': projectScopeData(),
        'current_plan_id': planKey,
        'current_edition_id': editionKey,
        'cancel_reason': null
      });
    case 'ROLE':
      data.addAll({
        'title': '青年画家',
        'capacity': 2,
        'pricing': 'QUOTE',
        'amount_minor': null,
        'terms': '按本角色完整约定参与，不自动授予其他用途。'
      });
    case 'CANDIDATE':
      data.addAll({
        'role_id': roleKey,
        'avatar_id': avatarKey,
        'consent_id': consentKey,
        'amount_minor': 10001,
        'note': '希望参与本角色。',
        'terms': '本人参与角色，使用范围以当前约定为准。',
        'final_confirmed_by': null
      });
    case 'PLAN':
      data.addAll({
        'production_project_id': avatarKey,
        'rights': [
          for (final layer in projectLayers.keys)
            {
              'layer': layer,
              'holder_party_id': personId,
              'evidence_asset_id': assetKey,
              'purpose': 'RELEASE',
              'territory': 'CN',
              'valid_until': '2030-01-01T00:00:00.000Z',
              'terms': '本层权利限当前项目范围。'
            }
        ],
        'confirmers': [
          {
            'party_id': personId,
            'responsibility': '核对本人权利与角色职责。',
            'after_party_ids': <String>[]
          }
        ],
        'funding': [
          {
            'candidate_id': candidateKey,
            'order_id': consentKey,
            'line_id': 'role-fee'
          }
        ],
        'terms': '六层权利、角色费用与责任按此完整方案办理。',
        'roster_sha256': 'c' * 64,
        'review': projectReview(kind)
      });
    case 'EDITION':
      data.addAll({
        'plan_id': planKey,
        'final_version_id': avatarKey,
        'final_content_sha256': 'd' * 64,
        'material_asset_ids': [assetKey],
        'confirmers': [
          {
            'party_id': personId,
            'responsibility': '核对本人成片内容。',
            'after_party_ids': <String>[]
          }
        ],
        'note': '本次当前最终成片材料。',
        'review': projectReview(kind)
      });
    case 'CHANNEL':
      data.addAll({
        'name': '已核验渠道',
        'channel_reference': 'https://example.test/channel',
        'submission_requirements': '以实际渠道要求为准。',
        'evidence_asset_id': assetKey,
        'review': projectReview(kind)
      });
    case 'RELEASE':
      data.addAll({
        'edition_id': editionKey,
        'channel_id': channelKey,
        'prior_release_id': null,
        'material_asset_ids': [assetKey],
        'note': '按本次材料申请发行。',
        'review': projectReview(kind),
        'last_external_event_id': null
      });
    case 'EXTERNAL_EVENT':
      data.addAll({
        'release_id': releaseKey,
        'outcome': 'SUBMITTED',
        'external_reference': 'external-ref-1',
        'occurred_at': '2026-10-01T09:00:00.000Z',
        'evidence_asset_id': assetKey,
        'note': '外部已提交凭据待核实。',
        'review': null,
        'provenance': 'EXTERNAL_MANUAL_EVIDENCE'
      });
  }
  return {
    'id': {
      'PROJECT': projectKey,
      'ROLE': roleKey,
      'CANDIDATE': candidateKey,
      'PLAN': planKey,
      'EDITION': editionKey,
      'CHANNEL': channelKey,
      'RELEASE': releaseKey,
      'EXTERNAL_EVENT': eventKey
    }[kind],
    'kind': kind,
    'project_id': ['PROJECT', 'CHANNEL'].contains(kind) ? null : projectKey,
    'owner_party_id': owner,
    'created_by': accountId,
    'current_status': status ??
        {
          'PROJECT': 'PREPARING',
          'ROLE': 'OPEN',
          'CANDIDATE': 'SELECTED',
          'PLAN': 'APPROVED',
          'EDITION': 'APPROVED',
          'CHANNEL': 'APPROVED',
          'RELEASE': 'READY_TO_SUBMIT',
          'EXTERNAL_EVENT': 'IN_REVIEW'
        }[kind],
    'object_version': version,
    'content_sha256': projectDigest(data),
    'data': data
  };
}

Map<String, dynamic> projectCatalogueData() => {
      'items': [
        {
          'id': projectKey,
          'kind': 'PROJECT',
          'title': '风从海边来',
          'scope': projectScopeData(),
          'channel_reference': null,
          'roles': [
            {'id': roleKey, 'object_version': 3, ...projectData('ROLE')['data']}
          ]
        },
        {
          'id': channelKey,
          'kind': 'CHANNEL',
          'title': '已核验渠道',
          'scope': null,
          'channel_reference': '渠道参考编号',
          'roles': []
        }
      ]
    };
Map<String, dynamic> projectSupply(String kind) => {
      'id': kind == 'AVATAR' ? avatarKey : consentKey,
      'kind': kind,
      'stream_ref': avatarKey,
      'revision': 1,
      'owner_party_id': personId,
      'created_by': accountId,
      'current_status': kind == 'AVATAR' ? 'RECORDED' : 'APPROVED',
      'object_version': 2,
      'data': kind == 'AVATAR'
          ? {
              'display_name': '本人的登记资料',
              'material_asset_ids': [assetKey],
              'provider_asset_ref': null
            }
          : {
              'consent': {
                'avatar_id': avatarKey,
                'subject_party_id': personId,
                'features': ['FACE', 'VOICE'],
                'purposes': ['RELEASE', 'PUBLIC_SHARE'],
                'territories': ['CN'],
                'valid_from': '2020-01-01T00:00:00.000Z',
                'valid_until': '2030-01-01T00:00:00.000Z',
                'terms': '本人同意当前项目公开用途。',
                'evidence_asset_ids': [assetKey]
              },
              'review': null,
              'withdrawal': null,
              'signing_method': 'IN_APP_DECLARATION',
              'identity_verification': 'NOT_VERIFIED'
            }
    };
FakeAccountAdapter projectsAdapter(
    {ResponseBody? Function(RequestOptions)? override}) {
  late FakeAccountAdapter a;
  final confirmations = <Map<String, dynamic>>[];
  var candidateStatus = 'SELECTED';
  a = FakeAccountAdapter(handler: (r) {
    final special = override?.call(r);
    if (special != null) return special;
    if (r.path == '/api/v1/projects/catalogue') {
      return envelope(projectCatalogueData());
    }
    if (r.path == '/api/v1/projects/projects') {
      return envelope({
        'items': [projectData('PROJECT')],
        'next_cursor': null
      });
    }
    if (r.path.startsWith('/api/v1/supply/records')) {
      return envelope({
        'items': [projectSupply(r.queryParameters['kind'])],
        'next_cursor': null
      });
    }
    if (r.path.endsWith('/readiness')) {
      return envelope({
        'current_status': 'BLOCKED',
        'reason_code': 'PROJECT_CONFIRMATIONS_REQUIRED'
      });
    }
    if (r.path.endsWith('/confirmations')) {
      if (r.method == 'POST') {
        if (!confirmations.any((c) =>
            c['party_id'] == personId &&
            c['content_sha256'] == r.data['content_sha256'])) {
          confirmations.add({
            'party_id': personId,
            'account_id': accountId,
            'content_sha256': r.data['content_sha256'],
            'decision': r.data['decision'],
            'reason': r.data['reason']
          });
        }
        return envelope(
            projectData(r.path.contains(planKey) ? 'PLAN' : 'EDITION'));
      }
      return envelope({'items': confirmations});
    }
    if (r.path.endsWith('/records') &&
        r.path.startsWith('/api/v1/projects/projects/')) {
      return envelope({
        'items': [projectData(r.queryParameters['kind'])],
        'next_cursor': null
      });
    }
    if (r.path.startsWith('/api/v1/projects/records/')) {
      final id = r.path.split('/').last;
      final kinds = {
        'PROJECT': projectKey,
        'ROLE': roleKey,
        'CANDIDATE': candidateKey,
        'PLAN': planKey,
        'EDITION': editionKey,
        'CHANNEL': channelKey,
        'RELEASE': releaseKey,
        'EXTERNAL_EVENT': eventKey
      };
      final kind = kinds.entries.firstWhere((x) => x.value == id).key;
      return envelope(projectData(kind,
          status: kind == 'CANDIDATE' ? candidateStatus : null));
    }
    if (r.method == 'POST' && r.path.endsWith('/applications')) {
      candidateStatus = 'APPLIED';
      return envelope(projectData('CANDIDATE', status: candidateStatus));
    }
    if (r.method == 'POST' && r.path.endsWith('/responses')) {
      candidateStatus = r.data['decision'] == 'ACCEPT' ? 'APPLIED' : 'DECLINED';
      return envelope(projectData('CANDIDATE', status: candidateStatus));
    }
    if (r.method == 'POST' && r.path.endsWith('/decisions')) {
      candidateStatus =
          r.data['decision'] == 'CONFIRM' ? 'CONFIRMED' : 'WITHDRAWN';
      return envelope(projectData('CANDIDATE', status: candidateStatus));
    }
    if (r.method == 'POST' && r.path.endsWith('/releases')) {
      return envelope(projectData('RELEASE', status: 'INTERNAL_PENDING'));
    }
    if (r.method == 'POST' && r.path.endsWith('/external-events')) {
      return envelope(projectData('EXTERNAL_EVENT'));
    }
    return a.defaultReply(r);
  });
  return a;
}
