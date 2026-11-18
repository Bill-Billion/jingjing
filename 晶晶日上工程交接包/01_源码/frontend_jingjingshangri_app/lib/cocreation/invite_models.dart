import '../engagement/community_support.dart';

final _invitePattern = RegExp(r'^[a-f0-9-]{36}\.[a-f0-9]{64}$');
String? parseCocreationInvite(String value) {
  final input = value.trim();
  if (_invitePattern.hasMatch(input) && communityId(input.substring(0, 36))) {
    return input;
  }
  final uri = Uri.tryParse(input);
  if (uri == null ||
      !['https', 'http'].contains(uri.scheme) ||
      uri.host.isEmpty ||
      uri.path != '/cocreation/invitations' ||
      uri.hasQuery ||
      !uri.fragment.startsWith('invite=')) {
    return null;
  }
  final token = uri.fragment.substring(7);
  return _invitePattern.hasMatch(token) && communityId(token.substring(0, 36))
      ? token
      : null;
}

Map<String, dynamic> cocreationInviteLink(Object? input, String room,
    {bool created = false, String? expectedId}) {
  final v = communityMap(input);
  final allowed = {
    'id',
    'room_id',
    'current_status',
    'object_version',
    'expires_at',
    if (created) 'token',
    if (created) 'participation_required'
  };
  communityRequire(v.keys.every(allowed.contains) &&
      communityId(v['id']) &&
      (expectedId == null || v['id'] == expectedId) &&
      v['room_id'] == room &&
      ['ACTIVE', 'CLAIMED', 'REVOKED'].contains(v['current_status']) &&
      v['object_version'] is int &&
      v['object_version'] > 0 &&
      v['expires_at'] is String &&
      DateTime.tryParse(v['expires_at']) != null);
  if (created) {
    final token = v['token'];
    communityRequire(v['current_status'] == 'ACTIVE' &&
        token is String &&
        parseCocreationInvite(token) == token &&
        token.startsWith('${v['id']}.') &&
        v['participation_required'] == true);
  }
  return v;
}

Map<String, dynamic> cocreationInviteClaim(Object? input, String person) {
  final v = communityMap(input);
  communityRequire(v.keys.every({
        'invitation_id',
        'room_id',
        'person_id',
        'current_status',
        'participation_required'
      }.contains) &&
      communityId(v['invitation_id']) &&
      communityId(v['room_id']) &&
      v['person_id'] == person &&
      v['current_status'] == 'INVITED' &&
      v['participation_required'] == true);
  return v;
}
