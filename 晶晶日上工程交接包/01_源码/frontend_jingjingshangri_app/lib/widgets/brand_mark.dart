import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'crystal_logo.dart';

/// V15.2 位图品牌标：Seedream 导出的「青玻璃方块 + 香槟金八芒星」材质，
/// 质感锚定已认可靶图。外圈带青色辉光，圆角与靶图一致；
/// 位图缺失时回退到代码版 [CrystalStar]，保证任何环境不白屏/不崩。
class BrandMark extends StatelessWidget {
  /// 方块边长
  final double size;

  /// 圆角占边长比例（squircle 观感）
  final double radiusRatio;

  /// 是否带青色环境辉光
  final bool glow;

  const BrandMark({
    super.key,
    required this.size,
    this.radiusRatio = 0.24,
    this.glow = true,
  });

  @override
  Widget build(BuildContext context) {
    final radius = size * radiusRatio;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: glow
            ? [
                BoxShadow(
                  color: AppTheme.aquaBright.withValues(alpha: 0.42),
                  blurRadius: 20,
                  spreadRadius: 0.5,
                  offset: const Offset(0, 4),
                ),
                BoxShadow(
                  color: AppTheme.goldMain.withValues(alpha: 0.14),
                  blurRadius: 16,
                  offset: const Offset(0, 2),
                ),
              ]
            : null,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: Image.asset(
          AppTheme.assetBrandMark,
          fit: BoxFit.cover,
          filterQuality: FilterQuality.medium,
          errorBuilder: (_, __, ___) => Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(radius),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF16384A), AppTheme.liquidDeep],
              ),
            ),
            child: Center(child: CrystalStar(size: size * 0.62)),
          ),
        ),
      ),
    );
  }
}
