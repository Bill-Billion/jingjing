import '../account/account_api.dart';
import '../stock/v5_support.dart';

const auditionStates = {
  'IN_REVIEW': '等待独立审核',
  'PUBLISHED': '方案已发布',
  'REJECTED': '未通过审核',
  'SAFETY_REVIEW': '等待安全核查',
  'READY_TO_PAY': '安全核查通过，可确认原订单',
  'AWAITING_PAYMENT': '等待实际付款',
  'AWAITING_ACCEPTANCE': '已核实付款，等待艺人接单',
  'ACCEPTED': '艺人已接单',
  'DEPARTED': '已记录出发',
  'ARRIVED': '已记录到场',
  'DELIVERY_REVIEW': '取样等待独立审核',
  'DELIVERED': '已审取样可读取',
  'DISPUTED': '争议处理中，已暂停',
  'REFUND_REQUIRED': '应退款待渠道核实',
  'REFUNDED': '全额退款已核实',
  'PARTIAL_REFUND_SETTLED': '部分退款已核实',
  'FULFILLED': '试镜履约已完成',
  'CANCELLED': '已取消',
  'PAYMENT_REVIEW_REQUIRED': '付款待核实',
  'APPROVED': '已审通过',
  'EXPIRED': '已过期',
  'OPEN': '原订单未付款',
  'PAID': '款项已核实',
  'PARTIALLY_REFUNDED': '部分退款',
  'SENT': '已发送'
};
const auditionConversations = {
  'OPEN': '本单会话已开放',
  'FROZEN': '争议或改期处理中，会话已冻结',
  'ARCHIVED': '本单会话已归档',
  'AWAITING_ACCEPTANCE': '等待艺人接受，不开放会话',
  'AWAITING_VERIFIED_PAYMENT': '等待真实付款核实，不开放会话'
};
void auditionAppointment(dynamic raw) {
  final d = v5Map(raw);
  v5Require(['OFFLINE', 'ONLINE_MATERIALS'].contains(d['mode']) &&
      ['city', 'venue', 'address', 'purpose'].every((k) => d[k] is String) &&
      v5Date(d['starts_at']) &&
      v5Date(d['ends_at']) &&
      DateTime.parse(d['starts_at']).isBefore(DateTime.parse(d['ends_at'])));
}

Map<String, dynamic> auditionSelectedTimes(
    Map<String, dynamic> slot, dynamic startsAt, dynamic endsAt) {
  final start = DateTime.parse(v5InputDate(startsAt)),
      end = DateTime.parse(v5InputDate(endsAt));
  if (!start.isBefore(end) ||
      end.difference(start) > const Duration(hours: 24) ||
      start.isBefore(DateTime.parse(slot['starts_at'])) ||
      end.isAfter(DateTime.parse(slot['ends_at']))) {
    throw const AccountError(400, 'AUDITION_TIME_NOT_AVAILABLE');
  }
  return {
    'starts_at': start.toIso8601String(),
    'ends_at': end.toIso8601String()
  };
}

class AuditionOffer {
  AuditionOffer(dynamic d) : raw = v5Map(d) {
    v5Require(v5Id(raw['id']) &&
        v5Id(raw['person_id']) &&
        v5Id(raw['avatar_id']) &&
        v5Hash(raw['offer_sha256']) &&
        raw['title'] is String &&
        raw['city'] is String &&
        raw['service_area'] is String &&
        ['OFFLINE', 'ONLINE_MATERIALS'].contains(raw['mode']) &&
        raw['currency'] == 'CNY' &&
        raw['transport_included'] == true &&
        raw['public_price'] is bool &&
        (raw['public_price'] == true
            ? v5Int(raw['unit_minor'], min: 1)
            : raw['unit_minor'] == null));
    slots = v5Rows(raw['slots'], max: 60).map(v5Map).toList();
    for (final s in slots) {
      v5Require(v5Date(s['starts_at']) &&
          v5Date(s['ends_at']) &&
          DateTime.parse(s['starts_at'])
              .isBefore(DateTime.parse(s['ends_at'])));
    }
  }
  final Map<String, dynamic> raw;
  late final List<Map<String, dynamic>> slots;
  String get id => raw['id'];
  String get hash => raw['offer_sha256'];
  String get title => raw['title'];
}

class AuditionRecord {
  AuditionRecord(dynamic d, {String? id, String? kind, String? parentId})
      : raw = v5Map(d) {
    v5Require(v5Id(raw['id']) &&
        (id == null || raw['id'] == id) &&
        (kind == null || raw['kind'] == kind) &&
        ['OFFER', 'BOOKING', 'MESSAGE', 'SUPPLEMENT'].contains(raw['kind']) &&
        v5Id(raw['owner_party_id']) &&
        (raw['counterparty_id'] == null || v5Id(raw['counterparty_id'])) &&
        v5Int(raw['object_version'], min: 1) &&
        v5Hash(raw['content_sha256']) &&
        auditionStates.containsKey(raw['current_status']) &&
        (parentId == null || raw['parent_id'] == parentId));
    data = v5Map(raw['data']);
    if (this.kind == 'OFFER' || this.kind == 'BOOKING') {
      final o = v5Map(data['offer']), rules = v5Map(data['rules']);
      v5Require(v5Id(o['person_id']) &&
          v5Id(o['avatar_id']) &&
          v5Id(o['public_consent_id']) &&
          v5Id(o['rule_id']) &&
          o['title'] is String &&
          v5Int(o['unit_minor'], min: 1) &&
          o['public_price'] is bool &&
          o['public_booking'] is bool &&
          v5Int(rules['photo_count'], min: 1, max: 30) &&
          v5Int(rules['video_count'], min: 1, max: 5) &&
          v5Int(rules['acceptance_hours'], min: 1, max: 720) &&
          rules['terms'] is String);
    }
    if (this.kind == 'BOOKING') {
      v5Require(data['status'] == status &&
          raw['performance_rights_granted'] == false &&
          raw['refund_is_verified'] is bool &&
          auditionConversations.containsKey(raw['conversation_status']) &&
          v5Hash(data['offer_sha256']) &&
          (data['order_id'] == null || v5Id(data['order_id'])) &&
          v5Int(data['refund_minor']));
      auditionAppointment(data['appointment']);
      if (data['delivery'] != null) {
        final delivery = v5Map(data['delivery']);
        final photos = v5Ids(delivery['photos'], max: 30),
            videos = v5Ids(delivery['videos'], max: 5);
        v5Require(photos.length == data['rules']['photo_count'] &&
            videos.length == data['rules']['video_count'] &&
            v5Id(delivery['consent_id']));
        final hashes = v5Map(delivery['hashes']);
        v5Require([...photos, ...videos].every((id) => v5Hash(hashes[id])));
      }
      for (final k in [
        'paid_at',
        'accepted_at',
        'accept_by',
        'departed_at',
        'arrived_at',
        'fulfilled_at',
        'deadline_at',
        'receipt_at',
        'viewed_at'
      ]) {
        v5Require(data[k] == null || v5Date(data[k]));
      }
    }
    if (this.kind == 'MESSAGE') {
      v5Require(v5Id(raw['parent_id']) &&
          ['TEXT', 'DELIVERY_MEDIA', 'ORDER_CARD'].contains(data['kind']) &&
          v5Id(data['account_id']) &&
          v5Date(data['at']));
      if (data['kind'] == 'TEXT') v5Require(data['body'] is String);
      if (data['kind'] == 'DELIVERY_MEDIA') v5Require(v5Id(data['asset_id']));
      if (data['kind'] == 'ORDER_CARD') v5Require(v5Id(data['order_id']));
    }
    if (this.kind == 'SUPPLEMENT') {
      v5Require(v5Id(raw['parent_id']) &&
          data['title'] is String &&
          data['terms'] is String &&
          v5Int(data['amount_minor'], min: 1) &&
          v5Date(data['expires_at']) &&
          v5Id(data['original_order_id']) &&
          v5Hash(data['original_contract_sha256']) &&
          v5Id(data['person_id']) &&
          v5Id(data['avatar_id']) &&
          (data['order_id'] == null || v5Id(data['order_id'])));
    }
  }
  final Map<String, dynamic> raw;
  late final Map<String, dynamic> data;
  String get id => raw['id'];
  String get kind => raw['kind'];
  String get status => raw['current_status'];
  String get hash => raw['content_sha256'];
  int get version => raw['object_version'];
  String get title => kind == 'SUPPLEMENT'
      ? data['title']
      : kind == 'MESSAGE'
          ? '本单消息'
          : data['offer']['title'];
  bool buyer(String party) => raw['owner_party_id'] == party;
  String get conversation =>
      raw['conversation_status'] ?? 'AWAITING_VERIFIED_PAYMENT';
  List<String> get mediaIds => data['delivery'] == null
      ? []
      : [
          ...v5Ids(data['delivery']['photos'], max: 30),
          ...v5Ids(data['delivery']['videos'], max: 5)
        ];
}
