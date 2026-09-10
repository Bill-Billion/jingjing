// A8（第43轮）：给第39轮新增的 onboarding 翻页入场（keyed FadeSlideIn + PageController 翻页 +
// onPageChanged 触觉 + 末页/跳过写 onboarding_seen 标记并进登录页）补 widget 护栏。
// 注意：LiquidBackdrop 有 14s repeat 无限动画，禁止 pumpAndSettle；且翻页/路由是“async gap + 动画”，
// 单次大跨度 pump 推进不可靠，统一逐帧 pump（已实测翻页在约 300ms 完成、转场 340ms）。
// 全程 demo 离线，不联网、不触发真实提交；开屏引导只应冷启动首装出现一次，靠 _finish 写 seen 锁保证。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/onboarding/onboarding_page.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';

const _seenKey = 'onboarding_seen_v12_3';

void main() {
  setUp(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({'connMode': 'demo'});
    await AppMode.instance.load();
    await ApiService().init();
  });

  Future<void> boot(WidgetTester t) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const OnboardingPage(),
    ));
    await t.pump(const Duration(milliseconds: 400));
  }

  // 逐帧推进，覆盖 PageController.nextPage(300ms) 与 FadeSlideIn(340ms)
  Future<void> frames(WidgetTester t, int n, {int stepMs = 100}) async {
    for (var i = 0; i < n; i++) {
      await t.pump(Duration(milliseconds: stepMs));
    }
  }

  Future<void> next(WidgetTester t) async {
    await t.tap(find.text('下一步'));
    await frames(t, 6);
  }

  testWidgets('初始落在第1页：标题/第一步入场 key/“下一步”就位，尚无进入按钮',
      (t) async {
    await boot(t);
    expect(find.text('定制专属数字人'), findsOneWidget);
    expect(find.byKey(const ValueKey<String>('onboard_page_0')),
        findsOneWidget);
    expect(find.text('下一步'), findsOneWidget);
    expect(find.text('进入晶晶日上'), findsNothing);
  });

  testWidgets('两次下一步依次翻到第2、第3页，末页按钮变为“进入晶晶日上”',
      (t) async {
    await boot(t);
    await next(t);
    expect(find.text('AI 一键生成'), findsOneWidget);
    expect(find.byKey(const ValueKey<String>('onboard_page_1')),
        findsOneWidget);
    expect(find.text('下一步'), findsOneWidget);

    await next(t);
    expect(find.text('圆梦晶晶日上'), findsOneWidget);
    expect(find.byKey(const ValueKey<String>('onboard_page_2')),
        findsOneWidget);
    expect(find.text('进入晶晶日上'), findsOneWidget);
    expect(find.text('下一步'), findsNothing);
  });

  testWidgets('末页“进入晶晶日上”：写首装 seen 标记并替换到登录页', (t) async {
    await boot(t);
    await next(t);
    await next(t);
    await t.tap(find.text('进入晶晶日上'));
    await frames(t, 8); // 覆盖 _finish 的 async gap 与 340ms 转场
    final sp = await SharedPreferences.getInstance();
    expect(sp.getBool(_seenKey), isTrue);
    expect(find.byType(LoginPage), findsOneWidget);
  });

  testWidgets('首屏“跳过”也写 seen 并直接到登录页（任意页可跳）', (t) async {
    await boot(t);
    await t.tap(find.text('跳过'));
    await frames(t, 8);
    final sp = await SharedPreferences.getInstance();
    expect(sp.getBool(_seenKey), isTrue);
    expect(find.byType(LoginPage), findsOneWidget);
  });
}
