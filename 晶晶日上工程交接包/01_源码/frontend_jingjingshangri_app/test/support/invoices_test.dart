import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/engagement/community_support.dart';
import 'package:jingjingshangri_app/support/invoices.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../stock/v5_test_host.dart';
import '../trade/trade_fixtures.dart' as trade;
import '../navigation/app_navigation_test.dart' as nav;

Map<String, dynamic> invoiceFixture(
        {String id = invitationId,
        String party = personId,
        String state = 'REQUESTED',
        int version = 1}) =>
    {
      'id': id,
      'order_id': accountId,
      'buyer_party_id': party,
      'issuer_party_id': orgId,
      'environment': 'SANDBOX',
      'currency': 'CNY',
      'requested_minor': 5000,
      'occupied_minor': 5000,
      'current_status': state,
      'object_version': version,
      'header': {'kind': 'PERSON', 'title': '测试抬头', 'tax_id': null},
      'issued_document_id': state == 'ISSUED' ? invitedOrgId : null,
      'pending_document_id': null,
      'requires_correction': false,
      'available_for_this_request_minor': 7000,
      'created_at': '2026-10-30T00:00:00.000Z',
      'updated_at': '2026-10-30T00:00:00.000Z'
    };
Map<String, dynamic> eligibilityFixture() => {
      'order_id': accountId,
      'currency': 'CNY',
      'environment': 'SANDBOX',
      'received_minor': 10000,
      'refunded_minor': 1000,
      'pending_refund_minor': 2000,
      'occupied_minor': 0,
      'available_minor': 7000
    };
Map<String, dynamic> documentFixture(
    {String state = 'ISSUED', bool simulated = true}) {
  final issuer = {
    'merchant_party_id': orgId,
    'name': '测试开票方',
    'simulated': simulated
  };
  final c = {
    'invoice_id': invitationId,
    'order_id': accountId,
    'environment': simulated ? 'SANDBOX' : 'PRODUCTION',
    'simulated': simulated,
    'label': simulated ? '模拟凭证，非真实发票' : '人工录入并复核的票据',
    'amount_minor': 0,
    'currency': 'CNY',
    'reference': 'fixture-reference',
    'issued_at': '2026-10-30T00:00:00.000Z',
    'header': invoiceFixture()['header'],
    'issuer': issuer,
    'issuer_sha256': communityDigest(issuer),
    'replaces_document_id': null,
    'asset_proof': simulated
        ? null
        : {'content_sha256': List.filled(64, 'a').join(), 'byte_size': 100}
  };
  return {
    'id': invitedOrgId,
    'current_status': state,
    'content_sha256': communityDigest(c),
    'content': c,
    'created_at': '2026-10-30T00:00:00.000Z'
  };
}

Future<void> press(WidgetTester t, String text) async {
  await reveal(t, find.text(text));
  await t.tap(find.text(text));
  await frames(t);
}

void main() {
  testWidgets('从原订单进入开票自动携带精确订单并读取真实额度', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/trade/records/${trade.orderId}') {
        return envelope(trade.tradeData('ORDER'));
      }
      if (r.path == '/api/v1/trade/records' ||
          r.path == '/api/v1/production/records') {
        return envelope({'items': [], 'next_cursor': null});
      }
      if (r.path == '/api/v1/invoices/orders/${trade.orderId}/eligibility') {
        return envelope({...eligibilityFixture(), 'order_id': trade.orderId});
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s, route: '/trade/record?recordId=${trade.orderId}');
    await press(t, '按本订单申请开票');
    expect(find.byType(InvoicePage), findsOneWidget);
    expect(
        a.requests
            .where((r) =>
                r.path ==
                '/api/v1/invoices/orders/${trade.orderId}/eligibility')
            .single
            .headers['X-Acting-Party'],
        personId);
    expect(t.takeException(), isNull);
  });

  test('额度严格按整数分和当前购买身份核对，不能伪造发票签发状态', () {
    expect(
        invoiceEligibility(eligibilityFixture(), accountId)['available_minor'],
        7000);
    expect(
        () => invoiceEligibility(
            {...eligibilityFixture(), 'available_minor': 70.0}, accountId),
        throwsA(isA<AccountError>()));
    expect(() => invoiceRecord(invoiceFixture(), orgId),
        throwsA(isA<AccountError>()));
    expect(invoiceApplicantActions(invoiceFixture(state: 'NEEDS_INFO')),
        ['SUPPLEMENT', 'WITHDRAW']);
    expect(invoiceApplicantActions(invoiceFixture(state: 'ISSUED')),
        ['REQUEST_CORRECTION']);
    expect(
        invoiceApplicantActions({
          ...invoiceFixture(state: 'DOCUMENT_REVIEW'),
          'issued_document_id': invitedOrgId
        }),
        isEmpty);
  });
  test('票据核对JSON摘要，历史获准票据可读；待审核、篡改、伪模拟均拒绝', () {
    final d = documentFixture(state: 'SUPERSEDED');
    expect(invoiceDocument(d, invitationId, accountId), d);
    expect(
        () => invoiceDocument(
            documentFixture(state: 'PENDING'), invitationId, accountId),
        throwsA(isA<AccountError>()));
    expect(
        () => invoiceDocument({
              ...d,
              'content': {...d['content'], 'amount_minor': 1}
            }, invitationId, accountId),
        throwsA(isA<AccountError>()));
    final real = documentFixture(simulated: false);
    expect(invoiceDocument(real, invitationId, accountId), real);
    final bad = {...d['content'], 'environment': 'PRODUCTION'};
    expect(
        () => invoiceDocument(
            {...d, 'content': bad, 'content_sha256': communityDigest(bad)},
            invitationId,
            accountId),
        throwsA(isA<AccountError>()));
  });
  testWidgets('空中间页继续读取，失败翻页保留原cursor并独立重试', (t) async {
    var reads = 0;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/invoices/requests') {
        reads++;
        if (r.queryParameters['cursor'] == null) {
          return envelope({'items': [], 'next_cursor': orgId});
        }
        if (reads == 2) {
          return envelope({'code': 'SERVICE_UNAVAILABLE'},
              status: 503, error: true);
        }
        return envelope({
          'items': [invoiceFixture()],
          'next_cursor': null
        });
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const InvoicePage());
    await press(t, '继续读取申请记录');
    await press(t, '重试申请记录');
    await reveal(t, find.text('测试抬头'));
    expect(find.text('测试抬头'), findsOneWidget);
    final pages =
        a.requests.where((r) => r.path == '/api/v1/invoices/requests').toList();
    expect(pages.map((r) => r.queryParameters['cursor']).toList(),
        [null, orgId, orgId]);
    expect(pages.every((r) => r.headers['X-Acting-Party'] == personId), isTrue);
  });
  testWidgets('额度失败不显示可申请零额，重试后展示原单收退款口径', (t) async {
    var fails = true;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/eligibility')) {
        return fails
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope(eligibilityFixture());
      }
      return a.defaultReply(r);
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const InvoicePage(orderId: accountId));
    expect(find.byType(TextField), findsNothing);
    expect(find.text('¥0.00'), findsNothing);
    fails = false;
    await press(t, '重新读取当前进度');
    await reveal(t, find.text('¥70.00'));
    expect(find.text('¥70.00'), findsOneWidget);
    expect(find.text('模拟环境，非真实发票'), findsOneWidget);
    expect(
        a.requests.where((r) =>
            r.method == 'POST' && r.path.startsWith('/api/v1/invoices/')),
        isEmpty);
  });
  testWidgets('未知补件先读取原申请再原键原版本重试，不覆盖为新内容', (t) async {
    final path = '/api/v1/invoices/requests/$invitationId/actions';
    var writes = 0;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == path) {
        if (++writes == 1) {
          return envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
              status: 503, error: true);
        }
        return envelope(invoiceFixture(version: 8));
      }
      if (r.path == '/api/v1/invoices/requests/$invitationId') {
        return envelope(invoiceFixture(version: 7));
      }
      if (r.path.endsWith('/history') || r.path.endsWith('/documents')) {
        return envelope({'items': [], 'next_cursor': null});
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    final body = {
      'action': 'SUPPLEMENT',
      'text': '原补件说明',
      'header': invoiceFixture()['header'],
      'asset_ids': <String>[]
    };
    await t.runAsync(() => expectLater(
        s.write('POST', path, body: body, version: 4, actingParty: personId),
        throwsA(isA<AccountError>())));
    await host(t, s, const InvoicePage(invoiceId: invitationId));
    await press(t, '核对并恢复原申请');
    final calls = a.requests.where((r) => r.path == path).toList();
    expect(calls.length, 2);
    expect(calls[0].headers['Idempotency-Key'],
        calls[1].headers['Idempotency-Key']);
    expect(calls[1].headers['If-Match'], '"4"');
    expect(calls[1].data, body);
    final before = a.requests.indexOf(calls.last);
    expect(
        a.requests[before - 1].path, '/api/v1/invoices/requests/$invitationId');
    expect(s.pending('POST', path, actingParty: personId), isNull);
  });
  testWidgets('412保留本次补件说明与抬头，重新核对后由本人再次提交', (t) async {
    var version = 2, writes = 0;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/invoices/requests/$invitationId') {
        return envelope(invoiceFixture(state: 'NEEDS_INFO', version: version));
      }
      if (r.path.endsWith('/history') || r.path.endsWith('/documents')) {
        return envelope({'items': [], 'next_cursor': null});
      }
      if (r.path.endsWith('/actions')) {
        writes++;
        version = 3;
        return envelope({'code': 'VERSION_CONFLICT'}, status: 412, error: true);
      }
      return a.defaultReply(r);
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const InvoicePage(invoiceId: invitationId));
    final name = find.widgetWithText(TextField, '抬头名称');
    await reveal(t, name);
    await t.enterText(name, '本次新抬头');
    final note = find.widgetWithText(TextField, '本次说明');
    await reveal(t, note);
    await t.enterText(note, '保留的补件说明');
    await press(t, '补交材料');
    expect(writes, 1);
    await reveal(t, note);
    expect(t.widget<TextField>(note).controller!.text, '保留的补件说明');
    await reveal(t, name);
    expect(t.widget<TextField>(name).controller!.text, '本次新抬头');
    await press(t, '补交材料');
    expect(writes, 2);
    final calls = a.requests.where((r) => r.path.endsWith('/actions')).toList();
    expect(calls[0].headers['If-Match'], '"2"');
    expect(calls[1].headers['If-Match'], '"3"');
    expect(calls[1].data['header']['title'], '本次新抬头');
  });
  testWidgets('当前票据与历史票据区分，金额归零不显示退款成功', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/invoices/requests/$invitationId') {
        return envelope({
          ...invoiceFixture(state: 'ISSUED'),
          'occupied_minor': 0,
          'requires_correction': true
        });
      }
      if (r.path.endsWith('/history')) {
        return envelope({'items': [], 'next_cursor': null});
      }
      if (r.path.endsWith('/documents')) {
        return envelope({
          'items': [documentFixture(state: 'SUPERSEDED')],
          'next_cursor': null
        });
      }
      return a.defaultReply(r);
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const InvoicePage(invoiceId: invitationId));
    await reveal(t, find.text('历史票据，已有更正'));
    expect(find.text('历史票据，已有更正'), findsOneWidget);
    expect(find.text('模拟凭证，非真实发票'), findsOneWidget);
    await reveal(t, find.text('已作金额归零更正；这不表示退款已完成。'));
    expect(find.text('已作金额归零更正；这不表示退款已完成。'), findsOneWidget);
    expect(find.text('订单退款变化，需人工核对更正。'), findsOneWidget);
    expect(find.text('审核申请'), findsNothing);
    expect(find.text('独立复核通过'), findsNothing);
  });
  testWidgets('切身份使迟到开票详情失效，不把原买家抬头带给新身份', (t) async {
    final held = Completer<void>();
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) async {
      if (r.path == '/api/v1/invoices/requests/$invitationId') {
        if (r.headers['X-Acting-Party'] == personId) {
          await held.future;
          return envelope(invoiceFixture());
        }
        return envelope({'code': 'INVOICE_NOT_FOUND'},
            status: 404, error: true);
      }
      if (r.path.endsWith('/history') || r.path.endsWith('/documents')) {
        return envelope({'items': [], 'next_cursor': null});
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const InvoicePage(invoiceId: invitationId));
    s.select(identity(orgId));
    await frames(t);
    held.complete();
    await frames(t);
    expect(find.text('测试抬头'), findsNothing);
    expect(s.isDomainDenied('/api/v1/invoices/'), isTrue);
    expect(t.takeException(), isNull);
  });
  testWidgets('未提交开票返回可取消并保留抬头和说明', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/eligibility')
            ? envelope(eligibilityFixture())
            : a.defaultReply(r));
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const InvoicePage(orderId: accountId));
    final name = find.widgetWithText(TextField, '抬头名称');
    await reveal(t, name);
    await t.enterText(name, '待提交抬头');
    await t.tap(find.byType(BackButton));
    await frames(t);
    expect(find.text('离开当前填写？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    expect(t.widget<TextField>(name).controller!.text, '待提交抬头');
  });
}
