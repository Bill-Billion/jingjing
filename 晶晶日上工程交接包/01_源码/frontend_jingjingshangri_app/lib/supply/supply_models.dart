import '../account/account_api.dart';

const supplyMedia = {
  'pdf': 'application/pdf',
  'txt': 'text/plain',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'wav': 'audio/wav',
  'mp3': 'audio/mpeg',
  'mp4': 'video/mp4',
  'bin': 'application/octet-stream'
};
const maxSupplyBytes = 8 * 1024 * 1024;
const creditRoles = {'AUTHOR': '作者', 'RIGHTS_HOLDER': '权利人', 'AGENT': '代理'};
const supplyStatuses = {
  'PENDING_REVIEW': '等待供给审核',
  'APPROVED': '已通过',
  'CHANGES_REQUESTED': '需要补正材料',
  'REJECTED': '未通过',
  'DRAFT': '草稿',
  'AWAITING_REVIEW': '等待权属与内容审核',
  'REVIEWS_COMPLETE': '权属与内容审核已完成',
  'WITHDRAWN': '已撤回'
};
bool supplyId(dynamic value) =>
    value is String &&
    RegExp(r'^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$').hasMatch(value);
void supplyRequire(bool value) {
  if (!value) {
    throw const AccountError(502, 'INVALID_SUPPLY_RESPONSE', uncertain: true);
  }
}

bool _text(dynamic value, int max) =>
    value is String && value.trim().isNotEmpty && value.length <= max;
bool _version(dynamic value) =>
    value is int && value >= 1 && value <= 4294967294;
bool _hash(dynamic value) =>
    value is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(value);
bool _instant(dynamic value) =>
    value is String &&
    RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$').hasMatch(value) &&
    DateTime.tryParse(value)?.toUtc().toIso8601String() == value;
void _keys(Map data, List<String> keys) =>
    supplyRequire(data.length == keys.length && keys.every(data.containsKey));
void _ids(dynamic value, {int min = 1}) => supplyRequire(value is List &&
    value.length >= min &&
    value.length <= 100 &&
    value.every(supplyId) &&
    value.toSet().length == value.length);
Map<String, dynamic> _map(dynamic value) {
  supplyRequire(value is Map<String, dynamic>);
  return value as Map<String, dynamic>;
}

void _review(dynamic value) {
  final data = _map(value);
  _keys(data, ['decision', 'reason', 'reviewer_account_id', 'recorded_at']);
  supplyRequire(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']
          .contains(data['decision']) &&
      _text(data['reason'], 1000) &&
      supplyId(data['reviewer_account_id']) &&
      _instant(data['recorded_at']));
}

class SupplyDto {
  static void asset(Map<String, dynamic> data, String owner,
      {String? purpose}) {
    _keys(data, [
      'id',
      'owner_party_id',
      'purpose',
      'media_type',
      'byte_size',
      'content_sha256',
      'current_status'
    ]);
    supplyRequire(supplyId(data['id']) &&
        data['owner_party_id'] == owner &&
        [
          'WORK_CONTENT',
          'RIGHTS_EVIDENCE',
          'CONSENT_EVIDENCE',
          'REVIEW_EVIDENCE',
          'AVATAR_MATERIAL'
        ].contains(data['purpose']) &&
        (purpose == null || data['purpose'] == purpose) &&
        supplyMedia.containsValue(data['media_type']) &&
        data['byte_size'] is int &&
        data['byte_size'] >= 1 &&
        data['byte_size'] <= maxSupplyBytes &&
        _hash(data['content_sha256']) &&
        data['current_status'] == 'READY');
  }

  static void record(Map<String, dynamic> data, String owner,
      {String? kind, String? id}) {
    _keys(data, [
      'id',
      'kind',
      'stream_ref',
      'revision',
      'owner_party_id',
      'created_by',
      'current_status',
      'object_version',
      'data'
    ]);
    supplyRequire(supplyId(data['id']) &&
        (id == null || data['id'] == id) &&
        ['PROFILE', 'WORK_VERSION'].contains(data['kind']) &&
        (kind == null || data['kind'] == kind) &&
        _text(data['stream_ref'], 128) &&
        _version(data['revision']) &&
        data['owner_party_id'] == owner &&
        supplyId(data['created_by']) &&
        _version(data['object_version']));
    final body = _map(data['data']);
    if (data['kind'] == 'PROFILE') {
      _keys(body,
          ['display_name', 'description', 'evidence_asset_ids', 'review']);
      _ids(body['evidence_asset_ids']);
      supplyRequire(_text(body['display_name'], 120) &&
          _text(body['description'], 2000) &&
          ['PENDING_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED']
              .contains(data['current_status']));
      if (body['review'] != null) _review(body['review']);
      supplyRequire(body['review'] == null
          ? data['current_status'] == 'PENDING_REVIEW'
          : data['current_status'] == body['review']['decision']);
      return;
    }
    _keys(body, ['version', 'credits']);
    final v = _map(body['version']), c = _map(v['content']);
    _keys(v, [
      'content',
      'object_version',
      'current_status',
      'submitted_at',
      'reviews',
      'withdrawal'
    ]);
    _keys(c, [
      'id',
      'work_id',
      'revision',
      'kind',
      'source_version_id',
      'project_id',
      'owner_party_id',
      'title',
      'content_asset_id',
      'content_sha256',
      'evidence_ids'
    ]);
    supplyRequire(c['id'] == data['id'] &&
        supplyId(c['work_id']) &&
        c['work_id'] == data['stream_ref'] &&
        c['revision'] == data['revision'] &&
        c['owner_party_id'] == owner &&
        _text(c['title'], 200) &&
        supplyId(c['content_asset_id']) &&
        _hash(c['content_sha256']) &&
        v['object_version'] == data['object_version']);
    supplyRequire(c['kind'] == 'ORIGINAL'
        ? c['source_version_id'] == null && c['project_id'] == null
        : c['kind'] == 'PROJECT_ADAPTATION' &&
            supplyId(c['source_version_id']) &&
            supplyId(c['project_id']));
    _ids(c['evidence_ids'], min: 0);
    final credits = body['credits'];
    supplyRequire(
        credits is List && credits.isNotEmpty && credits.length <= 30);
    final parties = <String>{};
    for (final value in credits) {
      final credit = _map(value);
      _keys(credit, ['party_id', 'role', 'evidence_asset_ids']);
      supplyRequire(supplyId(credit['party_id']) &&
          creditRoles.containsKey(credit['role']) &&
          parties.add('${credit['party_id']}:${credit['role']}'));
      _ids(credit['evidence_asset_ids']);
    }
    supplyRequire((credits as List).any((e) => e['role'] == 'RIGHTS_HOLDER'));
    supplyRequire(
        ['DRAFT', 'SUBMITTED', 'WITHDRAWN'].contains(v['current_status']) &&
            (v['submitted_at'] == null || _instant(v['submitted_at'])) &&
            v['reviews'] is List &&
            (v['reviews'] as List).length <= 2);
    final channels = <String>{};
    for (final value in v['reviews']) {
      final r = _map(value);
      _keys(r, [
        'channel',
        'decision',
        'reviewer_account_id',
        'evidence_ref',
        'reason',
        'recorded_at',
        'version_id'
      ]);
      supplyRequire(['RIGHTS', 'CONTENT'].contains(r['channel']) &&
          channels.add(r['channel']) &&
          ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']
              .contains(r['decision']) &&
          supplyId(r['reviewer_account_id']) &&
          _text(r['evidence_ref'], 128) &&
          _text(r['reason'], 1000) &&
          _instant(r['recorded_at']) &&
          r['version_id'] == data['id']);
    }
    final reviews = v['reviews'] as List;
    if (v['current_status'] == 'DRAFT') {
      supplyRequire(v['submitted_at'] == null && reviews.isEmpty);
    }
    if (v['current_status'] == 'SUBMITTED') {
      supplyRequire(v['submitted_at'] != null);
    }
    if (v['current_status'] == 'WITHDRAWN') {
      final w = _map(v['withdrawal']);
      _keys(w, ['reason', 'recorded_at']);
      supplyRequire(_text(w['reason'], 1000) && _instant(w['recorded_at']));
    } else {
      supplyRequire(v['withdrawal'] == null);
    }
    final progress = v['current_status'] == 'WITHDRAWN'
        ? 'WITHDRAWN'
        : v['current_status'] == 'DRAFT'
            ? 'DRAFT'
            : reviews.any((r) => r['decision'] == 'REJECTED')
                ? 'REJECTED'
                : reviews.any((r) => r['decision'] == 'CHANGES_REQUESTED')
                    ? 'CHANGES_REQUESTED'
                    : reviews.length == 2
                        ? 'REVIEWS_COMPLETE'
                        : 'AWAITING_REVIEW';
    supplyRequire(data['current_status'] == progress);
  }

  static void page(Map<String, dynamic> data, String owner, String kind) {
    _keys(data, ['items', 'next_cursor']);
    supplyRequire(data['items'] is List &&
        (data['items'] as List).length <= 100 &&
        (data['next_cursor'] == null || supplyId(data['next_cursor'])));
    for (final item in data['items']) {
      record(_map(item), owner, kind: kind);
    }
  }
}

String supplyError(Object error) {
  if (error is! AccountError) return '暂时无法处理，请稍后重新核对。';
  const messages = {
    'INVALID_SUPPLY_RESPONSE': '返回的资料不完整或不匹配，尚未确认结果。请重新读取或核对原操作。',
    'SUPPLY_OWNER_REQUIRED': '当前身份没有作者资料的管理权限，请切换到本人或机构负责人身份。',
    'SUPPLIER_NOT_APPROVED': '当前身份的供给申请尚未通过，请先查看申请状态。',
    'PREVIOUS_VERSION_MISMATCH': '已有更新的修订。请刷新最新记录，再确认补正或新修订内容。',
    'UPLOAD_RECONCILIATION_REQUIRED': '这份上传需要人工核对，暂不能重新上传或引用。请保留当前操作并联系平台。',
    'PRIVATE_MATERIAL_NOT_READY': '所选材料尚不可用或不属于当前身份，请重新核对材料。',
    'PROJECT_LICENSE_NOT_READY': '项目改稿尚未开放，请提交原作。',
    'FILE_TOO_LARGE': '文件超过 8 MiB，请选择较小的文件。',
    'FILE_TYPE_UNSUPPORTED': '请选择 PDF、TXT、JPG、PNG、WAV、MP3、MP4 或 BIN 文件。',
    'FILE_EMPTY': '文件为空或无法读取，请重新选择。',
    'PRIVATE_CONTENT_MISMATCH': '文件内容校验未通过，未提供下载，请稍后重试。',
    'INVALID_ID': '请核对完整的小写资料或主体编号。',
    'FORM_TOO_LARGE': '材料引用过多，表单超出大小限制，请减少引用后提交。',
    'FILE_UNREADABLE': '文件未能完整读取，请重新选择。',
    'PROOF_REQUIRED': '请先上传至少一份权利证明。',
    'MANUSCRIPT_REQUIRED': '请先上传一份私有稿件。',
    'RIGHTS_HOLDER_REQUIRED': '请至少添加一位权利人，并提供对应证明。',
    'CREDIT_INCOMPLETE': '请为每位关系主体填写完整编号，并分别上传证明。',
    'DUPLICATE_CREDIT': '同一主体的同一角色只能填写一行。',
    'MATERIALS_REQUIRED': '请补齐稿件及权利材料。',
    'INVALID_CREDITS': '请填写至少一名权利人，并分别提供每一方的主体编号和证据。',
  };
  if (messages.containsKey(error.code)) return messages[error.code]!;
  if (error.status == 412) return '记录已更新，请刷新当前记录，核对后重新确认操作。';
  if ([401, 403, 404].contains(error.status)) return '登录或查看权限已变化，请重新登录或核对当前身份。';
  if (error.status == 413) return '文件超过 8 MiB，请选择较小的文件。';
  return error.message;
}
