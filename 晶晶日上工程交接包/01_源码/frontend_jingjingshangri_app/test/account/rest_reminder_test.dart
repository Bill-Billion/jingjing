import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/rest_reminder.dart';
import 'package:jingjingshangri_app/account/rest_usage.dart';
import 'fake_account_api.dart';

const usagePath = '/api/v1/privacy/usage';
Map<String, dynamic> usage(
        {bool enabled = true, bool due = true, int version = 4}) =>
    {
      'object_version': version,
      'enabled': enabled,
      'local_date': '2026-11-03',
      'timezone': 'Asia/Shanghai',
      'day_seconds': 900,
      'reminder_seconds': due ? 900 : 0,
      'rest_reminder_minutes': enabled ? 15 : 0,
      'rest_due': due,
      'seconds_until_reminder': due ? 0 : 900,
      'heartbeat_seconds': 30,
      'idle_after_seconds': 90,
      'as_of': '2026-11-03T02:00:00Z',
      'measurement': 'FOREGROUND_HEARTBEAT_ESTIMATE',
      'purpose': 'PERSONAL_REST_REMINDER'
    };
Future<AccountSession> actor(FakeAccountAdapter a) async {
  final s = AccountSession(api: a.createApi());
  await s.login('13800000000', invitationId, '123456');
  s.select(identity(personId));
  return s;
}

Future<void> settle() async {
  for (var i = 0; i < 5; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  test('本人未开户仍可访问个人额度；其他钱包404清域', () async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.startsWith('/api/v1/wallet/')
            ? envelope({'code': 'WALLET_NOT_FOUND'}, status: 404, error: true)
            : a.defaultReply(r));
    final s = await actor(a);
    await expectLater(s.read('/api/v1/wallet/summary', actingParty: personId),
        throwsA(isA<AccountError>()));
    expect(s.walletAccessDenied, false);
    await expectLater(s.read('/api/v1/wallet/records', actingParty: personId),
        throwsA(isA<AccountError>()));
    expect(s.walletAccessDenied, true);
  });
  test('服务器统计格式错误拒绝，不能伪造0', () {
    expect(RestUsage(usage()).due, true);
    for (final patch in [
      {'day_seconds': -1},
      {'rest_reminder_minutes': 1},
      {'heartbeat_seconds': 10},
      {'measurement': 'EXACT_SCREEN'}
    ]) {
      expect(() => RestUsage({...usage(), ...patch}),
          throwsA(isA<AccountError>()));
    }
  });
  test('未知确认跨页面保持原键和版本；心跳不生成永久请求键或待恢复队列', () async {
    var lose = true, due = true;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '$usagePath/acknowledge') {
        if (lose) {
          return envelope({'code': 'UNAVAILABLE'}, status: 503, error: true);
        }
        due = false;
        return envelope({'acknowledged': true});
      }
      if (r.path.startsWith(usagePath)) {
        return envelope(usage(due: due));
      }
      return a.defaultReply(r);
    });
    final s = await actor(a);
    var c = RestUsageController(s);
    await settle();
    await c.acknowledge();
    expect(c.pending, isNotNull);
    final before =
        a.requests.where((r) => r.path.endsWith('/acknowledge')).single;
    c.dispose();
    lose = false;
    c = RestUsageController(s);
    await settle();
    await c.acknowledge(recover: true);
    expect(c.pending, isNull);
    expect(c.data!.due, false);
    final after = a.requests.where((r) => r.path.endsWith('/acknowledge')).last;
    expect(after.headers['Idempotency-Key'], before.headers['Idempotency-Key']);
    expect(after.headers['If-Match'], before.headers['If-Match']);
    await s.write('POST', '$usagePath/pulse');
    expect(a.requests.last.headers.containsKey('Idempotency-Key'), false);
    expect(a.requests.last.headers.containsKey('X-Acting-Party'), false);
    expect(s.pending('POST', '$usagePath/pulse'), isNull);
    c.dispose();
  });
  test('412重新读取但不自动重放，503显示不可用；换身份不重置账号统计', () async {
    var broken = false;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/acknowledge')) {
        return envelope({'code': 'VERSION_CONFLICT'}, status: 412, error: true);
      }
      if (r.path.startsWith(usagePath)) {
        return broken
            ? envelope({'code': 'UNAVAILABLE'}, status: 503, error: true)
            : envelope(usage());
      }
      return a.defaultReply(r);
    });
    final s = await actor(a), c = RestUsageController(await actor(a));
    await settle();
    await c.acknowledge();
    expect(c.error, contains('再次确认'));
    expect(a.requests.where((r) => r.path.endsWith('/acknowledge')).length, 1);
    final before = c.data;
    c.session.select(identity(orgId));
    expect(c.data, same(before));
    broken = true;
    await c.refresh();
    expect(c.data, isNull);
    expect(c.error, contains('统计暂不可用'));
    c.dispose();
    s.dispose();
  });
  testWidgets('原生前后台仅采样一次，恢复先读；真实到期由服务器决定', (t) async {
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.startsWith(usagePath)
            ? envelope(usage())
            : a.defaultReply(r));
    final s = (await t.runAsync(() => actor(a)))!;
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: s,
        child: MaterialApp(
            builder: (_, child) => RestReminder(child: child!),
            home: const Scaffold(body: Text('本人页面')))));
    for (var i = 0; i < 20; i++) {
      await t.pump(const Duration(milliseconds: 10));
    }
    expect(find.text('已连续使用一段时间，建议休息。'), findsOneWidget);
    await t.pump(const Duration(seconds: 30));
    for (var i = 0; i < 20; i++) {
      await t.pump(const Duration(milliseconds: 10));
    }
    expect(a.requests.where((r) => r.path.endsWith('/pulse')).length, 1);
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await t.pump(const Duration(minutes: 20));
    for (var i = 0; i < 20; i++) {
      await t.pump(const Duration(milliseconds: 10));
    }
    expect(a.requests.where((r) => r.path.endsWith('/pulse')).length, 1);
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    for (var i = 0; i < 20; i++) {
      await t.pump(const Duration(milliseconds: 10));
    }
    expect(a.requests.last.method, 'GET');
    await t.pumpWidget(const SizedBox());
  });
  test('后台或切号后迟到统计不能回写', () async {
    final response = Completer<Map<String, dynamic>>();
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) async => r.path.startsWith(usagePath)
            ? envelope(await response.future)
            : a.defaultReply(r));
    final s = await actor(a), c = RestUsageController(s);
    c.setVisible(false);
    response.complete(usage());
    await settle();
    expect(c.data, isNull);
    c.dispose();
  });
}
