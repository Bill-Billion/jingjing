import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'crystal_logo.dart';

/// V15.1 青金虹彩「玻璃气泡」中央创作键（靶图语言）。
/// 深色青玻璃气泡 + 缓慢流动的 Sweep 虹彩描边/内晕 + 顶部高光弧 +
/// 中心发光晶簇；带轻微上下浮动与按压缩放。
class IrisOrb extends StatefulWidget {
  final double size;
  final VoidCallback onTap;
  final Widget? center; // 自定义中心，默认发光晶簇
  const IrisOrb({
    super.key,
    this.size = 58,
    required this.onTap,
    this.center,
  });

  @override
  State<IrisOrb> createState() => _IrisOrbState();
}

class _IrisOrbState extends State<IrisOrb>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  bool _pressed = false;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 6),
    )..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, __) {
          final v = _c.value;
          final float = math.sin(v * 2 * math.pi) * 2.0;
          return Transform.translate(
            offset: Offset(0, float),
            child: AnimatedScale(
              scale: _pressed ? 0.9 : 1,
              duration: const Duration(milliseconds: 120),
              curve: Curves.easeOut,
              child: SizedBox(
                width: widget.size,
                height: widget.size,
                // RepaintBoundary：虹彩自绘含 saveLayer+多层模糊且 6s 无限旋转，
                // 独立成层后不牵连所在页面重绘。
                child: RepaintBoundary(
                  child: CustomPaint(
                    painter: _IrisPainter(v, widget.size),
                    child: Center(
                      child: widget.center ??
                          CrystalStar(size: widget.size * 0.58, breathe: false),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _IrisPainter extends CustomPainter {
  final double t;
  final double diameter;
  _IrisPainter(this.t, this.diameter);

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2;
    final rect = Rect.fromCircle(center: c, radius: r);
    Shader irisShader(Rect rr) => SweepGradient(
          // 与 AppTheme.irisSweep 同色板，此处需带旋转 transform
          colors: const [
            Color(0xFF7FD4E0),
            Color(0xFFE6C586),
            Color(0xFF93A2EC),
            Color(0xFF5FD8E6),
            Color(0xFF7FD4E0),
          ],
          stops: const [0.0, 0.32, 0.62, 0.85, 1.0],
          transform: GradientRotation(t * 2 * math.pi),
        ).createShader(rr);

    // 外发光（青 + 金双层，更亮）
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..color = AppTheme.aquaBright.withValues(alpha: 0.42)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14),
    );
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..color = AppTheme.goldMain.withValues(alpha: 0.16)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 20),
    );

    // 深色青玻璃球体（顶部更亮，做出气泡体积）
    final body = Paint()
      ..shader = const RadialGradient(
        center: Alignment(-0.3, -0.55),
        radius: 1.15,
        colors: [Color(0xFF2E6B8C), Color(0xFF10304A), Color(0xFF0A1A2A)],
        stops: [0, 0.55, 1],
      ).createShader(rect);
    canvas.drawCircle(c, r - 1, body);

    canvas.save();
    canvas.clipPath(Path()..addOval(Rect.fromCircle(center: c, radius: r - 1)));

    // 流动虹彩内晕（screen 混合，提亮成青金虹彩）
    canvas.saveLayer(rect, Paint()..blendMode = BlendMode.screen);
    final irisFill = Paint()
      ..shader = irisShader(rect)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
    canvas.drawCircle(c, r - 3, irisFill);
    final irisSoft = Paint()..shader = irisShader(rect);
    canvas.drawCircle(c, r - 6, irisSoft);
    canvas.restore();

    // 中心辉光（晶簇背后的亮核）
    final coreHalo = Paint()
      ..shader = RadialGradient(
        colors: [
          Colors.white.withValues(alpha: 0.55),
          AppTheme.goldLight.withValues(alpha: 0.28),
          Colors.transparent,
        ],
        stops: const [0, 0.45, 1],
      ).createShader(Rect.fromCircle(center: c, radius: r * 0.5));
    canvas.drawCircle(c, r * 0.44, coreHalo);

    // 顶部高光弧
    final sheen = Paint()
      ..shader = const RadialGradient(
        center: Alignment(-0.35, -0.7),
        radius: 0.7,
        colors: [Color(0x77FFFFFF), Color(0x00FFFFFF)],
      ).createShader(rect);
    canvas.drawCircle(c, r - 2, sheen);
    canvas.restore();

    // 流动虹彩描边
    final rim = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2
      ..shader = irisShader(rect);
    canvas.drawCircle(c, r - 1.4, rim);
    // 内侧一圈青亮边
    final inner = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.9
      ..color = Colors.white.withValues(alpha: 0.45);
    canvas.drawCircle(c, r - 3.6, inner);
  }

  @override
  bool shouldRepaint(covariant _IrisPainter old) =>
      (old.t - t).abs() > 0.003 || old.diameter != diameter;
}
