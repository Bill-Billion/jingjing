import '../stock/v5_support.dart';

const noticeTypes = {
  'DRAMA': '剧与角色',
  'PERFORMANCE': '商演',
  'COMMERCIAL': '商单',
  'EVENT': '活动',
  'RECRUITMENT': '招募',
  'OFFICIAL': '平台官方'
};
const submissionKinds = {
  'PROFILE': '投递形象与模卡',
  'ROLE': '投递想演角色',
  'CREATE_DRAMA': '提交自己做剧的意向',
  'INVITATION': '向公开艺人发邀约意向'
};
const noticeStates = {
  'IN_REVIEW': '等待独立审核',
  'EFFECTIVE': '规则有效',
  'APPROVED': '资质已通过',
  'PUBLISHED': '已公开发布',
  'SENT': '已单向送达',
  'INTERESTED': '感兴趣，等待客服',
  'DECLINED': '已婉拒',
  'REJECTED': '未通过审核',
  'WITHDRAWN': '已撤回',
  'WAITING_SUPPORT': '客服待处理',
  'LINKED': '已关联原报价',
  'CLOSED': '已结束'
};
const noticeDetailFields = <String, Map<String, String>>{
  'DRAMA': {'synopsis': '剧情与项目简介', 'roles': '招募角色'},
  'PERFORMANCE': {'venue': '正规场地', 'schedule': '商演安排', 'requirements': '参与要求'},
  'COMMERCIAL': {'deliverables': '明确交付内容', 'requirements': '合作要求'},
  'EVENT': {'venue': '活动场地', 'schedule': '活动安排'},
  'RECRUITMENT': {'roles': '招募岗位或角色', 'requirements': '招募要求'},
  'OFFICIAL': {'summary': '官方事项'},
};

class NoticePublic {
  NoticePublic(dynamic value, {String? id}) : raw = v5Map(value) {
    v5Require(v5Id(raw['id']) &&
        (id == null || raw['id'] == id) &&
        v5Int(raw['object_version'], min: 1) &&
        v5Id(raw['rule_id']) &&
        raw['chat_enabled'] == false &&
        raw['official'] is bool);
    notice = v5Map(raw['notice']);
    validateNotice(notice);
    v5Require(raw['official'] == (notice['type'] == 'OFFICIAL') &&
        (raw['owner_party_id'] == null
            ? raw['official'] == true
            : v5Id(raw['owner_party_id'])));
  }
  final Map<String, dynamic> raw;
  late final Map<String, dynamic> notice;
  String get id => raw['id'];
}

void validateNotice(Map<String, dynamic> d) {
  v5Require(noticeTypes.containsKey(d['type']) &&
      d['title'] is String &&
      d['description'] is String &&
      d['city'] is String &&
      v5Date(d['valid_from']) &&
      v5Date(d['valid_until']) &&
      DateTime.parse(d['valid_from'])
          .isBefore(DateTime.parse(d['valid_until'])) &&
      d['accept_submissions'] is bool &&
      (d['project_id'] == null || v5Id(d['project_id'])));
  final details = v5Map(d['details']);
  v5Require(details.length == noticeDetailFields[d['type']]!.length &&
      noticeDetailFields[d['type']]!.keys.every((k) => details[k] is String));
}

class NoticeRule {
  NoticeRule(dynamic d) : raw = v5Map(d) {
    v5Require(v5Id(raw['id']) && v5Hash(raw['content_sha256']));
    rule = v5Map(raw['rule']);
    v5Require(rule['version'] is String &&
        rule['terms'] is String &&
        v5Int(rule['submission_days'], min: 1, max: 365));
    v5Require(rule['publishing_policy'] == null ||
        ['SCOUT_QUALIFIED', 'VERIFIED_ADULT_20261111']
            .contains(rule['publishing_policy']));
    final levels = v5Map(rule['minimum_levels']);
    v5Require(levels['EVENT'] == 3 &&
        levels['COMMERCIAL'] == 1 &&
        levels['RECRUITMENT'] == 1 &&
        levels['OFFICIAL'] == null);
  }
  final Map<String, dynamic> raw;
  late final Map<String, dynamic> rule;
  String get id => raw['id'];
  bool get ordinaryPublishing =>
      rule['publishing_policy'] == 'VERIFIED_ADULT_20261111';
}

class NoticeEligibility {
  NoticeEligibility(dynamic d, String ruleId) : raw = v5Map(d) {
    v5Require(raw['rule_id'] == ruleId &&
        v5Hash(raw['rule_sha256']) &&
        raw['active'] is bool &&
        v5Int(raw['level'], max: 6));
    final types = v5Rows(raw['types'], max: 6);
    v5Require(types.every(noticeTypes.containsKey) &&
        !types.contains('OFFICIAL') &&
        types.toSet().length == types.length);
    v5Ids(raw['source_ids'], max: 10000);
    v5Require(raw['reason'] == null || raw['reason'] is String);
  }
  final Map<String, dynamic> raw;
  bool canPublish(String type) =>
      raw['active'] == true && (raw['types'] as List).contains(type);
}

class NoticeRecord {
  NoticeRecord(dynamic d, String party, {String? id, String? kind})
      : raw = v5Map(d) {
    v5Require(v5Id(raw['id']) &&
        (id == null || raw['id'] == id) &&
        (kind == null || raw['kind'] == kind) &&
        ['NOTICE', 'SUBMISSION', 'CASE', 'QUALIFICATION', 'FACT', 'RULE']
            .contains(raw['kind']) &&
        [raw['owner_party_id'], raw['counterparty_id']].contains(party) &&
        v5Int(raw['object_version'], min: 1) &&
        v5Hash(raw['content_sha256']) &&
        noticeStates.containsKey(raw['current_status']));
    data = v5Map(raw['data']);
    if (raw['kind'] == 'NOTICE') validateNotice(v5Map(data['notice']));
    if (raw['kind'] == 'SUBMISSION') {
      final s = v5Map(data['submission']);
      v5Require(submissionKinds.containsKey(s['kind']) &&
          s['target_party_id'] == raw['counterparty_id'] &&
          v5Id(s['person_id']) &&
          v5Id(s['avatar_id']) &&
          v5Id(s['consent_id']) &&
          s['content'] is String &&
          s['purpose'] is String &&
          v5Date(data['expires_at']));
      v5Ids(s['material_asset_ids'], max: 6);
      for (final field in ['notice_snapshot', 'notice_acknowledgement']) {
        if (data[field] != null) {
          v5Require(v5Id(s['notice_id']) && raw['parent_id'] == s['notice_id']);
          NoticeHistorySnapshot(data[field], s['notice_id']);
          if (field == 'notice_acknowledgement') {
            v5Require(v5Id(v5Map(data[field])['account_id']));
          }
        }
      }
    }
    if (raw['kind'] == 'CASE') {
      v5Require(data['submission_id'] == raw['parent_id']);
      if (data['support_assignment'] != null) {
        final assignment = v5Map(data['support_assignment']);
        v5Require(assignment.keys.every(const {'account_id', 'assigned_at', 'mode'}.contains) &&
            v5Id(assignment['account_id']) &&
            v5Date(assignment['assigned_at']) &&
            ['ASSIGNED', 'QUOTE_CLAIM'].contains(assignment['mode']));
      }
      if (data['quote'] != null) {
        final q = v5Map(data['quote']);
        v5Require(v5Id(q['id']) &&
            v5Hash(q['content_sha256']) &&
            v5Id(q['buyer_party_id']) &&
            v5Id(q['merchant_party_id']));
      }
    }
    v5Require(raw['chat_enabled'] == null || raw['chat_enabled'] == false);
    v5Require(raw['order_id'] == null || v5Id(raw['order_id']));
  }
  final Map<String, dynamic> raw;
  late final Map<String, dynamic> data;
  String get id => raw['id'];
  NoticeHistorySnapshot? get originalNoticeSnapshot =>
      kind == 'SUBMISSION' && data['notice_snapshot'] != null
          ? NoticeHistorySnapshot(data['notice_snapshot'], data['submission']['notice_id'])
          : null;
  NoticeHistorySnapshot? get acknowledgedNoticeSnapshot =>
      kind == 'SUBMISSION' && data['notice_acknowledgement'] != null
          ? NoticeHistorySnapshot(data['notice_acknowledgement'], data['submission']['notice_id'])
          : null;
  String get kind => raw['kind'];
  String get status => raw['current_status'];
  int get version => raw['object_version'];
  String get title => kind == 'NOTICE'
      ? data['notice']['title']
      : kind == 'SUBMISSION'
          ? submissionKinds[data['submission']['kind']]!
          : kind == 'CASE'
              ? '合作客服处理'
              : kind == 'QUALIFICATION'
                  ? '机构发布资格'
                  : '原资格记录';
}

// Revision history is a separate private projection, never a NoticeRecord.
class NoticeHistorySnapshot {
  NoticeHistorySnapshot(dynamic value, String noticeId) : raw = v5Map(value) {
    v5Require(raw['notice_id'] == noticeId &&
        v5Int(raw['object_version'], min: 1) &&
        (raw['revision_id'] == null || v5Id(raw['revision_id'])) &&
        v5Hash(raw['notice_sha256']));
    notice = v5Map(raw['notice']);
    validateNotice(notice);
  }
  final Map<String, dynamic> raw;
  late final Map<String, dynamic> notice;
  bool sameAs(NoticeHistorySnapshot other) =>
      raw['notice_id'] == other.raw['notice_id'] &&
      raw['object_version'] == other.raw['object_version'] &&
      raw['revision_id'] == other.raw['revision_id'] &&
      raw['notice_sha256'] == other.raw['notice_sha256'];
}

class NoticeRevisionItem {
  NoticeRevisionItem(dynamic value, String noticeId,
      {required bool publisher, required String party}) {
    final raw = v5Map(value);
    v5Require(v5Id(raw['id']));
    id = raw['id'];
    status = raw['current_status'];
    Map<String, dynamic> content;
    if (publisher) {
      v5Require(raw['kind'] == 'NOTICE_REVISION' &&
          raw['parent_id'] == noticeId && raw['owner_party_id'] == party &&
          v5Int(raw['object_version'], min: 1) &&
          v5Hash(raw['content_sha256']) &&
          ['IN_REVIEW', 'APPROVED', 'REJECTED'].contains(status));
      content = v5Map(raw['data']);
      v5Require(content['reason'] is String);
      reason = content['reason'];
      if (content['review'] != null) {
        final review = v5Map(content['review']);
        v5Require(review['reason'] is String);
        reviewReason = review['reason'];
      }
      recordVersion = raw['object_version'];
    } else {
      // Fail closed if a submitter receives an unexpected full-record shape.
      v5Require(raw.keys.every(const {
            'id', 'current_status', 'base_snapshot', 'notice', 'notice_sha256'
          }.contains) &&
          status == 'APPROVED' && v5Hash(raw['notice_sha256']));
      content = raw;
    }
    base = NoticeHistorySnapshot(content['base_snapshot'], noticeId);
    notice = v5Map(content['notice']);
    validateNotice(notice);
  }
  late final String id, status;
  late final NoticeHistorySnapshot base;
  late final Map<String, dynamic> notice;
  String? reason, reviewReason;
  int? recordVersion;
}

class NoticeHistoryPage {
  NoticeHistoryPage(dynamic value, String noticeId,
      {required bool publisher, required String party, String? previous}) {
    final raw = v5Map(value);
    v5Require(raw['notice_id'] == noticeId);
    current = NoticeHistorySnapshot(raw['current'], noticeId);
    items = v5Rows(raw['items'], max: 100).map((row) =>
        NoticeRevisionItem(row, noticeId, publisher: publisher, party: party)).toList();
    cursor = raw['next_cursor'];
    v5Require(cursor == null || v5Id(cursor));
    v5Require(cursor == null || cursor != previous);
    v5Require(items.map((item) => item.id).toSet().length == items.length);
    if (cursor != null) v5Require(items.isNotEmpty && cursor == items.last.id);
  }
  late final NoticeHistorySnapshot current;
  late final List<NoticeRevisionItem> items;
  late final String? cursor;
}


// A revision application is not a NOTICE and never changes its public content.
class NoticeRevisionResponse {
  NoticeRevisionResponse(dynamic value, String noticeId, String party,
      {required int version, required Map<String, dynamic> body})
      : raw = v5Map(value) {
    final item = NoticeRevisionItem(raw, noticeId, publisher: true, party: party);
    v5Require(item.status == 'IN_REVIEW' &&
        item.base.raw['object_version'] == version &&
        _sameNoticeValue(item.notice, body['notice']) &&
        item.reason == body['reason']);
  }
  final Map<String, dynamic> raw;
}

bool _sameNoticeValue(dynamic a, dynamic b) {
  if (a is Map && b is Map) {
    return a.length == b.length && a.keys.every((k) =>
        b.containsKey(k) && _sameNoticeValue(a[k], b[k]));
  }
  if (a is List && b is List) {
    return a.length == b.length && List.generate(a.length, (i) => i)
        .every((i) => _sameNoticeValue(a[i], b[i]));
  }
  return a == b;
}
