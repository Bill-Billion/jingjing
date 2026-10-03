import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/user_provider.dart';
import '../account/account_session.dart';
import '../pages/login/login_page.dart';
import 'motion.dart';

/// 登录守卫：未登录时以模态方式打开登录页，登录成功后再执行来源动作（回跳来源页/来源操作）。
class AuthGuard {
  AuthGuard._();

  /// 返回 true 表示已登录（含本次刚登录成功）。
  static Future<bool> ensureLogin(
    BuildContext context, {
    VoidCallback? onLoggedIn,
    String? reason,
  }) async {
    final account = context.read<AccountSession?>();
    if ((account?.isLoggedIn ?? false)) {
      _unavailable(context);
      return false;
    }
    final up = context.read<UserProvider>();
    if (up.isLoggedIn) {
      onLoggedIn?.call();
      return true;
    }
    if (!context.mounted) return false;
    final ok = await Navigator.of(context, rootNavigator: true)
        .push<bool>(Motion.modalRoute(LoginPage(reason: reason)));
    if (!context.mounted) return false;
    if ((account?.isLoggedIn ?? false)) {
      _unavailable(context);
      return false;
    }
    if (ok == true && up.isLoggedIn) {
      onLoggedIn?.call();
      return true;
    }
    return false;
  }

  static void _unavailable(BuildContext context) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(
        content: Text('你已登录新账号。此旧版业务尚未接入，请到“我的 → 账号与机构”管理账号。'),
      ));
  }
}
