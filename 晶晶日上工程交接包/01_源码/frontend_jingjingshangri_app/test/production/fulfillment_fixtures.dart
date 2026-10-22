import 'package:dio/dio.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_fixtures.dart';
import 'production_fixtures.dart';

const deliveryId = 'e0000000-0000-4000-8000-000000000010';
const caseId = 'e0000000-0000-4000-8000-000000000011';
const fulfillmentDate = '2026-10-22T00:00:00.000Z';
Map<String, dynamic> fulfillmentTerms() => {
      'version': 'V5-Q05-Q06',
      'source_ref': 'synthetic-test',
      'preview_payment_order': 'PREVIEW_BEFORE_INTERIM',
      'acceptance_hours': 168,
      'cancellation_terms': '按原约定及独立取消决定核对实际退款。'
    };
Map<String, dynamic> fulfillmentProjectData(
    {String stage = 'SCRIPT', bool accepted = false}) {
  final r = productionData('PROJECT', stage: stage, accepted: accepted);
  r['data']['specification']['customization_delivery'] = fulfillmentTerms();
  return r;
}

Map<String, dynamic> fulfillmentData(
        {int version = 4,
        String state = 'STARTED',
        bool viewed = false,
        bool received = false,
        bool issue = false,
        bool cancelled = false}) =>
    {
      'project_id': productionProjectId,
      'order_id': orderId,
      'object_version': version,
      'format': 'v5-customization-fulfillment-v1',
      'source': {
        'request_id': otherVersionId,
        'submission_id': productionVersionId,
        'content_sha256': 'c' * 64
      },
      'terms': fulfillmentTerms(),
      'uses_identifiable_people': false,
      'cast': [],
      'cast_snapshot': [],
      'state': cancelled
          ? 'REFUND_REQUIRED'
          : issue
              ? 'PAUSED'
              : state,
      'started_at': fulfillmentDate,
      'receipt': {
        'delivery_id': deliveryId,
        'version_id': productionVersionId,
        'notification_event_id': 71,
        'view_observed_at': viewed ? fulfillmentDate : null,
        'buyer_account_id': viewed ? accountId : null,
        'notified_at': received ? fulfillmentDate : null,
        'started_at': received ? fulfillmentDate : null,
        'deadline_at': received ? '2026-10-29T00:00:00.000Z' : null,
        'job_id': received ? otherVersionId : null
      },
      'creative_changes': 1,
      'additional_creative_changes': 0,
      'completion': null,
      'cancellation': cancelled
          ? {
              'case_id': caseId,
              'retained_minor': 1000,
              'refund_minor': 2000,
              'received_minor': 3000,
              'approved_at': fulfillmentDate,
              'reviewer': orgId,
              'actual_refunded_minor': 0
            }
          : null,
      'cases': issue || cancelled
          ? [
              {
                'id': caseId,
                'current_status': cancelled ? 'RESOLVED' : 'OPEN',
                'created_by': accountId,
                'change_order_id': null,
                'data': {
                  'kind': cancelled ? 'CANCEL' : 'FILE_UNAVAILABLE',
                  'reason': '真实文件不能打开，请核对原版本。',
                  'evidence_asset_ids': [],
                  'opened_at': fulfillmentDate,
                  'opened_by_party_id': personId,
                  'resolution': cancelled
                      ? {
                          'decision': 'CANCEL',
                          'reason': '独立核对应退金额，尚未退款。',
                          'reviewer': orgId,
                          'at': fulfillmentDate,
                          'retained_minor': 1000,
                          'change_order_id': null
                        }
                      : null
                }
              }
            ]
          : [],
    };
Map<String, dynamic> fulfillmentStoryData() => {
      'request_id': otherVersionId,
      'submission_id': productionVersionId,
      'content_sha256': 'c' * 64,
      'template_snapshot': {
        'title': '原故事',
        'description': '订单固定版本',
        'fields': [
          {
            'key': 'story',
            'label': '故事正文',
            'type': 'TEXT',
            'required': true,
            'max_length': 12000
          }
        ]
      },
      'answers': {'story': '原订单固定的私人故事，不因重填需求而改变。'},
    };
FakeAccountAdapter fulfillmentAdapter(
        {String stage = 'SCRIPT',
        bool viewed = false,
        ResponseBody? Function(RequestOptions)? override}) =>
    productionAdapter(
        stage: stage,
        override: (r) {
          final custom = override?.call(r);
          if (custom != null) return custom;
          if (r.path == '/api/v1/production/records/$productionProjectId') {
            return envelope(fulfillmentProjectData(stage: stage));
          }
          if (r.path == '/api/v1/production/projects') {
            return envelope({
              'items': [fulfillmentProjectData(stage: stage)],
              'next_cursor': null
            });
          }
          if (r.path.endsWith('/fulfillment')) {
            return envelope(fulfillmentData(viewed: viewed));
          }
          if (r.path.endsWith('/story')) {
            return envelope(fulfillmentStoryData());
          }
          if (r.path.endsWith('/cases')) {
            return envelope(fulfillmentData(version: 5, issue: true));
          }
          if (r.path.endsWith('/delivery-receipt')) {
            return envelope(
                fulfillmentData(version: 5, viewed: true, received: true));
          }
          if (r.path == '/api/v1/operations/notifications') {
            return envelope({
              'items': [
                {
                  'id': 71,
                  'domain': 'PRODUCTION',
                  'record_id': productionVersionId,
                  'event_code': 'CUSTOMIZATION_FORMAL_DELIVERY',
                  'object_version': 3,
                  'read': false,
                  'created_at': fulfillmentDate
                }
              ],
              'next_cursor': null
            });
          }
          if (r.path == '/api/v1/operations/notifications/71/read') {
            return envelope({'id': 71, 'read': true});
          }
          return null;
        });
