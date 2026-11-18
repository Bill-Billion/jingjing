import 'package:jingjingshangri_app/account/account_session.dart';

import '../account/fake_account_api.dart';

const requestId = '77777777-7777-4777-8777-777777777777';
const secondRequestId = '88888888-8888-4888-8888-888888888888';
const templateId = '99999999-9999-4999-8999-999999999999';
const secondTemplateId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const submissionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const supplementId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const nextSubmissionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

Map<String, dynamic> template({bool second = false, bool attachment = false}) =>
    {
      'title': second ? '人生片段' : '家庭故事',
      'description': '合成测试表单，非正式商品。',
      'fields': [
        {
          'key': second ? 'moment' : 'story',
          'label': second ? '难忘的片段' : '故事内容',
          'type': 'TEXT',
          'required': true,
          'max_length': 1200,
        },
        if (!second)
          {
            'key': 'style',
            'label': '希望的风格',
            'type': 'CHOICE',
            'required': false,
            'options': ['温暖', '纪实'],
          },
        if (attachment)
          {
            'key': 'proof',
            'label': '私有授权材料',
            'type': 'PRIVATE_ATTACHMENT',
            'required': true,
          },
      ],
    };
Map<String, dynamic> category({
  bool second = false,
  bool attachment = false,
}) =>
    {
      'template_version_id': second ? secondTemplateId : templateId,
      'category_code': second ? 'LIFE' : 'FAMILY',
      'template_version': 1,
      'template_snapshot': template(second: second, attachment: attachment),
      'submission_available': true,
      'unavailable_reason': null,
    };
Map<String, dynamic> story({
  String id = requestId,
  String status = 'DRAFT',
  String formalId = submissionId,
  int version = 1,
  Map<String, String> answers = const {'story': '保存过的文字', 'style': ''},
  bool attachment = false,
}) =>
    {
      'id': id,
      'party_id': personId,
      'created_by': accountId,
      'template_version_id': templateId,
      'template_snapshot': template(attachment: attachment),
      'answers': answers,
      'current_status': status,
      'object_version': version,
      'submission': status == 'DRAFT'
          ? null
          : {
              'id': formalId,
              'answers': answers,
              'template_snapshot': template(attachment: attachment),
              'content_sha256': 'c' * 64,
              'submitted_by': accountId,
              'submitted_at': '2026-10-17T01:00:00.000Z',
            },
      'submitted_at': status == 'DRAFT' ? null : '2026-10-17T01:00:00.000Z',
      'intake_at': status == 'INTAKE' ? '2026-10-17T02:00:00.000Z' : null,
      'intake_by': status == 'INTAKE' ? orgId : null,
      'allowed_actions': [
        'READ',
        if (status == 'DRAFT') ...['SAVE', 'SUBMIT'],
      ],
    };
Map<String, dynamic> summary({
  String id = requestId,
  String status = 'DRAFT',
}) =>
    {
      'id': id,
      'party_id': personId,
      'template_version_id': templateId,
      'category_title': '家庭故事',
      'current_status': status,
      'object_version': 1,
      'submitted_at': status == 'DRAFT' ? null : '2026-10-17T01:00:00.000Z',
      'intake_at': status == 'INTAKE' ? '2026-10-17T02:00:00.000Z' : null,
      'allowed_actions': [
        'READ',
        if (status == 'DRAFT') ...['SAVE', 'SUBMIT'],
      ],
    };
Future<AccountSession> storySession(FakeAccountAdapter adapter) async {
  final session = AccountSession(api: adapter.createApi());
  await session.login('13800000000', invitationId, '123456');
  session.select(identity(personId));
  return session;
}

Map<String, dynamic> supplementContext({
  int version = 4,
  bool open = true,
  bool empty = false,
  Map<String, String> answers = const {'story': '补充草稿文字', 'style': ''},
  Map<String, String> responses = const {'story': '补充说明'},
}) =>
    {
      'request_id': requestId,
      'object_version': version,
      'supplement': empty
          ? null
          : {
              'id': supplementId,
              'base_submission_id': submissionId,
              'items': [
                {
                  'field_key': 'story',
                  'reason': '背景不够明确',
                  'instruction': '补充故事的发生时间与人物关系。'
                },
              ],
              'current_status': open ? 'OPEN' : 'RESPONDED',
              'requested_by': orgId,
              'requested_at': '2026-10-20T01:00:00.000Z',
              'response': open
                  ? null
                  : {
                      'submission_id': nextSubmissionId,
                      'responses': responses,
                      'submitted_at': '2026-10-20T03:00:00.000Z',
                    },
            },
      'draft':
          !empty && open ? {'answers': answers, 'responses': responses} : null,
      'allowed_actions': [
        'READ',
        if (!empty && open) ...['SAVE_SUPPLEMENT', 'SUBMIT_SUPPLEMENT']
      ],
    };

Map<String, dynamic> historySummary(
        {String id = submissionId, int number = 1}) =>
    {
      'id': id,
      'submission_number': number,
      'submitted_by': accountId,
      'submitted_at': '2026-10-20T03:00:00.000Z',
      'content_sha256': 'c' * 64,
    };

Map<String, dynamic> submissionVersion({bool supplemented = true}) => {
      'request_id': requestId,
      'submission_number': supplemented ? 2 : 1,
      'submission': {
        ...story(status: 'SUBMITTED')['submission'],
        'id': supplemented ? nextSubmissionId : submissionId,
      },
      'supplement_response': supplemented
          ? {
              'supplement_id': supplementId,
              'base_submission_id': submissionId,
              'items': supplementContext()['supplement']['items'],
              'responses': {'story': '当时的正式回复'},
              'requested_by': orgId,
              'requested_at': '2026-10-20T01:00:00.000Z',
            }
          : null,
    };

Map<String, dynamic> storyQuoteSummary(String id,
        {String? orderId, bool current = true}) =>
    {
      'id': id,
      'submission_id': submissionId,
      'source_content_sha256': 'c' * 64,
      'source_is_current': current,
      'current_status': orderId == null ? 'APPROVED' : 'ACCEPTED',
      'object_version': 2,
      'content_sha256': 'c' * 64,
      'order_id': orderId,
    };
