import 'dart:async';
import 'dart:ui' show CheckedState, Tristate;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/wallet/recharge_refunds.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;

void main() {
  testWidgets('监护关系与原充值独立选择，键盘不跨组，换子女清旧充值且读取时禁改', (t) async {
    final semantics = t.ensureSemantics();
    final secondSource = Completer<void>();
    const links = [
      'a8000000-0000-4000-8000-000000000011',
      'a8000000-0000-4000-8000-000000000012'
    ];
    const children = [
      'a8000000-0000-4000-8000-000000000021',
      'a8000000-0000-4000-8000-000000000022'
    ];
    const charges = [
      'a8000000-0000-4000-8000-000000000031',
      'a8000000-0000-4000-8000-000000000032',
      'a8000000-0000-4000-8000-000000000033'
    ];
    Finder choice(String id) => find
        .byWidgetPredicate((w) => w is RadioListTile<String> && w.value == id);
    bool checked(String id) =>
        t
            .getSemantics(choice(id))
            .getSemanticsData()
            .flagsCollection
            .isChecked ==
        CheckedState.isTrue;
    Map<String, dynamic> charge(String id) => {
          'id': id,
          'object_version': 1,
          'current_status': 'SUCCEEDED',
          'amount_minor': 30000,
          'refunded_minor': 0,
          'currency': 'CNY'
        };
    try {
      late FakeAccountAdapter a;
      a = FakeAccountAdapter(handler: (r) async {
        if (r.path.endsWith('/wallet/guardian-recharge-refunds')) {
          return envelope({'items': [], 'next_cursor': null});
        }
        if (r.path == '/api/v1/guardians/records') {
          return envelope({
            'items': [
              for (final id in links)
                {
                  'id': id,
                  'kind': 'LINK',
                  'current_status': 'ACTIVE',
                  'object_version': 1,
                  'parent_id': null
                }
            ],
            'next_cursor': null
          });
        }
        for (var i = 0; i < links.length; i++) {
          if (r.path == '/api/v1/guardians/records/${links[i]}') {
            return envelope({
              'id': links[i],
              'kind': 'LINK',
              'current_status': 'ACTIVE',
              'object_version': 1,
              'guardian_account_id': accountId,
              'child_account_id': children[i],
              'data': {'relationship': '合成关系$i'}
            });
          }
        }
        if (r.path.endsWith('/guardian-recharge-refund-options')) {
          final i = links.indexOf(r.queryParameters['guardian_link_id']);
          expect(i, isNonNegative);
          if (i == 1) await secondSource.future;
          return envelope({
            'guardian_link_id': links[i],
            'child_party_id': children[i],
            'items': [
              for (final id in i == 0 ? charges.take(2) : charges.skip(2))
                charge(id)
            ],
            'next_cursor': null
          });
        }
        return a.defaultReply(r);
      });
      await host(t, (await t.runAsync(() => buyerSession(a)))!,
          const RechargeRefundsPage(guardian: true));
      t.view.physicalSize = const Size(390, 6000);
      await frames(t);
      await t.tap(find.text('读取本人的有效监护关系'));
      await frames(t);
      await t.tap(choice(links[0]));
      await frames(t);
      await t.tap(find.text('读取所选子女的原充值'));
      await frames(t);
      await t.tap(choice(charges[0]));
      await frames(t);
      expect(checked(links[0]), isTrue);
      expect(checked(charges[0]), isTrue);
      // Touch selection does not necessarily move keyboard focus. Enter the
      // selected recharge group through normal Tab traversal before arrows.
      bool sourceFocused() =>
          t
              .getSemantics(choice(charges[0]))
              .getSemanticsData()
              .flagsCollection
              .isFocused ==
          Tristate.isTrue;
      for (var i = 0; i < 20 && !sourceFocused(); i++) {
        await t.sendKeyEvent(LogicalKeyboardKey.tab);
        await t.pumpAndSettle();
      }
      expect(sourceFocused(), isTrue);
      await t.sendKeyEvent(LogicalKeyboardKey.arrowDown);
      await frames(t);
      expect(checked(charges[1]), isTrue);
      expect(checked(charges[0]), isFalse);
      expect(checked(links[0]), isTrue);
      expect(checked(links[1]), isFalse);
      await t.tap(choice(links[1]));
      await frames(t);
      expect(choice(charges[0]), findsNothing);
      expect(choice(charges[1]), findsNothing);
      await t.tap(find.text('读取所选子女的原充值'));
      await frames(t);
      expect(
          t
              .getSemantics(choice(links[0]))
              .getSemanticsData()
              .flagsCollection
              .isEnabled,
          Tristate.isFalse);
      await t.tap(choice(links[0]));
      await frames(t);
      expect(checked(links[1]), isTrue);
      secondSource.complete();
      await frames(t);
      expect(checked(charges[2]), isFalse);
      await t.tap(choice(charges[2]));
      await frames(t);
      expect(checked(charges[2]), isTrue);
      expect(checked(links[1]), isTrue);
      expect(
          a.requests.where(
              (r) => r.path.endsWith('/guardian-recharge-refund-options')),
          hasLength(2));
      expect(
          a.requests
              .where((r) => r.method == 'POST' && r.path.contains('/wallet/')),
          isEmpty);
      expect(t.takeException(), isNull);
    } finally {
      if (!secondSource.isCompleted) secondSource.complete();
      semantics.dispose();
    }
  });
}
