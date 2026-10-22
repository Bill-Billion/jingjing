import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/trade/trade_api.dart';
import 'package:jingjingshangri_app/trade/trade_models.dart';
import '../account/fake_account_api.dart';
import 'trade_fixtures.dart';

Future<AccountSession> buyerSession(FakeAccountAdapter adapter) async {
  final s = AccountSession(api: adapter.createApi());
  await s.login('13800000000', invitationId, '123456');
  s.select(identity(personId));
  return s;
}

void main() {
  test('整数分精确展示与元输入，不接受浮点、指数或超过范围金额', () {
    expect(tradeMoney(128001), '¥1,280.01');
    expect(tradeMoney(900000000000), '¥9,000,000,000.00');
    expect(tradeMoney(1), '¥0.01');
    expect(tradeParseYuan('380.01'), 38001);
    expect(tradeParseYuan('1.005'), null);
    expect(tradeParseYuan('1e3'), null);
    expect(tradeParseYuan('9000000000.01'), null);
    expect(tradeMinor(1.0), false);
  });
  test('数字人创建托管认证独立规格，冻结原服务与价格且不填影视秒数', () {
    Map<String, dynamic> serviceQuote(String kind) {
      final q = jsonDecode(jsonEncode(tradeData('QUOTE')))
              as Map<String, dynamic>,
          d = q['data'] as Map<String, dynamic>;
      final amount = kind == 'AVATAR_CREATION'
          ? 6000
          : kind == 'AVATAR_HOSTING'
              ? 8700
              : 1000;
      final spec = <String, dynamic>{
        'version': '已审1',
        'service_tier': '原服务档位',
        'deliverables': ['档案或服务结果'],
        'terms': '原约定',
        'service': {
          'kind': kind,
          'unit': kind == 'AVATAR_CREATION'
              ? 'PERSON_FIRST'
              : kind == 'AVATAR_HOSTING'
                  ? 'AVATAR_MONTH'
                  : 'HALO_APPLICATION',
          'rule_version': '规则1',
          'source_ref': '原来源',
          'retry_limit': kind == 'AVATAR_CREATION' ? 2 : 0,
          'hosting_months': kind == 'AVATAR_HOSTING' ? 3 : null,
          'halo_level': kind == 'HALO_REVIEW' ? 2 : null,
          'failure_policy': 'REFUND_UNDELIVERED'
        }
      };
      final line = d['lines'][0] as Map<String, dynamic>;
      line.addAll({
        'product_profile': {'version': 'V5', 'type': kind},
        'line_kind': 'OTHER',
        'unit_minor': amount,
        'total_minor': amount,
        'specification': spec
      });
      d.addAll({
        'total_minor': amount,
        'transaction_model': 'PLATFORM_PRINCIPAL',
        'installments': [
          {
            'key': 'service',
            'trigger': 'ORDER_ACCEPTED',
            'allocations': [
              {'line_id': line['line_id'], 'amount_minor': amount}
            ],
            'apple_product_id': null
          }
        ],
        'artist_service': {
          'service_id': quoteId,
          'person_id': orderId,
          'avatar_id': kind == 'HALO_REVIEW' ? null : paymentId,
          'service_sha256': 'a' * 64,
          'kind': kind,
          'spec_id': line['spec_id'],
          'specification': jsonDecode(jsonEncode(spec)),
          'price_minor': amount
        }
      });
      return q;
    }

    for (final kind in artistServiceNames.keys) {
      expect(TradeRecord.parse(serviceQuote(kind), personId).kind, 'QUOTE');
    }
    for (final alter in <void Function(Map<String, dynamic>)>[
      (d) => d['artist_service']['price_minor']++,
      (d) => d['artist_service']['person_id'] = 'invalid',
      (d) => d['lines'][0]['specification']['sample_seconds'] = 0,
      (d) => d['lines'][0]['specification']['service']['retry_limit'] = 1,
      (d) => d['lines'][0]['product_profile']['type'] = 'PRIVATE_CUSTOMIZATION',
      (d) => d.remove('artist_service'),
      (d) => d['transaction_model'] = 'DIRECT_SUPPLIER',
      (d) => d['installments'][0]['trigger'] = 'SAMPLE_ACCEPTED',
    ]) {
      final q = serviceQuote('AVATAR_HOSTING');
      alter(q['data']);
      expect(
          () => TradeRecord.parse(q, personId), throwsA(isA<AccountError>()));
    }
  });
  test('真实DTO无需动作、昵称或创建时间，合同直接读取内嵌未签署快照', () {
    for (final k in ['QUOTE', 'ORDER', 'PAYMENT', 'REFUND', 'LEGACY']) {
      final r = TradeRecord.parse(tradeData(k), personId);
      expect(r.kind, k);
    }
    final o = TradeRecord.parse(tradeData('ORDER'), personId);
    expect(o.data['contract']['signing_method'], 'NOT_SIGNED');
    expect(o.raw.containsKey('allowed_actions'), false);
  });
  test('拒绝越权、错误分项总价、未知状态与伪造已签署合同', () {
    final wrong = tradeData('QUOTE');
    wrong['data']['lines'][0]['total_minor'] = 128000;
    expect(
        () => TradeRecord.parse(wrong, personId), throwsA(isA<AccountError>()));
    expect(() => TradeRecord.parse(tradeData('QUOTE'), invitedOrgId),
        throwsA(isA<AccountError>()));
    expect(
        () => TradeRecord.parse(
            tradeData('ORDER', status: 'COMPLETED'), personId),
        throwsA(isA<AccountError>()));
    final o = tradeData('ORDER');
    o['data']['contract']['signing_method'] = 'SIGNED';
    expect(() => TradeRecord.parse(o, personId), throwsA(isA<AccountError>()));
  });
  test('买方确认原报价指纹与版本，所有普通操作发送身份、Bearer与幂等键', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/acceptance')
            ? envelope(tradeData('ORDER'))
            : adapter.defaultReply(r));
    final s = await buyerSession(adapter);
    final r = await TradeApi(s)
        .accept(TradeRecord.parse(tradeData('QUOTE'), personId));
    expect(r.kind, 'ORDER');
    final request = adapter.requests.last;
    expect(request.data, {'quote_sha256': 'c' * 64});
    expect(request.headers['If-Match'], '"2"');
    expect(request.headers['X-Acting-Party'], personId);
    expect(request.headers['Authorization'], 'Bearer ${'x' * 43}');
    expect(request.headers['Idempotency-Key'], isNotEmpty);
  });
  test('503统一错误后保留原内容、版本和key，重试可返回当前状态', () async {
    late FakeAccountAdapter adapter;
    var attempts = 0;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/acceptance')
            ? (++attempts == 1
                ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                    status: 503, error: true)
                : envelope(tradeData('ORDER', status: 'PAID')))
            : r.path.endsWith(quoteId)
                ? envelope(tradeData('QUOTE'))
                : adapter.defaultReply(r));
    final s = await buyerSession(adapter), api = TradeApi(s);
    final q = TradeRecord.parse(tradeData('QUOTE'), personId);
    await expectLater(api.accept(q), throwsA(isA<AccountError>()));
    final pending = s.tradePending.single;
    expect(pending['body'], {'quote_sha256': q.hash});
    expect(pending['version'], 2);
    final key = adapter.requests.last.headers['Idempotency-Key'];
    final result = await api.retry('/api/v1/trade/quotes/$quoteId/acceptance');
    expect(result.status, 'PAID');
    expect(adapter.requests.last.headers['Idempotency-Key'], key);
    expect(s.tradePending, isEmpty);
  });
  test('响应记录校验失败仍保留已知结果编号，不能换内容', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/payments')
            ? envelope({'id': paymentId})
            : adapter.defaultReply(r));
    final s = await buyerSession(adapter), api = TradeApi(s);
    await expectLater(
        api.payment(TradeRecord.parse(tradeData('ORDER'), personId), 'deposit'),
        throwsA(isA<AccountError>()));
    expect(s.tradePending.single['resultId'], paymentId);
    await expectLater(
        api.write('/api/v1/trade/payments',
            {'order_id': orderId, 'installment_key': 'different'}),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PENDING_OPERATION_CHANGED')));
  });
  test('412清除旧决定，重新读取的hash及版本才能重新确认', () async {
    late FakeAccountAdapter adapter;
    var attempts = 0;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/acceptance')) {
        return ++attempts == 1
            ? envelope({'code': 'PRECONDITION_FAILED'},
                status: 412, error: true)
            : envelope(tradeData('ORDER'));
      }
      if (r.path.endsWith(quoteId)) {
        final q = tradeData('QUOTE');
        q['content_sha256'] = 'd' * 64;
        q['object_version'] = 3;
        return envelope(q);
      }
      return adapter.defaultReply(r);
    });
    final s = await buyerSession(adapter), api = TradeApi(s);
    await expectLater(
        api.accept(TradeRecord.parse(tradeData('QUOTE'), personId)),
        throwsA(isA<AccountError>()));
    expect(s.tradePending, isEmpty);
    await api.accept(await api.record(quoteId));
    expect(adapter.requests.last.data, {'quote_sha256': 'd' * 64});
    expect(adapter.requests.last.headers['If-Match'], '"3"');
  });
  test('每次读取都发请求，403和404清理交易私有权限', () async {
    for (final status in [403, 404]) {
      late FakeAccountAdapter adapter;
      var count = 0;
      adapter = FakeAccountAdapter(
          handler: (r) => r.path.endsWith(quoteId)
              ? ++count <= 2
                  ? envelope(tradeData('QUOTE'))
                  : envelope({'code': 'TRADE_NOT_FOUND'},
                      status: status, error: true)
              : adapter.defaultReply(r));
      final s = await buyerSession(adapter), api = TradeApi(s);
      await api.record(quoteId);
      await api.record(quoteId);
      expect(count, 2);
      await expectLater(api.record(quoteId), throwsA(isA<AccountError>()));
      expect(s.tradeAccessDenied, true);
    }
  });
  test('身份切换丢弃迟到回包和旧幂等恢复内容，成员不可操作', () async {
    final response = Completer<void>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) async {
      if (r.path.endsWith('/acceptance')) {
        await response.future;
        return envelope({'code': 'SERVICE_UNAVAILABLE'},
            status: 503, error: true);
      }
      return adapter.defaultReply(r);
    });
    final s = await buyerSession(adapter);
    final write =
        TradeApi(s).accept(TradeRecord.parse(tradeData('QUOTE'), personId));
    s.select(identity(orgId));
    response.complete();
    await expectLater(
        write,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    expect(s.tradePending, isEmpty);
    s.select(identity(personId, owner: false));
    expect(() => TradeApi(s).owner(), throwsA(isA<AccountError>()));
  });
  test('退出与重新登录清理旧交易权限拒绝状态', () async {
    final adapter = FakeAccountAdapter();
    final s = await buyerSession(adapter);
    s.denyTrade();
    expect(s.tradeAccessDenied, true);
    await s.logout();
    expect(s.tradeAccessDenied, false);
    await s.login('13800000000', invitationId, '123456');
    await s.loadParties();
    expect(TradeApi(s).owner(), orgId);
  });
  test('支付宝核对transaction_id=null，Apple必须实际交易编号且不传If-Match', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/reconciliation')
            ? envelope(tradeData('PAYMENT'))
            : adapter.defaultReply(r));
    final s = await buyerSession(adapter), api = TradeApi(s);
    await api.reconcile(TradeRecord.parse(tradeData('PAYMENT'), personId),
        transaction: 'ignored');
    expect(adapter.requests.last.data, {'transaction_id': null});
    expect(adapter.requests.last.headers.containsKey('If-Match'), false);
    expect(
        () => api.reconcile(TradeRecord.parse(
            tradeData('PAYMENT', provider: 'APPLE'), personId)),
        throwsA(isA<AccountError>()));
    await api.reconcile(
        TradeRecord.parse(tradeData('PAYMENT', provider: 'APPLE'), personId),
        transaction: 'actual-transaction');
    expect(
        adapter.requests.last.data, {'transaction_id': 'actual-transaction'});
  });
  test('逐项退款扣除审核中与未知申请，拒绝超额或未核实付款', () async {
    final p = TradeRecord.parse(tradeData('PAYMENT'), personId);
    final raw = tradeData('REFUND', status: 'UNKNOWN');
    raw['data']['amount_minor'] = 10000;
    raw['data']['allocations'][0]['amount_minor'] = 10000;
    final existing = [TradeRecord.parse(raw, personId)];
    expect(tradeRefundRemaining(p, existing), {'production': 28001});
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/refunds')
            ? envelope(tradeData('REFUND'))
            : adapter.defaultReply(r));
    final api = TradeApi(await buyerSession(adapter));
    expect(
        () => api.refund(
            p,
            [
              {'line_id': 'production', 'amount_minor': 28002}
            ],
            '按原约定',
            existing),
        throwsA(isA<AccountError>()));
    expect(
        () => api.refund(
            TradeRecord.parse(
                tradeData('PAYMENT', status: 'UNKNOWN'), personId),
            [
              {'line_id': 'production', 'amount_minor': 1}
            ],
            '按原约定',
            []),
        throwsA(isA<AccountError>()));
    await api.refund(
        p,
        [
          {'line_id': 'production', 'amount_minor': 28001}
        ],
        '按原约定',
        existing);
    expect(adapter.requests.last.data['allocations'][0]['amount_minor'], 28001);
  });
  test('Apple仅全额退款，原样片节点交服务器核验，商家只能读其订单', () async {
    final api = TradeApi(await buyerSession(FakeAccountAdapter()));
    final p =
        TradeRecord.parse(tradeData('PAYMENT', provider: 'APPLE'), personId);
    expect(
        () => api.refund(
            p,
            [
              {'line_id': 'production', 'amount_minor': 1}
            ],
            '原约定',
            []),
        throwsA(isA<AccountError>()));
    final o = TradeRecord.parse(tradeData('ORDER'), personId);
    // PR16 allows the original acceptance installment; an unready server
    // response still cannot be promoted to a successful payment record.
    await expectLater(api.payment(o, 'sample'), throwsA(isA<AccountError>()));
    final s = await buyerSession(FakeAccountAdapter());
    s.select(identity(orgId));
    expect(
        () => TradeApi(s)
            .payment(TradeRecord.parse(tradeData('ORDER'), orgId), 'deposit'),
        throwsA(isA<AccountError>()));
  });
}
