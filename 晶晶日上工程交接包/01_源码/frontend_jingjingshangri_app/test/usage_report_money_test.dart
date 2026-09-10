// A8/金额SSOT（第52轮）：锁定数字人使用报告 UsageReportPage 的金额展示。
// 旧实现手写 toStringAsFixed(0)+'元'（无千分位、绕过唯一金额入口 Money）；本轮收口 Money.rmbInt。
// demo 边界已是「元」（V12.5 起不 /100）：累计收入 5682→“¥5,682”，记录 99→“¥99”、1999→“¥1,999”。
// 页面含 LiquidScaffold 流光，逐帧 pump、禁 settle。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/usage_report/usage_report_page.dart';

void main() {
  tearDown(() async {
    await AppMode.instance.setMode(ConnMode.demo);
  });

  testWidgets('使用报告金额走 Money：千分位带¥，不再手写“元”无分隔', (t) async {
    SharedPreferences.setMockInitialValues({'connMode': 'demo'});
    await AppMode.instance.load();
    await ApiService().init();

    t.view.physicalSize = const Size(390, 1400);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const UsageReportPage(humanId: 1, humanName: '林沐雪'),
    ));
    for (var i = 0; i < 8; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }

    expect(find.text('¥5,682'), findsOneWidget); // 累计收入（千分位）
    expect(find.text('¥99'), findsOneWidget); // 祝福视频记录
    expect(find.text('¥1,999'), findsOneWidget); // 品牌代言记录（千分位）
    expect(find.text('5682元'), findsNothing);
    expect(find.text('1999元'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
