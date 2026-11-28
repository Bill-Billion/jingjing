import 'dart:async';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Pending JSON trade commands only. Authentication and response data are never
/// stored. A fresh authenticated session must read current authority to replay.
class TradeRecoveryStore {
  TradeRecoveryStore(String origin)
      : storageKey =
            'jx.trade.pending.v1.${sha256.convert(utf8.encode(origin))}';
  final String storageKey;
  Future<void> _tail = Future.value();

  Future<T> _serial<T>(Future<T> Function() action) {
    final result = _tail.then((_) => action());
    _tail = result.then<void>((_) {}, onError: (Object _) {});
    return result;
  }

  Future<List<Map<String, dynamic>>> _read(SharedPreferences prefs) async {
    await prefs.reload();
    final raw = prefs.getString(storageKey);
    if (raw == null) return [];
    if (raw.length > 1024 * 1024) throw StateError('TRADE_RECOVERY_INVALID');
    final value = jsonDecode(raw);
    if (value is! List || value.length > 32) {
      throw StateError('TRADE_RECOVERY_INVALID');
    }
    final rows = <Map<String, dynamic>>[];
    for (final item in value) {
      if (item is! Map) throw StateError('TRADE_RECOVERY_INVALID');
      final r = Map<String, dynamic>.from(item);
      if (r.keys.toSet().difference({
            'account',
            'party',
            'method',
            'path',
            'key',
            'body',
            'query',
            'version',
            'resultId',
          }).isNotEmpty ||
          r['account'] is! String ||
          r['party'] is! String ||
          r['method'] != 'POST' ||
          r['path'] is! String ||
          !RegExp(r'^/api/v1/trade/[a-zA-Z0-9/-]+$').hasMatch(r['path']) ||
          r['key'] is! String ||
          !RegExp(r'^app-[a-f0-9]{48}$').hasMatch(r['key']) ||
          !(r['body'] == null || r['body'] is Map) ||
          !(r['query'] == null || r['query'] is Map) ||
          !(r['version'] == null || r['version'] is int && r['version'] > 0) ||
          !(r['resultId'] == null || r['resultId'] is String)) {
        throw StateError('TRADE_RECOVERY_INVALID');
      }
      rows.add(r);
    }
    return rows;
  }

  Future<void> _write(
      SharedPreferences prefs, List<Map<String, dynamic>> rows) async {
    final raw = jsonEncode(rows);
    if (rows.length > 32 || raw.length > 1024 * 1024) {
      throw StateError('TRADE_RECOVERY_FULL');
    }
    if (!(rows.isEmpty
        ? await prefs.remove(storageKey)
        : await prefs.setString(storageKey, raw))) {
      throw StateError('TRADE_RECOVERY_STORAGE_UNAVAILABLE');
    }
  }

  Future<List<Map<String, dynamic>>> read(String account, String party) =>
      _serial(() async {
        final rows = await _read(await SharedPreferences.getInstance());
        return rows
            .where((r) => r['account'] == account && r['party'] == party)
            .toList();
      });

  Future<void> save(Map<String, dynamic> row) => _serial(() async {
        final prefs = await SharedPreferences.getInstance(),
            rows = await _read(prefs);
        bool same(Map<String, dynamic> r) =>
            ['account', 'party', 'method', 'path'].every((k) => r[k] == row[k]);
        if (rows.any((r) => same(r) && r['key'] != row['key'])) {
          throw StateError('TRADE_RECOVERY_CONFLICT');
        }
        await _write(prefs, [...rows.where((r) => !same(r)), row]);
      });

  Future<void> remove(String account, String key) => _serial(() async {
        final prefs = await SharedPreferences.getInstance(),
            rows = await _read(prefs);
        await _write(
            prefs,
            rows
                .where((r) => r['account'] != account || r['key'] != key)
                .toList());
      });

  Future<void> retainAccount(String account) => _serial(() async {
        final prefs = await SharedPreferences.getInstance(),
            rows = await _read(prefs);
        await _write(
            prefs, rows.where((r) => r['account'] == account).toList());
      });

  Future<void> clear() => _serial(() async {
        final prefs = await SharedPreferences.getInstance();
        if (!await prefs.remove(storageKey)) {
          throw StateError('TRADE_RECOVERY_STORAGE_UNAVAILABLE');
        }
      });
}
