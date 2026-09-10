// 第73轮：锁定创作中心 GlowPanel 定制剧金额来自 Pricing/Money SSOT，而非写死字面量
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/utils/money.dart';
import 'package:jingjingshangri_app/utils/pricing.dart';
import 'package:jingjingshangri_app/widgets/glow_panel.dart';

void main() {
  testWidgets('GlowPanel 定制剧入口金额由 SSOT 格式化（¥99 意向金 + ¥4,901 制作款）',
      (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: GlowPanel())));
    final expected =
        '本人主角：${Money.rmbInt(Pricing.intentDeposit)} 意向金 + ${Money.rmbInt(Pricing.productionFee)} 制作款，电子合同担保';
    expect(expected, '本人主角：¥99 意向金 + ¥4,901 制作款，电子合同担保');
    expect(find.text(expected), findsOneWidget);
  });

  test('Pricing 关键金额常量未被改动（商业数值冻结）', () {
    expect(Pricing.intentDeposit, 99);
    expect(Pricing.productionFee, 4901);
    expect(Pricing.standardTotal, 5000);
    expect(Pricing.artistDeposit, 500);
  });
}
