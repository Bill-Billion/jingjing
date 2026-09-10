import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'liquid_backdrop.dart';
import 'motion_fx.dart';

/// V15.2 二级页统一脚手架：固定垫一层曜石流光背景（LiquidBackdrop），
/// 页面功能、布局、导航逻辑完全不变，只统一底层环境光。
///
/// 用法与 Scaffold 一致（透传常用参数）。[backgroundColor] 仅为兼容旧调用而保留，
/// 恒被忽略——body 由不透明 LiquidBackdrop 铺满；Scaffold 自身垫统一曜石蓝黑，只在
  /// AppBar 后方等 body 未覆盖区可见，避免透明时顶部透出白边/底色不一。
class LiquidScaffold extends StatelessWidget {
  final PreferredSizeWidget? appBar;
  final Widget? body;
  final Widget? floatingActionButton;
  final FloatingActionButtonLocation? floatingActionButtonLocation;
  final Widget? bottomNavigationBar;
  final Widget? bottomSheet;
  final Widget? drawer;
  final Widget? endDrawer;
  final List<Widget>? persistentFooterButtons;
  final bool? resizeToAvoidBottomInset;
  final bool extendBody;
  final bool extendBodyBehindAppBar;
  final bool primary;
  final Color? backgroundColor; // 兼容旧签名，恒忽略

  const LiquidScaffold({
    super.key,
    this.appBar,
    this.body,
    this.floatingActionButton,
    this.floatingActionButtonLocation,
    this.bottomNavigationBar,
    this.bottomSheet,
    this.drawer,
    this.endDrawer,
    this.persistentFooterButtons,
    this.resizeToAvoidBottomInset,
    this.extendBody = false,
    this.extendBodyBehindAppBar = false,
    this.primary = true,
    this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: appBar,
      floatingActionButton: floatingActionButton,
      floatingActionButtonLocation: floatingActionButtonLocation,
      bottomNavigationBar: bottomNavigationBar,
      bottomSheet: bottomSheet,
      drawer: drawer,
      endDrawer: endDrawer,
      persistentFooterButtons: persistentFooterButtons,
      resizeToAvoidBottomInset: resizeToAvoidBottomInset,
      extendBody: extendBody,
      extendBodyBehindAppBar: extendBodyBehindAppBar,
      primary: primary,
      body: Stack(
        children: [
          // 固定流动青蓝环境光，缺丝绸位图时 LiquidBackdrop 内部自动回退代码渐变。
          // RepaintBoundary：背景是 14s 无限动画，独立成层后其每帧重绘不再牵连
          // 前景 body 重新栅格化/合成（中低端机卡顿的主要来源），视觉完全不变。
          const Positioned.fill(
            child: RepaintBoundary(child: LiquidBackdrop()),
          ),
          if (body != null)
            Positioned.fill(child: PageEnter(child: body!)),
        ],
      ),
    );
  }
}
