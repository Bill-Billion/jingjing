import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// V15.1「玻璃晶簇光束」星芒 Painter。
/// 16 芒 = 4 主轴（最长最亮）+ 4 对角 + 8 细芒；香槟金光束、中心亮核、
/// 多层 bloom 辉光与外放射光线。纯绘制，小尺寸下依然锐利耀眼（靶图语言）。
class CrystalStarPainter extends CustomPainter {
  final double glow; // 辉光强度 0..1
  final Color core;
  final Color mid;
  final Color edge;

  const CrystalStarPainter({
    this.glow = 1,
    this.core = const Color(0xFFFFF6DC),
    this.mid = AppTheme.goldLight,
    this.edge = AppTheme.goldDeep,
  });

  void _beam(Canvas c, double a, double len, double rootW, Paint paint,
      {Shader? shader}) {
    final dx = math.cos(a), dy = math.sin(a);
    final px = -dy, py = dx; // 垂直方向
    final p = Path()
      ..moveTo(px * rootW, py * rootW)
      ..lineTo(dx * len, dy * len)
      ..lineTo(-px * rootW, -py * rootW)
      ..close();
    final fill = Paint()
      ..style = PaintingStyle.fill
      ..color = paint.color
      ..maskFilter = paint.maskFilter
      ..shader = shader;
    c.drawPath(p, fill);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2, cy = size.height / 2;
    canvas.translate(cx, cy);
    final R = size.shortestSide / 2;

    // 外放射淡光线（8 条，延伸到容器边）
    final ray = Paint()
      ..color = AppTheme.cyanSoft.withValues(alpha: 0.16 * glow)
      ..strokeWidth = 1
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.2);
    for (var i = 0; i < 8; i++) {
      final a = i * math.pi / 4;
      canvas.drawLine(Offset(math.cos(a) * R * 0.62, math.sin(a) * R * 0.62),
          Offset(math.cos(a) * R * 0.98, math.sin(a) * R * 0.98), ray);
    }

    // bloom 柔光层（整体金色辉光）
    final bloom = Paint()
      ..color = AppTheme.goldMain.withValues(alpha: 0.30 * glow)
      ..maskFilter = MaskFilter.blur(BlurStyle.normal, R * 0.10);
    for (var i = 0; i < 16; i++) {
      final a = i * math.pi / 8;
      final main = i % 2 == 0;
      final diag = i % 4 == 0;
      final len = diag ? R * 0.92 : (main ? R * 0.66 : R * 0.5);
      _beam(canvas, a, len, R * 0.05, bloom);
    }

    // 清晰光束层（中心亮 → 尖端金，逐根渐变）
    for (var i = 0; i < 16; i++) {
      final a = i * math.pi / 8;
      final main = i % 2 == 0;
      final diag = i % 4 == 0;
      final len = diag ? R * 0.9 : (main ? R * 0.64 : R * 0.48);
      final rootW = diag ? R * 0.045 : R * 0.028;
      final dx = math.cos(a), dy = math.sin(a);
      final shader = LinearGradient(
        begin: Alignment.center,
        end: Alignment(dx, dy),
        colors: [core, mid, edge.withValues(alpha: 0.0)],
        stops: const [0, 0.55, 1],
      ).createShader(Rect.fromCircle(center: Offset.zero, radius: len));
      _beam(canvas, a, len, rootW, Paint(), shader: shader);
    }

    // 中心亮核（辉光 + 实核）
    final coreGlow = Paint()
      ..shader = RadialGradient(colors: [
        Colors.white.withValues(alpha: 0.9 * glow),
        AppTheme.goldLight.withValues(alpha: 0.35 * glow),
        Colors.transparent,
      ], stops: const [
        0,
        0.4,
        1
      ]).createShader(Rect.fromCircle(center: Offset.zero, radius: R * 0.5));
    canvas.drawCircle(Offset.zero, R * 0.5, coreGlow);
    final dot = Paint()
      ..shader = const RadialGradient(colors: [
        Color(0xFFFFFFFF),
        Color(0xFFFBEFCB),
        Color(0xFFE6C586),
      ]).createShader(Rect.fromCircle(center: Offset.zero, radius: R * 0.16));
    canvas.drawCircle(Offset.zero, R * 0.15, dot);
  }

  @override
  bool shouldRepaint(covariant CrystalStarPainter old) =>
      (old.glow - glow).abs() > 0.01;
}

/// 纯晶簇星芒（无玻璃容器，用于导航/小尺寸/加载）。
class CrystalStar extends StatelessWidget {
  final double size;
  final bool breathe;
  const CrystalStar({super.key, required this.size, this.breathe = false});

  @override
  Widget build(BuildContext context) {
    if (!breathe) {
      return SizedBox(
          width: size,
          height: size,
          child: CustomPaint(painter: const CrystalStarPainter()));
    }
    return _Breathe(
      size: size,
      builder: (v) => SizedBox(
        width: size,
        height: size,
        child: CustomPaint(painter: CrystalStarPainter(glow: 0.85 + v * 0.3)),
      ),
    );
  }
}

/// 完整品牌标：液态玻璃圆角方块 + 发光 16 芒晶簇（带缓慢呼吸）。
class CrystalLogo extends StatefulWidget {
  final double size;
  final bool animate;
  final double radiusRatio;
  const CrystalLogo({
    super.key,
    required this.size,
    this.animate = true,
    this.radiusRatio = 0.28,
  });

  @override
  State<CrystalLogo> createState() => _CrystalLogoState();
}

class _CrystalLogoState extends State<CrystalLogo>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3200),
    );
    if (widget.animate) _c.repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final radius = widget.size * widget.radiusRatio;
    Widget box(double glow, double scale) {
      return Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF16324A), Color(0xFF0B1A2C), Color(0xFF0A1422)],
            stops: [0, 0.55, 1],
          ),
          border: Border.all(
            color: AppTheme.rimCyan.withValues(alpha: 0.5 + glow * 0.3),
            width: 1.3,
          ),
          boxShadow: [
            BoxShadow(
              color: AppTheme.aquaBright.withValues(alpha: 0.32 + glow * 0.16),
              blurRadius: 24 + glow * 12,
              spreadRadius: 0.8,
            ),
            BoxShadow(
              color: AppTheme.goldMain.withValues(alpha: 0.12 + glow * 0.08),
              blurRadius: 18,
            ),
            const BoxShadow(color: Color(0x66000000), blurRadius: 16, offset: Offset(0, 8)),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(radius),
          child: Stack(
            children: [
              // 顶部玻璃高光
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                height: widget.size * 0.4,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Colors.white.withValues(alpha: 0.22),
                        Colors.white.withValues(alpha: 0.02),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
              Center(
                child: Transform.scale(
                  scale: 0.72 * scale,
                  child: SizedBox(
                    width: widget.size,
                    height: widget.size,
                    child: CustomPaint(
                        painter: CrystalStarPainter(glow: 0.85 + glow * 0.3)),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (!widget.animate) return box(0.4, 1);
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) {
        final v = Curves.easeInOut.transform(_c.value);
        return box(v, 1 + v * 0.05);
      },
    );
  }
}

/// 通用呼吸包装（0..1 往返）。
class _Breathe extends StatefulWidget {
  final double size;
  final Widget Function(double v) builder;
  const _Breathe({required this.size, required this.builder});

  @override
  State<_Breathe> createState() => _BreatheState();
}

class _BreatheState extends State<_Breathe>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  @override
  void initState() {
    super.initState();
    _c = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 2800))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) =>
          widget.builder(Curves.easeInOut.transform(_c.value)),
    );
  }
}
