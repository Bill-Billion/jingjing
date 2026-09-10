import 'package:flutter/material.dart';
import '../utils/motion.dart';

/// V15.3 统一动效组件库（只做表现层包裹，绝不改变业务/布局/数据）。
/// 时长与曲线一律引用 [Motion]，并尊重系统“减少动态效果”。
///
/// 提供：
/// - [FadeSlideIn]：单元素淡入 + 轻位移，支持延迟；
/// - [StaggerItem]：列表错落入场（按 index 自动递增延迟）；
/// - [PageEnter]：整页首次轻入场（供 LiquidScaffold 统一使用）；
/// - [CountUpText]：数字 / 金额滚动到位；
/// - [PopScale]：点赞 / 收藏点击的小弹跳反馈。

bool _reduced(BuildContext c) => Motion.reduced(c);

/// 淡入 + 轻位移入场。
class FadeSlideIn extends StatefulWidget {
  final Widget child;
  final int delayMs;
  final int durationMs;
  final Offset beginOffset;
  final Curve curve;
  final bool animate;

  const FadeSlideIn({
    super.key,
    required this.child,
    this.delayMs = 0,
    this.durationMs = Motion.sheet,
    this.beginOffset = const Offset(0, 0.035),
    this.curve = Motion.easeOut,
    this.animate = true,
  });

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

class _FadeSlideInState extends State<FadeSlideIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: widget.durationMs),
  );
  late final Animation<double> _curved =
      CurvedAnimation(parent: _c, curve: widget.curve);

  @override
  void initState() {
    super.initState();
    // 不得在 initState 读取 MediaQuery(InheritedWidget)，reduced 只在 build 判断。
    if (!widget.animate) {
      _c.value = 1;
      return;
    }
    if (widget.delayMs <= 0) {
      _c.forward();
    } else {
      Future.delayed(Duration(milliseconds: widget.delayMs), () {
        if (mounted) _c.forward();
      });
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.animate || _reduced(context)) return widget.child;
    return FadeTransition(
      opacity: _curved,
      child: SlideTransition(
        position: Tween(begin: widget.beginOffset, end: Offset.zero)
            .animate(_curved),
        child: widget.child,
      ),
    );
  }
}

/// 列表错落入场：第 index 项自动多延迟一点（封顶，避免长列表尾部等太久）。
class StaggerItem extends StatelessWidget {
  final int index;
  final Widget child;
  final int stepMs;
  final int maxDelayMs;
  final Offset beginOffset;

  const StaggerItem({
    super.key,
    required this.index,
    required this.child,
    this.stepMs = 55,
    this.maxDelayMs = 360,
    this.beginOffset = const Offset(0, 0.045),
  });

  @override
  Widget build(BuildContext context) {
    final delay = (index * stepMs).clamp(0, maxDelayMs);
    return FadeSlideIn(
      delayMs: delay,
      durationMs: Motion.sheet,
      beginOffset: beginOffset,
      child: child,
    );
  }
}

/// 整页首次轻入场（淡入 + 极轻微上浮），用于脚手架统一包裹页面 body。
class PageEnter extends StatelessWidget {
  final Widget child;
  const PageEnter({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    if (_reduced(context)) return child;
    return FadeSlideIn(
      durationMs: Motion.page,
      beginOffset: const Offset(0, 0.018),
      child: child,
    );
  }
}

/// 数字 / 金额滚动到位。只负责把“最终数值”以动画呈现，不做任何金额换算，
/// 货币符号、千分位由 prefix/suffix 决定，业务口径仍在数据源。
class CountUpText extends StatefulWidget {
  final num value;
  final String prefix;
  final String suffix;
  final int decimals;
  final TextStyle? style;
  final TextAlign? textAlign;
  final bool thousands;
  final int durationMs;

  const CountUpText({
    super.key,
    required this.value,
    this.prefix = '',
    this.suffix = '',
    this.decimals = 0,
    this.style,
    this.textAlign,
    this.thousands = false,
    this.durationMs = 720,
  });

  @override
  State<CountUpText> createState() => _CountUpTextState();
}

class _CountUpTextState extends State<CountUpText>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: widget.durationMs),
  );
  late Animation<double> _anim = const AlwaysStoppedAnimation(0);

  String _format(double v) {
    String core = v.toStringAsFixed(widget.decimals);
    if (widget.thousands) {
      final parts = core.split('.');
      parts[0] = parts[0].replaceAllMapped(
          RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => ',');
      core = parts.join('.');
    }
    return '${widget.prefix}$core${widget.suffix}';
  }

  void _tweenTo(num from, num to) {
    _anim = Tween(begin: from.toDouble(), end: to.toDouble()).animate(
      CurvedAnimation(parent: _c, curve: Motion.easeOut),
    )..addListener(() {
        if (mounted) setState(() {});
      });
  }

  @override
  void initState() {
    super.initState();
    // reduced 依赖 MediaQuery，只能在 build 读取；initState 一律先正向动画。
    _tweenTo(0, widget.value);
    _c.forward();
  }

  @override
  void didUpdateWidget(covariant CountUpText old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value) {
      final start = _anim.value;
      _c.stop();
      _tweenTo(start, widget.value);
      _c.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final v = _reduced(context) ? widget.value.toDouble() : _anim.value;
    return Text(_format(v),
        style: widget.style, textAlign: widget.textAlign);
  }
}

/// 点赞 / 收藏小弹跳：点击瞬间放大再回弹（弹性曲线）。
class PopScale extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final double peak; // 放大峰值

  const PopScale({
    super.key,
    required this.child,
    this.onTap,
    this.peak = 1.28,
  });

  @override
  State<PopScale> createState() => _PopScaleState();
}

class _PopScaleState extends State<PopScale>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 360),
  );
  late final Animation<double> _a =
      CurvedAnimation(parent: _c, curve: Curves.elasticOut);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _tap() {
    _c.forward(from: 0);
    widget.onTap?.call();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _tap,
      child: AnimatedBuilder(
        animation: _a,
        builder: (_, child) {
          // elasticOut 从略大于 1 回弹到 1；映射为 1→peak→1
          final s = 1 + (widget.peak - 1) * (1 - _a.value).clamp(0.0, 1.0);
          return Transform.scale(scale: s, child: child);
        },
        child: widget.child,
      ),
    );
  }
}
