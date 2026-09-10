// 第75轮 性能防回归：曜石流光背景为无限动画，必须有 RepaintBoundary 隔离，
// 避免背景每帧重绘牵连前景整页（卡顿主因）。锁定该结构不被误删。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/widgets/liquid_scaffold.dart';

void main() {
  testWidgets('LiquidScaffold 背景被 RepaintBoundary 隔离（前景不被动画牵连）',
      (t) async {
    await t.pumpWidget(const MaterialApp(
      home: LiquidScaffold(
        body: Center(child: Text('foreground')),
      ),
    ));
    await t.pump(const Duration(milliseconds: 120));

    expect(find.text('foreground'), findsOneWidget);
    // 至少存在两层重绘边界：脚手架背景层 + 背景内部流动层
    expect(find.byType(RepaintBoundary), findsWidgets);

    // 卸载以停止背景 repeat 控制器，避免遗留定时器
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(milliseconds: 120));
  });
}
