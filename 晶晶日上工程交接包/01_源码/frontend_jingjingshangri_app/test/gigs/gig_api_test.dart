import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/gigs/gig_api.dart';
import 'package:jingjingshangri_app/gigs/gig_models.dart';
import 'package:jingjingshangri_app/gigs/gig_widgets.dart';
import 'package:jingjingshangri_app/trade/trade_models.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../supply/supply_fixtures.dart';
import 'gig_fixtures.dart';

void main() {
  test('真实 DTO 逐项验证、原文指纹和当前主体，拒绝假权限及更改原文', () {
    for (final kind in ['GIG', 'OFFER', 'RELATION', 'COMMISSION']) {
      expect(GigRecord.parse(gigData(kind), party: personId).kind, kind);
    }
    final r = gigData('OFFER');
    r['data']['terms'] = '篡改';
    expect(() => GigRecord.parse(r, party: personId),
        throwsA(isA<AccountError>()));
    expect(
        () => GigRecord.parse(gigData('OFFER'),
            party: '77777777-7777-4777-8777-777777777777'),
        throwsA(isA<AccountError>()));
    expect(
        () => GigRecord.parse({
              ...gigData('OFFER'),
              'allowed_actions': ['ACCEPT']
            }, party: personId),
        throwsA(isA<AccountError>()));
    expect(
        GigRecord.parse(gigData('COMMISSION'), party: invitedOrgId)
            .data['paid_out_minor'],
        0);
  });
  test('比例精确至万分比，数据不足榜单不含私有订单事实', () {
    expect(gigParsePercent('20.01'), 2001);
    expect(gigParsePercent(''), null);
    expect(gigParsePercent('1e2'), null);
    expect(gigParsePercent('100.01'), null);
    expect(gigParsePercent('1.001'), null);
    expect(gigPercent(5), '0.05%');
    expect(gigRanking(publicRanking(), id: rankingId)['data_status'],
        'INSUFFICIENT_DATA');
    final r = publicRanking();
    r['facts'] = [];
    expect(() => gigRanking(r, id: rankingId), throwsA(isA<AccountError>()));
    expect(
        GigCatalogue.parse(catalogue()).rules.single['rule']['categories'][1]
            ['allowed'],
        false);
  });
  test('买方确认当前精确条款指纹与 If-Match，普通业务需要 OWNER', () async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/acceptance')
            ? envelope(gigData('OFFER', status: 'ACCEPTED'))
            : a.defaultReply(r));
    final s = await buyerSession(a),
        api = GigApi(s),
        offer = GigRecord.parse(gigData('OFFER'), party: personId);
    await api.accept(offer);
    final request = a.requests.last;
    expect(request.data, {'offer_sha256': offer.hash});
    expect(request.headers['If-Match'], '"2"');
    expect(request.headers['X-Acting-Party'], personId);
    expect(request.headers['Authorization'], 'Bearer ${'x' * 43}');
    expect(request.headers['Idempotency-Key'], isNotEmpty);
    s.select(identity(orgId, owner: false));
    final count = a.requests.length;
    await expectLater(api.all('OFFER'), throwsA(isA<AccountError>()));
    expect(a.requests.length, count);
  });
  test('503未知结果保留同 key/body/version，先读取目标再恢复，不能更改决定', () async {
    late FakeAccountAdapter a;
    var tries = 0;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/acceptance')
            ? (++tries == 1
                ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                    status: 503, error: true)
                : envelope(gigData('OFFER', status: 'ACCEPTED')))
            : r.path.endsWith(offerId)
                ? envelope(gigData('OFFER'))
                : a.defaultReply(r));
    final s = await buyerSession(a), api = GigApi(s);
    await expectLater(
        api.accept(GigRecord.parse(gigData('OFFER'), party: personId)),
        throwsA(isA<AccountError>()));
    final path = '/api/v1/gigs/offers/$offerId/acceptance',
        key = a.requests.last.headers['Idempotency-Key'],
        original = s.gigsPending.single;
    await expectLater(
        api.write(path, {'offer_sha256': 'd' * 64}, version: 2),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PENDING_OPERATION_CHANGED')));
    expect((await api.retry(path)).status, 'ACCEPTED');
    expect(a.requests[a.requests.length - 2].path,
        '/api/v1/gigs/records/$offerId');
    expect(a.requests.last.headers['Idempotency-Key'], key);
    expect(a.requests.last.data, original['body']);
    expect(a.requests.last.headers['If-Match'], '"2"');
    expect(s.gigsPending, isEmpty);
  });
  test('错误成功响应仍保留已知结果编号，读取已知结果后同请求恢复', () async {
    late FakeAccountAdapter a;
    var tries = 0;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/requests')
            ? (++tries == 1
                ? envelope({'id': gigRecordId})
                : envelope(gigData('GIG', status: 'IN_REVIEW')))
            : r.path.endsWith(gigRecordId)
                ? envelope(gigData('GIG', status: 'IN_REVIEW'))
                : a.defaultReply(r));
    final s = await buyerSession(a), api = GigApi(s);
    await expectLater(
        api.createGig({'title': '原内容'}), throwsA(isA<AccountError>()));
    expect(s.gigsPending.single['resultId'], gigRecordId);
    final key = a.requests.last.headers['Idempotency-Key'];
    await api.retry('/api/v1/gigs/requests');
    expect(a.requests[a.requests.length - 2].path.endsWith(gigRecordId), true);
    expect(a.requests.last.headers['Idempotency-Key'], key);
  });
  test('412释放旧决定，重新读取新原文和版本后只能新确认', () async {
    late FakeAccountAdapter a;
    var tries = 0;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/acceptance')
            ? (++tries == 1
                ? envelope({'code': 'VERSION_CONFLICT'},
                    status: 412, error: true)
                : envelope(gigData('OFFER',
                    status: 'ACCEPTED', version: 4, terms: '最新条款')))
            : r.path.endsWith(offerId)
                ? envelope(gigData('OFFER', version: 3, terms: '最新条款'))
                : a.defaultReply(r));
    final s = await buyerSession(a), api = GigApi(s);
    await expectLater(
        api.accept(GigRecord.parse(gigData('OFFER'), party: personId)),
        throwsA(isA<AccountError>()));
    final oldKey = a.requests.last.headers['Idempotency-Key'];
    expect(s.gigsPending, isEmpty);
    final fresh = await api.record(offerId);
    await api.accept(fresh);
    expect(a.requests.last.headers['If-Match'], '"3"');
    expect(a.requests.last.data, {'offer_sha256': fresh.hash});
    expect(a.requests.last.headers['Idempotency-Key'], isNot(oldKey));
  });
  test('身份切换丢弃迟到回包和旧幂等请求，403清除私有上下文', () async {
    late FakeAccountAdapter a;
    final held = Completer<ResponseBody>();
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/acceptance')
            ? held.future
            : r.path.endsWith(offerId)
                ? envelope({'code': 'GIG_NOT_FOUND'}, status: 403, error: true)
                : a.defaultReply(r));
    final s = await buyerSession(a),
        api = GigApi(s),
        future = api.accept(GigRecord.parse(gigData('OFFER'), party: personId));
    s.select(identity(orgId));
    held.complete(
        envelope({'code': 'SERVICE_UNAVAILABLE'}, status: 503, error: true));
    await expectLater(
        future,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    expect(s.gigsPending, isEmpty);
    s.select(identity(personId));
    final before = s.epoch;
    await expectLater(api.record(offerId), throwsA(isA<AccountError>()));
    expect(s.epoch, greaterThan(before));
    expect(s.gigsAccessDenied, true);
    expect(s.gigsPending, isEmpty);
  });
  test('独立 GIG_REVIEW 动作不发送主体，并保留目标版本；MCN 不伪装成审核授权', () async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/reviews')
            ? envelope(gigData('OFFER'))
            : a.defaultReply(r));
    final s = await buyerSession(a);
    s.select(identity(orgId, owner: false));
    await GigApi(s).review(GigRecord.parse(gigData('OFFER')), 'APPROVED',
        '独立核对', review()['checks']);
    expect(a.requests.last.headers.containsKey('X-Acting-Party'), false);
    expect(a.requests.last.headers['If-Match'], '"2"');
    expect(a.requests.last.headers['Authorization'], isNotEmpty);
  });
  test('受控证明读取不走公开 URL，拥有者额外核对文件长度与哈希', () async {
    late FakeAccountAdapter a;
    var corrupt = false;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/evidence/$proofId')
            ? ResponseBody.fromBytes(corrupt ? [1, 2] : bytes, 200, headers: {
                'content-type': ['application/octet-stream']
              })
            : r.path.endsWith('/assets/$proofId')
                ? envelope(assetData(id: proofId, purpose: 'RIGHTS_EVIDENCE'))
                : a.defaultReply(r));
    final s = await buyerSession(a);
    s.select(identity(orgId));
    final api = GigApi(s), r = GigRecord.parse(gigData('OFFER'), party: orgId);
    expect(await api.evidence(r, proofId), bytes);
    corrupt = true;
    await expectLater(
        api.evidence(r, proofId),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PRIVATE_CONTENT_MISMATCH')));
    s.select(identity(personId));
    corrupt = false;
    final count = a.requests.length;
    expect(
        await api.evidence(
            GigRecord.parse(gigData('OFFER'), party: personId), proofId),
        bytes);
    expect(a.requests.length, count + 1);
    expect(a.requests.last.path,
        '/api/v1/gigs/records/$offerId/evidence/$proofId');
  });
  test('供给可选资料读取真实数字人和同意 DTO，不凭空声称生成已开通', () async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path == '/api/v1/supply/records'
            ? envelope({
                'items': [
                  supplyChoice(r.queryParameters['kind']),
                  if (r.queryParameters['kind'] == 'CONSENT')
                    supplyChoice('CONSENT',
                        id: relationId, status: 'PENDING_REVIEW')
                ],
                'next_cursor': null
              })
            : a.defaultReply(r));
    final s = await buyerSession(a);
    s.select(identity(orgId));
    final api = GigApi(s);
    expect(
        (await api.supplyChoices('AVATAR')).single['data']
            ['provider_asset_ref'],
        null);
    expect(
        (await api.supplyChoices('CONSENT')).first['data']
            ['identity_verification'],
        'NOT_VERIFIED');
  });
  test('同意选项必须本人、商业脸声、完整地区与期限，撤回和第三方均不可选', () {
    bool eligible(Map<String, dynamic> r) => gigConsentEligible(r,
        party: orgId,
        avatar: avatarId,
        scope: scope(),
        at: DateTime.utc(2026, 10, 3));
    expect(eligible(supplyChoice('CONSENT')), true);
    expect(eligible(supplyChoice('CONSENT', purpose: 'PRIVATE')), false);
    expect(eligible(supplyChoice('CONSENT', status: 'WITHDRAWN')), false);
    final third = supplyChoice('CONSENT');
    third['data']['consent']['subject_party_id'] = personId;
    expect(eligible(third), false);
    final face = supplyChoice('CONSENT');
    face['data']['consent']['features'] = ['FACE'];
    expect(eligible(face), false);
    final short = supplyChoice('CONSENT');
    short['data']['consent']['valid_until'] = '2030-01-01T00:00:00.000Z';
    expect(eligible(short), false);
  });
  test('商业快照进入真实订单合同，错误佣金或转为平台交易被拒绝', () {
    expect(
        TradeRecord.parse(commercialTrade('ORDER'), personId)
            .quote['commercial']['offer_id'],
        offerId);
    final bad = commercialTrade('QUOTE');
    bad['data']['commercial']['commission']['mcn_bps'] = 2001;
    expect(
        () => TradeRecord.parse(bad, personId), throwsA(isA<AccountError>()));
    final platform = commercialTrade('QUOTE');
    platform['data']['transaction_model'] = 'PLATFORM_PRINCIPAL';
    expect(() => TradeRecord.parse(platform, personId),
        throwsA(isA<AccountError>()));
  });
  test('佣金记录与变动保留实际沙盒事实和负退款差额，无出款', () async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/entries')
            ? envelope(entries())
            : a.defaultReply(r));
    final s = await buyerSession(a);
    final data = await GigApi(s).entries(commissionId);
    expect(data.single['data']['delta']['mcn_minor'], -250);
    expect(gigSignedMoney(data.single['data']['delta']['mcn_minor']), '-¥2.50');
    expect(
        GigRecord.parse(gigData('COMMISSION'), party: personId).data['facts']
            ['environment'],
        'SANDBOX');
  });
}
