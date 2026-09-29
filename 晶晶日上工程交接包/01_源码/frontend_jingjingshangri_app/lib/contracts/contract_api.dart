import '../account/account_api.dart';
import '../account/account_session.dart';

const contractActions = {
  'START_PAYMENT': '支付服务',
  'START_IDENTITY_CHECK': '身份核验服务',
  'START_SIGNING': '签署服务',
  'START_DIGITAL_HUMAN': '数字人服务',
};
const readinessReasons = {
  'PROVIDER_NOT_IMPLEMENTED': '这项服务尚未接入。',
  'PROVIDER_NOT_CONFIGURED': '这项服务尚未配置完成。',
  'PROVIDER_ENVIRONMENT_NOT_VERIFIED': '当前服务环境尚未完成验证。',
  'PROVIDER_NOT_VERIFIED': '这项服务尚未通过验证。',
  'PROVIDER_CONFIGURATION_CHANGED': '服务配置已变化，需要重新验证。',
  'VERIFICATION_EVIDENCE_REQUIRED': '服务验证材料尚未齐全。',
  'PROVIDER_STATE_UNAVAILABLE': '暂时无法确认服务状态，请稍后重试。',
  'PROVIDER_ENVIRONMENT_MISMATCH': '服务环境不匹配，暂时无法使用。',
};

bool isContractId(String value) =>
    RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        .hasMatch(value);
void _require(bool valid) {
  if (!valid) throw const AccountError(502, 'INVALID_CONTRACT_RESPONSE');
}

bool _text(dynamic v, [int max = 1000]) =>
    v is String && v.isNotEmpty && v.length <= max;
bool _id(dynamic v) =>
    _text(v, 64) && RegExp(r'^[A-Za-z0-9][A-Za-z0-9_-]*$').hasMatch(v);
bool _hash(dynamic v) => v is String && RegExp(r'^[0-9a-f]{64}$').hasMatch(v);
void _keys(Map<String, dynamic> data, List<String> keys) =>
    _require(data.length == keys.length && keys.every(data.containsKey));

/// Uses the current PR11 opaque session, never the legacy API or disk cache.
class ContractApi {
  ContractApi(this.session);
  final AccountSession session;
  Future<Map<String, dynamic>> _read(String path,
      {Map<String, dynamic>? query}) {
    final party = session.partyId;
    if (party == null) throw const AccountError(400, 'CONTRACT_PARTY_REQUIRED');
    return session.read(path, actingParty: party, query: query);
  }

  void _input(String id) {
    if (!isContractId(id)) throw const AccountError(400, 'CONTRACT_ID_INVALID');
  }

  Future<Map<String, dynamic>> snapshot(String id) async {
    _input(id);
    final data = await _read('/api/v1/contract-snapshots/$id/content');
    _keys(data, [
      'format_version',
      'id',
      'contract_version_id',
      'party_ids',
      'created_at',
      'rule_contents',
      'commitments',
      'object_version',
      'current_status',
      'signing_method',
      'content_sha256'
    ]);
    _require(data['format_version'] == 'contract-content-v1' &&
        data['id'] == id &&
        _id(data['contract_version_id']) &&
        data['object_version'] == 1 &&
        data['current_status'] == 'SEALED' &&
        data['signing_method'] == 'NOT_SIGNED' &&
        _hash(data['content_sha256']));
    final parties = data['party_ids'];
    _require(parties is List &&
        parties.isNotEmpty &&
        parties.length <= 100 &&
        parties.every(_id) &&
        parties.toSet().length == parties.length &&
        parties.contains(session.partyId));
    _require(data['created_at'] is String &&
        DateTime.tryParse(data['created_at']) != null);
    _require(
        data['commitments'] is Map && (data['commitments'] as Map).isNotEmpty);
    final rules = data['rule_contents'];
    _require(rules is List && rules.isNotEmpty && rules.length <= 100);
    for (final rule in rules) {
      _require(rule is Map<String, dynamic>);
      validateRule(rule);
    }
    return data;
  }

  static void validateRule(Map<String, dynamic> data) {
    _keys(data, [
      'format_version',
      'id',
      'rule_key',
      'version',
      'terms',
      'content_sha256'
    ]);
    _require(data['format_version'] == 'rule-content-v1' &&
        _id(data['id']) &&
        _text(data['rule_key'], 100) &&
        _text(data['version'], 64) &&
        data['terms'] is Map &&
        (data['terms'] as Map).isNotEmpty &&
        _hash(data['content_sha256']));
  }

  Future<Map<String, dynamic>> rule(
      String snapshotId, Map<String, dynamic> captured) async {
    _input(snapshotId);
    _input(captured['id'] as String);
    final data = await _read('/api/v1/rule-versions/${captured['id']}/content',
        query: {'snapshot_id': snapshotId});
    validateRule(data);
    _require(data['id'] == captured['id'] &&
        data['version'] == captured['version'] &&
        data['content_sha256'] == captured['content_sha256'] &&
        data['rule_key'] == captured['rule_key']);
    return data;
  }

  Future<Map<String, dynamic>> readiness(String id, String action) async {
    _input(id);
    if (!contractActions.containsKey(action)) {
      throw const AccountError(400, 'CONTRACT_ACTION_INVALID');
    }
    final data = await _read(
        '/api/v1/contract-snapshots/$id/business-readiness',
        query: {'action': action});
    _keys(data, ['action', 'environment', 'current_status', 'reason_code']);
    _require(data['action'] == action &&
        ['SANDBOX', 'PRODUCTION'].contains(data['environment']) &&
        ((data['current_status'] == 'SERVICE_READY' &&
                data['reason_code'] == null) ||
            (data['current_status'] == 'NOT_ENABLED' &&
                readinessReasons.containsKey(data['reason_code']))));
    return data;
  }
}

String contractError(Object error) {
  if (error is! AccountError) return '内容格式无法识别，请重新读取。';
  switch (error.code) {
    case 'CONTRACT_ID_INVALID':
      return '请粘贴完整合同编号，并保留原有的小写字母和连接符。';
    case 'CONTRACT_PARTY_REQUIRED':
      return '请先在我的账号中选择办事身份。';
    case 'INVALID_CONTRACT_RESPONSE':
    case 'INVALID_RESPONSE':
      return '返回的内容不完整或格式无法识别，请稍后重新读取。';
    case 'CONTEXT_CHANGED':
      return '身份已变化，请使用当前身份重新读取。';
    case 'ACCOUNT_API_NOT_CONFIGURED':
      return '合同服务尚未配置，请稍后再试。';
  }
  switch (error.status) {
    case 400:
      return '读取条件不正确，请核对合同编号和当前身份。';
    case 401:
      return '登录已失效，请重新登录后读取。';
    case 403:
      return '当前账号暂时无法读取，请核对账号状态。';
    case 404:
      return '内容不存在或当前账号无权查看，请核对编号与办事身份。';
    case 429:
      return '读取过于频繁，请稍后再试。';
    case 503:
      return '内容暂时无法读取，请稍后重试。';
    default:
      return '读取失败，请检查网络后重试。';
  }
}
