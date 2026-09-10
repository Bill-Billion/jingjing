import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'motion_fx.dart';
import 'primary_button.dart';

/// 统一空态：图标 + 标题 + 副标题 + 可选操作按钮。
class EmptyView extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? actionText;
  final VoidCallback? onAction;
  final IconData? actionIcon;

  const EmptyView({
    super.key,
    this.icon = Icons.inbox,
    required this.title,
    this.subtitle,
    this.actionText,
    this.onAction,
    this.actionIcon,
  });

  @override
  Widget build(BuildContext context) {
    return FadeSlideIn(
      durationMs: 220,
      child: Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.04),
                border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.2)),
              ),
              child: Icon(icon, size: 36, color: AppTheme.textHint),
            ),
            const SizedBox(height: 16),
            Text(title,
                style: const TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 15,
                    fontWeight: FontWeight.w700)),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(subtitle!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppTheme.textHint, fontSize: 12.5, height: 1.5)),
            ],
            if (actionText != null && onAction != null) ...[
              const SizedBox(height: 18),
              PrimaryButton(
                label: actionText!,
                onPressed: onAction,
                icon: actionIcon,
                expand: false,
                height: 42,
              ),
            ],
          ],
        ),
      ),
    ));
  }
}

/// 统一错误态：可点击重试（次级玻璃描边胶囊，克制语义）。
class ErrorView extends StatelessWidget {
  final String? message;
  final VoidCallback? onRetry;
  final String retryText;
  const ErrorView({
    super.key,
    this.message,
    this.onRetry,
    this.retryText = '重新加载',
  });

  @override
  Widget build(BuildContext context) {
    return FadeSlideIn(
      durationMs: 220,
      child: Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_rounded, size: 48, color: AppTheme.textHint),
            const SizedBox(height: 12),
            const Text('加载失败',
                style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(message ?? '请检查网络后重试',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppTheme.textHint, fontSize: 12.5)),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              PrimaryButton(
                label: retryText,
                onPressed: onRetry,
                icon: Icons.refresh_rounded,
                isSecondary: true,
                expand: false,
                height: 42,
              ),
            ],
          ],
        ),
      ),
    ));
  }
}

/// 统一加载态：曜石金细圈居中，可带一行克制提示文案。
/// 与 EmptyView / ErrorView 成套，替代各页手写的 Center+CircularProgressIndicator。
class LoadingView extends StatelessWidget {
  /// 可选提示（如“正在同步订单…”），不传则只显示转圈。
  final String? message;

  /// 转圈直径。
  final double size;

  const LoadingView({super.key, this.message, this.size = 36});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: size,
            height: size,
            child: const CircularProgressIndicator(
                color: AppTheme.goldMain, strokeWidth: 2.4),
          ),
          if (message != null) ...[
            const SizedBox(height: 12),
            Text(message!,
                style: const TextStyle(
                    color: AppTheme.textHint, fontSize: 12.5, height: 1.4)),
          ],
        ],
      ),
    );
  }
}
