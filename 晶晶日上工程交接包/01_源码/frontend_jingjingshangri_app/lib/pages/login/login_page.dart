import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/user_provider.dart';
import '../../utils/motion.dart';
import '../../utils/responsive.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/main_scaffold.dart';
import '../../widgets/glass_icon.dart';
import '../../widgets/liquid_backdrop.dart';
import '../../widgets/liquid_glass.dart';
import '../../widgets/brand_mark.dart';

/// 手机号 + 验证码登录。
/// - 可被任意页面以模态方式推入（AuthGuard），登录成功 pop(true) 回来源并继续原动作；
/// - 作为冷启动根页时，登录成功进入主导航；
/// - dev 兜底码只存在于数据层，UI 不展示任何“任意 6 位/兜底码”提示。
class LoginPage extends StatefulWidget {
  /// 来源场景说明，如「下单前请先登录」
  final String? reason;
  const LoginPage({super.key, this.reason});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final ApiService _api = ApiService();
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
    });
    try {
      await _api.sendSmsCode(_phoneCtrl.text.trim());
      if (!mounted) return;
      _toast('验证码已发送，请查收短信');
      _startCountdown();
    } catch (e) {
      _toast('验证码发送失败，已为你保留倒计时，请稍后重试');
      // 演示/断网环境同样启动倒计时，保证流程可继续
      _startCountdown();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _startCountdown() {
    _timer?.cancel();
    setState(() => _countdown = 60);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_countdown <= 1) {
        t.cancel();
        setState(() => _countdown = 0);
      } else {
        setState(() => _countdown -= 1);
      }
    });
  }

  Future<void> _login() async {
    final phone = _phoneCtrl.text.trim();
    final code = _codeCtrl.text.trim();
    if (!RegExp(r'^1[3-9]\d{9}$').hasMatch(phone)) {
      setState(() => _errorText = '请输入正确的手机号');
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
      final res = await _api.loginWithPhone(phone, code);
      if (res['code'] == 0 || res['token'] != null || res['user'] != null) {
        final data = res['data'] is Map
            ? Map<String, dynamic>.from(res['data'] as Map)
            : <String, dynamic>{...res, 'phone': phone};
        await userProvider.saveLogin(data);
        if (!mounted) return;
        setState(() => _loginState = ButtonState.success);
        await Future.delayed(const Duration(milliseconds: 650));
        if (!mounted) return;
        _enterAfterLogin();
      } else {
        setState(() => _loginState = ButtonState.errorState);
        _toast('${res['message'] ?? '登录失败，请检查验证码'}');
        Future.delayed(const Duration(milliseconds: 1600), () {
          if (mounted) setState(() => _loginState = ButtonState.idle);
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _loginState = ButtonState.errorState);
      _toast('网络异常，请稍后重试');
      Future.delayed(const Duration(milliseconds: 1600), () {
        if (mounted) setState(() => _loginState = ButtonState.idle);
      });
    }
  }

  /// 免验证码体验登录：短信通道未开通期间，一键以本地体验账号进入（真实验证码链路保留）。
  Future<void> _quickDemo() async {
    if (!_agreed) {
      _toast('请先阅读并同意用户协议与隐私政策');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _enteringDemo = true);
    try {
      final userProvider = context.read<UserProvider>();
      final res = await _api.demoQuickLogin();
      final u = res['user'] is Map
          ? Map<String, dynamic>.from(res['user'] as Map)
          : <String, dynamic>{};
      final phone = _phoneCtrl.text.trim();
      if (phone.length == 11) {
        u['phone'] = '${phone.substring(0, 3)}****${phone.substring(7)}';
      }
      u['isDemo'] = true;
      u['nickname'] ??= '体验用户';
      await userProvider.saveLogin({
        'token': (res['token'] ?? 'demo-token').toString(),
        'user': u,
      });
      if (!mounted) return;
      await Future.delayed(const Duration(milliseconds: 480));
      if (!mounted) return;
      _enterAfterLogin();
    } catch (_) {
      if (!mounted) return;
      _toast('进入体验失败，请重试');
    } finally {
      if (mounted) setState(() => _enteringDemo = false);
    }
  }
  void _enterAfterLogin() {
    final navigator = Navigator.of(context);
    // 被守卫推入：可以 pop 说明上层有来源页，pop(true) 回跳并继续来源动作
    if (navigator.canPop()) {
      navigator.pop(true);
      return;
    }
    // 冷启动根登录：进入主导航
    Navigator.of(context).pushAndRemoveUntil(
      Motion.fadeSlideRoute(const MainScaffold()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final wide = Responsive.useRail(context);
    return Scaffold(
      backgroundColor: AppTheme.liquidBase,
      body: Stack(
        children: [
          // V15.1 曜石流光：流动青蓝环境背景
          const Positioned.fill(child: LiquidBackdrop()),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: EdgeInsets.symmetric(
                    horizontal: wide ? 24 : 20, vertical: 24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: LiquidGlass(
                          radius: 999,
                          halo: false,
                          sheen: false,
                          padding: const EdgeInsets.all(8),
                          onTap: () {
                            if (Navigator.of(context).canPop()) {
                              Navigator.of(context).pop(false);
                            }
                          },
                          child: const Icon(Icons.arrow_back_rounded,
                              color: AppTheme.textPrimary),
                        ),
                      ),
                      const SizedBox(height: 24),
                      // V15.1 发光 16 芒晶簇玻璃 Logo
                      const Center(child: BrandMark(size: 96)),
                      const SizedBox(height: 22),
                      const Text('晶晶日上',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 30,
                              fontWeight: FontWeight.w700,
                              fontFamily: AppTheme.serifFont,
                              letterSpacing: 8)),
                      const SizedBox(height: 6),
                      const Text('JINGJING RISING',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: AppTheme.cyanSoft,
                              fontSize: 10.5,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 5)),
                      const SizedBox(height: 14),
                      Text(widget.reason ?? '欢迎来到晶晶日上 · 手机号验证登录',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: AppTheme.iceHighlight.withValues(alpha: 0.78),
                              fontSize: 12.5)),
                      const SizedBox(height: 30),
                      _buildPhoneField(),
                      const SizedBox(height: 14),
                      _buildCodeField(),
                      if (_errorText != null) ...[
                        const SizedBox(height: 8),
                        Text(_errorText!,
                            style: const TextStyle(
                                color: AppTheme.errorLight, fontSize: 12)),
                      ],
                      const SizedBox(height: 14),
                      _buildAgreement(),
                      const SizedBox(height: 22),
                      PrimaryButton(
                        label: '登录 / 注册',
                        state: _loginState,
                        onPressed: _login,
                        successText: '登录成功',
                        errorText: '登录失败，点击重试',
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        '未注册的手机号验证通过后将自动注册',
                        textAlign: TextAlign.center,
                        style:
                            TextStyle(color: AppTheme.textHint, fontSize: 11.5),
                      ),
                      const SizedBox(height: 14),
                      _buildQuickDemo(),
                      const SizedBox(height: 26),
                      _buildDivider(),
                      const SizedBox(height: 20),
                      _buildOtherLogins(),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPhoneField() {
    final bool showErr = _errorText != null && !_phoneValid;
    final Color? accent = showErr
        ? AppTheme.errorLight
        : (_phoneFocus.hasFocus ? AppTheme.goldMain : null);
    return LiquidGlass(
      radius: 999,
      bright: true,
      halo: false,
      accent: accent,
      padding: const EdgeInsets.only(left: 6, right: 6),
      child: TextField(
        controller: _phoneCtrl,
        focusNode: _phoneFocus,
        keyboardType: TextInputType.phone,
        maxLength: 11,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        style: const TextStyle(
            color: AppTheme.textPrimary, fontSize: 16, letterSpacing: 1.2),
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
          counterText: '',
          prefixIcon: Icon(Icons.phone_iphone_rounded,
              color: showErr
                  ? AppTheme.errorLight
                  : (_phoneFocus.hasFocus
                      ? AppTheme.iceHighlight
                      : AppTheme.cyanSoft)),
          hintText: '请输入手机号',
          hintStyle: TextStyle(
              color: AppTheme.iceHighlight.withValues(alpha: 0.55),
              fontSize: 14.5,
              letterSpacing: 0.5),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(vertical: 18),
        ),
      ),
    );
  }

  Widget _buildCodeField() {
    return LiquidGlass(
      radius: 999,
      bright: true,
      halo: false,
      accent: _codeFocus.hasFocus ? AppTheme.goldMain : null,
      padding: const EdgeInsets.only(left: 6, right: 6),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _codeCtrl,
              focusNode: _codeFocus,
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 16,
                  letterSpacing: 2),
              decoration: InputDecoration(
                counterText: '',
                prefixIcon: Icon(Icons.lock_outline_rounded,
                    color: _codeFocus.hasFocus
                        ? AppTheme.iceHighlight
                        : AppTheme.cyanSoft),
                hintText: '请输入 6 位验证码',
                hintStyle: TextStyle(
                    color: AppTheme.iceHighlight.withValues(alpha: 0.55),
                    fontSize: 14.5,
                    letterSpacing: 1),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 18),
              ),
            ),
          ),
          PressScale(
            onTap: (_countdown > 0 || _sending || !_phoneValid)
                ? null
                : _sendCode,
            borderRadius: BorderRadius.circular(999),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: Motion.short),
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: (_countdown == 0 && !_sending && _phoneValid)
                    ? AppTheme.aquaBright.withValues(alpha: 0.10)
                    : Colors.white.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: (_countdown == 0 && !_sending && _phoneValid)
                      ? AppTheme.goldMain.withValues(alpha: 0.85)
                      : AppTheme.rimCyan.withValues(alpha: 0.30),
                  width: 1,
                ),
              ),
              child: _sending
                  ? const SizedBox(
                      width: 15,
                      height: 15,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppTheme.onGold))
                  : Text(
                      _countdown > 0 ? '${_countdown}s 后重发' : '获取验证码',
                      style: TextStyle(
                        color: (_countdown == 0 && _phoneValid)
                            ? AppTheme.goldLight
                            : AppTheme.textHint,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      )),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAgreement() {
    return PressScale(
      onTap: () => setState(() => _agreed = !_agreed),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            _agreed
                ? Icons.check_circle_rounded
                : Icons.radio_button_unchecked_rounded,
            color: _agreed ? AppTheme.goldMain : AppTheme.textHint,
            size: 18,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text.rich(
              TextSpan(
                style: const TextStyle(
                    color: AppTheme.textSecondary, fontSize: 12, height: 1.5),
                children: [
                  const TextSpan(text: '我已阅读并同意 '),
                  WidgetSpan(
                    alignment: PlaceholderAlignment.middle,
                    child: GestureDetector(
                      onTap: () => Navigator.pushNamed(context, '/agreement'),
                      child: const Text('《用户协议》',
                          style: TextStyle(color: AppTheme.cyanSoft)),
                    ),
                  ),
                  const TextSpan(text: ' 和 '),
                  WidgetSpan(
                    alignment: PlaceholderAlignment.middle,
                    child: GestureDetector(
                      onTap: () => Navigator.pushNamed(context, '/privacy'),
                      child: const Text('《隐私政策》',
                          style: TextStyle(color: AppTheme.cyanSoft)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickDemo() {
    return Column(
      children: [
        PressScale(
          onTap: _enteringDemo ? null : _quickDemo,
          borderRadius: BorderRadius.circular(999),
          child: LiquidGlass(
            radius: 999,
            bright: true,
            halo: false,
            padding: const EdgeInsets.symmetric(vertical: 15),
            child: Center(
              child: _enteringDemo
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppTheme.aquaBright),
                    )
                  : const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.bolt_rounded,
                            size: 18, color: AppTheme.aquaBright),
                        SizedBox(width: 8),
                        Text('免验证码 · 先体验',
                            style: TextStyle(
                                color: AppTheme.iceHighlight,
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1)),
                      ],
                    ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            '短信通道暂未开通，可免验证先体验全部环节；开通后用验证码正式登录',
            textAlign: TextAlign.center,
            style: TextStyle(
                color: AppTheme.textHint, fontSize: 10.5, height: 1.4),
          ),
        ),
      ],
    );
  }
  Widget _buildDivider() {
    return Row(
      children: [
        Expanded(
            child: Divider(
                color: Colors.white.withValues(alpha: 0.08), height: 1)),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 12),
          child: Text('其他登录方式',
              style: TextStyle(color: AppTheme.textHint, fontSize: 11)),
        ),
        Expanded(
            child: Divider(
                color: Colors.white.withValues(alpha: 0.08), height: 1)),
      ],
    );
  }

  Widget _buildOtherLogins() {
    // V15：第三方登录统一玻璃描边单色圆，不用原生彩色大块
    Widget item(IconData icon, String label) => GlassCircleButton(
          icon: icon,
          label: label,
          onTap: () => _toast('$label 登录将在正式版开放'),
        );
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        item(Icons.chat_bubble_outline_rounded, '微信'),
        item(Icons.alternate_email_rounded, '邮箱'),
      ],
    );
  }
}
