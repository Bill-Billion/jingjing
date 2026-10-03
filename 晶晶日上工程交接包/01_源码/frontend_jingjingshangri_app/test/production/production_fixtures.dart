import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_fixtures.dart';

const productionProjectId = 'e0000000-0000-4000-8000-000000000001';
const productionVersionId = 'e0000000-0000-4000-8000-000000000002';
const productionFileId = 'e0000000-0000-4000-8000-000000000003';
const productionFeedbackId = 'e0000000-0000-4000-8000-000000000004';
const otherVersionId = 'e0000000-0000-4000-8000-000000000005';
const scriptBody = '第一场　旧车站\n林：这次，我想把那句话说完。\n此段正文来自当前私有版本。';
Uint8List productionBytes() => Uint8List.fromList(utf8.encode(scriptBody));
Map<String, dynamic> productionData(String kind,
    {String stage = 'SCRIPT',
    bool accepted = false,
    int version = 3,
    String? status}) {
  final data = <String, dynamic>{};
  if (kind == 'PROJECT') {
    data.addAll({
      'line_id': 'production',
      'buyer_party_id': personId,
      'merchant_party_id': orgId,
      'producer_party_id': orgId,
      'script_version_id': otherVersionId,
      'license_project_id': null,
      'assignee_account_id': accountId,
      'purpose': '私人使用',
      'territory': '中国',
      'consent_ids': [],
      'evidence_asset_id': productionFileId,
      'specification': quoteData()['lines'][0]['specification'],
      'quantity': 1,
      'contract_sha256': 'c' * 64,
      'current': {stage: productionVersionId},
      'accepted': accepted ? {stage: productionVersionId} : <String, dynamic>{},
      'revisions': {stage: 2},
      'change_requests': 1,
      'review': reviewData()
    });
  }
  if (kind == 'VERSION') {
    data.addAll({
      'stage': stage,
      'revision': 2,
      'file_id': productionFileId,
      'preview_file_id': productionFileId,
      'basis_version_id': stage == 'SCRIPT' ? null : otherVersionId,
      'note': '已按上一版意见调整对白节奏。',
      'review': reviewData()
    });
  }
  if (kind == 'FILE') {
    data.addAll({
      'object_key': 'private/production/not-a-public-url',
      'media_type': stage == 'SCRIPT' ? 'text/plain' : 'video/mp4',
      'byte_size': productionBytes().length,
      'content_sha256': sha256.convert(productionBytes()).toString()
    });
  }
  if (kind == 'FEEDBACK') {
    data.addAll({
      'version_id': productionVersionId,
      'stage': stage,
      'decision': 'REQUEST_CHANGES',
      'note': '请放慢对白，保留当前配乐。',
      'checklist': null
    });
  }
  return {
    'id': {
      'PROJECT': productionProjectId,
      'VERSION': productionVersionId,
      'FILE': productionFileId,
      'FEEDBACK': productionFeedbackId
    }[kind],
    'kind': kind,
    'project_id': kind == 'PROJECT' ? null : productionProjectId,
    'order_id': orderId,
    'created_by': accountId,
    'current_status': status ??
        {
          'PROJECT': accepted && stage == 'FINAL' ? 'ACCEPTED' : 'IN_PROGRESS',
          'VERSION': 'APPROVED',
          'FILE': 'READY',
          'FEEDBACK': 'RECORDED'
        }[kind],
    'object_version': version,
    'content_sha256': 'c' * 64,
    'data': data
  };
}

Map<String, dynamic> reviewData() => {
      'decision': 'APPROVED',
      'reason': '已人工核对内容与标识。',
      'verification': {'script_reviewed': true},
      'account_id': accountId,
      'method': 'EXTERNAL_MANUAL_REVIEW'
    };
Map<String, dynamic> generationReadiness() => {
      'provider_code': 'production-provider',
      'environment': 'SANDBOX',
      'config_revision': '1',
      'current_status': 'NOT_ENABLED',
      'reason_code': 'PROVIDER_NOT_ENABLED'
    };
ResponseBody binaryReply([Uint8List? bytes]) =>
    ResponseBody.fromBytes(bytes ?? productionBytes(), 200, headers: {
      'content-type': ['application/octet-stream'],
      'cache-control': ['no-store']
    });

FakeAccountAdapter productionAdapter(
    {String stage = 'SCRIPT',
    bool accepted = false,
    bool paid = false,
    ResponseBody? Function(RequestOptions)? override}) {
  late FakeAccountAdapter adapter;
  adapter = FakeAccountAdapter(handler: (r) {
    final response = override?.call(r);
    if (response != null) return response;
    if (r.path.endsWith('/content')) return binaryReply();
    if (r.path == '/api/v1/production/projects') {
      return envelope({
        'items': [productionData('PROJECT', stage: stage, accepted: accepted)],
        'next_cursor': null
      });
    }
    if (r.path.endsWith('/generation-readiness')) {
      return envelope(generationReadiness());
    }
    if (r.path.endsWith('/records') &&
        r.path.startsWith('/api/v1/production/')) {
      return envelope({
        'items': r.queryParameters['kind'] == 'VERSION'
            ? [productionData('VERSION', stage: stage)]
            : r.queryParameters['kind'] == 'FEEDBACK'
                ? [productionData('FEEDBACK', stage: stage)]
                : [],
        'next_cursor': null
      });
    }
    if (r.path == '/api/v1/production/records/$productionProjectId') {
      return envelope(
          productionData('PROJECT', stage: stage, accepted: accepted));
    }
    if (r.path == '/api/v1/production/records/$productionVersionId') {
      return envelope(productionData('VERSION', stage: stage));
    }
    if (r.path == '/api/v1/production/records/$productionFileId') {
      return envelope(productionData('FILE', stage: stage));
    }
    if (r.path == '/api/v1/production/records/$productionFeedbackId' ||
        r.path.endsWith('/feedback')) {
      return envelope(productionData('FEEDBACK', stage: stage));
    }
    if (r.path.endsWith(orderId)) {
      final o = tradeData('ORDER', status: paid ? 'PAID' : 'PARTIALLY_PAID');
      if (paid) {
        o['data']['financial'] = {
          'received_minor': 128001,
          'refunded_minor': 0,
          'net_minor': 128001
        };
      }
      return envelope(o);
    }
    if (r.path == '/api/v1/trade/records') {
      return envelope({'items': [], 'next_cursor': null});
    }
    return adapter.defaultReply(r);
  });
  return adapter;
}
