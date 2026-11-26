import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/account/trade_recovery.dart';
import 'fake_account_api.dart';

const path = '/api/v1/trade/refunds/$invitationId/reconciliation';
AccountApi client(FakeAccountAdapter adapter, TradeRecoveryStore store) {
  final dio = Dio(BaseOptions(
      baseUrl: 'http://localhost:3000', validateStatus: (_) => true));
  dio.httpClientAdapter = adapter;
  return AccountApi(dio: dio, recoveryStore: store);
}

Future<Map<String, dynamic>> submit(AccountApi api,
        {String token = 'original-token', Map<String, dynamic>? body}) =>
    api.request('POST', path,
        accountId: accountId,
        token: token,
        party: orgId,
        version: 7,
        body: body ?? {'reason': 'original'});

class UnavailableStore extends TradeRecoveryStore {
  UnavailableStore() : super('http://localhost:3000');
  @override
  Future<void> save(Map<String, dynamic> row) async =>
      throw StateError('quota');
}

class WaitingStore extends TradeRecoveryStore {
  WaitingStore() : super('http://localhost:3000');
  final started = Completer<void>(), release = Completer<void>();
  @override
  Future<void> save(Map<String, dynamic> row) async {
    started.complete();
    await release.future;
    await super.save(row);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'cold restart restores original trade key/body/version only after matching account and party',
      () async {
    var lost = true;
    final adapter = FakeAccountAdapter(handler: (r) {
      if (r.method == 'POST' && lost)
        throw DioException(
            requestOptions: r, type: DioExceptionType.connectionError);
      return envelope({'id': invitationId, 'current_status': 'SUCCEEDED'});
    });
    final store = TradeRecoveryStore('http://localhost:3000'),
        first = client(adapter, store);
    await expectLater(
        submit(first),
        throwsA(
            isA<AccountError>().having((e) => e.uncertain, 'unknown', true)));
    final key = first.pending('POST', path,
        token: 'original-token', party: orgId)!['key'];
    final prefs = await SharedPreferences.getInstance(),
        raw = prefs.getString(store.storageKey)!;
    expect(raw.contains('original-token'), false);
    for (final identity in [
      {'account': personId, 'party': orgId},
      {'account': accountId, 'party': personId}
    ]) {
      final other =
          client(adapter, TradeRecoveryStore('http://localhost:3000'));
      await other.request('GET', '/api/v1/trade/records/$invitationId',
          accountId: identity['account'],
          token: 'new-token',
          party: identity['party']);
      expect(other.tradePending(token: 'new-token', party: identity['party']),
          isEmpty);
    }
    final next = client(adapter, TradeRecoveryStore('http://localhost:3000'));
    await next.request('GET', '/api/v1/trade/records/$invitationId',
        accountId: accountId, token: 'new-token', party: orgId);
    expect(
        next.tradePending(token: 'new-token', party: orgId).single['key'], key);
    await expectLater(
        submit(next, token: 'new-token', body: {'reason': 'changed'}),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PENDING_OPERATION_CHANGED')));
    lost = false;
    await submit(next, token: 'new-token');
    final posts = adapter.requests.where((r) => r.method == 'POST').toList();
    expect(posts.length, 2);
    expect(posts[1].headers['Idempotency-Key'],
        posts[0].headers['Idempotency-Key']);
    expect(posts[1].headers['If-Match'], posts[0].headers['If-Match']);
    expect(posts[1].data, posts[0].data);
    expect(await store.read(accountId, orgId), isEmpty);
  });
  test(
      '409 on an uncertain replay preserves the original command across another restart',
      () async {
    var attempts = 0;
    final adapter = FakeAccountAdapter(
        handler: (_) => envelope(
            {'code': ++attempts == 1 ? 'SERVICE_UNAVAILABLE' : 'STATE_CHANGED'},
            status: attempts == 1 ? 503 : 409, error: true));
    final store = TradeRecoveryStore('http://localhost:3000'),
        first = client(adapter, store);
    await expectLater(submit(first), throwsA(isA<AccountError>()));
    final key =
        first.tradePending(token: 'original-token', party: orgId).single['key'];
    final next = client(adapter, store);
    await expectLater(submit(next, token: 'new-token'),
        throwsA(isA<AccountError>().having((e) => e.status, 'status', 409)));
    expect(
        next.tradePending(token: 'new-token', party: orgId).single['key'], key);
    expect((await store.read(accountId, orgId)).single['key'], key);
  });
  test('unavailable or damaged recovery storage fails before POST', () async {
    final adapter =
        FakeAccountAdapter(handler: (_) => envelope({'id': invitationId}));
    await expectLater(
        submit(client(adapter, UnavailableStore())),
        throwsA(isA<AccountError>().having(
            (e) => e.code, 'code', 'TRADE_RECOVERY_STORAGE_UNAVAILABLE')));
    expect(adapter.requests, isEmpty);
    final store = TradeRecoveryStore('http://localhost:3000'),
        prefs = await SharedPreferences.getInstance();
    await prefs.setString(store.storageKey, 'broken');
    await expectLater(
        submit(client(adapter, store)), throwsA(isA<AccountError>()));
    expect(adapter.requests, isEmpty);
  });
  test('account switch while persisting cannot dispatch a stale trade command',
      () async {
    final store = WaitingStore(),
        adapter =
            FakeAccountAdapter(handler: (_) => envelope({'id': invitationId}));
    final api = client(adapter, store), result = submit(api);
    final check = expectLater(
        result,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    await store.started.future;
    api.clearSupplyOperations();
    store.release.complete();
    await check;
    expect(adapter.requests, isEmpty);
    await api.clearTradeRecovery();
    expect(await store.read(accountId, orgId), isEmpty);
  });
  test(
      'real session binds recovery to the authenticated account; logout clears private commands',
      () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path == path
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : adapter.defaultReply(r));
    final store = TradeRecoveryStore('http://localhost:3000'),
        session = AccountSession(api: client(adapter, store));
    await session.login('13800000000', invitationId, '123456');
    await session.loadParties();
    session
        .select(session.parties.firstWhere((r) => r['party']['id'] == orgId));
    await expectLater(
        session.write('POST', path, actingParty: orgId, body: {}, version: 7),
        throwsA(isA<AccountError>()));
    final saved = await store.read(accountId, orgId);
    expect(saved.length, 1);
    expect(jsonEncode(saved).contains('access_token'), false);
    await session.logout();
    expect(session.isLoggedIn, false);
    expect(await store.read(accountId, orgId), isEmpty);
  });
}
