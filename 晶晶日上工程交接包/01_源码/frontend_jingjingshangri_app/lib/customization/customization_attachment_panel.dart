import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../account/account_api.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../supply/supply_files.dart';
import 'customization_api.dart';
import 'customization_attachments.dart';
import 'customization_models.dart';

class StoryAttachmentPanel extends StatefulWidget {
  const StoryAttachmentPanel({
    super.key,
    required this.api,
    required this.requestId,
    required this.fields,
    required this.answers,
    this.formalIds = const {},
    this.editable = false,
    this.enabled = true,
    this.readOnly = false,
    this.onBind,
    this.onWorking,
    this.onDenied,
    this.fieldErrors = const {},
  });
  final CustomizationApi api;
  final String requestId;
  final List<StoryField> fields;
  final Map<String, String> answers;
  final Set<String> formalIds;
  final Map<String, String> fieldErrors;
  final bool editable, enabled, readOnly;
  final void Function(String field, String id)? onBind;
  final ValueChanged<bool>? onWorking;
  final ValueChanged<AccountError>? onDenied;
  @override
  State<StoryAttachmentPanel> createState() => _StoryAttachmentPanelState();
}

class _StoryAttachmentPanelState extends State<StoryAttachmentPanel>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  late final files = StoryAttachmentApi(widget.api, widget.requestId);
  List<StoryAttachment> items = [];
  String? error, notice, uploadField;
  bool busy = false, verified = false, denied = false;
  int sent = 0, total = 0;
  bool uploading = false;
  int generation = 0;
  bool get locked => busy || !widget.enabled || (!denied && files.unresolved);
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) read();
    });
  }

  @override
  void dispose() {
    generation++;
    items.clear();
    super.dispose();
  }

  void start({bool upload = false}) {
    setState(() {
      busy = true;
      uploading = upload;
      sent = total = 0;
      error = notice = null;
    });
    widget.onWorking?.call(true);
  }

  void finish() {
    if (!mounted) return;
    setState(() {
      busy = false;
      uploading = false;
    });
    widget.onWorking?.call(false);
  }

  void fail(AccountError e) {
    setState(() {
      error = storyAttachmentError(e);
      if ([401, 403, 404].contains(e.status)) {
        denied = true;
        verified = false;
        items.clear();
        notice = null;
        generation++;
      }
    });
    if (denied) widget.onDenied?.call(e);
  }

  Future<void> read() async {
    if (busy) return;
    start();
    final ticket = ++generation;
    setState(() => verified = false);
    try {
      final result = await files.all();
      if (!mounted || ticket != generation) return;
      setState(() {
        items = result;
        verified = true;
        denied = false;
      });
    } on AccountError catch (e) {
      if (mounted && ticket == generation) fail(e);
    } finally {
      finish();
    }
  }

  void progress(int current, int length) {
    if (!mounted) return;
    setState(() {
      sent = current;
      total = length;
    });
  }

  void remember(StoryAttachment file) {
    items = [...items.where((old) => old.id != file.id), file];
  }

  Future<void> upload(String? field, {bool retry = false}) async {
    if (busy || (!retry && locked)) return;
    final epoch = widget.api.session.epoch,
        account = widget.api.session.account?['id'],
        party = widget.api.participant();
    start();
    try {
      StoryAttachment result;
      if (retry) {
        // A read alone does not resolve the original idempotent command.
        final current = await files.all();
        if (!mounted) return;
        setState(() {
          items = current;
          verified = true;
          uploading = true;
        });
        result = await files.retryUpload(onProgress: progress);
      } else {
        FocusManager.instance.primaryFocus?.unfocus();
        await WidgetsBinding.instance.endOfFrame;
        if (!mounted) return;
        widget.api.check(epoch, account, party);
        final selection = await FilePicker.pickFiles(
            type: FileType.custom,
            allowedExtensions: storyAttachmentMedia.keys.toList(),
            allowMultiple: false,
            withData: false,
            withReadStream: true);
        widget.api.check(epoch, account, party);
        if (!mounted || selection == null) return;
        final file = selection.files.single;
        final type = storyAttachmentMedia[file.extension?.toLowerCase()];
        if (type == null) throw const AccountError(400, 'INVALID_ASSET_TYPE');
        if (!storyAttachmentName(file.name)) {
          throw const AccountError(400, 'INVALID_ATTACHMENT_NAME');
        }
        final bytes = await supplyPickedBytes(file);
        widget.api.check(epoch, account, party);
        if (!mounted) return;
        setState(() {
          uploading = true;
          uploadField = field;
        });
        result =
            await files.upload(bytes, file.name, type, onProgress: progress);
      }
      widget.api.check(epoch, account, party);
      if (!mounted) return;
      setState(() {
        remember(result);
        notice = '附件已上传。选择对应问题并保存草稿后才会保存这次绑定；正式提交后平台才能读取。';
      });
      final target = retry ? uploadField : field;
      if (target != null && widget.fields.any((f) => f.key == target)) {
        widget.onBind?.call(target, result.id);
      }
      uploadField = null;
    } on AccountError catch (e) {
      if (mounted) fail(e);
    } catch (_) {
      if (mounted) setState(() => error = '文件选择未完成，请检查文件后重试。');
    } finally {
      finish();
    }
  }

  Future<void> download(StoryAttachment file) async {
    if (locked || !verified) return;
    final ticket = generation,
        epoch = widget.api.session.epoch,
        account = widget.api.session.account?['id'],
        party = widget.api.participant();
    start();
    try {
      final bytes = await files.download(file);
      widget.api.check(epoch, account, party);
      if (!mounted || ticket != generation) return;
      final extension = storyAttachmentMedia.entries
          .firstWhere((e) => e.value == file.mediaType)
          .key;
      final saved = await FilePicker.saveFile(
          fileName: '${file.id}.$extension', bytes: bytes);
      widget.api.check(epoch, account, party);
      if (!mounted || ticket != generation) return;
      setState(() => notice = kIsWeb
          ? '文件已交给浏览器保存。'
          : saved == null
              ? '已取消保存文件。'
              : '文件已保存。');
    } on AccountError catch (e) {
      if (mounted && ticket == generation) fail(e);
    } catch (_) {
      if (mounted && ticket == generation) {
        setState(() => error = '未能保存文件，请重试下载。');
      }
    } finally {
      finish();
    }
  }

  Future<void> revoke(StoryAttachment file) async {
    if (locked || !verified) return;
    final epoch = widget.api.session.epoch,
        account = widget.api.session.account?['id'],
        party = widget.api.participant();
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
              title: const Text('撤回附件访问？'),
              content: Text(
                  '将关闭“${file.name}”的访问，不表示彻底删除。已进入正式版本的资料需要按保留流程处理。当前草稿引用需另行保存。'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c, false),
                    child: const Text('取消')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, true),
                    child: const Text('确认撤回访问'))
              ],
            ));
    if (!mounted || confirmed != true) return;
    try {
      widget.api.check(epoch, account, party);
    } on AccountError {
      return;
    }
    await doRevoke(() => files.revoke(file));
  }

  Future<void> doRevoke(Future<StoryAttachment> Function() action) async {
    start();
    generation++;
    try {
      final result = await action();
      if (!mounted) return;
      setState(() {
        remember(result);
        notice = '附件访问已撤回。若本页引用已清空，请另行保存草稿；这不表示已彻底删除。';
      });
      for (final field in widget.fields) {
        if (widget.answers[field.key] == result.id) {
          widget.onBind?.call(field.key, '');
        }
      }
    } on AccountError catch (e) {
      if (mounted) fail(e);
    } finally {
      finish();
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final pending = denied ? null : files.uploadPending;
    final revocations =
        denied ? <Map<String, dynamic>>[] : files.revocationPending;
    final visible = widget.readOnly
        ? items.where((f) => widget.answers.values.contains(f.id)).toList()
        : items;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(widget.readOnly ? '正式版本附件' : '这份故事的私有附件',
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      const SizedBox(height: 8),
      const Text(
          '单文件 8 MiB 以内；每份故事最多 40 条上传记录（含待核对与已撤回）。支持 JPG、PNG、MP4、MP3、WAV、PDF、TXT。上传成功不表示人物授权或故事审核通过。',
          style:
              TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.5)),
      if (busy) ...[
        const SizedBox(height: 10),
        LinearProgressIndicator(
            value:
                uploading && total > 0 ? (sent / total).clamp(0.0, 1.0) : null),
        Text(
            uploading && total > 0
                ? sent >= total
                    ? '文件字节已传输，正在等待服务器核对结果…'
                    : '正在传输 $sent / $total 字节'
                : '正在读取或处理附件…',
            key: const ValueKey('story-attachment-progress')),
      ],
      if (error != null) appNotice(error!, icon: Icons.error_outline),
      if (notice != null) appNotice(notice!),
      if (pending != null) ...[
        appNotice(files.needsPlatformReview
            ? '原上传需要核对，可用下方按钮恢复。原文件和请求保留在当前登录会话；暂时离开后可重开同一故事继续，退出账号或切换身份会清理这些私有临时数据。'
            : '原上传结果尚未确认，原文件与请求已保留。请核对原操作，暂时不能选择另一文件或提交故事。'),
        OutlinedButton(
            key: const ValueKey('story-attachment-retry-upload'),
            onPressed: busy ? null : () => upload(null, retry: true),
            child: const Text('核对并恢复原上传')),
      ],
      for (final pending in revocations)
        OutlinedButton(
            key: ValueKey('story-attachment-retry-revoke-${pending['path']}'),
            onPressed: busy
                ? null
                : () => doRevoke(() => files.retryRevocation(pending)),
            child: const Text('核对原撤回访问结果')),
      for (final field in widget.fields) ...[
        const SizedBox(height: 16),
        Text('${field.label}${field.required ? ' · 必填' : ' · 选填'}',
            style: const TextStyle(fontWeight: FontWeight.w600)),
        if (widget.answers[field.key]?.isNotEmpty == true)
          Text(
              items
                      .where((f) => f.id == widget.answers[field.key])
                      .firstOrNull
                      ?.name ??
                  '当前附件待读取核对',
              key: ValueKey('story-attachment-value-${field.key}'))
        else
          const Text('尚未选择附件。'),
        if (widget.fieldErrors['answers.${field.key}'] != null)
          Text(widget.fieldErrors['answers.${field.key}']!,
              style: const TextStyle(color: AccountTheme.danger)),
        if (widget.editable && !widget.readOnly) ...[
          DropdownButtonFormField<String>(
              key: ValueKey(
                  'story-attachment-select-${field.key}-${widget.answers[field.key]}'),
              initialValue:
                  items.any((f) => f.ready && f.id == widget.answers[field.key])
                      ? widget.answers[field.key]
                      : '',
              isExpanded: true,
              decoration: const InputDecoration(labelText: '选择本故事已上传文件'),
              items: [
                const DropdownMenuItem(value: '', child: Text('暂不选择')),
                for (final file in items.where((f) => f.ready))
                  DropdownMenuItem(
                      value: file.id,
                      child: Text(file.name, overflow: TextOverflow.ellipsis))
              ],
              onChanged: locked || !verified
                  ? null
                  : (id) => widget.onBind?.call(field.key, id ?? '')),
          OutlinedButton.icon(
              key: ValueKey('story-upload-${field.key}'),
              onPressed: locked || !verified || items.length >= 40
                  ? null
                  : () => upload(field.key),
              icon: const Icon(Icons.upload_file_outlined),
              label: const Text('选择文件并上传')),
          const Text('更换选择仅修改本页答案，需另行保存；原附件访问不会自动撤回。',
              style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
        ],
      ],
      const SizedBox(height: 12),
      if (verified && visible.isEmpty && !busy)
        Text(widget.readOnly ? '此版本没有可读取附件。' : '尚无附件上传记录。'),
      for (final file in visible)
        Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: AccountTheme.border))),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(file.name,
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              Text('${file.size} 字节 · ${file.mediaType} · ${{
                'READY': '可读取',
                'UPLOADING': '上传待核对',
                'REVOKED': '访问已撤回'
              }[file.status]}'),
              if (file.retained ||
                  widget.formalIds.contains(file.id) ||
                  widget.readOnly)
                const Text('正式版本已引用，需按资料保留流程处理。',
                    style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
              Wrap(spacing: 8, children: [
                TextButton.icon(
                    key: ValueKey('story-attachment-download-${file.id}'),
                    onPressed: locked || !verified || !file.ready
                        ? null
                        : () => download(file),
                    icon: const Icon(Icons.file_download_outlined),
                    label: const Text('受控下载')),
                if (!widget.readOnly &&
                    file.status != 'REVOKED' &&
                    !file.retained &&
                    !widget.formalIds.contains(file.id))
                  TextButton(
                      key: ValueKey('story-attachment-revoke-${file.id}'),
                      onPressed:
                          locked || !verified ? null : () => revoke(file),
                      child: const Text('撤回附件访问')),
              ]),
            ])),
      TextButton(
          key: const ValueKey('story-attachments-refresh'),
          onPressed: busy ? null : read,
          child: const Text('重新读取附件记录')),
    ]);
  }
}
