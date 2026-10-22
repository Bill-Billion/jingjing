import '../account/account_session.dart';
import '../account/account_api.dart';
import '../stock/v5_support.dart';
import 'notices_models.dart';

class NoticesApi extends V5Api {
  NoticesApi(AccountSession s) : super(s, 'notices');
  String? recoveryLabel(String path) {
    final suffix = path.startsWith(base) ? path.substring(base.length) : '';
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
          {String? cursor, String? type, String? city, String? at}) =>
      get('/catalog',
          (d) => V5Page.parse(d, NoticePublic.new, previous: cursor),
          account: true,
          query: {
            'limit': 20,
            if (cursor != null) 'cursor': cursor,
            if (type != null) 'type': type,
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

  void validateRecord(Map<String, dynamic> d) => NoticeRecord(d, owner());
}
