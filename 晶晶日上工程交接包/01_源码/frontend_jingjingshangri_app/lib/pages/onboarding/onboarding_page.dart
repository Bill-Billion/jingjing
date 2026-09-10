import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../theme/app_theme.dart';
import '../../widgets/liquid_backdrop.dart';
import '../../utils/motion.dart';
import '../../utils/responsive.dart';
import '../../utils/haptics.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/motion_fx.dart';
import '../login/login_page.dart';

/// 开屏引导：仅首装（或大版本更新）展示一次，之后冷启动直达登录/主页。
class OnboardingPage extends StatefulWidget {
  const OnboardingPage({super.key});

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage> {
  final PageController _ctrl = PageController();
  int _index = 0;

  static const _kOnboardSeen = 'onboarding_seen_v12_3';

  static const _pages = [
    _OnboardData(
      'assets/images/onboard_1.jpg',
      '定制专属数字人',
      '真人暖光形象、古风现代多风格，创建只属于你的数字分身',
    ),
    _OnboardData(
      'assets/images/onboard_2.jpg',
      'AI 一键生成',
      '文字描述即可生成图片与视频，阶段进度实时可见，成品自动入库',
    ),
    _OnboardData(
      'assets/images/onboard_3.jpg',
      '圆梦晶晶日上',
      '认领自有大剧空缺角色与席位，和主创团队一起让故事上映',
    ),
  ];

  Future<void> _finish() async {
    final sp = await SharedPreferences.getInstance();
    await sp.setBool(_kOnboardSeen, true);
    if (!mounted) return;
    Navigator.of(context).pushReplacement(Motion.fadeSlideRoute(const LoginPage()));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _index == _pages.length - 1;
    return Scaffold(
      backgroundColor: AppTheme.liquidBase,
      body: Stack(
        children: [
          const Positioned.fill(child: LiquidBackdrop()),
          PageView.builder(
            controller: _ctrl,
            onPageChanged: (i) {
              Haptics.select();
              setState(() => _index = i);
            },
            itemCount: _pages.length,
            itemBuilder: (_, i) => FadeSlideIn(
              key: ValueKey<String>('onboard_page_$i'),
              durationMs: Motion.page,
              child: _buildPage(_pages[i]),
            ),
          ),
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            right: 16,
            child: PressScale(
              onTap: _finish,
              borderRadius: BorderRadius.circular(999),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                ),
                child: const Text('跳过',
                    style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: MediaQuery.of(context).padding.bottom + 28,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      _pages.length,
                      (i) => AnimatedContainer(
                        duration: const Duration(milliseconds: Motion.short),
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: i == _index ? 22 : 7,
                        height: 7,
                        decoration: BoxDecoration(
                          gradient:
                              i == _index ? AppTheme.brandGradient : null,
                          color: i == _index
                              ? null
                              : Colors.white.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 26),
                  PrimaryButton(
                    label: isLast ? '进入晶晶日上' : '下一步',
                    onPressed: () {
                      if (isLast) {
                        _finish();
                      } else {
                        _ctrl.nextPage(
                          duration: const Duration(milliseconds: Motion.sheet),
                          curve: Motion.inOut,
                        );
                      }
                    },
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPage(_OnboardData d) {
    final wide = Responsive.useRail(context);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(28),
                child: Image.asset(
                  d.asset,
                  width: double.infinity,
                  height: wide ? 340 : 280,
                  fit: BoxFit.cover,
                ),
              ),
              const SizedBox(height: 36),
              Text(d.title,
                  style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                      fontFamily: AppTheme.serifFont,
                      letterSpacing: 2)),
              const SizedBox(height: 14),
              Text(d.desc,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 14,
                      height: 1.7)),
              const SizedBox(height: 90),
            ],
          ),
        ),
      ),
    );
  }
}

class _OnboardData {
  final String asset;
  final String title;
  final String desc;
  const _OnboardData(this.asset, this.title, this.desc);
}
