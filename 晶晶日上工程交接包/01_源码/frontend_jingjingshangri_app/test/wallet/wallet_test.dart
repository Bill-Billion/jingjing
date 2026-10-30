import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/wallet/wallet_api.dart';
import 'package:jingjingshangri_app/wallet/wallet_models.dart';
import 'package:jingjingshangri_app/wallet/wallet_pages.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../trade/trade_fixtures.dart' show orderId;
import 'wallet_fixtures.dart';

void main() {
  test('累计获得与当前余额分开，旧服务器不伪造累计，错误净额拒绝展示', () {
    final d = walletSummary()
      ..['cumulative_points'] = {
        'version': 'NET_ISSUED_V1',
        'issued': 120,
        'withdrawn': 20,
        'net_issued': 100
      };
    expect(WalletSummary(d).raw['cumulative_points']['net_issued'], 100);
    expect(WalletSummary(walletSummary()).raw['cumulative_points'], isNull);
    d['cumulative_points']['net_issued'] = 120;
    expect(() => WalletSummary(d), throwsA(isA<AccountError>()));
  });

  test('账本保留原资金边界和旧用途标志，余额与预留必须整数对平', () {
    final summary = WalletSummary(walletSummary());
    expect(summary.raw['point_uses']['redemption_enabled'], isFalse);
    expect(summary.raw['point_uses']['lottery_enabled'], isFalse);
    expect(summary.raw['available_balance_minor'], 2801);
    expect(summary.membership['level'], 0);
    final unbalanced = walletSummary()..['recorded_balance_minor'] = 2801;
    expect(() => WalletSummary(unbalanced), throwsA(isA<AccountError>()));
    final fakeEnabled = walletSummary();
    fakeEnabled['custody']['enabled'] = true;
    expect(() => WalletSummary(fakeEnabled), throwsA(isA<AccountError>()));
    final rule = walletRule();
    rule['rule']['aftercare_days']['CUSTOMIZATION'] = null;
    expect(WalletRule(rule).rule['aftercare_days']['CUSTOMIZATION'], isNull);
  });

  test('晶钻批次验证本人归属与来源，不让花费、过期或冲回超过原批次', () {
    final record = WalletRecord(walletEarning(), personId);
    expect(record.data['growth_reversed'], 9);
    expect(() => WalletRecord(walletEarning(), orgId),
        throwsA(isA<AccountError>()));
    final spent = walletEarning();
    spent['data']['spent'] = 291;
    expect(() => WalletRecord(spent, personId), throwsA(isA<AccountError>()));
    final float = walletEarning();
    float['data']['points'] = 290.1;
    expect(() => WalletRecord(float, personId), throwsA(isA<AccountError>()));
  });

  test('机构负责人也不能读取个人消费者钱包', () async {
    final a = FakeAccountAdapter(), s = await buyerSession(a);
    s.select(identity(orgId));
    await expectLater(WalletApi(s).summary(), throwsA(isA<AccountError>()));
    expect(
        a.requests.where((r) => r.path.startsWith('/api/v1/wallet/')), isEmpty);
  });

  test('明确未接通的充值503不保留未知付款，其他503仍保留原单同键恢复', () async {
    var syncs = 0;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/recharges')) {
        return envelope({'code': 'CUSTODY_PROVIDER_NOT_CONNECTED'},
            status: 503, error: true);
      }
      if (r.method == 'POST' && r.path.endsWith('/earnings/sync')) {
        return ++syncs == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope(walletEarning(version: 3));
      }
      if (r.path.endsWith('/records')) {
        return envelope({
          'items': [walletEarning()],
          'next_cursor': null
        });
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a), api = WalletApi(s);
    await expectLater(
        api.post('/recharges', {'amount_minor': 2901},
            (d) => api.validate(d, kind: 'RECHARGE')),
        throwsA(isA<AccountError>()
            .having((e) => e.uncertain, 'uncertain', false)));
    expect(api.pending('/recharges'), isNull);
    await expectLater(
        api.post('/earnings/sync', {'order_id': orderId},
            (d) => api.validate(d, kind: 'EARNING')),
        throwsA(isA<AccountError>()));
    await expectLater(
        api.post('/earnings/sync', {'order_id': walletAccountId},
            (d) => api.validate(d, kind: 'EARNING')),
        throwsA(isA<AccountError>()));
    expect(syncs, 1);
    await api.restoreOperation('/api/v1/wallet/earnings/sync');
    final writes =
        a.requests.where((r) => r.path.endsWith('/earnings/sync')).toList();
    expect(writes.length, 2);
    expect(writes.last.data, writes.first.data);
    expect(writes.last.headers['Idempotency-Key'],
        writes.first.headers['Idempotency-Key']);
    expect(a.requests[a.requests.indexOf(writes.last) - 1].path,
        '/api/v1/wallet/records');
    expect(api.pending('/earnings/sync'), isNull);
  });

  testWidgets('未开户是真实缺账本，不显示已经到账的零余额或永久封域', (t) async {
    final a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/summary')
            ? envelope({'code': 'WALLET_NOT_FOUND'}, status: 404, error: true)
            : FakeAccountAdapter().defaultReply(r));
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const WalletPage());
    expect(find.textContaining('本人尚未开立消费者账本'), findsOneWidget);
    expect(find.text('我的消费者余额'), findsNothing);
    expect(s.walletAccessDenied, isFalse);
    expect(find.text('阅读规则并开立本人账本'), findsOneWidget);
  });

  testWidgets('充值按整数分发送并呈现实际503，未显示到账或成功', (t) async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/summary')) return envelope(walletSummary());
      if (r.path.endsWith('/recharges')) {
        return envelope({'code': 'CUSTODY_PROVIDER_NOT_CONNECTED'},
            status: 503, error: true);
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const WalletPage(mode: 'recharge'));
    final amount = find.byType(TextFormField);
    await reveal(t, amount);
    await t.enterText(amount, '29.01');
    final submit = find.widgetWithText(FilledButton, '核对充值服务状态');
    await reveal(t, submit);
    await t.tap(submit);
    await frames(t);
    await t.tap(find.text('确认办理'));
    await frames(t);
    final writes =
        a.requests.where((r) => r.path.endsWith('/recharges')).toList();
    expect(writes.single.data, {'amount_minor': 2901});
    expect(s.walletPending, isEmpty);
    expect(find.textContaining('本次未充值或扣款'), findsOneWidget);
    expect(find.textContaining('服务器已记录本次操作'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
