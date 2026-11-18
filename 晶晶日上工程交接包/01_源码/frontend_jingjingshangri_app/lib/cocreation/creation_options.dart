import '../engagement/community_support.dart';

/// These choices belong to one submitted story and the current acting person.
/// The rule digest covers the server's full record, including its review.
class CocreationCreationOptions {
  const CocreationCreationOptions(this.producers, this.rules, this.reason);
  final List<Map<String, dynamic>> producers, rules;
  final String? reason;

  static Future<CocreationCreationOptions> load(
      CommunityApi api, String requestId) async {
    communityRequiredId(requestId, '本人已提交故事');
    String? reason;
    Future<List<Map<String, dynamic>>> pages(String kind) async {
      final items = <Map<String, dynamic>>[],
          cursors = <String>{},
          ids = <String>{};
      String? cursor;
      do {
        final page = await api.read('creation-options', query: {
          'request_id': requestId,
          'kind': kind,
          'limit': 20,
          if (cursor != null) 'cursor': cursor,
        });
        final unavailable = page['unavailable_reason'];
        communityRequire(unavailable == null ||
            kind == 'PRODUCER' &&
                unavailable == 'CUSTOMIZATION_MERCHANT_NOT_CONFIGURED');
        if (unavailable is String) reason = unavailable;
        for (final r in communityItems(page)) {
          communityRequire(communityId(r['id']) && ids.add(r['id']));
          if (kind == 'PRODUCER') {
            communityRequire(unavailable == null &&
                r['role'] == 'PLATFORM_CONTRACTING_PARTY' &&
                r['display_name'] is String &&
                (r['display_name'] as String).isNotEmpty);
          } else {
            final rule = communityMap(r['rule']);
            communityRequire(r['content_sha256'] is String &&
                RegExp(r'^[a-f0-9]{64}$').hasMatch(r['content_sha256']) &&
                rule['version'] is String &&
                rule['participation_terms'] is String &&
                rule['max_people'] is int &&
                rule['max_people'] > 0 &&
                rule['extension_days'] is int &&
                rule['extension_days'] >= 0 &&
                rule['benefit'] is Map);
          }
          items.add(r);
        }
        final next = page['next_cursor'];
        communityRequire(
            next == null || communityId(next) && cursors.add(next));
        cursor = next as String?;
      } while (cursor != null);
      return items;
    }

    final result = await Future.wait([pages('PRODUCER'), pages('RULE')]);
    return CocreationCreationOptions(result[0], result[1], reason);
  }
}

const cocreationCreationMessages = <String, String>{
  'COCREATION_SUBMITTED_STORY_REQUIRED': '请先正式提交自己的故事，再回来发起共创。',
  'COCREATION_STORY_SUPPLEMENT_PENDING': '这份故事还有待补资料，请先完成补件并正式提交。',
  'COCREATION_BEFORE_QUOTE_REQUIRED': '这份故事已进入报价，请回原报价继续办理，不能再补建房间。',
  'CUSTOMIZATION_ORDER_EXISTS': '这份故事已有订单，请回原订单继续办理。',
  'COCREATION_ROOM_EXISTS': '这份故事已经建立共创房间，请从“我的共创”继续邀请和查看进度。',
  'MANUAL_SAMPLE_COCREATION_NOT_ALLOWED': '人工样片申请不能建立共创房间，请选择其他已提交故事。',
  'CUSTOMIZATION_MERCHANT_NOT_CONFIGURED': '平台尚未开放本次承制方，请稍后重新读取；故事已保存。',
  'CUSTOMIZATION_MERCHANT_FORBIDDEN': '本次承制方已变化，请重新读取并确认获准承制方。',
  'COCREATION_RULE_NOT_EFFECTIVE': '所选共创规则已停止生效，请重新读取并确认当前规则。',
  'COCREATION_DEADLINE_PASSED': '招募截止时间必须晚于当前时间，请重新选择。',
};
