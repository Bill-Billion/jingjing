import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'fake_account_api.dart';

Future<AccountSession> logged(FakeAccountAdapter adapter) async {
  final session = AccountSession(api: adapter.createApi());
  await session.login('13800000000', invitationId, '123456');
  return session;
}

void main() {
  test('未知结果复用原键、原版本和身份；成功后同内容的新操作使用新键', () async {
    var tries = 0;
    final adapter = FakeAccountAdapter(handler: (request) {
      if (++tries == 1) {
        throw DioException(
            requestOptions: request, type: DioExceptionType.connectionError);
      }
      return envelope({'object_version': 8});
    });
    final api = adapter.createApi();
    Future<Map<String, dynamic>> rename() =>
        api.request('PATCH', '/api/v1/parties/$orgId',
            token: 'token-a',
            party: orgId,
            version: 7,
            body: {'display_name': '新名字'});
    await expectLater(
        rename(),
        throwsA(
            isA<AccountError>().having((e) => e.uncertain, 'uncertain', true)));
    await rename();
    await rename();
    final requests = adapter.requests;
    expect(requests[0].headers['Idempotency-Key'],
        requests[1].headers['Idempotency-Key']);
    expect(requests[1].headers['Idempotency-Key'],
        isNot(requests[2].headers['Idempotency-Key']));
    expect(requests[1].headers['If-Match'], '"7"');
    expect(requests[1].headers['X-Acting-Party'], orgId);
    expect(requests[1].headers['Authorization'], 'Bearer token-a');
    expect(requests[0].data, requests[1].data);
  });

  test('连续重复提交共享正在进行的请求', () async {
    final response = Completer<ResponseBody>();
    final started = Completer<void>();
    final adapter = FakeAccountAdapter(handler: (_) {
      if (!started.isCompleted) started.complete();
      return response.future;
    });
    final api = adapter.createApi();
    final first = api
        .request('POST', '/api/v1/organizations', body: {'display_name': '机构'});
    final second = api
        .request('POST', '/api/v1/organizations', body: {'display_name': '机构'});
    await started.future;
    expect(adapter.requests, hasLength(1));
    response.complete(envelope({'party_id': orgId}));
    expect(await first, await second);
  });

  test('处理中409仍复用原键并禁止修改未确认内容', () async {
    var attempts = 0;
    final adapter = FakeAccountAdapter(
        handler: (_) => ++attempts == 1
            ? envelope({'code': 'IDEMPOTENCY_IN_PROGRESS'},
                status: 409, error: true)
            : envelope({'party_id': orgId}));
    final api = adapter.createApi();
    Future<Map<String, dynamic>> create(String name) => api
        .request('POST', '/api/v1/organizations', body: {'display_name': name});
    await expectLater(
        create('原名'),
        throwsA(
            isA<AccountError>().having((e) => e.uncertain, 'uncertain', true)));
    await expectLater(
        create('不同名字'),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PENDING_OPERATION_CHANGED')));
    expect(adapter.requests, hasLength(1));
    await create('原名');
    expect(adapter.requests[0].headers['Idempotency-Key'],
        adapter.requests[1].headers['Idempotency-Key']);
  });

  test('不可恢复的短信挑战清除旧键，重新获取使用新键', () async {
    var attempts = 0;
    final adapter = FakeAccountAdapter(handler: (_) {
      attempts++;
      if (attempts < 3) {
        return envelope({
          'code': attempts == 1 ? 'SMS_NOT_READY' : 'SMS_CHALLENGE_UNAVAILABLE'
        }, status: 503, error: true);
      }
      return envelope({'challenge_id': invitationId, 'current_status': 'SENT'});
    });
    final api = adapter.createApi();
    Future<Map<String, dynamic>> send() =>
        api.request('POST', '/api/v1/auth/sms-challenges',
            body: {'phone': '13800000000', 'purpose': 'LOGIN'});
    await expectLater(
        send(),
        throwsA(
            isA<AccountError>().having((e) => e.uncertain, 'uncertain', true)));
    await expectLater(
        send(),
        throwsA(isA<AccountError>()
            .having((e) => e.uncertain, 'uncertain', false)));
    await send();
    expect(adapter.requests[0].headers['Idempotency-Key'],
        adapter.requests[1].headers['Idempotency-Key']);
    expect(adapter.requests[1].headers['Idempotency-Key'],
        isNot(adapter.requests[2].headers['Idempotency-Key']));
  });

  test('不同账号或版本不会复用另一人的操作键', () async {
    final adapter = FakeAccountAdapter(
        handler: (_) => envelope({'code': 'SERVICE_UNAVAILABLE'},
            status: 503, error: true));
    final api = adapter.createApi();
    for (final token in ['one', 'two']) {
      await expectLater(
          api.request('PATCH', '/same',
              token: token,
              party: orgId,
              version: 1,
              body: {'display_name': '机构'}),
          throwsA(isA<AccountError>()));
    }
    expect(adapter.requests[0].headers['Idempotency-Key'],
        isNot(adapter.requests[1].headers['Idempotency-Key']));
  });

  test('未配置不访问旧生产域名，不返回演示数据', () async {
    final api = AccountApi(baseUrl: '');
    await expectLater(
        api.request('POST', '/api/v1/auth/sms-challenges',
            body: {'phone': '13800000000'}),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'ACCOUNT_API_NOT_CONFIGURED')));
  });

  test('旧身份请求晚返回不能覆盖已选择的新身份', () async {
    final pending = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) =>
            r.path == '/slow' ? pending.future : adapter.defaultReply(r));
    final session = await logged(adapter);
    await session.loadParties();
    final request = session.read('/slow', actingParty: orgId);
    final rejected = expectLater(
        request,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    session.select(identity(personId));
    pending.complete(envelope({'private': 'old-org'}));
    await rejected;
    expect(session.partyId, personId);
  });

  test('同账号并行刷新以最后发起的结果为准，末页不会再取首页', () async {
    final first = Completer<ResponseBody>();
    var pages = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path != '/api/v1/me/parties') return adapter.defaultReply(r);
      pages++;
      return pages == 1
          ? first.future
          : envelope({
              'items': [identity(personId)],
              'next_cursor': null
            });
    });
    final session = await logged(adapter);
    final stale = session.loadParties();
    await Future<void>.delayed(Duration.zero);
    await session.loadParties();
    first.complete(envelope({
      'items': [identity(orgId)],
      'next_cursor': 'old-cursor'
    }));
    await stale;
    expect(session.parties.single['party']['id'], personId);
    expect(session.partiesCursor, isNull);
    await session.loadParties(more: true);
    expect(pages, 2);
  });

  test('分页拼接会去重', () async {
    var pages = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path != '/api/v1/me/parties') return adapter.defaultReply(r);
      return envelope({
        'items': pages++ == 0
            ? [identity(personId)]
            : [identity(personId), identity(orgId)],
        'next_cursor': pages == 1 ? 'next-page' : null
      });
    });
    final session = await logged(adapter);
    await session.loadParties();
    await session.loadParties(more: true);
    expect(session.parties, hasLength(2));
    expect(adapter.requests.last.queryParameters['cursor'], 'next-page');
  });

  test('401会清空账号、身份和私有回执', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path == '/private'
            ? envelope({'code': 'AUTHENTICATION_REQUIRED'},
                status: 401, error: true)
            : adapter.defaultReply(r));
    final session = await logged(adapter);
    await session.loadParties();
    session.rememberInvitation({'invitation_id': invitationId});
    await expectLater(session.read('/private'), throwsA(isA<AccountError>()));
    expect(session.isLoggedIn, isFalse);
    expect(session.account, isNull);
    expect(session.selected, isNull);
    expect(session.parties, isEmpty);
    expect(session.sentInvitations, isEmpty);
    expect(session.authNotice, contains('已失效'));
  });

  test('断网退出立即清空本机，恢复网络重试服务器退出复用键', () async {
    final offline = Completer<ResponseBody>();
    var revokes = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/sessions/current') && revokes++ == 0) {
        return offline.future;
      }
      return adapter.defaultReply(r);
    });
    final session = await logged(adapter);
    await session.loadParties();
    session.rememberInvitation({'invitation_id': invitationId});
    final logout = session.logout();
    expect(session.isLoggedIn, isFalse);
    expect(session.parties, isEmpty);
    expect(session.sentInvitations, isEmpty);
    offline.complete(
        envelope({'code': 'SERVICE_UNAVAILABLE'}, status: 503, error: true));
    await logout;
    expect(session.authNotice, contains('未确认'));
    expect(session.hasPendingLogout, isTrue);
    await session.retryLogout();
    expect(session.hasPendingLogout, isFalse);
    final requests = adapter.requests
        .where((r) => r.path.endsWith('/sessions/current'))
        .toList();
    expect(requests[0].headers['Idempotency-Key'],
        requests[1].headers['Idempotency-Key']);
  });

  test('错误提示区分权限、过期版本、限流和服务未启用', () {
    expect(const AccountError(403, 'FORBIDDEN').message, contains('没有权限'));
    expect(const AccountError(412, 'VERSION_CONFLICT').message, contains('刷新'));
    expect(const AccountError(429, 'RATE_LIMIT').message, contains('频繁'));
    expect(const AccountError(503, 'SMS_NOT_READY').message, contains('未确认'));
  });
}
