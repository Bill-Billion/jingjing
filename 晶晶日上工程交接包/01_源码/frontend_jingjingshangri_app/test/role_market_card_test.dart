// A8/A3（第45轮）：角色席位市场卡片护栏。
// 走 demo 离线兜底的 5 条席位，锁定：①价格统一 Money.rmbInt 千分位（¥5,000 而非 ¥5000）；
// ②认领进度“已认 sold/total”“剩余 N 席”数字正确；③可认领=“可定制”、售罄=“已锁定”两态；
// ④点“可定制”弹“去剧场项目详情认领”引导（逻辑不直跳、不臆造订单）。
// LiquidScaffold 含无限流光，禁止 pumpAndSettle，统一逐帧 pump。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/role_market/role_market_page.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({'connMode': 'demo'});
    await AppMode.instance.load();
    await ApiService().init();
  });

  tearDown(() async {
    await AppMode.instance.setMode(ConnMode.demo);
  });

  Future<void> boot(WidgetTester t) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const RoleMarketPage(),
    ));
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
  }

  testWidgets('价格走 Money 千分位，旧的无分位写法不再出现', (t) async {
    await boot(t);
    // 兜底：两个 5000（黄帝主角/边境主角），其余 2000/1000/1500 各一
    expect(find.text('¥5,000'), findsNWidgets(2));
    expect(find.text('¥2,000'), findsOneWidget);
    expect(find.text('¥1,000'), findsOneWidget);
    expect(find.text('¥1,500'), findsOneWidget);
    for (final old in const ['¥5000', '¥2000', '¥1000', '¥1500']) {
      expect(find.text(old), findsNothing, reason: '价格应千分位：$old');
    }
  });

  testWidgets('认领进度数字与剩余席位正确', (t) async {
    await boot(t);
    expect(find.text('已认 12/20'), findsOneWidget); // 黄帝主角
    expect(find.text('剩余 8 席'), findsOneWidget);
    expect(find.text('已认 20/20'), findsOneWidget); // 边境主角，售罄
    expect(find.text('剩余 0 席'), findsOneWidget);
  });

  testWidgets('可认领 4 个“可定制”、售罄 1 个“已锁定”', (t) async {
    await boot(t);
    expect(find.text('可定制'), findsNWidgets(4));
    expect(find.text('已锁定'), findsOneWidget);
    // 剧目名 / 角色名渲染
    expect(find.text('《黄帝史诗·天下合》'), findsWidgets);
    expect(find.text('主角席位'), findsWidgets);
  });

  testWidgets('点“可定制”弹去剧场认领引导，不臆造订单', (t) async {
    await boot(t);
    await t.tap(find.text('可定制').first);
    for (var i = 0; i < 4; i++) {
      await t.pump(const Duration(milliseconds: 80));
    }
    expect(find.textContaining('请在「剧场」进入'), findsOneWidget);
    expect(find.textContaining('项目详情认领'), findsOneWidget);
  });
}
