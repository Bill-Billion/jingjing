import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../production/private_video.dart';
import '../trade/trade_widgets.dart';
import '../widgets/editorial_icons.dart';
import 'artists_api.dart';
import 'artists_models.dart';

Future<ImageProvider> _verifiedImage(Uint8List bytes, String type,
    {int? width}) async {
  final prefix =
      type == 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10] : [255, 216, 255];
  artistRequire(bytes.length >= prefix.length &&
      List.generate(prefix.length, (i) => bytes[i] == prefix[i])
          .every((v) => v));
  final codec = await ui.instantiateImageCodec(bytes, targetWidth: width);
  try {
    final frame = await codec.getNextFrame();
    frame.image.dispose();
  } finally {
    codec.dispose();
  }
  return ResizeImage.resizeIfNeeded(width, null, MemoryImage(bytes));
}

bool _unavailable(AccountError error) =>
    [401, 403, 404, 409].contains(error.status);

/// Only the explicitly selected, approved portrait can appear in the catalogue.
class ArtistPublicPortrait extends StatefulWidget {
  const ArtistPublicPortrait(
      {super.key,
      required this.session,
      required this.listing,
      this.media,
      this.aspectRatio = 1,
      this.onUnavailable});
  final AccountSession session;
  final Map<String, dynamic> listing;
  final ArtistPublicMedia? media;
  final double aspectRatio;
  final VoidCallback? onUnavailable;

  @override
  State<ArtistPublicPortrait> createState() => _ArtistPublicPortraitState();
}

class _ArtistPublicPortraitState extends State<ArtistPublicPortrait> {
  ImageProvider? _image;
  int _read = 0;
  bool _busy = false, _failed = false;
  late (int, String?, bool) _context;

  (int, String?, bool) get _currentContext => (
        widget.session.epoch,
        widget.session.partyId,
        widget.session.artistsAccessDenied
      );

  @override
  void initState() {
    super.initState();
    _context = _currentContext;
    widget.session.addListener(_sessionChanged);
    unawaited(_load());
  }

  void _evict() {
    final old = _image;
    _image = null;
    if (old != null) unawaited(old.evict());
  }

  void _sessionChanged() {
    if (_context == _currentContext) return;
    _context = _currentContext;
    _read++;
    _evict();
    if (mounted) setState(() => _busy = false);
  }

  @override
  void didUpdateWidget(ArtistPublicPortrait oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.session != widget.session) {
      oldWidget.session.removeListener(_sessionChanged);
      widget.session.addListener(_sessionChanged);
    }
    if (oldWidget.session != widget.session ||
        oldWidget.listing != widget.listing ||
        oldWidget.media != widget.media) {
      _context = _currentContext;
      unawaited(_load());
    }
  }

  Future<void> _load() async {
    final read = ++_read, session = widget.session;
    final started = _currentContext;
    _evict();
    _failed = false;
    _busy = false;
    if (!session.isLoggedIn || session.artistsAccessDenied) return;
    _busy = true;
    bool current() =>
        mounted &&
        read == _read &&
        started == _currentContext &&
        session.isLoggedIn;
    try {
      final listing = widget.listing, api = ArtistsApi(session);
      final media = widget.media ??
          await api.publicMedia(listing['listing_id'],
              previewIds: artistStrings(listing['preview_asset_ids'],
                  ids: true, max: 6));
      if (!current()) return;
      artistRequire(media.listingId == listing['listing_id']);
      final portrait = media.portrait;
      if (portrait == null) return;
      final bytes = await api.publicPreview(media.listingId, portrait.id,
          metadata: portrait);
      if (!current()) return;
      final image = await _verifiedImage(bytes, portrait.type, width: 256);
      if (!current()) {
        unawaited(image.evict());
        return;
      }
      _image = image;
    } on AccountError catch (error) {
      if (!current()) return;
      _failed = true;
      _evict();
      if (_unavailable(error)) widget.onUnavailable?.call();
    } catch (_) {
      if (current()) {
        _failed = true;
        _evict();
      }
    } finally {
      if (current()) setState(() => _busy = false);
    }
  }

  Widget _placeholder() => Center(
      child: Padding(
          padding: const EdgeInsets.all(4),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(EditorialIcons.user,
                color: AccountTheme.muted, size: 24),
            const SizedBox(height: 4),
            Text(_failed ? '图片暂不可用' : '未选择公开主肖像',
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 10, color: AccountTheme.muted, height: 1.3))
          ])));

  @override
  Widget build(BuildContext context) => AspectRatio(
      aspectRatio: widget.aspectRatio,
      child: ColoredBox(
          color: const Color(0xFFE5E1D7),
          child: _image != null
              ? Image(
                  image: _image!,
                  fit: BoxFit.cover,
                  semanticLabel: '${widget.listing['display_name']}的获准公开主肖像',
                  errorBuilder: (_, __, ___) {
                    scheduleMicrotask(() {
                      if (!mounted || _image == null) return;
                      setState(() {
                        _failed = true;
                        _evict();
                      });
                    });
                    return _placeholder();
                  })
              : _busy
                  ? const Center(
                      child: SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 1)))
                  : _placeholder()));

  @override
  void dispose() {
    _read++;
    _evict();
    widget.session.removeListener(_sessionChanged);
    super.dispose();
  }
}

/// Media bytes never become public URLs; players own and release temporary data.
class ArtistPublicMediaView extends StatefulWidget {
  const ArtistPublicMediaView(
      {super.key,
      required this.session,
      required this.listingId,
      required this.item,
      required this.index,
      this.onUnavailable});
  final AccountSession session;
  final String listingId;
  final ArtistPublicMediaItem item;
  final int index;
  final VoidCallback? onUnavailable;
  @override
  State<ArtistPublicMediaView> createState() => _ArtistPublicMediaViewState();
}

class _ArtistPublicMediaViewState extends State<ArtistPublicMediaView> {
  ImageProvider? _image;
  PrivateVideo? _player;
  PrivateVideo? _loadingPlayer;
  int _read = 0;
  bool _busy = false;
  String? _error;
  late (int, String?, bool) _context;
  (int, String?, bool) get _currentContext => (
        widget.session.epoch,
        widget.session.partyId,
        widget.session.artistsAccessDenied
      );

  @override
  void initState() {
    super.initState();
    _context = _currentContext;
    widget.session.addListener(_sessionChanged);
  }

  void _release() {
    final image = _image, player = _player, loading = _loadingPlayer;
    _image = null;
    _player = null;
    _loadingPlayer = null;
    if (image != null) unawaited(image.evict());
    if (player != null) {
      player.controller.removeListener(_playbackChanged);
      unawaited(player.dispose());
    }
    if (loading != null) unawaited(loading.dispose());
  }

  void _sessionChanged() {
    if (_context == _currentContext) return;
    _context = _currentContext;
    _read++;
    _release();
    if (mounted) {
      setState(() {
        _busy = false;
        _error = null;
      });
    }
  }

  @override
  void didUpdateWidget(ArtistPublicMediaView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.session != widget.session) {
      oldWidget.session.removeListener(_sessionChanged);
      widget.session.addListener(_sessionChanged);
    }
    if (oldWidget.session != widget.session ||
        oldWidget.listingId != widget.listingId ||
        oldWidget.item != widget.item) {
      _read++;
      _context = _currentContext;
      _release();
      _busy = false;
      _error = null;
    }
  }

  void _decodeFailed() {
    if (!mounted) return;
    _read++;
    setState(() {
      _release();
      _busy = false;
      _error = '这份预览暂时无法解码，请重新读取或保存后查看。';
    });
  }

  void _playbackChanged() {
    if (_player?.controller.value.hasError == true) {
      scheduleMicrotask(_decodeFailed);
    }
  }

  Future<void> _readMedia({bool save = false}) async {
    if (_busy) return;
    final read = ++_read, started = _currentContext;
    final api = ArtistsApi(widget.session), item = widget.item;
    bool current() =>
        mounted &&
        read == _read &&
        started == _currentContext &&
        widget.session.isLoggedIn &&
        !widget.session.artistsAccessDenied;
    setState(() {
      _release();
      _busy = true;
      _error = null;
    });
    PrivateVideo? loadingPlayer;
    try {
      api.check(started.$1, null);
      final bytes =
          await api.publicPreview(widget.listingId, item.id, metadata: item);
      if (!current()) return;
      if (save || item.kind == 'DOCUMENT') {
        await FilePicker.saveFile(
            fileName: 'preview-${item.id}.${item.extension}', bytes: bytes);
        api.check(started.$1, null);
      } else if (item.kind == 'IMAGE') {
        final image = await _verifiedImage(bytes, item.type);
        if (!current()) {
          unawaited(image.evict());
          return;
        }
        _image = image;
      } else {
        loadingPlayer = await PrivateVideo.create(bytes, mediaType: item.type);
        if (!current()) {
          await loadingPlayer.dispose();
          loadingPlayer = null;
          return;
        }
        _loadingPlayer = loadingPlayer;
        await loadingPlayer.controller.initialize();
        if (!current()) return;
        if (loadingPlayer.controller.value.hasError) throw StateError('decode');
        _player = loadingPlayer;
        _loadingPlayer = null;
        loadingPlayer = null;
        _player!.controller.addListener(_playbackChanged);
      }
    } on AccountError catch (error) {
      if (!current()) return;
      _release();
      _error = artistError(error);
      if (_unavailable(error)) widget.onUnavailable?.call();
    } catch (_) {
      if (current()) {
        _release();
        _error = '这份预览未能读取、解码或保存，请重试。';
      }
    } finally {
      if (loadingPlayer != null && identical(_loadingPlayer, loadingPlayer)) {
        _loadingPlayer = null;
        await loadingPlayer.dispose();
      }
      if (current()) setState(() => _busy = false);
    }
  }

  Widget _controls(PrivateVideo player) => ValueListenableBuilder<
          VideoPlayerValue>(
      valueListenable: player.controller,
      builder: (context, value, _) => Column(children: [
            if (widget.item.kind == 'VIDEO')
              AspectRatio(
                  aspectRatio:
                      value.aspectRatio > 0 ? value.aspectRatio : 16 / 9,
                  child: VideoPlayer(player.controller))
            else
              const Padding(
                  padding: EdgeInsets.all(16),
                  child: Icon(Icons.audiotrack_outlined, size: 32)),
            Row(children: [
              IconButton(
                  tooltip: value.isPlaying ? '暂停' : '播放',
                  onPressed: () async {
                    try {
                      if (value.isPlaying) {
                        await player.controller.pause();
                      } else {
                        await player.controller.play();
                      }
                    } catch (_) {
                      if (_player == player) _decodeFailed();
                    }
                  },
                  icon: Icon(value.isPlaying ? Icons.pause : Icons.play_arrow)),
              Expanded(
                  child: Slider(
                      label: '${value.position.inSeconds} 秒',
                      value: value.position.inMilliseconds
                          .toDouble()
                          .clamp(0, value.duration.inMilliseconds.toDouble()),
                      max: value.duration.inMilliseconds > 0
                          ? value.duration.inMilliseconds.toDouble()
                          : 1,
                      onChanged: value.duration.inMilliseconds <= 0
                          ? null
                          : (position) async {
                              try {
                                await player.controller.seekTo(
                                    Duration(milliseconds: position.round()));
                              } catch (_) {
                                if (_player == player) _decodeFailed();
                              }
                            })),
              Text(
                  '${value.position.inSeconds} / ${value.duration.inSeconds} 秒',
                  style: const TextStyle(fontSize: 12)),
            ]),
          ]));

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(
          '${item.label} ${widget.index} · ${item.type} · ${(item.size / 1024).ceil()} KB',
          style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
      if (_busy) const LinearProgressIndicator(),
      if (_error != null) Text(_error!),
      if (_image != null)
        Image(
            image: _image!,
            height: 220,
            fit: BoxFit.contain,
            semanticLabel: '获准公开图片 ${widget.index}',
            errorBuilder: (_, __, ___) {
              scheduleMicrotask(_decodeFailed);
              return const Text('图片暂不可用');
            }),
      if (_player != null) _controls(_player!),
      if (item.kind != 'DOCUMENT')
        tradeButton(
            '读取${item.label}预览 ${widget.index}', _busy ? null : _readMedia,
            outline: true),
      tradeButton('重新核权并保存${item.label} ${widget.index}',
          _busy ? null : () => _readMedia(save: true),
          outline: true),
      const SizedBox(height: 16),
    ]);
  }

  @override
  void dispose() {
    _read++;
    _release();
    widget.session.removeListener(_sessionChanged);
    super.dispose();
  }
}
