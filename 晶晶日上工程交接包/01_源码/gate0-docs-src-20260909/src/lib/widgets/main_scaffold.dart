import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../utils/motion.dart';
import '../utils/perf_isolation.dart';
import '../utils/perf_trace.dart';
import 'glass_card.dart';
import 'glow_panel.dart';
import 'iris_button.dart';
import 'liquid_backdrop.dart';
import '../pages/home/home_page.dart';
import '../pages/projects/projects_page.dart';
import '../pages/messages/messages_page.dart';
import '../pages/profile/profile_page.dart';

/// 主框架：首页 / 圆梦 / 中央创作 / 消息 / 我的，五区域等宽对齐。
/// V15：整栏只做一次真实毛玻璃（FrostedBar），线性图标视觉等重，
/// 中央创作键=香槟金渐变玻璃圆（直径约普通图标的 1.35 倍）。
/// 艺人广场从首页金刚区/推荐位进入，不占底部 Tab。
class MainScaffold extends StatefulWidget {
  final int initialTab;
  const MainScaffold({super.key, this.initialTab = 0});

  @override
  State<MainScaffold> createState() => _MainScaffoldState();
}

class _MainScaffoldState extends State<MainScaffold> {
  late int _currentIndex;

  // 中央创作位不占页面槽位
  final List<Widget> _pages = const [
    HomePage(),
    ProjectsPage(),
    SizedBox.shrink(),
    MessagesPage(),
    ProfilePage(),
  ];

  // Gate0 F-R1：已访问过的主 Tab 才挂载，挂载后由 IndexedStack 保活
  // （切走 Offstage 而非 dispose，切回不再 createState/initState、不回骨架）；
  // 未访问的 Tab 不提前挂载，避免启动即四页并发首请求。
  final Set<int> _visited = {};

  // 统一线性图标（圆角端点、24px 视觉等重），不再 filled/outlined 两套混用
  static const _items = [
    _NavSpec(Icons.home, '首页'),
    _NavSpec(Icons.auto_awesome_outlined, '圆梦'),
    null, // 中央创作
    _NavSpec(Icons.forum, '消息'),
    _NavSpec(Icons.person_outline_rounded, '我的'),
  ];

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialTab.clamp(0, 4);
    _visited.add(_currentIndex); // 首屏 Tab 立即挂载
    // Gate0 隔离实验台：V1 需静态化背景流动层，监听变体切换后重建
    PerfIso.addListener(_onIsoChanged);
  }

  @override
  void dispose() {
    PerfIso.removeListener(_onIsoChanged);
    super.dispose();
  }

  void _onIsoChanged() {
    if (mounted) setState(() {});
  }

  void _onTap(int i) {
    PerfTrace.stamp('tab tap i=$i from=$_currentIndex'); // Gate0 时间线：点击瞬间
    if (i == 2) {
      GlowPanel.show(context);
      return;
    }
    if (i != _currentIndex) {
      setState(() {
        _visited.add(i); // 首次访问才挂载，之后常驻保活
        _currentIndex = i;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.liquidBase,
      // V15.2：五个主 Tab 共用同一层曜石流光背景，切 Tab 时背景连续不重建；
      // 各 Tab 子页 Scaffold 背景须透明，让本层流光透出（不再各自铺底、避免多层动画）。
      // Gate0 F-R1：背景整体包 RepaintBoundary，全屏持续流光独立成层，重绘不连累前景页面。
      body: Stack(
        children: [
          // Gate0 隔离实验台 V1/V8/V9/V10：背景降级方案对比
          Positioned.fill(
            child: RepaintBoundary(
              child: PerfIso.backdropBaked
                  ? const LiquidBackdrop(bakeBase: true)
                  : PerfIso.backdropStatic
                      ? const LiquidBackdrop(animated: false)
                      : PerfIso.backdropHalfRate
                          ? const LiquidBackdrop(halfRate: true)
                          : PerfIso.backdropDotsOnly
                              ? const LiquidBackdrop(dotsOnly: true)
                              : const LiquidBackdrop(),
            ),
          ),
          // Gate0 F-R1：IndexedStack 保活——切走的页面 Offstage 而非 dispose，
          // 切回直接显示旧内容、不重建、不回骨架；懒挂载（未访问不实例化）避免启动并发首请求；
          // TickerMode 让非当前页停掉动画 ticker，减少后台渲染/耗电。
          Positioned.fill(
            child: IndexedStack(
              index: _currentIndex,
              children: List.generate(_pages.length, (i) {
                final bool alive = i == 2 || _visited.contains(i);
                return TickerMode(
                  enabled: _currentIndex == i,
                  child: alive ? _pages[i] : const SizedBox.shrink(),
                );
              }),
            ),
          ),
          // Gate0 隔离实验台：测量报告上屏（仅 profile 有内容，release 恒空）
          if (PerfIso.reportText.isNotEmpty)
            Positioned(
              left: 10,
              right: 10,
              top: 60,
              child: IgnorePointer(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    PerfIso.reportText,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontFeatures: [FontFeature.tabularFigures()],
                      decoration: TextDecoration.none,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
      extendBody: true,
      bottomNavigationBar: _buildBottomBar(context),
    );
  }

  Widget _buildBottomBar(BuildContext context) {
    // V15.1 悬浮液态玻璃胶囊导航 + 外层凸起青金虹彩气泡中央键
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
      child: SizedBox(
        height: 62,
        child: LayoutBuilder(builder: (context, constraints) {
          final slot = constraints.maxWidth / 5;
          return Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(
                child: FrostedBar(
                  sigma: AppTheme.glassSigmaHigh,
                  borderRadius: BorderRadius.circular(30),
                  tint: AppTheme.liquidDeep.withValues(alpha: 0.66),
                  border: Border.all(
                      color: AppTheme.rimCyan.withValues(alpha: 0.35),
                      width: 1),
                  boxShadow: [
                    BoxShadow(
                        color: AppTheme.aquaBright.withValues(alpha: 0.20),
                        blurRadius: 22,
                        offset: const Offset(0, 8)),
                    const BoxShadow(
                        color: Color(0x80000000),
                        blurRadius: 20,
                        offset: Offset(0, 8)),
                  ],
                  child: SafeArea(
                    top: false,
                    child: Row(
                      children: List.generate(5, (i) {
                        if (_items[i] == null) return SizedBox(width: slot);
                        return SizedBox(
                            width: slot, child: _buildNavItem(_items[i]!, i));
                      }),
                    ),
                  ),
                ),
              ),
              // 中央虹彩气泡（置于胶囊外层，凸起不被裁剪）
              Positioned(
                left: slot * 2 + (slot - 58) / 2,
                top: -12,
                child: _buildCenterButton(),
              ),
            ],
          );
        }),
      ),
    );
  }

  Widget _buildNavItem(_NavSpec spec, int i) {
    final selected = _currentIndex == i;
    final color = selected ? AppTheme.cyanSoft : AppTheme.textHint;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _onTap(i),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(spec.icon, color: color, size: 23),
          const SizedBox(height: 3),
          Text(spec.label,
              style: TextStyle(
                color: color,
                fontSize: 11,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                letterSpacing: 0.5,
              )),
          const SizedBox(height: 2),
          // 选中态：青色实心小点
          AnimatedContainer(
            duration: const Duration(milliseconds: Motion.short),
            width: selected ? 4 : 0,
            height: selected ? 4 : 0,
            decoration: BoxDecoration(
              color: AppTheme.cyanSoft,
              shape: BoxShape.circle,
              boxShadow: selected
                  ? [
                      BoxShadow(
                          color: AppTheme.aquaBright.withValues(alpha: 0.8),
                          blurRadius: 6)
                    ]
                  : null,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCenterButton() {
    // V15.1 青金虹彩玻璃气泡
    return IrisOrb(size: 58, onTap: () => GlowPanel.show(context));
  }
}

class _NavSpec {
  final IconData icon;
  final String label;
  const _NavSpec(this.icon, this.label);
}
