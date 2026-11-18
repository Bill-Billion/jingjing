import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/support/collections.dart';
import 'package:jingjingshangri_app/support/tickets.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;

Map<String, dynamic> prefs({bool enabled = false, int version = 1}) => {
      'history_enabled': enabled,
      'object_version': version,
      'history_days': 30,
      'history_max_entries': 200
    };
void main() {
  test('浏览记录默认关闭不写入，开启后带偏好版本且不带办事身份', () async {
    var enabled = false;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/collections/preferences')) {
        return envelope(prefs(enabled: enabled, version: 3));
      }
      if (r.path.endsWith('/collections/history')) {
        return envelope({'applied': true});
      }
      return a.defaultReply(r);
    });
    final api = CollectionsApi(await buyerSession(a));
    await api.visit('ARTIST', personId);
    expect(a.requests.where((r) => r.path.endsWith('/collections/history')),
        isEmpty);
    enabled = true;
    await api.visit('ARTIST', personId);
    final visit = a.requests.last;
    expect(visit.headers['If-Match'], '"3"');
    expect(visit.headers['X-Acting-Party'], isNull);
  });
  test('旧访问遭412不会拿新版本补报，也不会留下重试队列', () async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/collections/preferences')) {
        return envelope(prefs(enabled: true));
      }
      if (r.path.endsWith('/collections/history')) {
        return envelope({'code': 'VERSION_CONFLICT'}, status: 412, error: true);
      }
      return a.defaultReply(r);
    });
    final s = await buyerSession(a), api = CollectionsApi(s);
    await expectLater(
        api.visit('STOCK', personId), throwsA(isA<AccountError>()));
    expect(
        a.requests.where((r) => r.path.endsWith('/collections/history')).length,
        1);
    expect(s.pending('POST', '/api/v1/me/collections/history'), isNull);
  });
  testWidgets('失效收藏只显示不可用并保留取消入口，不显示旧标题', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/collections/preferences')) return envelope(prefs());
      if (r.path.endsWith('/collections/favorites')) {
        return envelope({
          'items': [
            {
              'kind': 'STOCK',
              'target_id': personId,
              'recorded_at': '2026-10-30T00:00:00Z',
              'availability': 'UNAVAILABLE',
              'title': null,
              'city': null
            }
          ],
          'next_cursor': null
        });
      }
      return a.defaultReply(r);
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const PersonalCollectionsPage());
    await reveal(t, find.text('内容已不可用'));
    expect(find.text('内容已不可用'), findsOneWidget);
    expect(find.text('重新查看当前内容'), findsNothing);
    expect(find.text('取消收藏'), findsOneWidget);
  });
  testWidgets('确认浏览记录期间切换身份，不沿用旧确认写入当前会话', (t) async {
    final a = FakeAccountAdapter();
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const PersonalCollectionsPage());
    await reveal(t, find.byType(SwitchListTile));
    await t.tap(find.byType(SwitchListTile));
    await frames(t);
    expect(find.text('开启浏览记录？'), findsOneWidget);
    s.select(identity(orgId));
    await frames(t);
    await t.tap(find.text('确认'));
    await frames(t);
    expect(
        a.requests.where((r) =>
            r.path.endsWith('/collections/preferences') && r.method == 'POST'),
        isEmpty);
    expect(t.takeException(), isNull);
  });
  test('反馈按钮依状态开放，无法用补件覆盖原记录', () {
    expect(applicantActions('SUBMITTED'), isEmpty);
    expect(applicantActions('PROCESSING'), isEmpty);
    expect(applicantActions('NEEDS_INFO'), ['SUPPLEMENT']);
    expect(applicantActions('ANSWERED'), ['CLOSE', 'REOPEN']);
    expect(applicantActions('CLOSED'), ['REOPEN']);
  });
  testWidgets('反馈未提交返回可取消并保留文字', (t) async {
    await host(t, (await t.runAsync(() => buyerSession(FakeAccountAdapter())))!,
        const SupportPage(create: true));
    await t.enterText(find.byType(TextField).first, '尚未提交的问题');
    await t.pump();
    await t.tap(find.byType(BackButton));
    await frames(t);
    expect(find.text('离开当前填写？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    expect(find.text('尚未提交的问题'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('补件页回到反馈列表前可取消，保留未提交说明', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/support/tickets/$personId') {
        return envelope({
          'id': personId,
          'party_id': personId,
          'kind': 'FEEDBACK',
          'title': '待补件的问题',
          'current_status': 'NEEDS_INFO',
          'object_version': 3
        });
      }
      if (r.path.endsWith('/history')) {
        return envelope({'items': [], 'next_cursor': null});
      }
      return a.defaultReply(r);
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const SupportPage(ticketId: personId));
    await reveal(t, find.byType(TextField));
    await t.enterText(find.byType(TextField), '尚未提交的补件说明');
    await reveal(t, find.text('回到我的反馈'));
    await t.tap(find.text('回到我的反馈'));
    await frames(t);
    expect(find.text('离开当前填写？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    await reveal(t, find.text('尚未提交的补件说明'));
    expect(find.text('尚未提交的补件说明'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('从反馈列表恢复原补件先读对应工单，重用原版本内容与键', (t) async {
    const actionPath = '/api/v1/support/tickets/$orgId/actions';
    var attempts = 0;
    late FakeAccountAdapter a;
    final record = {
      'id': orgId,
      'party_id': personId,
      'kind': 'FEEDBACK',
      'title': '上一份工单',
      'current_status': 'PROCESSING',
      'object_version': 4
    };
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == actionPath) {
        if (++attempts == 1) {
          return envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
              status: 503, error: true);
        }
        return envelope(record);
      }
      if (r.path == '/api/v1/support/tickets/$orgId') return envelope(record);
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await t.runAsync(() async {
      try {
        await s.write('POST', actionPath,
            actingParty: personId,
            version: 3,
            body: {'action': 'SUPPLEMENT', 'text': '原补件说明', 'asset_ids': []});
      } on AccountError catch (e) {
        expect(e.uncertain, isTrue);
      }
    });
    await host(t, s, const SupportPage());
    await reveal(t, find.text('核对并恢复原提交'));
    await t.tap(find.text('核对并恢复原提交'));
    await frames(t);
    final commands = a.requests.where((r) => r.path == actionPath).toList();
    final lookup = a.requests
        .indexWhere((r) => r.path == '/api/v1/support/tickets/$orgId');
    expect(lookup, greaterThan(a.requests.indexOf(commands.first)));
    expect(lookup, lessThan(a.requests.indexOf(commands.last)));
    expect(commands, hasLength(2));
    expect(commands.last.data, commands.first.data);
    expect(commands.last.headers['If-Match'], '"3"');
    expect(commands.last.headers['Idempotency-Key'],
        commands.first.headers['Idempotency-Key']);
    expect(s.pendingForPrefix('/api/v1/support/'), isEmpty);
    expect(t.takeException(), isNull);
  });
}
