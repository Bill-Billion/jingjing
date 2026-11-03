import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'account_api.dart';
import 'account_session.dart';

class RestUsage {
  RestUsage(this.value) {
    bool integer(Object? n, [int max = 86400]) =>
        n is int && n >= 0 && n <= max;
    final m = value['rest_reminder_minutes'];
    if (!integer(value['object_version'], 9007199254740991) ||
        value['enabled'] is! bool ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch('${value['local_date']}') ||
        value['timezone'] != 'Asia/Shanghai' ||
        !integer(value['day_seconds']) ||
        !integer(value['reminder_seconds']) ||
        !(m == 0 || m is int && m >= 15 && m <= 240) ||
        value['rest_due'] is! bool ||
        !(value['seconds_until_reminder'] == null ||
            integer(value['seconds_until_reminder'])) ||
        value['heartbeat_seconds'] != 30 ||
        value['idle_after_seconds'] != 90 ||
        DateTime.tryParse('${value['as_of']}') == null ||
        value['measurement'] != 'FOREGROUND_HEARTBEAT_ESTIMATE' ||
        value['purpose'] != 'PERSONAL_REST_REMINDER') {
      throw const AccountError(503, 'INVALID_USAGE_RESPONSE', uncertain: true);
    }
    final n = value['night_reminder'];
    if (n != null &&
        (n is! Map ||
            n['enabled'] is! bool ||
            n['due'] is! bool ||
            n['timezone'] != 'Asia/Shanghai' ||
            !integer(n['start_minute'], 1439) ||
            !integer(n['end_minute'], 1439) ||
            n['start_minute'] == n['end_minute'])) {
      throw const AccountError(503, 'INVALID_NIGHT_REMINDER', uncertain: true);
    }
  }
  bool get nightEnabled => value['night_reminder']?['enabled'] == true;
  bool get nightDue => value['night_reminder']?['due'] == true;
  final Map<String, dynamic> value;
  bool get enabled => value['enabled'] == true;
  bool get due => value['rest_due'] == true;
  int get version => value['object_version'] as int;
  String duration(String field) {
    final n = value[field] as int;
    return '${n ~/ 3600}小时${n % 3600 ~/ 60}分钟';
  }
}

/// A single account-level foreground sampler; server time is authoritative.
class RestUsageController extends ChangeNotifier {
  RestUsageController(this.session) {
    session.addListener(_sessionChanged);
    _sessionChanged();
  }
  static const path = '/api/v1/privacy/usage';
  final AccountSession session;
  RestUsage? data;
  bool nightVisible = false;
  String? _nightDate;
  String? error;
  bool busy = false, visible = true, _disposed = false;
  int generation = 0;
  Object? _scope;
  Timer? _timer;
  Map<String, dynamic>? get pending =>
      session.pending('POST', '$path/acknowledge');
  void _cancel() {
    _timer?.cancel();
    _timer = null;
  }

  void _publish() {
    if (!_disposed) notifyListeners();
  }

  void _sessionChanged() {
    final next = (
      session.loginEpoch,
      session.isLoggedIn,
      session.usagePreferencesRevision,
      session.isDomainDenied('/api/v1/privacy/')
    );
    if (_scope == next) return;
    _scope = next;
    generation++;
    _cancel();
    data = null;
    nightVisible = false;
    _nightDate = null;
    error = null;
    busy = false;
    if (session.isLoggedIn &&
        !session.isDomainDenied('/api/v1/privacy/') &&
        visible) {
      unawaited(refresh());
    }
    _publish();
  }

  void setVisible(bool value) {
    if (visible == value) return;
    visible = value;
    generation++;
    _cancel();
    busy = false;
    if (value && session.isLoggedIn) unawaited(refresh());
    _publish();
  }

  bool _current(int g) =>
      !_disposed && g == generation && visible && session.isLoggedIn;
  void _schedule() {
    _cancel();
    if (!_disposed &&
        visible &&
        session.isLoggedIn &&
        (data?.nightEnabled == true ||
            data?.enabled == true && pending == null)) {
      _timer = Timer(
          const Duration(seconds: 30),
          () => unawaited(
              _read(pulse: data?.enabled == true && pending == null)));
    }
  }

  Future<void> refresh() => _read();
  Future<void> _read({bool pulse = false}) async {
    if (_disposed ||
        !visible ||
        !session.isLoggedIn ||
        busy ||
        pulse && (data?.enabled != true || pending != null)) {
      return;
    }
    _cancel();
    final g = generation;
    busy = true;
    _publish();
    try {
      final result = RestUsage(pulse
          ? await session.write('POST', '$path/pulse')
          : await session.read(path));
      if (!_current(g)) return;
      await _showNight(result, g);
      if (!_current(g)) return;
      data = result;
      error = null;
      if (!result.enabled && pending != null) {
        session.discardPending('POST', '$path/acknowledge');
      }
    } catch (_) {
      if (_current(g)) {
        data = null;
        nightVisible = false;
        error = '统计暂不可用，请稍后重试。';
      }
    } finally {
      if (_current(g)) {
        busy = false;
        _publish();
        _schedule();
      }
    }
  }

  Future<void> _showNight(RestUsage d, int g) async {
    if (!d.nightDue) {
      nightVisible = false;
      return;
    }
    final date = d.value['local_date'] as String;
    if (_nightDate == date) return;
    final id = session.account?['id'];
    try {
      final prefs = await SharedPreferences.getInstance();
      if (!_current(g)) return;
      _nightDate = date;
      if (prefs.getString('jx.night-seen.$id') == date) return;
      nightVisible = true;
      await prefs.setString('jx.night-seen.$id', date);
    } catch (_) {
      if (_current(g)) {
        _nightDate = date;
        nightVisible = true;
      }
    }
  }

  void dismissNight() {
    nightVisible = false;
    _publish();
  }

  Future<void> acknowledge({bool recover = false}) async {
    if (!visible || busy || !session.isLoggedIn) return;
    if (recover) {
      await refresh();
      if (pending == null || data?.enabled != true) return;
    }
    if (!recover && (data?.due != true || pending != null)) return;
    _cancel();
    final g = generation,
        original = pending,
        version = original?['version'] as int? ?? data!.version;
    busy = true;
    error = null;
    _publish();
    try {
      await session.write('POST', '$path/acknowledge', version: version,
          validate: (r) {
        if (r['acknowledged'] != true) {
          throw const AccountError(503, 'INVALID_USAGE_ACK', uncertain: true);
        }
      });
      if (!_current(g)) return;
    } on AccountError catch (e) {
      if (!_current(g)) return;
      error = e.uncertain
          ? '确认结果待核对；心跳已暂停，请恢复同一次确认。'
          : e.status == 412
              ? '提醒状态已变化，请核对当前提示后再次确认。'
              : e.code == 'REST_REMINDER_NOT_DUE'
                  ? '原提醒已不再到期。'
                  : '提醒确认失败，请核对当前状态。';
    } finally {
      if (_current(g)) {
        busy = false;
        final message = error;
        if (pending == null) await refresh();
        if (message != null) error = message;
        _publish();
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    generation++;
    _cancel();
    session.removeListener(_sessionChanged);
    super.dispose();
  }
}
