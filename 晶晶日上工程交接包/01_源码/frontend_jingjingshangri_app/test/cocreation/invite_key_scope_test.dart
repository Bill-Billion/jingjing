import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/cocreation/invite_pending.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import '../account/fake_account_api.dart';

void main() {
  test('a changed or corrupt recovery record never gets silently cleared',
      () async {
    const id = '00000000-0000-0000-0000-000000000001';
    final op = InvitePending(
        kind: 'create',
        account: id,
        party: id,
        key: 'app-${'a' * 48}',
        path: 'rooms/$id/invite-links',
        room: id,
        version: 1);
    final other = InvitePending(
        kind: 'create',
        account: id,
        party: id,
        key: 'app-${'b' * 48}',
        path: 'rooms/$id/invite-links',
        room: id,
        version: 1);
    SharedPreferences.setMockInitialValues(
        {InvitePending.storageKey: jsonEncode(other.toJson())});
    await expectLater(op.clear(), throwsStateError);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(InvitePending.storageKey), isNotNull);
    await prefs.setString(InvitePending.storageKey, '{damaged');
    await expectLater(op.clear(), throwsStateError);
    await expectLater(InvitePending.read(), throwsStateError);
    expect(prefs.getString(InvitePending.storageKey), '{damaged');
  });
  test('explicit recovery key cannot be used for payment or unrelated paths',
      () async {
    final adapter = FakeAccountAdapter(),
        api = adapter.createApi(),
        key = 'app-${'a' * 48}';
    await expectLater(
        api.request('POST', '/api/v1/trade/payments',
            token: 'synthetic', operationKey: key),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'INVALID_OPERATION_KEY')));
    expect(adapter.requests, isEmpty);
  });
}
