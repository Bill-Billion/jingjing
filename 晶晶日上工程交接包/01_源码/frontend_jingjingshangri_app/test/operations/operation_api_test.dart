import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/operations/operation_api.dart';
import 'package:jingjingshangri_app/operations/operation_models.dart';
import '../account/fake_account_api.dart';
import '../finance/finance_fixtures.dart';
import '../gigs/gig_fixtures.dart';
import '../licensing/license_fixtures.dart';
import '../production/production_fixtures.dart';
import '../projects/project_fixtures.dart';
import '../supply/supply_fixtures.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../trade/trade_fixtures.dart';
import 'operation_fixtures.dart';

void main() {
  test('严格真实通知/留言DTO，隐藏撤回正文只能为空，日期兼容实际MySQL六位小数', () {
    expect(OperationNotice.parse(noticeData()).id, 7);
    for (final status in ['VISIBLE', 'WITHDRAWN', 'HIDDEN']) {
      expect(ObjectComment.parse(commentData(status: status)).status, status);
    }
    final leaked = commentData(status: 'HIDDEN')..['body'] = '私有旧正文';
    expect(() => ObjectComment.parse(leaked), throwsA(isA<AccountError>()));
    final extra = noticeData()..['unread_count'] = 999;
    expect(() => OperationNotice.parse(extra), throwsA(isA<AccountError>()));
    expect(operationTime('2026-02-30T08:00:00Z'), false);
    expect(operationText('你' * 4000, 4000), true);
    expect(operationText('😀' * 4001, 4000), false);
  });
  test('所有通知来源按原模块重新读取，留言只开放四种对象且不给任意用户聊天', () async {
    final a = operationsAdapter(),
        s = await buyerSession(a),
        api = OperationApi(s);
    for (final x in [
      ('TRADE', orderId),
      ('PRODUCTION', productionProjectId),
      ('PRODUCTION', productionVersionId),
      ('PROJECTS', projectKey),
      ('FINANCE', agreementKey),
      ('SUPPLY', profileId),
      ('LICENSE', productId),
      ('GIGS', gigRecordId)
    ]) {
      final source = await api.source(x.$1, x.$2);
      expect(source.canComment,
          ['TRADE', 'PRODUCTION', 'PROJECTS'].contains(x.$1));
      expect(source.route, startsWith('/'));
    }
    await expectLater(
        api.add('PROJECTS', planKey, '方案不支持留言'), throwsA(isA<AccountError>()));
    expect(
        a.requests.where(
            (r) => r.path.contains('/operations/') && r.method == 'POST'),
        isEmpty);
  });
  test('通知分页按倒序数字游标，权限过滤空页仍继续，刷新不复用cursor', () async {
    var page = 0;
    final a = operationsAdapter(
            override: (r) => r.path == '/api/v1/operations/notifications'
                ? envelope(++page == 1
                    ? {'items': [], 'next_cursor': 7}
                    : {
                        'items': [noticeData(id: 6)],
                        'next_cursor': null
                      })
                : null),
        s = await buyerSession(a),
        api = OperationApi(s);
    expect((await api.notices(unread: true)).cursor, 7);
    expect((await api.notices(cursor: 7)).items.single.id, 6);
    await api.notices();
    expect(a.requests.last.queryParameters.containsKey('cursor'), false);
    expect(a.requests.last.headers['X-Acting-Party'], personId);
  });
  test('单条已读为空正文/个人身份/Bearer/原幂等键，不发送If-Match或全部已读', () async {
    final a = operationsAdapter(), s = await buyerSession(a);
    await OperationApi(s).markRead(7);
    final r = a.requests.last;
    expect(r.data, <String, dynamic>{});
    expect(r.headers['X-Acting-Party'], personId);
    expect(r.headers['Authorization'], 'Bearer ${'x' * 43}');
    expect(r.headers['Idempotency-Key'], isNotEmpty);
    expect(r.headers.containsKey('If-Match'), false);
    expect((await OperationApi(s).notices()).items.single.read, true);
  });
  test('普通文本和同对象回复按原正文提交；不可替他人撤回、不提供HIDE', () async {
    final a = operationsAdapter(),
        s = await buyerSession(a),
        api = OperationApi(s);
    await api.add('PROJECTS', projectKey, '<script>纯文本</script>',
        replyTo: commentKey);
    final r = a.requests.last;
    expect(r.data, {'body': '<script>纯文本</script>', 'reply_to': commentKey});
    expect(r.headers.containsKey('If-Match'), false);
    expect(
        () => api.withdraw(
            ObjectComment.parse(commentData(author: invitationId)), '不是本人'),
        throwsA(isA<AccountError>()));
    await api.withdraw(ObjectComment.parse(commentData()), '本人撤回说明');
    expect(a.requests.last.headers['If-Match'], '"1"');
    expect(a.requests.last.data, {'action': 'WITHDRAW', 'reason': '本人撤回说明'});
    await expectLater(api.add('PROJECTS', projectKey, '😀' * 4001),
        throwsA(isA<AccountError>()));
  });
  test('留言503保持原key/body、已知resultId和目标；恢复先读取同对象再原样重办', () async {
    var count = 0;
    final a = operationsAdapter(
            override: (r) =>
                r.path == commentsPath && r.method == 'POST' && ++count == 1
                    ? envelope({'id': secondCommentKey})
                    : null),
        s = await buyerSession(a),
        api = OperationApi(s);
    await expectLater(api.add('PROJECTS', projectKey, '不确定的原说明'),
        throwsA(isA<AccountError>()));
    expect(s.operationsPending.single['resultId'], secondCommentKey);
    expect(s.operationsTargets[commentsPath],
        {'domain': 'PROJECTS', 'recordId': projectKey});
    final first = a.requests.last;
    await expectLater(
        api.add('PROJECTS', projectKey, '换一份说明'),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PENDING_OPERATION_CHANGED')));
    await api.retry(commentsPath);
    expect(a.requests.last.headers['Idempotency-Key'],
        first.headers['Idempotency-Key']);
    expect(a.requests.last.data, first.data);
    expect(s.operationsPending, isEmpty);
    expect(s.operationsTargets, isEmpty);
    expect(a.requests.where((r) => r.path == commentsPath && r.method == 'GET'),
        isNotEmpty);
  });
  test('撤回503保留原版本和原因；412重读后需新key、新版本与新决定', () async {
    var count = 0;
    final a = operationsAdapter(
            override: (r) => r.path == actionPath && ++count == 1
                ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                    status: 503, error: true)
                : null),
        s = await buyerSession(a),
        api = OperationApi(s);
    await expectLater(api.withdraw(ObjectComment.parse(commentData()), '原撤回原因'),
        throwsA(isA<AccountError>()));
    final first = a.requests.last;
    await api.retry(actionPath);
    expect(a.requests.last.headers['If-Match'], '"1"');
    expect(a.requests.last.headers['Idempotency-Key'],
        first.headers['Idempotency-Key']);
    var attempts = 0;
    final b = operationsAdapter(
            initial: [commentData(version: 2)],
            override: (r) => r.path == actionPath && ++attempts == 1
                ? envelope({'code': 'VERSION_CONFLICT'},
                    status: 412, error: true)
                : null),
        sb = await buyerSession(b),
        api2 = OperationApi(sb);
    await expectLater(api2.withdraw(ObjectComment.parse(commentData()), '旧原因'),
        throwsA(isA<AccountError>()));
    expect(sb.operationsPending, isEmpty);
    final before = b.requests.last;
    await api2.withdraw(
        ObjectComment.parse(commentData(version: 2)), '重新查看后的原因');
    expect(b.requests.last.headers['If-Match'], '"2"');
    expect(b.requests.last.headers['Idempotency-Key'],
        isNot(before.headers['Idempotency-Key']));
  });
  test('已读503恢复相同key，先从全部通知核对且不自动办其他事件', () async {
    var count = 0;
    final a = operationsAdapter(
            override: (r) =>
                r.path == '/api/v1/operations/notifications/7/read' &&
                        ++count == 1
                    ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                        status: 503, error: true)
                    : null),
        s = await buyerSession(a),
        api = OperationApi(s);
    await expectLater(api.markRead(7), throwsA(isA<AccountError>()));
    final first = a.requests.last;
    await api.retry(first.path);
    expect(a.requests.last.headers['Idempotency-Key'],
        first.headers['Idempotency-Key']);
    expect(s.operationsPending, isEmpty);
    expect(
        a.requests
            .where((r) => r.path == '/api/v1/operations/notifications')
            .last
            .queryParameters['unread_only'],
        'false');
  });
  test('每次留言读取无缓存，返回对象必须一致，空UUID游标页也能继续', () async {
    var pages = 0;
    final a = operationsAdapter(
            override: (r) => r.path == commentsPath && r.method == 'GET'
                ? envelope(++pages == 1
                    ? {'items': [], 'next_cursor': commentKey}
                    : {
                        'items': [commentData(id: secondCommentKey)],
                        'next_cursor': null
                      })
                : null),
        s = await buyerSession(a),
        api = OperationApi(s);
    expect((await api.allComments('PROJECTS', projectKey)).single.id,
        secondCommentKey);
    expect(pages, 2);
    expect(
        () => ObjectComment.parse(commentData(recordId: roleKey),
            domain: 'PROJECTS', recordId: projectKey),
        throwsA(isA<AccountError>()));
    await api.comments('PROJECTS', projectKey);
    expect(pages, 3);
  });
  test('401/403/404及身份变化清私有pending和目标，旧身份迟到写回不复活', () async {
    for (final status in [401, 403, 404]) {
      var deny = false;
      final a = operationsAdapter(override: (r) {
            if (r.path == commentsPath && r.method == 'POST') {
              return envelope({'code': 'SERVICE_UNAVAILABLE'},
                  status: 503, error: true);
            }
            if (deny && r.path == commentsPath) {
              return envelope({'code': 'COMMENT_NOT_FOUND'},
                  status: status, error: true);
            }
            return null;
          }),
          s = await buyerSession(a),
          api = OperationApi(s);
      await expectLater(api.add('PROJECTS', projectKey, '私有原请求'),
          throwsA(isA<AccountError>()));
      deny = true;
      await expectLater(
          api.comments('PROJECTS', projectKey), throwsA(isA<AccountError>()));
      expect(status == 401 ? !s.isLoggedIn : s.operationsAccessDenied, true);
      expect(s.operationsPending, isEmpty);
      expect(s.operationsTargets, isEmpty);
    }
    final gate = Completer<void>(), started = Completer<void>();
    final a = operationsAdapter(override: (r) async {
          if (r.path == commentsPath && r.method == 'POST') {
            started.complete();
            await gate.future;
            return envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true);
          }
          return null;
        }),
        s = await buyerSession(a);
    final request = OperationApi(s).add('PROJECTS', projectKey, '迟到私有请求');
    await started.future;
    s.select(identity(orgId));
    gate.complete();
    await expectLater(
        request,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    expect(s.operationsPending, isEmpty);
    expect(s.operationsTargets, isEmpty);
  });
}
