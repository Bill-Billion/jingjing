import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

/// 全局用户态（SSOT）：
/// - token / 用户资料持久化，冷启动自动恢复；
/// - 「我的数字人」：创建成功即本地落盘（断网可见），登录后用 /api/humans?mine=1 在线同步
///   本人全部状态（含审核中），本地照片优先、在线状态为准，双端按 id 合并去重；
/// - 「我的作品」：AI 文生图/文生视频成品本地落盘，断网不丢；
/// - 演示兜底登录同样写入，保证闭环可走通。
class UserProvider extends ChangeNotifier {
  static const _kToken = 'auth_token';
  static const _kUser = 'auth_user';
  static const _kMyHumans = 'my_humans_v1';
  static const _kMyWorks = 'my_works_v1';

  String? _token;
  Map<String, dynamic>? _user;
  List<Map<String, dynamic>> _myHumans = [];
  List<Map<String, dynamic>> _myWorks = [];
  bool _restored = false;

  String? get token => _token;
  Map<String, dynamic>? get user => _user;
  bool get isLoggedIn => _token != null && _token!.isNotEmpty;
  bool get restored => _restored;
  String? get phone => _user?['phone'] as String?;
  String? get nickname =>
      (_user?['nickname'] as String?) ??
      (_user?['name'] as String?) ??
      (phone == null ? null : '用户${phone!.substring(phone!.length - 4)}');
  String? get avatar => _user?['avatar'] as String?;

  /// 我的数字人（按创建时间倒序）
  List<Map<String, dynamic>> get myHumans =>
      List.unmodifiable(_myHumans.reversed);

  /// 我的作品（最新在前）
  List<Map<String, dynamic>> get myWorks => List.unmodifiable(_myWorks.reversed);

  /// 冷启动恢复登录态与本地资产
  Future<void> restore() async {
    final sp = await SharedPreferences.getInstance();
    _token = sp.getString(_kToken);
    final rawUser = sp.getString(_kUser);
    if (rawUser != null && rawUser.isNotEmpty) {
      try {
        _user = jsonDecode(rawUser) as Map<String, dynamic>;
      } catch (_) {
        _user = null;
      }
    }
    _myHumans = _decodeList(sp.getString(_kMyHumans));
    _myWorks = _decodeList(sp.getString(_kMyWorks));
    if (_token != null && _token!.isNotEmpty) {
      if (_token != null) ApiService().setToken(_token!);
    }
    _restored = true;
    notifyListeners();
  }

  List<Map<String, dynamic>> _decodeList(String? raw) {
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _persistUser() async {
    final sp = await SharedPreferences.getInstance();
    if (_token != null) {
      await sp.setString(_kToken, _token!);
    }
    if (_user != null) {
      await sp.setString(_kUser, jsonEncode(_user));
    }
  }

  /// 登录成功写入（data 为 /api/auth/phone 返回体）
  Future<void> saveLogin(Map<String, dynamic> data) async {
    final token = (data['token'] ?? data['accessToken'] ?? 'demo-token').toString();
    _token = token;
    final u = data['user'];
    _user = u is Map ? Map<String, dynamic>.from(u) : <String, dynamic>{
      'phone': data['phone'],
      'nickname': data['nickname'],
    };
    ApiService().setToken(token);
    await _persistUser();
    notifyListeners();
  }

  Future<void> logout() async {
    _token = null;
    _user = null;
    ApiService().clearAuthToken();
    final sp = await SharedPreferences.getInstance();
    await sp.remove(_kToken);
    await sp.remove(_kUser);
    // 退出登录不清空本地数字人/作品资产，下次登录仍可见
    notifyListeners();
  }

  // ───────────────────── 我的数字人 ─────────────────────

  Future<void> addMyHuman(Map<String, dynamic> human) async {
    final normalized = Map<String, dynamic>.from(human);
    normalized['localCreatedAt'] ??=
        DateTime.now().millisecondsSinceEpoch;
    // 去重：同一 id 覆盖更新
    _myHumans.removeWhere((e) => e['id'] != null && e['id'] == normalized['id']);
    _myHumans.add(normalized);
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kMyHumans, jsonEncode(_myHumans));
    notifyListeners();
  }

  /// 登录态在线同步「我的数字人」：GET /api/humans?mine=1（含 pending 审核中）。
  /// 本地照片(localPhoto/localAvatar)优先保留，在线审核状态/价格为准；
  /// 服务端有而本地无的记录补入；断网/未登录静默，本地落盘兜底。
  Future<void> syncOnlineHumans() async {
    if (_token == null || _token!.isEmpty) return;
    try {
      final list = await ApiService().getMyHumans();
      if (list.isEmpty) return;
      var changed = false;
      for (final raw in list) {
        final remote = Map<String, dynamic>.from(raw as Map);
        final id = remote['id'];
        final idx = _myHumans.indexWhere((e) => e['id'] != null && e['id'] == id);
        if (idx >= 0) {
          final local = _myHumans[idx];
          final merged = <String, dynamic>{...remote};
          if (local['localPhoto'] != null) merged['localPhoto'] = local['localPhoto'];
          if (local['localAvatar'] != null) merged['localAvatar'] = local['localAvatar'];
          if (local['localCreatedAt'] != null) merged['localCreatedAt'] = local['localCreatedAt'];
          if (merged.toString() != local.toString()) {
            _myHumans[idx] = merged;
            changed = true;
          }
        } else {
          remote['localCreatedAt'] ??= DateTime.now().millisecondsSinceEpoch;
          _myHumans.add(remote);
          changed = true;
        }
      }
      if (changed) {
        final sp = await SharedPreferences.getInstance();
        await sp.setString(_kMyHumans, jsonEncode(_myHumans));
        notifyListeners();
      }
    } catch (_) {
      // 静默：本地落盘兜底，不打断页面
    }
  }

  Future<void> updateMyHuman(dynamic id, Map<String, dynamic> patch) async {
    final idx = _myHumans.indexWhere((e) => e['id'] == id);
    if (idx >= 0) {
      _myHumans[idx] = {..._myHumans[idx], ...patch};
      final sp = await SharedPreferences.getInstance();
      await sp.setString(_kMyHumans, jsonEncode(_myHumans));
      notifyListeners();
    }
  }

  Future<void> removeMyHuman(dynamic id) async {
    _myHumans.removeWhere((e) => e['id'] == id);
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kMyHumans, jsonEncode(_myHumans));
    notifyListeners();
  }

  // ───────────────────── 我的作品（AI 生成） ─────────────────────

  Future<void> addMyWork(Map<String, dynamic> work) async {
    final normalized = Map<String, dynamic>.from(work);
    normalized['localCreatedAt'] ??= DateTime.now().millisecondsSinceEpoch;
    _myWorks.removeWhere((e) => e['taskId'] != null && e['taskId'] == normalized['taskId']);
    _myWorks.add(normalized);
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kMyWorks, jsonEncode(_myWorks));
    notifyListeners();
  }

  Future<void> updateMyWork(String taskId, Map<String, dynamic> patch) async {
    final idx = _myWorks.indexWhere((e) => e['taskId'] == taskId);
    if (idx >= 0) {
      _myWorks[idx] = {..._myWorks[idx], ...patch};
      final sp = await SharedPreferences.getInstance();
      await sp.setString(_kMyWorks, jsonEncode(_myWorks));
      notifyListeners();
    }
  }

  Future<void> removeMyWork(String taskId) async {
    _myWorks.removeWhere((e) => e['taskId'] == taskId);
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kMyWorks, jsonEncode(_myWorks));
    notifyListeners();
  }
}
