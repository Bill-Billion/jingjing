import 'dart:async';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/finance/finance_api.dart';
import 'package:jingjingshangri_app/finance/finance_models.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'finance_fixtures.dart';

void main() {
  test('十种真实DTO和任意JSON规则；金额整数分及负余额精确展示', () {
    for (final kind in financeKinds.keys) {
      final r = FinanceRecord.parse(financeData(kind), party: personId);
      expect(r.kind, kind);
      expect(r.raw.keys, isNot(contains('created_time')));
      expect(r.raw.keys, isNot(contains('allowed_actions')));
    }
    expect(financeMoneyText(-1), '-¥0.01');
    expect(financeMoneyText(-10001), '-¥100.01');
    expect(financeMoneyText(900000000000), '¥9,000,000,000.00');
    expect(financeMoney(1.0), false);
    expect(
        financeDigest({'a': 3.0, 'b': 2.5}), financeDigest({'b': 2.5, 'a': 3}));
  });
  test('非付款方投影保留原始hash，禁止第三方余额及篡改可完整校验记录', () {
    final projected = financeData('SETTLEMENT'),
        full = financeData('SETTLEMENT', projected: false);
    expect(projected['content_sha256'], full['content_sha256']);
    expect(
        projected['content_sha256'], isNot(financeDigest(projected['data'])));
    expect(FinanceRecord.parse(projected, party: personId).data['balances'],
        hasLength(1));
    expect(() => FinanceRecord.parse(full, party: personId),
        throwsA(isA<AccountError>()));
    expect(FinanceRecord.parse(full, party: orgId).kind, 'SETTLEMENT');
    final tampered = financeData('AGREEMENT');
    tampered['data']['rules']['terms'] = '被替换的约定';
    expect(() => FinanceRecord.parse(tampered, party: personId),
        throwsA(isA<AccountError>()));
    final extra = financeData('PAYOUT')..['allowed_actions'] = ['PAY'];
    expect(() => FinanceRecord.parse(extra, party: personId),
        throwsA(isA<AccountError>()));
  });
  test('准确确认原hash/版本/意见；POST原记录后必须GET本人确认凭证', () async {
    final a = financeAdapter(), s = await buyerSession(a), api = FinanceApi(s);
    final r = FinanceRecord.parse(financeData('SETTLEMENT'), party: personId);
    final returned = await api.confirm(r, 'APPROVED', '核对本人份额后同意。');
    expect(returned.version, r.version);
    final writes = a.requests
        .where((x) => x.method == 'POST' && x.path == financeConfirmPath);
    final post = writes.single;
    expect(post.data, {
      'content_sha256': r.hash,
      'decision': 'APPROVED',
      'reason': '核对本人份额后同意。'
    });
    expect(post.headers['If-Match'], '"2"');
    expect(post.headers['X-Acting-Party'], personId);
    expect(post.headers['Authorization'], 'Bearer ${'x' * 43}');
    expect(post.headers['Idempotency-Key'], isNotEmpty);
    expect(a.requests.last.method, 'GET');
    expect(a.requests.last.path, financeConfirmPath);
    expect(s.financePending, isEmpty);
  });
  test('缺少准确本人hash/决定/意见不能把APPROVED记录当已确认', () async {
    for (final changed in [
      'party_id',
      'content_sha256',
      'decision',
      'reason'
    ]) {
      final a = financeAdapter(override: (r) {
            if (r.path == financeConfirmPath && r.method == 'GET') {
              final c = {
                'party_id': personId,
                'content_sha256': financeData('SETTLEMENT')['content_sha256'],
                'decision': 'APPROVED',
                'reason': '同意本人份额。'
              };
              c[changed] = {
                'party_id': orgId,
                'content_sha256': 'e' * 64,
                'decision': 'REJECTED',
                'reason': '另一份意见。'
              }[changed]!;
              return envelope({
                'items': [c]
              });
            }
            return null;
          }),
          s = await buyerSession(a);
      await expectLater(
          FinanceApi(s).confirm(
              FinanceRecord.parse(financeData('SETTLEMENT'), party: personId),
              'APPROVED',
              '同意本人份额。'),
          throwsA(isA<AccountError>()
              .having((e) => e.code, 'code', 'CONFIRMATION_RESULT_UNKNOWN')));
      expect(s.financePending.single['resultId'], settlementKey);
    }
  });
  test('POST已提交但GET503仍保留恢复依据；恢复原key/body/version并读取证据后清除', () async {
    var getCount = 0;
    final a = financeAdapter(
        override: (r) =>
            r.path == financeConfirmPath && r.method == 'GET' && ++getCount == 1
                ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                    status: 503, error: true)
                : null);
    final s = await buyerSession(a), api = FinanceApi(s);
    await expectLater(
        api.confirm(
            FinanceRecord.parse(financeData('SETTLEMENT'), party: personId),
            'APPROVED',
            '本人准确确认。'),
        throwsA(isA<AccountError>()));
    final saved = Map<String, dynamic>.from(s.financePending.single);
    expect(saved['resultId'], settlementKey);
    final post = a.requests
        .firstWhere((r) => r.path == financeConfirmPath && r.method == 'POST');
    await api.retry(financeConfirmPath);
    final last = a.requests
        .lastWhere((r) => r.path == financeConfirmPath && r.method == 'POST');
    expect(last.headers['Idempotency-Key'], post.headers['Idempotency-Key']);
    expect(last.headers['If-Match'], post.headers['If-Match']);
    expect(last.data, post.data);
    expect(getCount, 3);
    expect(s.financePending, isEmpty);
  });
  test('付款503及错误结果关联不能换内容，恢复先读取目标与列表再同key重办', () async {
    var count = 0;
    final a = financeAdapter(
        override: (r) =>
            r.path == financePayoutPath && r.method == 'POST' && ++count == 1
                ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                    status: 503, error: true)
                : null);
    final s = await buyerSession(a), api = FinanceApi(s);
    final body = {
      'recipient_party_id': personId,
      'amount_minor': 3000,
      'destination_asset_id': materialKey,
      'note': '按本人收款资料申请。'
    };
    await expectLater(
        api.write(financePayoutPath, body, version: 2, kind: 'PAYOUT'),
        throwsA(isA<AccountError>()));
    final first = a.requests.last;
    await expectLater(
        api.write(financePayoutPath, {...body, 'amount_minor': 4000},
            version: 2, kind: 'PAYOUT'),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PENDING_OPERATION_CHANGED')));
    await api.retry(financePayoutPath);
    expect(a.requests.last.headers['Idempotency-Key'],
        first.headers['Idempotency-Key']);
    expect(a.requests.last.data, body);
    expect(
        a.requests.any((r) =>
            r.path.endsWith('/records') &&
            r.queryParameters['kind'] == 'PAYOUT'),
        true);
    expect(s.financePending, isEmpty);
    final mismatch = financeAdapter(override: (r) {
          if (r.path == financePayoutPath && r.method == 'POST') {
            final d = financeData('PAYOUT');
            d['data']['amount_minor'] = 3001;
            d['content_sha256'] = financeDigest(d['data']);
            return envelope(d);
          }
          return null;
        }),
        sm = await buyerSession(mismatch);
    await expectLater(
        FinanceApi(sm)
            .write(financePayoutPath, body, version: 2, kind: 'PAYOUT'),
        throwsA(isA<AccountError>()));
    expect(sm.financePending.single['resultId'], payoutKey);
  });
  test('412清旧决定；重新读取的新hash和版本需再次决定、新key', () async {
    var count = 0;
    final a = financeAdapter(
        records: (k) => financeData(k, version: 3),
        override: (r) =>
            r.path == financeConfirmPath && r.method == 'POST' && ++count == 1
                ? envelope({'code': 'PRECONDITION_FAILED'},
                    status: 412, error: true)
                : null);
    final s = await buyerSession(a), api = FinanceApi(s);
    await expectLater(
        api.confirm(
            FinanceRecord.parse(financeData('SETTLEMENT'), party: personId),
            'APPROVED',
            '旧意见'),
        throwsA(isA<AccountError>()));
    expect(s.financePending, isEmpty);
    final first = a.requests.last;
    await api.confirm(await api.record(settlementKey), 'REJECTED', '新版本不同意。');
    final last = a.requests
        .lastWhere((r) => r.method == 'POST' && r.path == financeConfirmPath);
    expect(last.headers['If-Match'], '"3"');
    expect(last.headers['Idempotency-Key'],
        isNot(first.headers['Idempotency-Key']));
    expect(last.data['decision'], 'REJECTED');
  });
  test('空权限过滤页带游标时继续，禁止用空页判断全部为空', () async {
    var pages = 0;
    final a = financeAdapter(
        override: (r) => r.path.endsWith('/records') && r.method == 'GET'
            ? envelope(++pages == 1
                ? {'items': [], 'next_cursor': payoutKey}
                : {
                    'items': [financeData('PAYOUT')],
                    'next_cursor': null
                  })
            : null);
    final s = await buyerSession(a),
        rows = await FinanceApi(s).all(agreementKey, 'PAYOUT');
    expect(rows.single.id, payoutKey);
    expect(pages, 2);
    expect(a.requests.last.queryParameters['cursor'], payoutKey);
  });
  test('每次读取无缓存；非付款方余额与流水只能返回本人', () async {
    final a = financeAdapter(), s = await buyerSession(a), api = FinanceApi(s);
    final g = await api.record(agreementKey);
    await api.record(agreementKey);
    expect(
        a.requests.where((r) => r.path.endsWith(agreementKey)), hasLength(2));
    expect((await api.balances(g))['items'], hasLength(1));
    final bad = financeAdapter(
            override: (r) => r.path.endsWith('/balances')
                ? envelope({
                    ...financeBalances(),
                    'items': [
                      {...financeBalanceData(current: true), 'party_id': orgId}
                    ]
                  })
                : null),
        sb = await buyerSession(bad);
    await expectLater(FinanceApi(sb).balances(g), throwsA(isA<AccountError>()));
  });
  test('403/404失权清私有pending；401退出；身份变化丢弃迟到回包', () async {
    for (final code in [401, 403, 404]) {
      final a = financeAdapter(
              override: (r) => r.path.endsWith(agreementKey)
                  ? envelope({
                      'code': code == 401
                          ? 'INVALID_ACCESS_TOKEN'
                          : 'FINANCE_NOT_FOUND'
                    }, status: code, error: true)
                  : null),
          s = await buyerSession(a);
      await expectLater(
          FinanceApi(s).record(agreementKey), throwsA(isA<AccountError>()));
      expect(code == 401 ? !s.isLoggedIn : s.financeAccessDenied, true);
      expect(s.financePending, isEmpty);
    }
    final gate = Completer<void>();
    final a = financeAdapter(override: (r) async {
          if (r.path.endsWith(agreementKey)) {
            await gate.future;
            return envelope(financeData('AGREEMENT'));
          }
          return null;
        }),
        s = await buyerSession(a),
        request = FinanceApi(s).record(agreementKey);
    s.select(identity(orgId));
    gate.complete();
    await expectLater(
        request,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    expect(s.financePending, isEmpty);
    s.select(identity(personId, owner: false));
    expect(() => FinanceApi(s).owner(), throwsA(isA<AccountError>()));
  });
  test('私有凭据通过finance受控二进制端点，不探测其他主体supply元数据', () async {
    final a = financeAdapter(
            override: (r) => r.path.endsWith('/evidence/$materialKey')
                ? ResponseBody.fromBytes([65, 66, 67], 200,
                    headers: {
                      Headers.contentTypeHeader: ['application/octet-stream']
                    })
                : null),
        s = await buyerSession(a);
    final bytes = await FinanceApi(s).evidence(
        FinanceRecord.parse(financeData('PAYOUT'), party: personId),
        materialKey);
    expect(bytes, Uint8List.fromList([65, 66, 67]));
    expect(a.requests.last.headers['Authorization'], 'Bearer ${'x' * 43}');
    expect(
        a.requests.where((r) => r.path.startsWith('/api/v1/supply')), isEmpty);
    await expectLater(
        FinanceApi(s).evidence(
            FinanceRecord.parse(financeData('PAYOUT'), party: personId),
            ruleKey),
        throwsA(isA<AccountError>()));
  });
}
