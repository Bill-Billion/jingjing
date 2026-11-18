import 'dart:convert';
import '../account/account_session.dart';
import '../account/account_api.dart';
import '../stock/v5_support.dart';
import 'notices_models.dart';

class NoticesApi extends V5Api {
  NoticesApi(AccountSession s) : super(s, 'notices');
  // Bind this command's receipt to the exact sent body and If-Match version,
  // including retries dispatched from the generic recovery panel.
  @override
  Future<T> post<T>(String suffix, Map<String, dynamic> body,
      T Function(Map<String, dynamic>) parse, {int? version}) async {
    if (suffix == '/submissions') {
      final party = owner();
      final original = v5Map(jsonDecode(jsonEncode(body)));
      final sent = v5Map(original['submission']);
      return super.post(suffix, original, (value) {
        final record = NoticeRecord(value, party, kind: 'SUBMISSION');
        final received = v5Map(record.data['submission']);
        v5Require(record.raw['owner_party_id'] == party &&
            record.raw['counterparty_id'] == sent['target_party_id'] &&
            record.raw['parent_id'] == sent['notice_id'] &&
            record.version == 1 && record.status == 'IN_REVIEW' &&
            record.data['rule_id'] == original['rule_id'] &&
            v5Hash(record.data['rule_sha256']) &&
            record.data['review'] == null && record.data['decision'] == null &&
            record.data['case_id'] == null);
        // All actually supplied fields are preserved. Only the invitation
        // source may be filled in by the server when absent from the request.
        for (final entry in sent.entries) {
          v5Require(received.containsKey(entry.key) &&
              _sameReceiptValue(received[entry.key], entry.value));
        }
        v5Require(received.keys.every((key) => sent.containsKey(key) ||
            (key == 'source_listing_id' && sent['kind'] == 'INVITATION')));
        if (sent['kind'] == 'INVITATION') {
          v5Require(v5Id(received['source_listing_id']));
        }
        final snapshot = record.originalNoticeSnapshot;
        if (sent['notice_id'] == null) {
          v5Require(snapshot == null);
        } else {
          v5Require(snapshot != null);
        }
        if (original.containsKey('notice_version') ||
            original.containsKey('notice_sha256')) {
          v5Require(v5Int(original['notice_version'], min: 1) &&
              v5Hash(original['notice_sha256']) && snapshot != null &&
              snapshot!.raw['object_version'] == original['notice_version'] &&
              snapshot.raw['notice_sha256'] == original['notice_sha256']);
        }
        return parse(value);
      }, version: version);
    }
    final confirmation = RegExp(
        r'^/submissions/([0-9a-fA-F-]{36})/notice-confirmation$').firstMatch(suffix);
    if (confirmation == null) {
      final decision = RegExp(
          r'^/submissions/([0-9a-fA-F-]{36})/decision$').firstMatch(suffix);
      final close = RegExp(
          r'^/records/([0-9a-fA-F-]{36})/close$').firstMatch(suffix);
      final creation = suffix == '/announcements' || suffix == '/qualifications';
      if (!creation && decision == null && close == null) {
        return super.post(suffix, body, parse, version: version);
      }
      final party = owner();
      final original = v5Map(jsonDecode(jsonEncode(body)));
      final originalVersion = version;
      if (!creation) v5Require(originalVersion != null && originalVersion >= 1);
      return super.post(suffix, original, (value) {
        final record = NoticeRecord(value, party,
            id: decision?.group(1) ?? close?.group(1),
            kind: creation
                ? (suffix == '/announcements' ? 'NOTICE' : 'QUALIFICATION')
                : decision != null ? 'SUBMISSION' : null);
        if (creation) {
          v5Require(record.raw['owner_party_id'] == party &&
              record.raw['counterparty_id'] == null &&
              record.raw['parent_id'] == null &&
              record.version == 1 && record.status == 'IN_REVIEW');
          if (suffix == '/announcements') {
            v5Require(record.data['rule_id'] == original['rule_id'] &&
                _sameReceiptValue(record.data['notice'], original['notice']));
          } else {
            for (final key in ['types', 'valid_from', 'valid_until',
                'evidence_asset_ids', 'terms']) {
              v5Require(original.containsKey(key) &&
                  _sameReceiptValue(record.data[key], original[key]));
            }
          }
        } else {
          v5Require(record.version == originalVersion! + 1);
          if (decision != null) {
            final choice = original['decision'];
            v5Require(['INTERESTED', 'DECLINE'].contains(choice) &&
                record.raw['counterparty_id'] == party &&
                record.data['decision'] == choice &&
                record.status == (choice == 'INTERESTED' ? 'INTERESTED' : 'DECLINED') &&
                (choice == 'INTERESTED'
                    ? v5Id(record.data['case_id']) : record.data['case_id'] == null));
          } else {
            v5Require(record.raw['owner_party_id'] == party &&
                ['NOTICE', 'SUBMISSION', 'QUALIFICATION'].contains(record.kind) &&
                record.status == 'WITHDRAWN' && original['reason'] is String &&
                record.data['closed_reason'] == original['reason']);
          }
        }
        return parse(value);
      }, version: originalVersion);
    }
    final submissionVersion = version;
    final noticeVersion = body['notice_version'];
    final noticeSha256 = body['notice_sha256'];
    v5Require(submissionVersion != null && submissionVersion >= 1 &&
        noticeVersion is int && noticeVersion >= 1 &&
        noticeSha256 is String &&
        RegExp(r'^[a-f0-9]{64}$').hasMatch(noticeSha256));
    return super.post(suffix, body, (value) {
      validateConfirmation(value, confirmation.group(1)!,
          submissionVersion: submissionVersion,
          noticeVersion: noticeVersion, noticeSha256: noticeSha256);
      return parse(value);
    }, version: submissionVersion);
  }

  String? recoveryLabel(String path) {
    final suffix = path.startsWith(base) ? path.substring(base.length) : '';
    if (RegExp(r'^/submissions/[0-9a-fA-F-]{36}/notice-confirmation$').hasMatch(suffix)) {
      return '本人投稿新版确认';
    }
    if (RegExp(r'^/announcements/[0-9a-fA-F-]{36}/revisions$').hasMatch(suffix)) {
      return '已发布通告修改申请';
    }
    return switch (suffix) {
      '/announcements' => '通告发布',
      '/qualifications' => '机构资格',
      '/submissions' => '投稿',
      _ => RegExp(r'^/(records|submissions)/[0-9a-fA-F-]{36}/(close|decision)$')
              .hasMatch(suffix)
          ? '投稿回复或撤回'
          : null
    };
  }

  Future<Map<String, dynamic>> restoreOperation(String path) async {
    if (recoveryLabel(path) == null) {
      throw const AccountError(400, 'INVALID_ACTION');
    }
    final suffix = path.substring(base.length),
        p = owner(),
        parts = path.substring(base.length).split('/');
    if (parts.length == 4 && parts[1] == 'announcements' &&
        parts[3] == 'revisions') {
      final op = pending(suffix);
      if (op == null) throw const AccountError(409, 'NO_PENDING_OPERATION');
      return (await retry(suffix, (d) => NoticeRevisionResponse(d, parts[2], p,
          version: op['version'], body: v5Map(op['body'])), reread: () async {
        final source = await record(parts[2]);
        v5Require(source.kind == 'NOTICE' && source.id == parts[2] &&
            source.raw['owner_party_id'] == p && source.raw['parent_id'] == null);
      })).raw;
    }
    if (parts.length == 4 && parts[1] == 'submissions' &&
        parts[3] == 'notice-confirmation') {
      final op = pending(suffix);
      if (op == null) throw const AccountError(409, 'NO_PENDING_OPERATION');
      final original = v5Map(op['body']);
      return (await retry(suffix, (d) => validateConfirmation(d, parts[2],
          submissionVersion: op['version'],
          noticeVersion: original['notice_version'],
          noticeSha256: original['notice_sha256']), reread: () async {
        final source = await record(parts[2]);
        v5Require(source.kind == 'SUBMISSION' && source.raw['owner_party_id'] == p &&
            v5Id(source.data['submission']['notice_id']) &&
            source.raw['parent_id'] == source.data['submission']['notice_id']);
      })).raw;
    }
    return (await retry(suffix, (d) => NoticeRecord(d, p), reread: () async {
      if (parts.length == 4) {
        await record(parts[2]);
      } else {
        await records(suffix == '/announcements'
            ? 'NOTICE'
            : suffix == '/qualifications'
                ? 'QUALIFICATION'
                : 'SUBMISSION');
      }
    }))
        .raw;
  }

  Future<V5Page<NoticePublic>> catalog(
          {String? cursor,
          String? type,
          String? city,
          String? at,
          String? publisherPartyId}) =>
      get('/catalog',
          (d) => V5Page.parse(d, NoticePublic.new, previous: cursor),
          account: true,
          query: {
            'limit': 20,
            if (cursor != null) 'cursor': cursor,
            if (type != null) 'type': type,
            if (publisherPartyId != null)
              'publisher_party_id': key(publisherPartyId),
            if (city?.isNotEmpty == true) 'city': city,
            if (at?.isNotEmpty == true) 'at': v5InputDate(at)
          });
  Future<NoticePublic> publicNotice(String id) =>
      get('/catalog/${key(id)}', (d) => NoticePublic(d, id: id), account: true);
  Future<V5Page<NoticeRule>> rules({String? cursor}) =>
      get('/rules', (d) => V5Page.parse(d, NoticeRule.new, previous: cursor),
          account: true,
          query: {'limit': 20, if (cursor != null) 'cursor': cursor});
  Future<NoticeEligibility> eligibility(String rule) =>
      get('/eligibility', (d) => NoticeEligibility(d, rule),
          query: {'rule_id': key(rule)});
  Future<V5Page<NoticeRecord>> records(String kind, {String? cursor}) {
    final p = owner();
    return get(
        '/records',
        (d) => V5Page.parse(d, (r) => NoticeRecord(r, p, kind: kind),
            previous: cursor),
        query: {
          'kind': kind,
          'limit': 20,
          if (cursor != null) 'cursor': cursor
        });
  }

  Future<NoticeRecord> record(String id) {
    final p = owner();
    return get('/records/${key(id)}', (d) => NoticeRecord(d, p, id: id));
  }

  NoticeRecord validateConfirmation(dynamic value, String id,
      {required int? submissionVersion,
      required int noticeVersion, required String noticeSha256}) {
    final party = owner();
    final record = NoticeRecord(value, party, id: id, kind: 'SUBMISSION');
    v5Require(submissionVersion != null && submissionVersion >= 1);
    v5Require(record.raw['owner_party_id'] == party &&
        record.version == submissionVersion! + 1);
    final ack = record.acknowledgedNoticeSnapshot;
    v5Require(ack != null &&
        ack!.raw['object_version'] == noticeVersion &&
        ack.raw['notice_sha256'] == noticeSha256);
    return record;
  }

  Future<NoticeHistoryPage> history(String noticeId,
      {required NoticeRecord source, String? cursor}) {
    final party = owner();
    key(noticeId);
    v5Require(source.raw['owner_party_id'] == party);
    final publisher = source.kind == 'NOTICE';
    v5Require(publisher
        ? source.id == noticeId
        : source.kind == 'SUBMISSION' &&
            source.raw['parent_id'] == noticeId &&
            source.data['submission']['notice_id'] == noticeId);
    return get('/announcements/$noticeId/history',
        (d) => NoticeHistoryPage(d, noticeId,
            publisher: publisher, party: party, previous: cursor),
        query: {'limit': 20, if (cursor != null) 'cursor': key(cursor)});
  }

  Future<Map<String, dynamic>> invitationContext(String listing, String rule) =>
      get('/invitation-context', (d) {
        for (final k in [
          'rule_id',
          'listing_id',
          'person_id',
          'avatar_id',
          'consent_id',
          'target_party_id'
        ]) {
          key('${d[k]}');
        }
        v5Require(d['listing_id'] == listing &&
            d['rule_id'] == rule &&
            d['display_name'] is String);
        return d;
      }, query: {'listing_id': key(listing), 'rule_id': key(rule)});

  Future<List<Map<String, dynamic>>> submissionOptions(
      String person, String notice) async {
    final rows = <Map<String, dynamic>>[], seen = <String>{};
    String? cursor;
    do {
      final page = await get('/submission-options', (d) => d, query: {
        'person_id': key(person),
        'notice_id': key(notice),
        'limit': 50,
        if (cursor != null) 'cursor': cursor
      });
      v5Require(page['notice_id'] == notice && page['items'] is List);
      for (final value in page['items']) {
        final row = v5Map(value);
        for (final k in [
          'person_id',
          'avatar_id',
          'consent_id',
          'target_party_id'
        ]) {
          key('${row[k]}');
        }
        v5Require(row['person_id'] == person &&
            row['valid_from'] is String &&
            row['valid_until'] is String);
        rows.add(row);
      }
      cursor = page['next_cursor'];
      if (cursor != null) v5Require(seen.add(key(cursor)));
    } while (cursor != null);
    return rows;
  }

  void validateRecord(Map<String, dynamic> d) => NoticeRecord(d, owner());
}

// Compare JSON request/receipt content without relying on map key order.
bool _sameReceiptValue(dynamic left, dynamic right) {
  if (left is Map && right is Map) {
    return left.length == right.length && left.keys.every((key) =>
        right.containsKey(key) && _sameReceiptValue(left[key], right[key]));
  }
  if (left is List && right is List) {
    return left.length == right.length &&
        List.generate(left.length, (index) => index).every(
            (index) => _sameReceiptValue(left[index], right[index]));
  }
  return left == right;
}
