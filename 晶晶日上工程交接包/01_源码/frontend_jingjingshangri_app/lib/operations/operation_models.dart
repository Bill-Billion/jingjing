import '../account/account_api.dart';
import '../contracts/contract_api.dart';

const operationDomains = {
  'TRADE': '交易',
  'PRODUCTION': '制作',
  'PROJECTS': '项目',
  'FINANCE': '结算',
  'SUPPLY': '作品与供给',
  'LICENSE': '剧本许可',
  'GIGS': '商单'
};
void operationRequire(bool value) {
  if (!value) {
    throw const AccountError(502, 'INVALID_OPERATIONS_RESPONSE',
        uncertain: true);
  }
}

bool operationId(dynamic v) => v is String && isContractId(v);
bool operationText(dynamic v, int max) =>
    v is String && v.trim().isNotEmpty && v.runes.length <= max;
bool operationNumber(dynamic v) => v is int && v > 0 && v <= 9007199254740991;
bool operationTime(dynamic v) =>
    v is String &&
    RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$').hasMatch(v) &&
    DateTime.tryParse(v)?.toUtc().toIso8601String().substring(0, 19) ==
        v.substring(0, 19);
Map<String, dynamic> operationMap(dynamic v, List<String> keys) {
  operationRequire(
      v is Map && v.length == keys.length && keys.every(v.containsKey));
  return Map<String, dynamic>.from(v as Map);
}

List<dynamic> operationList(dynamic v) {
  operationRequire(v is List && v.length <= 100);
  return List.from(v as List);
}

class OperationNotice {
  OperationNotice._(this.raw);
  final Map<String, dynamic> raw;
  int get id => raw['id'];
  String get domain => raw['domain'];
  String get recordId => raw['record_id'];
  String get code => raw['event_code'];
  int get version => raw['object_version'];
  bool get read => raw['read'];
  String get createdAt => raw['created_at'];
  static OperationNotice parse(dynamic v) {
    final d = operationMap(v, [
      'id',
      'domain',
      'record_id',
      'event_code',
      'object_version',
      'read',
      'created_at'
    ]);
    operationRequire(operationNumber(d['id']) &&
        operationDomains.containsKey(d['domain']) &&
        operationId(d['record_id']) &&
        operationText(d['event_code'], 80) &&
        operationNumber(d['object_version']) &&
        d['read'] is bool &&
        operationTime(d['created_at']));
    return OperationNotice._(d);
  }
}

class ObjectComment {
  ObjectComment._(this.raw);
  final Map<String, dynamic> raw;
  String get id => raw['id'];
  String get domain => raw['domain'];
  String get recordId => raw['record_id'];
  String get author => raw['author_account_id'];
  String? get party => raw['party_id'];
  String? get replyTo => raw['reply_to'];
  String? get body => raw['body'];
  String get status => raw['current_status'];
  int get version => raw['object_version'];
  String get createdAt => raw['created_at'];
  static ObjectComment parse(dynamic v, {String? domain, String? recordId}) {
    final d = operationMap(v, [
      'id',
      'domain',
      'record_id',
      'author_account_id',
      'party_id',
      'reply_to',
      'body',
      'current_status',
      'object_version',
      'created_at'
    ]);
    operationRequire(operationId(d['id']) &&
        operationDomains.containsKey(d['domain']) &&
        (domain == null || d['domain'] == domain) &&
        operationId(d['record_id']) &&
        (recordId == null || d['record_id'] == recordId) &&
        operationId(d['author_account_id']) &&
        (d['party_id'] == null || operationId(d['party_id'])) &&
        (d['reply_to'] == null || operationId(d['reply_to'])) &&
        ['VISIBLE', 'WITHDRAWN', 'HIDDEN'].contains(d['current_status']) &&
        (d['current_status'] == 'VISIBLE'
            ? operationText(d['body'], 4000)
            : d['body'] == null) &&
        operationNumber(d['object_version']) &&
        operationTime(d['created_at']));
    return ObjectComment._(d);
  }
}

class OperationSource {
  const OperationSource(
      {required this.domain,
      required this.id,
      required this.kind,
      required this.title,
      required this.route});
  final String domain, id, kind, title, route;
  bool get canComment => ({
            'TRADE': ['ORDER'],
            'PRODUCTION': ['PROJECT', 'VERSION'],
            'PROJECTS': ['PROJECT']
          }[domain] ??
          [])
      .contains(kind);
  String get commentTitle => domain == 'TRADE'
      ? '订单留言'
      : kind == 'VERSION'
          ? '版本留言'
          : '项目留言';
}

String operationEvent(String code) =>
    const {
      'COMMENT_CREATED': '有新的对象留言',
      'PROJECT_STARTED': '项目已开工',
      'PROJECT_CANCELLED': '项目已取消',
      'PROJECT_CREATED': '新增项目记录',
      'PLAN_CONFIRMED': '方案有新的确认记录',
      'EDITION_CONFIRMED': '成片有新的确认记录',
      'CONFIRMED': '有新的准确版本确认',
      'VERSION_CREATED': '制作有新版本',
      'FEEDBACK_CREATED': '制作版本有新反馈',
      'FEEDBACK_RECORDED': '制作版本有新反馈',
      'VERSION_ACCEPTED': '版本有新的验收决定',
      'PAYMENT_SUCCEEDED': '付款核对有新的成功记录',
      'REFUND_SUCCEEDED': '退款核对有新的成功记录',
      'PAYOUT_CREATED': '有新的付款申请',
      'AGREEMENT_CREATED': '有新的结算约定',
      'SETTLEMENT_CREATED': '有新的结算单',
      'DISPUTE_CREATED': '有新的异议记录',
      'RESPONSE_CREATED': '异议有新的回复',
      'RELATION_ENDED': '直接合作有新的结束记录',
      'OFFER_CREATED': '有新的商单提案',
      'QUOTE_CREATED': '有新的报价',
      'ORDER_CREATED': '有新的订单',
      'RELEASE_CREATED': '有新的发行申请'
    }[code] ??
    '业务记录有新的变更';
String operationError(AccountError e, {bool writing = false}) {
  if (writing && e.uncertain) return '操作结果尚未确认。原请求与内容已保留，请先恢复原请求核对。';
  if (e.status == 412) return '留言状态或版本已更新，请重新查看并重新决定撤回。旧决定不会自动重放。';
  return const {
        'COMMENT_REPLY_MISMATCH': '这条回复已不可见或不属于同一对象，请重新选择可见留言。',
        'COMMENT_AUTHOR_REQUIRED': '只能撤回当前账号以当前身份发布的留言。',
        'COMMENT_ALREADY_HIDDEN': '留言已撤回或隐藏，请刷新当前记录。',
        'COMMENT_TARGET_NOT_SUPPORTED': '这类业务对象暂不支持留言。',
        'PARTY_ACTION_FORBIDDEN': '当前身份成员资格已失效，私有内容已清空。',
        'INVALID_OPERATIONS_RESPONSE': '服务器未返回有效的通知或留言，请重新核对。'
      }[e.code] ??
      (e.status == 401
          ? '登录已失效，请重新验证手机号。'
          : [403, 404].contains(e.status)
              ? '记录不存在或当前身份无权查看，私有内容已清空。'
              : e.status == 0 || e.status == 503
                  ? '暂时无法核对，请稍后恢复原请求。'
                  : e.message);
}
