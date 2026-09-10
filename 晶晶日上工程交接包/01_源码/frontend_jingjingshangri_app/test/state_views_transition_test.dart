// 第19轮 A8：统一空/错态组件与全局转场 builder 的 widget 测试。
// 纯组件、不联网、不依赖 demo 数据，验证按钮渲染条件、点击回调与减弱动态回退。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/widgets/state_views.dart';
import 'package:jingjingshangri_app/widgets/primary_button.dart';

void main() {
  group('EmptyView 空态', () {
    testWidgets('无操作回调时不渲染按钮', (t) async {
      await t.pumpWidget(const MaterialApp(
        home: Scaffold(body: EmptyView(title: '暂无内容')),
      ));
      expect(find.text('暂无内容'), findsOneWidget);
      expect(find.byType(PrimaryButton), findsNothing);
    });

    testWidgets('有 actionText+onAction 时渲染按钮且点击触发一次', (t) async {
      var hits = 0;
      await t.pumpWidget(MaterialApp(
        home: Scaffold(
          body: EmptyView(
            title: '还没有数字人',
            actionText: '立即创建',
            actionIcon: Icons.add,
            onAction: () => hits++,
          ),
        ),
      ));
      await t.pump(const Duration(milliseconds: 260));
      final btn = find.text('立即创建');
      expect(btn, findsOneWidget);
      await t.tap(btn);
      await t.pump();
      expect(hits, 1);
    });
  });

  group('ErrorView 错误态', () {
    testWidgets('无 onRetry 时不渲染重试按钮', (t) async {
      await t.pumpWidget(const MaterialApp(
        home: Scaffold(body: ErrorView(message: '网络开小差')),
      ));
      expect(find.text('网络开小差'), findsOneWidget);
      expect(find.byType(PrimaryButton), findsNothing);
    });

    testWidgets('有 onRetry 时渲染默认重试文案且点击触发', (t) async {
      var hits = 0;
      await t.pumpWidget(MaterialApp(
        home: Scaffold(body: ErrorView(onRetry: () => hits++)),
      ));
      await t.pump(const Duration(milliseconds: 260));
      expect(find.text('重新加载'), findsOneWidget);
      await t.tap(find.text('重新加载'));
      await t.pump();
      expect(hits, 1);
    });

    testWidgets('自定义 retryText 生效', (t) async {
      await t.pumpWidget(MaterialApp(
        home: Scaffold(
          body: ErrorView(retryText: '重新尝试', onRetry: () {}),
        ),
      ));
      await t.pump(const Duration(milliseconds: 260));
      expect(find.text('重新尝试'), findsOneWidget);
      expect(find.text('重新加载'), findsNothing);
    });
  });

  group('ObsidianPageTransitionsBuilder 全局转场', () {
    testWidgets('正常动画下包裹 FadeTransition（非原样返回）', (t) async {
      const builder = ObsidianPageTransitionsBuilder();
      final controller = AnimationController(
        vsync: t,
        duration: const Duration(milliseconds: 340),
      );
      addTearDown(controller.dispose);
      final route = PageRouteBuilder(pageBuilder: (_, __, ___) => const SizedBox());
      const child = SizedBox(key: ValueKey('child'));
      late Widget result;
      await t.pumpWidget(MaterialApp(
        home: Builder(builder: (ctx) {
          result = builder.buildTransitions(route, ctx, controller, controller, child);
          return const SizedBox();
        }),
      ));
      expect(result, isNot(same(child)));
      expect(result, isA<FadeTransition>());
    });

    testWidgets('系统开启减弱动态时直接返回 child（无动画包裹）', (t) async {
      const builder = ObsidianPageTransitionsBuilder();
      final controller = AnimationController(vsync: t);
      addTearDown(controller.dispose);
      final route = PageRouteBuilder(pageBuilder: (_, __, ___) => const SizedBox());
      const child = SizedBox(key: ValueKey('reduced'));
      late Widget result;
      await t.pumpWidget(MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: Builder(builder: (ctx) {
            result = builder.buildTransitions(route, ctx, controller, controller, child);
            return const SizedBox();
          }),
        ),
      ));
      expect(identical(result, child), isTrue);
    });
  });
}
