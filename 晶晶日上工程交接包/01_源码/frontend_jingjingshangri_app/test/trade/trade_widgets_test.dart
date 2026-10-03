import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/trade/trade_pages.dart';
import 'package:jingjingshangri_app/licensing/license_pages.dart';
import 'package:jingjingshangri_app/trade/trade_api.dart';
import 'package:jingjingshangri_app/trade/trade_models.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import 'trade_api_test.dart' show buyerSession;
import 'trade_fixtures.dart';

// Keep the recovery assertions within SnackBar's four-second lifetime. A
// naturally expired warning would not exercise the successful-write cleanup.
Future<void> recoveryFrames(WidgetTester tester) async {
  for (var i = 0; i < 7; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  testWidgets('报价确认留在可见安全区，规格折叠且发送原hash形成订单', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith(quoteId)) return envelope(tradeData('QUOTE'));
      if (r.path.endsWith(orderId) || r.path.endsWith('/acceptance')) {
        return envelope(tradeData('ORDER'));
      }
      if (r.path == '/api/v1/trade/records') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return adapter.defaultReply(r);
    });
    final s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s, route: '/trade/record?recordId=$quoteId');
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('确认报价形成订单'), findsOneWidget);
    expect(find.text('原约定档位 / 2026.1'), findsNothing);
    await tester.tap(find.text('确认报价形成订单'));
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    expect(find.text('订单详情'), findsOneWidget);
    expect(
        adapter.requests
            .where((r) => r.path.endsWith('/acceptance'))
            .single
            .data,
        {'quote_sha256': 'c' * 64});
    expect(tester.takeException(), isNull);
  });
  testWidgets('503后普通返回保留页面，先读取目标再使用原key恢复', (tester) async {
    late FakeAccountAdapter adapter;
    var attempt = 0;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith(quoteId)) return envelope(tradeData('QUOTE'));
      if (r.path.endsWith('/acceptance')) {
        return ++attempt == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope(tradeData('ORDER'));
      }
      if (r.path.endsWith(orderId)) return envelope(tradeData('ORDER'));
      if (r.path == '/api/v1/trade/records') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return adapter.defaultReply(r);
    });
    final s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s, route: '/trade/record?recordId=$quoteId');
    await tester.tap(find.text('确认报价形成订单'));
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    final key = adapter.requests.last.headers['Idempotency-Key'];
    expect(s.tradePending, isNotEmpty);
    await tester.tap(find.byType(BackButton));
    await nav.frames(tester);
    expect(find.byType(TradeRecordPage), findsOneWidget);
    expect(s.tradePending, isNotEmpty);
    await tester.ensureVisible(find.text('恢复原请求核对'));
    await tester.tap(find.text('恢复原请求核对'));
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    final writes =
        adapter.requests.where((r) => r.path.endsWith('/acceptance')).toList();
    expect(writes.last.headers['Idempotency-Key'], key);
    expect(s.tradePending, isEmpty);
    expect(find.text('订单详情'), findsOneWidget);
    expect(adapter.requests.where((r) => r.path.endsWith(quoteId)).length, 2);
    expect(tester.takeException(), isNull);
  });
  testWidgets('原付款恢复失败保留返回警告，恢复成功清理警告但UNKNOWN状态保持', (tester) async {
    const warning = '操作结果尚未确认，请先恢复原请求核对。';
    var attempts = 0;
    final unknown = tradeData('PAYMENT', status: 'UNKNOWN');
    unknown['data']['proof'] = null;
    unknown['data']['transaction_id'] = null;
    unknown['data']['checkout'] = null;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/trade/payments') {
        return ++attempts < 3
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope(unknown);
      }
      if (r.path.endsWith(orderId)) return envelope(tradeData('ORDER'));
      if (r.path.endsWith(paymentId)) return envelope(unknown);
      if (r.path.endsWith(legacyId)) return envelope(tradeData('LEGACY'));
      if (r.path == '/api/v1/trade/records') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return adapter.defaultReply(r);
    });
    final s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await tester.runAsync(() async {
      try {
        await TradeApi(s).payment(
            TradeRecord.parse(tradeData('ORDER'), personId), 'deposit');
      } catch (_) {}
    });
    await nav.openApp(tester, s, route: '/trade/record?recordId=$orderId');
    await tester.tap(find.byType(BackButton));
    await recoveryFrames(tester);
    expect(find.text(warning), findsOneWidget);
    await tester.tap(find.text('恢复原请求核对'));
    await recoveryFrames(tester);
    await tester.tap(find.text('确认办理'));
    await recoveryFrames(tester);
    expect(s.tradePending, isNotEmpty);
    expect(find.text(warning), findsOneWidget);
    await tester.tap(find.text('恢复原请求核对'));
    await recoveryFrames(tester);
    await tester.tap(find.text('确认办理'));
    await recoveryFrames(tester);
    expect(s.tradePending, isEmpty);
    await recoveryFrames(tester);
    expect(find.text(warning), findsNothing);
    expect(find.text('结果待核实'), findsOneWidget);
    expect(find.text('申请逐项退款'), findsNothing);
    Navigator.of(tester.element(find.byType(TradeRecordPage)))
        .pushNamed('/trade/record?recordId=$legacyId');
    await recoveryFrames(tester);
    expect(find.text('旧记录详情'), findsOneWidget);
    expect(find.text(warning), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('原退款申请恢复成功清理返回拦截警告', (tester) async {
    const warning = '操作结果尚未确认，请先恢复原请求核对。';
    var attempts = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/trade/refunds') {
        return ++attempts == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope(tradeData('REFUND'));
      }
      if (r.path.endsWith(orderId)) return envelope(tradeData('ORDER'));
      if (r.path.endsWith(paymentId)) return envelope(tradeData('PAYMENT'));
      if (r.path.endsWith(refundId)) return envelope(tradeData('REFUND'));
      if (r.path == '/api/v1/trade/records') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return adapter.defaultReply(r);
    });
    final s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await tester.runAsync(() async {
      try {
        await TradeApi(s).refund(
            TradeRecord.parse(tradeData('PAYMENT'), personId),
            [
              {'line_id': 'production', 'amount_minor': 38001}
            ],
            '按原约定申请退回',
            []);
      } catch (_) {}
    });
    await nav.openApp(tester, s, route: '/trade/refund?paymentId=$paymentId');
    await tester.tap(find.byType(BackButton));
    await recoveryFrames(tester);
    expect(find.text(warning), findsOneWidget);
    await tester.tap(find.text('恢复原请求核对'));
    await recoveryFrames(tester);
    await tester.tap(find.text('确认办理'));
    await recoveryFrames(tester);
    expect(s.tradePending, isEmpty);
    await recoveryFrames(tester);
    expect(find.text('退款详情'), findsOneWidget);
    expect(find.text(warning), findsNothing);
    expect(find.text('退款申请待审核'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('412重新读取后停止，必须再次核对确认最新hash', (tester) async {
    late FakeAccountAdapter adapter;
    var reads = 0;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith(quoteId)) {
        final q = tradeData('QUOTE');
        if (++reads > 1) {
          q['content_sha256'] = 'd' * 64;
          q['object_version'] = 3;
        }
        return envelope(q);
      }
      if (r.path.endsWith('/acceptance')) {
        return envelope({'code': 'PRECONDITION_FAILED'},
            status: 412, error: true);
      }
      return adapter.defaultReply(r);
    });
    final s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s, route: '/trade/record?recordId=$quoteId');
    await tester.tap(find.text('确认报价形成订单'));
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    expect(find.textContaining('旧决定不会重放'), findsOneWidget);
    expect(adapter.requests.where((r) => r.path.endsWith('/acceptance')).length,
        1);
    expect(s.tradePending, isEmpty);
    await tester.tap(find.text('确认报价形成订单'));
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    expect(
        adapter.requests.where((r) => r.path.endsWith('/acceptance')).last.data,
        {'quote_sha256': 'd' * 64});
  });
  testWidgets('订单合同只读取内嵌内容，不请求独立治理合同接口', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith(orderId)
            ? envelope(tradeData('ORDER'))
            : adapter.defaultReply(r));
    final s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s,
        route: '/trade/record?recordId=$orderId&section=contract');
    expect(find.text('合同内容已保存，尚未签署'), findsOneWidget);
    expect(find.text('quote'), findsNothing);
    expect(find.text('lines'), findsNothing);
    expect(find.text('review'), findsNothing);
    expect(find.text('原报价总额'), findsOneWidget);
    expect(find.text('确认订单后付款'), findsOneWidget);
    expect(adapter.requests.any((r) => r.path.contains('contract-snapshots')),
        false);
    expect(find.byType(NavigationBar), findsNothing);
    await tester.scrollUntilVisible(
        find.byKey(const Key('trade-contract-content')), 400,
        scrollable: find.byType(Scrollable).first);
    await nav.frames(tester);
    expect(find.text('成交报价'), findsNothing);
    await tester.tap(find.text('展开完整保存合同'));
    await nav.frames(tester);
    expect(find.text('成交报价'), findsOneWidget);
    expect(find.text('报价明细'), findsOneWidget);
    expect(find.text('quote'), findsNothing);
    expect(find.text('title'), findsNothing);
    expect(find.text('NOT_SIGNED'), findsOneWidget);
    expect(find.text('128001'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
  testWidgets('待核实付款不显示支付字符串或假成功，收齐不表示制作完成', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith(paymentId)
            ? envelope(tradeData('PAYMENT', status: 'UNKNOWN'))
            : adapter.defaultReply(r));
    final s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s, route: '/trade/record?recordId=$paymentId');
    await tester.drag(find.byType(ListView), const Offset(0, -550));
    await nav.frames(tester);
    expect(find.text('结果待核实'), findsOneWidget);
    expect(find.text('must-never-display'), findsNothing);
    expect(find.text('申请逐项退款'), findsNothing);
    expect(find.textContaining('客户端不能发起实际支付'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('Apple等待申请状态与审核只读，不能执行退款或假报已退款', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith(refundId)
            ? envelope(tradeData('REFUND',
                status: 'AWAITING_APPLE_REQUEST', provider: 'APPLE'))
            : adapter.defaultReply(r));
    final s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s, route: '/trade/record?recordId=$refundId');
    expect(find.text('等待用户向 Apple 申请退款'), findsOneWidget);
    expect(find.textContaining('当前状态不表示已退款'), findsOneWidget);
    expect(find.text('执行退款'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('切换身份清除待返回的私有报价，成员不会读取交易', (tester) async {
    final deferred = Completer<void>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) async {
      if (r.path.endsWith(quoteId)) {
        await deferred.future;
        return envelope(tradeData('QUOTE'));
      }
      return adapter.defaultReply(r);
    });
    final s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s, route: '/trade/record?recordId=$quoteId');
    s.select(identity(orgId, owner: false));
    await tester.pump();
    deferred.complete();
    await nav.frames(tester);
    expect(find.text('先确认办事身份'), findsOneWidget);
    expect(find.text('私人短片制作'), findsNothing);
    expect(adapter.requests.where((r) => r.path.endsWith(quoteId)).length, 1);
    expect(tester.takeException(), isNull);
  });
  testWidgets('订单新入口与许可旧kind兼容，子页返回到主栏目', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/records')
            ? envelope({'items': [], 'next_cursor': null})
            : adapter.defaultReply(r));
    final s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s, route: '/orders');
    expect(find.byType(TradeRecordsPage), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    await tester.tap(find.byType(BackButton));
    await nav.frames(tester);
    nav.expectFiveTabs();
    await tester.pumpWidget(const SizedBox.shrink());
    await nav.openApp(tester, s, route: '/orders?kind=RESERVATION');
    expect(find.byType(LicenseRecordsPage), findsOneWidget);
    expect(find.byType(TradeRecordsPage), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
