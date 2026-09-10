import '../../widgets/app_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/brand_logo.dart';
import '../../services/api_service.dart';
import '../../services/user_provider.dart';
import '../../utils/auth_guard.dart';
import '../../utils/motion.dart';
import '../../utils/perf_trace.dart';
import '../../utils/money.dart';
import '../../widgets/press_scale.dart';
import '../login/login_page.dart';
import '../../widgets/main_scaffold.dart';
import '../my_humans/my_humans_page.dart';
import '../ai_studio/my_works_page.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final ApiService _api = ApiService();
  int _orderCount = 0;
  num _balance = 0;
  bool _loadingStats = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final logged = context.read<UserProvider>().isLoggedIn;
      PerfTrace.stamp('profile postFrame logged=$logged');
      if (logged) _loadStats();
    });
  }

  Future<void> _loadStats() async {
    PerfTrace.stamp('profile loadStats start');
    setState(() => _loadingStats = true);
    try {
      final orders = await _api.getAllOrders();
      final counts = (orders['counts'] as Map?) ?? const {};
      if (mounted) {
        setState(() => _orderCount = (counts['all'] as num?)?.toInt() ?? 0);
      }
      // 订单数为附加统计：失败保留默认 0，不阻断「我的」主界面（A5 有意静默降级）
    } catch (_) {}
    try {
      final w = await _api.getWallet();
      final raw = w['balance'];
      if (mounted && raw is num) {
        // 后端 V12.2 起余额单位为「元」，前端禁止 /100
        setState(() => _balance = raw);
      }
      // 余额为附加统计：失败保留默认 0，不阻断「我的」主界面（A5 有意静默降级）
    } catch (_) {}
    if (mounted) setState(() => _loadingStats = false);
    WidgetsBinding.instance.addPostFrameCallback((_) =>
        PerfTrace.stamp('profile meaningful frame', meta: 'orders=$_orderCount'));
  }

  void _go(String route, {Object? args, bool requireAuth = true}) {
    if (requireAuth) {
      AuthGuard.ensureLogin(context, onLoggedIn: () {
        Navigator.pushNamed(context, route, arguments: args);
      });
    } else {
      Navigator.pushNamed(context, route, arguments: args);
    }
  }

  void _goTab(int i) {
    Navigator.of(context, rootNavigator: true).pushAndRemoveUntil(
      Motion.fadeSlideRoute(MainScaffold(initialTab: i)),
      (r) => r.isFirst,
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<UserProvider>();
    final loggedIn = provider.isLoggedIn;
    return Scaffold(
      // 流光背景统一由 MainScaffold 承载，本页透明透出
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          // 顶部双束聚光暖金光晕
          Positioned(
            top: -90,
            left: -70,
            child: _glow(AppTheme.goldMain.withValues(alpha: 0.16), 300),
          ),
          Positioned(
            top: 30,
            right: -90,
            child: _glow(AppTheme.goldDeep.withValues(alpha: 0.14), 260),
          ),
          RefreshIndicator(
            color: AppTheme.goldMain,
            onRefresh: loggedIn ? _loadStats : () async {},
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(child: _buildHeader(loggedIn, provider)),
                SliverToBoxAdapter(child: _buildStatsCard(loggedIn, provider)),
                SliverToBoxAdapter(child: _groupLabel('买家服务')),
                SliverToBoxAdapter(
                  child: _buildMenuGroup([
                    _MenuItem(Icons.assignment, '我的订单', () => _go('/orders')),
                    _MenuItem(Icons.video_library_rounded, '我的视频', () => _go('/video-lib')),
                    _MenuItem(Icons.forum, '我的消息', () => loggedIn ? _goTab(3) : _tapLogin()),
                    _MenuItem(Icons.account_balance_wallet_rounded, '我的钱包', () => _go('/wallet')),
                    _MenuItem(Icons.campaign, '品牌代言', () => _go('/endorsement')),
                    _MenuItem(Icons.theater_comedy_rounded, '晶晶日上', () => _go('/theater', requireAuth: false)),
                  ]),
                ),
                SliverToBoxAdapter(child: _groupLabel('创作中心')),
                SliverToBoxAdapter(
                  child: _buildMenuGroup([
                    _MenuItem(Icons.add_a_photo_outlined, '创建数字人', () => _go('/audition')),
                    _MenuItem(Icons.badge, '我的数字人', () {
                      AuthGuard.ensureLogin(context, onLoggedIn: () {
                        Navigator.push(context,
                            Motion.fadeSlideRoute(const MyHumansPage()));
                      });
                    }),
                    _MenuItem(Icons.auto_awesome_outlined, '我的作品', () {
                      AuthGuard.ensureLogin(context, onLoggedIn: () {
                        Navigator.push(context,
                            Motion.fadeSlideRoute(const MyWorksPage()));
                      });
                    }),
                    _MenuItem(Icons.analytics, '数字人使用报告', () => _go('/usage-report')),
                    _MenuItem(Icons.school, '艺人学院', () => _go('/talent-academy', requireAuth: false)),
                    _MenuItem(Icons.verified_user_rounded, '身份认证', () => _go('/identity')),
                  ]),
                ),
                SliverToBoxAdapter(child: _groupLabel('机构服务')),
                SliverToBoxAdapter(
                  child: _buildMenuGroup([
                    _MenuItem(Icons.business, 'MCN 管理后台（H5）', _mcnH5),
                    _MenuItem(Icons.settings, '设置', () => _go('/settings', requireAuth: false)),
                  ]),
                ),
                if (loggedIn)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 22, 20, 0),
                      child: PressScale(
                        borderRadius: BorderRadius.circular(999),
                        onTap: _logout,
                        child: Container(
                          height: 48,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: AppTheme.errorStrong.withValues(alpha: 0.10),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: AppTheme.errorStrong.withValues(alpha: 0.45)),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Icon(Icons.logout_rounded, size: 18, color: AppTheme.errorLight),
                            const SizedBox(width: 8),
                            Text('退出登录', style: TextStyle(color: AppTheme.errorLight, fontSize: 14, fontWeight: FontWeight.w700)),
                          ]),
                        ),
                      ),
                    ),
                  ),
                const SliverToBoxAdapter(child: SizedBox(height: 100)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _glow(Color c, double size) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [c, Colors.transparent]),
        ),
      );

  void _tapLogin() {
    Navigator.push(context, Motion.modalRoute(const LoginPage()));
  }

  void _mcnH5() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('MCN 机构仅通过独立 H5 管理后台运营，C 端不开放机构下单'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surfaceDark,
        title: const Text('退出登录', style: TextStyle(color: AppTheme.textPrimary)),
        content: const Text('确定退出当前账号吗？本地数字人与作品不会丢失。',
            style: TextStyle(color: AppTheme.textSecondary)),
        actions: [
          PressScale(
            borderRadius: BorderRadius.circular(999),
            onTap: () => Navigator.pop(ctx, false),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.04),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
              ),
              child: const Text('取消', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, fontWeight: FontWeight.w600)),
            ),
          ),
          PressScale(
            borderRadius: BorderRadius.circular(999),
            onTap: () => Navigator.pop(ctx, true),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.errorStrong.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: AppTheme.errorStrong.withValues(alpha: 0.5)),
              ),
              child: Text('退出', style: TextStyle(color: AppTheme.errorLight, fontSize: 13, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
    if (ok == true && mounted) {
      await context.read<UserProvider>().logout();
      setState(() {
        _orderCount = 0;
        _balance = 0;
        _loadingStats = false;
      });
    }
  }

  Widget _groupLabel(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
        child: Text(text,
            style: const TextStyle(
                color: AppTheme.goldLight,
                fontSize: 13,
                fontWeight: FontWeight.w700,
                letterSpacing: 1)),
      );

  Widget _buildHeader(bool loggedIn, UserProvider provider) {
    final nickname = loggedIn ? (provider.nickname ?? '晶晶用户') : '未登录';
    final phone = provider.phone ?? '';
    final avatar = provider.avatar ?? '';
    final maskedPhone =
        phone.length == 11 ? '${phone.substring(0, 3)}****${phone.substring(7)}' : phone;

    return SafeArea(
      bottom: false,
      child: PressScale(
        onTap: loggedIn ? null : _tapLogin,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 22),
          child: Column(
            children: [
              Container(
                width: 92,
                height: 92,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: AppTheme.brandGradient,
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.goldMain.withValues(alpha: 0.4),
                      blurRadius: 28,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                padding: const EdgeInsets.all(3),
                child: ClipOval(
                  child: Container(
                    color: AppTheme.surfaceDark,
                    padding: const EdgeInsets.all(3),
                    child: ClipOval(
                      child: loggedIn && avatar.isNotEmpty
                          ? AppNetworkImage(
                              imageUrl: _api.resolveUrl(avatar),
                              fit: BoxFit.cover,
                              placeholder: (_, __) => const _AvatarFallback(
                                  loggedOut: false),
                              errorWidget: (_, __, ___) =>
                                  const _AvatarFallback(loggedOut: false),
                            )
                          : const _AvatarFallback(loggedOut: true),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(nickname,
                      style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          fontFamily: AppTheme.serifFont,
                          letterSpacing: 1)),
                  if (!loggedIn) ...[
                    const SizedBox(width: 8),
                    const Icon(Icons.chevron_right_rounded,
                        color: AppTheme.textHint),
                  ],
                ],
              ),
              if (maskedPhone.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(maskedPhone,
                    style: const TextStyle(
                        color: AppTheme.textSecondary, fontSize: 12)),
              ] else ...[
                const SizedBox(height: 4),
                const Text('点击登录，同步你的订单与作品',
                    style:
                        TextStyle(color: AppTheme.textHint, fontSize: 12)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatsCard(bool loggedIn, UserProvider provider) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        decoration: AppTheme.glassDecoration(radius: 20),
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Row(
          children: [
            _stat('订单', loggedIn ? '$_orderCount' : '—', () => loggedIn ? _go('/orders') : _tapLogin()),
            _divider(),
            _stat('数字人', loggedIn ? '${provider.myHumans.length}' : '—', () {
              AuthGuard.ensureLogin(context, onLoggedIn: () {
                Navigator.push(context,
                    Motion.fadeSlideRoute(const MyHumansPage()));
              });
            }),
            _divider(),
            _stat('作品', loggedIn ? '${provider.myWorks.length}' : '—', () {
              AuthGuard.ensureLogin(context, onLoggedIn: () {
                Navigator.push(context,
                    Motion.fadeSlideRoute(const MyWorksPage()));
              });
            }),
            _divider(),
            _stat(
                '余额',
                loggedIn
                    ? (_loadingStats ? '…' : Money.rmb(_balance))
                    : '—',
                () => loggedIn ? _go('/wallet') : _tapLogin()),
          ],
        ),
      ),
    );
  }

  Widget _divider() => Container(
      width: 1, height: 30, color: Colors.white.withValues(alpha: 0.08));

  Widget _stat(String label, String value, VoidCallback onTap) {
    return Expanded(
      child: PressScale(
        onTap: onTap,
        child: Column(
          children: [
            Text(value,
                style: const TextStyle(
                    color: AppTheme.goldLight,
                    fontSize: 17,
                    fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            Text(label,
                style: const TextStyle(
                    color: AppTheme.textSecondary, fontSize: 11.5)),
          ],
        ),
      ),
    );
  }

  Widget _buildMenuGroup(List<_MenuItem> items) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Container(
        decoration: AppTheme.glassDecoration(radius: 18),
        child: Column(
          children: List.generate(items.length, (i) {
            final m = items[i];
            return Column(
              children: [
                if (i != 0)
                  Divider(
                      height: 1,
                      indent: 52,
                      color: Colors.white.withValues(alpha: 0.05)),
                PressScale(
                  onTap: m.onTap,
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                    child: Row(
                      children: [
                        Icon(m.icon, color: AppTheme.goldLight, size: 20),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Text(m.title,
                              style: const TextStyle(
                                  color: AppTheme.textPrimary,
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.w600)),
                        ),
                        const Icon(Icons.chevron_right_rounded,
                            color: AppTheme.textHint, size: 20),
                      ],
                    ),
                  ),
                ),
              ],
            );
          }),
        ),
      ),
    );
  }
}

class _MenuItem {
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  const _MenuItem(this.icon, this.title, this.onTap);
}


/// V15 头像兜底：玻璃圆 + 矢量单色 Logo（登录态）/ 线性人像（未登录），停用旧位图。
class _AvatarFallback extends StatelessWidget {
  final bool loggedOut;
  const _AvatarFallback({required this.loggedOut});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppTheme.bgGlowCard, AppTheme.surfaceDark],
        ),
      ),
      child: Center(
        child: loggedOut
            ? const Icon(Icons.person_outline_rounded,
                size: 34, color: AppTheme.goldMain)
            : const MonochromeLogo(size: 38),
      ),
    );
  }
}
