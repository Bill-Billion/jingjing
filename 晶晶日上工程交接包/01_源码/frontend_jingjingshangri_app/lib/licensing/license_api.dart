import 'dart:convert';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../supply/supply_models.dart';
import 'license_models.dart';

class LicensePage {
  const LicensePage(this.items, this.nextCursor);
  final List<LicenseRecord> items;
  final String? nextCursor;
}

class LicenseApi {
  LicenseApi(this.session);
  final AccountSession session;
  String owner() {
    if (!session.isLoggedIn) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    if (session.partyId == null ||
        !session.isOwner ||
        session.selected?['membership']?['current_status'] != 'ACTIVE' ||
        session.licensingAccessDenied ||
        ['SUSPENDED', 'CLOSED'].contains(session.party?['current_status'])) {
      throw const AccountError(403, 'LICENSE_PARTY_FORBIDDEN');
    }
    return session.partyId!;
  }

  void check(int epoch, String party) {
    if (epoch != session.epoch || party != owner()) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
  }

  Future<LicensePage> page(String kind,
      {bool catalog = false, String? cursor}) async {
    final party = owner(), epoch = session.epoch;
    final raw = await session
        .read('/api/v1/licensing/records', actingParty: party, query: {
      'kind': kind,
      'limit': 20,
      if (catalog) 'catalog': 'true',
      if (cursor != null) 'cursor': cursor
    });
    check(epoch, party);
    licenseRequire(raw.length == 2 &&
        raw['items'] is List &&
        (raw['items'] as List).length <= 100 &&
        (raw['next_cursor'] == null || supplyId(raw['next_cursor'])) &&
        (raw['next_cursor'] == null || raw['next_cursor'] != cursor));
    final items = (raw['items'] as List)
        .map((v) => LicenseRecord.parse(v, party, kind: kind, catalog: catalog))
        .toList();
    licenseRequire(items.map((v) => v.id).toSet().length == items.length);
    return LicensePage(items, raw['next_cursor']);
  }

  Future<List<LicenseRecord>> all(String kind) async {
    final result = <LicenseRecord>[], seen = <String>{};
    String? cursor;
    do {
      final data = await page(kind, cursor: cursor);
      result.addAll(data.items);
      cursor = data.nextCursor;
      if (cursor != null) licenseRequire(seen.add(cursor));
    } while (cursor != null);
    return {for (final record in result) record.id: record}.values.toList();
  }

  Future<LicenseRecord> record(String id) async {
    if (!supplyId(id)) throw const AccountError(400, 'INVALID_ID');
    final party = owner(), epoch = session.epoch;
    final raw =
        await session.read('/api/v1/licensing/records/$id', actingParty: party);
    check(epoch, party);
    return LicenseRecord.parse(raw, party, id: id);
  }

  Map<String, dynamic>? pending(String path) =>
      session.pending('POST', path, actingParty: owner());
  Future<LicenseRecord> write(String path, Map<String, dynamic> body,
      {int? version, String? kind}) async {
    if (utf8.encode(jsonEncode(body)).length > 65536) {
      throw const AccountError(413, 'FORM_TOO_LARGE');
    }
    final party = owner(), epoch = session.epoch;
    final raw = await session.write('POST', path,
        actingParty: party,
        body: body,
        version: version,
        validate: (v) => LicenseRecord.parse(v, party, kind: kind));
    check(epoch, party);
    return LicenseRecord.parse(raw, party, kind: kind);
  }

  Future<LicenseRecord> retry(String path, {String? kind}) async {
    final value = pending(path);
    if (value == null) throw const AccountError(409, 'NO_PENDING_OPERATION');
    return write(path, Map<String, dynamic>.from(value['body']),
        version: value['version'], kind: kind);
  }

  Future<String> reading(LicenseRecord record) async {
    final party = owner(), epoch = session.epoch;
    if (record.kind != 'READING' ||
        record.counterparty != party ||
        record.data['reader_account_id'] != session.account?['id'] ||
        record.status != 'APPROVED' ||
        record.expired) {
      throw const AccountError(403, 'READING_FORBIDDEN');
    }
    final raw = await session.read(
        '/api/v1/licensing/readings/${record.id}/content',
        actingParty: party);
    check(epoch, party);
    licenseRequire(raw.length == 3 &&
        raw['record_id'] == record.id &&
        raw['allows_generation'] == false &&
        raw['watermarked_text'] is String &&
        (raw['watermarked_text'] as String).isNotEmpty &&
        (raw['watermarked_text'] as String).length <= 16000000);
    return raw['watermarked_text'];
  }
}
