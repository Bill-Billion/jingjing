import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 连接模式
/// auto   ：自动——优先连真实服务器，连不上无缝进入演示模式（默认）
/// online ：强制在线——只走真实接口，失败就报错（联调/上线时用）
/// demo   ：演示模式——完全使用内置示例数据，不发起任何网络请求
enum ConnMode { auto, online, demo }

/// 全局应用连接状态（单例 + ChangeNotifier，可被 Provider/监听）
class AppMode extends ChangeNotifier {
  AppMode._internal();
  static final AppMode instance = AppMode._internal();

  static const String _kMode = 'connMode';
  ConnMode _mode = ConnMode.auto;

  /// auto 模式下最近一次探测结果：true=服务器在线
  bool _serverOnline = false;
  bool get serverOnline => _serverOnline;

  ConnMode get mode => _mode;

  String get modeLabel => switch (_mode) {
        ConnMode.auto => '自动',
        ConnMode.online => '在线',
        ConnMode.demo => '演示',
      };

  /// 当前是否处于演示数据态（页面/接口据此决定是否展示顶部提示）
  bool get isDemoNow {
    switch (_mode) {
      case ConnMode.demo:
        return true;
      case ConnMode.online:
        return false;
      case ConnMode.auto:
        return !_serverOnline;
    }
  }

  /// 是否允许发起真实网络请求
  bool get allowRemote => _mode != ConnMode.demo;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kMode);
    _mode = switch (raw) {
      'online' => ConnMode.online,
      'demo' => ConnMode.demo,
      _ => ConnMode.auto,
    };
    notifyListeners();
  }

  Future<void> setMode(ConnMode m) async {
    _mode = m;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kMode, m.name);
    notifyListeners();
  }

  /// 由网络探测结果更新在线状态（仅 auto 模式有意义）
  void markOnline(bool ok) {
    if (_serverOnline == ok) return;
    _serverOnline = ok;
    notifyListeners();
  }

  /// 演示账号一键登录：不联网，直接写入本地登录态标记
  Future<Map<String, dynamic>> demoLogin() async {
    final prefs = await SharedPreferences.getInstance();
    const user = {
      'id': 1,
      'nickname': '体验用户',
      'phone': '138****0000',
      'avatar': '',
      'role': 'user',
      'isDemo': true,
    };
    await prefs.setString('token', 'demo-token');
    await prefs.setInt('userId', 1);
    return {'token': 'demo-token', 'user': user};
  }

  bool get isDemoToken => true; // 供登录页判断，实际 token 由 ApiService 持有
  bool get loggedInDemo {
    // 轻量判断，避免 async
    return true;
  }

  /// 清除本地缓存与登录态（设置页“清除缓存”）
  Future<void> clearLocal({bool keepServer = true}) async {
    final prefs = await SharedPreferences.getInstance();
    final mode = prefs.getString(_kMode);
    final server = prefs.getString('serverUrl');
    await prefs.clear();
    if (mode != null) await prefs.setString(_kMode, mode);
    if (keepServer && server != null) await prefs.setString('serverUrl', server);
    notifyListeners();
  }

  @override
  void dispose() {
    // 全局单例不销毁
    if (kDebugMode) {}
    super.dispose();
  }
}
