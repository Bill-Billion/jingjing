import '../account/account_api.dart';
import '../contracts/contract_api.dart';
import '../supply/supply_models.dart';

const licenseRights = {
  'ADAPT': '改稿',
  'PRODUCE': '制作',
  'DISTRIBUTE': '发行',
  'PROMOTE': '宣传',
  'SEQUEL': '续集',
  'AI_PROCESS': 'AI处理',
  'AI_TRAIN': '训练'
};
const licensePurposes = {
  'PRIVATE': '私人使用',
  'PUBLIC_SHARE': '公开分享',
  'COMMERCIAL': '商业用途',
  'RELEASE': '发行'
};
const licenseCountries = {
  'CN': '中国',
  'HK': '中国香港',
  'MO': '中国澳门',
  'TW': '中国台湾',
  'US': '美国',
  'GB': '英国',
  'JP': '日本',
  'KR': '韩国',
  'SG': '新加坡',
  'CA': '加拿大',
  'AU': '澳大利亚',
  'FR': '法国',
  'DE': '德国',
  'WORLD': '全球'
};
const licenseLanguages = {
  'zh': '中文',
  'en': '英语',
  'ja': '日语',
  'ko': '韩语',
  'fr': '法语',
  'de': '德语',
  'es': '西班牙语',
  'ALL': '所有语言'
};
const licenseStatuses = {
  'IN_REVIEW': '等待独立核验',
  'LISTED': '已上架',
  'REJECTED': '未通过',
  'UNLISTED': '已下架',
  'HELD': '已预留，等待条件核验',
  'COMMITTED': '已发放许可',
  'CANCELLED': '已取消',
  'REVIEW_REQUIRED': '已转人工补救',
  'APPROVED': '已通过核验',
  'ACTIVE': '已生效',
  'SUSPENDED': '已暂停',
  'REVOKED': '已撤销'
};
const licenseKinds = {
  'PRODUCT': '许可商品',
  'RESERVATION': '预留与合同',
  'EVIDENCE': '核验材料',
  'GRANT': '已获许可',
  'PROJECT': '用途项目',
  'BINDING': '绑定记录',
  'READING': '阅稿授权'
};
void licenseRequire(bool valid) {
  if (!valid) {
    throw const AccountError(502, 'INVALID_LICENSE_RESPONSE', uncertain: true);
  }
}

bool _text(dynamic v, int max) =>
    v is String && v.trim().isNotEmpty && v.length <= max;
bool _hash(dynamic v) => v is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(v);
bool _int(dynamic v, [int min = 0, int max = 9007199254740991]) =>
    v is int && v >= min && v <= max;
bool _date(dynamic v) =>
    v is String &&
    RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$').hasMatch(v) &&
    DateTime.tryParse(v)?.toUtc().toIso8601String() == v;
Map<String, dynamic> _map(dynamic v) {
  licenseRequire(v is Map<String, dynamic>);
  return v as Map<String, dynamic>;
}

void _keys(Map v, List<String> required, [List<String> optional = const []]) =>
    licenseRequire(required.every(v.containsKey) &&
        v.keys.every((k) => [...required, ...optional].contains(k)));
void _array(dynamic v, bool Function(dynamic) check) =>
    licenseRequire(v is List &&
        v.isNotEmpty &&
        v.length <= 100 &&
        v.every(check) &&
        v.toSet().length == v.length);

class LicenseTerms {
  LicenseTerms._(this.data);
  final Map<String, dynamic> data;
  factory LicenseTerms.parse(dynamic value) {
    final v = _map(value);
    _keys(v, [
      'exclusive',
      'rights',
      'purposes',
      'territories',
      'languages',
      'valid_from',
      'valid_until',
      'development_until',
      'project_limit',
      'episode_limit',
      'terms_text'
    ]);
    licenseRequire(v['exclusive'] is bool &&
        _int(v['project_limit'], 1, 100000) &&
        _int(v['episode_limit'], 1, 100000) &&
        _text(v['terms_text'], 8000));
    _array(v['rights'], licenseRights.containsKey);
    _array(v['purposes'], licensePurposes.containsKey);
    _array(v['territories'],
        (x) => x is String && RegExp(r'^(WORLD|[A-Z]{2})$').hasMatch(x));
    _array(v['languages'],
        (x) => x is String && RegExp(r'^(ALL|[a-z]{2})$').hasMatch(x));
    for (final key in ['valid_from', 'valid_until', 'development_until']) {
      licenseRequire(_date(v[key]));
    }
    licenseRequire(DateTime.parse(v['valid_from'])
            .isBefore(DateTime.parse(v['development_until'])) &&
        !DateTime.parse(v['development_until'])
            .isAfter(DateTime.parse(v['valid_until'])));
    return LicenseTerms._(Map.unmodifiable(v));
  }
  bool get developmentOpen {
    final now = DateTime.now().toUtc();
    return !now.isBefore(DateTime.parse(data['valid_from'])) &&
        now.isBefore(DateTime.parse(data['development_until'])) &&
        now.isBefore(DateTime.parse(data['valid_until']));
  }

  String get summary =>
      '${data['exclusive'] ? '独家' : '非独家'} · ${(data['rights'] as List).map((v) => licenseRights[v]).join('、')} · ${(data['purposes'] as List).map((v) => licensePurposes[v]).join('、')}';
  bool matches(LicenseRecord project) =>
      developmentOpen &&
      (data['purposes'] as List).contains(project.data['purpose']) &&
      ((data['territories'] as List).contains('WORLD') ||
          (data['territories'] as List).contains(project.data['territory'])) &&
      ((data['languages'] as List).contains('ALL') ||
          (data['languages'] as List).contains(project.data['language'])) &&
      project.data['episodes'] <= data['episode_limit'] &&
      (data['rights'] as List).any((x) => ['ADAPT', 'PRODUCE'].contains(x));
}

void _money(dynamic value) {
  final v = _map(value);
  _keys(v, ['currency', 'amount_minor']);
  licenseRequire(v['currency'] is String &&
      RegExp(r'^[A-Z]{3}$').hasMatch(v['currency']) &&
      _int(v['amount_minor']));
}

void _review(dynamic value) {
  if (value == null) return;
  final v = _map(value);
  _keys(v, ['decision', 'reason', 'reviewer_account_id', 'verification']);
  licenseRequire(['APPROVED', 'REJECTED'].contains(v['decision']) &&
      _text(v['reason'], 2000) &&
      supplyId(v['reviewer_account_id']));
  if (v['verification'] != null) {
    final t = _map(v['verification']);
    _keys(t, [
      'signed_contract_sha256',
      'identity_verified',
      'seller_signature_verified',
      'buyer_signature_verified',
      'currency',
      'received_minor',
      'payee_party_id',
      'receipt_ref'
    ]);
    licenseRequire(_hash(t['signed_contract_sha256']) &&
        t['identity_verified'] == true &&
        t['seller_signature_verified'] == true &&
        t['buyer_signature_verified'] == true &&
        t['currency'] is String &&
        RegExp(r'^[A-Z]{3}$').hasMatch(t['currency']) &&
        _int(t['received_minor']) &&
        supplyId(t['payee_party_id']) &&
        (t['receipt_ref'] == null || _text(t['receipt_ref'], 128)));
  }
}

void _contract(dynamic value, String party) {
  final v = _map(value);
  _keys(v, [
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
  licenseRequire(v['format_version'] == 'contract-content-v1' &&
      supplyId(v['id']) &&
      supplyId(v['contract_version_id']) &&
      _date(v['created_at']) &&
      v['object_version'] == 1 &&
      v['current_status'] == 'SEALED' &&
      v['signing_method'] == 'NOT_SIGNED' &&
      _hash(v['content_sha256']));
  _array(v['party_ids'], supplyId);
  licenseRequire((v['party_ids'] as List).contains(party) &&
      v['commitments'] is Map &&
      (v['commitments'] as Map).isNotEmpty &&
      v['rule_contents'] is List &&
      (v['rule_contents'] as List).isNotEmpty &&
      (v['rule_contents'] as List).length <= 100);
  for (final r in v['rule_contents']) {
    try {
      ContractApi.validateRule(_map(r));
    } catch (_) {
      licenseRequire(false);
    }
  }
}

class LicenseRecord {
  LicenseRecord._(this.value);
  final Map<String, dynamic> value;
  String get id => value['id'];
  String get kind => value['kind'];
  String get status => value['current_status'];
  String get owner => value['owner_party_id'];
  String? get counterparty => value['counterparty_id'];
  String? get parent => value['parent_id'];
  int get version => value['object_version'];
  Map<String, dynamic> get data => value['data'];
  String get title =>
      data['title'] ?? '${licenseKinds[kind]} · ${id.substring(id.length - 4)}';
  LicenseTerms? get terms =>
      data['terms'] == null ? null : LicenseTerms.parse(data['terms']);
  bool get expired => kind == 'RESERVATION'
      ? !DateTime.now().toUtc().isBefore(DateTime.parse(data['expires_at']))
      : kind == 'READING'
          ? !DateTime.now()
              .toUtc()
              .isBefore(DateTime.parse(data['valid_until']))
          : kind == 'GRANT'
              ? !terms!.developmentOpen
              : false;
  String get statusText => kind == 'PROJECT'
      ? '已登记用途'
      : kind == 'BINDING'
          ? '已绑定项目'
          : kind == 'RESERVATION' && status == 'HELD' && expired
              ? '预留已到期'
              : kind == 'READING' && status == 'APPROVED' && expired
                  ? '阅稿已到期'
                  : kind == 'GRANT' && status == 'ACTIVE' && expired
                      ? '当前不在可开发期限内'
                      : licenseStatuses[status] ?? status;
  factory LicenseRecord.parse(dynamic raw, String party,
      {String? kind, String? id, bool catalog = false}) {
    final v = _map(raw);
    _keys(v, [
      'id',
      'kind',
      'owner_party_id',
      'counterparty_id',
      'work_id',
      'parent_id',
      'created_by',
      'current_status',
      'object_version',
      'data'
    ]);
    licenseRequire(supplyId(v['id']) &&
        (id == null || v['id'] == id) &&
        licenseKinds.containsKey(v['kind']) &&
        (kind == null || v['kind'] == kind) &&
        supplyId(v['owner_party_id']) &&
        supplyId(v['created_by']) &&
        _int(v['object_version'], 1));
    for (final k in ['counterparty_id', 'work_id', 'parent_id']) {
      licenseRequire(v[k] == null || supplyId(v[k]));
    }
    licenseRequire(catalog
        ? v['kind'] == 'PRODUCT' && v['current_status'] == 'LISTED'
        : [v['owner_party_id'], v['counterparty_id']].contains(party) ||
            (v['kind'] == 'PRODUCT' && v['current_status'] == 'LISTED'));
    final d = _map(v['data']), k = v['kind'];
    final statuses = {
      'PRODUCT': ['IN_REVIEW', 'LISTED', 'REJECTED', 'UNLISTED'],
      'RESERVATION': ['HELD', 'COMMITTED', 'CANCELLED', 'REVIEW_REQUIRED'],
      'EVIDENCE': ['IN_REVIEW', 'APPROVED', 'REJECTED'],
      'GRANT': ['ACTIVE', 'SUSPENDED'],
      'PROJECT': ['ACTIVE'],
      'BINDING': ['ACTIVE'],
      'READING': ['IN_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED']
    };
    licenseRequire(statuses[k]!.contains(v['current_status']));
    if (['PRODUCT', 'RESERVATION'].contains(k)) {
      _keys(d, [
        'work_version_id',
        'title',
        'preview_text',
        'terms',
        'price',
        'payment_due_minor',
        'reservation_minutes',
        'rule_id',
        'review',
        if (k == 'RESERVATION') ...['contract', 'expires_at']
      ], [
        'close_reason',
        'grant_id',
        'late_reason'
      ]);
      licenseRequire(supplyId(d['work_version_id']) &&
          supplyId(d['rule_id']) &&
          _text(d['title'], 200) &&
          _text(d['preview_text'], 2000) &&
          _int(d['payment_due_minor']) &&
          _int(d['reservation_minutes'], 1, 10080));
      _money(d['price']);
      licenseRequire(d['payment_due_minor'] <= d['price']['amount_minor']);
      LicenseTerms.parse(d['terms']);
      _review(d['review']);
      if (k == 'RESERVATION') {
        _contract(d['contract'], party);
        licenseRequire(_date(d['expires_at']));
      }
    } else if (k == 'EVIDENCE') {
      _keys(d, [
        'contract_sha256',
        'seller_signature_asset_id',
        'buyer_signature_asset_id',
        'identity_asset_id',
        'payment_asset_id',
        'external_reference',
        'verification_method',
        'payment_channel_result',
        'review'
      ]);
      licenseRequire(_hash(d['contract_sha256']) &&
          _text(d['external_reference'], 128) &&
          d['verification_method'] == 'EXTERNAL_MANUAL_REVIEW' &&
          d['payment_channel_result'] == 'NOT_REPORTED');
      for (final x in [
        'seller_signature_asset_id',
        'buyer_signature_asset_id',
        'identity_asset_id'
      ]) {
        licenseRequire(supplyId(d[x]));
      }
      licenseRequire(
          d['payment_asset_id'] == null || supplyId(d['payment_asset_id']));
      _review(d['review']);
    } else if (k == 'GRANT') {
      _keys(d, [
        'work_version_id',
        'terms',
        'price',
        'contract',
        'evidence_id',
        'activated_at',
        'reason'
      ], [
        'suspension_reason'
      ]);
      licenseRequire(supplyId(d['work_version_id']) &&
          supplyId(d['evidence_id']) &&
          _date(d['activated_at']) &&
          _text(d['reason'], 2000));
      LicenseTerms.parse(d['terms']);
      _money(d['price']);
      _contract(d['contract'], party);
    } else if (k == 'PROJECT') {
      _keys(d, ['title', 'purpose', 'territory', 'language', 'episodes']);
      licenseRequire(_text(d['title'], 200) &&
          licensePurposes.containsKey(d['purpose']) &&
          d['territory'] is String &&
          RegExp(r'^[A-Z]{2}$').hasMatch(d['territory']) &&
          d['language'] is String &&
          RegExp(r'^[a-z]{2}$').hasMatch(d['language']) &&
          _int(d['episodes'], 1, 100000));
    } else if (k == 'BINDING') {
      _keys(d, ['project_id', 'work_version_id', 'terms_sha256']);
      licenseRequire(supplyId(d['project_id']) &&
          supplyId(d['work_version_id']) &&
          _hash(d['terms_sha256']));
    } else {
      _keys(d, [
        'work_version_id',
        'reader_account_id',
        'valid_until',
        'basis_type',
        'basis_asset_id',
        'review',
        'allows_generation'
      ], [
        'close_reason'
      ]);
      licenseRequire(supplyId(d['work_version_id']) &&
          supplyId(d['reader_account_id']) &&
          supplyId(d['basis_asset_id']) &&
          _date(d['valid_until']) &&
          ['NDA', 'EVALUATION_PERMISSION'].contains(d['basis_type']) &&
          d['allows_generation'] == false);
      _review(d['review']);
    }
    for (final key in ['close_reason', 'late_reason', 'suspension_reason']) {
      if (d.containsKey(key)) licenseRequire(_text(d[key], 2000));
    }
    if (d.containsKey('grant_id')) licenseRequire(supplyId(d['grant_id']));
    return LicenseRecord._(Map.unmodifiable(v));
  }
}

String licenseDate(String value) =>
    DateTime.parse(value).toLocal().toString().split('.').first;
String licenseMoney(Map<String, dynamic> money, {int? amount}) {
  final currency = money['currency'] as String,
      minor = amount ?? money['amount_minor'] as int;
  const symbols = {
    'CNY': '¥',
    'USD': r'$',
    'EUR': '€',
    'GBP': '£',
    'HKD': r'HK$',
    'JPY': '¥'
  };
  if (currency == 'JPY') return '${symbols[currency]}$minor JPY';
  if (symbols.containsKey(currency)) {
    return '${symbols[currency]}${minor ~/ 100}.${(minor % 100).toString().padLeft(2, '0')}${currency == 'CNY' ? '' : ' $currency'}';
  }
  return '$currency $minor（最小币种单位）';
}

String licenseError(Object error, {bool writing = false}) {
  if (error is! AccountError) return '处理未完成，请重新读取当前记录。';
  if (error.code == 'CONTEXT_CHANGED') return '办事身份已变化，旧内容已清空。';
  if (error.code == 'PENDING_OPERATION_CHANGED') {
    return '上次结果尚未确认，请先恢复原操作，不能更换内容。';
  }
  if (error.code == 'INVALID_LICENSE_RESPONSE') return '返回的记录不完整，暂不展示，请重新读取。';
  if (error.code == 'READING_FORMAT_NOT_SUPPORTED') {
    return '当前受控阅读只支持 UTF-8 纯文本，不能下载原稿绕过阅读限制。';
  }
  if (error.status == 412) return '记录已被更新。请重新读取，再核对并确认操作。';
  if (error.code == 'READING_FORBIDDEN') return '阅稿授权已失效或你不是指定读者，正文已清空。';
  if (error.status == 401) return '登录已失效，请重新登录。';
  if ([403, 404].contains(error.status)) return '记录不存在或当前身份无权查看，私有内容已清空。';
  if (error.code == 'LICENSE_CONFLICT') return '这份权利范围与已有许可或预留冲突，请核对范围。';
  if (error.code == 'LICENSE_QUOTA_EXHAUSTED') return '这份许可的项目额度已用完。';
  if (error.code == 'PROJECT_LICENSE_NOT_READY') {
    return '项目用途、范围、期限或许可状态不符合绑定条件。';
  }

  if (error.status == 409) return '当前条件不能办理，请重新读取记录，核对范围、期限及状态。';
  if (error.uncertain) {
    return writing ? '处理结果尚未确认。请恢复原操作，避免重复办理。' : '读取未完成，请检查网络后重新读取。';
  }
  if (error.status == 400) return '请核对必填内容和格式。';
  return '服务暂时无法处理，请稍后再试。';
}
