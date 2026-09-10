import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../utils/motion.dart';

/// V15「曜石流光」液态玻璃容器（档案21 §五）。
/// - 纵向体积渐变（玻璃厚度）+ 顶部扫光 + 亮青 rim + 极淡外发光；
/// - blur>0 时做真实 BackdropFilter（默认关闭以保帧率，固定层请用 FrostedBar）；
/// - 可点时按下 0.97 并轻微提亮（像光被触摸激活）。
/// V15.2：[bright]=true 使用更通透、更青亮的亮青玻璃（靶图输入胶囊/圆钮）。
class LiquidGlass extends StatefulWidget {
  final Widget child;
  final double radius;
  final EdgeInsetsGeometry padding;
  final double blur;
  final Color? tint;
  final bool halo; // 外发光
  final bool sheen; // 顶部扫光
  final bool bright; // V15.2 亮青液态玻璃（靶图同款更通透青亮）
  final Color? accent; // 聚焦/选中描边色（如输入框聚焦金色）
  final VoidCallback? onTap;

  const LiquidGlass({
    super.key,
    required this.child,
    this.radius = AppTheme.radiusCard,
    this.padding = const EdgeInsets.all(16),
    this.blur = 0,
    this.tint,
    this.halo = true,
    this.sheen = true,
    this.bright = false,
    this.accent,
    this.onTap,
  });

  @override
  State<LiquidGlass> createState() => _LiquidGlassState();
}

class _LiquidGlassState extends State<LiquidGlass> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(widget.radius);

    Widget content = Container(
      padding: widget.padding,
      decoration: BoxDecoration(
        borderRadius: br,
        // 极淡的统一冷色染色，避免发灰
        color: widget.tint ??
            (widget.bright
                ? AppTheme.aquaDeep.withValues(alpha: 0.10)
                : AppTheme.aquaDeep.withValues(alpha: 0.05)),
        gradient: widget.bright
            ? AppTheme.glassVolumeBright
            : AppTheme.glassVolume,
        border: Border.all(
          color: widget.accent ??
              Colors.white.withValues(alpha: _pressed ? 0.22 : 0.10),
          width: widget.accent != null ? 1.3 : 0.8,
        ),
      ),
      child: Stack(
        children: [
          widget.child,
          if (widget.sheen)
            Positioned.fill(
              child: IgnorePointer(
                child: CustomPaint(
                  painter: _SheenPainter(radius: widget.radius),
                ),
              ),
            ),
        ],
      ),
    );

    // 可选真实模糊（默认关闭）
    if (widget.blur > 0) {
      content = ClipRRect(
        borderRadius: br,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: widget.blur, sigmaY: widget.blur),
          child: content,
        ),
      );
    }

    // 亮青描边（在最外层描一次清晰 rim）
    content = CustomPaint(
      painter: _RimPainter(radius: widget.radius, bright: widget.bright),
      child: content,
    );

    final interactive = widget.onTap != null;
    return GestureDetector(
      onTapDown: interactive ? (_) => setState(() => _pressed = true) : null,
      onTapUp: interactive ? (_) => setState(() => _pressed = false) : null,
      onTapCancel: interactive ? () => setState(() => _pressed = false) : null,
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: (interactive && _pressed) ? 0.97 : 1.0,
        duration: const Duration(milliseconds: Motion.micro),
        curve: Motion.press,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: Motion.micro),
          opacity: _pressed ? 1.06 : 1.0,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: br,
              boxShadow: widget.halo
                  ? [
                      // 冷青环境辉光
                      BoxShadow(
                        color: AppTheme.aquaBright
                            .withValues(alpha: widget.bright ? 0.22 : 0.13),
                        blurRadius: 18,
                        spreadRadius: 0.2,
                        offset: const Offset(0, 4),
                      ),
                      // Z 轴深色投影（浮起感）
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.34),
                        blurRadius: 14,
                        offset: const Offset(0, 6),
                      ),
                    ]
                  : null,
            ),
            child: content,
          ),
        ),
      ),
    );
  }
}

/// 顶部弧形扫光：一条从左到右由弱到强再弱的 1px 高光线，模拟玻璃受光面。
class _SheenPainter extends CustomPainter {
  final double radius;
  const _SheenPainter({required this.radius});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [
          Colors.white.withValues(alpha: 0.02),
          Colors.white.withValues(alpha: 0.30),
          Colors.white.withValues(alpha: 0.02),
        ],
      ).createShader(
        Rect.fromLTWH(0, 0.6, size.width, 1.2),
      );
    final rrect = RRect.fromRectAndRadius(
      Rect.fromLTWH(1, 0.8, size.width - 2, 1.1),
      Radius.circular(radius * 0.6),
    );
    canvas.drawRRect(rrect, paint);
  }

  @override
  bool shouldRepaint(covariant _SheenPainter old) => old.radius != radius;
}

/// 亮青 rim：沿圆角矩形内缘描一圈冷青亮边（左上边更亮、右下边转金）。
class _RimPainter extends CustomPainter {
  final double radius;
  final bool bright;
  const _RimPainter({required this.radius, this.bright = false});

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(0.6, 0.6, size.width - 1.2, size.height - 1.2);
    final rrect =
        RRect.fromRectAndRadius(rect, Radius.circular(radius));
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = bright ? 1.1 : 0.9
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: bright
            ? [
                const Color(0xE6A6F7FF),
                const Color(0x8A4FD8E6),
                AppTheme.goldMain.withValues(alpha: 0.55),
              ]
            : [
                Colors.white.withValues(alpha: 0.34),
                AppTheme.rimCyan.withValues(alpha: 0.40),
                AppTheme.goldMain.withValues(alpha: 0.30),
              ],
      ).createShader(rect);
    canvas.drawRRect(rrect, paint);
  }

  @override
  bool shouldRepaint(covariant _RimPainter old) =>
      old.radius != radius || old.bright != bright;
}

/// 玻璃小药丸（标签 / 芯片 / 小按钮）。
class LiquidPill extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final bool bright;
  final Color? tint;

  const LiquidPill({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    this.onTap,
    this.bright = false,
    this.tint,
  });

  @override
  Widget build(BuildContext context) {
    return LiquidGlass(
      radius: 999,
      padding: padding,
      halo: false,
      sheen: false,
      bright: bright,
      tint: tint,
      onTap: onTap,
      child: child,
    );
  }
}
