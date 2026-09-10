// A3/A8（第53轮）：锁定高端定制 CustomRequestPage 三组选项的弱玻璃分区结构化与“已选”实时回显。
// 纯视觉/交互层：不改字段、默认选中、校验与预算换算（万→分）提交逻辑。
// 断言：类型/格式/预算三分区标题与默认回显在、全部选项可点、点选后回显实时更新。
// 含 LiquidScaffold 流光，逐帧 pump、禁 settle。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/custom_request/custom_request_page.dart';

void main() {
  Future<void> boot(WidgetTester t) async {
    t.view.physicalSize = const Size(390, 1700);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const CustomRequestPage(),
    ));
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
  }

  testWidgets('三分区标题与默认已选回显齐全，全部预算选项在', (t) async {
    await boot(t);
    expect(find.text('剧集类型'), findsOneWidget);
    expect(find.text('剧集格式'), findsOneWidget);
    expect(find.text('预算范围'), findsOneWidget);
    expect(find.text('已选：古装逆袭'), findsOneWidget);
    expect(find.text('已选：短剧'), findsOneWidget);
    expect(find.text('已选：50-100万'), findsOneWidget);
    // 全部预算档位都在（未因分区化丢选项）
    for (final b in const ['5-20万', '20-50万', '50-100万', '100-300万', '300-500万', '500万以上']) {
      expect(find.text(b), findsOneWidget);
    }
    expect(t.takeException(), isNull);
  });

  testWidgets('点选胶囊后“已选”回显实时更新', (t) async {
    await boot(t);
    await t.tap(find.text('都市甜宠'));
    await t.pump(const Duration(milliseconds: 200));
    expect(find.text('已选：古装逆袭'), findsNothing);
    expect(find.text('已选：都市甜宠'), findsOneWidget);

    await t.tap(find.text('100-300万'));
    await t.pump(const Duration(milliseconds: 200));
    expect(find.text('已选：50-100万'), findsNothing);
    expect(find.text('已选：100-300万'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
