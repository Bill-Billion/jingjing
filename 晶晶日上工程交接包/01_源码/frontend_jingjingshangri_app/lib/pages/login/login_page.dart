import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../account/account_theme.dart';
import '../../account/account_api.dart';
import '../../account/account_session.dart';
import '../../services/user_provider.dart';
import '../../widgets/primary_button.dart';

/// 手机号 + 验证码登录。
/// - 登录成功清除旧业务路由，进入新版“我的”；
/// - 供给及许可深链接只恢复目标读取，不继续此前的写入或旧业务；
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

  bool get _canLogin =>
      _pendingLogin ||
      (_phoneValid &&
          _challengeId != null &&
          _challengePhone == _phoneCtrl.text.trim() &&
          RegExp(r'^\d{6}$').hasMatch(_codeCtrl.text.trim()) &&
          _agreed);

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
    if (!_agreed && !_pendingLogin) {
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

  Future<void> _enterAfterLogin() async {
    // Resume only an explicit current read/form route with fresh session reads.
    // No old private route or pending action survives login.
    final route = Uri.tryParse(widget.returnRoute ?? '');
    final destination = route != null &&
            !route.hasAuthority &&
            !route.hasScheme &&
            [
              '/supply',
              '/supply/profile',
              '/supply/work/new',
              '/supply/record',
              '/enter',
              '/licensing',
              '/licensing/catalog',
              '/licensing/record',
              '/licensing/reading',
              '/licensing/evidence',
              '/licensing/project/new',
              '/licensing/bind',
              '/orders',
              '/trade',
              '/trade/record',
              '/trade/refund',
              '/my-projects',
              '/cultivate',
              '/mcn',
              '/messages',
              '/gigs',
              '/gigs/request',
              '/gigs/requests/new',
              '/gigs/offers/new',
              '/gigs/relations/new',
              '/gigs/records',
              '/gigs/record',
              '/gigs/notifications',
              '/gigs/ranking',
              '/rankings',
              '/ranking',
              '/leaderboard'
            ].contains(route.path)
        ? route.toString()
        : '/my';
    if (destination != '/my') {
      try {
        await context.read<AccountSession>().loadParties();
      } on AccountError {
        if (mounted) {
          Navigator.of(context).pushNamedAndRemoveUntil('/my', (_) => false);
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
      appBar: AppBar(leading: BackButton(onPressed: () {
        if (Navigator.canPop(context)) {
          Navigator.pop(context);
        } else {
          Navigator.pushReplacementNamed(context, '/my');
        }
      })),
      body: SafeArea(
          child: Align(
              alignment: Alignment.topCenter,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 40, 16, 32),
                child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 440),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text('晶晶日上',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                  fontSize: 32,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 4)),
                          const SizedBox(height: 16),
                          Text(widget.reason ?? '使用本人手机号登录，随后选择操作身份',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                  fontSize: 14,
                                  color: AccountTheme.muted,
                                  height: 1.6)),
                          const SizedBox(height: 32),
                          const Text('手机号',
                              style: TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w600)),
                          const SizedBox(height: 8),
                          Semantics(
                              label: '手机号',
                              child: TextField(
                                enabled: !_sending &&
                                    !busy &&
                                    !_pendingSms &&
                                    !_pendingLogin,
                                controller: _phoneCtrl,
                                focusNode: _phoneFocus,
                                keyboardType: TextInputType.phone,
                                maxLength: 11,
                                inputFormatters: [
                                  FilteringTextInputFormatter.digitsOnly
                                ],
                                decoration: const InputDecoration(
                                    hintText: '请输入 11 位手机号',
                                    counterText: '',
                                    prefixIcon:
                                        Icon(Icons.phone_iphone_outlined)),
                                onChanged: (_) => setState(() {
                                  if (_challengePhone !=
                                      _phoneCtrl.text.trim()) {
                                    _challengeId = null;
                                    _timer?.cancel();
                                    _countdown = 0;
                                    _codeCtrl.clear();
                                  }
                                }),
                              )),
                          const SizedBox(height: 24),
                          const Text('验证码',
                              style: TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w600)),
                          const SizedBox(height: 8),
                          Row(children: [
                            Expanded(
                                child: Semantics(
                                    label: '验证码',
                                    child: TextField(
                                      enabled:
                                          !_sending && !busy && !_pendingLogin,
                                      controller: _codeCtrl,
                                      focusNode: _codeFocus,
                                      keyboardType: TextInputType.number,
                                      onChanged: (_) => setState(() {}),
                                      maxLength: 6,
                                      inputFormatters: [
                                        FilteringTextInputFormatter.digitsOnly
                                      ],
                                      decoration: const InputDecoration(
                                          prefixIcon: Icon(
                                              Icons.verified_user_outlined),
                                          hintText: '6 位验证码',
                                          counterText: ''),
                                    ))),
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
                                        color: AccountTheme.danger,
                                        height: 1.5))),
                          const SizedBox(height: 20),
                          Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                SizedBox(
                                    width: 44,
                                    height: 44,
                                    child: IconButton(
                                        tooltip: '同意用户协议与隐私政策',
                                        onPressed: () =>
                                            setState(() => _agreed = !_agreed),
                                        icon: Icon(
                                            _agreed
                                                ? Icons.check_circle_rounded
                                                : Icons
                                                    .radio_button_unchecked_rounded,
                                            color: _agreed
                                                ? AccountTheme.accent
                                                : AccountTheme.muted))),
                                Expanded(
                                    child: Wrap(
                                        crossAxisAlignment:
                                            WrapCrossAlignment.center,
                                        children: [
                                      const Text('我已阅读并同意',
                                          style: TextStyle(fontSize: 13)),
                                      TextButton(
                                          onPressed: () => Navigator.pushNamed(
                                              context, '/agreement'),
                                          child: const Text('《用户协议》')),
                                      const Text('和',
                                          style: TextStyle(fontSize: 13)),
                                      TextButton(
                                          onPressed: () => Navigator.pushNamed(
                                              context, '/privacy'),
                                          child: const Text('《隐私政策》')),
                                    ])),
                              ]),
                          const SizedBox(height: 20),
                          FilledButton(
                              onPressed: busy || _sending || !_canLogin
                                  ? null
                                  : _login,
                              child: Text(busy ? '正在登录…' : '登录 / 注册')),
                          const SizedBox(height: 14),
                          const Text('未注册的手机号验证通过后将自动注册',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                  color: AccountTheme.muted,
                                  fontSize: 13,
                                  height: 1.6)),
                        ])),
              ))),
    ));
  }
}
