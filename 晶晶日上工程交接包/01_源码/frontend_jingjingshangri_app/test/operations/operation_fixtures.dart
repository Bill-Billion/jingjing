import 'dart:async';
import 'package:dio/dio.dart';
import '../account/fake_account_api.dart';
import '../finance/finance_fixtures.dart';
import '../gigs/gig_fixtures.dart';
import '../licensing/license_fixtures.dart';
import '../production/production_fixtures.dart';
import '../projects/project_fixtures.dart';
import '../supply/supply_fixtures.dart';

const commentKey = 'f3000000-0000-4000-8000-000000000001';
const secondCommentKey = 'f3000000-0000-4000-8000-000000000002';
const commentsPath = '/api/v1/operations/objects/PROJECTS/$projectKey/comments';
const actionPath = '/api/v1/operations/comments/$commentKey/actions';
Map<String, dynamic> noticeData(
        {int id = 7,
        bool read = false,
        String domain = 'PROJECTS',
        String recordId = projectKey}) =>
    {
      'id': id,
      'domain': domain,
      'record_id': recordId,
      'event_code': 'COMMENT_CREATED',
      'object_version': 2,
      'read': read,
      'created_at': '2026-10-03T08:00:00.000000Z'
    };
Map<String, dynamic> commentData(
        {String id = commentKey,
        String status = 'VISIBLE',
        String text = '请核对音乐的使用范围。',
        String author = accountId,
        String? replyTo,
        int version = 1,
        String domain = 'PROJECTS',
        String recordId = projectKey}) =>
    {
      'id': id,
      'domain': domain,
      'record_id': recordId,
      'author_account_id': author,
      'party_id': personId,
      'reply_to': replyTo,
      'body': status == 'VISIBLE' ? text : null,
      'current_status': status,
      'object_version': version,
      'created_at': '2026-10-03T08:00:00.000000Z'
    };
FakeAccountAdapter operationsAdapter(
    {FutureOr<ResponseBody?> Function(RequestOptions)? override,
    List<Map<String, dynamic>>? initial}) {
  late FakeAccountAdapter a;
  final prod = productionAdapter(), projects = projectsAdapter();
  final rows = initial ?? [commentData()];
  var read = false;
  a = FakeAccountAdapter(handler: (r) async {
    final special = await override?.call(r);
    if (special != null) return special;
    if (r.path == '/api/v1/operations/notifications') {
      return envelope({
        'items': r.queryParameters['unread_only'] == 'true' && read
            ? []
            : [noticeData(read: read)],
        'next_cursor': null
      });
    }
    if (r.path == '/api/v1/operations/notifications/7/read') {
      read = true;
      return envelope({'id': 7, 'read': true});
    }
    if (r.path == actionPath) {
      final old = rows.firstWhere((x) => x['id'] == commentKey);
      final changed = {
        ...old,
        'body': null,
        'current_status': 'WITHDRAWN',
        'object_version': old['object_version'] + 1
      };
      rows[rows.indexOf(old)] = changed;
      return envelope(changed);
    }
    if (r.path.startsWith('/api/v1/operations/objects/') &&
        r.path.endsWith('/comments')) {
      final domain = r.path.split('/')[5], target = r.path.split('/')[6];
      if (r.method == 'POST') {
        final next = commentData(
            id: secondCommentKey,
            domain: domain,
            recordId: target,
            text: r.data['body'],
            replyTo: r.data['reply_to']);
        if (!rows.any((x) => x['id'] == secondCommentKey)) rows.add(next);
        return envelope(rows.firstWhere((x) => x['id'] == secondCommentKey));
      }
      return envelope({
        'items': rows
            .where((x) => x['domain'] == domain && x['record_id'] == target)
            .toList(),
        'next_cursor': null
      });
    }
    if (r.path.startsWith('/api/v1/projects/')) return projects.handler!(r);
    if (r.path.startsWith('/api/v1/production/') ||
        r.path.startsWith('/api/v1/trade/')) {
      return prod.handler!(r);
    }
    if (r.path.startsWith('/api/v1/finance/records/')) {
      return envelope(financeData('AGREEMENT'));
    }
    if (r.path.startsWith('/api/v1/gigs/records/')) {
      return envelope(gigData('GIG'));
    }
    if (r.path.startsWith('/api/v1/licensing/records/')) {
      return envelope(licenseData('PRODUCT'));
    }
    if (r.path.startsWith('/api/v1/supply/records/')) {
      return envelope({...profileData(), 'owner_party_id': personId});
    }
    return a.defaultReply(r);
  });
  return a;
}
