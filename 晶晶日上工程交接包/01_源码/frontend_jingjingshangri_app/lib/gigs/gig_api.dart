import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../supply/supply_api.dart';
import '../supply/supply_models.dart';
import 'gig_models.dart';

class GigPage {
  const GigPage(this.items, this.cursor);
  final List<GigRecord> items;
  final String? cursor;
}

class GigApi {
  GigApi(this.session);
  final AccountSession session;
  String owner() {
    if (!session.isLoggedIn) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    if (session.gigsAccessDenied ||
        session.partyId == null ||
        !session.isOwner ||
        session.selected?['membership']?['current_status'] != 'ACTIVE' ||
        ['SUSPENDED', 'CLOSED'].contains(session.party?['current_status'])) {
      throw const AccountError(403, 'GIG_PARTY_FORBIDDEN');
    }
    return session.partyId!;
  }

  void check(int epoch, String? party) {
    if (epoch != session.epoch || (party != null && party != owner())) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
  }

  Future<GigCatalogue> catalogue() async {
    final epoch = session.epoch;
    final d = await session.read('/api/v1/gigs/catalogue');
    check(epoch, null);
    return GigCatalogue.parse(d);
  }

  Future<GigPage> page(String kind,
      {String? cursor, bool reviewer = false}) async {
    if (!gigKinds.containsKey(kind)) {
      throw const AccountError(400, 'INVALID_KIND');
    }
    final p = reviewer ? null : owner(), epoch = session.epoch;
    final d = gigMap(
        await session.read('/api/v1/gigs/records', actingParty: p, query: {
          'kind': kind,
          'limit': 20,
          if (cursor != null) 'cursor': cursor
        }),
        keys: ['items', 'next_cursor']);
    check(epoch, p);
    gigRequire(d['next_cursor'] == null ||
        gigId(d['next_cursor']) && d['next_cursor'] != cursor);
    final rows = gigList(d['items'])
        .map((v) => GigRecord.parse(v, party: p, kind: kind))
        .toList();
    gigRequire(rows.map((r) => r.id).toSet().length == rows.length);
    return GigPage(rows, d['next_cursor']);
  }

  Future<List<GigRecord>> all(String kind) async {
    final rows = <GigRecord>[], seen = <String>{};
    String? cursor;
    do {
      final pageResult = await page(kind, cursor: cursor);
      rows.addAll(pageResult.items);
      cursor = pageResult.cursor;
      if (cursor != null) gigRequire(seen.add(cursor));
    } while (cursor != null);
    return {for (final r in rows) r.id: r}.values.toList();
  }

  Future<GigRecord> record(String id, {bool reviewer = false}) async {
    if (!gigId(id)) throw const AccountError(400, 'INVALID_ID');
    final p = reviewer ? null : owner(), epoch = session.epoch;
    final d = await session.read('/api/v1/gigs/records/$id', actingParty: p);
    check(epoch, p);
    return GigRecord.parse(d, party: p, id: id);
  }

  Future<Map<String, String?>> relationNames(GigRecord r) async {
    gigRequire(r.kind == 'RELATION');
    final p = owner(), epoch = session.epoch;
    try {
      final d = gigMap(
          await session.read('/api/v1/gigs/relations/${r.id}/parties',
              actingParty: p),
          keys: ['record_id', 'source', 'parties']);
      check(epoch, p);
      gigRequire(
          d['record_id'] == r.id && d['source'] == 'CURRENT_DISPLAY_NAME');
      final rows = gigList(d['parties']);
      gigRequire(rows.length == 2);
      final names = <String, String?>{};
      for (final value in rows) {
        final row = gigMap(value, keys: ['party_id', 'display_name']);
        gigRequire([r.owner, r.counterparty].contains(row['party_id']) &&
            !names.containsKey(row['party_id']) &&
            (row['display_name'] == null || gigText(row['display_name'], 120)));
        names[row['party_id'] as String] = row['display_name'] as String?;
      }
      return names;
    } on AccountError catch (e) {
      check(epoch, p);
      if (e.status == 404 && e.code == 'NOT_FOUND') return {};
      rethrow;
    }
  }

  Map<String, dynamic>? pending(String path, {bool reviewer = false}) =>
      session.pending('POST', path, actingParty: reviewer ? null : owner());
  Future<GigRecord> write(String path, Map<String, dynamic> body,
      {int? version, String? kind, bool reviewer = false}) async {
    final p = reviewer ? null : owner(), epoch = session.epoch;
    final d = await session.write('POST', path,
        actingParty: p,
        body: body,
        version: version,
        validate: (v) => GigRecord.parse(v, party: p, kind: kind));
    check(epoch, p);
    return GigRecord.parse(d, party: p, kind: kind);
  }

  Future<GigRecord> retry(String path, {bool reviewer = false}) async {
    final op = pending(path, reviewer: reviewer);
    if (op == null) throw const AccountError(409, 'NO_PENDING_OPERATION');
    final parts = path.split('/');
    if (op['resultId'] != null) {
      await record(op['resultId'], reviewer: reviewer);
    } else if (parts.length == 7) {
      await record(parts[5], reviewer: reviewer);
    } else {
      const kinds = {
        'requests': 'GIG',
        'offers': 'OFFER',
        'relations': 'RELATION',
        'commissions': 'COMMISSION',
        'rules': 'RULE',
        'rankings': 'RANKING'
      };
      await page(kinds[parts.last]!, reviewer: reviewer);
    }
    return write(path, gigMap(op['body']),
        version: op['version'], reviewer: reviewer);
  }

  Future<GigRecord> accept(GigRecord r) {
    if (r.kind != 'OFFER' ||
        r.status != 'APPROVED' ||
        r.counterparty != owner()) {
      throw const AccountError(403, 'GIG_BUYER_REQUIRED');
    }
    return write(
        '/api/v1/gigs/offers/${r.id}/acceptance', {'offer_sha256': r.hash},
        version: r.version, kind: 'OFFER');
  }

  Future<GigRecord> relationDecision(
          GigRecord r, String decision, String reason) =>
      write('/api/v1/gigs/relations/${r.id}/decision',
          {'decision': decision, 'reason': reason},
          version: r.version, kind: 'RELATION');
  Future<GigRecord> createGig(Map<String, dynamic> body) =>
      write('/api/v1/gigs/requests', body, kind: 'GIG');
  Future<GigRecord> offer(Map<String, dynamic> body) =>
      write('/api/v1/gigs/offers', body, kind: 'OFFER');
  Future<GigRecord> relation(Map<String, dynamic> body) =>
      write('/api/v1/gigs/relations', body, kind: 'RELATION');
  Future<GigRecord> calculate(String orderId) =>
      write('/api/v1/gigs/commissions', {'order_id': orderId},
          kind: 'COMMISSION');
  // These independent operations never send X-Acting-Party. Backend GIG_REVIEW
  // and self-review restrictions remain authoritative; MCN is not this grant.
  Future<GigRecord> createRule(Map<String, dynamic> rule) =>
      write('/api/v1/gigs/rules', {'rule': rule}, reviewer: true, kind: 'RULE');
  Future<GigRecord> review(GigRecord r, String decision, String reason,
          Map<String, dynamic>? checks) =>
      write('/api/v1/gigs/records/${r.id}/reviews',
          {'decision': decision, 'reason': reason, 'checks': checks},
          version: r.version, reviewer: true, kind: r.kind);
  Future<GigRecord> retire(GigRecord r, String reason) =>
      write('/api/v1/gigs/rules/${r.id}/retirement', {'reason': reason},
          version: r.version, reviewer: true, kind: 'RULE');
  Future<GigRecord> suspend(GigRecord r, String reason) =>
      write('/api/v1/gigs/requests/${r.id}/suspension', {'reason': reason},
          version: r.version, reviewer: true, kind: 'GIG');
  Future<GigRecord> createRanking(String ruleId, String asOf) =>
      write('/api/v1/gigs/rankings', {'rule_id': ruleId, 'as_of': asOf},
          reviewer: true, kind: 'RANKING');
  Future<List<Map<String, dynamic>>> notifications() async {
    final p = owner(), epoch = session.epoch;
    final d = gigMap(
        await session.read('/api/v1/gigs/notifications', actingParty: p),
        keys: ['items']);
    check(epoch, p);
    return gigList(d['items']).map((v) {
      final r = gigMap(v, keys: ['id', 'record_id', 'event_code']);
      gigRequire(
          gigId(r['id']) && gigId(r['record_id']) && gigText(r['event_code']));
      return r;
    }).toList();
  }

  Future<Map<String, dynamic>> ranking(String id) async {
    if (!gigId(id)) throw const AccountError(400, 'INVALID_ID');
    final epoch = session.epoch;
    final d = await session.read('/api/v1/gigs/rankings/$id');
    check(epoch, null);
    return gigRanking(d, id: id);
  }

  Future<List<Map<String, dynamic>>> entries(String id) async {
    if (!gigId(id)) throw const AccountError(400, 'INVALID_ID');
    final p = owner(), epoch = session.epoch;
    final d = gigMap(
        await session.read('/api/v1/gigs/commissions/$id/entries',
            actingParty: p),
        keys: ['items']);
    check(epoch, p);
    return gigList(d['items'], max: 100000).map((v) {
      final r = gigMap(v, keys: ['id', 'object_version', 'data']);
      gigRequire(
          gigId(r['id']) && gigInt(r['object_version'], min: 1, max: 100000));
      final data = gigMap(r['data'], keys: ['delta', 'facts', 'amounts']);
      final delta = gigMap(data['delta'],
          keys: ['mcn_minor', 'platform_minor', 'supplier_minor']);
      gigRequire(
          delta.values.every((v) => v is int && v.abs() <= 900000000000));
      gigFacts(data['facts']);
      gigAmounts(data['amounts']);
      return r;
    }).toList();
  }

  Future<Uint8List> evidence(GigRecord r, String assetId) async {
    final p = owner(), epoch = session.epoch;
    final ids = r.kind == 'GIG'
        ? gigList(r.data['proofs'], max: 30).map((v) => v['asset_id']).toList()
        : gigIds(r.data['evidence_asset_ids']);
    if (!ids.contains(assetId)) {
      throw const AccountError(403, 'EVIDENCE_NOT_ATTACHED');
    }
    // Owner can additionally compare metadata locally. Other parties receive
    // bytes only via the record capability endpoint, which rechecks attachment,
    // permission, stored length and SHA-256 before and after storage access.
    final meta = r.owner == p ? await SupplyApi(session).asset(assetId) : null;
    final bytes = await session.readBytes(
        '/api/v1/gigs/records/${r.id}/evidence/$assetId',
        actingParty: p);
    check(epoch, p);
    if (bytes.isEmpty ||
        bytes.length > maxSupplyBytes ||
        meta != null &&
            (bytes.length != meta['byte_size'] ||
                sha256.convert(bytes).toString() != meta['content_sha256'])) {
      throw const AccountError(502, 'PRIVATE_CONTENT_MISMATCH');
    }
    return bytes;
  }

  Future<List<Map<String, dynamic>>> supplyChoices(String kind) async {
    if (!['AVATAR', 'CONSENT'].contains(kind)) {
      throw const AccountError(400, 'INVALID_KIND');
    }
    final p = owner(),
        epoch = session.epoch,
        rows = <Map<String, dynamic>>[],
        seen = <String>{};
    String? cursor;
    do {
      final d = gigMap(
          await session.read('/api/v1/supply/records', actingParty: p, query: {
            'kind': kind,
            'limit': 20,
            if (cursor != null) 'cursor': cursor
          }),
          keys: ['items', 'next_cursor']);
      check(epoch, p);
      for (final v in gigList(d['items'])) {
        final r = gigMap(v, keys: [
          'id',
          'kind',
          'stream_ref',
          'revision',
          'owner_party_id',
          'created_by',
          'current_status',
          'object_version',
          'data'
        ]);
        gigRequire(gigId(r['id']) &&
            gigText(r['stream_ref'], 128) &&
            gigId(r['created_by']) &&
            r['owner_party_id'] == p &&
            r['kind'] == kind &&
            gigInt(r['object_version'], min: 1, max: 100000) &&
            gigInt(r['revision'], min: 1, max: 100000));
        final data = gigMap(r['data']);
        if (kind == 'AVATAR') {
          gigMap(data, keys: [
            'display_name',
            'material_asset_ids',
            'provider_asset_ref'
          ]);
          gigRequire(gigText(data['display_name'], 120) &&
              data['provider_asset_ref'] == null &&
              r['current_status'] == 'RECORDED');
          gigIds(data['material_asset_ids'], min: 1, max: 100);
        } else {
          gigMap(data, keys: [
            'consent',
            'review',
            'withdrawal',
            'signing_method',
            'identity_verification'
          ]);
          gigRequire(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN']
                  .contains(r['current_status']) &&
              data['signing_method'] == 'IN_APP_DECLARATION' &&
              data['identity_verification'] == 'NOT_VERIFIED');
          final c = gigMap(data['consent'], keys: [
            'avatar_id',
            'subject_party_id',
            'features',
            'purposes',
            'territories',
            'valid_from',
            'valid_until',
            'terms',
            'evidence_asset_ids'
          ]);
          gigRequire(gigId(c['avatar_id']) &&
              gigId(c['subject_party_id']) &&
              gigInstant(c['valid_from']) &&
              gigInstant(c['valid_until']) &&
              c['valid_from'].compareTo(c['valid_until']) < 0 &&
              gigText(c['terms']));
          for (final key in ['features', 'purposes', 'territories']) {
            final a = gigList(c[key], min: 1);
            gigRequire(a.every((v) => gigText(v, 100)) &&
                a.toSet().length == a.length);
          }
          gigRequire(gigList(c['features'], min: 1, max: 2)
              .every((v) => ['FACE', 'VOICE'].contains(v)));
          gigIds(c['evidence_asset_ids'], min: 1, max: 100);
        }
        rows.add(r);
      }
      cursor = d['next_cursor'];
      if (cursor != null) gigRequire(gigId(cursor) && seen.add(cursor));
    } while (cursor != null);
    return rows;
  }
}
