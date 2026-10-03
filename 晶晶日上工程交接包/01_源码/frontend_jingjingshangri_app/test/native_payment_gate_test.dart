import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/pages/checkout/checkout_page.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/widgets/primary_button.dart';

void main() {
  testWidgets('遗留付款入口不具备原生接入时禁用，不调用支付或假成功', (tester) async {
    await tester.pumpWidget(MaterialApp(
        theme: AppTheme.darkTheme,
        home: const CheckoutPage(
            orderNo: 'synthetic-local-order',
            bizType: 'video',
            title: '隔离测试资料',
            amount: 1)));
    await tester.pump(const Duration(milliseconds: 500));
    final button = tester.widget<PrimaryButton>(find.byType(PrimaryButton));
    expect(button.label, '付款暂未开放');
    expect(button.onPressed, isNull);
    expect(button.state, ButtonState.disabled);
    await tester.tap(find.text('付款暂未开放'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('支付成功'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
