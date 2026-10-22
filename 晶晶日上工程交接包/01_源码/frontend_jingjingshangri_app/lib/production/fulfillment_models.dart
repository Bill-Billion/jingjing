import '../contracts/contract_api.dart';
import '../customization/customization_models.dart';
import '../trade/trade_models.dart';
import 'production_models.dart';

const fulfillmentStates = {
  'PLANNED': '等待开工',
  'STARTED': '制作中',
  'PAUSED': '问题处理中，制作已暂停',
  'DELIVERED': '正式成片已交付',
  'CANCELLED': '委托已取消',
  'REFUND_REQUIRED': '委托已取消，实际退款待核实',
  'REFUNDED': '约定退款已核实',
};
const fulfillmentCaseKinds = {
  'PLATFORM_CORRECTION': '纠正原约定错误',
  'CREATIVE_CHANGE': '新增创作要求',
  'FILE_UNAVAILABLE': '文件无法查看',
  'EXTENSION': '申请延期',
  'RIGHTS_DISPUTE': '权利争议',
  'CANCEL': '取消委托',
  'PRODUCTION_FAILED': '制作失败',
  'RIGHTS_UNAVAILABLE': '所需权利不可用',
  'INFRINGEMENT': '侵权问题',
};
bool fulfillmentProject(ProductionRecord project) =>
    project.kind == 'PROJECT' &&
    project.data['specification']['customization_delivery'] != null;
bool _id(dynamic v) => v is String && isContractId(v);
bool _hash(dynamic v) => v is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(v);
bool _date(dynamic v) => v is String && DateTime.tryParse(v) != null;
bool _number(dynamic v, {int min = 0}) => v is int && v >= min;
bool _text(dynamic v, int max) =>
    v is String && v.trim().isNotEmpty && v.length <= max;
void _nullable(
    Map<String, dynamic> d, List<String> keys, bool Function(dynamic) valid) {
  productionRequire(
      keys.every((k) => d.containsKey(k) && (d[k] == null || valid(d[k]))));
}

List<Map<String, dynamic>> _rows(dynamic v, {int max = 10000}) {
  productionRequire(v is List && v.length <= max);
  return (v as List).map(productionMap).toList();
}

class FulfillmentCase {
  FulfillmentCase(dynamic value) : raw = productionMap(value) {
    productionRequire(_id(raw['id']) &&
        _id(raw['created_by']) &&
        ['OPEN', 'RESOLVED'].contains(raw['current_status']));
    _nullable(raw, ['change_order_id'], _id);
    final d = data;
    productionRequire(fulfillmentCaseKinds.containsKey(d['kind']) &&
        _text(d['reason'], 4000) &&
        _id(d['opened_by_party_id']) &&
        _date(d['opened_at']) &&
        d['evidence_asset_ids'] is List &&
        d['evidence_asset_ids'].length <= 20 &&
        (d['evidence_asset_ids'] as List).every(_id) &&
        d['evidence_asset_ids'].toSet().length ==
            d['evidence_asset_ids'].length);
    productionRequire(d.containsKey('resolution'));
    if (d['resolution'] != null) {
      final r = productionMap(d['resolution']);
      productionRequire(
          ['RESUME', 'CANCEL', 'CHANGE_ORDER'].contains(r['decision']) &&
              _text(r['reason'], 4000) &&
              _id(r['reviewer']) &&
              _date(r['at']));
      _nullable(r, ['retained_minor'], (v) => tradeMinor(v, zero: true));
      _nullable(r, ['change_order_id'], _id);
      productionRequire(raw['current_status'] == 'RESOLVED' &&
          r['reviewer'] != raw['created_by']);
    } else {
      productionRequire(raw['current_status'] == 'OPEN');
    }
  }
  final Map<String, dynamic> raw;
  String get id => raw['id'];
  String get status => raw['current_status'];
  String? get changeOrderId => raw['change_order_id'];
  Map<String, dynamic> get data => productionMap(raw['data']);
}

class ProductionFulfillment {
  ProductionFulfillment(dynamic value, ProductionRecord project)
      : raw = productionMap(value) {
    productionRequire(raw['format'] == 'v5-customization-fulfillment-v1' &&
        raw['project_id'] == project.id &&
        raw['order_id'] == project.orderId &&
        _number(raw['object_version'], min: 1) &&
        fulfillmentStates.containsKey(raw['state']) &&
        raw['uses_identifiable_people'] is bool &&
        _number(raw['creative_changes']) &&
        _number(raw['additional_creative_changes']));
    final source = productionMap(raw['source']);
    productionRequire(_id(source['request_id']) &&
        _id(source['submission_id']) &&
        _hash(source['content_sha256']));
    validateCustomizationDeliveryTerms(raw['terms']);
    final cast = _rows(raw['cast'], max: 20),
        snapshots = _rows(raw['cast_snapshot'], max: 20);
    productionRequire(raw['cocreation'] != null ||
        raw['uses_identifiable_people'] == cast.isNotEmpty);
    for (final c in cast) {
      productionRequire([
            'person_id',
            'avatar_id',
            'supply_consent_id',
            'look_version_id'
          ].every((k) => _id(c[k])) &&
          ['EXISTING_MATERIAL', 'NEW_GENERATION'].contains(c['usage']) &&
          c['artist_consent_ids'] is List &&
          c['artist_consent_ids'].isNotEmpty &&
          c['artist_consent_ids'].length <= 2 &&
          (c['artist_consent_ids'] as List).every(_id));
      _nullable(c, ['voice_version_id'], _id);
    }
    productionRequire(
        cast.map((c) => c['avatar_id']).toSet().length == cast.length &&
            snapshots.length == cast.length);
    for (final s in snapshots) {
      productionRequire(cast.any((c) =>
              c['person_id'] == s['person_id'] &&
              c['avatar_id'] == s['avatar_id']) &&
          _hash(s['supply_consent_sha256']));
      for (final key in ['versions', 'artist_consents']) {
        final values = _rows(s[key], max: 2);
        productionRequire(values.isNotEmpty &&
            values.every((v) => _id(v['id']) && _hash(v['content_sha256'])));
      }
    }
    _nullable(raw, ['started_at'], _date);
    for (final key in ['receipt', 'completion', 'cancellation']) {
      productionRequire(raw.containsKey(key));
    }
    final r = receipt;
    if (r != null) {
      productionRequire(_id(r['delivery_id']) &&
          _id(r['version_id']) &&
          _number(r['notification_event_id'], min: 1));
      _nullable(
          r,
          ['view_observed_at', 'notified_at', 'started_at', 'deadline_at'],
          _date);
      _nullable(r, ['buyer_account_id', 'job_id'], _id);
      if (r['started_at'] != null) {
        productionRequire(r['view_observed_at'] != null &&
            r['notified_at'] != null &&
            r['deadline_at'] != null);
      }
    }
    if (raw['completion'] != null) {
      final c = productionMap(raw['completion']);
      productionRequire(_id(c['version_id']) && _date(c['at']));
      _nullable(c, ['buyer_account_id'], _id);
    }
    final c = cancellation;
    if (c != null) {
      productionRequire(_id(c['case_id']) &&
          _id(c['reviewer']) &&
          _date(c['approved_at']) &&
          [
            'retained_minor',
            'refund_minor',
            'received_minor',
            'actual_refunded_minor'
          ].every((k) => tradeMinor(c[k], zero: true)) &&
          c['retained_minor'] + c['refund_minor'] == c['received_minor'] &&
          c['actual_refunded_minor'] <= c['refund_minor']);
    }
    cases = _rows(raw['cases']).map(FulfillmentCase.new).toList();
    productionRequire(cases.map((c) => c.id).toSet().length == cases.length);
  }
  final Map<String, dynamic> raw;
  late final List<FulfillmentCase> cases;
  String get projectId => raw['project_id'];
  String get orderId => raw['order_id'];
  int get version => raw['object_version'];
  String get state => raw['state'];
  Map<String, dynamic> get terms => productionMap(raw['terms']);
  Map<String, dynamic> get source => productionMap(raw['source']);
  Map<String, dynamic>? get receipt =>
      raw['receipt'] == null ? null : productionMap(raw['receipt']);
  Map<String, dynamic>? get cancellation =>
      raw['cancellation'] == null ? null : productionMap(raw['cancellation']);
  bool get active => ['PLANNED', 'STARTED'].contains(state);
  bool get manualSample => raw['manual_sample'] != null;
  int get creativeChanges => raw['creative_changes'];
  int get additionalChanges => raw['additional_creative_changes'];
}

class ProductionStory {
  ProductionStory(dynamic value, ProductionFulfillment fulfillment)
      : raw = productionMap(value) {
    productionRequire(['request_id', 'submission_id', 'content_sha256']
        .every((k) => raw[k] == fulfillment.source[k]));
    template = StoryTemplate(raw['template_snapshot']);
    answers = template.answers(raw['answers']);
  }
  final Map<String, dynamic> raw;
  late final StoryTemplate template;
  late final Map<String, String> answers;
}
