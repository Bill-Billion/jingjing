import 'package:jingjingshangri_app/account/account_session.dart';
import '../account/fake_account_api.dart';

const snapshotId = '77777777-7777-4777-8777-777777777777';
const otherSnapshotId = '88888888-8888-4888-8888-888888888888';
const ruleId = '99999999-9999-4999-8999-999999999999';
const otherRuleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
Map<String, dynamic> ruleData(
        {String id = ruleId, String version = '2026.1'}) =>
    {
      'format_version': 'rule-content-v1',
      'id': id,
      'rule_key': '历史制作规则',
      'version': version,
      'terms': {
        '修改次数': 2,
        '内容': {
          '说明': '<script>alert("plain text")</script>',
          '范围': ['样片', '成片']
        },
        '未约定': null
      },
      'content_sha256': 'a' * 64,
    };
Map<String, dynamic> snapshotData({String id = snapshotId}) => {
      'format_version': 'contract-content-v1',
      'id': id,
      'contract_version_id': otherSnapshotId,
      'party_ids': [orgId, personId],
      'created_at': '2026-09-01T09:00:00.000Z',
      'rule_contents': [
        ruleData(),
        ruleData(id: otherRuleId, version: '2026.2')
      ],
      'commitments': {
        '特别约定': '仅供当前授权账号阅读',
        '阶段': [
          {'名称': '样片', '次数': 2}
        ]
      },
      'object_version': 1,
      'current_status': 'SEALED',
      'signing_method': 'NOT_SIGNED',
      'content_sha256': 'b' * 64,
    };
Map<String, dynamic> readinessData(
        {String action = 'START_PAYMENT',
        String status = 'NOT_ENABLED',
        String? reason = 'PROVIDER_NOT_IMPLEMENTED'}) =>
    {
      'action': action,
      'environment': 'SANDBOX',
      'current_status': status,
      'reason_code': reason,
    };
Future<AccountSession> contractSession(FakeAccountAdapter adapter,
    {bool owner = true}) async {
  final session = AccountSession(api: adapter.createApi());
  await session.login('13800000000', invitationId, '123456');
  session.select(identity(orgId, owner: owner));
  return session;
}
