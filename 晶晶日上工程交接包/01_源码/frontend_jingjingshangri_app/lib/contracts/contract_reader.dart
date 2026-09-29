import 'dart:async';
import 'package:flutter/foundation.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import 'contract_api.dart';

/// A view's private data lives only here. Every context/input change invalidates
/// all earlier work, including A → B → A and same-identity concurrent reads.
class ContractReader extends ChangeNotifier {
  ContractReader(this.session) : api = ContractApi(session) {
    _epoch = session.epoch;
    _party = session.partyId;
    session.addListener(_sessionChanged);
  }
  final AccountSession session;
  final ContractApi api;
  late int _epoch;
  String? _party;
  int _generation = 0, _ruleRead = 0, _serviceRead = 0;
  bool _disposed = false;
  Map<String, dynamic>? snapshot, rule, readiness;
  String? error, ruleError, readinessError;
  bool loading = false, ruleLoading = false, readinessLoading = false;
  String action = contractActions.keys.first;
  DateTime? retryAt;
  Timer? _retryTimer;
  int get retrySeconds {
    final milliseconds =
        retryAt?.difference(DateTime.now()).inMilliseconds ?? 0;
    return milliseconds <= 0 ? 0 : (milliseconds / 1000).ceil();
  }

  void _stopRetry() {
    _retryTimer?.cancel();
    _retryTimer = null;
    retryAt = null;
  }

  void _failed(Object e) {
    // Fresh authorization, integrity and dependency checks must all succeed.
    // Never leave a previous successful response visible after a failed read.
    clear();
    error = contractError(e);
    if (e is AccountError && e.retryAt != null) {
      _stopRetry();
      retryAt = e.retryAt;
      _retryTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (retrySeconds == 0) _stopRetry();
        if (!_disposed) notifyListeners();
      });
    }
    notifyListeners();
  }

  void _sessionChanged() {
    if (_epoch != session.epoch || _party != session.partyId) {
      _epoch = session.epoch;
      _party = session.partyId;
      _stopRetry();
      clear();
    }
  }

  void clear() {
    _generation++;
    _ruleRead++;
    _serviceRead++;
    snapshot = rule = readiness = null;
    error = ruleError = readinessError = null;
    loading = ruleLoading = readinessLoading = false;
    if (!_disposed) notifyListeners();
  }

  bool _current(int ticket) => !_disposed && ticket == _generation;
  Future<void> open(String id) async {
    if (retrySeconds > 0) return;
    clear();
    final ticket = _generation;
    loading = true;
    notifyListeners();
    try {
      final result = await api.snapshot(id.trim());
      if (_current(ticket)) snapshot = result;
    } catch (e) {
      if (_current(ticket)) _failed(e);
    } finally {
      if (_current(ticket)) {
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> readRule(Map<String, dynamic> captured) async {
    if (retrySeconds > 0) return;
    final current = snapshot;
    if (current == null ||
        !(current['rule_contents'] as List).contains(captured)) {
      return;
    }
    final generation = _generation, ticket = ++_ruleRead;
    rule = null;
    ruleError = null;
    ruleLoading = true;
    notifyListeners();
    try {
      final result = await api.rule(current['id'] as String, captured);
      if (_current(generation) && ticket == _ruleRead) rule = result;
    } catch (e) {
      if (_current(generation) && ticket == _ruleRead) {
        _failed(e);
      }
    } finally {
      if (_current(generation) && ticket == _ruleRead) {
        ruleLoading = false;
        notifyListeners();
      }
    }
  }

  void changeAction(String value) {
    _serviceRead++;
    action = value;
    readiness = null;
    readinessError = null;
    readinessLoading = false;
    notifyListeners();
  }

  Future<void> checkService() async {
    if (retrySeconds > 0) return;
    final current = snapshot;
    if (current == null) return;
    final generation = _generation, ticket = ++_serviceRead;
    readiness = null;
    readinessError = null;
    readinessLoading = true;
    notifyListeners();
    try {
      final result = await api.readiness(current['id'] as String, action);
      if (_current(generation) && ticket == _serviceRead) readiness = result;
    } catch (e) {
      if (_current(generation) && ticket == _serviceRead) {
        _failed(e);
      }
    } finally {
      if (_current(generation) && ticket == _serviceRead) {
        readinessLoading = false;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _stopRetry();
    clear();
    session.removeListener(_sessionChanged);
    super.dispose();
  }
}
