import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../stock/v5_support.dart';
import 'gig_conversation_models.dart';

class GigConversationApi extends V5Api {
  GigConversationApi(AccountSession session, this.orderId)
      : super(session, 'gigs');
  final String orderId;
  String get conversation => '/orders/${key(orderId)}/conversation';
  Future<CommercialConversation> messages({String? cursor}) => get(
      '$conversation/messages',
      (d) => CommercialConversation(d, orderId, previous: cursor),
      query: {'limit': 20, if (cursor != null) 'cursor': key(cursor)});
  String? recoveryLabel(String path) {
    final prefix = '$base$conversation/';
    return switch (
        path.startsWith(prefix) ? path.substring(prefix.length) : '') {
      'messages' => '本单消息',
      'contact' => '本单联系卡',
      'control' => '本单客服请求',
      'read' => '本人已读',
      _ => null
    };
  }

  Future<Map<String, dynamic>> restoreOperation(String path) async {
    if (recoveryLabel(path) == null) {
      throw const AccountError(400, 'INVALID_ACTION');
    }
    final latest = await messages(), action = path.split('/').last;
    if (['messages', 'contact'].contains(action) && !latest.writable) {
      throw AccountError(409, 'COMMERCIAL_CONVERSATION_${latest.status}',
          uncertain: true);
    }
    return retry(path.substring(base.length), (d) {
      validate(d, latest, action);
      return d;
    });
  }

  void validate(
      Map<String, dynamic> d, CommercialConversation c, String action) {
    if (action == 'messages') {
      CommercialMessage(d, c.id, orderId);
    } else {
      validateCommercialConversationCommand(d,
          orderId: orderId, conversationId: c.id, action: action);
    }
  }

  Future<Map<String, dynamic>> contacts() => get('$conversation/contacts', (d) {
        v5Require(d['order_id'] == orderId && d['status'] == 'OPEN');
        final rows = v5Map(d['contacts']);
        v5Require(rows.length <= 3);
        for (final entry in rows.entries) {
          final contact = v5Map(entry.value);
          v5Require(v5Id(entry.key) &&
              contact['name'] is String &&
              contact['name'].isNotEmpty &&
              contact['phone'] is String &&
              RegExp(r'^1[3-9]\d{9}$').hasMatch(contact['phone']));
        }
        return d;
      });
  @override
  Future<T> post<T>(String suffix, Map<String, dynamic> body,
      T Function(Map<String, dynamic>) parse,
      {int? version}) async {
    if (pending(suffix) != null &&
        ['$conversation/messages', '$conversation/contact'].contains(suffix)) {
      final current = await messages();
      if (!current.writable) {
        throw AccountError(409, 'COMMERCIAL_CONVERSATION_${current.status}',
            uncertain: true);
      }
    }
    return super.post(suffix, body, parse, version: version);
  }

  Future<CommercialMessage> currentMessage(String id,
      {void Function(CommercialConversation)? onSnapshot}) async {
    key(id);
    String? cursor;
    final seen = <String>{};
    do {
      final page = await messages(cursor: cursor);
      onSnapshot?.call(page);
      final found = page.messages.where((m) => m.id == id).firstOrNull;
      if (found != null) return found;
      cursor = page.cursor;
      if (cursor != null) v5Require(seen.add(cursor));
    } while (cursor != null);
    throw const AccountError(404, 'GIG_NOT_FOUND');
  }

  Future<Uint8List> material(CommercialMessage original,
      {void Function(CommercialMessage)? onChanged,
      void Function(CommercialConversation)? onSnapshot}) async {
    if (original.hidden || original.kind != 'MEDIA') {
      throw const AccountError(409, 'COMMERCIAL_MESSAGE_HIDDEN');
    }
    final current = await currentMessage(original.id, onSnapshot: onSnapshot);
    if (current.hidden ||
        current.raw['content_sha256'] != original.raw['content_sha256']) {
      onChanged?.call(current);
      throw const AccountError(409, 'COMMERCIAL_MESSAGE_HIDDEN');
    }
    final result = await bytes(
        '$conversation/messages/${key(original.id)}/file',
        max: 8 * 1024 * 1024);
    if (sha256.convert(result).toString() != current.data['asset']['sha256']) {
      throw const AccountError(503, 'PRIVATE_CONTENT_MISMATCH');
    }
    return result;
  }
}
