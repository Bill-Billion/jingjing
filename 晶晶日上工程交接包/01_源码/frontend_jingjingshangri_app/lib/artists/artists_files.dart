import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../supply/supply_files.dart' show supplyPickedBytes;
import '../supply/supply_widgets.dart' show shortSupplyId;
import 'artists_api.dart';
import 'artists_models.dart';

class ArtistFiles extends StatefulWidget {
  const ArtistFiles(
      {super.key,
      required this.api,
      required this.person,
      required this.purpose,
      required this.ids,
      this.onChanged,
      this.onBusy,
      this.enabled = true});
  final ArtistsApi api;
  final ArtistPerson person;
  final String purpose;
  final List<String> ids;
  final ValueChanged<List<String>>? onChanged;
  final ValueChanged<bool>? onBusy;
  final bool enabled;
  @override
  State<ArtistFiles> createState() => _ArtistFilesState();
}

class _ArtistFilesState extends State<ArtistFiles> {
  final metadata = <String, Map<String, dynamic>>{};
  bool busy = false;
  String? notice;
  int ticket = 0;
  String get path => '${widget.api.personPath(widget.person.id)}/assets';
  @override
  void initState() {
    super.initState();
    read();
  }

  @override
  void didUpdateWidget(ArtistFiles old) {
    super.didUpdateWidget(old);
    if (!listEquals(old.ids, widget.ids)) read();
  }

  Future<void> read() async {
    final t = ++ticket;
    metadata.removeWhere((id, _) => !widget.ids.contains(id));
    try {
      for (final id in widget.ids) {
        final m = await widget.api.asset(id, widget.person,
            purpose: widget.onChanged == null ? null : widget.purpose);
        if (!mounted || t != ticket) return;
        setState(() => metadata[id] = m);
      }
    } on AccountError catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          metadata.clear();
          notice = artistError(e);
        });
      }
    }
  }

  Future<void> upload() async {
    final epoch = widget.api.session.epoch, party = widget.api.owner();
    setState(() {
      busy = true;
      notice = null;
    });
    widget.onBusy?.call(true);
    try {
      final pending = widget.api.pending(path);
      Uint8List bytes;
      String media;
      if (pending != null) {
        if (pending['query']['purpose'] != widget.purpose) {
          throw const AccountError(409, 'PENDING_OPERATION_CHANGED');
        }
        bytes = pending['bytes'];
        media = pending['query']['media_type'];
      } else {
        FocusManager.instance.primaryFocus?.unfocus();
        await WidgetsBinding.instance.endOfFrame;
        widget.api.check(epoch, party);
        if (!mounted) return;
        final files = await FilePicker.pickFiles(
            type: FileType.custom,
            allowedExtensions: artistMedia.keys.toList(),
            allowMultiple: false,
            withReadStream: true,
            withData: false);
        if (files == null) return;
        widget.api.check(epoch, party);
        if (!mounted) return;
        final file = files.files.single;
        media = artistMedia[file.extension?.toLowerCase()] ?? '';
        if (media.isEmpty) {
          throw const AccountError(400, 'FILE_TYPE_UNSUPPORTED');
        }
        bytes = await supplyPickedBytes(file);
        widget.api.check(epoch, party);
      }
      if (!mounted) return;
      final asset =
          await widget.api.upload(widget.person, bytes, widget.purpose, media);
      widget.api.check(epoch, party);
      if (!mounted) return;
      setState(() {
        metadata[asset['id']] = asset;
        notice = '私有材料已上传，尚未作出用途同意或提交审核。';
      });
      widget.onChanged?.call({...widget.ids, asset['id'] as String}.toList());
    } on AccountError catch (e) {
      if (mounted) setState(() => notice = artistError(e, writing: true));
    } catch (_) {
      if (mounted) setState(() => notice = '文件选择或上传未完成，请检查后重试。');
    } finally {
      if (mounted) {
        setState(() => busy = false);
        widget.onBusy?.call(false);
      }
    }
  }

  Future<void> download(String id) async {
    setState(() {
      busy = true;
      notice = null;
    });
    widget.onBusy?.call(true);
    final epoch = widget.api.session.epoch, party = widget.api.owner();
    try {
      final bytes = await widget.api.download(widget.person, id);
      widget.api.check(epoch, party);
      if (!mounted) return;
      final ext = artistMedia.entries
              .where((e) => e.value == metadata[id]?['media_type'])
              .map((e) => e.key)
              .firstOrNull ??
          'bin';
      final saved =
          await FilePicker.saveFile(fileName: '$id.$ext', bytes: bytes);
      widget.api.check(epoch, party);
      if (mounted) {
        setState(() => notice = kIsWeb
            ? '文件已交给浏览器保存。'
            : saved == null
                ? '已取消保存。'
                : '文件已保存。');
      }
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          metadata.clear();
          notice = artistError(e);
        });
      }
    } catch (_) {
      if (mounted) setState(() => notice = '文件保存未完成，请重新读取后再试。');
    } finally {
      if (mounted) {
        setState(() => busy = false);
        widget.onBusy?.call(false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = widget.api.pending(path),
        blocked = [
          'ASSET_UPLOAD_RECONCILIATION_REQUIRED',
          'UPLOAD_RECONCILIATION_REQUIRED'
        ].contains(pending?['code']);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final id in widget.ids)
        Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: AccountTheme.border))),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('材料 ${shortSupplyId(id)}',
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w600)),
                  if (metadata[id] != null)
                    Text(
                        '${metadata[id]!['media_type']} · ${metadata[id]!['byte_size']} 字节 · 本人私有',
                        style: const TextStyle(
                            fontSize: 12, color: AccountTheme.muted)),
                  Wrap(spacing: 8, children: [
                    TextButton(
                        onPressed: busy || metadata[id] == null
                            ? null
                            : () => download(id),
                        child: const Text('下载并核对材料')),
                    if (widget.onChanged != null)
                      TextButton(
                          onPressed: busy || !widget.enabled || pending != null
                              ? null
                              : () => widget.onChanged!(
                                  widget.ids.where((x) => x != id).toList()),
                          child: const Text('移除此处引用'))
                  ]),
                ])),
      if (widget.onChanged != null) ...[
        if (pending != null)
          appNotice(blocked ? '存储结果需平台核对，继续上传已暂停。' : '有一份上传结果待核对，请恢复同一份文件。'),
        DashedUpload(
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
              OutlinedButton.icon(
                  key: ValueKey('artist-upload-${widget.purpose}'),
                  onPressed: busy ||
                          !widget.enabled ||
                          blocked ||
                          pending != null &&
                              pending['query']['purpose'] != widget.purpose
                      ? null
                      : upload,
                  icon: const Icon(Icons.upload_file_outlined, size: 18),
                  label: Text(busy
                      ? '正在处理文件…'
                      : pending != null
                          ? '恢复原文件并核对'
                          : '选择并上传私有材料')),
              const SizedBox(height: 8),
              const Text(
                  'JPG、PNG、MP4、MP3、WAV、PDF、TXT · 每份不超过8 MiB。上传不等于允许公开或重新生成。',
                  style: TextStyle(
                      fontSize: 12, height: 1.6, color: AccountTheme.muted)),
            ])),
      ],
      if (notice != null) appNotice(notice!),
    ]);
  }
}
