import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// V15 品牌 Logo：日出八芒星光束（一束主光最粗最长 + 对称辅光）。
/// 纯 [CustomPaint] 矢量绘制，24–48px 小尺寸不糊；不依赖任何位图（档案21 §四）。
/// - [SunriseLogoPainter]：单色光束（gold 单色版 / 导航栏/水印/小尺寸）；
/// - [BrandLogo.glass]：曜石径向底 + 香槟金光束 + 极淡冷青玻璃轮廓光（启动/登录/应用图标）；
/// - [BrandLockup]：图形 + 中文字标「晶晶日上」+ 英文 JINGJING RISING（文字排版，非位图）。
class SunriseLogoPainter extends CustomPainter {
  /// 光束颜色（单色版传 gold/main）。
  final Color color;

  /// 主光束是否比其他轴光束更长更粗（默认是）。
  final bool emphasizeMain;

  const SunriseLogoPainter({
    required this.color,
    this.emphasizeMain = true,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.width / 2;
    final center = Offset(c, size.height / 2);
    final beamPaint = Paint()
      ..color = color
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    Offset radial(double angle, double r) => Offset(
          center.dx + r * math.cos(angle),
          center.dy + r * math.sin(angle),
        );

    void beam(double angle, double inner, double outer, double width) {
      beamPaint.strokeWidth = width;
      canvas.drawLine(radial(angle, inner), radial(angle, outer), beamPaint);
    }

    final s = size.width;
    // 四轴光束（上为主光：最粗最长）
    final cardinal = [
      -math.pi / 2, // 上·主光
      0.0, // 右
      math.pi / 2, // 下
      math.pi, // 左
    ];
    for (var i = 0; i < cardinal.length; i++) {
      final isMain = emphasizeMain && i == 0;
      beam(
        cardinal[i],
        s * 0.13,
        s * (isMain ? 0.46 : 0.37),
        s * (isMain ? 0.075 : 0.052),
      );
    }
    // 四条对角辅光（更短更细，保证小尺寸不糊成一团）
    final diagonal = [-math.pi / 4, math.pi / 4, 3 * math.pi / 4, -3 * math.pi / 4];
    for (final a in diagonal) {
      beam(a, s * 0.12, s * 0.27, s * 0.038);
    }
    // 中心旭日小圆盘
    final disc = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, s * 0.085, disc);
  }

  @override
  bool shouldRepaint(covariant SunriseLogoPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.emphasizeMain != emphasizeMain;
}

/// 单色光束 Logo（gold/main，用于导航栏、水印、小尺寸、单色场景）。
class MonochromeLogo extends StatelessWidget {
  final double size;
  final Color? color;
  const MonochromeLogo({super.key, this.size = 28, this.color});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size.square(size),
      painter: SunriseLogoPainter(color: color ?? AppTheme.goldMain),
    );
  }
}

/// 玻璃版品牌 Logo：曜石径向底 + 香槟金光束 + 极淡冷青轮廓光。
class BrandLogo extends StatelessWidget {
  final double size;

  /// circle=应用/启动圆形徽标；rounded=应用图标方形安全区（阶段三导出用）。
  final BoxShape shape;
  final bool showRimLight;

  const BrandLogo({
    super.key,
    this.size = 76,
    this.shape = BoxShape.circle,
    this.showRimLight = true,
  });

  /// 单色 gold 版便捷构造。
  const BrandLogo.monochrome({super.key, this.size = 28})
      : shape = BoxShape.circle,
        showRimLight = false;

  @override
  Widget build(BuildContext context) {
    if (!showRimLight) {
      return MonochromeLogo(size: size);
    }
    final radius = BorderRadius.circular(size * 0.28);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: shape,
        borderRadius: shape == BoxShape.circle ? null : radius,
        gradient: const RadialGradient(
          center: Alignment(-0.15, -0.25),
          radius: 1.05,
          colors: [Color(0xFF1B2440), AppTheme.surfaceDark, AppTheme.background],
          stops: [0.0, 0.55, 1.0],
        ),
        // 极淡冷青玻璃轮廓光（面积克制，不发蓝发飘）
        border: Border.all(
          color: AppTheme.cyanSoft.withValues(alpha: 0.22),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.cyanSoft.withValues(alpha: 0.10),
            blurRadius: 18,
            spreadRadius: 0,
          ),
          ...AppTheme.elev1Shadow,
        ],
      ),
      alignment: Alignment.center,
      child: CustomPaint(
        size: Size.square(size * 0.56),
        painter: const SunriseLogoPainter(color: AppTheme.goldLight),
      ),
    );
  }
}

/// 品牌字标组合：图形 + 「晶晶日上」+ JINGJING RISING（纯文字排版，不靠位图）。
class BrandLockup extends StatelessWidget {
  final double logoSize;
  final bool glassLogo;
  final MainAxisAlignment alignment;
  final Color? titleColor;
  final bool showEnglish;
  final double gap;

  const BrandLockup({
    super.key,
    this.logoSize = 40,
    this.glassLogo = true,
    this.alignment = MainAxisAlignment.center,
    this.titleColor,
    this.showEnglish = true,
    this.gap = 10,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: alignment,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        glassLogo
            ? BrandLogo(size: logoSize)
            : MonochromeLogo(size: logoSize),
        SizedBox(width: gap),
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '晶晶日上',
              style: TextStyle(
                color: titleColor ?? AppTheme.textPrimary,
                fontSize: logoSize * 0.52,
                fontWeight: FontWeight.w800,
                letterSpacing: 2,
              ),
            ),
            if (showEnglish)
              Text(
                'JINGJING RISING',
                style: TextStyle(
                  color: AppTheme.goldMain,
                  fontSize: logoSize * 0.18,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2.4,
                ),
              ),
          ],
        ),
      ],
    );
  }
}
