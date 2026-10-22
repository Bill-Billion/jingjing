import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/trade/trade_pages.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import 'business_contract_test.dart' show covered, holdId;
import 'trade_api_test.dart' show buyerSession;
import 'trade_fixtures.dart';

Future<void> reveal(WidgetTester tester, String label) async {
  await tester.drag(find.byType(ListView).first, const Offset(0, 15000));
  await tester.pump();
  await tester.scrollUntilVisible(find.text(label), 300,
      scrollable: find.byType(Scrollable).first);
  await tester.pump();
}

void main() {
  testWidgets('已知预留阻止返回，报价变化仍保留原预留释放入口', (tester) async {
    var changed = false;
    var releases = 0;
    final adjusted = covered();
    final original = {
      ...quoteData(),
      'channel': 'CUSTODY',
      'transaction_model': 'PLATFORM_PRINCIPAL',
      'customization': adjusted['customization'],
      'lines': adjusted['discount']['original_lines'],
    };
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith(quoteId)) {
        final q = tradeData('QUOTE');
        q['data'] = original;
        if (changed) q['content_sha256'] = 'd' * 64;
        return envelope(q);
      }
      if (r.path.endsWith('/release')) {
        if (++releases == 1) {
          return envelope({'code': 'SERVICE_UNAVAILABLE'},
              status: 503, error: true);
        }
        return envelope({
          'id': holdId,
          'kind': 'COUPON_HOLD',
          'current_status': 'RELEASED',
          'owner_party_id': personId,
        });
      }
      if (r.path.startsWith('/api/v1/redemption/grants/')) {
        return envelope({
          'id': adjusted['discount']['grant_id'],
          'kind': 'GRANT',
          'current_status': 'AVAILABLE'
        });
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => buyerSession(adapter)))!;
    await tester.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: session,
        child: MaterialApp(
            home: const TradeRecordPage(recordId: quoteId),
            onGenerateRoute: (_) => MaterialPageRoute(builder: (context) {
                  return Scaffold(
                      body: TextButton(
                          onPressed: () => Navigator.pop(context, {
                                'hold_id': holdId,
                                'hold_version': 2,
                                'quote_id': quoteId,
                                'adjusted_quote_sha256': 'e' * 64,
                                'adjusted_quote': adjusted,
                              }),
                          child: const Text('采用原预留')));
                }))));
    await nav.frames(tester);
    await reveal(tester, '选择可用制作权益');
    await tester.tap(find.text('选择可用制作权益'));
    await nav.frames(tester);
    await tester.tap(find.text('采用原预留'));
    await nav.frames(tester);
    await tester.tap(find.byType(BackButton));
    await tester.pump();
    expect(find.byType(TradeRecordPage), findsOneWidget);
    expect(find.text('本次权益仍有预留，请先确认原报价或明确释放。'), findsOneWidget);
    changed = true;
    await reveal(tester, '重新读取当前记录');
    await tester.tap(find.text('重新读取当前记录'));
    await nav.frames(tester);
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '确认报价形成订单'))
            .onPressed,
        isNull);
    await reveal(tester, '释放本次权益预留');
    await tester.tap(find.text('释放本次权益预留'));
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    expect(session.pendingForPrefix('/api/v1/redemption/'), isNotEmpty);
    final first = adapter.requests.last;
    await reveal(tester, '释放本次权益预留');
    await tester.tap(find.text('释放本次权益预留'));
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    final retry = adapter.requests.last;
    expect(retry.headers['Idempotency-Key'], first.headers['Idempotency-Key']);
    expect(retry.headers['If-Match'], first.headers['If-Match']);
    expect(adapter.requests[adapter.requests.length - 2].path,
        contains('/redemption/grants/'));
    expect(
        adapter.requests.where((r) => r.path.endsWith('/release')).length, 2);
    await reveal(tester, '选择可用制作权益');
    expect(find.text('选择可用制作权益'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('未开工全额权益订单提供明确取消释放入口', (tester) async {
    final order = tradeData('ORDER', status: 'REWARD_FUNDED');
    order['data']['quote'] = covered();
    order['data']['contract']['commitments']['quote'] = order['data']['quote'];
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith(orderId)) return envelope(order);
      if (r.path == '/api/v1/trade/records' ||
          r.path == '/api/v1/production/projects') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, session,
        route: '/trade/record?recordId=$orderId');
    await reveal(tester, '取消订单并释放制作权益');
    await tester.tap(find.text('取消订单并释放制作权益'));
    await nav.frames(tester);
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.widgetWithText(AlertDialog, '取消订单并释放制作权益'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
