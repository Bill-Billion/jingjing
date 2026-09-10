// 第72轮 A5/A8：统一加载态 LoadingView 组件锁定
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/widgets/state_views.dart';

void main() {
  testWidgets('LoadingView 默认只显示曜石金转圈、无文案', (t) async {
    await t.pumpWidget(const MaterialApp(
      home: Scaffold(body: LoadingView()),
    ));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    final cp = t.widget<CircularProgressIndicator>(
        find.byType(CircularProgressIndicator));
    expect(cp.color, isNotNull);
  });

  testWidgets('LoadingView 带 message 时展示提示文案', (t) async {
    await t.pumpWidget(const MaterialApp(
      home: Scaffold(body: LoadingView(message: '正在同步订单…')),
    ));
    expect(find.text('正在同步订单…'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
