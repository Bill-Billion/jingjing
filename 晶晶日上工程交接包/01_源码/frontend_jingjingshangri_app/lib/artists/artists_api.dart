import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../supply/supply_models.dart' show SupplyDto;
import 'artists_models.dart';

class ArtistsApi {
  ArtistsApi(this.session);
  final AccountSession session;
  static const base = '/api/v1/artists';
  String owner() {
    if (!session.isLoggedIn) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    if (session.artistsAccessDenied ||
        session.partyId == null ||
        !session.isOwner ||
        session.selected?['membership']?['current_status'] != 'ACTIVE' ||
        ['SUSPENDED', 'CLOSED'].contains(session.party?['current_status'])) {
      throw const AccountError(403, 'ARTIST_PARTY_FORBIDDEN');
    }
    return session.partyId!;
  }

  void check(int epoch, String? party) {
    if (epoch != session.epoch ||
        !session.isLoggedIn ||
        session.artistsAccessDenied ||
        party != null && party != owner()) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
  }

  String personPath(String id) {
    if (!artistId(id)) throw const AccountError(400, 'INVALID_ID');
    return '$base/people/$id';
  }

  Future<ArtistServices> services() async {
    final epoch = session.epoch;
    final data = await session.read('$base/services');
    check(epoch, null);
    return ArtistServices.parse(data);
  }

  Future<ArtistPage<T>> _page<T>(String path, T Function(dynamic) parse,
      {Map<String, dynamic> query = const {},
      String? cursor,
      bool account = false}) async {
    final party = account ? null : owner(), epoch = session.epoch;
    final data = await session.read(path,
        actingParty: party,
        query: {...query, 'limit': 20, if (cursor != null) 'cursor': cursor});
    check(epoch, party);
    artistRequire(data['next_cursor'] == null ||
        artistId(data['next_cursor']) && data['next_cursor'] != cursor);
    final items = artistList(data['items']).map(parse).toList();
    return ArtistPage(items, data['next_cursor']);
  }

  Future<ArtistPage<ArtistPerson>> people({String? cursor}) =>
      _page('$base/people', ArtistPerson.parse, cursor: cursor);
  Future<ArtistDetail> person(String id) async {
    final party = owner(), epoch = session.epoch;
    final data = await session.read(personPath(id), actingParty: party);
    check(epoch, party);
    return ArtistDetail.parse(data, id);
  }

  Future<ArtistPage<ArtistRecord>> records(String personId, String kind,
      {String? cursor}) {
    if (!artistKinds.containsKey(kind)) {
      throw const AccountError(400, 'INVALID_KIND');
    }
    return _page('${personPath(personId)}/records',
        (v) => ArtistRecord.parse(v, personId, kind: kind),
        query: {'kind': kind}, cursor: cursor);
  }

  Future<List<ArtistRecord>> allRecords(String personId, String kind) async {
    final rows = <ArtistRecord>[], seen = <String>{};
    String? cursor;
    do {
      final page = await records(personId, kind, cursor: cursor);
      rows.addAll(page.items);
      cursor = page.cursor;
      if (cursor != null) artistRequire(seen.add(cursor));
    } while (cursor != null);
    return {for (final r in rows) r.id: r}.values.toList();
  }

  Future<Set<String>> actions(ArtistDetail detail) async {
    final party = owner();
    if (detail.person.owner == party) return artistActions.keys.toSet();
    final epoch = session.epoch, now = DateTime.now();
    final delegations = await allRecords(detail.person.id, 'DELEGATION');
    check(epoch, party);
    return {
      for (final r in delegations)
        if (r.status == 'ACTIVE' &&
            r.data['organization_party_id'] == party &&
            DateTime.parse(r.data['valid_from']).isBefore(now) &&
            DateTime.parse(r.data['valid_until']).isAfter(now))
          ...artistStrings(r.data['actions'])
    };
  }

  Future<ArtistRecord> record(String personId, String id,
      {bool service = false}) async {
    if (!artistId(id)) throw const AccountError(400, 'INVALID_ID');
    final party = owner(), epoch = session.epoch;
    final d = await session.read(
        '${personPath(personId)}/${service ? 'services' : 'records'}/$id',
        actingParty: party);
    check(epoch, party);
    final r = ArtistRecord.parse(d, personId,
        id: id, kind: service ? 'SERVICE' : null);
    if (service) artistRequire(d.containsKey('order'));
    return r;
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body,
      {int? version, ArtistPerson? person}) async {
    if (!path.startsWith('$base/people') ||
        utf8.encode(jsonEncode(body)).length > 65536) {
      throw const AccountError(400, 'INVALID_ARTIST_INPUT');
    }
    final party = owner(), epoch = session.epoch;
    void validate(Map<String, dynamic> data) {
      if (path == '$base/people') {
        artistRequire(ArtistPerson.parse(data).owner == party);
      } else if (path.endsWith('/avatars')) {
        artistRequire(person != null);
        ArtistAvatar.parse(data, person!);
      } else {
        final id = path.substring('$base/people/'.length).split('/').first;
        ArtistRecord.parse(data, id);
      }
    }

    final d = await session.write('POST', path,
        actingParty: party, body: body, version: version, validate: validate);
    check(epoch, party);
    return d;
  }

  Map<String, dynamic>? pending(String path) =>
      session.pending('POST', path, actingParty: owner());
  Future<Map<String, dynamic>> retry(String path, {ArtistPerson? person}) {
    final p = pending(path);
    if (p == null || p['bytes'] != null) {
      throw const AccountError(409, 'PENDING_OPERATION_CHANGED');
    }
    return post(path, Map<String, dynamic>.from(p['body']),
        version: p['version'], person: person);
  }

  Future<Map<String, dynamic>> asset(String id, ArtistPerson person,
      {String? purpose}) async {
    if (!artistId(id)) throw const AccountError(400, 'INVALID_ID');
    final party = owner(), epoch = session.epoch;
    final d = await session.read('$base/assets/$id', actingParty: party);
    check(epoch, party);
    SupplyDto.asset(d, person.owner, purpose: purpose);
    artistRequire(d['id'] == id && artistMedia.containsValue(d['media_type']));
    return d;
  }

  Future<Map<String, dynamic>> upload(ArtistPerson person, Uint8List bytes,
      String purpose, String media) async {
    if (bytes.isEmpty ||
        bytes.length > maxArtistBytes ||
        !artistMedia.containsValue(media) ||
        !['AVATAR_MATERIAL', 'CONSENT_EVIDENCE', 'REVIEW_EVIDENCE']
            .contains(purpose)) {
      throw const AccountError(400, 'INVALID_ARTIST_FILE');
    }
    final party = owner(), epoch = session.epoch;
    final d = await session.upload('${personPath(person.id)}/assets', bytes,
        actingParty: party,
        query: {'purpose': purpose, 'media_type': media}, validate: (d) {
      try {
        SupplyDto.asset(d, person.owner, purpose: purpose);
      } on AccountError {
        throw const AccountError(502, 'INVALID_ARTIST_RESPONSE',
            uncertain: true);
      }
      artistRequire(d['byte_size'] == bytes.length &&
          d['content_sha256'] == sha256.convert(bytes).toString() &&
          d['media_type'] == media);
    });
    check(epoch, party);
    return d;
  }

  Future<Uint8List> download(ArtistPerson person, String id) async {
    final party = owner(), epoch = session.epoch;
    final meta = await asset(id, person);
    final bytes =
        await session.readBytes('$base/assets/$id/content', actingParty: party);
    check(epoch, party);
    if (bytes.length != meta['byte_size'] ||
        sha256.convert(bytes).toString() != meta['content_sha256']) {
      throw const AccountError(502, 'PRIVATE_CONTENT_MISMATCH');
    }
    return bytes;
  }

  Future<ArtistPage<Map<String, dynamic>>> catalog(
          {String? cursor, String? city, String? tag, bool audition = false}) =>
      _page('$base/catalog', (v) {
        final d = artistMap(v);
        artistRequire(artistId(d['listing_id']) &&
            artistId(d['person_id']) &&
            artistId(d['avatar_id']) &&
            d['display_name'] is String &&
            d['city'] is String &&
            d['introduction'] is String &&
            d['audition_public'] is bool &&
            d['halo_level'] is int &&
            d['halo_level'] >= 0 &&
            d['halo_level'] <= 3);
        artistStrings(d['tags'], max: 15);
        artistRequire(artistStrings(d['preview_asset_ids'], ids: true, max: 6)
            .isNotEmpty);
        return d;
      }, account: true, cursor: cursor, query: {
        if (city?.trim().isNotEmpty == true) 'city': city!.trim(),
        if (tag?.trim().isNotEmpty == true) 'tag': tag!.trim(),
        if (audition) 'audition': 'true'
      });
  Future<Uint8List> publicPreview(String listingId, String assetId) async {
    if (!artistId(listingId) || !artistId(assetId)) {
      throw const AccountError(400, 'INVALID_ID');
    }
    final epoch = session.epoch;
    final bytes = await session
        .readBytes('$base/catalog/$listingId/assets/$assetId/content');
    check(epoch, null);
    artistRequire(bytes.isNotEmpty && bytes.length <= maxArtistBytes);
    return bytes;
  }
}
