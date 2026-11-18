import '../account/account_api.dart';
import '../engagement/community_support.dart';

const contract20261029 = 'CONTRACT_20261029';

Map<String, dynamic> guardianRecord(Object? raw) {
  final r = communityMap(raw);
  communityRequire(communityId(r['id']) &&
      ['LINK', 'SPEND', 'INFORMATION', 'REFUND'].contains(r['kind']) &&
      communityId(r['guardian_account_id']) &&
      communityId(r['child_account_id']) &&
      r['object_version'] is int &&
      r['object_version'] > 0 &&
      r['current_status'] is String &&
      r['data'] is Map);
  return r;
}

Map<String, dynamic> infringementRecord(Object? raw) {
  final r = communityMap(raw);
  communityRequire(communityId(r['id']) &&
      r['object_version'] is int &&
      r['object_version'] > 0 &&
      r['current_status'] is String &&
      r['notice'] is Map &&
      r['deliveries'] is Map &&
      r['restriction_active'] is bool);
  return r;
}

Map<String, dynamic> closureClock(Object? raw) {
  final r = communityMap(raw);
  communityRequire(communityId(r['request_id']) &&
      r['object_version'] is int &&
      r['object_version'] > 0 &&
      [
        'NOT_VERIFIED',
        'VERIFICATION_PENDING',
        'TRACKING',
        'OVERDUE',
        'COMPLETED'
      ].contains(r['status']));
  if (r['verified_at'] != null) {
    communityRequire(DateTime.tryParse('${r['verified_at']}') != null &&
        r['due_on'] is String &&
        r['original_due_on'] is String);
  }
  return r;
}

Map<String, dynamic> handoverRecord(Object? raw) {
  final r = communityMap(raw);
  communityRequire(communityId(r['relation_id']) &&
      r['object_version'] is int &&
      r['object_version'] > 0 &&
      r['items'] is List &&
      r['policy'] == contract20261029 &&
      r['new_business_allowed'] == false);
  for (final row in communityRows(r['items'])) {
    communityRequire(
        communityId(row['order_id']) && row['acknowledgements'] is Map);
  }
  return r;
}

String? guardianActionReason(
    String action, Map<String, dynamic>? r, String? account) {
  if (action == 'invite') return null;
  if (r == null) return '请先读取这份关系或申请。';
  final status = r['current_status'],
      kind = r['kind'],
      guardian = r['guardian_account_id'] == account,
      child = r['child_account_id'] == account;
  if (action == 'review') {
    if (guardian || child) return '申请参与方不能独立审核自己的材料。';
    return status == 'IN_REVIEW' ? null : '这份申请当前不在独立审核阶段。';
  }
  if (action == 'refund') {
    return guardian && kind == 'REFUND' && status == 'APPROVED'
        ? null
        : '须由本关系监护人继续已独立审核的退款申请。';
  }
  if (kind != 'LINK') return '请打开本申请关联的监护关系。';
  if (['accept', 'reject'].contains(action)) {
    return child && status == 'INVITED' ? null : '只有受邀孩子本人可明确确认或拒绝。';
  }
  if (action == 'dispute') {
    return child && status == 'ACTIVE' ? null : '只有孩子本人可对有效关系提出异议。';
  }
  if (action == 'revoke') {
    return guardian && ['INVITED', 'IN_REVIEW', 'ACTIVE'].contains(status)
        ? null
        : '只有监护人可撤销尚未结束的关系。';
  }
  final d = communityMaybeMap(r['data']),
      until = DateTime.tryParse('${d['valid_until']}');
  if (status != 'ACTIVE' ||
      until == null ||
      !until.isAfter(DateTime.now().toUtc())) {
    return '关系未生效、已过期或暂停；请重新核对。';
  }
  if (action == 'session') return child ? null : '本次使用时段须由孩子本人申请。';
  return guardian ? null : '使用限制、信息处理和消费退款只能由本关系监护人办理。';
}

void validateGuardianControls(
    Map<String, dynamic> controls, Map<String, dynamic> record) {
  final rule = communityMaybeMap(communityMaybeMap(record['data'])['rule']);
  final terms = communityMaybeMap(rule['terms']);
  if (controls['enabled'] is! bool ||
      controls['daily_minutes'] is! int ||
      controls['daily_minutes'] < 1 ||
      terms['daily_minutes'] is! int ||
      controls['daily_minutes'] > terms['daily_minutes'] ||
      controls['single_minor'] is! int ||
      controls['daily_minor'] is! int ||
      controls['single_minor'] < 0 ||
      controls['single_minor'] > terms['single_minor'] ||
      controls['daily_minor'] < controls['single_minor'] ||
      controls['daily_minor'] > terms['daily_minor']) {
    throw const AccountError(400, '不能超过本关系独立审核的使用或消费上限');
  }
}

const sixStates = <String, String>{
  'NOT_VERIFIED': '尚未独立核验，不计算执行倒计时',
  'VERIFICATION_PENDING': '核验提案待独立复核',
  'TRACKING': '核验后执行中',
  'OVERDUE': '执行期限已逾期，待处理',
  'COMPLETED': '实际执行后已结案',
  'INVITED': '等待孩子本人确认',
  'IN_REVIEW': '等待独立审核',
  'DISPUTED': '关系有异议，已暂停',
  'CONSENT_RECORDED_SERVICE_DISABLED': '消费同意已记录，真实付款仍关闭',
  'REFUND_REQUESTED': '已送入原支付退款流程，非已到账',
  'NEEDS_INFO': '等待发起方补件',
  'SUBMITTED': '通知已提交',
  'FROZEN': '本案限制已生效',
  'NOTICE_DELIVERED': '必要通知材料已送达',
  'COUNTER_SUBMITTED': '反通知已提交',
  'COUNTER_DELIVERED': '必要反通知已送达',
  'WITHDRAWAL_REVIEW': '撤回待复核，限制仍有效',
  'REVIEW_PENDING': '处理结论待独立复核',
  'RESOLVED': '本案已有独立复核结论',
  'ACKNOWLEDGED': '双方交接已确认',
  'EXPIRED': '交接期已到期，补记不恢复沟通权限',
};
String sixState(Object? value) => sixStates[value] ?? communityState(value);

const sixBusinessErrors = <String, String>{
  'GUARDIAN_DISABLED': '监护人已关闭使用，请返回核对关系。',
  'MINOR_NIGHT_RESTRICTED': '北京时间22点至次日8点不可使用；不会自动申请新时段。',
  'GUARDIAN_USAGE_SESSION_REQUIRED': '本次一分钟使用时段已结束，请明确申请下一时段。',
  'MINOR_DAILY_TIME_LIMIT': '今日已达到审核的使用上限。',
  'MINOR_SPEND_NOT_ALLOWED': '本次金额超出审核限制，真实付款保持关闭。',
  'MINOR_DAILY_SPEND_LIMIT': '今天的消费同意累计已达到审核限制。',
  'MINOR_CONTENT_POOL_NOT_ENABLED': '适龄内容预览尚未启用。',
  'GUARDIAN_CONTENT_RULE_REQUIRED': '尚无独立审核的适龄内容名单。',
  'GUARDIAN_VERIFICATION_REQUIRED': '关系还需身份、关系及年龄独立核验。',
  'GUARDIAN_LINK_NOT_ACTIVE': '关系未生效、已过期、撤销或有异议。',
  'UNDER_14_PROCESSING_DISABLED': '未满14岁的实际处理仍关闭。',
  'SELF_REVIEW_FORBIDDEN': '需由未参与录入和本业务的独立人员复核。',
  'INDEPENDENT_RIGHTS_REVIEW_REQUIRED': '冻结者或提议人不能复核本案结论。',
  'DISCLOSURE_SCOPE_INVALID': '送达只能逐项选择本次通知原有的必要材料。',
  'DELIVERY_NOT_AVAILABLE': '目前没有可确认已读的送达材料。',
  'INFRINGEMENT_ACTION_NOT_ALLOWED': '案件状态已变化，请先读取当前进展。',
  'FINANCE_ROUNDING_REVIEW_REQUIRED': '历史分钱存在尾差异常，旧账保留，暂停新增付款并等待人工复核。',
};

String acceptanceOrigin(Map<String, dynamic> rule, {required bool audition}) =>
    rule['acceptance_policy'] == contract20261029
        ? (audition ? '从交付审核通过开始计48小时' : '从原订单下单开始计48小时')
        : '历史约定：从明确收讫开始，期限保留原单规则';
