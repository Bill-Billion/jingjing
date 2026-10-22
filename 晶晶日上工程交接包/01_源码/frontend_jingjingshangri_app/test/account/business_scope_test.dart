import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'fake_account_api.dart';

Future<AccountSession> login(FakeAccountAdapter adapter) async {
  final session = AccountSession(api: adapter.createApi());
  await session.login('13800000000', invitationId, '123456');
  await session.loadParties();
  return session;
}

void main() {
  for (final domain in [
    'stock',
    'notices',
    'auditions',
    'wallet',
    'engagement',
    'cocreation',
    'redemption',
    'privacy',
    'media',
  ]) {
    final prefix = '/api/v1/$domain/';
    test('$domain未知写入保持原输入、版本和请求键，修改输入被阻止', () async {
      var count = 0;
      final adapter = FakeAccountAdapter(
          handler: (_) => ++count == 1
              ? envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                  status: 503, error: true)
              : envelope({'id': invitationId}));
      final api = adapter.createApi();
      Future<Map<String, dynamic>> save(String note) =>
          api.request('POST', '${prefix}records',
              token: 'synthetic-token',
              party: personId,
              body: {'note': note},
              version: 7);
      await expectLater(save('原说明'), throwsA(isA<AccountError>()));
      final pending = api
          .pendingForPrefix(prefix, token: 'synthetic-token', party: personId)
          .single;
      expect(pending['body'], {'note': '原说明'});
      expect(pending['version'], 7);
      expect(pending['path'], '${prefix}records');
      await expectLater(
          save('新说明'),
          throwsA(isA<AccountError>()
              .having((e) => e.code, 'code', 'PENDING_OPERATION_CHANGED')));
      await save('原说明');
      expect(adapter.requests, hasLength(2));
      expect(adapter.requests[0].headers['Idempotency-Key'],
          adapter.requests[1].headers['Idempotency-Key']);
      expect(adapter.requests[1].headers['If-Match'], '"7"');
      expect(adapter.requests[0].data, adapter.requests[1].data);
      expect(
          api.pendingForPrefix(prefix,
              token: 'synthetic-token', party: personId),
          isEmpty);
    });

    test('$domain旧上下文迟到失败不能恢复已清除的私有待办', () async {
      final started = Completer<void>();
      final reply = Completer<ResponseBody>();
      final api = FakeAccountAdapter(handler: (_) {
        started.complete();
        return reply.future;
      }).createApi();
      final request = api.request('POST', '${prefix}records',
          token: 'old-token', party: personId, body: {'private': 'old'});
      final rejected = expectLater(
          request,
          throwsA(isA<AccountError>()
              .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
      await started.future;
      api.clearSupplyOperations();
      reply.complete(envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
          status: 503, error: true));
      await rejected;
      expect(api.pendingForPrefix(prefix, token: 'old-token', party: personId),
          isEmpty);
    });

    test('$domain失权清本域并由换主体重置，不误封供稿域', () async {
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(
          handler: (r) => r.path.startsWith(prefix)
              ? envelope({'code': 'FORBIDDEN'}, status: 403, error: true)
              : adapter.defaultReply(r));
      final session = await login(adapter);
      await expectLater(session.read('${prefix}records', actingParty: orgId),
          throwsA(isA<AccountError>()));
      expect(session.isDomainDenied(prefix), isTrue);
      expect(session.supplyAccessDenied, isFalse);
      session.select(identity(personId));
      expect(session.isDomainDenied(prefix), isFalse);
    });

    test('$domain私有字节404清本域，不误封供稿域', () async {
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(
          handler: (r) => r.path.startsWith(prefix)
              ? envelope({'code': 'NOT_FOUND'}, status: 404, error: true)
              : adapter.defaultReply(r));
      final session = await login(adapter);
      await expectLater(
          session.readBytes('${prefix}private-content',
              actingParty: domain == 'privacy' ? null : orgId),
          throwsA(isA<AccountError>()));
      expect(session.isDomainDenied(prefix), isTrue);
      expect(session.supplyAccessDenied, isFalse);
    });
  }

  test('本人隐私原请求按无机构身份找回，不读取当前机构的待办', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.startsWith('/api/v1/privacy/')
            ? envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                status: 503, error: true)
            : adapter.defaultReply(r));
    final session = await login(adapter);
    await expectLater(
        session.write('POST', '/api/v1/privacy/requests',
            body: {'type': 'COPY', 'details': '本人申请'}),
        throwsA(isA<AccountError>()));
    expect(session.pendingForPrefix('/api/v1/privacy/'), isEmpty);
    expect(session.pendingForPrefix('/api/v1/privacy/', personal: true),
        hasLength(1));
    expect(
        adapter.requests.last.headers.containsKey('X-Acting-Party'), isFalse);
    await session.logout();
    expect(
        session.pendingForPrefix('/api/v1/privacy/', personal: true), isEmpty);
  });

  test('A到B再到A时旧403不能封住新的同名身份', () async {
    final started = Completer<void>();
    final reply = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/stock/slow') {
        started.complete();
        return reply.future;
      }
      return adapter.defaultReply(r);
    });
    final session = await login(adapter);
    final request = session.read('/api/v1/stock/slow', actingParty: orgId);
    final rejected = expectLater(
        request,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    await started.future;
    session.select(identity(personId));
    session.select(identity(orgId));
    reply.complete(envelope({'code': 'FORBIDDEN'}, status: 403, error: true));
    await rejected;
    expect(session.stockAccessDenied, isFalse);
  });
}
