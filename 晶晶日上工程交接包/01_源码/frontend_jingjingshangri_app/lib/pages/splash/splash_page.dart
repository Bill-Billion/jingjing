import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../theme/app_theme.dart';
import '../../services/user_provider.dart';
import '../../utils/motion.dart';
import '../onboarding/onboarding_page.dart';
import '../login/login_page.dart';
import '../../widgets/main_scaffold.dart';
import '../../widgets/brand_mark.dart';
import '../../widgets/liquid_backdrop.dart';

/// 开屏：冷启动只播一次（动画总时长 ≤1.6s）。
/// 路由决策：已登录 → 主导航；未登录且首装未看引导 → 引导页；否则 → 登录页。
///
/// V15.5 进场强化（A2，纯表现层、不改任何路由/业务）：青金环境辉光 + Logo 汇聚浮入
/// + 品牌名/英文/slogan/加载圈逐行浮入 + 一次性上升光粒。全部由单个
/// AnimationController 驱动（不叠加循环动画、冷启动不堆多套动效），并尊重系统
/// “减少动态效果”：开启时直接呈现终态。
class SplashPage extends StatefulWidget {
  const SplashPage({super.key});

  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _logo;
  late final Animation<double> _glow;
  late final Animation<double> _name;
  late final Animation<double> _en;
  late final Animation<double> _slogan;
  late final Animation<double> _loader;
  late final Animation<double> _particles;

  /// 与 _bootstrap 的最短展示 1400ms 对齐：动画 1300ms 内播完，路由切换时已静止。
  static const int _animMs = 1300;
  static const _kOnboardSeen = 'onboarding_seen_v12_3';

  /// build 期间同步写入；为 true 时所有浮入直接呈现终态、不绘粒子。
  bool _off = false;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: _animMs),
    );
    Animation<double> seg(double a, double b) => CurvedAnimation(
          parent: _ctrl,
          curve: Interval(a, b, curve: Motion.easeOut),
        );
    _glow = CurvedAnimation(
        parent: _ctrl, curve: const Interval(0, 0.9, curve: Motion.inOut));
    _logo = seg(0, 0.52);
    _name = seg(0.26, 0.70);
    _en = seg(0.38, 0.80);
    _slogan = seg(0.50, 0.88);
    _loader = seg(0.64, 1.0);
    _particles = seg(0.12, 1.0);
    _ctrl.forward();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final up = context.read<UserProvider>();
    // 并行：等用户态恢复 + 最短展示 1400ms
    final results = await Future.wait([
      _waitRestored(up),
      Future.delayed(const Duration(milliseconds: 1400)),
    ]);
    final loggedIn = results[0] as bool;
    if (!mounted) return;

    final sp = await SharedPreferences.getInstance();
    final onboardSeen = sp.getBool(_kOnboardSeen) ?? false;

    Widget next;
    if (loggedIn) {
      next = const MainScaffold();
    } else if (!onboardSeen) {
      next = const OnboardingPage();
    } else {
      next = const LoginPage();
    }
    if (!mounted) return;
    Navigator.of(context).pushReplacement(Motion.fadeSlideRoute(next));
  }

  Future<bool> _waitRestored(UserProvider up) async {
    for (var i = 0; i < 50 && !up.restored; i++) {
      await Future.delayed(const Duration(milliseconds: 30));
    }
    return up.isLoggedIn;
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  /// 单层“浮入”：透明度 0→1 + 轻微上移；减少动态时直接给终态。
  Widget _reveal(Animation<double> a, Widget child,
      {double dy = 14, bool off = false}) {
    if (off) return child;
    return AnimatedBuilder(
      animation: a,
      builder: (_, c) => Opacity(
        opacity: a.value.clamp(0.0, 1.0),
        child: Transform.translate(
          offset: Offset(0, (1 - a.value) * dy),
          child: c,
        ),
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    _off = Motion.reduced(context);

    return Scaffold(
      backgroundColor: AppTheme.liquidBase,
      body: Stack(
        children: [
          // 开屏用固定相位流光，避免冷启动叠加多套循环动画
          const Positioned.fill(
              child: LiquidBackdrop(animated: false, staticPhase: 0.2)),

          // 一次性上升光粒（围绕 Logo 区域，纯绘制、无循环）
          if (!_off)
            Positioned.fill(
              child: IgnorePointer(
                child: Center(
                  child: AnimatedBuilder(
                    animation: _particles,
                    builder: (_, __) => CustomPaint(
                      size: const Size(260, 320),
                      painter: _RiseDots(_particles.value),
                    ),
                  ),
                ),
              ),
            ),

          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Logo：青金环境辉光呼吸 + 汇聚浮入
                Stack(
                  alignment: Alignment.center,
                  children: [
                    if (!_off)
                      AnimatedBuilder(
                        animation: _glow,
                        builder: (_, __) {
                          final g = _glow.value;
                          return Container(
                            width: 168,
                            height: 168,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: RadialGradient(
                                colors: [
                                  AppTheme.aquaBright
                                      .withValues(alpha: 0.22 * g),
                                  AppTheme.goldMain
                                      .withValues(alpha: 0.10 * g),
                                  Colors.transparent,
                                ],
                                stops: const [0.0, 0.42, 1.0],
                              ),
                            ),
                          );
                        },
                      ),
                    _logoMark(_off),
                  ],
                ),
                const SizedBox(height: 22),
                _reveal(
                  _name,
                  const Text('晶晶日上',
                      style: TextStyle(
                        color: AppTheme.textPrimary,
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 6,
                      )),
                  off: _off,
                ),
                const SizedBox(height: 6),
                _reveal(
                  _en,
                  const Text('JINGJING RISING',
                      style: TextStyle(
                          color: AppTheme.goldMain,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 4)),
                  dy: 10,
                  off: _off,
                ),
                const SizedBox(height: 10),
                _reveal(
                  _slogan,
                  const Text('每一个角色，都为等待的人而生',
                      style: TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 12.5,
                          letterSpacing: 1.5)),
                  dy: 10,
                  off: _off,
                ),
                const SizedBox(height: 36),
                _reveal(
                  _loader,
                  const SizedBox(
                    width: 26,
                    height: 26,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppTheme.gold),
                  ),
                  dy: 8,
                  off: _off,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Logo 汇聚浮入：0.86→1.0 缩放 + 淡入；减少动态时直接终态。
  Widget _logoMark(bool off) {
    const mark = BrandMark(size: 96);
    if (off) return mark;
    return AnimatedBuilder(
      animation: _logo,
      builder: (_, c) {
        final v = _logo.value;
        return Opacity(
          opacity: v.clamp(0.0, 1.0),
          child: Transform.scale(
            scale: 0.86 + 0.14 * v,
            child: c,
          ),
        );
      },
      child: mark,
    );
  }
}

/// 开屏一次性上升光粒：确定性锚点（不使用随机，保证每次一致、可测试）。
/// 每个锚点：[相对中心X, 起始Y, 上升距离, 半径, 0青/1金]
class _RiseDots extends CustomPainter {
  final double t;
  const _RiseDots(this.t);

  static const List<List<double>> _dots = [
    [-58, 46, 78, 2.1, 0],
    [-40, 66, 104, 1.5, 1],
    [-22, 38, 66, 1.8, 0],
    [18, 70, 110, 1.4, 0],
    [38, 44, 74, 2.0, 1],
    [58, 62, 98, 1.5, 0],
    [-8, 78, 122, 1.3, 1],
    [8, 30, 58, 1.6, 0],
    [70, 24, 52, 1.3, 1],
    [-70, 22, 50, 1.3, 0],
  ];

  @override
  void paint(Canvas canvas, Size size) {
    if (t <= 0) return;
    final cx = size.width / 2;
    final cy = size.height / 2;
    for (final d in _dots) {
      final dx = d[0];
      final baseY = d[1];
      final rise = d[2];
      final r = d[3];
      final isGold = d[4] > 0.5;
      // 先淡入（0→0.18）再淡出（0.18→1），形成向上飘逝
      final fadeIn = (t / 0.18).clamp(0.0, 1.0);
      final fadeOut = (1 - ((t - 0.18) / 0.82)).clamp(0.0, 1.0);
      final op = (fadeIn * fadeOut).clamp(0.0, 1.0) * 0.7;
      if (op <= 0.01) continue;
      final paint = Paint()
        ..color = (isGold ? AppTheme.goldMain : AppTheme.rimCyan)
            .withValues(alpha: op)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.2);
      canvas.drawCircle(Offset(cx + dx, cy + baseY - rise * t), r, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _RiseDots old) => old.t != t;
}
