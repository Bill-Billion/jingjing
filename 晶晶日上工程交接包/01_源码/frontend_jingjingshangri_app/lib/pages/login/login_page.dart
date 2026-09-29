import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../account/account_theme.dart';
import '../../account/account_api.dart';
import '../../account/account_session.dart';
import '../../services/user_provider.dart';
import '../../utils/motion.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/main_scaffold.dart';

/// 手机号 + 验证码登录。
/// - 登录成功清除旧业务路由，进入新账号页面；
/// - 登录成功进入独立账号页，旧展示导航仅由浏览入口打开；
/// - 只使用账号服务实际发送的验证码；未启用时明确显示失败。
class LoginPage extends StatefulWidget {
  /// 来源场景说明，如「下单前请先登录」
  final String? reason;
  final String? returnRoute;
  const LoginPage({super.key, this.reason, this.returnRoute});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  String? _challengeId;
  String? _challengePhone;
  bool _pendingSms = false;
  bool _pendingLogin = false;
  bool _restoredPending = false;
  final TextEditingController _phoneCtrl = TextEditingController();
  final TextEditingController _codeCtrl = TextEditingController();
  final FocusNode _phoneFocus = FocusNode();
  final FocusNode _codeFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    // 聚焦态变化时重绘描边（聚焦转鎏金）
    _phoneFocus.addListener(_onFocus);
    _codeFocus.addListener(_onFocus);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_restoredPending) return;
    _restoredPending = true;
    final api = context.read<AccountSession?>()?.api;
    final login = api?.pending('POST', '/api/v1/auth/sessions');
    final sms = api?.pending('POST', '/api/v1/auth/sms-challenges');
    final input = (login ?? sms)?['body'];
    if (input is Map) {
      _phoneCtrl.text = '${input['phone']}';
      _pendingSms = sms != null;
      _pendingLogin = login != null;
      if (login != null) {
        _challengeId = input['challenge_id'] as String;
        _challengePhone = input['phone'] as String;
        _codeCtrl.text = input['code'] as String;
      }
      _errorText = '上次结果尚未确认，已恢复原内容，请重试原操作。';
    }
  }

  void _onFocus() => setState(() {});

  bool _agreed = false; // 合规：协议默认不勾选
  bool _sending = false;
  ButtonState _loginState = ButtonState.idle;
  int _countdown = 0;
  bool _enteringDemo = false; // 免验证体验进入中（不依赖短信）
  Timer? _timer;
  String? _errorText;

  @override
  void dispose() {
    _timer?.cancel();
    _phoneFocus.removeListener(_onFocus);
    _codeFocus.removeListener(_onFocus);
    _phoneFocus.dispose();
    _codeFocus.dispose();
    _phoneCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  bool get _phoneValid =>
      RegExp(r'^1[3-9]\d{9}$').hasMatch(_phoneCtrl.text.trim());

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(msg),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ));
  }

  Future<void> _sendCode() async {
    if (!_phoneValid) {
      setState(() => _errorText = '请输入正确的 11 位手机号');
      return;
    }
    setState(() {
      _sending = true;
      _errorText = null;
      _challengeId = null;
      _codeCtrl.clear();
    });
    try {
      final phone = _phoneCtrl.text.trim();
      final data = await context.read<AccountSession>().sendCode(phone);
      if (!mounted) return;
      _pendingSms = false;
      _challengeId = data['challenge_id'] as String;
      _challengePhone = phone;
      _toast('验证码已发送，请查收短信');
      _startCountdown(DateTime.parse(data['resend_after'] as String));
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          _errorText = e.message;
          _pendingSms = e.uncertain;
        });
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _startCountdown(DateTime resendAfter) {
    _timer?.cancel();
    int remaining() =>
        ((resendAfter.difference(DateTime.now()).inMilliseconds / 1000).ceil())
            .clamp(0, 86400);
    setState(() => _countdown = remaining());
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_countdown <= 1) {
        t.cancel();
        setState(() => _countdown = 0);
      } else {
        setState(() => _countdown = remaining());
      }
    });
  }

  Future<void> _login() async {
    if (_loginState == ButtonState.loading || _sending) return;
    final phone = _phoneCtrl.text.trim();
    final code = _codeCtrl.text.trim();
    if (!RegExp(r'^1[3-9]\d{9}$').hasMatch(phone)) {
      setState(() => _errorText = '请输入正确的手机号');
      return;
    }
    if (_challengeId == null || _challengePhone != phone) {
      _toast('请先为当前手机号获取验证码');
      return;
    }
    if (code.length != 6) {
      _toast('请输入 6 位验证码');
      return;
    }
    if (!_agreed) {
      _toast('请先阅读并同意用户协议与隐私政策');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _loginState = ButtonState.loading;
      _errorText = null;
    });
    try {
      final userProvider = context.read<UserProvider>();
      await context.read<AccountSession>().login(phone, _challengeId!, code);
      await userProvider
          .logout(); // New sessions must never authenticate legacy APIs.
      if (!mounted) return;
      setState(() => _loginState = ButtonState.success);
      await _enterAfterLogin();
    } on AccountError catch (e) {
      if (!mounted) return;
      setState(() {
        _loginState = ButtonState.errorState;
        _errorText = e.message;
        _pendingLogin = e.uncertain;
      });
    }
  }

  /// Browsing legacy screens does not create an account or a synthetic token.
  Future<void> _quickDemo() async {
    if (_enteringDemo || _sending || _loginState == ButtonState.loading) return;
    setState(() => _enteringDemo = true);
    await context.read<UserProvider>().logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
        Motion.fadeSlideRoute(const MainScaffold()), (_) => false);
  }

  Future<void> _enterAfterLogin() async {
    // Resume only an explicit supply read/form route with fresh session reads.
    // No old private route or pending action survives login.
    final route = Uri.tryParse(widget.returnRoute ?? '');
    final destination = route != null &&
            !route.hasAuthority &&
            ['/supply', '/supply/profile', '/supply/work/new', '/supply/record']
                .contains(route.path)
        ? route.toString()
        : '/account';
    if (destination != '/account') {
      try {
        await context.read<AccountSession>().loadParties();
      } on AccountError {
        if (mounted) {
          Navigator.of(context)
              .pushNamedAndRemoveUntil('/account', (_) => false);
        }
        return;
      }
    }
    if (mounted) {
      Navigator.of(context).pushNamedAndRemoveUntil(destination, (_) => false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = _loginState == ButtonState.loading;
    return AccountTheme(
        child: Scaffold(
      appBar: AppBar(),
      body: SafeArea(
          child: Center(
              child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
        child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.wb_sunny_outlined,
                      color: AccountTheme.accent, size: 48),
                  const SizedBox(height: 16),
                  const Text('晶晶日上',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 30,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 4)),
                  const SizedBox(height: 32),
                  const Text('手机号登录',
                      style:
                          TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(widget.reason ?? '欢迎回来，验证手机号后继续。',
                      style: const TextStyle(
                          color: AccountTheme.muted, height: 1.6)),
                  const SizedBox(height: 24),
                  TextField(
                    enabled:
                        !_sending && !busy && !_pendingSms && !_pendingLogin,
                    controller: _phoneCtrl,
                    focusNode: _phoneFocus,
                    keyboardType: TextInputType.phone,
                    maxLength: 11,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(
                        labelText: '手机号',
                        hintText: '请输入 11 位手机号',
                        counterText: '',
                        prefixIcon: Icon(Icons.phone_iphone_outlined)),
                    onChanged: (_) => setState(() {
                      if (_challengePhone != _phoneCtrl.text.trim()) {
                        _challengeId = null;
                        _timer?.cancel();
                        _countdown = 0;
                        _codeCtrl.clear();
                      }
                    }),
                  ),
                  const SizedBox(height: 16),
                  Row(children: [
                    Expanded(
                        child: TextField(
                      enabled: !_sending && !busy && !_pendingLogin,
                      controller: _codeCtrl,
                      focusNode: _codeFocus,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: const InputDecoration(
                          labelText: '验证码',
                          hintText: '6 位验证码',
                          counterText: ''),
                    )),
                    const SizedBox(width: 12),
                    OutlinedButton(
                        onPressed: _countdown > 0 ||
                                _sending ||
                                busy ||
                                _pendingLogin ||
                                !_phoneValid
                            ? null
                            : _sendCode,
                        child: Text(_sending
                            ? '发送中…'
                            : _countdown > 0
                                ? '${_countdown}s 后重发'
                                : '获取验证码')),
                  ]),
                  if (_errorText != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(_errorText!,
                            style: const TextStyle(
                                color: AccountTheme.danger, height: 1.5))),
                  const SizedBox(height: 20),
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    SizedBox(
                        width: 44,
                        height: 44,
                        child: IconButton(
                            tooltip: '同意用户协议与隐私政策',
                            onPressed: () => setState(() => _agreed = !_agreed),
                            icon: Icon(
                                _agreed
                                    ? Icons.check_circle_rounded
                                    : Icons.radio_button_unchecked_rounded,
                                color: _agreed
                                    ? AccountTheme.accent
                                    : AccountTheme.muted))),
                    Expanded(
                        child: Wrap(
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                          const Text('我已阅读并同意', style: TextStyle(fontSize: 13)),
                          TextButton(
                              onPressed: () =>
                                  Navigator.pushNamed(context, '/agreement'),
                              child: const Text('《用户协议》')),
                          const Text('和', style: TextStyle(fontSize: 13)),
                          TextButton(
                              onPressed: () =>
                                  Navigator.pushNamed(context, '/privacy'),
                              child: const Text('《隐私政策》')),
                        ])),
                  ]),
                  const SizedBox(height: 20),
                  FilledButton(
                      onPressed: busy || _sending ? null : _login,
                      child: Text(busy ? '正在登录…' : '登录 / 注册')),
                  const SizedBox(height: 14),
                  const Text('未注册的手机号验证通过后将自动注册',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: AccountTheme.muted,
                          fontSize: 13,
                          height: 1.6)),
                  const SizedBox(height: 24),
                  TextButton(
                      onPressed:
                          _enteringDemo || busy || _sending ? null : _quickDemo,
                      child: const Text('浏览旧版展示')),
                  const Text('仅浏览旧页面，不创建账号、不代表付款或业务办理成功。真实登录需要短信服务已启用。',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: AccountTheme.muted,
                          fontSize: 12,
                          height: 1.6)),
                ])),
      ))),
    ));
  }
}
