import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'press_scale.dart';

/// V15 金刚区/圆形入口统一「玻璃圆芯」：半透玻璃圆 + 顶部内高光 + 金色线性符号。
/// 替代旧的「实心金圆底」（档案21 §三.7、§五）。预乘半透纯色，不做实时模糊。
class GlassIconCore extends StatelessWidget {
  final IconData icon;
  final double size; // 圆直径
  final double? iconSize;
  final Color? iconColor;
  final Color? fill;

  const GlassIconCore({
    super.key,
    required this.icon,
    this.size = 52,
    this.iconSize,
    this.iconColor,
    this.fill,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        // V15.1 青玻璃圆芯：冷青体积渐变 + 青 rim + 微环境辉光（fill 非空时用纯色）
        color: fill,
        gradient: fill == null
            ? const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0x33FFFFFF),
                  Color(0x167FD4E0),
                  Color(0x0A3FA9C0),
                ],
              )
            : null,
        border: Border.all(
          color: AppTheme.rimCyan.withValues(alpha: 0.45),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.aquaBright.withValues(alpha: 0.18),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.30),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // 顶部弧形内高光
          Positioned(
            top: 1,
            left: size * 0.18,
            right: size * 0.18,
            height: 1,
            child: ColoredBox(
              color: Colors.white.withValues(alpha: 0.16),
            ),
          ),
          Icon(
            icon,
            size: iconSize ?? size * 0.46,
            color: iconColor ?? AppTheme.iceHighlight,
          ),
        ],
      ),
    );
  }
}

/// 第三方登录统一「玻璃描边单色圆」：glyph 单色，不使用原生彩色大块（档案21 §三.7）。
class GlassCircleButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final double size;

  const GlassCircleButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.size = 46,
  });

  @override
  Widget build(BuildContext context) {
    return PressScale(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Column(
        children: [
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0x1FFFFFFF), Color(0x0F7FD4E0)],
              ),
              border: Border.all(
                color: AppTheme.rimCyan.withValues(alpha: 0.3),
                width: 1,
              ),
            ),
            child:
                Icon(icon, color: AppTheme.textSecondary, size: size * 0.48),
          ),
          const SizedBox(height: 6),
          Text(label,
              style: const TextStyle(
                  color: AppTheme.textSecondary, fontSize: 11)),
        ],
      ),
    );
  }
}
