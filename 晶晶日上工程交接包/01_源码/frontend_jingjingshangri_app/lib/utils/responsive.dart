import 'dart:ui' show DisplayFeatureType;
import 'package:flutter/material.dart';

/// 屏幕尺寸档位
/// compact  <600  ：普通手机竖屏（底部导航、单列/双列网格）
/// medium   600~839：大手机、折叠屏外屏、横屏（侧边导航、三列网格）
/// expanded >=840 ：折叠屏展开、平板（侧边导航+宽内容、四/五列网格）
enum ScreenSize { compact, medium, expanded }

/// 全局响应式工具：统一断点、网格列数、折叠铰链避让、内容限宽。
class Responsive {
  static const double compactMax = 600;
  static const double mediumMax = 840;
  static const double contentLimit = 1100; // 超大屏内容最大宽度，避免拉变形

  static double widthOf(BuildContext context) => MediaQuery.sizeOf(context).width;
  static double heightOf(BuildContext context) => MediaQuery.sizeOf(context).height;

  static ScreenSize sizeOf(BuildContext context) {
    final w = widthOf(context);
    if (w < compactMax) return ScreenSize.compact;
    if (w < mediumMax) return ScreenSize.medium;
    return ScreenSize.expanded;
  }

  static bool isCompact(BuildContext context) => widthOf(context) < compactMax;
  static bool isMedium(BuildContext context) {
    final w = widthOf(context);
    return w >= compactMax && w < mediumMax;
  }

  static bool isExpanded(BuildContext context) => widthOf(context) >= mediumMax;

  /// 中/大屏使用左侧 NavigationRail，小屏使用底部导航
  static bool useRail(BuildContext context) => widthOf(context) >= compactMax;

  /// 艺人/卡片网格列数，随宽度自适应
  static int gridColumns(BuildContext context, {int compact = 2}) {
    final w = widthOf(context);
    if (w >= 1280) return 5;
    if (w >= mediumMax) return 4;
    if (w >= compactMax) return 3;
    return compact;
  }

  /// 卡片宽高比随宽度微调，避免大屏卡片过高
  static double childAspectRatio(BuildContext context, {double compact = 0.72}) {
    final w = widthOf(context);
    if (w >= mediumMax) return 0.80;
    if (w >= compactMax) return 0.76;
    return compact;
  }

  /// 内容水平内边距随屏幕增大
  static EdgeInsets pagePadding(BuildContext context, {double base = 16}) {
    if (isExpanded(context)) return const EdgeInsets.symmetric(horizontal: 32);
    if (isMedium(context)) return const EdgeInsets.symmetric(horizontal: 24);
    return EdgeInsets.symmetric(horizontal: base);
  }

  /// 是否存在折叠铰链
  static bool hasHinge(BuildContext context) => MediaQuery.of(context)
      .displayFeatures
      .any((f) => f.type == DisplayFeatureType.hinge);

  /// 折叠展开为双页时，铰链两侧留白，避免内容被铰链遮挡
  static EdgeInsets hingePadding(BuildContext context) {
    final mq = MediaQuery.of(context);
    double left = 0, right = 0;
    for (final f in mq.displayFeatures) {
      if (f.type != DisplayFeatureType.hinge) continue;
      final center = f.bounds.left + f.bounds.width / 2;
      if (center < mq.size.width / 2) {
        left = f.bounds.right;
      } else {
        right = mq.size.width - f.bounds.left;
      }
    }
    return EdgeInsets.only(left: left, right: right);
  }
}

/// 超大屏内容居中限宽容器，避免横向过度拉伸
class ContentConstraint extends StatelessWidget {
  final Widget child;
  final double maxWidth;
  final bool center;
  const ContentConstraint({
    super.key,
    required this.child,
    this.maxWidth = Responsive.contentLimit,
    this.center = true,
  });

  @override
  Widget build(BuildContext context) {
    if (Responsive.widthOf(context) < Responsive.mediumMax) return child;
    return Align(
      alignment: center ? Alignment.topCenter : Alignment.topLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: child,
      ),
    );
  }
}

/// 限制系统字体放大倍数，避免超大字体在小屏溢出；超出按比例收敛而非撑破布局
class LimitedTextScale extends StatelessWidget {
  final Widget child;
  final double minScale;
  final double maxScale;
  const LimitedTextScale({
    super.key,
    required this.child,
    this.minScale = 0.85,
    this.maxScale = 1.15,
  });

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final scale = mq.textScaler.scale(1).clamp(minScale, maxScale);
    return MediaQuery(
      data: mq.copyWith(textScaler: TextScaler.linear(scale)),
      child: child,
    );
  }
}
