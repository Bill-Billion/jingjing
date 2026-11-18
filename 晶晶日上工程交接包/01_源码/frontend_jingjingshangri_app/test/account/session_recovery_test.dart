import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'fake_account_api.dart';

void main() {
  for (final change in [
    'roles',
    'member',
    'memberActions',
    'actions',
    'capability'
  ]) {
    test('同身份 $change 改变撤销旧上下文和迟到业务结果', () async {
      late FakeAccountAdapter adapter;
      var changed = false;
      final started = Completer<void>(), reply = Completer<ResponseBody>();
      adapter = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/stock/slow') {
          started.complete();
          return reply.future;
        }
        if (r.path == '/api/v1/me/parties/$orgId' && changed) {
          final row = identity(orgId);
          switch (change) {
            case 'roles':
              row['membership']['roles'] = ['MEMBER'];
            case 'member':
              row['membership']['current_status'] = 'SUSPENDED';
            case 'memberActions':
              row['membership']['allowed_actions'] = ['CHANGED'];
            case 'actions':
              row['party']['allowed_actions'] = ['READ_PARTY'];
            case 'capability':
              row['party']['capabilities'] = [
                {
                  'code': 'MERCHANT',
                  'current_status': 'SUSPENDED',
                  'allowed_actions': []
                }
              ];
          }
          return envelope(row);
        }
        return adapter.defaultReply(r);
      });
      final session = AccountSession(api: adapter.createApi());
      await session.login('13800000000', invitationId, '123456');
      await session.loadParties();
      final old = session.epoch;
      final result = session.read('/api/v1/stock/slow', actingParty: orgId);
      final rejected = expectLater(
          result,
          throwsA(isA<AccountError>()
              .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
      await started.future;
      changed = true;
      await session.refreshParty();
      reply.complete(envelope({'private': 'late'}));
      await rejected;
      expect(session.epoch, greaterThan(old));
      expect(adapter.requests.any((r) => r.path == '/api/v1/me/parties/$orgId'),
          isTrue);
    });
  }
  test('第二页所选身份刷新取得最新成员资料而不是保留旧成员快照', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/me/parties/$orgId') {
        return envelope(identity(orgId, owner: false));
      }
      if (r.path == '/api/v1/me/parties') {
        return envelope({
          'items': [identity(personId)],
          'next_cursor': null
        });
      }
      return adapter.defaultReply(r);
    });
    final session = AccountSession(api: adapter.createApi());
    await session.login('13800000000', invitationId, '123456');
    session.select(identity(orgId));
    await session.loadParties();
    expect(session.partyId, orgId);
    expect(session.isOwner, isFalse);
  });
  test('成员已移除时清身份且不自动切为首个身份', () async {
    late FakeAccountAdapter adapter;
    var revoked = false;
    adapter = FakeAccountAdapter(handler: (r) {
      if (revoked && r.path == '/api/v1/me/parties/$orgId') {
        return envelope({'code': 'PARTY_NOT_FOUND'}, status: 404, error: true);
      }
      return adapter.defaultReply(r);
    });
    final session = AccountSession(api: adapter.createApi());
    await session.login('13800000000', invitationId, '123456');
    await session.loadParties();
    revoked = true;
    await expectLater(session.refreshParty(), throwsA(isA<AccountError>()));
    expect(session.selected, isNull);
    expect(session.parties.every((p) => p['party']['id'] != orgId), isTrue);
  });
}
