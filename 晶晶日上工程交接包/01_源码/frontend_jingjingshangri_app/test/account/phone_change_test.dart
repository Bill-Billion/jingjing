import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/phone_change.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../stock/v5_test_host.dart';
import 'fake_account_api.dart';

Map<String, dynamic> phoneRecord(
        {String state = 'AWAITING_OLD',
        int version = 1,
        bool relogin = false,
        bool challenge = false}) =>
    {
      'id': invitationId,
      'current_status': state,
      'object_version': version,
      'old_phone_mask': '130****0101',
      'new_phone_mask': '130****0202',
      'expires_at': DateTime.now()
          .add(const Duration(minutes: 15))
          .toUtc()
          .toIso8601String(),
      'created_at': DateTime.now().toUtc().toIso8601String(),
      'can_continue': ['AWAITING_OLD', 'AWAITING_NEW', 'READY'].contains(state),
      'requires_relogin': relogin,
      'recovery_route': 'SUPPORT_TICKET_REVIEW_ONLY',
      'challenges': [
        if (challenge)
          {
            'id': orgId,
            'side': state == 'AWAITING_NEW' ? 'NEW' : 'OLD',
            'current_status': 'SENT',
            'attempts_remaining': 3,
            'expires_at': DateTime.now()
                .add(const Duration(minutes: 5))
                .toUtc()
                .toIso8601String(),
            'resend_after': DateTime.now()
                .subtract(const Duration(seconds: 1))
                .toUtc()
                .toIso8601String()
          }
      ]
    };
Future<void> press(WidgetTester t, String text) async {
  final target = find.widgetWithText(FilledButton, text).evaluate().isNotEmpty
      ? find.widgetWithText(FilledButton, text)
      : find.widgetWithText(OutlinedButton, text);
  await reveal(t, target);
  await t.tap(target);
  await frames(t);
}

void main() {
  test('换号DTO只收掩码、两侧独立challenge并核对状态', () {
    final r = phoneRecord(challenge: true);
    expect(phoneChangeRecord(r), r);
    expect(
        () => phoneChangeRecord({
              ...r,
              'challenges': [...r['challenges'], ...r['challenges']]
            }),
        throwsA(isA<AccountError>()));
    expect(() => phoneChangeRecord({...r, 'requires_relogin': true}),
        throwsA(isA<AccountError>()));
    expect(() => phoneChangeRecord({...r, 'old_phone_mask': 'unmasked'}),
        throwsA(isA<AccountError>()));
  });
  test('账号级未知请求切办事身份仍保留原键版本与内容，不带acting', () async {
    var attempts = 0;
    late FakeAccountAdapter a;
    final path = '$phoneChangePrefix/$invitationId/challenges';
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == path) {
        if (++attempts == 1) {
          return envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
              status: 503, error: true);
        }
        return envelope(phoneRecord(challenge: true));
      }
      return a.defaultReply(r);
    });
    final s = await buyerSession(a);
    await expectLater(s.write('POST', path, body: {'side': 'OLD'}, version: 1),
        throwsA(isA<AccountError>()));
    final pending = s.pending('POST', path)!;
    s.select(identity(orgId));
    expect(s.pending('POST', path), isNotNull);
    await s.write('POST', path,
        body: Map<String, dynamic>.from(pending['body']),
        version: pending['version']);
    final requests = a.requests.where((r) => r.path == path).toList();
    expect(requests.length, 2);
    expect(requests.first.headers['Idempotency-Key'],
        requests.last.headers['Idempotency-Key']);
    expect(requests.last.headers['If-Match'], '"1"');
    expect(requests.every((r) => r.headers['X-Acting-Party'] == null), isTrue);
    expect(requests.first.data, requests.last.data);
    await expectLater(s.read('$phoneChangePrefix/current', actingParty: orgId),
        throwsA(isA<AccountError>()));
  });
  test('切办事身份不丢迟到账号结果，退出登录后迟到结果不能恢复原请求', () async {
    final held = Completer<void>();
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) async {
      if (r.path.startsWith(phoneChangePrefix)) {
        await held.future;
        return envelope(phoneRecord());
      }
      return a.defaultReply(r);
    });
    final s = await buyerSession(a);
    final response = s.read('$phoneChangePrefix/$invitationId');
    s.select(identity(orgId));
    held.complete();
    expect((await response)['id'], invitationId);
    final held2 = Completer<void>();
    late FakeAccountAdapter b;
    b = FakeAccountAdapter(handler: (r) async {
      if (r.path.startsWith(phoneChangePrefix)) {
        await held2.future;
        return envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
            status: 503, error: true);
      }
      return b.defaultReply(r);
    });
    final other = await buyerSession(b);
    final pending = other.write(
        'POST', '$phoneChangePrefix/$invitationId/challenges',
        body: {'side': 'OLD'}, version: 1);
    final check = expectLater(pending, throwsA(isA<AccountError>()));
    other.requirePhoneRelogin();
    held2.complete();
    await check;
    expect(other.pendingForPrefix(phoneChangePrefix, personal: true), isEmpty);
  });
  testWidgets('重登后COMPLETED且无需重登时显示完成，不循环退出', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path == '$phoneChangePrefix/current'
            ? envelope({'request': phoneRecord(state: 'COMPLETED')})
            : a.defaultReply(r));
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const PhoneChangePage());
    expect(s.isLoggedIn, isTrue);
    expect(find.text('手机号已变更'), findsOneWidget);
    expect(find.text('验证手机号并登录'), findsNothing);
    expect(
        a.requests.where(
            (r) => r.path.startsWith(phoneChangePrefix) && r.method == 'POST'),
        isEmpty);
    await t.pumpWidget(const SizedBox());
  });
  testWidgets('验证码错误保留登录，独立旧号challenge，不自动重发', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '$phoneChangePrefix/current') {
        return envelope({'request': phoneRecord(challenge: true, version: 2)});
      }
      if (r.path.endsWith('/verifications')) {
        return envelope({'code': 'INVALID_PHONE_CHANGE_CODE'},
            status: 400, error: true);
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const PhoneChangePage());
    await reveal(t, find.byType(TextField));
    await t.enterText(
        find.byType(TextField), List.generate(6, (i) => '$i').join());
    await press(t, '验证原手机号');
    expect(s.isLoggedIn, isTrue);
    expect(find.textContaining('验证码不正确'), findsOneWidget);
    final request =
        a.requests.singleWhere((r) => r.path.endsWith('/verifications'));
    expect(request.data['side'], 'OLD');
    expect(request.data['challenge_id'], orgId);
    expect(request.headers['If-Match'], '"2"');
    expect(request.headers['X-Acting-Party'], isNull);
    expect(a.requests.where((r) => r.path.endsWith('/challenges')), isEmpty);
    await t.pumpWidget(const SizedBox());
  });
  testWidgets('412读取新步骤并清除旧侧输入，需主动验证新号', (t) async {
    var changed = false;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '$phoneChangePrefix/current') {
        return envelope({
          'request': phoneRecord(
              state: changed ? 'AWAITING_NEW' : 'AWAITING_OLD',
              challenge: true,
              version: changed ? 3 : 2)
        });
      }
      if (r.path.endsWith('/verifications')) {
        changed = true;
        return envelope({'code': 'VERSION_CONFLICT'}, status: 412, error: true);
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const PhoneChangePage());
    await reveal(t, find.byType(TextField));
    await t.enterText(
        find.byType(TextField), List.generate(6, (i) => '$i').join());
    await press(t, '验证原手机号');
    expect(
        t.widget<TextField>(find.byType(TextField)).controller!.text, isEmpty);
    expect(
        a.requests.where((r) => r.path.endsWith('/verifications')).length, 1);
    await reveal(t, find.widgetWithText(FilledButton, '验证新手机号'));
    expect(find.widgetWithText(FilledButton, '验证新手机号'), findsOneWidget);
    expect(s.isLoggedIn, isTrue);
    await t.pumpWidget(const SizedBox());
  });
  testWidgets('恢复原发码须先读取且保留原键；切身份不丢页面challenge', (t) async {
    var attempts = 0;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '$phoneChangePrefix/current') {
        return envelope({'request': phoneRecord()});
      }
      if (r.path.endsWith('/challenges')) {
        if (++attempts == 1) {
          return envelope({'code': 'SMS_NOT_READY'}, status: 503, error: true);
        }
        return envelope(phoneRecord(challenge: true, version: 2));
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const PhoneChangePage());
    await press(t, '发送原手机号验证码');
    s.select(identity(orgId));
    await frames(t);
    expect(attempts, 1);
    await press(t, '先核对当前进度');
    await press(t, '按原请求继续核对');
    final calls =
        a.requests.where((r) => r.path.endsWith('/challenges')).toList();
    expect(calls.length, 2);
    expect(calls[0].headers['Idempotency-Key'],
        calls[1].headers['Idempotency-Key']);
    expect(calls[1].headers['If-Match'], '"1"');
    expect(calls[1].data, {'side': 'OLD'});
    await t.pumpWidget(const SizedBox());
  });
  testWidgets('最终确认须本人勾选，成功清除旧会话并用新号登录', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '$phoneChangePrefix/current') {
        return envelope({'request': phoneRecord(state: 'READY', version: 5)});
      }
      if (r.path.endsWith('/confirmation')) {
        return envelope(
            phoneRecord(state: 'COMPLETED', version: 6, relogin: true));
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const PhoneChangePage());
    await reveal(t, find.text('确认更换手机号'));
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '确认更换手机号'))
            .onPressed,
        isNull);
    await reveal(t, find.byType(CheckboxListTile));
    await t.tap(find.byType(CheckboxListTile));
    await frames(t);
    await press(t, '确认更换手机号');
    expect(s.isLoggedIn, isFalse);
    expect(find.text('验证手机号并登录'), findsOneWidget);
    final calls =
        a.requests.where((r) => r.path.endsWith('/confirmation')).toList();
    expect(calls.length, 1);
    expect(calls.single.data, isEmpty);
    expect(calls.single.headers['If-Match'], '"5"');
    await t.pumpWidget(const SizedBox());
  });
  testWidgets('未知创建读到同掩码的历史完成记录也保留原请求，显式原键恢复', (t) async {
    var writes = 0;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == phoneChangePrefix) {
        if (++writes == 1) {
          return envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
              status: 503, error: true);
        }
        return envelope(phoneRecord());
      }
      if (r.path == '$phoneChangePrefix/current') {
        return envelope({'request': phoneRecord(state: 'COMPLETED')});
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    final body = {
      'old_phone': 'synthetic-old-input',
      'new_phone': 'synthetic-new-input'
    };
    await t.runAsync(() => expectLater(
        s.write('POST', phoneChangePrefix, body: body),
        throwsA(isA<AccountError>())));
    await host(t, s, const PhoneChangePage());
    expect(writes, 1);
    expect(s.pending('POST', phoneChangePrefix), isNotNull);
    await press(t, '按原请求继续核对');
    final requests =
        a.requests.where((r) => r.path == phoneChangePrefix).toList();
    expect(requests.length, 2);
    expect(requests.first.headers['Idempotency-Key'],
        requests.last.headers['Idempotency-Key']);
    expect(requests.last.data, body);
    expect(requests.last.headers['X-Acting-Party'], isNull);
    expect(s.isLoggedIn, isTrue);
    await t.pumpWidget(const SizedBox());
  });
  test('错误验证码即使返回401也不是登录失效，真正401仍清旧会话', () async {
    var invalidCode = true;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.startsWith(phoneChangePrefix)) {
        return envelope({
          'code': invalidCode
              ? 'INVALID_PHONE_CHANGE_CODE'
              : 'AUTHENTICATION_REQUIRED'
        }, status: 401, error: true);
      }
      return a.defaultReply(r);
    });
    final s = await buyerSession(a);
    await expectLater(
        s.write('POST', '$phoneChangePrefix/$invitationId/verifications',
            body: {}),
        throwsA(isA<AccountError>()));
    expect(s.isLoggedIn, isTrue);
    invalidCode = false;
    await expectLater(
        s.read('$phoneChangePrefix/current'), throwsA(isA<AccountError>()));
    expect(s.isLoggedIn, isFalse);
  });
  testWidgets('更换账号会话实例时清旧换号进度并重新读取，不复用相同epoch', (t) async {
    late FakeAccountAdapter a, b;
    a = FakeAccountAdapter(
        handler: (r) => r.path == '$phoneChangePrefix/current'
            ? envelope({'request': phoneRecord(state: 'COMPLETED')})
            : a.defaultReply(r));
    b = FakeAccountAdapter(
        handler: (r) => r.path == '$phoneChangePrefix/current'
            ? envelope({'request': phoneRecord(state: 'AWAITING_NEW')})
            : b.defaultReply(r));
    final first = (await t.runAsync(() => buyerSession(a)))!;
    final second = (await t.runAsync(() => buyerSession(b)))!;
    expect(first.loginEpoch, second.loginEpoch);
    await host(t, first, const PhoneChangePage());
    expect(find.text('手机号已变更'), findsOneWidget);
    await host(t, second, const PhoneChangePage());
    expect(find.text('手机号已变更'), findsNothing);
    expect(
        b.requests.where((r) => r.path == '$phoneChangePrefix/current').length,
        1);
    await t.pumpWidget(const SizedBox());
  });
}
