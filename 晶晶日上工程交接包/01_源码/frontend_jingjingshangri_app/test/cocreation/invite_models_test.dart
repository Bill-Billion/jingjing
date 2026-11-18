import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/cocreation/invite_models.dart';
import 'package:jingjingshangri_app/cocreation/invite_pending.dart';

void main() {
  const id = '00000000-0000-0000-0000-000000000001';
  const room = '00000000-0000-0000-0000-000000000002';
  final token = '$id.${'a' * 64}';
  final link = {
    'id': id,
    'room_id': room,
    'current_status': 'ACTIVE',
    'object_version': 1,
    'expires_at': '2026-11-04T00:00:00.000Z'
  };
  test('only credential or fragment can be parsed, never query', () {
    expect(parseCocreationInvite(token), token);
    expect(
        parseCocreationInvite(
            'https://example.test/cocreation/invitations#invite=$token'),
        token);
    expect(
        parseCocreationInvite(
            'https://example.test/cocreation/invitations?invite=$token'),
        isNull);
    expect(
        parseCocreationInvite(
            'https://example.test/cocreation/invitations#invite=$token&other=x'),
        isNull);
  });
  test('only creation returns a valid token for the matching room', () {
    expect(cocreationInviteLink(link, room)['id'], id);
    expect(() => cocreationInviteLink({...link, 'token': token}, room),
        throwsA(anything));
    expect(
        cocreationInviteLink(
            {...link, 'token': token, 'participation_required': true}, room,
            created: true)['token'],
        token);
    expect(
        () => cocreationInviteLink(
            {...link, 'token': token, 'participation_required': false}, room,
            created: true),
        throwsA(anything));
    expect(() => cocreationInviteLink(link, id), throwsA(anything));
  });
  test('recovery metadata rejects secrets and unrelated paths', () {
    final p = InvitePending(
        kind: 'claim',
        account: id,
        party: room,
        key: 'app-${'b' * 48}',
        path: 'invite-links/claim',
        person: id,
        digest: InvitePending.hashToken(token));
    expect(InvitePending.parse(p.toJson())?.key, p.key);
    expect(p.toJson().toString(), isNot(contains(token)));
    expect(InvitePending.parse({...p.toJson(), 'token': token}), isNull);
    expect(
        InvitePending.parse({...p.toJson(), 'path': '/api/v1/trade/payments'}),
        isNull);
  });
  test('claim does not authorize participation and matches person', () {
    final claim = {
      'invitation_id': id,
      'room_id': room,
      'person_id': id,
      'current_status': 'INVITED',
      'participation_required': true
    };
    expect(cocreationInviteClaim(claim, id)['room_id'], room);
    expect(
        () => cocreationInviteClaim(
            {...claim, 'participation_required': false}, id),
        throwsA(anything));
    expect(() => cocreationInviteClaim(claim, room), throwsA(anything));
  });
}
