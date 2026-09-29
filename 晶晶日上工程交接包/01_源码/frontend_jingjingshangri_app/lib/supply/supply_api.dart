import 'dart:typed_data';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import 'supply_models.dart';

class SupplyApi {
  SupplyApi(this.session);
  final AccountSession session;
  String owner() {
    if (session.supplyAccessDenied ||
        !session.isLoggedIn ||
        session.partyId == null ||
        !session.isOwner ||
        ['SUSPENDED', 'CLOSED'].contains(session.party?['current_status'])) {
      throw const AccountError(403, 'SUPPLY_OWNER_REQUIRED');
    }
    return session.partyId!;
  }

  void check(int epoch, String party) {
    if (epoch != session.epoch || party != owner()) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
  }

  Future<Map<String, dynamic>> page(String kind, {String? cursor}) async {
    final party = owner(), epoch = session.epoch;
    final data = await session.read('/api/v1/supply/records',
        actingParty: party,
        query: {
          'kind': kind,
          'limit': 20,
          if (cursor != null) 'cursor': cursor
        });
    check(epoch, party);
    SupplyDto.page(data, party, kind);
    supplyRequire(cursor == null || data['next_cursor'] != cursor);
    return data;
  }

  Future<List<Map<String, dynamic>>> all(String kind) async {
    final party = owner(), epoch = session.epoch;
    final result = <Map<String, dynamic>>[], seen = <String>{};
    String? cursor;
    do {
      check(epoch, party);
      final data = await page(kind, cursor: cursor);
      check(epoch, party);
      result.addAll((data['items'] as List).cast<Map<String, dynamic>>());
      cursor = data['next_cursor'] as String?;
      if (cursor != null && !seen.add(cursor)) {
        throw const AccountError(502, 'INVALID_SUPPLY_RESPONSE');
      }
    } while (cursor != null);
    return {for (final record in result) record['id'] as String: record}
        .values
        .toList();
  }

  Future<Map<String, dynamic>?> latestProfile() async {
    final records = await all('PROFILE');
    records
        .sort((a, b) => (b['revision'] as int).compareTo(a['revision'] as int));
    return records.isEmpty ? null : records.first;
  }

  Future<Map<String, dynamic>> latestWork(Map<String, dynamic> current) async {
    final records = (await all('WORK_VERSION'))
        .where((r) => r['stream_ref'] == current['stream_ref'])
        .toList()
      ..sort((a, b) => (b['revision'] as int).compareTo(a['revision'] as int));
    if (records.isEmpty) throw const AccountError(404, 'SUPPLY_NOT_FOUND');
    return record(records.first['id'] as String);
  }

  Future<Map<String, dynamic>> record(String id) async {
    if (!supplyId(id)) throw const AccountError(400, 'INVALID_ID');
    final party = owner(), epoch = session.epoch;
    final data =
        await session.read('/api/v1/supply/records/$id', actingParty: party);
    check(epoch, party);
    SupplyDto.record(data, party, id: id);
    return data;
  }

  Future<Map<String, dynamic>> write(String path, Map<String, dynamic> body,
      {int? version, String? kind}) async {
    if (utf8.encode(jsonEncode(body)).length > 65536) {
      throw const AccountError(413, 'FORM_TOO_LARGE');
    }
    final party = owner(), epoch = session.epoch;
    final data = await session.write('POST', path,
        actingParty: party,
        body: body,
        version: version,
        validate: (data) => SupplyDto.record(data, party, kind: kind));
    check(epoch, party);
    return data;
  }

  Map<String, dynamic>? pending(String path) =>
      session.pending('POST', path, actingParty: owner());
  Future<Map<String, dynamic>> asset(String id, {String? purpose}) async {
    if (!supplyId(id)) throw const AccountError(400, 'INVALID_ID');
    final party = owner(), epoch = session.epoch;
    final data =
        await session.read('/api/v1/supply/assets/$id', actingParty: party);
    check(epoch, party);
    SupplyDto.asset(data, party, purpose: purpose);
    supplyRequire(data['id'] == id);
    return data;
  }

  Future<Map<String, dynamic>> upload(
      Uint8List bytes, String purpose, String mediaType) async {
    if (bytes.isEmpty) throw const AccountError(400, 'FILE_EMPTY');
    if (bytes.length > maxSupplyBytes) {
      throw const AccountError(413, 'FILE_TOO_LARGE');
    }
    if (!supplyMedia.containsValue(mediaType)) {
      throw const AccountError(400, 'FILE_TYPE_UNSUPPORTED');
    }
    final party = owner(), epoch = session.epoch;
    final data = await session.upload('/api/v1/supply/assets', bytes,
        actingParty: party,
        query: {'purpose': purpose, 'media_type': mediaType}, validate: (data) {
      SupplyDto.asset(data, party, purpose: purpose);
      supplyRequire(data['byte_size'] == bytes.length &&
          data['content_sha256'] == sha256.convert(bytes).toString() &&
          data['media_type'] == mediaType);
    });
    check(epoch, party);
    return data;
  }

  Future<Uint8List> download(String id) async {
    final party = owner(), epoch = session.epoch;
    final metadata = await asset(id);
    final bytes = await session.readBytes('/api/v1/supply/assets/$id/content',
        actingParty: party);
    check(epoch, party);
    if (bytes.length != metadata['byte_size'] ||
        sha256.convert(bytes).toString() != metadata['content_sha256']) {
      throw const AccountError(502, 'PRIVATE_CONTENT_MISMATCH');
    }
    return bytes;
  }
}
