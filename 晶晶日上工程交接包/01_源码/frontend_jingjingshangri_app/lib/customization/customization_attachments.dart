import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import '../account/account_api.dart';
import 'customization_api.dart';
import 'customization_models.dart';

const storyAttachmentMaxBytes = 8 * 1024 * 1024;
const storyAttachmentMedia = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'mp4': 'video/mp4',
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'pdf': 'application/pdf',
  'txt': 'text/plain',
};

bool storyAttachmentName(dynamic value) =>
    value is String &&
    value.trim().isNotEmpty &&
    value.runes.length <= 120 &&
    !RegExp(r'[\x00-\x1f\x7f]').hasMatch(value);

class StoryAttachment {
  StoryAttachment(dynamic raw, String requestId) : data = storyMap(raw) {
    storyRequire(storyId(data['id']) &&
        data['request_id'] == requestId &&
        storyAttachmentName(data['display_name']) &&
        storyAttachmentMedia.containsValue(data['media_type']) &&
        data['byte_size'] is int &&
        data['byte_size'] > 0 &&
        data['byte_size'] <= storyAttachmentMaxBytes &&
        storyHash(data['content_sha256']) &&
        ['UPLOADING', 'READY', 'REVOKED'].contains(data['current_status']) &&
        data['object_version'] is int &&
        data['object_version'] >= 1 &&
        (!data.containsKey('retention_reason') ||
            data['retention_reason'] == null ||
            data['retention_reason'] == 'FORMAL_SUBMISSION'));
  }
  final Map<String, dynamic> data;
  String get id => data['id'];
  String get name => data['display_name'];
  String get mediaType => data['media_type'];
  int get size => data['byte_size'];
  int get version => data['object_version'];
  String get status => data['current_status'];
  bool get ready => status == 'READY';
  bool get retained => data['retention_reason'] == 'FORMAL_SUBMISSION';
}

/// All attachment operations remain scoped to the current story creator.
/// Metadata is never treated as a public URL or proof of rights clearance.
class StoryAttachmentApi {
  StoryAttachmentApi(this.story, this.requestId) {
    if (!storyId(requestId)) throw const AccountError(400, 'INVALID_ID');
  }
  final CustomizationApi story;
  final String requestId;
  String get path => '$storyCollection/$requestId/attachments';

  Map<String, dynamic>? get uploadPending =>
      story.session.pending('POST', path, actingParty: story.participant());
  List<Map<String, dynamic>> get revocationPending => story.session
      .pendingForPrefix('$path/')
      .where((p) =>
          RegExp('^${RegExp.escape(path)}/[0-9a-fA-F-]{36}/revocations\$')
              .hasMatch(p['path']))
      .toList();
  bool get unresolved => uploadPending != null || revocationPending.isNotEmpty;
  bool get needsPlatformReview =>
      uploadPending?['code'] == 'ASSET_UPLOAD_RECONCILIATION_REQUIRED';

  Future<StoryRelatedPage<StoryAttachment>> page({String? cursor}) async {
    if (cursor != null && (cursor.isEmpty || cursor.length > 512)) {
      throw const AccountError(400, 'INVALID_CURSOR');
    }
    final party = story.participant(),
        epoch = story.session.epoch,
        account = story.session.account?['id'];
    final raw = await story.session.read(path, actingParty: party, query: {
      'limit': 20,
      'include_retention': true,
      if (cursor != null) 'cursor': cursor,
    });
    story.check(epoch, account, party);
    storyRequire(raw['items'] is List &&
        (raw['items'] as List).length <= 20 &&
        (raw['next_cursor'] == null ||
            raw['next_cursor'] is String &&
                (raw['next_cursor'] as String).isNotEmpty &&
                (raw['next_cursor'] as String).length <= 512 &&
                raw['next_cursor'] != cursor));
    final items = (raw['items'] as List)
        .map((r) => StoryAttachment(r, requestId))
        .toList();
    storyRequire(items.map((r) => r.id).toSet().length == items.length);
    return StoryRelatedPage(items, raw['next_cursor']);
  }

  Future<List<StoryAttachment>> all() async {
    final items = <StoryAttachment>[];
    final cursors = <String>{};
    String? cursor;
    do {
      final result = await page(cursor: cursor);
      storyRequire(
          result.items.every((r) => !items.any((old) => old.id == r.id)));
      items.addAll(result.items);
      cursor = result.cursor;
      if (cursor != null) storyRequire(cursors.add(cursor));
      // Empty filtered pages can still have a valid continuation cursor.
    } while (cursor != null);
    return items;
  }

  Future<void> ensureReady(
      StoryTemplate template, Map<String, String> answers) async {
    final ids = template.fields
        .where((f) => f.type == 'PRIVATE_ATTACHMENT')
        .map((f) => answers[f.key] ?? '')
        .where((id) => id.isNotEmpty)
        .toSet();
    if (ids.isEmpty) return;
    final files = await all();
    if (ids.any((id) => !files.any((f) => f.id == id && f.ready))) {
      throw const AccountError(409, 'CUSTOMIZATION_ATTACHMENT_NOT_READY');
    }
  }

  Future<StoryAttachment> upload(Uint8List bytes, String name, String mediaType,
      {void Function(int sent, int total)? onProgress}) async {
    if (bytes.isEmpty || bytes.length > storyAttachmentMaxBytes) {
      throw const AccountError(400, 'INVALID_ASSET_SIZE');
    }
    if (!storyAttachmentName(name)) {
      throw const AccountError(400, 'INVALID_ATTACHMENT_NAME');
    }
    if (!storyAttachmentMedia.containsValue(mediaType)) {
      throw const AccountError(400, 'INVALID_ASSET_TYPE');
    }
    final original = Uint8List.fromList(bytes);
    final hash = sha256.convert(original).toString();
    final party = story.participant(),
        epoch = story.session.epoch,
        account = story.session.account?['id'];
    StoryAttachment parse(dynamic raw) {
      final asset = StoryAttachment(raw, requestId);
      storyRequire(asset.ready &&
          asset.name == name &&
          asset.mediaType == mediaType &&
          asset.size == original.length &&
          asset.data['content_sha256'] == hash);
      return asset;
    }

    final result = await story.session.upload(path, original,
        actingParty: party,
        query: {'display_name': name, 'media_type': mediaType},
        onSendProgress: onProgress,
        validate: parse);
    story.check(epoch, account, party);
    return parse(result);
  }

  Future<StoryAttachment> retryUpload(
      {void Function(int sent, int total)? onProgress}) {
    final pending = uploadPending;
    if (pending == null ||
        pending['bytes'] is! Uint8List ||
        pending['query'] is! Map) {
      throw const AccountError(409, 'NO_PENDING_OPERATION');
    }
    final query = storyMap(pending['query']);
    return upload(pending['bytes'], query['display_name'], query['media_type'],
        onProgress: onProgress);
  }

  Future<StoryAttachment> revoke(StoryAttachment asset) =>
      _revoke(asset.id, asset.version);

  Future<StoryAttachment> _revoke(String id, int version) async {
    if (!storyId(id)) throw const AccountError(400, 'INVALID_ID');
    final party = story.participant(),
        epoch = story.session.epoch,
        account = story.session.account?['id'];
    StoryAttachment parse(dynamic raw) {
      final asset = StoryAttachment(raw, requestId);
      storyRequire(asset.id == id &&
          asset.status == 'REVOKED' &&
          asset.version > version);
      return asset;
    }

    final result = await story.session.write('POST', '$path/$id/revocations',
        actingParty: party, body: {}, version: version, validate: parse);
    story.check(epoch, account, party);
    return parse(result);
  }

  Future<StoryAttachment> retryRevocation(Map<String, dynamic> pending) {
    final original = revocationPending
        .where((p) => p['path'] == pending['path'])
        .firstOrNull;
    if (original == null || original['version'] is! int) {
      throw const AccountError(409, 'NO_PENDING_OPERATION');
    }
    return _revoke(
        (original['path'] as String).split('/')[6], original['version']);
  }

  Future<Uint8List> download(StoryAttachment asset) async {
    if (!asset.ready) {
      throw const AccountError(409, 'CUSTOMIZATION_ATTACHMENT_NOT_READY');
    }
    final party = story.participant(),
        epoch = story.session.epoch,
        account = story.session.account?['id'];
    final bytes = await story.session
        .readBytes('$path/${asset.id}/content', actingParty: party);
    story.check(epoch, account, party);
    if (bytes.length != asset.size ||
        sha256.convert(bytes).toString() != asset.data['content_sha256']) {
      throw const AccountError(503, 'PRIVATE_CONTENT_MISMATCH');
    }
    return bytes;
  }
}

String storyAttachmentError(AccountError e) => switch (e.code) {
      'INVALID_ASSET_SIZE' ||
      'FILE_TOO_LARGE' =>
        '文件须为 1 字节至 8 MiB，请选择较小的完整文件。',
      'INVALID_ASSET_TYPE' ||
      'FILE_TYPE_UNSUPPORTED' =>
        '请选择 JPG、PNG、MP4、MP3、WAV、PDF 或 TXT 文件。',
      'INVALID_ATTACHMENT_NAME' => '文件名须为 1 至 120 字，且不能包含控制字符。请改名后重试。',
      'FILE_EMPTY' || 'FILE_UNREADABLE' => '无法完整读取文件，请重新选择。',
      'CUSTOMIZATION_ATTACHMENT_LIMIT' =>
        '这份故事已达到 40 条上传记录上限，包含待核对和已撤回记录；请联系平台核对。',
      'ASSET_UPLOAD_RECONCILIATION_REQUIRED' =>
        '上传结果待核对。原文件和原请求已保留，请核对并恢复原上传；若仍无法确认，可将故事与请求编号交平台处理。请勿换键重复上传。',
      'CUSTOMIZATION_ATTACHMENT_RETENTION_REQUIRED' =>
        '这个附件已被正式版本引用，需要按资料保留流程处理；附件访问没有撤回。',
      'CUSTOMIZATION_ATTACHMENT_NOT_READY' ||
      'CUSTOMIZATION_ATTACHMENT_REVOKED' =>
        '附件尚未就绪或已撤回，请重新核对附件后再保存或提交。',
      'CUSTOMIZATION_ATTACHMENT_NOT_EDITABLE' => '当前故事不能上传附件，请读取最新故事及补充要求。',
      'CUSTOMIZATION_ATTACHMENT_NOT_FOUND' => '附件不存在或当前身份无法读取，私有文件信息已清空。',
      'PRIVATE_CONTENT_MISMATCH' => '文件内容未通过完整性核对，本次未提供下载，请稍后重读。',
      _ => e.status == 413 ? '文件超过 8 MiB，请选择较小的文件。' : storyError(e),
    };
