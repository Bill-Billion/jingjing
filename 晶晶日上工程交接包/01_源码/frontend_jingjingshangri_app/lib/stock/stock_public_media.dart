import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../widgets/editorial_icons.dart';
import 'stock_api.dart';
import 'stock_models.dart';
import 'v5_support.dart';

/// Visible cards and details read the same approved preview cover in memory.
class StockPublicMediaView extends StatefulWidget {
  const StockPublicMediaView(
      {super.key,
      required this.session,
      required this.offer,
      this.compact = false,
      this.onRefreshOffer});
  final AccountSession session;
  final StockOffer offer;
  final bool compact;
  final VoidCallback? onRefreshOffer;
  @override
  State<StockPublicMediaView> createState() => _StockPublicMediaViewState();
}

class _StockPublicMediaViewState extends State<StockPublicMediaView> {
  ImageProvider? _image;
  StockPublicMedia? _media;
  ScrollPosition? _scroll;
  int _read = 0;
  bool _busy = false, _attempted = false, _scheduled = false, _active = true;
  String? _error;
  late (int, String?, bool) _context;
  (String, int, String) _offerKey(StockOffer offer) =>
      (offer.id, offer.version, offer.hash);
  (int, String?, bool) get _currentContext => (
        widget.session.epoch,
        widget.session.partyId,
        widget.session.stockAccessDenied
      );

  @override
  void initState() {
    super.initState();
    _context = _currentContext;
    widget.session.addListener(_sessionChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _active = TickerMode.valuesOf(context).enabled &&
        ModalRoute.of(context)?.isCurrent != false;
    if (!_active) _reset();
    final position = Scrollable.maybeOf(context)?.position;
    if (position != _scroll) {
      _scroll?.removeListener(_scheduleVisibility);
      _scroll = position;
      _scroll?.addListener(_scheduleVisibility);
    }
    _scheduleVisibility();
  }

  void _release() {
    final image = _image;
    _image = null;
    _media = null;
    if (image != null) unawaited(image.evict());
  }

  void _reset() {
    _read++;
    _release();
    _busy = _attempted = false;
    _error = null;
  }

  void _sessionChanged() {
    if (_context == _currentContext) return;
    _context = _currentContext;
    _reset();
    if (mounted) setState(() {});
  }

  @override
  void didUpdateWidget(StockPublicMediaView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.session != widget.session) {
      oldWidget.session.removeListener(_sessionChanged);
      widget.session.addListener(_sessionChanged);
    }
    if (oldWidget.session != widget.session ||
        _offerKey(oldWidget.offer) != _offerKey(widget.offer)) {
      _context = _currentContext;
      _reset();
    }
  }

  bool _visible() {
    if (!mounted || !_active) return false;
    final box = context.findRenderObject();
    if (box is! RenderBox ||
        !box.attached ||
        !box.hasSize ||
        box.size.isEmpty) {
      return false;
    }
    final bounds = box.localToGlobal(Offset.zero) & box.size;
    var viewport = Offset.zero & MediaQuery.sizeOf(context);
    final Object? scrollViewport = RenderAbstractViewport.maybeOf(box);
    if (scrollViewport is RenderBox && scrollViewport.hasSize) {
      viewport = viewport.intersect(
          scrollViewport.localToGlobal(Offset.zero) & scrollViewport.size);
    }
    return bounds.overlaps(viewport);
  }

  void _scheduleVisibility() {
    if (_scheduled) return;
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (!_attempted &&
          _visible() &&
          widget.session.isLoggedIn &&
          !widget.session.stockAccessDenied) {
        unawaited(_load());
      }
    });
  }

  Future<void> _load() async {
    final read = ++_read, started = _currentContext, session = widget.session;
    final offer = widget.offer, offerKey = _offerKey(widget.offer);
    _release();
    setState(() {
      _busy = _attempted = true;
      _error = null;
    });
    bool current() =>
        mounted &&
        _active &&
        read == _read &&
        started == _currentContext &&
        session.isLoggedIn &&
        !session.stockAccessDenied &&
        _offerKey(widget.offer) == offerKey;
    try {
      final (metadata, bytes) = await StockApi(session)
          .publicPresentation(offer, () => current() && _visible());
      if (!current()) return;
      v5Require(bytes.length >= 3 &&
          bytes[0] == 255 &&
          bytes[1] == 216 &&
          bytes[2] == 255);
      final codec = await ui.instantiateImageCodec(bytes);
      try {
        final frame = await codec.getNextFrame();
        final valid = frame.image.width == metadata.cover.width &&
            frame.image.height == metadata.cover.height;
        frame.image.dispose();
        v5Require(valid);
      } finally {
        codec.dispose();
      }
      if (!current()) return;
      _media = metadata;
      _image = MemoryImage(bytes);
    } on AccountError catch (error) {
      if (!current()) return;
      _release();
      if (error.code == 'CONTEXT_CHANGED') {
        _attempted = false;
      } else {
        _error = error.code == 'STOCK_MEDIA_SOURCE_CHANGED'
            ? '作品版本已更新，请重新读取作品。'
            : '封面或时长暂不可读取';
      }
    } catch (_) {
      if (current()) {
        _release();
        _error = '封面或时长暂不可读取';
      }
    } finally {
      if (current()) setState(() => _busy = false);
    }
  }

  Widget _placeholder() => const Center(
      child: Icon(EditorialIcons.film, size: 24, color: AccountTheme.muted));

  @override
  Widget build(BuildContext context) {
    _scheduleVisibility();
    final media = _media, image = _image;
    final poster = AspectRatio(
        aspectRatio: 16 / 9,
        child: ColoredBox(
            color: const Color(0xFFE5E1D7),
            child: image == null
                ? _placeholder()
                : Image(
                    image: image,
                    fit: BoxFit.contain,
                    semanticLabel: '${widget.offer.title}的已审核预览封面',
                    errorBuilder: (_, __, ___) {
                      scheduleMicrotask(() {
                        if (mounted && identical(_image, image)) {
                          setState(() {
                            _release();
                            _error = '封面或时长暂不可读取';
                          });
                        }
                      });
                      return _placeholder();
                    })));
    return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          widget.compact
              ? CustomPaint(
                  painter: const _FilmFrame(),
                  child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: poster))
              : poster,
          if (media == null)
            Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                    widget.session.stockAccessDenied
                        ? '封面或时长暂不可读取'
                        : _busy
                            ? '正在读取封面与时长'
                            : _error ?? '封面与时长待读取',
                    style: TextStyle(
                        fontSize: widget.compact ? 10 : 12,
                        height: 1.5,
                        color: AccountTheme.muted))),
          if (media != null)
            Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                    '完整影片 ${stockDuration(media.durationMs)} · 预览 ${stockDuration(media.previewDurationMs)}',
                    style: TextStyle(
                        fontSize: widget.compact ? 10 : 12,
                        height: 1.5,
                        color: AccountTheme.muted))),
          if (_error != null)
            Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                    onPressed: _busy
                        ? null
                        : () {
                            if (_error!.startsWith('作品版本已更新') &&
                                widget.onRefreshOffer != null) {
                              widget.onRefreshOffer!();
                            } else {
                              unawaited(_load());
                            }
                          },
                    child: const Text('重新读取', style: TextStyle(fontSize: 12)))),
        ]);
  }

  @override
  void dispose() {
    _read++;
    _release();
    _scroll?.removeListener(_scheduleVisibility);
    widget.session.removeListener(_sessionChanged);
    super.dispose();
  }
}

class _FilmFrame extends CustomPainter {
  const _FilmFrame();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = AccountTheme.text);
    final hole = Paint()..color = AccountTheme.canvas;
    for (var x = 4.0; x < size.width - 4; x += 12) {
      final width = math.min(7.0, size.width - 4 - x);
      canvas.drawRect(Rect.fromLTWH(x, 2, width, 4), hole);
      canvas.drawRect(Rect.fromLTWH(x, size.height - 6, width, 4), hole);
    }
  }

  @override
  bool shouldRepaint(_FilmFrame oldDelegate) => false;
}
