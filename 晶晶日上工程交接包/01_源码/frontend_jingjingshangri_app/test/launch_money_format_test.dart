// 第75轮 A3/金额SSOT：定制剧下单页七步流程的金额必须走 Money.formatInt
// （整数元口语 + 千分位），锁定制作款 4901 显示为“4,901元”而非“4901元”。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/pages/launch/launch_page.dart';

void main() {
  testWidgets('定制剧七步流程金额走统一入口且千分位', (t) async {
    await t.pumpWidget(const MaterialApp(home: LaunchPage()));
    await t.pump(const Duration(milliseconds: 120));

    expect(find.textContaining('支付99元意向金锁档'), findsWidgets);
    expect(find.textContaining('支付4,901元制作款'), findsOneWidget);
    expect(find.textContaining('超出200元/轮'), findsOneWidget);
    // 不应再出现无千分位的 4901 元
    expect(find.textContaining('4901元'), findsNothing);

    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(milliseconds: 120));
  });
}
