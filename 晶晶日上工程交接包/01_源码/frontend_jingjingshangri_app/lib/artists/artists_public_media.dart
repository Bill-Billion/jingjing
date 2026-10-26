import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../widgets/editorial_icons.dart';
import 'artists_api.dart';
import 'artists_models.dart';

/// Catalogues supply preview IDs, not a public photo URL. Only fresh reads of
/// those approved assets can become a portrait; audio is never a fake photo.
class ArtistPublicPortrait extends StatefulWidget {
  const ArtistPublicPortrait(
      {super.key,
      required this.session,
      required this.listing,
      this.aspectRatio = 1,
      this.onUnavailable});
  final AccountSession session;
  final Map<String, dynamic> listing;
  final double aspectRatio;
  final VoidCallback? onUnavailable;

  @override
  State<ArtistPublicPortrait> createState() => _ArtistPublicPortraitState();
}

class _ArtistPublicPortraitState extends State<ArtistPublicPortrait> {
  ImageProvider? _image;
  int _read = 0;
  bool _busy = false, _failed = false;
  late (int, String?) _context;

  @override
  void initState() {
    super.initState();
    _context = (widget.session.epoch, widget.session.partyId);
    widget.session.addListener(_sessionChanged);
    unawaited(_load());
  }

  void _evict() {
    final old = _image;
    _image = null;
    if (old != null) unawaited(old.evict());
  }

  void _sessionChanged() {
    final next = (widget.session.epoch, widget.session.partyId);
    if (_context == next) return;
    _context = next;
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
        oldWidget.listing != widget.listing) {
      _context = (widget.session.epoch, widget.session.partyId);
      unawaited(_load());
    }
  }

  Future<void> _load() async {
    final read = ++_read;
    final session = widget.session;
    final started = (session.epoch, session.partyId);
    _evict();
    _failed = false;
    _busy = false;
    if (!session.isLoggedIn || session.artistsAccessDenied) return;
    _busy = true;
    bool current() =>
        mounted &&
        read == _read &&
        started == (session.epoch, session.partyId) &&
        session.isLoggedIn;
    try {
      final listing = widget.listing;
      final ids =
          artistStrings(listing['preview_asset_ids'], ids: true, max: 6);
      for (final id in ids) {
        final bytes =
            await ArtistsApi(session).publicPreview(listing['listing_id'], id);
        if (!current()) return;
        if (_isImage(bytes)) {
          _image = ResizeImage.resizeIfNeeded(256, null, MemoryImage(bytes));
          break;
        }
      }
    } on AccountError catch (error) {
      if (!current()) return;
      _failed = true;
      _evict();
      if ([401, 403, 404, 409].contains(error.status)) {
        widget.onUnavailable?.call();
      }
    } catch (_) {
      if (current()) _failed = true;
    } finally {
      if (current()) setState(() => _busy = false);
    }
  }

  static bool _isImage(Uint8List bytes) {
    bool starts(List<int> prefix) =>
        bytes.length >= prefix.length &&
        List.generate(prefix.length, (i) => bytes[i] == prefix[i])
            .every((same) => same);
    return starts([137, 80, 78, 71, 13, 10, 26, 10]) ||
        starts([255, 216, 255]) ||
        starts([71, 73, 70, 56]) ||
        starts([66, 77]) ||
        bytes.length >= 12 &&
            starts([82, 73, 70, 70]) &&
            String.fromCharCodes(bytes.sublist(8, 12)) == 'WEBP';
  }

  Widget _placeholder({bool failed = false}) => Center(
      child: Padding(
          padding: const EdgeInsets.all(4),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(EditorialIcons.user,
                color: AccountTheme.muted, size: 24),
            const SizedBox(height: 4),
            Text(failed || _failed ? '图片暂不可用' : '暂无公开照片',
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
                  semanticLabel: '${widget.listing['display_name']}的获准公开照片',
                  errorBuilder: (_, __, ___) => _placeholder(failed: true))
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
