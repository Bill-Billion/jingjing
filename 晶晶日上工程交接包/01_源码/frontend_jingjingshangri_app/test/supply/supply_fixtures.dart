import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import '../account/fake_account_api.dart';

const profileId = '77777777-7777-4777-8777-777777777777';
const versionId = '88888888-8888-4888-8888-888888888888';
const workId = '99999999-9999-4999-8999-999999999999';
const assetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const proofId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const laterId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
final bytes = Uint8List.fromList([65, 66, 67]);
Map<String, dynamic> assetData(
        {String id = assetId, String purpose = 'WORK_CONTENT'}) =>
    {
      'id': id,
      'owner_party_id': orgId,
      'purpose': purpose,
      'media_type': 'text/plain',
      'byte_size': bytes.length,
      'content_sha256': sha256.convert(bytes).toString(),
      'current_status': 'READY'
    };
Map<String, dynamic> profileData(
        {String id = profileId,
        int revision = 1,
        String status = 'APPROVED'}) =>
    {
      'id': id,
      'kind': 'PROFILE',
      'stream_ref': orgId,
      'revision': revision,
      'owner_party_id': orgId,
      'created_by': accountId,
      'current_status': status,
      'object_version': status == 'PENDING_REVIEW' ? 1 : 2,
      'data': {
        'display_name': '真实作者资料',
        'description': '我的作者介绍',
        'evidence_asset_ids': [proofId],
        'review': status == 'PENDING_REVIEW'
            ? null
            : {
                'decision': status,
                'reason': '材料符合当前要求',
                'reviewer_account_id': personId,
                'recorded_at': '2026-09-29T00:00:00.000Z'
              }
      }
    };
Map<String, dynamic> workData(
        {String id = versionId, int revision = 1, String status = 'DRAFT'}) =>
    {
      'id': id,
      'kind': 'WORK_VERSION',
      'stream_ref': workId,
      'revision': revision,
      'owner_party_id': orgId,
      'created_by': accountId,
      'current_status': status == 'SUBMITTED' ? 'AWAITING_REVIEW' : status,
      'object_version': status == 'DRAFT' ? 1 : 2,
      'data': {
        'version': {
          'content': {
            'id': id,
            'work_id': workId,
            'revision': revision,
            'kind': 'ORIGINAL',
            'source_version_id': null,
            'project_id': null,
            'owner_party_id': orgId,
            'title': '河岸边的故事',
            'content_asset_id': assetId,
            'content_sha256': sha256.convert(bytes).toString(),
            'evidence_ids': [proofId]
          },
          'object_version': status == 'DRAFT' ? 1 : 2,
          'current_status': status,
          'submitted_at': status == 'DRAFT' ? null : '2026-09-29T00:00:00.000Z',
          'reviews': <Map<String, dynamic>>[],
          'withdrawal': null
        },
        'credits': [
          {
            'party_id': orgId,
            'role': 'RIGHTS_HOLDER',
            'evidence_asset_ids': [proofId]
          }
        ]
      }
    };
Map<String, dynamic> profileBody() => {
      'display_name': '作者',
      'description': '介绍',
      'evidence_asset_ids': [proofId],
      'previous_profile_id': null
    };
