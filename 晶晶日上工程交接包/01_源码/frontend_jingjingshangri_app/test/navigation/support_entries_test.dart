import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/support/support_pages.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart' as v5;

void main() {
  test('票据入口仅将有效原订单带回现有订单详情', () {
    expect(invoiceBusinessRoute(null), '/orders');
    expect(invoiceBusinessRoute('bad-id'), '/orders');
    expect(Uri.parse(invoiceBusinessRoute(personId)).queryParameters,
        {'recordId': personId});
  });

  for (final page in <Widget>[const InvoicePage(), const SavedHistoryPage()]) {
    testWidgets('${page.runtimeType} 未接通的写入动作关闭且不收集资料', (t) async {
      await t.pumpWidget(MaterialApp(home: page));
      expect(find.byType(TextField), findsNothing);
      await v5.reveal(t, find.byType(FilledButton));
      final filled = t.widgetList<FilledButton>(find.byType(FilledButton));
      expect(filled, isNotEmpty);
      expect(filled.every((b) => b.onPressed == null), isTrue);
      expect(find.textContaining('雨巷来信'), findsNothing);
      expect(find.text('周见川'), findsNothing);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('帮助只过滤本地FAQ并跳转原业务，反馈不能提交', (t) async {
    String? opened;
    await t.pumpWidget(MaterialApp(
        home: const HelpFeedbackPage(),
        onGenerateRoute: (settings) {
          opened = settings.name;
          return MaterialPageRoute<void>(
              builder: (_) => const Scaffold(body: Text('订单目录')));
        }));
    expect(find.byType(TextField), findsOneWidget);
    await v5.reveal(t, find.text('提交反馈 · 暂未开放'));
    expect(
        t
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, '提交反馈 · 暂未开放'))
            .onPressed,
        isNull);
    t.state<ScrollableState>(find.byType(Scrollable).first).position.jumpTo(0);
    await t.pump();
    await t.enterText(find.byType(TextField), '付款后还没');
    await t.pump();
    expect(find.text('付款后还没显示成功'), findsOneWidget);
    expect(find.text('投稿后如何继续沟通'), findsNothing);
    await t.tap(find.text('付款后还没显示成功'));
    await t.pumpAndSettle();
    await v5.reveal(t, find.text('查看订单与付款'));
    await t.tap(find.text('查看订单与付款'));
    await t.pumpAndSettle();
    expect(opened, '/orders');
    expect(t.takeException(), isNull);
  });
}
