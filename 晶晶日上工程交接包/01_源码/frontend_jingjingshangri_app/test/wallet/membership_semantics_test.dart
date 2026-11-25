import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/wallet/wallet_pages.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'wallet_fixtures.dart';

void main() {
  testWidgets('会员事实可读出名称和值，到期与恢复不混淆当前等级和保留等级', (t) async {
    final semantics = t.ensureSemantics();
    addTearDown(semantics.dispose);
    var active = true;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/wallet/summary')) {
        final value = walletSummary();
        value['qualifying_growth'] = 10000;
        value['membership'] = {
          ...value['membership'] as Map<String, dynamic>,
          'active': active,
          'level': active ? 2 : 0,
          'attained_level': 2,
          'qualifying_growth': 10000,
          'valid_until': '2030-11-25T00:00:00.000Z',
          'reason': active ? null : 'MEMBERSHIP_EXPIRED',
        };
        return envelope(value);
      }
      if (r.path.endsWith('/wallet/rules')) {
        return envelope({
          'items': [walletRule()],
          'next_cursor': null
        });
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final session = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, session, const WalletPage(mode: 'scout'));
    final expand = find.text('查看会员年与实际资格');
    await t.ensureVisible(expand);
    await t.tap(expand);
    await t.pumpAndSettle();
    for (final next in [true, false, true]) {
      if (active != next) {
        active = next;
        final refresh = find.text('重新核对本页');
        await t.ensureVisible(refresh);
        await t.tap(refresh);
        await t.pumpAndSettle();
      }
      await t.ensureVisible(expand);
      await t.pumpAndSettle();
      expect(
          find.bySemanticsLabel('当前有效等级: ${active ? 2 : 0}'), findsOneWidget);
      expect(find.bySemanticsLabel('已达到成长等级: 2'), findsOneWidget);
      expect(find.bySemanticsLabel('当前有效会员: ${active ? '有效' : '未生效或已到期'}'),
          findsOneWidget);
      expect(find.bySemanticsLabel(RegExp(r'^会员年有效至: .+')), findsOneWidget);
      // Values remain selectable for sighted users as before.
      expect(
          find.byWidgetPredicate((w) => w is SelectableText && w.data == '2'),
          findsWidgets);
    }
  });
}
