import 'dart:async';
import 'package:flutter/foundation.dart';
import 'account_api.dart';

/// New account state stays in memory. No tokens or private account lists are
/// written to the legacy preferences; app restart requires phone verification.
class AccountSession extends ChangeNotifier {
  AccountSession({AccountApi? api}) : api = api ?? AccountApi();
  final AccountApi api;
  String? _token;
  String? authNotice;
  final _pendingRevocations = <String>{};
  bool get hasPendingLogout => _pendingRevocations.isNotEmpty;
  int _partyRead = 0;
  final _unavailableParties = <String>{};
  String? partyNotice;
  Map<String, dynamic>? account;
  Map<String, dynamic>? selected;
  List<Map<String, dynamic>> parties = [];
  String? partiesCursor;
  final List<Map<String, dynamic>> sentInvitations = [];
  int _epoch = 0;
  int get epoch => _epoch;
  bool operationsAccessDenied = false;
  final operationsTargets = <String, Map<String, String>>{};
  List<Map<String, dynamic>> get operationsPending =>
      api.operationsPending(token: _token, party: partyId);
  void denyOperations() {
    _epoch++;
    operationsTargets.clear();
    api.clearSupplyOperations();
    operationsAccessDenied = true;
    notifyListeners();
  }

  Future<void> retryOperationsAccess() async {
    await loadParties();
    await refreshParty();
    operationsAccessDenied = false;
    notifyListeners();
  }

  bool financeAccessDenied = false;
  List<Map<String, dynamic>> get financePending =>
      api.financePending(token: _token, party: partyId);
  void denyFinance() {
    _epoch++;
    operationsTargets.clear();
    api.clearSupplyOperations();
    financeAccessDenied = true;
    notifyListeners();
  }

  Future<void> retryFinanceAccess() async {
    await loadParties();
    await refreshParty();
    financeAccessDenied = false;
    notifyListeners();
  }

  bool supplyAccessDenied = false;
  bool licensingAccessDenied = false;
  bool tradeAccessDenied = false;
  bool productionAccessDenied = false;
  bool projectsAccessDenied = false;
  List<Map<String, dynamic>> get projectsPending =>
      api.projectsPending(token: _token, party: partyId);
  void denyProjects() {
    _epoch++;
    operationsTargets.clear();
    api.clearSupplyOperations();
    projectsAccessDenied = true;
    notifyListeners();
  }

  Future<void> retryProjectsAccess() async {
    await loadParties();
    await refreshParty();
    projectsAccessDenied = false;
    notifyListeners();
  }

  List<Map<String, dynamic>> get productionPending =>
      api.productionPending(token: _token, party: partyId);
  void denyProduction() {
    _epoch++;
    operationsTargets.clear();
    api.clearSupplyOperations();
    productionAccessDenied = true;
    notifyListeners();
  }

  Future<void> retryProductionAccess() async {
    await loadParties();
    await refreshParty();
    productionAccessDenied = false;
    notifyListeners();
  }

  List<Map<String, dynamic>> get tradePending =>
      api.tradePending(token: _token, party: partyId);
  bool gigsAccessDenied = false;
  List<Map<String, dynamic>> get gigsPending =>
      api.gigsPending(token: _token, party: partyId);
  void denyGigs() {
    _epoch++;
    operationsTargets.clear();
    api.clearSupplyOperations();
    gigsAccessDenied = true;
    notifyListeners();
  }

  Future<void> retryGigsAccess() async {
    await loadParties();
    await refreshParty();
    gigsAccessDenied = false;
    notifyListeners();
  }

  void denyTrade() {
    _epoch++;
    operationsTargets.clear();
    api.clearSupplyOperations();
    tradeAccessDenied = true;
    notifyListeners();
  }

  Future<void> retryTradeAccess() async {
    await loadParties();
    await refreshParty();
    tradeAccessDenied = false;
    notifyListeners();
  }

  void denyLicensing() {
    _epoch++;
    operationsTargets.clear();
    api.clearSupplyOperations();
    licensingAccessDenied = true;
    notifyListeners();
  }

  Future<void> retryLicensingAccess() async {
    await loadParties();
    await refreshParty();
    licensingAccessDenied = false;
    notifyListeners();
  }

  void denySupply() {
    _epoch++;
    operationsTargets.clear();
    api.clearSupplyOperations();
    supplyAccessDenied = true;
    notifyListeners();
  }

  Future<void> retrySupplyAccess() async {
    await loadParties();
    await refreshParty();
    supplyAccessDenied = false;
    notifyListeners();
  }

  bool get isLoggedIn => _token != null;
  String? get partyId => selected?['party']?['id'] as String?;
  Map<String, dynamic>? get party =>
      selected?['party'] as Map<String, dynamic>?;
  bool allows(String action) =>
      (party?['allowed_actions'] as List? ?? []).contains(action);
  bool get isOwner =>
      (selected?['membership']?['roles'] as List? ?? []).contains('OWNER');

  Future<Map<String, dynamic>> sendCode(String phone) =>
      api.request('POST', '/api/v1/auth/sms-challenges',
          body: {'phone': phone, 'purpose': 'LOGIN'});

  Future<void> login(String phone, String challengeId, String code) async {
    final started = _epoch;
    final result = await api.request('POST', '/api/v1/auth/sessions',
        body: {'phone': phone, 'challenge_id': challengeId, 'code': code});
    _check(started);
    _clear();
    authNotice = null;
    _token = result['access_token'] as String;
    account = Map<String, dynamic>.from(result['account'] as Map);
    notifyListeners();
  }

  Future<void> logout() async {
    final token = _token;
    if (token == null) return;
    _pendingRevocations.add(token);
    _clear(); // Hide all private data immediately, even while offline.
    authNotice = '已退出本机，正在通知服务器结束会话。';
    notifyListeners();
    await retryLogout();
  }

  Future<void> retryLogout() async {
    try {
      for (final token in _pendingRevocations.toList()) {
        try {
          await api.request('DELETE', '/api/v1/auth/sessions/current',
              token: token, body: {});
        } on AccountError catch (e) {
          if (e.status != 401) {
            rethrow; // Expired sessions are already unusable.
          }
        }
        _pendingRevocations.remove(token);
      }
      authNotice = '已退出登录。';
    } on AccountError {
      authNotice = '已退出本机；服务器退出结果未确认，请联网后重试通知服务器。';
    }
    notifyListeners();
  }

  void _clear() {
    api.clearSupplyOperations();
    supplyAccessDenied = false;
    licensingAccessDenied = false;
    tradeAccessDenied = false;
    gigsAccessDenied = false;
    productionAccessDenied = false;
    projectsAccessDenied = false;
    financeAccessDenied = false;
    operationsAccessDenied = false;
    _epoch++;
    operationsTargets.clear();
    _unavailableParties.clear();
    partyNotice = null;
    _token = null;
    account = null;
    selected = null;
    parties = [];
    partiesCursor = null;
    sentInvitations.clear();
  }

  void _check(int started) {
    if (started != _epoch) throw const AccountError(0, 'CONTEXT_CHANGED');
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, dynamic>? query,
    String? actingParty,
    int? version,
    Uint8List? bytes,
    FutureOr<void> Function(Map<String, dynamic>)? validate,
  }) async {
    final started = _epoch;
    if (_token == null) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    try {
      final result = await api.request(method, path,
          token: _token,
          party: actingParty,
          body: body,
          query: query,
          version: version,
          bytes: bytes,
          validate: validate);
      _check(started);
      return result;
    } on AccountError catch (error) {
      if ([403, 404].contains(error.status) &&
          path.startsWith('/api/v1/operations/') &&
          started == _epoch) {
        denyOperations();
      }

      if ([403, 404].contains(error.status) &&
          path.startsWith('/api/v1/finance/') &&
          started == _epoch) {
        denyFinance();
      }

      if ([403, 404].contains(error.status) &&
          path.startsWith('/api/v1/projects/') &&
          started == _epoch) {
        denyProjects();
      }
      if ([403, 404].contains(error.status) &&
          path.startsWith('/api/v1/production/') &&
          started == _epoch) {
        denyProduction();
      }
      if ([403, 404].contains(error.status) &&
          path.startsWith('/api/v1/trade/') &&
          started == _epoch) {
        denyTrade();
      }
      if ([403, 404].contains(error.status) &&
          path.startsWith('/api/v1/gigs/') &&
          started == _epoch) {
        denyGigs();
      }
      if (error.status == 403 &&
          path.startsWith('/api/v1/supply/') &&
          started == _epoch) {
        denySupply();
      }
      if (error.status == 403 &&
          path.startsWith('/api/v1/licensing/') &&
          started == _epoch) {
        denyLicensing();
      }
      if (error.status == 401 && started == _epoch) {
        _clear();
        authNotice = '登录已失效，请重新验证手机号。';
        notifyListeners();
      }
      rethrow;
    }
  }

  Map<String, dynamic>? pending(String method, String path,
          {String? actingParty}) =>
      api.pending(method, path, token: _token, party: actingParty);

  Future<Map<String, dynamic>> read(String path,
          {String? actingParty, Map<String, dynamic>? query}) =>
      _request('GET', path, actingParty: actingParty, query: query);
  Future<Map<String, dynamic>> write(
    String method,
    String path, {
    String? actingParty,
    Map<String, dynamic>? body,
    int? version,
    FutureOr<void> Function(Map<String, dynamic>)? validate,
  }) =>
      _request(method, path,
          actingParty: actingParty,
          body: body ?? {},
          version: version,
          validate: validate);

  Future<Map<String, dynamic>> upload(String path, Uint8List bytes,
          {required String actingParty,
          required Map<String, dynamic> query,
          required void Function(Map<String, dynamic>) validate}) =>
      _request('POST', path,
          bytes: bytes,
          query: query,
          actingParty: actingParty,
          validate: validate);
  Future<Uint8List> readBytes(String path,
      {String? actingParty, Map<String, dynamic>? query}) async {
    final started = _epoch;
    if (_token == null) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    try {
      final bytes = await api.readBytes(path,
          token: _token!, party: actingParty, query: query);
      _check(started);
      return bytes;
    } on AccountError catch (e) {
      if (started == _epoch) {
        if (path.startsWith('/api/v1/finance/') &&
            [403, 404].contains(e.status)) {
          denyFinance();
        } else if (path.startsWith('/api/v1/gigs/') &&
            [403, 404].contains(e.status)) {
          denyGigs();
        } else if (path.startsWith('/api/v1/projects/') &&
            [403, 404].contains(e.status)) {
          denyProjects();
        } else if (path.startsWith('/api/v1/production/') &&
            [403, 404].contains(e.status)) {
          denyProduction();
        } else if (e.status == 403) {
          denySupply();
        }
      }
      if (e.status == 401 && started == _epoch) {
        _clear();
        authNotice = '登录已失效，请重新验证手机号。';
        notifyListeners();
      }
      rethrow;
    }
  }

  Future<void> loadParties(
      {bool more = false, bool retryUnavailable = false}) async {
    if (retryUnavailable) {
      _unavailableParties.clear();
      partyNotice = null;
    }
    if (more && partiesCursor == null) return;
    final ticket = ++_partyRead;
    final result = await read('/api/v1/me/parties', query: {
      'limit': 20,
      if (more && partiesCursor != null) 'cursor': partiesCursor,
    });
    if (ticket != _partyRead) return;
    // A stale list may keep returning an inaccessible identity. Only an
    // explicit user refresh retries it; automatic refresh must not loop.
    final rows = maps(result['items'])
        .where((row) => !_unavailableParties.contains(row['party']['id']))
        .toList();
    parties = {
      for (final row in [
        ...(more ? parties : <Map<String, dynamic>>[]),
        ...rows
      ])
        row['party']['id']: row
    }.values.toList();
    partiesCursor = result['next_cursor'] as String?;
    // Keep a selected identity even if it is on another page. Its permissions
    // are re-read separately; an actual 403/404 clears the selection below.
    final match = parties.where((row) => row['party']['id'] == partyId);
    if (match.isNotEmpty) {
      final wasOwner = isOwner;
      final previousStatus = party?['current_status'];
      selected = match.first;
      if ((wasOwner && !isOwner) ||
          (previousStatus != party?['current_status'] &&
              ['SUSPENDED', 'CLOSED'].contains(party?['current_status']))) {
        api.clearSupplyOperations();
        _epoch++;
        operationsTargets.clear();
      }
    }
    if (selected == null && parties.isNotEmpty) selected = parties.first;
    notifyListeners();
  }

  void select(Map<String, dynamic> value) {
    if (value['party']['id'] == partyId) return;
    partyNotice = null;
    api.clearSupplyOperations();
    supplyAccessDenied = false;
    licensingAccessDenied = false;
    tradeAccessDenied = false;
    gigsAccessDenied = false;
    productionAccessDenied = false;
    projectsAccessDenied = false;
    financeAccessDenied = false;
    operationsAccessDenied = false;
    _epoch++;
    operationsTargets.clear();
    selected = value;
    notifyListeners();
  }

  Future<void> refreshParty() async {
    final id = partyId;
    if (id == null) return;
    try {
      final previousStatus = party?['current_status'];
      final result = await read('/api/v1/parties/$id', actingParty: id);
      selected = {...selected!, 'party': result};
      if (['SUSPENDED', 'CLOSED'].contains(result['current_status']) &&
          result['current_status'] != previousStatus) {
        api.clearSupplyOperations();
        _epoch++;
        operationsTargets.clear();
      }
      parties =
          parties.map((p) => p['party']['id'] == id ? selected! : p).toList();
      notifyListeners();
    } on AccountError catch (error) {
      if ([403, 404].contains(error.status) && partyId == id) {
        _unavailableParties.add(id);
        partyNotice = '部分身份暂时无法访问，已停止自动重试。可以刷新当前记录，或选择其他身份。';
        api.clearSupplyOperations();
        _epoch++;
        operationsTargets.clear();
        selected = null;
        parties = parties.where((p) => p['party']['id'] != id).toList();
        notifyListeners();
      }
      rethrow;
    }
  }

  void rememberInvitation(Map<String, dynamic> receipt) {
    sentInvitations
        .removeWhere((r) => r['invitation_id'] == receipt['invitation_id']);
    sentInvitations.insert(0, receipt);
    notifyListeners();
  }

  static List<Map<String, dynamic>> maps(dynamic input) =>
      (input as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
}
