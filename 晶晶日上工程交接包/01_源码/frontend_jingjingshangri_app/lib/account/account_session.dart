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
  Map<String, dynamic>? account;
  Map<String, dynamic>? selected;
  List<Map<String, dynamic>> parties = [];
  String? partiesCursor;
  final List<Map<String, dynamic>> sentInvitations = [];
  int _epoch = 0;
  int get epoch => _epoch;
  bool supplyAccessDenied = false;
  bool licensingAccessDenied = false;
  void denyLicensing() {
    _epoch++;
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
    _epoch++;
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
    void Function(Map<String, dynamic>)? validate,
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
    void Function(Map<String, dynamic>)? validate,
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
      {required String actingParty}) async {
    final started = _epoch;
    if (_token == null) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    try {
      final bytes =
          await api.readBytes(path, token: _token!, party: actingParty);
      _check(started);
      return bytes;
    } on AccountError catch (e) {
      if (e.status == 403 && started == _epoch) denySupply();
      if (e.status == 401 && started == _epoch) {
        _clear();
        authNotice = '登录已失效，请重新验证手机号。';
        notifyListeners();
      }
      rethrow;
    }
  }

  Future<void> loadParties({bool more = false}) async {
    if (more && partiesCursor == null) return;
    final ticket = ++_partyRead;
    final result = await read('/api/v1/me/parties', query: {
      'limit': 20,
      if (more && partiesCursor != null) 'cursor': partiesCursor,
    });
    if (ticket != _partyRead) return;
    final rows = maps(result['items']);
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
      selected = match.first;
      if ((wasOwner && !isOwner) ||
          ['SUSPENDED', 'CLOSED'].contains(party?['current_status'])) {
        api.clearSupplyOperations();
        _epoch++;
      }
    }
    if (selected == null && parties.isNotEmpty) selected = parties.first;
    notifyListeners();
  }

  void select(Map<String, dynamic> value) {
    if (value['party']['id'] == partyId) return;
    api.clearSupplyOperations();
    supplyAccessDenied = false;
    licensingAccessDenied = false;
    _epoch++;
    selected = value;
    notifyListeners();
  }

  Future<void> refreshParty() async {
    final id = partyId;
    if (id == null) return;
    try {
      final result = await read('/api/v1/parties/$id', actingParty: id);
      selected = {...selected!, 'party': result};
      if (['SUSPENDED', 'CLOSED'].contains(result['current_status'])) {
        api.clearSupplyOperations();
        _epoch++;
      }
      parties =
          parties.map((p) => p['party']['id'] == id ? selected! : p).toList();
      notifyListeners();
    } on AccountError catch (error) {
      if ([403, 404].contains(error.status) && partyId == id) {
        api.clearSupplyOperations();
        _epoch++;
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
