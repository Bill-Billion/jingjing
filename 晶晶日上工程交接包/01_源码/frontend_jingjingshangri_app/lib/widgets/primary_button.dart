import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'press_scale.dart';
import '../utils/motion.dart';
import '../utils/haptics.dart';

/// 按钮状态机：默认 / 按下(PressScale 统一) / 禁用 / 加载 / 成功 / 失败。
enum ButtonState { idle, disabled, loading, success, errorState }

/// 「追光」唯一主按钮组件。
/// - 提交中（loading）自动防重复点击；
/// - success 展示对勾微光后回调 [onSuccessShown]（如进入下一步）；
/// - errorState 展示失败样式，点击可重试（仍走 onPressed）。
class PrimaryButton extends StatefulWidget {
  final String label;
  final VoidCallback? onPressed;
  final ButtonState state;
  final IconData? icon;
  final double height;
  final bool expand;
  final bool isSecondary;
  final String? successText;
  final String? errorText;
  final VoidCallback? onSuccessShown;

  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.state = ButtonState.idle,
    this.icon,
    this.height = 50,
    this.expand = true,
    this.isSecondary = false,
    this.successText,
    this.errorText,
    this.onSuccessShown,
  });

  @override
  State<PrimaryButton> createState() => _PrimaryButtonState();
}

class _PrimaryButtonState extends State<PrimaryButton> {
  @override
  void didUpdateWidget(covariant PrimaryButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.state == ButtonState.success &&
        oldWidget.state != ButtonState.success) {
      Haptics.success();
      Future.delayed(const Duration(milliseconds: 900), () {
        if (mounted) widget.onSuccessShown?.call();
      });
    }
  }

  bool get _busy => widget.state == ButtonState.loading;
  bool get _disabled =>
      widget.onPressed == null ||
      widget.state == ButtonState.disabled ||
      _busy ||
      widget.state == ButtonState.success;

  @override
  Widget build(BuildContext context) {
    final disabled = _disabled;
    final success = widget.state == ButtonState.success;
    final failed = widget.state == ButtonState.errorState;

    // V15.1：主按钮=香槟金渐变立体胶囊（顶部内高光 + 底部厚度 + 辉光）；次级=玻璃描边。
    final bool showSheen =
        !widget.isSecondary && !disabled && !failed && !success;
    final Widget inner = AnimatedContainer(
      duration: const Duration(milliseconds: Motion.short),
      curve: Motion.inOut,
      height: widget.height,
      width: widget.expand ? double.infinity : null,
      alignment: Alignment.center,
      padding: EdgeInsets.symmetric(horizontal: widget.expand ? 16 : 22),
      decoration: BoxDecoration(
        gradient: widget.isSecondary
            ? null
            : (disabled
                ? LinearGradient(colors: [
                    const Color(0xFFF4E3B4).withValues(alpha: 0.30),
                    const Color(0xFFD9B873).withValues(alpha: 0.30),
                  ])
                : failed
                    ? const LinearGradient(colors: [AppTheme.error, AppTheme.errorStrong])
                    : AppTheme.ctaGradient),
        color: widget.isSecondary
            ? (disabled
                ? Colors.white.withValues(alpha: 0.04)
                : Colors.white.withValues(alpha: 0.08))
            : null,
        borderRadius: BorderRadius.circular(999),
        border: widget.isSecondary
            ? Border.all(
                color: disabled
                    ? AppTheme.border
                    : AppTheme.goldMain.withValues(alpha: 0.45))
            : Border.all(
                color: success
                    ? AppTheme.successLight
                    : Colors.white.withValues(alpha: 0.10)),
        boxShadow: (!disabled && !failed && !widget.isSecondary)
            ? [
                ...AppTheme.ctaGlow,
                // 底部金色厚度，强化立体胶囊
                BoxShadow(
                  color: AppTheme.goldDeep.withValues(alpha: 0.45),
                  blurRadius: 2,
                  offset: const Offset(0, 2),
                ),
              ]
            : null,
      ),
      child: Stack(
        children: [
          if (showSheen)
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.white.withValues(alpha: 0.32),
                        Colors.white.withValues(alpha: 0.06),
                        Colors.transparent,
                      ],
                      stops: const [0, 0.42, 1],
                    ),
                  ),
                ),
              ),
            ),
          Center(child: _buildContent(disabled, success, failed)),
        ],
      ),
    );

    final tappable = PressScale(
      onTap: _disabled ? null : widget.onPressed,
      borderRadius: BorderRadius.circular(999),
      child: inner,
    );
    return widget.expand ? SizedBox(width: double.infinity, child: tappable) : tappable;
  }

  Widget _buildContent(bool disabled, bool success, bool failed) {
    if (_busy) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 18, height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: widget.isSecondary ? AppTheme.goldLight : AppTheme.onGold,
            ),
          ),
          const SizedBox(width: 10),
          Text('提交中…',
              style: TextStyle(
                color: widget.isSecondary ? AppTheme.textSecondary : AppTheme.onGold,
                fontSize: 15,
                fontWeight: FontWeight.w800,
                letterSpacing: 1,
              )),
        ],
      );
    }
    if (success) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.check_circle_rounded, color: Colors.white, size: 19),
          const SizedBox(width: 8),
          Text(widget.successText ?? '成功',
              style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800)),
        ],
      );
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.icon != null) ...[
          Icon(widget.icon,
              size: 19,
              color: failed
                  ? Colors.white
                  : (widget.isSecondary
                      ? (disabled ? AppTheme.textHint : AppTheme.goldLight)
                      : (disabled ? AppTheme.onGold.withValues(alpha: 0.6) : AppTheme.onGold))),
          const SizedBox(width: 8),
        ],
        Flexible(
          child: Text(
            failed ? (widget.errorText ?? '失败，点击重试') : widget.label,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: failed
                  ? Colors.white
                  : (widget.isSecondary
                      ? (disabled ? AppTheme.textHint : AppTheme.goldLight)
                      : (disabled ? AppTheme.onGold.withValues(alpha: 0.6) : AppTheme.onGold)),
              fontSize: 15.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.5,
            ),
          ),
        ),
      ],
    );
  }
}
