import '../account/account_api.dart';
import '../account/account_session.dart';
import '../finance/finance_api.dart';
import '../gigs/gig_api.dart';
import '../licensing/license_api.dart';
import '../production/production_api.dart';
import '../projects/project_api.dart';
import '../supply/supply_api.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_api.dart';
import 'operation_models.dart';

class OperationApi {
  OperationApi(this.session);
  final AccountSession session;
  String party() {
    if (!session.isLoggedIn) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    if (session.operationsAccessDenied ||
        session.partyId == null ||
        session.selected?['membership']?['current_status'] != 'ACTIVE' ||
        ['CLOSED', 'SUSPENDED'].contains(session.party?['current_status'])) {
      throw const AccountError(403, 'PARTY_ACTION_FORBIDDEN');
    }
    return session.partyId!;
  }

  void check(int epoch, String p) {
    if (epoch != session.epoch || p != party()) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
  }

  Future<OperationSource> source(String domain, String id) async {
    if (!operationDomains.containsKey(domain) || !operationId(id)) {
      throw const AccountError(400, 'INVALID_BUSINESS_OBJECT');
    }
    final p = party(), epoch = session.epoch;
    late OperationSource result;
    switch (domain) {
      case 'TRADE':
        final r = await TradeApi(session).record(id);
        result = OperationSource(
            domain: domain,
            id: id,
            kind: r.kind,
            title:
                '${r.kind == 'ORDER' ? '订单' : '交易记录'} · ${shortSupplyId(id)}',
            route: '/trade/record?recordId=$id');
      case 'PRODUCTION':
        final api = ProductionApi(session), r = await api.record(id);
        if (r.kind != 'PROJECT') {
          await api.record(r.projectId!, kind: 'PROJECT');
        }
        result = OperationSource(
            domain: domain,
            id: id,
            kind: r.kind,
            title:
                '${r.kind == 'VERSION' ? '制作版本' : '制作记录'} · ${shortSupplyId(id)}',
            route: r.kind == 'VERSION'
                ? '/production/version?versionId=$id'
                : r.kind == 'FEEDBACK'
                    ? '/production/version?versionId=${r.data['version_id']}'
                    : '/production/project?projectId=${r.projectId ?? id}');
      case 'PROJECTS':
        final r = await ProjectsApi(session).record(id);
        result = OperationSource(
            domain: domain,
            id: id,
            kind: r.kind,
            title: r.kind == 'PROJECT'
                ? r.data['title']
                : '项目记录 · ${shortSupplyId(id)}',
            route: r.kind == 'ROLE'
                ? '/projects/role?roleId=$id'
                : '/projects/record?recordId=$id');
      case 'FINANCE':
        final r = await FinanceApi(session).record(id);
        result = OperationSource(
            domain: domain,
            id: id,
            kind: r.kind,
            title: '结算记录 · ${shortSupplyId(id)}',
            route: '/finance/record?recordId=$id');
      case 'SUPPLY':
        final r = await SupplyApi(session).record(id);
        result = OperationSource(
            domain: domain,
            id: id,
            kind: r['kind'],
            title: '供给记录 · ${shortSupplyId(id)}',
            route: '/supply/record?recordId=$id');
      case 'LICENSE':
        final r = await LicenseApi(session).record(id);
        result = OperationSource(
            domain: domain,
            id: id,
            kind: r.kind,
            title: '许可记录 · ${shortSupplyId(id)}',
            route: '/licensing/record?recordId=$id');
      case 'GIGS':
        final r = await GigApi(session).record(id);
        result = OperationSource(
            domain: domain,
            id: id,
            kind: r.kind,
            title: '商单记录 · ${shortSupplyId(id)}',
            route: '/gigs/record?recordId=$id');
    }
    check(epoch, p);
    return result;
  }

  Future<({List<OperationNotice> items, int? cursor})> notices(
      {bool unread = false, int? cursor}) async {
    final p = party(), epoch = session.epoch;
    final d = operationMap(
        await session
            .read('/api/v1/operations/notifications', actingParty: p, query: {
          'limit': 30,
          'unread_only': unread.toString(),
          if (cursor != null) 'cursor': cursor
        }),
        ['items', 'next_cursor']);
    check(epoch, p);
    operationRequire(d['next_cursor'] == null ||
        operationNumber(d['next_cursor']) &&
            (cursor == null || d['next_cursor'] < cursor));
    final rows = operationList(d['items']).map(OperationNotice.parse).toList();
    operationRequire(rows.map((x) => x.id).toSet().length == rows.length &&
        rows.every((x) => cursor == null || x.id < cursor));
    return (items: rows, cursor: d['next_cursor'] as int?);
  }

  Future<OperationNotice?> notice(int id) async {
    if (!operationNumber(id)) throw const AccountError(400, 'INVALID_EVENT');
    int? cursor;
    do {
      final d = await notices(cursor: cursor);
      for (final n in d.items) {
        if (n.id == id) return n;
      }
      cursor = d.cursor;
    } while (cursor != null);
    return null;
  }

  Future<Map<String, dynamic>> markRead(int id) async {
    if (!operationNumber(id)) throw const AccountError(400, 'INVALID_EVENT');
    final p = party(), epoch = session.epoch;
    final d = await session.write(
        'POST', '/api/v1/operations/notifications/$id/read',
        actingParty: p, body: {}, validate: (v) {
      final x = operationMap(v, ['id', 'read']);
      operationRequire(x['id'] == id && x['read'] == true);
    });
    check(epoch, p);
    return d;
  }

  Future<({List<ObjectComment> items, String? cursor})> comments(
      String domain, String id,
      {String? cursor}) async {
    if (!operationDomains.containsKey(domain) || !operationId(id)) {
      throw const AccountError(400, 'INVALID_BUSINESS_OBJECT');
    }
    final p = party(), epoch = session.epoch;
    final d = operationMap(
        await session.read('/api/v1/operations/objects/$domain/$id/comments',
            actingParty: p,
            query: {'limit': 30, if (cursor != null) 'cursor': cursor}),
        ['items', 'next_cursor']);
    check(epoch, p);
    operationRequire(d['next_cursor'] == null ||
        operationId(d['next_cursor']) &&
            (cursor == null || d['next_cursor'].compareTo(cursor) > 0));
    final rows = operationList(d['items'])
        .map((x) => ObjectComment.parse(x, domain: domain, recordId: id))
        .toList();
    operationRequire(rows.map((x) => x.id).toSet().length == rows.length);
    return (items: rows, cursor: d['next_cursor'] as String?);
  }

  Future<List<ObjectComment>> allComments(String domain, String id) async {
    final rows = <ObjectComment>[];
    String? cursor;
    do {
      final d = await comments(domain, id, cursor: cursor);
      rows.addAll(d.items);
      cursor = d.cursor;
    } while (cursor != null);
    return {for (final r in rows) r.id: r}.values.toList();
  }

  Future<ObjectComment> add(String domain, String id, String body,
      {String? replyTo}) async {
    if (!operationText(body, 4000) ||
        replyTo != null && !operationId(replyTo)) {
      throw const AccountError(400, 'INVALID_COMMENT');
    }
    return writeComment('/api/v1/operations/objects/$domain/$id/comments',
        domain, id, {'body': body, 'reply_to': replyTo});
  }

  Future<ObjectComment> withdraw(ObjectComment c, String reason) {
    if (c.status != 'VISIBLE' ||
        c.author != session.account?['id'] ||
        c.party != party() ||
        !operationText(reason, 1000)) {
      throw const AccountError(403, 'COMMENT_AUTHOR_REQUIRED');
    }
    return writeComment('/api/v1/operations/comments/${c.id}/actions', c.domain,
        c.recordId, {'action': 'WITHDRAW', 'reason': reason},
        version: c.version);
  }

  Future<ObjectComment> writeComment(
      String path, String domain, String id, Map<String, dynamic> body,
      {int? version}) async {
    final p = party(), epoch = session.epoch;
    final target = await source(domain, id);
    if (!target.canComment) {
      throw const AccountError(400, 'COMMENT_TARGET_NOT_SUPPORTED');
    }
    check(epoch, p);
    final saved = session.operationsTargets[path];
    if (session.pending('POST', path, actingParty: p) != null &&
        saved != null &&
        (saved['domain'] != domain || saved['recordId'] != id)) {
      throw const AccountError(409, 'PENDING_OPERATION_CHANGED');
    }
    session.operationsTargets[path] = {'domain': domain, 'recordId': id};
    try {
      final d = await session.write('POST', path,
          actingParty: p, body: body, version: version, validate: (v) {
        final c = ObjectComment.parse(v, domain: domain, recordId: id);
        operationRequire(c.author == session.account?['id'] && c.party == p);
        if (path.endsWith('/actions')) {
          operationRequire(c.id == path.split('/')[5] &&
              ['WITHDRAWN', 'HIDDEN'].contains(c.status) &&
              c.version > version!);
        } else {
          operationRequire(c.replyTo == body['reply_to'] &&
              (c.status != 'VISIBLE' || c.body == body['body']));
        }
      });
      check(epoch, p);
      return ObjectComment.parse(d, domain: domain, recordId: id);
    } finally {
      if (epoch == session.epoch &&
          session.pending('POST', path, actingParty: p) == null) {
        session.operationsTargets.remove(path);
      }
    }
  }

  Future<void> retry(String path) async {
    final p = party(), op = session.pending('POST', path, actingParty: p);
    if (op == null) throw const AccountError(409, 'NO_PENDING_OPERATION');
    if (path.contains('/notifications/')) {
      await notice(int.parse(path.split('/')[5]));
      await markRead(int.parse(path.split('/')[5]));
      return;
    }
    final context = session.operationsTargets[path];
    if (context == null) {
      throw const AccountError(409, 'RECOVERY_CONTEXT_REQUIRED');
    }
    await source(context['domain']!, context['recordId']!);
    await allComments(context['domain']!, context['recordId']!);
    await writeComment(path, context['domain']!, context['recordId']!,
        Map<String, dynamic>.from(op['body']),
        version: op['version']);
  }
}
