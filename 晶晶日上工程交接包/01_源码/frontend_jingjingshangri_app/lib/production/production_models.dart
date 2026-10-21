import '../account/account_api.dart';
import '../contracts/contract_api.dart';

const productionStages = {
  'SCRIPT': '剧本',
  'SAMPLE': '样片',
  'ROUGH_CUT': '粗剪',
  'FINAL': '最终成片'
};
const productionStatuses = {
  'IN_REVIEW': '独立审核中',
  'READY': '开工依据已审核',
  'IN_PROGRESS': '制作中',
  'ACCEPTED': '当前最终版本已验收',
  'REJECTED': '审核未通过',
  'APPROVED': '审核通过',
  'UPLOADING': '文件上传中',
  'FAILED': '未完成',
  'RECORDED': '意见已记录',
  'QUEUED': '已进入队列',
  'PENDING': '等待处理',
  'SUCCEEDED': '服务任务已完成',
  'DELETE_REQUIRED': '等待删除',
  'DELETING': '正在删除',
  'DELETED': '已删除'
};
void productionRequire(bool condition) {
  if (!condition) {
    throw const AccountError(503, 'INVALID_PRODUCTION_RESPONSE',
        uncertain: true);
  }
}

Map<String, dynamic> productionMap(dynamic value) {
  productionRequire(value is Map<String, dynamic>);
  return Map<String, dynamic>.from(value as Map);
}

bool _hash(dynamic v) => v is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(v);
bool _id(dynamic v) => v is String && isContractId(v);
bool _number(dynamic v, {int min = 0, int max = 4294967294}) =>
    v is int && v >= min && v <= max;
bool _text(dynamic v, int max) =>
    v is String && v.trim().isNotEmpty && v.length <= max;
void _keys(Map<String, dynamic> d, List<String> required,
    [List<String> optional = const []]) {
  productionRequire(required.every(d.containsKey) &&
      d.keys.every((k) => [...required, ...optional].contains(k)));
}

class ProductionRecord {
  ProductionRecord._(this.raw);
  final Map<String, dynamic> raw;
  String get id => raw['id'];
  String get kind => raw['kind'];
  String get orderId => raw['order_id'];
  String? get projectId => raw['project_id'];
  String get status => raw['current_status'];
  int get version => raw['object_version'];
  String get hash => raw['content_sha256'];
  Map<String, dynamic> get data => raw['data'];
  String get stage => data['stage'];
  bool current(ProductionRecord project) =>
      kind == 'VERSION' && project.data['current'][stage] == id;
  bool accepted(ProductionRecord project) =>
      current(project) && project.data['accepted'][stage] == id;
  bool buyer(String party) =>
      kind == 'PROJECT' && data['buyer_party_id'] == party;

  static ProductionRecord parse(dynamic value,
      {String? id, String? kind, String? projectId}) {
    final r = productionMap(value);
    _keys(r, [
      'id',
      'kind',
      'project_id',
      'order_id',
      'created_by',
      'current_status',
      'object_version',
      'content_sha256',
      'data'
    ]);
    const states = {
      'PROJECT': ['IN_REVIEW', 'READY', 'IN_PROGRESS', 'ACCEPTED', 'REJECTED'],
      'VERSION': ['IN_REVIEW', 'APPROVED', 'REJECTED'],
      'FILE': ['UPLOADING', 'READY', 'FAILED'],
      'FEEDBACK': ['RECORDED'],
      'GENERATION': ['QUEUED', 'PENDING', 'SUCCEEDED'],
      'DIGITAL_ASSET': ['READY', 'DELETE_REQUIRED', 'DELETING', 'DELETED']
    };
    productionRequire(_id(r['id']) &&
        _id(r['order_id']) &&
        (r['project_id'] == null || _id(r['project_id'])) &&
        (r['created_by'] == null || _id(r['created_by'])) &&
        _number(r['object_version'], min: 1, max: 100000) &&
        _hash(r['content_sha256']) &&
        states[r['kind']]?.contains(r['current_status']) == true &&
        (id == null || r['id'] == id) &&
        (kind == null || r['kind'] == kind) &&
        (projectId == null || r['project_id'] == projectId));
    final d = productionMap(r['data']);
    if (r['kind'] == 'PROJECT') {
      _keys(d, [
        'line_id',
        'buyer_party_id',
        'merchant_party_id',
        'producer_party_id',
        'script_version_id',
        'license_project_id',
        'assignee_account_id',
        'purpose',
        'territory',
        'consent_ids',
        'evidence_asset_id',
        'specification',
        'quantity',
        'contract_sha256',
        'current',
        'accepted',
        'revisions',
        'change_requests',
        'review'
      ], [
        'assignment_reason'
      ]);
      productionRequire(_text(d['line_id'], 128) &&
          [
            'buyer_party_id',
            'merchant_party_id',
            'producer_party_id',
            'script_version_id',
            'assignee_account_id',
            'evidence_asset_id'
          ].every((k) => _id(d[k])) &&
          (d['license_project_id'] == null || _id(d['license_project_id'])) &&
          _text(d['purpose'], 100) &&
          _text(d['territory'], 100) &&
          _hash(d['contract_sha256']) &&
          _number(d['quantity'], min: 1, max: 100000) &&
          _number(d['change_requests']) &&
          d['consent_ids'] is List &&
          d['consent_ids'].length <= 20 &&
          (d['consent_ids'] as List).every(_id));
      for (final name in ['current', 'accepted', 'revisions']) {
        final items = productionMap(d[name]);
        productionRequire(items.keys.every(productionStages.containsKey) &&
            items.values
                .every((v) => name == 'revisions' ? _number(v) : _id(v)));
      }
      final s = productionMap(d['specification']);
      _keys(s, [
        'version',
        'service_tier',
        'sample_seconds',
        'final_seconds',
        'revision_limit',
        'deliverables',
        'terms'
      ]);
      productionRequire(_text(s['version'], 100) &&
          _text(s['service_tier'], 100) &&
          _number(s['sample_seconds']) &&
          _number(s['final_seconds']) &&
          _number(s['revision_limit']) &&
          s['deliverables'] is List &&
          (s['deliverables'] as List).every((v) => v is String) &&
          s['terms'] is String);
    } else if (r['kind'] == 'VERSION') {
      _keys(d, [
        'stage',
        'revision',
        'file_id',
        'preview_file_id',
        'basis_version_id',
        'note',
        'review'
      ], [
        'last_feedback_id'
      ]);
      productionRequire(productionStages.containsKey(d['stage']) &&
          _number(d['revision'], min: 1, max: 100000) &&
          _id(d['file_id']) &&
          _id(d['preview_file_id']) &&
          (d['basis_version_id'] == null || _id(d['basis_version_id'])) &&
          _text(d['note'], 2000) &&
          (!d.containsKey('last_feedback_id') || _id(d['last_feedback_id'])));
    } else if (r['kind'] == 'FILE') {
      _keys(d, ['object_key', 'media_type', 'byte_size', 'content_sha256']);
      productionRequire(_text(d['object_key'], 512) &&
          [
            'text/plain',
            'video/mp4',
            'audio/mpeg',
            'image/png',
            'application/pdf'
          ].contains(d['media_type']) &&
          _number(d['byte_size'], min: 1, max: 52428800) &&
          _hash(d['content_sha256']));
    } else if (r['kind'] == 'FEEDBACK') {
      _keys(d, ['version_id', 'stage', 'decision', 'note', 'checklist']);
      productionRequire(_id(d['version_id']) &&
          productionStages.containsKey(d['stage']) &&
          ['ACCEPT', 'REQUEST_CHANGES'].contains(d['decision']) &&
          _text(d['note'], 4000));
      if (d['decision'] == 'ACCEPT') {
        final checks = productionMap(d['checklist']);
        final names = productionCheckNames(d['stage']);
        _keys(checks, names);
        productionRequire(checks.values.every((v) => v == true));
      } else {
        productionRequire(d['checklist'] == null);
      }
    }
    if (d.containsKey('review') && d['review'] != null) {
      final review = productionMap(d['review']);
      productionRequire(['APPROVED', 'REJECTED'].contains(review['decision']) &&
          _text(review['reason'], 2000) &&
          _id(review['account_id']) &&
          review['method'] == 'EXTERNAL_MANUAL_REVIEW');
    }
    return ProductionRecord._({...r, 'data': d});
  }
}

List<String> productionCheckNames(String stage) => stage == 'SCRIPT'
    ? ['script_reviewed']
    : [
        'script_reviewed',
        'specification_reviewed',
        'audio_reviewed',
        'branding_reviewed'
      ];
const productionChecks = {
  'script_reviewed': '剧本内容',
  'specification_reviewed': '交付规格',
  'audio_reviewed': '声音',
  'branding_reviewed': '内容标识'
};
String productionError(AccountError e, {bool writing = false}) {
  if (e.status == 412) return '内容已更新，请重新查看当前版本，再填写并确认。本次旧决定不会自动重放。';
  if (writing && e.uncertain) return '提交结果尚未确认。请保留本页，恢复原请求核对，系统不会另建同一份意见。';
  const messages = {
    'INVALID_PRODUCTION_RESPONSE': '制作服务返回内容不完整，请重新核对。',
    'CURRENT_APPROVED_VERSION_REQUIRED': '只有当前审核通过的版本可以审阅与确认。请返回项目读取最新版本。',
    'FINAL_DELIVERY_NOT_READY': '完成当前最终版本验收和约定付款后，才能下载原片。',
    'REVISION_LIMIT_REACHED': '本单约定修改次数已用完，请按原约定与制作方协商。',
    'PRODUCTION_PAYMENT_REQUIRED': '开工付款尚未核实，请前往原订单核对付款记录。',
    'PRODUCTION_ORDER_BLOCKED': '原订单当前财务状态不允许制作或交付，请查看订单。',
    'PRODUCTION_LICENSE_NOT_READY': '项目许可尚未满足，付款不代替签约、权属与许可核验。',
    'PRODUCTION_CONSENT_NOT_AVAILABLE': '本人同意当前不覆盖制作用途，暂不能读取或交付。',
    'PRODUCTION_NOT_READY': '开工依据尚未通过独立审核，请等待核对。',
    'PREVIOUS_VERSION_NOT_ACCEPTED': '前一阶段的当前版本尚未确认，请先核对。',
    'PRIVATE_CONTENT_MISMATCH': '私有文件校验不一致，已停止展示，请重新读取。',
    'PRODUCTION_BUYER_REQUIRED': '仅买方当前负责人可以提交版本意见。',
    'PROVIDER_NOT_ENABLED': '生成服务尚未开通，不会创建演示任务或视频。',
  };
  return messages[e.code] ??
      (e.status >= 500 ? '制作服务暂时无法读取，请稍后重新核对。' : e.message);
}
