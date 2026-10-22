import 'dart:async';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/gigs/gig_conversation.dart';
import 'package:jingjingshangri_app/gigs/gig_conversation_api.dart';
import 'package:jingjingshangri_app/gigs/gig_conversation_models.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../trade/trade_fixtures.dart' show orderId;

const conversationId = 'f1000000-0000-4000-8000-000000000001';
const messageId = 'f1000000-0000-4000-8000-000000000002';
const nextMessageId = 'f1000000-0000-4000-8000-000000000003';
const fileId = 'f1000000-0000-4000-8000-000000000004';
const conversationDate = '2026-10-22T02:00:00.000Z';
Map<String, dynamic> message(
        {String kind = 'TEXT', bool hidden = false, String id = messageId}) =>
    {
      'id': id,
      'kind': 'COMMERCIAL_MESSAGE',
      'owner_party_id': personId,
      'counterparty_id': null,
      'parent_id': conversationId,
      'created_by': accountId,
      'current_status': hidden ? 'HIDDEN' : 'SENT',
      'object_version': hidden ? 2 : 1,
      'content_sha256': 'd' * 64,
      'data': hidden
          ? {'kind': kind, 'body': null, 'hidden': true, 'at': conversationDate}
          : {
              'kind': kind,
              'body': kind == 'TEXT' ? '这笔原商业订单的私有业务说明' : null,
              'asset': kind == 'MEDIA'
                  ? {
                      'id': fileId,
                      'sha256': sha256.convert([1, 2, 3]).toString(),
                      'media_type': 'application/pdf'
                    }
                  : null,
              'order_id': orderId,
              'account_id': accountId,
              'at': conversationDate
            }
    };
Map<String, dynamic> conversation(
        {String status = 'OPEN',
        List<Map<String, dynamic>>? items,
        String? cursor}) =>
    {
      'order_id': orderId,
      'conversation_id': conversationId,
      'object_version': 4,
      'status': status,
      'support_requested': false,
      'support_joined': false,
      'read_until': null,
      'items': items ?? [message()],
      'next_cursor': cursor
    };

void main() {
  testWidgets('没有原商业订单时不发会话请求或允许手输引用', (t) async {
    final a = FakeAccountAdapter(),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const GigConversationPage(orderId: ''));
    expect(find.text('先选择原商业订单'), findsOneWidget);
    expect(find.byType(TextFormField), findsNothing);
    expect(a.requests.where((r) => r.path.contains('/conversation/')), isEmpty);
  });
  test('商业会话绑定原订单与父会话，隐藏记录不接受原文字或附件', () {
    final page = CommercialConversation(conversation(), orderId);
    expect(page.writable, true);
    expect(page.messages.single.data['body'], contains('私有业务说明'));
    expect(() => CommercialConversation(conversation(), fileId),
        throwsA(isA<AccountError>()));
    final wrong = message()..['parent_id'] = fileId;
    expect(() => CommercialConversation(conversation(items: [wrong]), orderId),
        throwsA(isA<AccountError>()));
    final hidden = message(kind: 'MEDIA', hidden: true);
    expect(
        CommercialConversation(conversation(items: [hidden]), orderId)
            .messages
            .single
            .hidden,
        true);
    hidden['data']['asset'] = {'id': fileId};
    expect(() => CommercialConversation(conversation(items: [hidden]), orderId),
        throwsA(isA<AccountError>()));
  });

  test('有效机构成员可按实际主体读取分页，游标和原订单不由客户端替换', () async {
    final a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/conversation/messages')
            ? envelope(conversation(items: [], cursor: nextMessageId))
            : FakeAccountAdapter().defaultReply(r));
    final s = await buyerSession(a);
    s.select(identity(orgId, owner: false));
    final page = await GigConversationApi(s, orderId).messages();
    expect(page.cursor, nextMessageId);
    expect(a.requests.last.headers['X-Acting-Party'], orgId);
    expect(a.requests.last.queryParameters, {'limit': 20});
    expect(a.requests.last.path,
        '/api/v1/gigs/orders/$orderId/conversation/messages');
  });

  test('未知消息原键恢复，冻结时保留原正文并禁止重发直到实读恢复开放', () async {
    var posts = 0, frozen = false;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/conversation/messages')) {
        if (r.method == 'GET') {
          return envelope(conversation(status: frozen ? 'FROZEN' : 'OPEN'));
        }
        return ++posts == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope(message());
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a), api = GigConversationApi(s, orderId);
    final suffix = '${api.conversation}/messages';
    final body = {'kind': 'TEXT', 'body': '原说明', 'asset_id': null};
    await expectLater(
        api.post(
            suffix, body, (d) => CommercialMessage(d, conversationId, orderId)),
        throwsA(isA<AccountError>()));
    frozen = true;
    await expectLater(
        api.restoreOperation(api.path(suffix)),
        throwsA(
            isA<AccountError>().having((e) => e.uncertain, 'uncertain', true)));
    expect(posts, 1);
    expect(api.pending(suffix)!['body'], body);
    frozen = false;
    await expectLater(
        api.post(suffix, {...body, 'body': '不能换原说明'},
            (d) => CommercialMessage(d, conversationId, orderId)),
        throwsA(isA<AccountError>()));
    expect(posts, 1);
    await api.restoreOperation(api.path(suffix));
    final writes = a.requests
        .where((r) =>
            r.path.endsWith('/conversation/messages') && r.method == 'POST')
        .toList();
    expect(writes.length, 2);
    expect(writes.last.data, writes.first.data);
    expect(writes.last.headers['Idempotency-Key'],
        writes.first.headers['Idempotency-Key']);
    expect(api.pending(suffix), isNull);
  });

  test('附件跨页复核原消息，冻结摘要一致后才读受控文件', () async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/conversation/messages')) {
        return envelope(r.queryParameters['cursor'] == nextMessageId
            ? conversation(items: [message(kind: 'MEDIA', id: nextMessageId)])
            : conversation(cursor: nextMessageId));
      }
      if (r.path.endsWith('/file')) {
        return ResponseBody.fromBytes([1, 2, 3], 200,
            headers: {
              Headers.contentTypeHeader: ['application/octet-stream']
            });
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a), api = GigConversationApi(s, orderId);
    final result = await api.material(CommercialMessage(
        message(kind: 'MEDIA', id: nextMessageId), conversationId, orderId));
    expect(result, [1, 2, 3]);
    final reads =
        a.requests.where((r) => r.path.contains('/conversation/')).toList();
    expect(reads.map((r) => r.path).toList(), [
      '${api.base}${api.conversation}/messages',
      '${api.base}${api.conversation}/messages',
      '${api.base}${api.conversation}/messages/$nextMessageId/file'
    ]);
    expect(reads[1].queryParameters['cursor'], nextMessageId);
  });

  test('隐藏后的附件不再GET，返回错误摘要也不交付字节', () async {
    var hidden = true, observedHidden = false;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/conversation/messages')) {
        return envelope(
            conversation(items: [message(kind: 'MEDIA', hidden: hidden)]));
      }
      if (r.path.endsWith('/file')) {
        return ResponseBody.fromBytes([9, 9], 200,
            headers: {
              Headers.contentTypeHeader: ['application/octet-stream']
            });
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a), api = GigConversationApi(s, orderId);
    final media =
        CommercialMessage(message(kind: 'MEDIA'), conversationId, orderId);
    await expectLater(
        api.material(media, onChanged: (m) => observedHidden = m.hidden),
        throwsA(isA<AccountError>()));
    expect(observedHidden, isTrue);
    expect(a.requests.where((r) => r.path.endsWith('/file')), isEmpty);
    hidden = false;
    await expectLater(
        api.material(media),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PRIVATE_CONTENT_MISMATCH')));
  });

  test('身份A到B再回A，迟到的商业附件仍按原epoch丢弃', () async {
    final bytes = Completer<ResponseBody>(), started = Completer<void>();
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/conversation/messages')) {
        return envelope(conversation(items: [message(kind: 'MEDIA')]));
      }
      if (r.path.endsWith('/file')) {
        started.complete();
        return bytes.future;
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a), api = GigConversationApi(s, orderId);
    final result = api.material(
        CommercialMessage(message(kind: 'MEDIA'), conversationId, orderId));
    final assertion = expectLater(
        result,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    await started.future;
    s.select(identity(orgId));
    s.select(identity(personId));
    bytes.complete(ResponseBody.fromBytes([1, 2, 3], 200,
        headers: {
          Headers.contentTypeHeader: ['application/octet-stream']
        }));
    await assertion;
    expect(s.gigsPending, isEmpty);
  });

  for (final status in ['FROZEN', 'ARCHIVED']) {
    testWidgets('$status 可读原历史，无自动联系卡、附件请求和继续写入', (t) async {
      final a = FakeAccountAdapter(
          handler: (r) => r.path.endsWith('/conversation/messages')
              ? envelope(conversation(status: status))
              : FakeAccountAdapter().defaultReply(r));
      final s = (await t.runAsync(() => buyerSession(a)))!;
      await host(t, s, const GigConversationPage(orderId: orderId));
      expect(find.text('这笔原商业订单的私有业务说明'), findsOneWidget);
      final send = find.widgetWithText(FilledButton, '发送本单商业消息');
      await reveal(t, send);
      expect(t.widget<FilledButton>(send).onPressed, isNull);
      final contact = find.widgetWithText(FilledButton, '确认本单联系卡选择');
      await reveal(t, contact);
      expect(t.widget<FilledButton>(contact).onPressed, isNull);
      expect(find.text('明确读取当前获准联系卡'), findsNothing);
      expect(
          a.requests.where((r) =>
              r.path.endsWith('/contacts') ||
              r.path.endsWith('/file') ||
              r.method == 'POST' && r.path.contains('/conversation/')),
          isEmpty);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('点旧附件前真实复读已隐藏状态，页面清除旧下载入口', (t) async {
    var gets = 0;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/conversation/messages')) {
        return envelope(
            conversation(items: [message(kind: 'MEDIA', hidden: ++gets > 1)]));
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const GigConversationPage(orderId: orderId));
    expect(a.requests.where((r) => r.path.endsWith('/file')), isEmpty);
    final attachment = find.text('按本单权限读取此附件');
    await reveal(t, attachment);
    await t.tap(attachment);
    await frames(t);
    expect(find.text('按本单权限读取此附件'), findsNothing);
    expect(find.text('本条内容已隐藏'), findsOneWidget);
    expect(a.requests.where((r) => r.path.endsWith('/file')), isEmpty);
    expect(t.takeException(), isNull);
  });
}
