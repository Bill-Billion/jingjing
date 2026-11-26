import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/business_library.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'fake_account_api.dart';
import 'personal_business_fixtures.dart';

void main() {
  testWidgets('收入事实可读名称和值，刷新及拒绝读取后不得留旧金额', (t) async {
    final semantics = t.ensureSemantics();
    try {
      var paid = 2000;
      var denied = false;
      late FakeAccountAdapter a;
      a = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/me/business/income') {
          if (denied) {
            return envelope({'code': 'FORBIDDEN'}, status: 403, error: true);
          }
          return envelope(businessResponse('income', personId, sections: {
            'FINANCE': businessSection('FINANCE', items: [
              businessRow('FINANCE', income: {
                ...incomeFixture(),
                'verified_paid_minor': paid,
                'pending_minor': 11899 - paid,
              }),
            ]),
          }));
        }
        return a.defaultReply(r);
      });
      final session = (await t.runAsync(() => buyerSession(a)))!;
      await host(t, session, const BusinessLibraryPage(section: 'income'));
      t.view.physicalSize = const Size(390, 6000);
      await t.pumpAndSettle();
      expect(find.bySemanticsLabel('币种: CNY'), findsOneWidget);
      expect(find.bySemanticsLabel('核算环境: 测试环境'), findsOneWidget);
      expect(find.bySemanticsLabel('已入账应计金额: ¥120.00'), findsOneWidget);
      expect(find.bySemanticsLabel('已审核调整: -¥1.01'), findsOneWidget);
      expect(find.bySemanticsLabel('核验净支付: ¥20.00'), findsOneWidget);
      expect(find.bySemanticsLabel('账面待付: ¥98.99'), findsOneWidget);
      expect(find.byWidgetPredicate(
          (w) => w is SelectableText && w.data == '¥20.00'), findsOneWidget);

      paid = 3000;
      await t.ensureVisible(find.text('刷新当前分类'));
      await t.tap(find.text('刷新当前分类'));
      await t.pumpAndSettle();
      expect(find.bySemanticsLabel('核验净支付: ¥30.00'), findsOneWidget);
      expect(find.bySemanticsLabel('账面待付: ¥88.99'), findsOneWidget);
      expect(find.bySemanticsLabel('核验净支付: ¥20.00'), findsNothing);

      denied = true;
      await t.ensureVisible(find.text('刷新当前分类'));
      await t.tap(find.text('刷新当前分类'));
      await t.pumpAndSettle();
      expect(find.bySemanticsLabel(RegExp(r'^(核验净支付|账面待付|已入账应计金额):')),
          findsNothing);
      expect(find.text('¥30.00'), findsNothing);
      expect(t.takeException(), isNull);
    } finally {
      semantics.dispose();
    }
  });
}
