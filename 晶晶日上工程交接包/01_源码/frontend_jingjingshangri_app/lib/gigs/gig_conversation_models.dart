import '../stock/v5_support.dart';

const commercialConversationStates = {
  'OPEN': '本商业订单会话已开放',
  'FROZEN': '本单会话已冻结',
  'ARCHIVED': '本单会话已归档'
};

class CommercialMessage {
  CommercialMessage(dynamic value, String conversationId, String orderId)
      : raw = v5Map(value) {
    v5Require(v5Id(raw['id']) &&
        raw['kind'] == 'COMMERCIAL_MESSAGE' &&
        raw['parent_id'] == conversationId &&
        v5Id(raw['owner_party_id']) &&
        (raw['counterparty_id'] == null || v5Id(raw['counterparty_id'])) &&
        v5Id(raw['created_by']) &&
        v5Int(raw['object_version'], min: 1) &&
        v5Hash(raw['content_sha256']) &&
        ['SENT', 'HIDDEN'].contains(raw['current_status']));
    data = v5Map(raw['data']);
    v5Require(['TEXT', 'ORDER_CARD', 'MEDIA'].contains(data['kind']) &&
        v5Date(data['at']));
    if (hidden) {
      v5Require(data.length == 4 &&
          data['hidden'] == true &&
          data['body'] == null &&
          data.keys
              .every((key) => ['kind', 'body', 'hidden', 'at'].contains(key)));
      return;
    }
    v5Require(data['order_id'] == orderId && v5Id(data['account_id']));
    if (kind == 'TEXT') {
      v5Require(data['body'] is String &&
          data['body'].isNotEmpty &&
          data['body'].length <= 4000 &&
          data['asset'] == null);
    } else {
      v5Require(data['body'] == null);
      if (kind == 'MEDIA') {
        final asset = v5Map(data['asset']);
        v5Require(v5Id(asset['id']) &&
            v5Hash(asset['sha256']) &&
            [
              'application/pdf',
              'text/plain',
              'application/octet-stream',
              'image/jpeg',
              'image/png',
              'video/mp4',
              'audio/wav',
              'audio/mpeg'
            ].contains(asset['media_type']));
      } else {
        v5Require(data['asset'] == null);
      }
    }
  }
  final Map<String, dynamic> raw;
  late final Map<String, dynamic> data;
  String get id => raw['id'];
  String get kind => data['kind'];
  bool get hidden => raw['current_status'] == 'HIDDEN';
}

class CommercialConversation {
  CommercialConversation(dynamic value, String orderId, {String? previous})
      : raw = v5Map(value) {
    v5Require(raw['order_id'] == orderId &&
        v5Id(raw['conversation_id']) &&
        v5Int(raw['object_version'], min: 1) &&
        commercialConversationStates.containsKey(raw['status']) &&
        raw['support_requested'] is bool &&
        raw['support_joined'] is bool &&
        (raw['read_until'] == null || v5Id(raw['read_until'])));
    final page = V5Page.parse(raw, (m) => CommercialMessage(m, id, orderId),
        previous: previous);
    messages = page.items;
    cursor = page.cursor;
    v5Require(messages.map((m) => m.id).toSet().length == messages.length);
  }
  final Map<String, dynamic> raw;
  late final List<CommercialMessage> messages;
  late final String? cursor;
  String get id => raw['conversation_id'];
  String get status => raw['status'];
  int get version => raw['object_version'];
  bool get writable => status == 'OPEN';
}

void validateCommercialConversationCommand(Map<String, dynamic> raw,
    {required String orderId,
    required String conversationId,
    required String action}) {
  if (action == 'read') {
    v5Require(raw['order_id'] == orderId && v5Id(raw['read_until']));
    return;
  }
  v5Require(raw['id'] == conversationId &&
      raw['kind'] == 'CONVERSATION' &&
      v5Id(raw['owner_party_id']) &&
      v5Id(raw['counterparty_id']) &&
      v5Int(raw['object_version'], min: 1) &&
      v5Hash(raw['content_sha256']));
  final data = v5Map(raw['data']);
  v5Require(data['order_id'] == orderId);
  if (action == 'contact') {
    v5Require(data['consent'] is bool);
  } else {
    v5Require(action == 'control' &&
        data['support_requested'] is bool &&
        data['support_joined'] is bool &&
        data['frozen'] is bool &&
        data['archived'] is bool);
  }
}
