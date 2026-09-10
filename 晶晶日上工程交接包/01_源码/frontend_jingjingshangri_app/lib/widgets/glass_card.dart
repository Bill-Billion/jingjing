import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../utils/motion.dart';

/// V15「曜石流光」统一玻璃卡（档案21 §五）。
/// - 半透填充 + 顶部 1px 内高光 + 20 圆角 + Z 轴深色阴影；
/// - 列表卡走「预乘半透纯色」，**不实时 BackdropFilter** 以保帧率；
///   只有固定顶/底栏与浮层才允许真实模糊，请用 [FrostedBar]。
/// - 可点时按下 0.97 并轻微提亮（像光被触摸激活）。
class GlassCard extends StatefulWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final Color? color;
  final bool highlight; // 顶部 1px 内高光
  final bool shadow; // Z 轴深色投影
  final bool border;
  final Gradient? gradient;

  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.radius = AppTheme.radiusCard,
    this.onTap,
    this.onLongPress,
    this.color,
    this.highlight = true,
    this.shadow = true,
    this.border = true,
    this.gradient,
  });

  @override
  State<GlassCard> createState() => _GlassCardState();
}

class _GlassCardState extends State<GlassCard> {
  bool _pressed = false;

  bool get _interactive =>
      widget.onTap != null || widget.onLongPress != null;

  void _setPressed(bool v) {
    if (!_interactive) return;
    if (_pressed != v) setState(() => _pressed = v);
  }

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(widget.radius);
    final base = widget.color ??
        (widget.gradient == null ? AppTheme.glassWhite : null);

    Widget card = AnimatedContainer(
      duration: const Duration(milliseconds: Motion.micro),
      curve: Motion.press,
      decoration: BoxDecoration(
        color: _pressed ? AppTheme.glassWhiteStrong : base,
        gradient: widget.gradient,
        borderRadius: br,
        border: widget.border
            ? Border.all(
                color: _pressed
                    ? AppTheme.goldMain.withValues(alpha: 0.40)
                    : AppTheme.glassBorder,
                width: 1,
              )
            : null,
        boxShadow: widget.shadow ? AppTheme.elev1Shadow : null,
      ),
      child: Stack(
        children: [
          Padding(padding: widget.padding, child: widget.child),
          // 顶部 1px 内高光（rgba(255,255,255,.18)→透明）
          if (widget.highlight)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.vertical(
                        top: Radius.circular(widget.radius)),
                    gradient: LinearGradient(
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                      colors: [
                        Colors.white.withValues(alpha: 0.02),
                        AppTheme.glassHighlight,
                        Colors.white.withValues(alpha: 0.02),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );

    if (!_interactive) return card;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _setPressed(true),
      onTapUp: (_) => _setPressed(false),
      onTapCancel: () => _setPressed(false),
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: Motion.micro),
        curve: Motion.press,
        child: card,
      ),
    );
  }
}

/// 固定层真实毛玻璃（**仅**顶部栏 / 底部导航 / 浮层使用，全页最多 1–2 处，
/// sigma 18–24；列表内容区禁止使用，档案21 §三.5、档案14 §二.4）。
class FrostedBar extends StatelessWidget {
  final Widget child;
  final double sigma;
  final Color? tint;
  final BorderRadius? borderRadius;
  final Border? border;
  final List<BoxShadow>? boxShadow;
  final bool topHighlight;

  const FrostedBar({
    super.key,
    required this.child,
    this.sigma = AppTheme.glassSigmaLow,
    this.tint,
    this.borderRadius,
    this.border,
    this.boxShadow,
    this.topHighlight = true,
  });

  @override
  Widget build(BuildContext context) {
    Widget content = child;
    if (topHighlight) {
      content = Stack(
        children: [
          child,
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            child: IgnorePointer(
              child: ColoredBox(
                color: Colors.white.withValues(alpha: 0.14),
              ),
            ),
          ),
        ],
      );
    }
    final clip = borderRadius ?? BorderRadius.zero;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: borderRadius,
        border: border,
        boxShadow: boxShadow,
      ),
      child: ClipRRect(
        borderRadius: clip,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: tint ?? AppTheme.surfaceDark.withValues(alpha: 0.72),
            ),
            child: content,
          ),
        ),
      ),
    );
  }
}
