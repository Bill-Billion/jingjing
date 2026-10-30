import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/operations/identity_notifications.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;

Map<String, dynamic> snapshot() => {
      'total': 1,
      'channels': {
        'ORDER_CONVERSATIONS': 0,
        'SUBMISSION_INTENTS': 0,
        'ACTIVITY_VOTING': 0,
        'SYSTEM': 1
      },
      'snapshot_id': personId,
      'as_of': '2026-10-30T00:00:00Z',
      'expires_at': '2026-10-30T01:00:00Z',
      'coverage': 'CURRENT_AUTHORIZED_NOTIFICATIONS'
    };
Map<String, dynamic> feedItem({String event = 'SUPPORT_ANSWER'}) => {
      'id': 8,
      'domain': 'SUPPORT',
      'record_id': personId,
      'event_code': event,
      'read': false,
      'channel': 'SYSTEM',
      'created_at': '2026-10-30T00:00:00Z',
      'target': {'domain': 'SUPPORT', 'record_id': personId}
    };
void main() {
  test('通知目标使用实际订单而非消息编号，拒绝矛盾未读数', () {
    expect(
        notificationTargetRoute({'domain': 'AUDITIONS', 'record_id': personId}),
        '/auditions/messages?bookingId=$personId');
    expect(notificationTargetRoute({'domain': 'GIG_ORDER', 'record_id': orgId}),
        '/gigs/conversation?orderId=$orgId');
    expect(() => notificationSnapshot({...snapshot(), 'total': 2}),
        throwsException);
  });
  testWidgets('快照过期后不会自动换快照重清新消息', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/notifications/unread')) return envelope(snapshot());
      if (r.path.endsWith('/notifications/feed')) {
        return envelope({'items': [], 'next_cursor': null});
      }
      if (r.path.endsWith('/notifications/read-all')) {
        return envelope({'code': 'NOTIFICATION_SNAPSHOT_EXPIRED'},
            status: 409, error: true);
      }
      return a.defaultReply(r);
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const IdentityNotificationsPage());
    await reveal(t, find.text('全部标为已读'));
    await t.tap(find.text('全部标为已读'));
    await frames(t);
    expect(
        a.requests
            .where((r) => r.path.endsWith('/notifications/read-all'))
            .length,
        1);
    expect(
        a.requests
            .where((r) => r.path.endsWith('/notifications/unread'))
            .length,
        1);
    expect(find.text('这次未读快照已过期。请刷新通知后，再决定是否全部已读。'), findsOneWidget);
  });
  testWidgets('未读读取失败不伪装为零也不能批量清除', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/notifications/unread')) {
        return envelope({'code': 'TEMPORARILY_UNAVAILABLE'},
            status: 503, error: true);
      }
      if (r.path.endsWith('/notifications/feed')) {
        return envelope({'items': [], 'next_cursor': null});
      }
      return a.defaultReply(r);
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const IdentityNotificationsPage());
    expect(find.text('全部 · 0'), findsNothing);
    expect(a.requests.where((r) => r.path.endsWith('/notifications/read-all')),
        isEmpty);
    expect(find.textContaining('未读数量读取失败'), findsOneWidget);
  });
  for (final bulk in [false, true]) {
    testWidgets('已读结果未知，刷新后仍恢复原身份、原请求和原键：批量=$bulk', (t) async {
      late FakeAccountAdapter a;
      var writes = 0, snapshots = 0;
      final path =
          '/api/v1/operations/notifications/${bulk ? 'read-all' : '8/read'}';
      a = FakeAccountAdapter(handler: (r) {
        if (r.path.endsWith('/notifications/unread')) {
          return envelope({
            ...snapshot(),
            'snapshot_id': ++snapshots == 1 ? personId : orgId
          });
        }
        if (r.path.endsWith('/notifications/feed')) {
          return envelope({
            'items': [feedItem()],
            'next_cursor': null
          });
        }
        if (r.path == path) {
          if (++writes == 1) {
            return envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                status: 503, error: true);
          }
          return envelope(bulk
              ? {'snapshot_id': personId, 'marked_count': 1, 'skipped_count': 0}
              : {'id': 8, 'read': true});
        }
        return a.defaultReply(r);
      });
      final s = (await t.runAsync(() => buyerSession(a)))!;
      await host(t, s, const IdentityNotificationsPage());
      final button = find.text(bulk ? '全部标为已读' : '标记这条已读');
      await reveal(t, button);
      await t.tap(button);
      await frames(t);
      expect(s.operationsPending, hasLength(1));
      await reveal(t, find.text('刷新消息与未读'));
      await t.tap(find.text('刷新消息与未读'));
      await frames(t);
      expect(snapshots, 2);
      await reveal(t, find.text('恢复原已读操作'));
      await t.tap(find.text('恢复原已读操作'));
      await frames(t);
      final commands = a.requests.where((r) => r.path == path).toList();
      expect(commands, hasLength(2));
      expect(commands.last.data, commands.first.data);
      expect(commands.last.headers['Idempotency-Key'],
          commands.first.headers['Idempotency-Key']);
      expect(commands.last.headers['X-Acting-Party'], personId);
      if (bulk) {
        expect(commands.last.data, {'snapshot_id': personId, 'channel': null});
      }
      expect(s.operationsPending, isEmpty);
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('切换身份后旧通知响应不填回新身份，也不保留旧快照', (t) async {
    final oldFeed = Completer<void>();
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) async {
      if (r.path.endsWith('/notifications/unread')) return envelope(snapshot());
      if (r.path.endsWith('/notifications/feed')) {
        if (r.headers['X-Acting-Party'] == personId) {
          await oldFeed.future;
          return envelope({
            'items': [feedItem()],
            'next_cursor': null
          });
        }
        return envelope({
          'items': [feedItem(event: 'SUPPORT_SUBMIT')],
          'next_cursor': null
        });
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const IdentityNotificationsPage());
    s.select(identity(orgId));
    await frames(t);
    oldFeed.complete();
    await frames(t);
    await reveal(t, find.text('反馈已提交'));
    expect(find.text('反馈已有答复'), findsNothing);
    expect(find.text('反馈已提交'), findsOneWidget);
    expect(s.operationsPending, isEmpty);
    expect(t.takeException(), isNull);
  });
}
