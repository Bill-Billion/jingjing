import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/support/support_pages.dart';
import '../account/fake_account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import '../stock/v5_test_host.dart' as v5;

void main() {
  test('票据入口仅将有效原订单带回现有订单详情', () {
    expect(invoiceBusinessRoute(null), '/orders');
    expect(invoiceBusinessRoute('bad-id'), '/orders');
    expect(Uri.parse(invoiceBusinessRoute(personId)).queryParameters,
        {'recordId': personId});
  });

  testWidgets('开票入口在未登录时要求核对本人身份，不收集抬头', (t) async {
    await v5.host(t, AccountSession(api: FakeAccountAdapter().createApi()),
        const InvoicePage());
    expect(find.byType(TextField), findsNothing);
    expect(find.text('核对账号与身份'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('帮助保留本地FAQ和原业务入口，并可进入正式反馈', (t) async {
    String? opened;
    await t.pumpWidget(MaterialApp(
        home: const HelpFeedbackPage(),
        onGenerateRoute: (settings) {
          opened = settings.name;
          return MaterialPageRoute<void>(
              builder: (_) => const Scaffold(body: Text('订单目录')));
        }));
    expect(find.byType(TextField), findsOneWidget);
    final feedback = find.widgetWithText(FilledButton, '向平台提交问题');
    expect(feedback.hitTestable(), findsOneWidget);
    expect(t.widget<FilledButton>(feedback).onPressed, isNotNull);
    expect(opened, isNull);
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
    Navigator.of(t.element(find.text('订单目录'))).pop();
    await t.pumpAndSettle();
    expect(feedback.hitTestable(), findsOneWidget);
    await t.tap(feedback);
    await t.pumpAndSettle();
    expect(opened, '/support/new');
    expect(t.takeException(), isNull);
  });
}
