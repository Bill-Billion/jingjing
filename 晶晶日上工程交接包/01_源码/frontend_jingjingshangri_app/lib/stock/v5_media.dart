import 'dart:ui' as ui;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../account/account_api.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../production/private_video.dart';
import '../trade/trade_widgets.dart';
import 'v5_support.dart';

class V5Media extends StatefulWidget {
  const V5Media(
      {super.key,
      required this.api,
      required this.label,
      required this.load,
      this.type = 'video',
      this.fileName = 'private-file',
      this.onOpened,
      this.onInvalid,
      this.caption,
      this.outline = false,
      this.allowSave = false,
      this.account = false});
  final V5Api api;
  final String label, type, fileName;
  final Future<Uint8List> Function() load;
  final Future<void> Function()? onOpened;
  final VoidCallback? onInvalid;
  final Widget? caption;
  final bool allowSave, account, outline;
  @override
  State<V5Media> createState() => _V5MediaState();
}

class _V5MediaState extends State<V5Media> {
  PrivateVideo? video;
  Uint8List? image;
  String? error, notice;
  bool busy = false, failed = false;
  int ticket = 0;
  @override
  void dispose() {
    ticket++;
    image = null;
    video?.dispose();
    super.dispose();
  }

  Future<void> open({bool save = false}) async {
    final t = ++ticket,
        epoch = widget.api.session.epoch,
        party = widget.account ? null : widget.api.session.partyId;
    widget.onInvalid?.call();
    setState(() {
      busy = true;
      failed = false;
      error = null;
      notice = null;
      image = null;
    });
    await video?.dispose();
    video = null;
    try {
      final bytes = await widget.load();
      widget.api.check(epoch, party);
      if (!mounted || t != ticket) return;
      if (widget.type == 'image') {
        final codec = await ui.instantiateImageCodec(bytes);
        final frame = await codec.getNextFrame();
        frame.image.dispose();
        codec.dispose();
        widget.api.check(epoch, party);
        if (!mounted || t != ticket) return;
        if (!save) setState(() => image = bytes);
      } else if (widget.type == 'video') {
        final local = await PrivateVideo.create(bytes);
        if (!mounted || t != ticket || epoch != widget.api.session.epoch) {
          await local.dispose();
          return;
        }
        video = local;
        local.controller.addListener(() {
          if (mounted &&
              t == ticket &&
              !failed &&
              local.controller.value.hasError) {
            failed = true;
            setState(() {
              notice = null;
              error = '视频未能实际打开，本次不能确认已查看。';
            });
            widget.onInvalid?.call();
          }
        });
        await local.controller.initialize();
        widget.api.check(epoch, party);
        if (!mounted || t != ticket || video != local) return;
        if (local.controller.value.hasError) {
          throw const AccountError(503, 'PRIVATE_CONTENT_MISMATCH');
        }
        if (!save) await local.controller.play();
        if (local.controller.value.hasError) {
          throw const AccountError(503, 'PRIVATE_CONTENT_MISMATCH');
        }
      }
      if (save) {
        final result =
            await FilePicker.saveFile(fileName: widget.fileName, bytes: bytes);
        widget.api.check(epoch, party);
        if (!mounted || t != ticket || failed) return;
        if (!kIsWeb && result == null) {
          setState(() => notice = '已取消保存，本次未确认收件。');
          return;
        }
        setState(() => notice = kIsWeb ? '本次私有文件已交给浏览器保存。' : '本次私有文件已保存。');
      } else {
        setState(() => notice = '本次私有预览已打开，请核对完整内容。');
      }
      if (failed) return;
      try {
        await widget.onOpened?.call();
        widget.api.check(epoch, party);
        if (failed) widget.onInvalid?.call();
      } on AccountError catch (e) {
        if (mounted && t == ticket && epoch == widget.api.session.epoch) {
          setState(() => error = '文件已读取，后续记录未刷新。${v5Error(e)}');
        }
      }
    } on AccountError catch (e) {
      await video?.dispose();
      video = null;
      if (mounted && t == ticket) {
        setState(() {
          image = null;
          error = v5Error(e);
        });
      }
    } catch (_) {
      await video?.dispose();
      video = null;
      if (mounted && t == ticket) {
        setState(() {
          image = null;
          error = save ? '文件保存未完成，请重新核对本次权限后重试。' : '文件未能实际打开，本次不能确认已查看。';
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!, icon: Icons.error_outline),
        if (notice != null) appNotice(notice!),
        if (image != null)
          Image.memory(image!,
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => appNotice('图片不能显示，请重新读取。')),
        if (video?.controller.value.isInitialized == true) ...[
          AspectRatio(
              aspectRatio: video!.controller.value.aspectRatio,
              child: VideoPlayer(video!.controller)),
        ] else if (widget.type == 'video')
          AspectRatio(
              aspectRatio: 16 / 9,
              child: ColoredBox(
                  color: AccountTheme.text,
                  child: const Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.play_arrow_outlined,
                        size: 36, color: AccountTheme.canvas),
                    SizedBox(height: 8),
                    Text('尚未读取预览',
                        style: TextStyle(
                            color: AccountTheme.canvas, fontSize: 12)),
                  ])))),
        if (widget.caption != null) widget.caption!,
        if (video?.controller.value.isInitialized == true)
          tradeButton('暂停预览', () => video!.controller.pause(), outline: true),
        tradeButton(
            widget.label, busy ? null : () => open(save: widget.type == 'file'),
            outline: widget.outline &&
                video?.controller.value.isInitialized != true),
        if (widget.allowSave && widget.type != 'file')
          tradeButton('下载本次私有文件', busy ? null : () => open(save: true),
              outline: true),
      ]);
}
