import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/app_visual.dart';
import '../account/account_theme.dart';
import 'supply_api.dart';
import 'supply_models.dart';
import 'supply_widgets.dart';

Future<Uint8List> supplyPickedBytes(PlatformFile file) async {
  if (file.size <= 0) throw const AccountError(400, 'FILE_EMPTY');
  if (file.size > maxSupplyBytes) {
    throw const AccountError(413, 'FILE_TOO_LARGE');
  }
  final output = BytesBuilder(copy: false);
  if (file.readStream != null) {
    await for (final chunk in file.readStream!) {
      if (output.length + chunk.length > maxSupplyBytes) {
        throw const AccountError(413, 'FILE_TOO_LARGE');
      }
      output.add(chunk);
    }
  } else if (file.bytes != null) {
    output.add(file.bytes!);
  } else {
    throw const AccountError(400, 'FILE_UNREADABLE');
  }
  if (output.length != file.size) {
    throw const AccountError(400, 'FILE_UNREADABLE');
  }
  return output.takeBytes();
}

class SupplyFiles extends StatefulWidget {
  const SupplyFiles(
      {super.key,
      required this.api,
      required this.purpose,
      required this.ids,
      this.onChanged,
      this.single = false,
      this.enabled = true});
  final SupplyApi api;
  final String purpose;
  final List<String> ids;
  final ValueChanged<List<String>>? onChanged;
  final bool single, enabled;
  @override
  State<SupplyFiles> createState() => _SupplyFilesState();
}

class _SupplyFilesState extends State<SupplyFiles> {
  final Map<String, Map<String, dynamic>> _metadata = {};
  String? _notice;
  bool _busy = false;
  int _ticket = 0;
  @override
  void initState() {
    super.initState();
    _read();
  }

  @override
  void didUpdateWidget(SupplyFiles old) {
    super.didUpdateWidget(old);
    if (!listEquals(old.ids, widget.ids)) _read();
  }

  Future<void> _read() async {
    final ticket = ++_ticket;
    _metadata.removeWhere((id, _) => !widget.ids.contains(id));
    try {
      for (final id in widget.ids) {
        final meta = await widget.api.asset(id, purpose: widget.purpose);
        if (!mounted || ticket != _ticket) return;
        setState(() => _metadata[id] = meta);
      }
    } on AccountError catch (e) {
      if (mounted && ticket == _ticket) {
        setState(() {
          _metadata.clear();
          _notice = supplyError(e);
        });
      }
    }
  }

  Future<void> _upload({bool retry = false}) async {
    final epoch = widget.api.session.epoch, party = widget.api.owner();
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      Uint8List bytes;
      String type;
      if (retry) {
        final pending = widget.api.pending('/api/v1/supply/assets')!;
        if (pending['query']['purpose'] != widget.purpose) {
          throw const AccountError(409, 'PENDING_OPERATION_CHANGED');
        }
        bytes = pending['bytes'] as Uint8List;
        type = pending['query']['media_type'] as String;
      } else {
        // Finish the current Flutter edit before a platform file input takes
        // focus. A frame closes the text-input connection with its value kept.
        FocusManager.instance.primaryFocus?.unfocus();
        await WidgetsBinding.instance.endOfFrame;
        if (!mounted) return;
        widget.api.check(epoch, party);
        final selected = await FilePicker.pickFiles(
            type: FileType.custom,
            allowedExtensions: supplyMedia.keys.toList(),
            allowMultiple: false,
            withData: false,
            withReadStream: true);
        if (selected == null) return;
        widget.api.check(epoch, party);
        if (!mounted) return;
        final file = selected.files.single;
        type = supplyMedia[file.extension?.toLowerCase()] ?? '';
        if (type.isEmpty) {
          throw const AccountError(400, 'FILE_TYPE_UNSUPPORTED');
        }
        bytes = await supplyPickedBytes(file);
        widget.api.check(epoch, party);
      }
      final asset = await widget.api.upload(bytes, widget.purpose, type);
      widget.api.check(epoch, party);
      if (!mounted) return;
      setState(() => _metadata[asset['id']] = asset);
      widget.onChanged?.call(widget.single
          ? [asset['id'] as String]
          : {...widget.ids, asset['id'] as String}.toList());
      setState(() => _notice = '私有文件已上传，可以引用到这份资料中。');
    } on AccountError catch (e) {
      if (mounted) setState(() => _notice = supplyError(e));
    } catch (_) {
      if (mounted) setState(() => _notice = '文件选择或上传未完成，请检查文件后重试。');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _download(String id) async {
    final epoch = widget.api.session.epoch, party = widget.api.owner();
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      final bytes = await widget.api.download(id);
      widget.api.check(epoch, party);
      if (!mounted) return;
      final type = _metadata[id]?['media_type'];
      final ext = supplyMedia.entries
              .where((e) => e.value == type)
              .map((e) => e.key)
              .firstOrNull ??
          'bin';
      final saved =
          await FilePicker.saveFile(fileName: '$id.$ext', bytes: bytes);
      widget.api.check(epoch, party);
      if (!mounted) return;
      setState(() => _notice = kIsWeb
          ? '文件已准备，已交给浏览器保存。'
          : saved == null
              ? '已取消保存。'
              : '文件已保存。');
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          _metadata.clear();
          _notice = supplyError(e);
        });
      }
    } catch (_) {
      if (mounted) setState(() => _notice = '保存未完成，请重试下载。');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = widget.api.pending('/api/v1/supply/assets');
    final blocked = pending?['code'] == 'UPLOAD_RECONCILIATION_REQUIRED';
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final id in widget.ids)
        Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(shortSupplyId(id),
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              if (_metadata[id] != null)
                Text(
                    '${_metadata[id]!['media_type']} · ${_metadata[id]!['byte_size']} 字节 · 私有资料',
                    style: const TextStyle(fontSize: 12)),
              Wrap(spacing: 8, children: [
                TextButton.icon(
                    onPressed: _busy || _metadata[id] == null
                        ? null
                        : () => _download(id),
                    icon: const Icon(Icons.file_download_outlined, size: 18),
                    label: const Text('下载文件')),
                if (widget.onChanged != null)
                  TextButton(
                      onPressed: _busy || !widget.enabled
                          ? null
                          : () => widget.onChanged!(
                              widget.ids.where((v) => v != id).toList()),
                      child: const Text('移除此处引用'))
              ]),
            ])),
      if (widget.onChanged != null) ...[
        if (pending != null)
          supplyNote(
              blocked
                  ? '上次上传需平台核实存储结果；已暂停继续上传，请联系平台处理。'
                  : '有一份上传的结果未确认。恢复原文件后会引用到本栏，请核对材料对应关系。',
              error: true),
        DashedUpload(
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
              Row(children: [
                const Icon(Icons.description_outlined,
                    size: 32, color: AccountTheme.accent),
                const SizedBox(width: 12),
                Expanded(
                    child: OutlinedButton.icon(
                        onPressed: _busy ||
                                !widget.enabled ||
                                blocked ||
                                (pending != null &&
                                    pending['query']['purpose'] !=
                                        widget.purpose)
                            ? null
                            : () => _upload(retry: pending != null),
                        icon: const Icon(Icons.upload_file_outlined),
                        label: Text(_busy
                            ? '正在处理文件…'
                            : pending != null
                                ? '恢复原文件并核对'
                                : widget.single && widget.ids.isNotEmpty
                                    ? '更换稿件'
                                    : '选择并上传文件'))),
              ]),
              const SizedBox(height: 10),
              const Text(
                  'PDF、TXT、JPG、PNG、WAV、MP3、MP4、BIN · 每个不超过 8 MiB · 当前身份私有',
                  style: TextStyle(
                      fontSize: 12, color: AccountTheme.muted, height: 1.5)),
            ])),
      ],
      if (_notice != null) supplyNote(_notice!),
    ]);
  }
}
