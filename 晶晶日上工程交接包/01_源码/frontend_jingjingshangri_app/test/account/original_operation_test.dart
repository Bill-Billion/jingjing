import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'fake_account_api.dart';

void main() {
  for (final entry in originalOperationKinds.entries) {
    for (final scenario in [
      'committed',
      'absent409',
      'wrongDigest',
      'changedIdentity'
    ]) {
      test('${entry.value[1]} original receipt $scenario', () async {
        late FakeAccountAdapter adapter;
        var writes = 0;
        String? key;
        final body = {
          'event_id': invitationId,
          'nested': {
            'z': 1,
            'a': ['原内容']
          }
        };
        adapter = FakeAccountAdapter(handler: (r) {
          if (r.path == entry.key) {
            writes++;
            if (key != null) expect(r.headers['Idempotency-Key'], key);
            key = r.headers['Idempotency-Key'];
            return envelope({
              'code':
                  writes == 1 ? 'PROVIDER_OUTCOME_UNKNOWN' : 'DEADLINE_PASSED'
            }, status: writes == 1 ? 503 : 409, error: true);
          }
          if (r.path.contains('/operations/')) {
            expect(r.headers['X-Acting-Party'], personId);
            expect(r.queryParameters['operation'], entry.value[1]);
            return envelope({
              'operation': entry.value[1],
              'operation_key': key,
              'outcome': scenario == 'absent409' ? 'NOT_OBSERVED' : 'COMMITTED',
              'request_sha256': scenario == 'absent409'
                  ? null
                  : scenario == 'wrongDigest'
                      ? '0' * 64
                      : originalOperationDigest({
                          ...body,
                          'party_id': personId,
                          'operation_key': key
                        }),
              'record_id': scenario == 'absent409' ? null : invitationId,
              'record_kind': scenario == 'absent409' ? null : entry.value[2],
              'original_object_version': scenario == 'absent409' ? null : 1,
              'original_status': scenario == 'absent409' ? null : 'IN_REVIEW',
            });
          }
          if (r.path.contains('/records/')) {
            return envelope({
              'id': invitationId,
              'kind': entry.value[2],
              'object_version': 5,
              'current_status': 'APPROVED',
              'data': {'current': true},
            });
          }
          return adapter.defaultReply(r);
        });
        final s = AccountSession(api: adapter.createApi());
        await s.login('13800000000', invitationId, '123456');
        s.select(identity(personId));
        await expectLater(
            s.write('POST', entry.key, actingParty: personId, body: body),
            throwsA(isA<AccountError>()));
        expect(s.pending('POST', entry.key, actingParty: personId), isNotNull);
        if (scenario == 'changedIdentity') s.select(identity(orgId));
        final attempt = s.recoverCommitted('POST', entry.key,
            actingParty: personId, validate: (current) {
          expect(current['object_version'], 5);
        });
        if (scenario == 'wrongDigest') {
          await expectLater(attempt, throwsA(isA<AccountError>()));
          expect(
              s.pending('POST', entry.key, actingParty: personId), isNotNull);
          expect(adapter.requests.where((r) => r.path.contains('/records/')),
              isEmpty);
        } else if (scenario == 'absent409') {
          expect(await attempt, isNull);
          await expectLater(
              s.write('POST', entry.key, actingParty: personId, body: body),
              throwsA(isA<AccountError>()));
          expect(
              s.pending('POST', entry.key, actingParty: personId)?['key'], key);
          expect(writes, 2);
        } else if (scenario == 'changedIdentity') {
          expect(await attempt, isNull);
          expect(adapter.requests.where((r) => r.path.contains('/operations/')),
              isEmpty);
        } else {
          expect((await attempt)?['current_status'], 'APPROVED');
          expect(s.pending('POST', entry.key, actingParty: personId), isNull);
          expect(writes, 1);
        }
        s.dispose();
      });
    }
  }
}
