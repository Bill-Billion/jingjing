import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/contracts/contract_api.dart';
import '../account/fake_account_api.dart';
import 'contract_fixtures.dart';

void main() {
  test('三个读取使用当前opaque会话、办事身份及合同关联参数，不走旧元数据接口', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.contains('business-readiness')) {
        return envelope(readinessData());
      }
      if (r.path.contains('rule-versions')) return envelope(ruleData());
      if (r.path.contains('contract-snapshots')) {
        return envelope(snapshotData());
      }
      return adapter.defaultReply(r);
    });
    final session = await contractSession(adapter, owner: false);
    final api = ContractApi(session);
    await api.snapshot(snapshotId);
    await api.rule(snapshotId, ruleData());
    await api.readiness(snapshotId, 'START_PAYMENT');
    final calls = adapter.requests.skip(1).toList();
    expect(calls.map((r) => r.path), [
      '/api/v1/contract-snapshots/$snapshotId/content',
      '/api/v1/rule-versions/$ruleId/content',
      '/api/v1/contract-snapshots/$snapshotId/business-readiness'
    ]);
    for (final r in calls) {
      expect(r.method, 'GET');
      expect(r.headers['Authorization'], 'Bearer ${'x' * 43}');
      expect(r.headers['X-Acting-Party'], orgId);
      expect(r.headers.containsKey('If-None-Match'), isFalse);
      expect(r.headers.containsKey('Idempotency-Key'), isFalse);
    }
    expect(calls[1].queryParameters, {'snapshot_id': snapshotId});
    expect(calls[2].queryParameters, {'action': 'START_PAYMENT'});
  });
  test('拒绝旧DTO、缺字段、错误状态及空规则，2xx不能直接作为成功内容', () async {
    final invalids = <Map<String, dynamic>>[
      {'id': snapshotId, 'content_asset_id': 'old'},
      {...snapshotData()}..remove('content_sha256'),
      {...snapshotData(), 'commitments': {}},
      {...snapshotData(), 'current_status': 'SIGNED'},
      {...snapshotData(), 'signing_method': 'E_SIGNED'},
      {...snapshotData(), 'rule_contents': []},
      {
        ...snapshotData(),
        'party_ids': [personId]
      },
      {
        ...snapshotData(),
        'rule_contents': [
          {...ruleData(), 'terms': {}}
        ]
      },
    ];
    for (final invalid in invalids) {
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(
          handler: (r) => r.path.contains('/content')
              ? envelope(invalid)
              : adapter.defaultReply(r));
      final api = ContractApi(await contractSession(adapter));
      await expectLater(
          api.snapshot(snapshotId),
          throwsA(isA<AccountError>()
              .having((e) => e.code, 'code', 'INVALID_CONTRACT_RESPONSE')));
    }
  });
  test('真实路由只收小写UUID，合成短编号与路径注入不发送', () async {
    final adapter = FakeAccountAdapter();
    final api = ContractApi(await contractSession(adapter));
    for (final id in [
      'snapshot-1',
      '../content',
      'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
    ]) {
      await expectLater(api.snapshot(id), throwsA(isA<AccountError>()));
    }
    expect(adapter.requests.length, 1);
  });
  test('服务条件必须对应请求动作并满足状态原因组合，八类未开通原因可读', () async {
    late FakeAccountAdapter adapter;
    var response = readinessData();
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.contains('business-readiness')
            ? envelope(response)
            : adapter.defaultReply(r));
    final api = ContractApi(await contractSession(adapter));
    for (final reason in readinessReasons.keys) {
      response = readinessData(reason: reason);
      expect(
          (await api.readiness(snapshotId, 'START_PAYMENT'))['current_status'],
          'NOT_ENABLED');
    }
    response = readinessData(status: 'SERVICE_READY', reason: null);
    expect((await api.readiness(snapshotId, 'START_PAYMENT'))['current_status'],
        'SERVICE_READY');
    for (final invalid in [
      readinessData(status: 'SERVICE_READY'),
      readinessData(reason: null),
      readinessData(action: 'START_SIGNING'),
      {...readinessData(), 'environment': 'UNKNOWN'}
    ]) {
      response = invalid;
      await expectLater(api.readiness(snapshotId, 'START_PAYMENT'),
          throwsA(isA<AccountError>()));
    }
  });
  test('规则返回必须匹配合同中保存的版本及校验值', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.contains('rule-versions')
            ? envelope(ruleData(version: 'current'))
            : adapter.defaultReply(r));
    final api = ContractApi(await contractSession(adapter));
    await expectLater(
        api.rule(snapshotId, ruleData()), throwsA(isA<AccountError>()));
  });
}
