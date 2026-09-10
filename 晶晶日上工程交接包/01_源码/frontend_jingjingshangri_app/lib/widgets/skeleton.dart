import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../utils/motion.dart';

/// 骨架屏微光块：加载时替代转圈，避免页面突然跳动。
class Skeleton extends StatefulWidget {
  final double? width;
  final double? height;
  final BorderRadius? radius;
  final BoxShape shape;

  const Skeleton({
    super.key,
    this.width,
    this.height,
    this.radius,
    this.shape = BoxShape.rectangle,
  });

  /// 一行文本骨架。
  factory Skeleton.line({double width = 120, double height = 12}) =>
      Skeleton(width: width, height: height, radius: BorderRadius.circular(6));

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton>
    with SingleTickerProviderStateMixin {
  // V15：玻璃骨架微光循环，周期统一取动效 SSOT Motion.shimmer（档案21 §五、档案14 §二.1）
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: const Duration(milliseconds: Motion.shimmer))
        ..repeat(reverse: true);

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final radius = widget.radius ?? BorderRadius.circular(10);
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final t = _ctrl.value;
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            shape: widget.shape,
            borderRadius: widget.shape == BoxShape.circle ? null : radius,
            gradient: LinearGradient(
              begin: Alignment(-1.2 + t * 0.8, 0),
              end: Alignment(1.2 + t * 0.8, 0),
              colors: [
                Colors.white.withValues(alpha: 0.05),
                Colors.white.withValues(alpha: 0.11 + 0.04 * t),
                Colors.white.withValues(alpha: 0.05),
              ],
            ),
            border: Border.all(color: AppTheme.border.withValues(alpha: 0.5)),
          ),
        );
      },
    );
  }
}

/// 艺人/海报网格的骨架占位。
class HumanGridSkeleton extends StatelessWidget {
  const HumanGridSkeleton({super.key, this.count = 6});
  final int count;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 0.70,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: count,
      itemBuilder: (_, __) => Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: AppTheme.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppTheme.glassBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Expanded(child: Skeleton(width: double.infinity)),
            const SizedBox(height: 10),
            Skeleton.line(width: 70),
            const SizedBox(height: 6),
            Skeleton.line(width: 110, height: 10),
          ],
        ),
      ),
    );
  }
}
