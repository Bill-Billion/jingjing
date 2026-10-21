import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/customization/customization_api.dart';
import 'package:jingjingshangri_app/customization/customization_models.dart';
import 'package:jingjingshangri_app/trade/trade_api.dart';
import 'package:jingjingshangri_app/trade/trade_models.dart';

import '../account/fake_account_api.dart';
import '../contracts/contract_fixtures.dart' show ruleData;
import '../trade/trade_fixtures.dart';
import 'customization_fixtures.dart';

Map<String, dynamic> storyTrade(String kind) {
  final raw = tradeData(kind);
  final quote = kind == 'ORDER' ? raw['data']['quote'] : raw['data'];
  quote['customization'] = {
    'request_id': requestId,
    'submission_id': submissionId,
    'content_sha256': 'c' * 64,
  };
  quote['installments'] = [
    for (final node in [
      ('deposit', 'ORDER_ACCEPTED', 38400),
      ('interim', 'CUSTOMIZATION_INTERIM_CONFIRMED', 76800),
      ('balance', 'FINAL_ACCEPTED', 12801),
    ])
      {
        'key': node.$1,
        'trigger': node.$2,
        'allocations': [
          {'line_id': 'production', 'amount_minor': node.$3}
        ],
        'apple_product_id': null,
      },
  ];
  quote['customization_finance'] = {
    'model': 'V5_SELF_OPERATED',
    'platform_party_id': orgId,
    'rounding': 'HALF_UP_PLATFORM_REMAINDER',
    'rules': {
      'version': '合成财务条款',
      'settlement_at': '2026-10-20T01:00:00.000Z',
      'release_condition': 'DELIVERY_ACCEPTED',
      'terms': '仅合成测试；以保存的固定条款办理，不是正式费率。',
      'lines': [
        {
          'line_id': 'production',
          'shares': [
            {'party_id': orgId, 'bps': 6667, 'role': 'PLATFORM'},
            {'party_id': personId, 'bps': 3333, 'role': 'PRODUCER'},
          ],
          'deductions': [],
        }
      ],
    },
    'rule_snapshot': {
      'content': ruleData(),
      'current_status': 'EFFECTIVE',
      'effective_at': '2026-10-20T01:00:00.000Z',
    },
  };
  return raw;
}

void main() {
  test('主需求仍受理中也能解析开放补充，并恢复独立草稿与逐项回复', () {
    final request = StoryRequest(story(status: 'INTAKE', version: 3));
    final supplement = StorySupplementContext(supplementContext(), request);
    expect(request.allows('SAVE'), false);
    expect(supplement.open, true);
    expect(supplement.allows('SAVE_SUPPLEMENT'), true);
    expect(supplement.answers!['story'], '补充草稿文字');
    expect(supplement.responses['story'], '补充说明');
    expect(request.answers['story'], '保存过的文字');
  });
  test('补充项目必须来自原模板，回复不能混入其他字段或把空回复当正式提交', () {
    final request = StoryRequest(story(status: 'INTAKE'));
    final invalid = supplementContext();
    invalid['supplement']['items'][0]['field_key'] = 'unknown';
    expect(() => StorySupplementContext(invalid, request),
        throwsA(isA<AccountError>()));
    final replied =
        supplementContext(open: false, responses: const {'story': ''});
    final resubmitted =
        StoryRequest(story(status: 'SUBMITTED', formalId: nextSubmissionId));
    expect(() => StorySupplementContext(replied, resubmitted),
        throwsA(isA<AccountError>()));
    final other = supplementContext(responses: const {'style': '未要求的字段'});
    expect(() => StorySupplementContext(other, request),
        throwsA(isA<AccountError>()));
  });
  test('开放补件和已回复补件必须对应本次读取的正式提交，草稿版本可继续前进', () {
    final previous = StoryRequest(story(status: 'INTAKE', version: 3));
    final nextOpen = supplementContext(version: 9);
    nextOpen['supplement']['base_submission_id'] = nextSubmissionId;
    for (final value in [
      nextOpen,
      supplementContext(open: false, version: 9)
    ]) {
      expect(
          () => StorySupplementContext(value, previous),
          throwsA(isA<AccountError>().having(
              (e) => e.code, 'code', 'CUSTOMIZATION_FORMAL_VERSION_CHANGED')));
    }
    final latest = StoryRequest(
        story(status: 'INTAKE', version: 7, formalId: nextSubmissionId));
    expect(StorySupplementContext(nextOpen, latest).version, 9);
    expect(
        StorySupplementContext(
                supplementContext(open: false, version: 9), latest)
            .responses['story'],
        '补充说明');
    expect(
        StorySupplementContext(supplementContext(version: 9), previous).version,
        9);
  });
  test('补充保存使用上下文顶层版本，整份替换answers及responses并保留清空值', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/supplement')
            ? envelope(supplementContext(
                version: 9,
                answers: const {'story': '', 'style': ''},
                responses: const {'story': ''}))
            : adapter.defaultReply(r));
    final api = CustomizationApi(await storySession(adapter));
    final request = StoryRequest(story(status: 'INTAKE', version: 3));
    await api.saveSupplement(
        request,
        StorySupplementContext(supplementContext(version: 8), request),
        {'story': '', 'style': ''},
        {'story': ''});
    final sent = adapter.requests.last;
    expect(sent.headers['If-Match'], '"8"');
    expect(sent.headers['X-Acting-Party'], personId);
    expect(sent.data, {
      'answers': {'story': '', 'style': ''},
      'responses': {'story': ''}
    });
  });
  test('补充未知结果保留原正文版本和请求键，不能换内容重建', () async {
    var writes = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/supplement')
            ? ++writes == 1
                ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                    status: 503, error: true)
                : envelope(supplementContext(version: 5))
            : adapter.defaultReply(r));
    final api = CustomizationApi(await storySession(adapter));
    final request = StoryRequest(story(status: 'INTAKE', version: 3));
    final context = StorySupplementContext(supplementContext(), request);
    await expectLater(
        api.saveSupplement(
            request, context, {'story': '原答案'}, {'story': '原回复'}),
        throwsA(isA<AccountError>()));
    final first = adapter.requests.last;
    await expectLater(
        api.saveSupplement(
            request, context, {'story': '换答案'}, {'story': '原回复'}),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PENDING_OPERATION_CHANGED')));
    await api.retrySupplement(request, api.pending(id: requestId)!);
    expect(adapter.requests.last.data, first.data);
    expect(adapter.requests.last.headers['If-Match'], '"4"');
    expect(adapter.requests.last.headers['Idempotency-Key'],
        first.headers['Idempotency-Key']);
    expect(api.pending(id: requestId), null);
  });
  test('正式重提与保存分开，正文为空且使用补充上下文版本', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/supplement-submissions')
            ? envelope(story(status: 'SUBMITTED', version: 6))
            : adapter.defaultReply(r));
    final api = CustomizationApi(await storySession(adapter));
    final request = StoryRequest(story(status: 'INTAKE', version: 3));
    final result = await api.submitSupplement(request,
        StorySupplementContext(supplementContext(version: 5), request));
    expect(result.status, 'SUBMITTED');
    expect(adapter.requests.last.data, {});
    expect(adapter.requests.last.headers['If-Match'], '"5"');
  });
  test('历史正式版本读取当时的模板答案、补件要求及正式回复', () {
    final version = StorySubmissionVersion(
        submissionVersion(), requestId, nextSubmissionId);
    expect(version.responses['story'], '当时的正式回复');
    expect(version.items.single.data['reason'], '背景不够明确');
    expect(version.answers['story'], '保存过的文字');
    expect(
        () => StorySubmissionVersion(
            submissionVersion(), secondRequestId, nextSubmissionId),
        throwsA(isA<AccountError>()));
  });
  test('需求内历史及报价分页原样发送服务器游标及当前责任主体', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/quotes')) {
        return envelope({
          'items': [storyQuoteSummary(quoteId)],
          'next_cursor':
              r.queryParameters['cursor'] == null ? 'quote-cursor' : null
        });
      }
      if (r.path.endsWith('/submissions')) {
        return envelope({
          'items': [historySummary()],
          'next_cursor': null
        });
      }
      return adapter.defaultReply(r);
    });
    final api = CustomizationApi(await storySession(adapter));
    final first = await api.quotes(requestId);
    await api.quotes(requestId, cursor: first.cursor);
    expect(adapter.requests.last.queryParameters,
        {'limit': 20, 'cursor': 'quote-cursor'});
    expect(adapter.requests.last.headers['X-Acting-Party'], personId);
    expect((await api.history(requestId)).items.single.number, 1);
  });
  test('补充延迟响应在切换主体后丢弃', () async {
    final reply = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/supplement')
            ? reply.future
            : adapter.defaultReply(r));
    final session = await storySession(adapter);
    final pending = CustomizationApi(session)
        .supplement(StoryRequest(story(status: 'INTAKE')));
    session.select(identity(orgId));
    reply.complete(envelope(supplementContext()));
    await expectLater(
        pending,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
  });
  test('定制报价支持中间补款节点及固定财务约定，原商品金额保持不变', () {
    final quote = TradeRecord.parse(storyTrade('QUOTE'), personId);
    expect(quote.amount, 128001);
    expect(quote.quote['installments'][1]['trigger'],
        'CUSTOMIZATION_INTERIM_CONFIRMED');
    expect(quote.quote['customization_finance']['rules']['release_condition'],
        'DELIVERY_ACCEPTED');
    final invalid = storyTrade('QUOTE');
    invalid['data']['customization_finance']['rules']['lines'][0]['shares'][0]
        ['bps'] = 1;
    expect(() => TradeRecord.parse(invalid, personId),
        throwsA(isA<AccountError>()));
  });
  test('普通机构成员能查看自己的需求不等于有权确认交易订单', () async {
    final session = await storySession(FakeAccountAdapter());
    session.selected = identity(personId, owner: false);
    expect(
        () => TradeApi(session)
            .accept(TradeRecord.parse(storyTrade('QUOTE'), personId)),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'TRADE_PARTY_FORBIDDEN')));
  });
}
