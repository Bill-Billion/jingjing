import 'dart:typed_data';
import '../account/account_api.dart';
import '../account/account_session.dart';
import 'finance_models.dart';

class FinancePage {
  FinancePage(this.items, this.cursor);
  final List<FinanceRecord> items;
  final String? cursor;
}

class FinanceApi {
  FinanceApi(this.session);
  final AccountSession session;
  Future<Map<String, dynamic>> notifications({String? cursor}) async {
    final p = owner(), epoch = session.epoch;
    final d = financeMap(
        await session.read('/api/v1/finance/notifications',
            actingParty: p,
            query: {'limit': 30, if (cursor != null) 'cursor': cursor}),
        required: ['items', 'next_cursor']);
    check(epoch, p);
    for (final row in financeList(d['items'])) {
      final x = financeMap(row,
          required: ['id', 'agreement_id', 'record_id', 'event_code']);
      financeRequire(x['id'] is String &&
          RegExp(r'^[1-9][0-9]*$').hasMatch(x['id']) &&
          financeId(x['agreement_id']) &&
          financeId(x['record_id']) &&
          financeText(x['event_code'], 128));
    }
    financeRequire(d['next_cursor'] == null ||
        d['next_cursor'] is String &&
            RegExp(r'^[1-9][0-9]*$').hasMatch(d['next_cursor']) &&
            d['next_cursor'] != cursor);
    return d;
  }

  String owner() {
    if (!session.isLoggedIn) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    if (session.financeAccessDenied ||
        session.partyId == null ||
        !session.isOwner ||
        session.selected?['membership']?['current_status'] != 'ACTIVE' ||
        ['CLOSED', 'SUSPENDED'].contains(session.party?['current_status'])) {
      throw const AccountError(403, 'FINANCE_PARTY_FORBIDDEN');
    }
    return session.partyId!;
  }

  void check(int epoch, String party) {
    if (epoch != session.epoch || party != owner()) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
  }

  Future<FinanceRecord> record(String id, {String? kind}) async {
    if (!financeId(id)) throw const AccountError(400, 'INVALID_ID');
    final p = owner(), epoch = session.epoch;
    final d = await session.read('/api/v1/finance/records/$id', actingParty: p);
    check(epoch, p);
    return FinanceRecord.parse(d, id: id, kind: kind, party: p);
  }

  Future<FinancePage> page(
      {String? agreementId, String? kind, String? cursor}) async {
    if (agreementId != null &&
        (!financeId(agreementId) ||
            !financeKinds.containsKey(kind) ||
            kind == 'AGREEMENT')) {
      throw const AccountError(400, 'INVALID_LIST');
    }
    final p = owner(), epoch = session.epoch;
    final d = financeMap(
        await session.read(
            agreementId == null
                ? '/api/v1/finance/agreements'
                : '/api/v1/finance/agreements/$agreementId/records',
            actingParty: p,
            query: {
              'limit': 20,
              if (agreementId != null) 'kind': kind,
              if (cursor != null) 'cursor': cursor
            }),
        required: ['items', 'next_cursor']);
    check(epoch, p);
    financeRequire(d['next_cursor'] == null ||
        financeId(d['next_cursor']) && d['next_cursor'] != cursor);
    final rows = financeList(d['items'])
        .map((r) => FinanceRecord.parse(r,
            kind: agreementId == null ? 'AGREEMENT' : kind,
            agreementId: agreementId,
            party: p))
        .toList();
    financeRequire(rows.map((r) => r.id).toSet().length == rows.length);
    return FinancePage(rows, d['next_cursor']);
  }

  Future<List<FinanceRecord>> all(String agreementId, String kind) async {
    final rows = <FinanceRecord>[], seen = <String>{};
    String? cursor;
    do {
      final d =
          await page(agreementId: agreementId, kind: kind, cursor: cursor);
      rows.addAll(d.items);
      cursor = d.cursor;
      if (cursor != null) financeRequire(seen.add(cursor));
    } while (cursor != null);
    return {for (final r in rows) r.id: r}.values.toList();
  }

  Future<List<Map<String, dynamic>>> confirmations(FinanceRecord r) async {
    final p = owner(), epoch = session.epoch;
    final d = financeMap(
        await session.read('/api/v1/finance/records/${r.id}/confirmations',
            actingParty: p),
        required: ['items']);
    check(epoch, p);
    final rows = <Map<String, dynamic>>[];
    for (final row in financeList(d['items'])) {
      final c = financeMap(row,
          required: ['party_id', 'decision', 'content_sha256', 'reason']);
      financeRequire(financeId(c['party_id']) &&
          ['APPROVED', 'REJECTED'].contains(c['decision']) &&
          financeHash(c['content_sha256']) &&
          financeText(c['reason'], 2000));
      rows.add(c);
    }
    financeRequire(
        rows.map((c) => c['party_id']).toSet().length == rows.length);
    return rows;
  }

  Future<Map<String, dynamic>> balances(FinanceRecord g) async {
    final p = owner(), epoch = session.epoch;
    final d = financeMap(
        await session.read('/api/v1/finance/agreements/${g.id}/balances',
            actingParty: p),
        required: [
          'agreement_id',
          'currency',
          'environment',
          'customer_payment_separate',
          'received_minor',
          'receivable_minor',
          'items'
        ]);
    check(epoch, p);
    financeRequire(d['agreement_id'] == g.id &&
        d['currency'] == 'CNY' &&
        d['environment'] == g.data['environment'] &&
        d['customer_payment_separate'] == true &&
        financeMoney(d['received_minor']) &&
        financeMoney(d['receivable_minor'], signed: true));
    final rows = financeBalanceRows(d['items'], current: true);
    if (p != g.owner) financeRequire(rows.every((r) => r['party_id'] == p));
    return {...d, 'items': rows};
  }

  Future<Map<String, dynamic>> readiness(FinanceRecord g) async {
    final p = owner(), epoch = session.epoch;
    final d = financeMap(
        await session.read('/api/v1/finance/agreements/${g.id}/readiness',
            actingParty: p),
        required: ['environment', 'automatic_payout', 'manual_payment']);
    check(epoch, p);
    final auto = financeMap(d['automatic_payout'],
        required: ['current_status', 'reason_code']);
    final manual = financeMap(d['manual_payment'],
        required: ['current_status', 'meaning']);
    financeRequire(d['environment'] == g.data['environment'] &&
        auto['current_status'] == 'NOT_IMPLEMENTED' &&
        auto['reason_code'] == 'PAYOUT_PROVIDER_NOT_VERIFIED' &&
        manual['current_status'] == 'IMPLEMENTED' &&
        financeText(manual['meaning']));
    return d;
  }

  Future<Map<String, dynamic>> entries(FinanceRecord g,
      {String? cursor}) async {
    final p = owner(), epoch = session.epoch;
    final d = financeMap(
        await session.read('/api/v1/finance/agreements/${g.id}/entries',
            actingParty: p,
            query: {'limit': 50, if (cursor != null) 'cursor': cursor}),
        required: ['items', 'next_cursor']);
    check(epoch, p);
    final rows = <Map<String, dynamic>>[];
    for (final row in financeList(d['items'])) {
      final e = financeMap(row, required: [
        'id',
        'party_id',
        'category',
        'amount_minor',
        'source_id',
        'data'
      ]);
      financeRequire(e['id'] is String &&
          RegExp(r'^[1-9][0-9]*$').hasMatch(e['id']) &&
          financeId(e['party_id']) &&
          financeMoney(e['amount_minor'], signed: true) &&
          financeId(e['source_id']) &&
          ['ACCRUAL', 'ADJUSTMENT', 'PAYOUT', 'PAYOUT_RETURN']
              .contains(e['category']));
      if (p != g.owner) financeRequire(e['party_id'] == p);
      final x = financeMap(e['data']);
      if (e['category'] == 'ACCRUAL') {
        financeMap(x,
            required: ['facts_sha256', 'source_references', 'target_minor']);
        financeRequire(financeHash(x['facts_sha256']) &&
            financeMoney(x['target_minor'], signed: true));
        financeReferences(x['source_references']);
      } else if (e['category'] == 'ADJUSTMENT') {
        financeMap(x, required: ['reason', 'evidence_asset_id']);
        financeRequire(financeText(x['reason'], 4000) &&
            financeId(x['evidence_asset_id']));
      } else {
        financeMap(x, required: [
          'payout_id',
          'external_reference',
          'evidence_asset_id',
          'method'
        ]);
        financeRequire(financeId(x['payout_id']) &&
            financeText(x['external_reference'], 128) &&
            financeId(x['evidence_asset_id']) &&
            x['method'] == 'EXTERNAL_MANUAL_PAYMENT');
      }
      rows.add(e);
    }
    financeRequire(d['next_cursor'] == null ||
        d['next_cursor'] is String &&
            RegExp(r'^[1-9][0-9]*$').hasMatch(d['next_cursor']) &&
            d['next_cursor'] != cursor);
    return {...d, 'items': rows};
  }

  Map<String, dynamic>? pending(String path) =>
      session.pending('POST', path, actingParty: owner());
  Future<FinanceRecord> write(String path, Map<String, dynamic> body,
      {required int version, required String kind}) async {
    final p = owner(), epoch = session.epoch;
    final d = await session.write('POST', path,
        actingParty: p, body: body, version: version, validate: (raw) async {
      final r = FinanceRecord.parse(raw, kind: kind, party: p),
          target = path.split('/')[5];
      check(epoch, p);
      if (path.endsWith('/confirmations') || path.endsWith('/cancellation')) {
        financeRequire(r.id == target);
        if (path.endsWith('/cancellation')) {
          financeRequire(r.data['cancel_reason'] == body['reason']);
        }
      } else if (path.endsWith('/payouts')) {
        financeRequire(r.agreementId == target &&
            r.data['recipient_party_id'] == body['recipient_party_id'] &&
            r.data['amount_minor'] == body['amount_minor'] &&
            r.data['destination_asset_id'] == body['destination_asset_id'] &&
            r.data['note'] == body['note']);
      } else if (path.endsWith('/disputes')) {
        financeRequire(r.owner == p &&
            r.data['about_record_id'] == target &&
            r.data['category'] == body['category'] &&
            r.data['reason'] == body['reason'] &&
            financeDigest(r.data['evidence_asset_ids']) ==
                financeDigest(body['evidence_asset_ids']));
      } else if (path.endsWith('/responses')) {
        financeRequire(r.owner == p &&
            r.data['dispute_id'] == target &&
            r.data['message'] == body['message'] &&
            financeDigest(r.data['evidence_asset_ids']) ==
                financeDigest(body['evidence_asset_ids']));
      }
      if (path.endsWith('/confirmations')) {
        final rows = await confirmations(r);
        check(epoch, p);
        if (!rows.any((c) =>
            c['party_id'] == p &&
            c['content_sha256'] == body['content_sha256'] &&
            c['decision'] == body['decision'] &&
            c['reason'] == body['reason'])) {
          throw const AccountError(503, 'CONFIRMATION_RESULT_UNKNOWN',
              uncertain: true);
        }
      }
    });
    check(epoch, p);
    return FinanceRecord.parse(d, kind: kind, party: p);
  }

  Future<FinanceRecord> confirm(
      FinanceRecord r, String decision, String reason) {
    if (!['AGREEMENT', 'SETTLEMENT'].contains(r.kind) ||
        r.status != 'APPROVED' ||
        !['APPROVED', 'REJECTED'].contains(decision)) {
      throw const AccountError(409, 'FINANCE_VERSION_NOT_CONFIRMABLE');
    }
    return write('/api/v1/finance/records/${r.id}/confirmations',
        {'content_sha256': r.hash, 'decision': decision, 'reason': reason},
        version: r.version, kind: r.kind);
  }

  Future<FinanceRecord> retry(String path) async {
    final op = pending(path);
    if (op == null) throw const AccountError(409, 'NO_PENDING_OPERATION');
    final target = await record(path.split('/')[5]);
    if (op['resultId'] != null && op['resultId'] != target.id) {
      await record(op['resultId']);
    }
    if (path.endsWith('/confirmations')) {
      await confirmations(target);
    } else {
      await all(
          target.agreementId ?? target.id,
          path.endsWith('/payouts') || path.endsWith('/cancellation')
              ? 'PAYOUT'
              : path.endsWith('/responses')
                  ? 'RESPONSE'
                  : 'DISPUTE');
    }
    return write(path, financeMap(op['body']),
        version: op['version'],
        kind: path.endsWith('/confirmations') || path.endsWith('/cancellation')
            ? target.kind
            : path.endsWith('/payouts')
                ? 'PAYOUT'
                : path.endsWith('/responses')
                    ? 'RESPONSE'
                    : 'DISPUTE');
  }

  Future<Uint8List> evidence(FinanceRecord r, String id) async {
    final p = owner(), epoch = session.epoch;
    final fresh = await record(r.id);
    financeRequire([
      fresh.data['evidence_asset_id'],
      fresh.data['destination_asset_id'],
      ...(fresh.data['evidence_asset_ids'] as List? ?? [])
    ].contains(id));
    // The protected endpoint validates stored bytes/hash and current permission
    // before and after retrieval. Asset metadata may belong to the payer and
    // is deliberately not exposed to the recipient through supply APIs.
    final bytes = await session.readBytes(
        '/api/v1/finance/records/${r.id}/evidence/$id',
        actingParty: p);
    check(epoch, p);
    return bytes;
  }
}
