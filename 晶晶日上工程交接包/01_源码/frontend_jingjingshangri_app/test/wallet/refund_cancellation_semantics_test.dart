import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/wallet/recharge_refunds.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;

void main() {
  testWidgets('退款取消输入框独立于事实卡片，确认前不发送操作', (t) async {
    final semantics = t.ensureSemantics();
    addTearDown(semantics.dispose);
    const id = 'a8000000-0000-4000-8000-000000000009';
    final record = <String, dynamic>{
      'id': id,
      'object_version': 2,
      'current_status': 'APPROVED',
      'recharge_id': 'a8000000-0000-4000-8000-000000000003',
      'requested_minor': 2500,
      'amount_minor': 2500,
      'currency': 'CNY',
      'reason': '合成监护申请，由子女取消尚未发送的原申请',
      'task_scheduled': false,
      'applicant_kind': 'GUARDIAN',
      'created_at': '2026-11-25T12:00:00.000Z',
    };
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/wallet/recharge-refunds')) {
        return envelope({
          'items': [record],
          'next_cursor': null
        });
      }
      if (r.path.endsWith('/wallet/recharge-refunds/$id')) {
        return envelope(record);
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final session = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, session, const RechargeRefundsPage());
    await reveal(t, find.text('查看原退款申请'));
    await t.tap(find.text('查看原退款申请'));
    await frames(t);
    final input = find.byType(TextField);
    await reveal(t, input);
    final node = t.getSemantics(input);
    expect(node.label, '取消原因');
    // communityField includes its 16px bottom spacing, but no record facts.
    expect(node.rect.height, lessThanOrEqualTo(t.getSize(input).height + 16));
    expect(find.bySemanticsLabel('申请金额: ¥25.00'), findsOneWidget);
    await t.enterText(input, '尚未发出，请取消原申请');
    await reveal(t, find.text('取消未发送的申请'));
    await t.tap(find.text('取消未发送的申请'));
    await t.pumpAndSettle();
    expect(find.text('确认取消'), findsOneWidget);
    expect(a.requests.where((r) => r.path.endsWith('/cancellation')), isEmpty);
    await t.tap(find.text('返回'));
    await t.pumpAndSettle();
    expect(a.requests.where((r) => r.path.endsWith('/cancellation')), isEmpty);
    expect(t.takeException(), isNull);
  });
}
