// A8/交互一致性（第54轮）：圆梦项目详情「付意向金」对话框操作按钮统一为 PressScale（按压缩放+Haptics），
// 原先两个按钮用裸 GestureDetector（无按压反馈），与 profile 退出/mcn 入驻等同级对话框不一致。
// 链路：入口“付意向金 ¥99 启动”→说明底表“支付意向金 ¥99”→意向金对话框；断言操作按钮被 PressScale 包裹、取消可关。
// 含 LiquidScaffold 流光，逐帧 pump、禁 settle。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/widgets/press_scale.dart';
import 'package:jingjingshangri_app/pages/project_detail/project_detail_page.dart';

const _demoProject = {
  'title': '黄帝史诗·天下合',
  'type': '古装史诗',
  'status': 'recruiting',
  'seatsClaimed': 72,
  'seatsTotal': 100,
  'clientCount': 318,
  'days': 23,
  'protagonist': '少年轩辕',
  'localCover': 'assets/images/theater_1.jpg',
  'intro': '上古洪荒，群雄并起，少年轩辕集结百家席位于天下合的宏大史诗。',
};

void main() {
  tearDown(() async {
    await AppMode.instance.setMode(ConnMode.demo);
  });

  testWidgets('意向金对话框操作按钮为 PressScale，取消可关闭', (t) async {
    SharedPreferences.setMockInitialValues({'connMode': 'demo'});
    await AppMode.instance.load();
    await ApiService().init();

    t.view.physicalSize = const Size(390, 1700);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const ProjectDetailPage(project: _demoProject),
    ));
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }

    // 1) 入口 → 说明底表
    final entry = find.text('付意向金 ¥99 启动');
    expect(entry, findsOneWidget);
    await t.tap(entry);
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    expect(find.text('开启你的定制剧'), findsOneWidget);

    // 2) 说明底表“支付意向金”→ 意向金对话框
    await t.tap(find.text('支付意向金 ¥99'));
    for (var i = 0; i < 8; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    final submit = find.text('提交并支付意向金');
    expect(submit, findsOneWidget);

    // 3) 两个操作按钮均被 PressScale 包裹（统一按压反馈）
    expect(
      find.ancestor(of: submit, matching: find.byType(PressScale)),
      findsOneWidget,
    );
    expect(
      find.ancestor(of: find.text('取消'), matching: find.byType(PressScale)),
      findsWidgets,
    );

    // 4) 点取消关闭对话框
    await t.tap(find.text('取消'));
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    expect(find.text('提交并支付意向金'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
