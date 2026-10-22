import 'v5_support.dart';

const stockExcluded = [
  'COMMERCIAL_ADVERTISING',
  'ADAPTATION',
  'DISTRIBUTION',
  'VOICE_SEPARATELY',
  'AI_REGENERATION',
  'SOURCE_OR_MODEL_FILES',
  'NEW_AVATAR_CONTENT',
  'EXCLUSIVE_BUYOUT'
];
const stockStatuses = {
  'IN_REVIEW': '等待内容与权利独立审核',
  'LISTED': '双项审核通过，公开销售',
  'REJECTED': '审核未通过',
  'UNLISTED': '已停止新销售',
  'RIGHTS_HOLD': '权利暂停',
  'AWAITING_PAYMENT': '等待实际付款',
  'ACTIVE': '个人许可有效',
  'PAYMENT_REVIEW_REQUIRED': '付款待核实',
  'REFUND_REQUIRED': '已核定退款，等待实际渠道',
  'REVOKED': '许可已撤回'
};
const stockCases = {
  'FILE_UNAVAILABLE': '文件无法取得',
  'EXTENSION': '申请延长核对期限',
  'RIGHTS_DISPUTE': '权利争议',
  'WRONG_CONTENT': '内容不符',
  'REFUND': '申请售后退款'
};

class StockLicense {
  StockLicense(dynamic raw) : data = v5Map(raw) {
    v5Require(data['scope'] == 'PERSONAL_NONCOMMERCIAL' &&
        data['exclusive'] == false &&
        data['territory'] == 'WORLDWIDE' &&
        data['duration'] == 'PERPETUAL' &&
        data['personal_social_sharing'] == true &&
        data['limited_to_buyer'] == true &&
        v5Int(data['acceptance_hours'], min: 1, max: 720) &&
        data['aftercare_terms'] is String &&
        (data['aftercare_terms'] as String).isNotEmpty);
    final excluded = v5Rows(data['excluded']);
    v5Require(excluded.length == stockExcluded.length &&
        excluded.toSet().containsAll(stockExcluded));
  }
  final Map<String, dynamic> data;
  int get hours => data['acceptance_hours'];
}

class StockOffer {
  StockOffer(dynamic raw, {String? id}) : data = v5Map(raw) {
    v5Require(v5Id(data['id']) &&
        (id == null || data['id'] == id) &&
        v5Id(data['seller_party_id']) &&
        data['currency'] == 'CNY' &&
        v5Int(data['unit_minor'], min: 1) &&
        v5Int(data['object_version'], min: 1) &&
        v5Hash(data['offer_sha256']) &&
        data['title'] is String &&
        data['description'] is String &&
        data['city'] is String);
    v5Ids(data['person_ids'], max: 20);
    license = StockLicense(data['license']);
  }
  final Map<String, dynamic> data;
  late final StockLicense license;
  String get id => data['id'];
  String get hash => data['offer_sha256'];
  String get title => data['title'];
  int get price => data['unit_minor'];
}

class StockListing {
  StockListing(dynamic raw, String seller, {String? id}) : raw = v5Map(raw) {
    v5Require(v5Id(this.raw['id']) &&
        (id == null || this.raw['id'] == id) &&
        this.raw['seller_party_id'] == seller &&
        v5Hash(this.raw['content_sha256']) &&
        v5Int(this.raw['object_version'], min: 1) &&
        ['IN_REVIEW', 'LISTED', 'REJECTED', 'UNLISTED', 'RIGHTS_HOLD']
            .contains(this.raw['current_status']));
    data = v5Map(this.raw['data']);
    final reviews = v5Map(data['reviews']);
    v5Require(data['title'] is String &&
        data['city'] is String &&
        v5Id(data['seller_person_id']) &&
        v5Id(data['file_id']) &&
        v5Id(data['preview_file_id']) &&
        data['file_id'] != data['preview_file_id'] &&
        reviews.containsKey('RIGHTS') &&
        reviews.containsKey('CONTENT'));
    for (final p in v5Rows(data['participants'], max: 20)) {
      final r = v5Map(p);
      v5Require(v5Id(r['person_id']) &&
          v5Id(r['avatar_id']) &&
          v5Id(r['consent_id']));
    }
    v5Ids(data['rights_evidence_ids'], max: 20);
  }
  final Map<String, dynamic> raw;
  late final Map<String, dynamic> data;
  String get id => raw['id'];
  String get status => raw['current_status'];
  int get version => raw['object_version'];
}

class StockPurchase {
  StockPurchase(dynamic raw, String buyer, {String? orderId})
      : raw = v5Map(raw) {
    v5Require(v5Id(this.raw['order_id']) &&
        (orderId == null || this.raw['order_id'] == orderId) &&
        this.raw['buyer_party_id'] == buyer &&
        v5Id(this.raw['listing_id']) &&
        v5Int(this.raw['object_version'], min: 1) &&
        v5Hash(this.raw['contract_sha256']) &&
        this.raw['order_status'] is String);
    data = v5Map(this.raw['data']);
    license = StockLicense(data['license']);
    final snapshot = v5Map(data['listing_snapshot']);
    v5Require(snapshot['title'] is String &&
        v5Id(snapshot['seller_party_id']) &&
        v5Hash(data['offer_sha256']) &&
        [
          'AWAITING_PAYMENT',
          'ACTIVE',
          'PAYMENT_REVIEW_REQUIRED',
          'REFUND_REQUIRED',
          'REVOKED'
        ].contains(data['status']));
    for (final k in [
      'granted_at',
      'viewed_at',
      'receipt_at',
      'deadline_at',
      'accepted_at'
    ]) {
      v5Require(data.containsKey(k) && (data[k] == null || v5Date(data[k])));
    }
    v5Require(data['notification_event_id'] == null ||
        v5Int(data['notification_event_id'], min: 1));
    v5Require(data['current_case_id'] == null || v5Id(data['current_case_id']));
    v5Require(data['acceptance_method'] == null ||
        ['BUYER_EXPLICIT', 'AGREED_TIMEOUT']
            .contains(data['acceptance_method']));
    cases = v5Rows(data['cases'], max: 10000).map(v5Map).toList();
    for (final c in cases) {
      v5Require(v5Id(c['id']) &&
          stockCases.containsKey(c['kind']) &&
          c['reason'] is String &&
          v5Date(c['opened_at']));
      final r = c['resolution'];
      if (r != null) {
        final d = v5Map(r);
        v5Require(['RESUME', 'REFUND'].contains(d['decision']) &&
            d['reason'] is String &&
            v5Date(d['at']));
      }
    }
  }
  final Map<String, dynamic> raw;
  late final Map<String, dynamic> data;
  late final StockLicense license;
  late final List<Map<String, dynamic>> cases;
  String get orderId => raw['order_id'];
  String get title => data['listing_snapshot']['title'];
  String get status => data['status'];
  int get version => raw['object_version'];
  bool get usable =>
      status == 'ACTIVE' &&
      raw['order_status'] == 'PAID' &&
      data['current_case_id'] == null;
}
