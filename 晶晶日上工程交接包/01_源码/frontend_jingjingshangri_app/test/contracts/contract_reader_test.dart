import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/contracts/contract_reader.dart';
import '../account/fake_account_api.dart';
import 'contract_fixtures.dart';

Future<void> dispatched(bool Function() condition) async {
  await Future.doWhile(() async {
    await Future<void>.delayed(Duration.zero);
    return !condition();
  }).timeout(const Duration(seconds: 3));
}

void main() {
  test('同身份连续查询和合同切换清空正文，迟到响应不能覆盖最新合同', () async {
    final replies = <Completer<ResponseBody>>[];
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.contains('/content')) {
        final response = Completer<ResponseBody>();
        replies.add(response);
        return response.future;
      }
      return adapter.defaultReply(r);
    });
    final session = await contractSession(adapter);
    final reader = ContractReader(session);
    addTearDown(reader.dispose);
    final first = reader.open(snapshotId);
    await dispatched(() => replies.length == 1);
    final second = reader.open(otherSnapshotId);
    await dispatched(() => replies.length == 2);
    replies[1].complete(envelope(snapshotData(id: otherSnapshotId)));
    await second;
    replies[0].complete(envelope(snapshotData()));
    await first;
    expect(reader.snapshot?['id'], otherSnapshotId);
    final third = reader.open(otherSnapshotId);
    await dispatched(() => replies.length == 3);
    expect(reader.snapshot, isNull);
    replies[2]
        .complete(envelope({'code': 'NOT_FOUND'}, status: 404, error: true));
    await third;
    expect(reader.snapshot, isNull);
    expect(reader.error, contains('无权查看'));
  });
  test('A→B→A身份变化立即清空，旧成功和旧401不覆盖或退出新登录', () async {
    final pending = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.contains('/content')
            ? pending.future
            : adapter.defaultReply(r));
    final session = await contractSession(adapter);
    final reader = ContractReader(session);
    addTearDown(reader.dispose);
    final read = reader.open(snapshotId);
    await dispatched(
        () => adapter.requests.any((r) => r.path.contains('/content')));
    session.select(identity(personId));
    session.select(identity(orgId));
    expect(reader.snapshot, isNull);
    expect(reader.loading, isFalse);
    await session.logout();
    await session.login('13800000000', invitationId, '123456');
    session.select(identity(orgId));
    pending
        .complete(envelope({'code': 'UNAUTHORIZED'}, status: 401, error: true));
    await read;
    expect(session.isLoggedIn, isTrue);
    expect(reader.snapshot, isNull);
    expect(reader.error, isNull);
  });
  test('规则切换、服务动作切换的迟到内容丢弃，任意读取404撤下所有旧正文', () async {
    final rules = <Completer<ResponseBody>>[],
        services = <Completer<ResponseBody>>[];
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.contains('rule-versions')) {
        final c = Completer<ResponseBody>();
        rules.add(c);
        return c.future;
      }
      if (r.path.contains('business-readiness')) {
        final c = Completer<ResponseBody>();
        services.add(c);
        return c.future;
      }
      if (r.path.contains('/content')) return envelope(snapshotData());
      return adapter.defaultReply(r);
    });
    final reader = ContractReader(await contractSession(adapter));
    addTearDown(reader.dispose);
    await reader.open(snapshotId);
    final captured = reader.snapshot!['rule_contents'] as List;
    final first = reader.readRule(captured[0]);
    await dispatched(() => rules.length == 1);
    final second = reader.readRule(captured[1]);
    await dispatched(() => rules.length == 2);
    rules[1].complete(envelope(ruleData(id: otherRuleId, version: '2026.2')));
    await second;
    rules[0].complete(envelope(ruleData()));
    await first;
    expect(reader.rule?['id'], otherRuleId);
    final payment = reader.checkService();
    await dispatched(() => services.length == 1);
    reader.changeAction('START_SIGNING');
    expect(reader.readiness, isNull);
    final signing = reader.checkService();
    await dispatched(() => services.length == 2);
    services[1].complete(envelope(readinessData(action: 'START_SIGNING')));
    await signing;
    services[0].complete(
        envelope(readinessData(status: 'SERVICE_READY', reason: null)));
    await payment;
    expect(reader.readiness?['action'], 'START_SIGNING');
    final revoked = reader.readRule(captured[0]);
    await dispatched(() => rules.length == 3);
    rules[2]
        .complete(envelope({'code': 'NOT_FOUND'}, status: 404, error: true));
    await revoked;
    expect(reader.snapshot, isNull);
    expect(reader.rule, isNull);
    expect(reader.readiness, isNull);
    expect(reader.error, contains('无权查看'));
  });
  test('同一合同重复读取及显式清空后，先发成功也不能重现旧内容', () async {
    final replies = <Completer<ResponseBody>>[];
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.contains('/content')) {
        final c = Completer<ResponseBody>();
        replies.add(c);
        return c.future;
      }
      return adapter.defaultReply(r);
    });
    final reader = ContractReader(await contractSession(adapter));
    addTearDown(reader.dispose);
    final first = reader.open(snapshotId);
    await dispatched(() => replies.length == 1);
    final second = reader.open(snapshotId);
    await dispatched(() => replies.length == 2);
    replies[1].complete(envelope({
      ...snapshotData(),
      'commitments': {'新读取': '最新正文'}
    }));
    await second;
    replies[0].complete(envelope(snapshotData()));
    await first;
    expect(reader.snapshot?['commitments'], {'新读取': '最新正文'});
    final third = reader.open(snapshotId);
    await dispatched(() => replies.length == 3);
    reader.clear();
    replies[2].complete(envelope(snapshotData()));
    await third;
    expect(reader.snapshot, isNull);
    expect(reader.loading, isFalse);
  });
  test('规则或服务的依赖失败、格式不符均撤下此前成功的全部内容', () async {
    for (final malformed in [false, true]) {
      for (final service in [false, true]) {
        var failing = false;
        late FakeAccountAdapter adapter;
        adapter = FakeAccountAdapter(handler: (r) {
          if (r.path.contains('rule-versions')) {
            if (failing && !service) {
              return malformed
                  ? envelope({'id': ruleId})
                  : envelope({'code': 'DEPENDENCY_UNAVAILABLE'},
                      status: 503, error: true);
            }
            return envelope(ruleData());
          }
          if (r.path.contains('business-readiness')) {
            if (failing && service) {
              return malformed
                  ? envelope({'current_status': 'SERVICE_READY'})
                  : envelope({'code': 'DEPENDENCY_UNAVAILABLE'},
                      status: 503, error: true);
            }
            return envelope(readinessData());
          }
          if (r.path.contains('/content')) return envelope(snapshotData());
          return adapter.defaultReply(r);
        });
        final reader = ContractReader(await contractSession(adapter));
        await reader.open(snapshotId);
        final rule = (reader.snapshot!['rule_contents'] as List).first
            as Map<String, dynamic>;
        await reader.readRule(rule);
        await reader.checkService();
        expect(reader.rule, isNotNull);
        expect(reader.readiness, isNotNull);
        failing = true;
        if (service) {
          await reader.checkService();
        } else {
          await reader.readRule(rule);
        }
        expect(reader.snapshot, isNull);
        expect(reader.rule, isNull);
        expect(reader.readiness, isNull);
        expect(reader.error, isNotNull);
        reader.dispose();
      }
    }
  });
  test('仅按服务端Retry-After等待，期间不发新请求，未给等待头不编造秒数', () async {
    for (final seconds in [2, null]) {
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(handler: (r) {
        if (r.path.contains('/content')) {
          final response =
              envelope({'code': 'RATE_LIMITED'}, status: 429, error: true);
          if (seconds != null) response.headers['retry-after'] = ['$seconds'];
          return response;
        }
        return adapter.defaultReply(r);
      });
      final reader = ContractReader(await contractSession(adapter));
      await reader.open(snapshotId);
      expect(reader.snapshot, isNull);
      if (seconds != null) {
        expect(reader.retrySeconds, inInclusiveRange(1, 2));
        await reader.open(otherSnapshotId);
        expect(adapter.requests.where((r) => r.path.contains('/content')),
            hasLength(1));
        // Expiry is measured from the server's duration, not an invented default.
        await Future<void>.delayed(const Duration(milliseconds: 2100));
        expect(reader.retrySeconds, 0);
      } else {
        expect(reader.retrySeconds, 0);
        await reader.open(otherSnapshotId);
        expect(adapter.requests.where((r) => r.path.contains('/content')),
            hasLength(2));
      }
      reader.dispose();
    }
  });
  test('当前401立即退出并清空，未授权负责人404也不留正文', () async {
    var status = 200;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.contains('/content')
            ? (status == 200
                ? envelope(snapshotData())
                : envelope({'code': 'UNAUTHORIZED'},
                    status: status, error: true))
            : adapter.defaultReply(r));
    final session = await contractSession(adapter);
    final reader = ContractReader(session);
    addTearDown(reader.dispose);
    await reader.open(snapshotId);
    expect(reader.snapshot, isNotNull);
    status = 404;
    await reader.open(snapshotId);
    expect(reader.snapshot, isNull);
    expect(session.isLoggedIn, isTrue);
    status = 401;
    await reader.open(snapshotId);
    expect(session.isLoggedIn, isFalse);
    expect(reader.snapshot, isNull);
  });
}
