import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/trade/trade_api.dart';
import 'package:jingjingshangri_app/trade/trade_models.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import 'trade_api_test.dart' show buyerSession;
import 'trade_fixtures.dart';

const cashierRoute =
    '/trade/record?recordId=$orderId&section=cashier&installmentKey=';

FakeAccountAdapter readCashier(
    {Map<String, dynamic>? order,
    List<Map<String, dynamic>> payments = const []}) {
  late FakeAccountAdapter adapter;
  adapter = FakeAccountAdapter(handler: (r) {
    if (r.path.endsWith(orderId)) return envelope(order ?? tradeData('ORDER'));
    if (r.path.endsWith(paymentId)) return envelope(payments.single);
    if (r.path == '/api/v1/trade/records') {
      return envelope({
        'items': r.queryParameters['kind'] == 'PAYMENT' ? payments : [],
        'next_cursor': null,
      });
    }
    return adapter.defaultReply(r);
  });
  return adapter;
}

FilledButton cashierAction(WidgetTester tester) =>
    tester.widget<FilledButton>(find.byKey(const Key('trade-cashier-action')));

void main() {
  testWidgets('收银台选取原节点金额并保留固定渠道，未达节点不可办理', (tester) async {
    final order = tradeData('ORDER', status: 'PARTIALLY_PAID');
    order['data']['financial'] = {
      'received_minor': 38001,
      'refunded_minor': 0,
      'net_minor': 38001,
    };
    final adapter = readCashier(order: order);
    final session = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, session, route: '${cashierRoute}sample');
    expect(find.text('收银台'), findsOneWidget);
    expect(
        tester.widget<Text>(find.byKey(const Key('trade-cashier-amount'))).data,
        '¥900.00');
    expect(find.text('支付宝 · 原订单已固定'), findsOneWidget);
    expect(find.text('当前已核实收款'), findsOneWidget);
    expect(find.text('¥380.01'), findsNWidgets(2));
    await tester.scrollUntilVisible(find.textContaining('当前付款节点尚未确认可办理'), 300,
        scrollable: find.byType(Scrollable).first);
    await nav.frames(tester);
    expect(find.textContaining('当前付款节点尚未确认可办理'), findsOneWidget);
    expect(cashierAction(tester).onPressed, isNull);
    expect(
        adapter.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('/api/v1/trade/')),
        isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('无效节点不退回默认首款，也不建立付款', (tester) async {
    final adapter = readCashier();
    final session = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, session, route: '${cashierRoute}not-in-original');
    expect(find.textContaining('该付款节点不在原订单计划中'), findsOneWidget);
    expect(find.byKey(const Key('trade-cashier-amount')), findsNothing);
    expect(cashierAction(tester).onPressed, isNull);
    expect(
        adapter.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('/api/v1/trade/')),
        isEmpty);
  });

  testWidgets('金额核对后共用原付款函数，只提交原节点且不新增If-Match', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith(orderId)) return envelope(tradeData('ORDER'));
      if (r.path == '/api/v1/trade/payments' || r.path.endsWith(paymentId)) {
        return envelope(tradeData('PAYMENT', status: 'PENDING'));
      }
      if (r.path == '/api/v1/trade/records') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, session, route: '${cashierRoute}deposit');
    expect(cashierAction(tester).onPressed, isNull);
    await tester.scrollUntilVisible(
        find.byKey(const Key('trade-cashier-confirm')), 350,
        scrollable: find.byType(Scrollable).first);
    await nav.frames(tester);
    await tester.tap(find.byKey(const Key('trade-cashier-confirm')));
    await nav.frames(tester);
    expect(cashierAction(tester).onPressed, isNotNull);
    await tester.tap(find.byKey(const Key('trade-cashier-action')));
    await nav.frames(tester);
    expect(find.text('此操作不会在客户端发起实际支付。'), findsOneWidget);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    final request = adapter.requests
        .where((r) => r.method == 'POST' && r.path == '/api/v1/trade/payments')
        .single;
    expect(request.data, {'order_id': orderId, 'installment_key': 'deposit'});
    expect(request.headers.containsKey('If-Match'), false);
    expect(find.text('付款详情'), findsOneWidget);
    expect(find.textContaining('must-never-display'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('本节点已有未关闭付款时只打开原记录，不重复建立或自动核对', (tester) async {
    final adapter =
        readCashier(payments: [tradeData('PAYMENT', status: 'UNKNOWN')]);
    final session = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, session, route: '${cashierRoute}deposit');
    expect(find.byKey(const Key('trade-cashier-confirm')), findsNothing);
    expect(find.text('查看本节点原付款'), findsOneWidget);
    await tester.tap(find.byKey(const Key('trade-cashier-action')));
    await nav.frames(tester);
    expect(find.text('付款详情'), findsOneWidget);
    expect(adapter.requests.where((r) => r.path.endsWith(paymentId)),
        hasLength(1));
    expect(
        adapter.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('/api/v1/trade/')),
        isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('换节点不重建未知付款，只用原key与原内容恢复', (tester) async {
    var attempt = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/trade/payments') {
        return ++attempt == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope(tradeData('PAYMENT', status: 'UNKNOWN'));
      }
      if (r.path.endsWith(orderId)) return envelope(tradeData('ORDER'));
      if (r.path.endsWith(paymentId)) {
        return envelope(tradeData('PAYMENT', status: 'UNKNOWN'));
      }
      if (r.path == '/api/v1/trade/records') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => buyerSession(adapter)))!;
    await tester.runAsync(() async {
      try {
        await TradeApi(session).payment(
            TradeRecord.parse(tradeData('ORDER'), personId), 'deposit');
      } catch (_) {}
    });
    final originalKey = adapter.requests.last.headers['Idempotency-Key'];
    await nav.openApp(tester, session, route: '${cashierRoute}sample');
    expect(cashierAction(tester).onPressed, isNull);
    expect(attempt, 1);
    await tester.tap(find.text('恢复原请求核对'));
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    final writes = adapter.requests
        .where((r) => r.method == 'POST' && r.path == '/api/v1/trade/payments')
        .toList();
    expect(writes, hasLength(2));
    expect(writes.last.data, writes.first.data);
    expect(
        writes.last.data, {'order_id': orderId, 'installment_key': 'deposit'});
    expect(writes.last.headers['Idempotency-Key'], originalKey);
    expect(writes.last.headers.containsKey('If-Match'), false);
    expect(session.tradePending, isEmpty);
    expect(find.text('付款详情'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('重读失权清除收银台金额和私有订单，不能继续建立付款', (tester) async {
    var denied = false;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith(orderId)) {
        return denied
            ? envelope({'code': 'TRADE_NOT_FOUND'}, status: 404, error: true)
            : envelope(tradeData('ORDER'));
      }
      if (r.path == '/api/v1/trade/records') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, session, route: '${cashierRoute}deposit');
    expect(find.byKey(const Key('trade-cashier-amount')), findsOneWidget);
    denied = true;
    await tester.scrollUntilVisible(find.text('重新读取当前记录'), 350,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('重新读取当前记录'));
    await nav.frames(tester);
    expect(session.tradeAccessDenied, true);
    expect(find.text('先确认办事身份'), findsOneWidget);
    expect(find.text('私人短片制作'), findsNothing);
    expect(find.byKey(const Key('trade-cashier-amount')), findsNothing);
    expect(find.byKey(const Key('trade-cashier-action')), findsNothing);
    expect(
        adapter.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('/api/v1/trade/')),
        isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('托管原渠道不可切换，未接通时禁用办理且不虚构余额', (tester) async {
    final order = tradeData('ORDER');
    order['data']['quote']['channel'] = 'CUSTODY';
    final adapter = readCashier(order: order);
    final session = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, session, route: '${cashierRoute}deposit');
    expect(find.text('资金托管账户 · 原订单已固定'), findsOneWidget);
    expect(find.text('托管消费尚未接通'), findsOneWidget);
    expect(find.textContaining('托管消费余额尚未接通'), findsOneWidget);
    expect(find.text('支付宝'), findsNothing);
    expect(find.text('¥320'), findsNothing);
    expect(cashierAction(tester).onPressed, isNull);
    expect(
        adapter.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('/api/v1/trade/')),
        isEmpty);
    expect(adapter.requests.where((r) => r.path.contains('/wallet/')), isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('原订单节点入口保留节点key并打开独立收银台', (tester) async {
    final adapter = readCashier();
    final session = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, session,
        route: '/trade/record?recordId=$orderId');
    final entry = find.byKey(const Key('trade-cashier-entry-deposit'));
    await tester.scrollUntilVisible(entry, 450,
        scrollable: find.byType(Scrollable).first);
    await nav.frames(tester);
    await tester.tap(find.descendant(of: entry, matching: find.text('进入收银台')));
    await nav.frames(tester);
    expect(find.text('收银台'), findsOneWidget);
    expect(
        tester.widget<Text>(find.byKey(const Key('trade-cashier-amount'))).data,
        '¥380.01');
    expect(
        adapter.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('/api/v1/trade/')),
        isEmpty);
    expect(tester.takeException(), isNull);
  });
}
