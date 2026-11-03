import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../engagement/community_support.dart';

/// Only non-secret recovery metadata is persisted. The invitation itself must
/// be pasted again after a process restart; the original command key survives.
class InvitePending {
  const InvitePending(
      {required this.kind,
      required this.account,
      required this.party,
      required this.key,
      required this.path,
      this.room,
      this.version,
      this.person,
      this.digest});
  final String kind, account, party, key, path;
  final String? room, person, digest;
  final int? version;
  static const storageKey = 'jx.cocreation.invite.pending.v1';
  static String newKey() {
    final random = Random.secure();
    return 'app-${List.generate(24, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
  }

  static String hashToken(String token) =>
      sha256.convert(utf8.encode(token)).toString();
  Map<String, dynamic> toJson() => {
        'kind': kind,
        'account': account,
        'party': party,
        'key': key,
        'path': path,
        'room': room,
        'version': version,
        'person': person,
        'digest': digest
      };
  static InvitePending? parse(Object? value) {
    if (value is! Map) return null;
    final v = Map<String, dynamic>.from(value);
    if (v.keys.toSet().difference({
          'kind',
          'account',
          'party',
          'key',
          'path',
          'room',
          'version',
          'person',
          'digest'
        }).isNotEmpty ||
        !communityId(v['account']) ||
        !communityId(v['party']) ||
        v['key'] is! String ||
        !RegExp(r'^app-[a-f0-9]{48}$').hasMatch(v['key']) ||
        v['path'] is! String) {
      return null;
    }
    final kind = v['kind'],
        room = v['room'],
        version = v['version'],
        person = v['person'],
        digest = v['digest'],
        path = v['path'];
    if (kind == 'create') {
      if (!communityId(room) ||
          path != 'rooms/$room/invite-links' ||
          version is! int ||
          version < 1 ||
          person != null ||
          digest != null) {
        return null;
      }
    } else if (kind == 'revoke') {
      if (!communityId(room) ||
          !RegExp(r'^invite-links/[0-9a-f-]{36}/revoke$').hasMatch(path) ||
          version is! int ||
          version < 1 ||
          person != null ||
          digest != null) {
        return null;
      }
    } else if (kind == 'claim') {
      if (room != null ||
          path != 'invite-links/claim' ||
          version != null ||
          !communityId(person) ||
          digest is! String ||
          !RegExp(r'^[a-f0-9]{64}$').hasMatch(digest)) {
        return null;
      }
    } else {
      return null;
    }
    return InvitePending(
        kind: kind,
        account: v['account'],
        party: v['party'],
        key: v['key'],
        path: path,
        room: room,
        version: version,
        person: person,
        digest: digest);
  }

  static Future<InvitePending?> read() async {
    final prefs = await SharedPreferences.getInstance(),
        raw = prefs.getString(storageKey);
    if (raw == null) return null;
    try {
      final value = parse(jsonDecode(raw));
      if (value != null) return value;
    } catch (_) {}
    // Do not discard a damaged unknown outcome and issue a fresh key.
    throw StateError('RECOVERY_RECORD_INVALID');
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    if (!await prefs.setString(storageKey, jsonEncode(toJson()))) {
      throw StateError('RECOVERY_STORAGE_UNAVAILABLE');
    }
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance(),
        raw = prefs.getString(storageKey);
    if (raw == null) return;
    InvitePending? old;
    try {
      old = parse(jsonDecode(raw));
    } catch (_) {}
    if (old == null || old.key != key) {
      throw StateError('RECOVERY_RECORD_CHANGED');
    }
    if (!await prefs.remove(storageKey)) {
      throw StateError('RECOVERY_STORAGE_UNAVAILABLE');
    }
  }
}
