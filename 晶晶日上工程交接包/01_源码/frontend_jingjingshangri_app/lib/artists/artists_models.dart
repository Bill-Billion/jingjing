import '../account/account_api.dart';

const artistKinds = {
  'IDENTITY': '实名记录',
  'CONSENT': '本人同意',
  'DELEGATION': '机构委托',
  'LOOK': '造型版本',
  'VOICE': '声音版本',
  'HALO': '认证申请',
  'APPEAL': '异议记录',
  'SERVICE': '创建与托管',
  'LISTING': '公开展示',
};
const artistFeatures = {'FACE': '形象 / 脸部', 'VOICE': '声音'};
const artistPurposes = {
  'PRIVATE_ARCHIVE': '仅私人档案',
  'PUBLIC_DISPLAY': '公开展示',
  'PROJECT_PRODUCTION': '具体项目制作',
  'STOCK_LICENSE': '现货许可',
  'NEW_GENERATION': '重新生成',
  'COOPERATION_SUBMISSION': '合作投稿',
  'AUDITION_SAMPLES': '试镜取样',
  'LONG_LIVED_MODEL': '长期模型（未启用）',
};
const artistActions = {
  'READ_PROFILE': '查看艺人资料',
  'MANAGE_MATERIALS': '代传和管理材料',
  'MANAGE_AVATARS': '管理数字人与版本',
  'SUBMIT_LISTING': '提交公开展示申请',
  'SUBMIT_COOPERATION': '提交合作意向',
  'MANAGE_AUDITIONS': '管理试镜事项',
  'COMMISSION_PRODUCTION': '委托制作',
};
const artistStatuses = {
  'ACTIVE': '有效',
  'SUSPENDED': '已暂停',
  'UNVERIFIED': '尚未核验',
  'VERIFIED': '已核验',
  'DUPLICATE_PERSON': '真人重复，需核对',
  'UNKNOWN': '结果待核对',
  'PENDING': '核验中',
  'SUBMITTED': '待独立审核',
  'APPROVED': '审核通过',
  'REJECTED': '未通过',
  'NEEDS_MATERIAL': '待补充材料',
  'WITHDRAWN': '已撤回',
  'RECORDED': '版本已保存',
  'REQUESTED': '已申请，等待报价或付款',
  'READY': '已具备服务办理条件',
  'DELIVERED': '服务结果已记录',
  'CANCELLED': '已取消',
  'REFUND_REQUIRED': '待办理退款',
  'REFUNDED': '退款已核实',
};
const artistServiceKinds = {
  'AVATAR_CREATION': '首次创建服务',
  'AVATAR_HOSTING': '数字人托管',
  'HALO_REVIEW': '认证审核服务',
};
const artistMedia = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'mp4': 'video/mp4',
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'pdf': 'application/pdf',
  'txt': 'text/plain',
};
const maxArtistBytes = 8 * 1024 * 1024;
void artistRequire(bool value) {
  if (!value) {
    throw const AccountError(502, 'INVALID_ARTIST_RESPONSE', uncertain: true);
  }
}

bool artistId(dynamic v) =>
    v is String &&
    RegExp(r'^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$')
        .hasMatch(v);
bool artistHash(dynamic v) =>
    v is String && RegExp(r'^[0-9a-f]{64}$').hasMatch(v);
bool artistDate(dynamic v) => v is String && DateTime.tryParse(v) != null;
Map<String, dynamic> artistMap(dynamic v) {
  artistRequire(v is Map<String, dynamic>);
  return v as Map<String, dynamic>;
}

List<dynamic> artistList(dynamic v, {int max = 100}) {
  artistRequire(v is List && v.length <= max);
  return v as List;
}

List<String> artistStrings(dynamic v, {bool ids = false, int max = 100}) {
  final rows = artistList(v, max: max);
  artistRequire(
      rows.every((x) => x is String && x.isNotEmpty && (!ids || artistId(x))) &&
          rows.toSet().length == rows.length);
  return rows.cast<String>();
}

String artistStatus(String value) => artistStatuses[value] ?? '状态待核对';
String artistWhen(dynamic v) {
  final d = v is String ? DateTime.tryParse(v)?.toLocal() : null;
  return d == null ? '—' : d.toString().split('.').first;
}

String artistMoney(int n) =>
    '¥${n ~/ 100}.${(n % 100).toString().padLeft(2, '0')}';

class ArtistPerson {
  ArtistPerson._(this.raw);
  final Map<String, dynamic> raw;
  String get id => raw['id'];
  String get owner => raw['owner_party_id'];
  String get name => raw['display_name'];
  int get version => raw['object_version'];
  bool get adultVerified =>
      raw['current_status'] == 'ACTIVE' &&
      raw['identity_status'] == 'VERIFIED' &&
      raw['age_band'] == 'ADULT' &&
      DateTime.tryParse(raw['identity_valid_until'] ?? '')
              ?.isAfter(DateTime.now()) ==
          true;
  static ArtistPerson parse(dynamic v) {
    final d = artistMap(v);
    artistRequire(artistId(d['id']) &&
        artistId(d['owner_party_id']) &&
        d['display_name'] is String &&
        (d['display_name'] as String).isNotEmpty &&
        (d['display_name'] as String).length <= 120 &&
        ['ACTIVE', 'SUSPENDED'].contains(d['current_status']) &&
        ['UNVERIFIED', 'VERIFIED', 'REJECTED', 'DUPLICATE_PERSON']
            .contains(d['identity_status']) &&
        ['UNKNOWN', 'ADULT', 'MINOR'].contains(d['age_band']) &&
        (d['identity_valid_until'] == null ||
            artistDate(d['identity_valid_until'])) &&
        d['object_version'] is int &&
        d['object_version'] > 0);
    return ArtistPerson._(d);
  }
}

class ArtistAvatar {
  ArtistAvatar._(this.raw);
  final Map<String, dynamic> raw;
  String get id => raw['id'];
  String get name => raw['data']['display_name'];
  static ArtistAvatar parse(dynamic v, ArtistPerson person) {
    final d = artistMap(v), body = artistMap(d['data']);
    artistRequire(artistId(d['id']) &&
        d['person_id'] == person.id &&
        d['owner_party_id'] == person.owner &&
        d['object_version'] is int &&
        d['object_version'] > 0 &&
        body['artist_person_id'] == person.id &&
        body['display_name'] is String &&
        (body['display_name'] as String).isNotEmpty &&
        body['provider_asset_ref'] == null &&
        ['EMPTY', 'DELIVERED'].contains(body['archive_status']) &&
        body['long_lived_model_status'] == 'NOT_ENABLED');
    artistStrings(body['material_asset_ids'], ids: true);
    return ArtistAvatar._(d);
  }
}

class ArtistDetail {
  ArtistDetail(this.person, this.avatars, this.halo);
  final ArtistPerson person;
  final List<ArtistAvatar> avatars;
  final int halo;
  static ArtistDetail parse(dynamic v, String id) {
    final d = artistMap(v), person = ArtistPerson.parse(d['person']);
    artistRequire(person.id == id &&
        d['halo_level'] is int &&
        d['halo_level'] >= 0 &&
        d['halo_level'] <= 3);
    final rows = artistList(d['avatars'])
        .map((x) => ArtistAvatar.parse(x, person))
        .toList();
    artistRequire(rows.map((x) => x.id).toSet().length == rows.length);
    return ArtistDetail(person, rows, d['halo_level']);
  }
}

const _recordStates = {
  'IDENTITY': [
    'PENDING',
    'UNKNOWN',
    'VERIFIED',
    'REJECTED',
    'DUPLICATE_PERSON'
  ],
  'CONSENT': [
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'NEEDS_MATERIAL',
    'WITHDRAWN'
  ],
  'DELEGATION': ['ACTIVE', 'WITHDRAWN'],
  'LOOK': ['RECORDED'],
  'VOICE': ['RECORDED'],
  'HALO': ['SUBMITTED', 'APPROVED', 'REJECTED', 'NEEDS_MATERIAL'],
  'APPEAL': ['SUBMITTED', 'APPROVED', 'REJECTED', 'NEEDS_MATERIAL'],
  'LISTING': [
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'NEEDS_MATERIAL',
    'WITHDRAWN'
  ],
  'SERVICE': [
    'REQUESTED',
    'READY',
    'DELIVERED',
    'CANCELLED',
    'REFUND_REQUIRED',
    'REFUNDED'
  ],
};

class ArtistRecord {
  ArtistRecord._(this.raw);
  final Map<String, dynamic> raw;
  String get id => raw['id'];
  String get personId => raw['person_id'];
  String get kind => raw['kind'];
  String get status => raw['current_status'];
  int get version => raw['object_version'];
  String? get avatarId => raw['avatar_id'];
  Map<String, dynamic> get data => raw['data'];
  bool get canSupplement =>
      ['CONSENT', 'HALO', 'APPEAL'].contains(kind) &&
      status == 'NEEDS_MATERIAL';
  bool get canAppeal =>
      ['HALO', 'LISTING'].contains(kind) && status == 'REJECTED';
  bool get canWithdraw =>
      ['CONSENT', 'DELEGATION', 'LISTING'].contains(kind) &&
      status != 'WITHDRAWN';
  static ArtistRecord parse(dynamic v, String personId,
      {String? id, String? kind}) {
    final d = artistMap(v), body = artistMap(d['data']);
    artistRequire(artistId(d['id']) &&
        (id == null || d['id'] == id) &&
        d['person_id'] == personId &&
        artistKinds.containsKey(d['kind']) &&
        (kind == null || d['kind'] == kind) &&
        (d['avatar_id'] == null || artistId(d['avatar_id'])) &&
        (d['counterparty_id'] == null || artistId(d['counterparty_id'])) &&
        artistId(d['created_by']) &&
        _recordStates[d['kind']]!.contains(d['current_status']) &&
        d['object_version'] is int &&
        d['object_version'] > 0 &&
        artistHash(d['content_sha256']));
    if (body.containsKey('evidence_asset_ids')) {
      artistStrings(body['evidence_asset_ids'], ids: true, max: 30);
    }
    if (d['kind'] == 'CONSENT') {
      artistRequire(artistId(body['grantee_party_id']) &&
          artistDate(body['valid_from']) &&
          artistDate(body['valid_until']) &&
          body['terms'] is String);
      artistRequire(artistStrings(body['features'], max: 2).isNotEmpty &&
          (body['features'] as List).every(artistFeatures.containsKey));
      artistRequire(artistStrings(body['purposes'], max: 4).isNotEmpty &&
          (body['purposes'] as List).every(artistPurposes.containsKey));
      artistStrings(body['territories'], max: 30);
    }
    if (d['kind'] == 'DELEGATION') {
      artistRequire(artistId(body['organization_party_id']) &&
          artistId(body['relation_id']) &&
          body['organization_party_id'] == d['counterparty_id'] &&
          artistDate(body['valid_from']) &&
          artistDate(body['valid_until']));
      artistRequire(artistStrings(body['actions'], max: 7).isNotEmpty &&
          (body['actions'] as List).every(artistActions.containsKey));
    }
    if (['LOOK', 'VOICE'].contains(d['kind'])) {
      artistRequire(artistId(d['avatar_id']) &&
          artistId(body['consent_id']) &&
          body['display_name'] is String &&
          body['revision'] is int &&
          body['revision'] > 0 &&
          (body['previous_version_id'] == null ||
              artistId(body['previous_version_id'])));
      artistStrings(body['material_asset_ids'], ids: true, max: 30);
    }
    if (d['kind'] == 'HALO') {
      artistRequire([1, 2, 3].contains(body['level']) &&
          body['ownership_promise'] == true);
    }
    if (d['kind'] == 'SERVICE') {
      artistServiceSpec(body['specification']);
      artistRequire(artistServiceKinds.containsKey(body['kind']) &&
          body['specification']['service']['kind'] == body['kind'] &&
          artistId(body['spec_id']) &&
          body['price_minor'] is int &&
          body['price_minor'] > 0 &&
          body['currency'] == 'CNY' &&
          body['renewal_reminder'] is bool &&
          body['auto_debit_enabled'] == false &&
          body['attempts'] is int &&
          body['attempts'] >= 0);
      artistRequire(body['kind'] == 'HALO_REVIEW'
          ? d['avatar_id'] == null && body['renewal_reminder'] == false
          : artistId(d['avatar_id']));
      if (d.containsKey('order') && d['order'] != null) {
        final order = artistMap(d['order']),
            financial = artistMap(order['financial']);
        artistRequire(
            artistId(order['id']) && order['current_status'] is String);
        for (final key in ['received_minor', 'refunded_minor', 'net_minor']) {
          artistRequire(financial[key] is int && financial[key] >= 0);
        }
      }
    }
    if (d['kind'] == 'LISTING') {
      artistRequire(body['display_name'] is String &&
          body['city'] is String &&
          body['introduction'] is String &&
          body['audition_public'] is bool &&
          artistId(body['consent_id']) &&
          artistId(body['look_version_id']) &&
          (body['voice_version_id'] == null ||
              artistId(body['voice_version_id'])));
      artistStrings(body['tags'], max: 15);
      artistStrings(body['preview_asset_ids'], ids: true, max: 6);
    }
    return ArtistRecord._(d);
  }
}

void artistServiceSpec(dynamic value) {
  final d = artistMap(value), s = artistMap(d['service']);
  artistRequire(d['version'] is String &&
      d['service_tier'] is String &&
      d['terms'] is String &&
      artistServiceKinds.containsKey(s['kind']) &&
      {
            'AVATAR_CREATION': 'PERSON_FIRST',
            'AVATAR_HOSTING': 'AVATAR_MONTH',
            'HALO_REVIEW': 'HALO_APPLICATION'
          }[s['kind']] ==
          s['unit'] &&
      s['retry_limit'] is int &&
      s['retry_limit'] >= 0 &&
      s['retry_limit'] <= 100 &&
      s['rule_version'] is String &&
      s['source_ref'] is String &&
      s['failure_policy'] == 'REFUND_UNDELIVERED');
  artistRequire(s['kind'] == 'AVATAR_HOSTING'
      ? s['hosting_months'] is int && s['hosting_months'] >= 1
      : s['hosting_months'] == null);
  artistRequire(s['kind'] == 'HALO_REVIEW'
      ? [2, 3].contains(s['halo_level'])
      : s['halo_level'] == null);
  artistRequire(artistStrings(d['deliverables'], max: 30).isNotEmpty);
}

class ArtistServices {
  ArtistServices(this.raw, this.offers);
  final Map<String, dynamic> raw;
  final List<Map<String, dynamic>> offers;
  static ArtistServices parse(dynamic v) {
    final d = artistMap(v);
    for (final key in ['identity', 'long_lived_model']) {
      final s = artistMap(d[key]);
      artistRequire(
          ['NOT_ENABLED', 'SERVICE_READY'].contains(s['current_status']) &&
              (s['reason_code'] == null || s['reason_code'] is String));
    }
    final offers = artistMap(d['offers']);
    artistRequire(
        ['NOT_ENABLED', 'CONFIGURED'].contains(offers['current_status']));
    final rows = artistList(offers['items']).map(artistMap).toList();
    for (final r in rows) {
      artistServiceSpec(r['specification']);
      artistRequire(artistId(r['spec_id']) &&
          artistId(r['merchant_party_id']) &&
          r['title'] is String &&
          r['price_minor'] is int &&
          r['price_minor'] > 0 &&
          r['currency'] == 'CNY' &&
          artistMap(r['product_profile'])['type'] ==
              r['specification']['service']['kind']);
    }
    artistRequire(rows.map((x) => x['spec_id']).toSet().length == rows.length);
    return ArtistServices(d, rows);
  }
}

class ArtistPage<T> {
  ArtistPage(this.items, this.cursor);
  final List<T> items;
  final String? cursor;
}

String artistError(AccountError e) => switch (e.code) {
      'CONTEXT_CHANGED' => '办事身份已变化，请重新打开本页。',
      'MINOR_OPERATION_RESTRICTED' => '儿童实际处理暂未开放，请勿上传儿童素材。',
      'HALO_VERIFIED_METRICS_NOT_AVAILABLE' => 'L3所需真实业务事实尚未具备，当前不能申请。',
      'ARTIST_IDENTITY_REQUIRED' || 'ARTIST_AGE_REQUIRED' => '请先完成有效的成人实名核验。',
      'ARTIST_PERSONAL_CONFIRMATION_REQUIRED' => '这一步需要真人本人在个人身份下办理。',
      'ARTIST_DELEGATION_REQUIRED' => '当前机构未获本人的有效委托，无法代办。',
      'ARTIST_SERVICE_PAYMENT_REQUIRED' ||
      'HALO_PAID_REVIEW_REQUIRED' =>
        '请先核对对应服务的原订单和实际收款，不能用付款意向代替。',
      'ARTIST_HOSTING_REQUIRED' => '该数字人的有效托管条件尚未满足。',
      'HALO_FACE_VOICE_CONSENT_REQUIRED' => '需要核对本人分别作出的形象和声音同意。',
      'PENDING_OPERATION_CHANGED' => '上次操作结果待核对，请先恢复原请求。',
      'ASSET_UPLOAD_RECONCILIATION_REQUIRED' ||
      'UPLOAD_RECONCILIATION_REQUIRED' =>
        '存储结果需平台核对。请保留原上传，暂勿更换文件或再次上传。',
      'INVALID_ARTIST_RESPONSE' ||
      'PRIVATE_CONTENT_MISMATCH' =>
        '返回资料无法核对，未采用本次内容。请重新读取。',
      _ => e.status == 412
          ? '记录已更新。本页输入已保留，请先读取当前版本核对。'
          : [401, 403, 404].contains(e.status)
              ? '当前账号无法查看这份资料，私有内容已清空。请核对账号与委托。'
              : e.uncertain
                  ? '操作结果尚未确认，请恢复同一请求核对。'
                  : '这一步未能完成，请检查资料和当前状态后重新读取。',
    };
