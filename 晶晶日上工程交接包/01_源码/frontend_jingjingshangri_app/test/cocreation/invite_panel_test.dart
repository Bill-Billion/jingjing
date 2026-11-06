import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/cocreation/invite_panel.dart';
import '../account/fake_account_api.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import '../stock/v5_test_host.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  const room = '77777777-7777-4777-8777-777777777777';
  const link = '88888888-8888-4888-8888-888888888888';
  const adult = '99999999-9999-4999-8999-999999999999';
  final token = '$link.${'a' * 64}';
  Map<String, dynamic> summary(String status) => {
        'id': link,
        'room_id': room,
        'current_status': status,
        'object_version': status == 'ACTIVE' ? 1 : 2,
        'expires_at': '2099-11-04T00:00:00.000Z'
      };
  testWidgets(
      'unknown creation retries original key; credential stays out of visible widgets',
      (t) async {
    var attempts = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/cocreation/rooms/$room/invite-links') {
        if (r.method == 'GET') {
          return envelope({
            'items': attempts > 1 ? [summary('ACTIVE')] : []
          });
        }
        attempts++;
        if (attempts == 1) {
          return envelope({'code': 'TEMPORARY', 'message': 'temporary'},
              status: 503, error: true);
        }
        return envelope({
          ...summary('ACTIVE'),
          'token': token,
          'participation_required': true
        });
      }
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => communitySession(adapter)))!;
    await host(
        t,
        session,
        Scaffold(
            body: ListView(children: [
          CocreationInvitePanel(session: session, room: room, version: 1)
        ])));
    await reveal(t, find.text('生成一次邀请'));
    await t.tap(find.text('生成一次邀请'));
    await frames(t);
    expect(find.text('恢复同一次请求'), findsOneWidget);
    await t.tap(find.text('恢复同一次请求'));
    await frames(t);
    expect(find.text('复制邀请凭证'), findsOneWidget);
    expect(find.textContaining(token), findsNothing);
    final writes = adapter.requests
        .where((r) => r.path.endsWith('/invite-links') && r.method == 'POST')
        .toList();
    expect(writes.length, 2);
    expect(writes[0].headers['Idempotency-Key'],
        writes[1].headers['Idempotency-Key']);
    expect(writes[0].headers['If-Match'], writes[1].headers['If-Match']);
  });
  testWidgets(
      'restart restores original key without persisting invitation secret',
      (t) async {
    var attempts = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/cocreation/rooms/$room/invite-links') {
        if (r.method == 'GET') {
          return envelope({'items': []});
        }
        attempts++;
        if (attempts == 1) {
          return envelope({'code': 'TEMPORARY', 'message': 'temporary'},
              status: 503, error: true);
        }
        return envelope({
          ...summary('ACTIVE'),
          'token': token,
          'participation_required': true
        });
      }
      return adapter.defaultReply(r);
    });
    var session = (await t.runAsync(() => communitySession(adapter)))!;
    await host(
        t,
        session,
        Scaffold(
            body: ListView(children: [
          CocreationInvitePanel(session: session, room: room, version: 1)
        ])));
    await t.tap(find.text('生成一次邀请'));
    await frames(t);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('jx.cocreation.invite.pending.v1'), isNotNull);
    expect(prefs.getString('jx.cocreation.invite.pending.v1'),
        isNot(contains(token)));
    await t.pumpWidget(const SizedBox.shrink());
    session.dispose();
    session = (await t.runAsync(() => communitySession(adapter)))!;
    await host(
        t,
        session,
        Scaffold(
            body: ListView(children: [
          CocreationInvitePanel(session: session, room: room, version: 1)
        ])));
    expect(find.text('恢复同一次请求'), findsOneWidget);
    await t.tap(find.text('恢复同一次请求'));
    await frames(t);
    expect(find.text('复制邀请凭证'), findsOneWidget);
    final writes = adapter.requests
        .where((r) => r.path.endsWith('/invite-links') && r.method == 'POST')
        .toList();
    expect(writes.length, 2);
    expect(writes[0].headers['Idempotency-Key'],
        writes[1].headers['Idempotency-Key']);
    expect(prefs.getString('jx.cocreation.invite.pending.v1'), isNull);
  });
  testWidgets(
      'identity change ignores a late create response and clears the credential',
      (t) async {
    final reply = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/cocreation/rooms/$room/invite-links') {
        if (r.method == 'GET') {
          return envelope({'items': []});
        }
        return reply.future;
      }
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => communitySession(adapter)))!;
    await host(
        t,
        session,
        Scaffold(
            body: ListView(children: [
          CocreationInvitePanel(session: session, room: room, version: 1)
        ])));
    await t.tap(find.text('生成一次邀请'));
    await t.pump();
    session.select(identity(orgId));
    reply.complete(envelope({
      ...summary('ACTIVE'),
      'token': token,
      'participation_required': true
    }));
    await frames(t);
    expect(find.text('复制邀请凭证'), findsNothing);
    expect(find.textContaining(token), findsNothing);
    expect(session.pendingForPrefix('/api/v1/cocreation/'), isEmpty);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('jx.cocreation.invite.pending.v1'), isNull);
  });
  testWidgets('claim response loss retries the same key without joining',
      (t) async {
    var attempts = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/artists/people') {
        return envelope({
          'items': [
            {
              'id': adult,
              'owner_party_id': personId,
              'display_name': '本人',
              'current_status': 'ACTIVE',
              'identity_status': 'VERIFIED',
              'age_band': 'ADULT',
              'identity_valid_until': '2099-11-04T00:00:00.000Z',
              'object_version': 1
            }
          ],
          'next_cursor': null
        });
      }
      if (r.path == '/api/v1/cocreation/invite-links/claim') {
        attempts++;
        if (attempts == 1) {
          return envelope({'code': 'TEMPORARY', 'message': 'temporary'},
              status: 503, error: true);
        }
        return envelope({
          'invitation_id': invitationId,
          'room_id': room,
          'person_id': adult,
          'current_status': 'INVITED',
          'participation_required': true
        });
      }
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => communitySession(adapter)))!;
    await host(
        t,
        session,
        Scaffold(
            body:
                ListView(children: [CocreationInvitePanel(session: session)])));
    final input = find.widgetWithText(TextField, '邀请链接或凭证');
    await reveal(t, input);
    await t.enterText(input, token);
    await reveal(t, find.byType(DropdownButtonFormField<String>));
    await t.tap(find.byType(DropdownButtonFormField<String>));
    await frames(t);
    await t.tap(find.text('本人').last);
    await frames(t);
    await reveal(t, find.text('确认领取邀请'));
    await t.tap(find.text('确认领取邀请'));
    await frames(t);
    await reveal(t, find.text('恢复同一次请求'));
    await t.tap(find.text('恢复同一次请求'));
    await frames(t);
    expect(find.textContaining('领取不代表已参加'), findsOneWidget);
    final writes = adapter.requests
        .where((r) => r.path.endsWith('/invite-links/claim'))
        .toList();
    expect(writes.length, 2);
    expect(writes[0].headers['Idempotency-Key'],
        writes[1].headers['Idempotency-Key']);
    expect(
        adapter.requests
            .where((r) => r.path.endsWith('/members') && r.method == 'POST'),
        isEmpty);
  });
  testWidgets(
      'after restart claim requires same person and pasted token with original key',
      (t) async {
    var attempts = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/artists/people') {
        return envelope({
          'items': [
            {
              'id': adult,
              'owner_party_id': personId,
              'display_name': '本人',
              'current_status': 'ACTIVE',
              'identity_status': 'VERIFIED',
              'age_band': 'ADULT',
              'identity_valid_until': '2099-11-04T00:00:00.000Z',
              'object_version': 1
            }
          ],
          'next_cursor': null
        });
      }
      if (r.path == '/api/v1/cocreation/invite-links/claim') {
        attempts++;
        if (attempts == 1) {
          return envelope({'code': 'TEMPORARY', 'message': 'temporary'},
              status: 503, error: true);
        }
        return envelope({
          'invitation_id': invitationId,
          'room_id': room,
          'person_id': adult,
          'current_status': 'INVITED',
          'participation_required': true
        });
      }
      return adapter.defaultReply(r);
    });
    var session = (await t.runAsync(() => communitySession(adapter)))!;
    Future<void> show() async => host(
        t,
        session,
        Scaffold(
            body:
                ListView(children: [CocreationInvitePanel(session: session)])));
    Future<void> selectPerson() async {
      await reveal(t, find.byType(DropdownButtonFormField<String>));
      await t.tap(find.byType(DropdownButtonFormField<String>));
      await frames(t);
      await t.tap(find.text('本人').last);
      await frames(t);
    }

    await show();
    final input = find.widgetWithText(TextField, '邀请链接或凭证');
    await reveal(t, input);
    await t.enterText(input, token);
    await selectPerson();
    await reveal(t, find.text('确认领取邀请'));
    await t.tap(find.text('确认领取邀请'));
    await frames(t);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('jx.cocreation.invite.pending.v1'),
        isNot(contains(token)));
    await t.pumpWidget(const SizedBox.shrink());
    session.dispose();
    session = (await t.runAsync(() => communitySession(adapter)))!;
    await show();
    await reveal(t, find.text('恢复同一次请求'));
    await t.tap(find.text('恢复同一次请求'));
    await frames(t);
    expect(attempts, 1);
    await reveal(t, input);
    await t.enterText(input, token);
    await selectPerson();
    await reveal(t, find.text('恢复同一次请求'));
    await t.tap(find.text('恢复同一次请求'));
    await frames(t);
    expect(find.textContaining('领取不代表已参加'), findsOneWidget);
    final writes = adapter.requests
        .where((r) => r.path.endsWith('/invite-links/claim'))
        .toList();
    expect(writes.length, 2);
    expect(writes[0].headers['Idempotency-Key'],
        writes[1].headers['Idempotency-Key']);
  });
  testWidgets(
      'damaged recovery data blocks a new invitation rather than choosing a fresh key',
      (t) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('jx.cocreation.invite.pending.v1', '{damaged');
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/cocreation/rooms/$room/invite-links' &&
          r.method == 'GET') {
        return envelope({'items': []});
      }
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => communitySession(adapter)))!;
    await host(
        t,
        session,
        Scaffold(
            body: ListView(children: [
          CocreationInvitePanel(session: session, room: room, version: 1)
        ])));
    expect(find.textContaining('无法核对本机原请求'), findsOneWidget);
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '生成一次邀请'))
            .onPressed,
        isNull);
    expect(
        adapter.requests.where(
            (r) => r.method == 'POST' && r.path.endsWith('/invite-links')),
        isEmpty);
    expect(prefs.getString('jx.cocreation.invite.pending.v1'), '{damaged');
  });
  testWidgets('an expired active invitation is labelled expired', (t) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/cocreation/rooms/$room/invite-links' &&
          r.method == 'GET') {
        return envelope({
          'items': [
            {...summary('ACTIVE'), 'expires_at': '2020-01-01T00:00:00.000Z'}
          ]
        });
      }
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => communitySession(adapter)))!;
    await host(
        t,
        session,
        Scaffold(
            body: ListView(children: [
          CocreationInvitePanel(session: session, room: room, version: 1)
        ])));
    expect(find.textContaining('已到期'), findsOneWidget);
  });
  testWidgets(
      'claim is explicit, only own verified adult, invalid credential does not revoke domain',
      (t) async {
    var attempts = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/artists/people') {
        return envelope({
          'items': [
            {
              'id': adult,
              'owner_party_id': personId,
              'display_name': '本人',
              'current_status': 'ACTIVE',
              'identity_status': 'VERIFIED',
              'age_band': 'ADULT',
              'identity_valid_until': '2099-11-04T00:00:00.000Z',
              'object_version': 1
            }
          ],
          'next_cursor': null
        });
      }
      if (r.path == '/api/v1/cocreation/invite-links/claim') {
        attempts++;
        return envelope({
          'code': 'COCREATION_INVITE_LINK_UNAVAILABLE',
          'message': 'unavailable'
        }, status: 404, error: true);
      }
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => communitySession(adapter)))!;
    await host(
        t,
        session,
        Scaffold(
            body:
                ListView(children: [CocreationInvitePanel(session: session)])));
    await reveal(t, find.widgetWithText(TextField, '邀请链接或凭证'));
    await t.enterText(find.widgetWithText(TextField, '邀请链接或凭证'), token);
    await reveal(t, find.byType(DropdownButtonFormField<String>));
    await t.tap(find.byType(DropdownButtonFormField<String>));
    await frames(t);
    await t.tap(find.text('本人').last);
    await frames(t);
    await reveal(t, find.text('确认领取邀请'));
    expect(attempts, 0);
    await t.tap(find.text('确认领取邀请'));
    await frames(t);
    expect(attempts, 1);
    expect(find.textContaining('邀请已失效'), findsOneWidget);
    expect(session.isDomainDenied('/api/v1/cocreation/'), false);
    expect(
        t
            .widget<TextField>(find.widgetWithText(TextField, '邀请链接或凭证'))
            .controller!
            .text,
        isEmpty);
  });
}
