import 'package:flutter/material.dart';

/// 「追光」统一动效常量（SSOT，档案14 §二）。
/// 全 App 禁止随手写魔法数字时长/曲线，一律引用此处。
class Motion {
  Motion._();

  // ── 时长（毫秒）──
  /// 微交互：按钮按压、勾选、点赞、开关
  static const int micro = 120;

  /// 组件内变化：颜色/透明度/小位移、SnackBar
  static const int short = 200;

  /// 卡片/弹层/底部 Sheet 入场、下拉刷新
  static const int sheet = 300;

  /// 整页右进左出（push 详情/下单）
  static const int page = 340;

  /// 模态全屏页（登录、创建数字人、支付）
  static const int modal = 420;

  /// 离场比入场短约 1/3
  static const int pageOut = 220;

  /// Tab 切换交叉淡入
  static const int tab = 150;

  /// 骨架微光/Loading 循环
  static const int shimmer = 1300;

  /// 宽屏（≥600dp）同类型 +50ms
  static int adjusted(BuildContext context, int base) =>
      MediaQuery.sizeOf(context).width >= 600 ? base + 50 : base;

  // ── 全 App 仅用这 4 条曲线 ──
  /// 入场/进入：快进轻落
  static const Curve easeOut = Curves.easeOutCubic;

  /// 离场/退出：慢起快收
  static const Curve easeIn = Curves.easeInCubic;

  /// 屏内位移/尺寸/颜色变化
  static const Curve inOut = Curves.easeInOutCubic;

  /// 按压反馈
  static const Curve press = Curves.easeOut;

  /// 是否应弱化动效（系统“减少动态效果”）
  static bool reduced(BuildContext context) =>
      MediaQuery.disableAnimationsOf(context);

  /// 统一页面时长（尊重系统减少动态设置，弱化时 ≤100ms）
  static Duration pageDuration(BuildContext context) => Duration(
      milliseconds: reduced(context) ? 90 : adjusted(context, page));

  static Duration modalDuration(BuildContext context) => Duration(
      milliseconds: reduced(context) ? 100 : adjusted(context, modal));

  /// 进入下一级：新页从右侧 8% 位移 + 淡入（层级越深越往右）。
  static Route<T> fadeSlideRoute<T>(Widget target, {bool fullscreen = false}) {
    return PageRouteBuilder<T>(
      fullscreenDialog: fullscreen,
      transitionDuration: const Duration(milliseconds: page),
      reverseTransitionDuration: const Duration(milliseconds: pageOut),
      pageBuilder: (_, __, ___) => target,
      transitionsBuilder: (_, anim, __, child) {
        final curved = CurvedAnimation(parent: anim, curve: easeOut);
        return FadeTransition(
          opacity: curved,
          child: SlideTransition(
            position: Tween(begin: const Offset(0.08, 0), end: Offset.zero)
                .animate(curved),
            child: child,
          ),
        );
      },
    );
  }

  /// 模态：从底部上滑 + 自带遮罩（登录、支付确认等）。
  static Route<T> modalRoute<T>(Widget target) {
    return PageRouteBuilder<T>(
      fullscreenDialog: true,
      opaque: false,
      transitionDuration: const Duration(milliseconds: modal),
      reverseTransitionDuration: const Duration(milliseconds: pageOut),
      pageBuilder: (_, __, ___) => target,
      transitionsBuilder: (_, anim, __, child) {
        final curved = CurvedAnimation(parent: anim, curve: easeOut);
        return FadeTransition(
          opacity: curved,
          child: SlideTransition(
            position: Tween(begin: const Offset(0, 1), end: Offset.zero)
                .animate(curved),
            child: child,
          ),
        );
      },
    );
  }

  /// Tab 平级切换：150ms 交叉淡入，不做左右滑动。
  static Widget tabFade(Widget child, Animation<double> animation) => FadeTransition(
        opacity: Tween(begin: 0.0, end: 1.0).animate(CurvedAnimation(
          parent: animation,
          curve: const Interval(0, 1, curve: easeOut),
        )),
        child: child,
      );
}
