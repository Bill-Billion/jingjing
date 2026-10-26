import 'package:flutter/foundation.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../artists/artists_api.dart';
import '../artists/artists_models.dart';
import '../notices/notices_api.dart';
import '../notices/notices_models.dart';
import '../stock/stock_api.dart';
import '../stock/stock_models.dart';
import '../stock/v5_support.dart';

class PlazaFeed<T> {
  final items = <T>[];
  final _cursors = <String>{};
  String? cursor, error;
  AccountError? failure;
  bool busy = false, hasRead = false;
  int revision = 0;

  void clear() {
    revision++;
    items.clear();
    _cursors.clear();
    cursor = error = null;
    failure = null;
    busy = hasRead = false;
  }
}

/// Three independent public reads keep one unavailable domain from blanking
/// the other columns. The account-only APIs retain their ordinary gates.
class PlazaData extends ChangeNotifier {
  PlazaData(this.session, {String city = ''}) : city = city.trim() {
    _context = _capture();
    session.addListener(_sessionChanged);
  }

  final AccountSession session;
  final artists = PlazaFeed<Map<String, dynamic>>();
  final works = PlazaFeed<StockOffer>();
  final notices = PlazaFeed<NoticePublic>();
  late (int, String?, String?) _context;
  String city, tag = '';
  String? noticeType;
  bool audition = false, _disposed = false;

  (int, String?, String?) _capture() =>
      (session.epoch, session.account?['id'] as String?, session.partyId);

  void _sessionChanged() {
    final next = _capture();
    if (next == _context) return;
    _context = next;
    artists.clear();
    works.clear();
    notices.clear();
    notifyListeners();
  }

  Future<void> load() =>
      Future.wait([loadArtists(), loadWorks(), loadNotices()]);

  Future<void> changeCity(String value) async {
    final next = value.trim();
    if (next == city) return;
    city = next;
    await Future.wait([loadArtists(), loadNotices()]);
  }

  Future<void> filterArtists({required String tag, required bool audition}) {
    this.tag = tag.trim();
    this.audition = audition;
    return loadArtists();
  }

  Future<void> filterNotices(String? type) {
    noticeType = type;
    return loadNotices();
  }

  Future<void> loadArtists({bool more = false}) =>
      _read(artists, (cursor) async {
        final result = await ArtistsApi(session)
            .catalog(cursor: cursor, city: city, tag: tag, audition: audition);
        return (result.items, result.cursor);
      }, (row) => row['listing_id'] as String, artistError, more: more);

  // Works are offered nationwide; selecting a city filters people/opportunities
  // rather than silently restricting a buyer's personal licence catalogue.
  Future<void> loadWorks({bool more = false}) => _read(works, (cursor) async {
        final result = await StockApi(session).catalog(cursor: cursor);
        return (result.items, result.cursor);
      }, (row) => row.id, v5Error, more: more);

  Future<void> loadNotices({bool more = false}) =>
      _read(notices, (cursor) async {
        final result = await NoticesApi(session)
            .catalog(cursor: cursor, city: city, type: noticeType);
        return (result.items, result.cursor);
      }, (row) => row.id, v5Error, more: more);

  Future<void> _read<T>(
      PlazaFeed<T> feed,
      Future<(List<T>, String?)> Function(String?) fetch,
      String Function(T) id,
      String Function(AccountError) message,
      {required bool more}) async {
    if (_disposed || more && (feed.busy || feed.cursor == null)) return;
    if (!more) feed.clear();
    if (!session.isLoggedIn) {
      notifyListeners();
      return;
    }
    final revision = ++feed.revision, started = _capture();
    final cursor = more ? feed.cursor : null;
    feed.busy = true;
    feed.error = null;
    feed.failure = null;
    notifyListeners();
    bool current() =>
        !_disposed &&
        feed.revision == revision &&
        started == _capture() &&
        session.isLoggedIn;
    try {
      final (rows, next) = await fetch(cursor);
      if (!current()) return;
      if (next != null && !feed._cursors.add(next)) {
        throw const AccountError(502, 'INVALID_PLAZA_PAGE');
      }
      final seen = feed.items.map(id).toSet();
      feed.items.addAll(rows.where((row) => seen.add(id(row))));
      feed.cursor = next;
      feed.hasRead = true;
    } on AccountError catch (error) {
      if (!current()) return;
      feed.failure = error;
      feed.error = message(error);
      if ([401, 403, 404, 409].contains(error.status)) {
        feed.items.clear();
        feed.cursor = null;
      }
    } catch (_) {
      if (current()) feed.error = '暂时无法读取，请重新尝试。';
    } finally {
      if (current()) {
        feed.busy = false;
        notifyListeners();
      }
    }
  }

  void removeUnavailableArtist(String listingId) {
    artists.items.removeWhere((row) => row['listing_id'] == listingId);
    artists.error = '部分公开资料当前不可用，请重新读取。';
    if (!_disposed) notifyListeners();
  }

  Set<String> get availableCities => {
        for (final row in artists.items) row['city'] as String,
        for (final row in works.items) row.data['city'] as String,
        for (final row in notices.items) row.notice['city'] as String,
      }..removeWhere((city) => city.trim().isEmpty);

  @override
  void dispose() {
    _disposed = true;
    session.removeListener(_sessionChanged);
    super.dispose();
  }
}
