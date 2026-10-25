import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_theme.dart';
import 'package:jingjingshangri_app/account/editorial_widgets.dart';

void main() {
  for (final scale in [1.0, 1.6]) {
    testWidgets('真实长英文及中文标题在320窄屏和$scale倍文字下完整可读', (tester) async {
      tester.view.physicalSize = const Size(320, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      const title = 'Synthetic manual customization · 城市短片制作与交付';
      var opened = false;
      await tester.pumpWidget(MaterialApp(
          theme: AccountTheme.data,
          home: MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(scale)),
              child: Scaffold(
                  body: SingleChildScrollView(
                      padding: const EdgeInsets.all(18),
                      child: Column(children: [
                        const EditorialFeature(
                            title: title,
                            eyebrow: '原订单服务',
                            description: '保留完整名称和实际业务说明。'),
                        FilledButton(
                            onPressed: () => opened = true,
                            child: const Text('查看原订单')),
                      ]))))));
      await tester.pump();
      expect(find.text(title), findsOneWidget);
      await tester.scrollUntilVisible(find.text('查看原订单'), 350);
      await tester.tap(find.text('查看原订单'));
      expect(opened, isTrue);
      expect(tester.takeException(), isNull);
    });
  }
}
