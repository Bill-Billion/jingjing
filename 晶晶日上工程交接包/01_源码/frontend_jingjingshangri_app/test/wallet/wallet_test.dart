import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';
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

  testWidgets('新用户进入充值页时明确提示先开户，不误报身份失权', (t) async {
    final a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/summary')
            ? envelope({'code': 'WALLET_NOT_FOUND'}, status: 404, error: true)
            : FakeAccountAdapter().defaultReply(r));
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const WalletPage(mode: 'recharge'));
    expect(find.textContaining('本人尚未开立消费者账本'), findsOneWidget);
    expect(find.text('阅读规则并开立本人账本'), findsOneWidget);
    expect(find.textContaining('当前身份不能读取或办理这份记录'), findsNothing);
    expect(find.text('核对充值服务状态'), findsNothing);
    expect(
        a.requests
            .where((r) => r.method == 'POST' && r.path.endsWith('/recharges')),
        isEmpty);
  });

  testWidgets('充值页会话失效后明确重新登录，保留返回路由但不自动充值', (t) async {
    var expired = false;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/summary')) {
        return expired
            ? envelope({'code': 'AUTHENTICATION_REQUIRED'},
                status: 401, error: true)
            : envelope(walletSummary());
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const WalletPage(mode: 'recharge'));
    expired = true;
    await reveal(t, find.text('重新核对本页'));
    await t.tap(find.text('重新核对本页'));
    await frames(t);
    expect(s.isLoggedIn, isFalse);
    expect(find.text('登录状态已过期'), findsOneWidget);
    expect(find.text('余额充值'), findsNothing);
    await t.tap(find.text('重新登录'));
    await frames(t);
    expect(t.widget<LoginPage>(find.byType(LoginPage)).returnRoute,
        '/wallet/recharge');
    expect(
        a.requests
            .where((r) => r.method == 'POST' && r.path.endsWith('/recharges')),
        isEmpty);
    expect(t.takeException(), isNull);
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

  testWidgets('充值响应丢失后刷新账本再用原请求重试', (t) async {
    var delaySummary = false;
    final summaryGate = Completer<ResponseBody>();
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/summary')) {
        return delaySummary ? summaryGate.future : envelope(walletSummary());
      }
      if (r.method == 'POST' && r.path.endsWith('/recharges')) {
        return envelope({'code': 'SERVICE_UNAVAILABLE'},
            status: 503, error: true);
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const WalletPage(mode: 'recharge'));
    final amount = find.byType(TextFormField);
    await reveal(t, amount);
    await t.enterText(amount, '29.01');
    await reveal(t, find.widgetWithText(FilledButton, '核对充值服务状态'));
    await t.tap(find.widgetWithText(FilledButton, '核对充值服务状态'));
    await frames(t);
    await t.tap(find.text('确认办理'));
    await frames(t);
    expect(s.walletPending, hasLength(1));
    delaySummary = true;
    final recovery = find.widgetWithText(FilledButton, '恢复原请求核对');
    await reveal(t, recovery);
    await t.tap(recovery);
    await frames(t);
    expect(
        a.requests.where((r) => r.path.endsWith('/recharges')), hasLength(1));
    expect(t.widget<FilledButton>(recovery).onPressed, isNull);
    summaryGate.complete(envelope(walletSummary()));
    await frames(t);
    final writes =
        a.requests.where((r) => r.path.endsWith('/recharges')).toList();
    expect(writes, hasLength(2));
    expect(writes.last.data, writes.first.data);
    expect(writes.last.headers['Idempotency-Key'],
        writes.first.headers['Idempotency-Key']);
    expect(s.walletPending, hasLength(1));
    expect(t.takeException(), isNull);
  });

  testWidgets('充值恢复读取期间切换身份，迟到结果不能继续原充值', (t) async {
    var delaySummary = false;
    final summaryGate = Completer<ResponseBody>();
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/summary')) {
        return delaySummary ? summaryGate.future : envelope(walletSummary());
      }
      if (r.method == 'POST' && r.path.endsWith('/recharges')) {
        return envelope({'code': 'SERVICE_UNAVAILABLE'},
            status: 503, error: true);
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const WalletPage(mode: 'recharge'));
    await reveal(t, find.byType(TextFormField));
    await t.enterText(find.byType(TextFormField), '29.01');
    await reveal(t, find.widgetWithText(FilledButton, '核对充值服务状态'));
    await t.tap(find.widgetWithText(FilledButton, '核对充值服务状态'));
    await frames(t);
    await t.tap(find.text('确认办理'));
    await frames(t);
    delaySummary = true;
    final recovery = find.widgetWithText(FilledButton, '恢复原请求核对');
    await reveal(t, recovery);
    await t.tap(recovery);
    await frames(t);
    s.select(identity(orgId));
    await frames(t);
    summaryGate.complete(envelope(walletSummary()));
    await frames(t);
    expect(
        a.requests.where((r) => r.path.endsWith('/recharges')), hasLength(1));
    expect(find.text('我的消费者余额'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
