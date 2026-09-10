// 第78轮 A3：共享里程碑分期条 MilestoneBar 自身正确，且高端定制需求页
// （custom_request）与定制剧下单页（launch）使用同一套结构化里程碑，旧一行箭头文本不再出现。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/widgets/milestone_bar.dart';
import 'package:jingjingshangri_app/pages/custom_request/custom_request_page.dart';

void main() {
  const stages = [
    ('剧本审核', '20%'),
    ('开机', '25%'),
    ('粗剪审核', '25%'),
    ('成片交付', '30%'),
  ];

  testWidgets('MilestoneBar 渲染全部阶段与比例', (t) async {
    await t.pumpWidget(MaterialApp(
      home: Scaffold(body: MilestoneBar(stages: stages)),
    ));
    // 四个阶段名各一；比例 20%×1、25%×2、30%×1
    for (final (name, _) in stages) {
      expect(find.text(name), findsOneWidget);
    }
    expect(find.text('20%'), findsOneWidget);
    expect(find.text('25%'), findsNWidgets(2));
    expect(find.text('30%'), findsOneWidget);
    // 三段连接箭头
    expect(find.byIcon(Icons.chevron_right), findsNWidgets(3));
  });

  testWidgets('高端定制需求页付款里程碑走结构化分期条', (t) async {
    t.view
      ..devicePixelRatio = 1.0
      ..physicalSize = const Size(390, 1700);
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(const MaterialApp(home: CustomRequestPage()));
    await t.pump(const Duration(milliseconds: 120));

    expect(find.text('付款里程碑'), findsOneWidget);
    expect(find.text('20%'), findsOneWidget);
    expect(find.text('25%'), findsNWidgets(2));
    expect(find.text('30%'), findsOneWidget);
    expect(find.textContaining('剧本审核20% → 开机'), findsNothing);

    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(milliseconds: 120));
  });
}
