import 'package:flutter/material.dart';
import '../utils/motion.dart';
import '../utils/haptics.dart';

/// 全局统一按压反馈：按下 0.97 + 120ms easeOut（档案14 §二）。
/// onTap 为 null 时自动进入禁用态，不响应、不缩放。
class PressScale extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final double scale;
  final BorderRadius? borderRadius;

  const PressScale({
    super.key,
    required this.child,
    required this.onTap,
    this.onLongPress,
    this.scale = 0.97,
    this.borderRadius,
  });

  @override
  State<PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<PressScale> {
  bool _pressed = false;

  bool get _enabled => widget.onTap != null || widget.onLongPress != null;

  void _setPressed(bool v) {
    if (!_enabled) return;
    if (_pressed != v) setState(() => _pressed = v);
  }

  // 统一点按：先给一记极轻系统 tick，再执行业务回调（业务逻辑零改动）。
  void _handleTap() {
    Haptics.tick();
    widget.onTap?.call();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _setPressed(true),
      onTapUp: (_) => _setPressed(false),
      onTapCancel: () => _setPressed(false),
      onTap: widget.onTap == null ? null : _handleTap,
      onLongPress: widget.onLongPress,
      child: AnimatedScale(
        scale: _pressed ? widget.scale : 1.0,
        duration: const Duration(milliseconds: Motion.micro),
        curve: Motion.press,
        child: widget.child,
      ),
    );
  }
}
