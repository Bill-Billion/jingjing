import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/trade/trade_api.dart';
import 'package:jingjingshangri_app/trade/trade_models.dart';
import '../account/fake_account_api.dart';
import '../projects/project_fixtures.dart';
import 'trade_fixtures.dart';

Map<String, dynamic> clone(Map<String, dynamic> v) => jsonDecode(jsonEncode(v));
const holdId = 'd0000000-0000-4000-8000-000000000010';
const grantId = 'd0000000-0000-4000-8000-000000000011';
Map<String, dynamic> license() => {
      'scope': 'PERSONAL_NONCOMMERCIAL',
      'exclusive': false,
      'territory': 'WORLDWIDE',
      'duration': 'PERPETUAL',
      'personal_social_sharing': true,
      'acceptance_hours': 72,
      'aftercare_terms': '按本次约定核实收讫与售后。',
    };
Map<String, dynamic> covered({bool full = true}) {
  final q = clone(quoteData());
  q['transaction_model'] = 'PLATFORM_PRINCIPAL';
  q['channel'] = 'CUSTODY';
  q['customization'] = {
    'request_id': quoteId,
    'submission_id': orderId,
    'content_sha256': 'b' * 64
  };
  q['lines'][0]
      ['product_profile'] = {'version': 'V5', 'type': 'PRIVATE_CUSTOMIZATION'};
  final originals = clone({'rows': q['lines']})['rows'];
  final discount = full ? q['total_minor'] as int : 10000;
  q['total_minor'] -= discount;
  q['lines'][0]['unit_minor'] = q['total_minor'];
  q['lines'][0]['total_minor'] = q['total_minor'];
  q['installments'] = full
      ? []
      : [
          {
            'key': 'first',
            'trigger': 'ORDER_ACCEPTED',
            'allocations': [
              {'line_id': 'production', 'amount_minor': q['total_minor']}
            ]
          }
        ];
  q['discount'] = {
    'hold_id': holdId,
    'grant_id': grantId,
    'original_quote_sha256': 'c' * 64,
    'original_total_minor': 128001,
    'original_lines': originals,
    'discount_minor': discount,
    'rule_snapshot': {
      'kind': full ? 'PRODUCTION_FREE' : 'PRODUCTION_CREDIT',
      'terms': '开工核销，退款不返现。',
      'production': {
        'face_minor': discount,
        'minimum_minor': 128001,
        'spec_ids': [originals[0]['spec_id']]
      }
    },
    'coverage': full ? 'FULL' : 'PARTIAL',
    'source_kind': full ? 'PRODUCTION_FREE' : 'PRODUCTION_CREDIT',
    'refund_forfeit': true,
    'cashable': false
  };
  return q;
}

void main() {
  for (final linkedOrder in [false, true]) {
    test('参演订单未知结果先读取原约定、项目和进度后原键恢复：已有订单$linkedOrder', () async {
      const path = '/api/v1/trade/participation-checkout';
      final agreement = projectData('PARTICIPATION');
      final agreementId = agreement['id'] as String;
      final hash = agreement['content_sha256'] as String;
      final progressPath =
          '/api/v1/projects/participations/$agreementId/progress';
      final order = tradeData('ORDER');
      order['data']['quote']['participation'] = {
        'agreement_id': agreementId,
        'agreement_sha256': hash,
        'project_id': projectKey,
        'candidate_id': candidateKey,
        'avatar_id': avatarKey,
        'terms': agreement['data']['terms'],
        'cast': agreement['data']['cast'],
      };
      var posts = 0;
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(handler: (r) {
        if (r.path == path) {
          if (++posts == 1) {
            return envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                status: 503, error: true);
          }
          return envelope(order);
        }
        if (r.path == '/api/v1/projects/records/$agreementId') {
          return envelope(agreement);
        }
        if (r.path == '/api/v1/projects/records/$projectKey') {
          return envelope(projectData('PROJECT'));
        }
        if (r.path == progressPath) {
          return envelope({
            'agreement_id': agreementId,
            'order_id': linkedOrder ? orderId : null,
            'milestones': <Map<String, dynamic>>[],
          });
        }
        if (r.path == '/api/v1/trade/records/$orderId') {
          return envelope(order);
        }
        return adapter.defaultReply(r);
      });
      final session = AccountSession(api: adapter.createApi());
      await session.login('13800000000', invitationId, '123456');
      session.select(identity(personId));
      final api = TradeApi(session);
      await expectLater(api.participationCheckout(agreementId, hash, 'CUSTODY'),
          throwsA(isA<AccountError>()));
      final before = adapter.requests.length;
      await api.retry(path);
      final recovery = adapter.requests.skip(before).toList();
      expect(recovery.map((r) => '${r.method} ${r.path}').toList(), [
        'GET /api/v1/projects/records/$agreementId',
        'GET /api/v1/projects/records/$projectKey',
        'GET $progressPath',
        if (linkedOrder) 'GET /api/v1/trade/records/$orderId',
        'POST $path',
      ]);
      final attempts = adapter.requests.where((r) => r.path == path).toList();
      expect(attempts, hasLength(2));
      expect(attempts.first.data, attempts.last.data);
      expect(attempts.last.data, {
        'agreement_id': agreementId,
        'agreement_sha256': hash,
        'channel': 'CUSTODY',
      });
      expect(attempts.first.headers['Idempotency-Key'],
          attempts.last.headers['Idempotency-Key']);
      expect(attempts.first.headers['If-Match'],
          attempts.last.headers['If-Match']);
      expect(session.tradePending, isEmpty);
    });
  }
  test('现货许可无影视档位也能解析，扩大权利与错误范围被拒', () {
    final q = clone(quoteData()), l = q['lines'][0];
    l['specification'] = {
      'version': 'stock1',
      'terms': '个人许可',
      'stock_license': license()
    };
    q['stock_video'] = {
      'listing_id': quoteId,
      'offer_sha256': 'a' * 64,
      'license': {
        ...license(),
        'limited_to_buyer': true,
        'excluded': [
          'COMMERCIAL_ADVERTISING',
          'ADAPTATION',
          'DISTRIBUTION',
          'VOICE_SEPARATELY',
          'AI_REGENERATION',
          'SOURCE_OR_MODEL_FILES',
          'NEW_AVATAR_CONTENT',
          'EXCLUSIVE_BUYOUT'
        ]
      }
    };
    expect(() => validateTradeQuoteData(q), returnsNormally);
    q['stock_video']['license']['exclusive'] = true;
    expect(() => validateTradeQuoteData(q), throwsA(isA<AccountError>()));
  });
  test('试镜七字段约定与具体预约可读，不伪装演出授权', () {
    final q = clone(quoteData());
    q['lines'][0]['specification'] = {
      'version': 'audition1',
      'terms': '试镜',
      'audition': {
        'version': 'r1',
        'accept_hours': 24,
        'acceptance_hours': 72,
        'photo_count': 6,
        'video_count': 1,
        'payment_window_minutes': 30,
        'terms': '仅试镜服务'
      }
    };
    q['audition'] = {
      'booking_id': quoteId,
      'person_id': orderId,
      'avatar_id': paymentId,
      'offer_sha256': 'a' * 64,
      'performance_rights_granted': false,
      'appointment': {
        'mode': 'OFFLINE',
        'city': '北京',
        'venue': '公开试镜场所',
        'address': '合规场所',
        'starts_at': '2099-01-01T01:00:00Z',
        'ends_at': '2099-01-01T02:00:00Z',
        'purpose': '角色试镜'
      }
    };
    expect(() => validateTradeQuoteData(q), returnsNormally);
    q['audition']['performance_rights_granted'] = true;
    expect(() => validateTradeQuoteData(q), throwsA(isA<AccountError>()));
  });
  test('实际部分与全额权益保留原价；只有全额抵扣允许空付款节点', () {
    expect(() => validateTradeQuoteData(covered()), returnsNormally);
    expect(() => validateTradeQuoteData(covered(full: false)), returnsNormally);
    expect(tradeInstallments(covered()), isEmpty);
    final invalid = clone(quoteData())..['installments'] = [];
    expect(() => validateTradeQuoteData(invalid), throwsA(isA<AccountError>()));
    final changed = covered();
    changed['lines'][0]['specification']['terms'] = '偷换条款';
    expect(() => validateTradeQuoteData(changed), throwsA(isA<AccountError>()));
    final cash = covered();
    cash['discount']['cashable'] = true;
    expect(() => validateTradeQuoteData(cash), throwsA(isA<AccountError>()));
  });
  test('全额权益订单不冒充现金收款，不允许建立付款', () async {
    final raw = tradeData('ORDER', status: 'REWARD_FUNDED');
    raw['data']['quote'] = covered();
    final order = TradeRecord.parse(raw, personId);
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await session.login('13800000000', invitationId, '123456');
    session.select(identity(personId));
    expect(() => TradeApi(session).payment(order, 'first'),
        throwsA(isA<AccountError>()));
    raw['data']['financial']['received_minor'] = 1;
    raw['data']['financial']['net_minor'] = 1;
    expect(
        () => TradeRecord.parse(raw, personId), throwsA(isA<AccountError>()));
  });
  test('选券确认发送原报价指纹与两项预留，未知结果原键原体原版本重试', () async {
    var calls = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/trade/records/$quoteId') {
        return envelope(tradeData('QUOTE'));
      }
      if (!r.path.endsWith('/acceptance')) return adapter.defaultReply(r);
      if (++calls == 1) {
        return envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
            status: 503, error: true);
      }
      return envelope(tradeData('ORDER'));
    });
    final session = AccountSession(api: adapter.createApi());
    await session.login('13800000000', invitationId, '123456');
    session.select(identity(personId));
    final api = TradeApi(session),
        quote = TradeRecord.parse(tradeData('QUOTE'), personId);
    const selected = {
      'hold_id': holdId,
      'adjusted_quote_sha256':
          'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
    };
    await expectLater(api.accept(quote, rewardSelection: selected),
        throwsA(isA<AccountError>()));
    final path = '/api/v1/trade/quotes/${quote.id}/acceptance';
    await api.retry(path);
    final requests = adapter.requests.where((r) => r.path == path).toList();
    expect(requests, hasLength(2));
    expect(requests.first.headers['Idempotency-Key'],
        requests.last.headers['Idempotency-Key']);
    expect(
        requests.first.headers['If-Match'], requests.last.headers['If-Match']);
    expect(requests.first.data, requests.last.data);
    expect(requests.first.data,
        {'quote_sha256': quote.hash, 'reward_selection': selected});
  });
}
