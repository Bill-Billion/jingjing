// A4/A8（第51轮）：锁定剧场「查看晶晶日上项目计划书」入口。
// 旧实现点击只弹“项目计划书为示例资料，正式版可在线查看与下载”死胡同 SnackBar；
// 第44轮已建 ProjectBriefPage 本地预览、项目详情页也已接上，本轮把剧场入口接通（平台级定制剧模板，source 空 map 由 ProjectBrief 兜底、金额走 Pricing）。
// 断言：点击经 Motion 转场进入 ProjectBriefPage（定制剧版），且不再出现“示例资料”提示。
// 页面含 LiquidScaffold 流光与 FadeSlideIn（Timer），逐帧 pump、禁 settle。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/theater/theater_page.dart';
import 'package:jingjingshangri_app/pages/project_brief/project_brief_page.dart';

void main() {
  setUp(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({'connMode': 'demo'});
    await AppMode.instance.load();
    await ApiService().init();
  });

  testWidgets('剧场项目计划书入口进入本地预览（定制剧版），不再是示例资料死胡同',
      (t) async {
    t.view.physicalSize = const Size(390, 1700);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const Scaffold(body: TheaterPage()),
    ));
    for (var i = 0; i < 5; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }

    final entry = find.text('查看晶晶日上项目计划书');
    await t.scrollUntilVisible(entry, 80,
        scrollable: find.byType(Scrollable).first);
    for (var i = 0; i < 3; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    expect(entry, findsOneWidget);

    await t.tap(entry);
    await t.pump();
    for (var i = 0; i < 5; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }

    expect(find.byType(ProjectBriefPage), findsOneWidget);
    expect(find.text('定制剧项目书'), findsOneWidget);
    expect(find.text('三、七步标准化流程'), findsOneWidget);
    expect(find.text('项目计划书为示例资料，正式版可在线查看与下载'),
        findsNothing);
    expect(t.takeException(), isNull);
  });
}
