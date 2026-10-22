import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/production/production_api.dart';
import 'package:jingjingshangri_app/production/production_models.dart';
import 'package:jingjingshangri_app/production/fulfillment_api.dart';
import 'package:jingjingshangri_app/production/fulfillment_models.dart';
import 'package:jingjingshangri_app/trade/trade_api.dart';
import 'package:jingjingshangri_app/trade/trade_models.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../trade/trade_fixtures.dart';
import 'production_fixtures.dart';
import 'fulfillment_fixtures.dart';

void main() {
  test('履约独立于PROJECT状态，保留真实规则、收讫与取消应退/实退', () {
    final p = ProductionRecord.parse(fulfillmentProjectData());
    final f = ProductionFulfillment(fulfillmentData(cancelled: true), p);
    expect(f.state, 'REFUND_REQUIRED');
    expect(f.cancellation!['refund_minor'], 2000);
    expect(f.cancellation!['actual_refunded_minor'], 0);
    expect(f.terms['acceptance_hours'], 168);
    final wrong = fulfillmentData()..['project_id'] = otherVersionId;
    expect(() => ProductionFulfillment(wrong, p), throwsA(isA<AccountError>()));
    final invalid = fulfillmentData();
    invalid['terms']['acceptance_hours'] = 0;
    expect(
        () => ProductionFulfillment(invalid, p), throwsA(isA<AccountError>()));
    final wrongOrder = fulfillmentData()..['order_id'] = otherVersionId;
    expect(() => ProductionFulfillment(wrongOrder, p),
        throwsA(isA<AccountError>()));
  });
  test('自动超期确认不是本人确认，允许checklist为空和created_by为空', () {
    final raw = productionData('FEEDBACK')..['created_by'] = null;
    raw['data'].addAll({
      'decision': 'ACCEPT',
      'checklist': null,
      'acceptance_method': 'AGREED_TIMEOUT'
    });
    expect(ProductionRecord.parse(raw).data['acceptance_method'],
        'AGREED_TIMEOUT');
    raw['data']['acceptance_method'] = 'BUYER_EXPLICIT';
    expect(() => ProductionRecord.parse(raw), throwsA(isA<AccountError>()));
  });
  test('原故事绑定原订单source，不读后来修改的需求或公开替代', () async {
    final a = fulfillmentAdapter(),
        s = await buyerSession(a),
        api = ProductionApi(s);
    final p = await api.record(productionProjectId, kind: 'PROJECT');
    final f = await api.fulfillment(p), story = await api.story(p, f);
    expect(story.answers['story'], contains('原订单固定'));
    final req = a.requests.last;
    expect(req.path, '/api/v1/production/projects/$productionProjectId/story');
    expect(req.headers['X-Acting-Party'], personId);
    final changed = fulfillmentStoryData()..['submission_id'] = otherVersionId;
    expect(() => ProductionStory(changed, f), throwsA(isA<AccountError>()));
  });
  test('问题请求IfMatch使用PROJECT履约版本，503恢复原内容原版本原key', () async {
    var count = 0;
    final a = fulfillmentAdapter(
        override: (r) => r.path.endsWith('/cases') && ++count == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : null);
    final s = await buyerSession(a),
        api = ProductionApi(s),
        p = ProductionRecord.parse(fulfillmentProjectData()),
        f = ProductionFulfillment(fulfillmentData(version: 8),
            ProductionRecord.parse(fulfillmentProjectData()));
    final body = {
      'kind': 'CANCEL',
      'reason': '保留这次原取消说明',
      'evidence_asset_ids': <String>[]
    };
    await expectLater(api.changeFulfillment(p, f, 'cases', body),
        throwsA(isA<AccountError>()));
    final original = a.requests.last, path = original.path;
    expect(original.headers['If-Match'], '"8"');
    await expectLater(
        api.changeFulfillment(p, f, 'cases', {...body, 'reason': '另一份说明'}),
        throwsA(isA<AccountError>()));
    await api.retryFulfillment(p, path);
    expect(a.requests.last.data, original.data);
    expect(a.requests.last.headers['If-Match'], original.headers['If-Match']);
    expect(a.requests.last.headers['Idempotency-Key'],
        original.headers['Idempotency-Key']);
    expect(s.productionPending, isEmpty);
  });
  test('未成功打开或错误通知不能标已读，更不能提交收讫', () async {
    final a = fulfillmentAdapter(viewed: true),
        s = await buyerSession(a),
        api = ProductionApi(s);
    final p = ProductionRecord.parse(fulfillmentProjectData()),
        v = ProductionRecord.parse(productionData('VERSION')),
        f = ProductionFulfillment(fulfillmentData(viewed: true), p);
    await expectLater(api.receiveDeliveryNotice(p, f, v, contentOpened: false),
        throwsA(isA<AccountError>()));
    expect(
        a.requests.where((r) =>
            r.method == 'POST' &&
            (r.path.startsWith('/api/v1/production/') ||
                r.path.startsWith('/api/v1/operations/'))),
        isEmpty);
    final notObserved = ProductionFulfillment(fulfillmentData(), p);
    await expectLater(
        api.receiveDeliveryNotice(p, notObserved, v, contentOpened: true),
        throwsA(isA<AccountError>()));
    expect(
        a.requests.where((r) =>
            r.method == 'POST' &&
            (r.path.startsWith('/api/v1/production/') ||
                r.path.startsWith('/api/v1/operations/'))),
        isEmpty);
  });
  test('成功打开后读取精确通知→已读→刷新PROJECT履约→明确收讫，服务器给期限', () async {
    final a = fulfillmentAdapter(viewed: true),
        s = await buyerSession(a),
        api = ProductionApi(s);
    final p = ProductionRecord.parse(fulfillmentProjectData()),
        v = ProductionRecord.parse(productionData('VERSION'));
    final read = await api.receiveDeliveryNotice(
        p, ProductionFulfillment(fulfillmentData(viewed: true), p), v,
        contentOpened: true);
    expect(a.requests.last.path, endsWith('/fulfillment'));
    expect(
        a.requests.where((r) => r.path.endsWith('/delivery-receipt')), isEmpty);
    final result = await api.changeFulfillment(p, read, 'delivery-receipt', {});
    expect(a.requests.last.headers['If-Match'], '"4"');
    expect(result.receipt!['deadline_at'], '2026-10-29T00:00:00.000Z');
    expect(result.receipt!['started_at'], fulfillmentDate);
  });
  test('纠错不受创意修改额度拦截；V5修改必须明确change_kind', () async {
    final a = fulfillmentAdapter(),
        s = await buyerSession(a),
        api = ProductionApi(s);
    final raw = fulfillmentProjectData();
    raw['data']['change_requests'] = 999;
    final p = ProductionRecord.parse(raw),
        v = ProductionRecord.parse(productionData('VERSION'));
    expect(() => api.feedback(v, p, 'REQUEST_CHANGES', '纠正原约定错误', null),
        throwsA(isA<AccountError>()));
    await api.feedback(v, p, 'REQUEST_CHANGES', '纠正原约定错误', null,
        changeKind: 'PLATFORM_CORRECTION');
    expect(a.requests.last.data['change_kind'], 'PLATFORM_CORRECTION');
    expect(a.requests.last.headers['If-Match'], '"3"');
  });
  for (final status in [403, 404]) {
    test('履约$status独立清空制作私有上下文和原请求', () async {
      final a = fulfillmentAdapter(
              override: (r) => r.path.endsWith('/fulfillment')
                  ? envelope({'code': 'PRODUCTION_NOT_FOUND'},
                      status: status, error: true)
                  : null),
          s = await buyerSession(a);
      await expectLater(
          ProductionApi(s)
              .fulfillment(ProductionRecord.parse(fulfillmentProjectData())),
          throwsA(isA<AccountError>()));
      expect(s.productionAccessDenied, true);
      expect(s.productionPending, isEmpty);
    });
  }
  test('换身份A→B→A后迟到的履约写失败不能重建原请求', () async {
    final gate = Completer<ResponseBody>();
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) =>
            r.path.endsWith('/cases') ? gate.future : a.defaultReply(r));
    final s = await buyerSession(a);
    final api = ProductionApi(s),
        p = ProductionRecord.parse(fulfillmentProjectData());
    final result = api.changeFulfillment(
        p,
        ProductionFulfillment(fulfillmentData(), p),
        'cases',
        {'kind': 'CANCEL', 'reason': '原说明', 'evidence_asset_ids': []});
    final expected = expectLater(result, throwsA(isA<AccountError>()));
    s.select(identity(orgId));
    s.select(identity(personId));
    gate.complete(
        envelope({'code': 'SERVICE_UNAVAILABLE'}, status: 503, error: true));
    await expected;
    expect(s.productionPending, isEmpty);
  });
  test('对方私人售后证据在发请求前拒绝，项目可见不扩大证据权限', () async {
    final a = fulfillmentAdapter(),
        s = await buyerSession(a),
        api = ProductionApi(s),
        raw = fulfillmentData(issue: true);
    raw['cases'][0]['data']['opened_by_party_id'] = orgId;
    raw['cases'][0]['data']['evidence_asset_ids'] = [productionFileId];
    final p = ProductionRecord.parse(fulfillmentProjectData()),
        f = ProductionFulfillment(raw, p);
    await expectLater(api.caseEvidence(p, f.cases.single, productionFileId),
        throwsA(isA<AccountError>()));
    expect(a.requests.where((r) => r.path.contains('/evidence/')), isEmpty);
  });
  test('旧定制缺条款不能建付款；MANUAL_SAMPLE两期原快照可读不加中款', () async {
    final a = fulfillmentAdapter(), s = await buyerSession(a);
    final raw = tradeData('ORDER', status: 'OPEN');
    raw['data']['quote']['customization'] = {
      'request_id': otherVersionId,
      'submission_id': productionVersionId,
      'content_sha256': 'c' * 64
    };
    raw['data']['quote']['lines'][0]
        ['product_profile'] = {'version': 'V5', 'type': 'MANUAL_SAMPLE'};
    raw['data']['quote']['lines'][0]['unit_minor'] = 10000;
    raw['data']['quote']['lines'][0]['total_minor'] = 10000;
    raw['data']['quote']['total_minor'] = 10000;
    raw['data']['quote']['installments'] = [
      for (final step in [
        ('first', 'ORDER_ACCEPTED'),
        ('final', 'FINAL_ACCEPTED')
      ])
        {
          'key': step.$1,
          'trigger': step.$2,
          'allocations': [
            {'line_id': 'production', 'amount_minor': 5000}
          ],
          'apple_product_id': null
        }
    ];
    final old = TradeRecord.parse(raw, personId);
    expect(() => TradeApi(s).payment(old, old.quote['installments'][0]['key']),
        throwsA(isA<AccountError>()));
    expect(
        a.requests.where((r) => r.path == '/api/v1/trade/payments'), isEmpty);
    raw['data']['quote']['lines'][0]['specification']
        ['customization_delivery'] = fulfillmentTerms();
    final manual = TradeRecord.parse(raw, personId);
    expect(tradeCustomizationRulesReady(manual), true);
    expect(manual.quote['installments'], old.quote['installments']);
    expect(manual.quote['installments'].length, 2);
    expect(manual.quote['installments'].map((i) => i['trigger']).toList(),
        ['ORDER_ACCEPTED', 'FINAL_ACCEPTED']);
    expect(
        manual.quote['installments']
            .map((i) => i['allocations'][0]['amount_minor'])
            .toList(),
        [5000, 5000]);
    expect(
        manual.quote['lines'][0]['specification']['customization_delivery']
            ['preview_payment_order'],
        'PREVIEW_BEFORE_INTERIM');
  });
}
