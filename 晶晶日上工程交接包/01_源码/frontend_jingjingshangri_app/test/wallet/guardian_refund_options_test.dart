import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/wallet/recharge_refunds.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;

const linkId = 'a8000000-0000-4000-8000-000000000001';
const childId = 'a8000000-0000-4000-8000-000000000002';
const rechargeId = 'a8000000-0000-4000-8000-000000000003';

void main() {
  for (final mine in [true, false]) {
    testWidgets('监护列表只含索引，先读关系详情再选择合法子女：mine=$mine', (t) async {
      late FakeAccountAdapter a;
      a = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/wallet/guardian-recharge-refunds') {
          return envelope({'items': [], 'next_cursor': null});
        }
        if (r.path.startsWith('/api/v1/guardians/') ||
            r.path.endsWith('/guardian-recharge-refund-options')) {
          expect(r.headers['X-Acting-Party'], isNull);
        }
        if (r.path == '/api/v1/guardians/records') {
          return envelope({
            'items': [
              {
                'id': linkId,
                'kind': 'LINK',
                'current_status': 'ACTIVE',
                'object_version': 3,
                'parent_id': null
              }
            ],
            'next_cursor': null
          });
        }
        if (r.path == '/api/v1/guardians/records/$linkId') {
          return envelope({
            'id': linkId,
            'kind': 'LINK',
            'current_status': 'ACTIVE',
            'object_version': 3,
            'guardian_account_id': mine ? accountId : childId,
            'child_account_id': childId,
            'data': {'relationship': '合成监护关系'}
          });
        }
        if (r.path.endsWith('/guardian-recharge-refund-options')) {
          expect(r.queryParameters['guardian_link_id'], linkId);
          return envelope({
            'guardian_link_id': linkId,
            'child_party_id': childId,
            'items': [
              {
                'id': rechargeId,
                'object_version': 2,
                'current_status': 'SUCCEEDED',
                'amount_minor': 30000,
                'refunded_minor': 0,
                'currency': 'CNY'
              }
            ],
            'next_cursor': null
          });
        }
        return a.defaultReply(r);
      });
      final s = (await t.runAsync(() => buyerSession(a)))!;
      await host(t, s, const RechargeRefundsPage(guardian: true));
      await t.tap(find.text('读取本人的有效监护关系'));
      await frames(t);
      expect(
          a.requests
              .where((r) => r.path == '/api/v1/guardians/records/$linkId'),
          hasLength(1));
      if (!mine) {
        expect(find.byType(RadioListTile<String>), findsNothing);
        expect(
            a.requests.where(
                (r) => r.path.endsWith('/guardian-recharge-refund-options')),
            isEmpty);
        return;
      }
      await t.tap(find.byType(RadioListTile<String>).first);
      await frames(t);
      await t.tap(find.text('读取所选子女的原充值'));
      await frames(t);
      expect(
          a.requests.where(
              (r) => r.path.endsWith('/guardian-recharge-refund-options')),
          hasLength(1));
      expect(
          a.requests.where((r) => r.path == '/api/v1/wallet/records'), isEmpty);
      await reveal(t, find.textContaining(rechargeId));
      expect(find.textContaining(rechargeId), findsOneWidget);
      expect(t.takeException(), isNull);
    });
  }
}
