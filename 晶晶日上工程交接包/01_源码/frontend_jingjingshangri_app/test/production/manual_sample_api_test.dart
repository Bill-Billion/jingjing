import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/production/manual_sample_page.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'production_fixtures.dart';
import 'fulfillment_fixtures.dart';

Map<String, dynamic> snapshot() => {
      'request_id': otherVersionId,
      'object_version': 2,
      'content_sha256': 'c' * 64,
      'data': {
        'request_id': otherVersionId,
        'submission_id': productionVersionId,
        'submission_sha256': 'd' * 64,
        'commissioner_party_id': orgId,
        'rights_owner_party_id': personId,
        'merchant_party_id': invitedOrgId,
        'territory': 'CN',
        'terms': '仅本人已确认的人工样片范围',
        'ownership': 'ARTIST_RETAINS_OWNERSHIP',
        'cast': {
          'uses_identifiable_people': true,
          'cast': [
            {
              'person_id': personId,
              'avatar_id': productionFileId,
              'supply_consent_id': deliveryId,
              'look_version_id': productionFeedbackId,
              'voice_version_id': null
            }
          ]
        },
        'confirmation': null
      },
      'projects': [
        {'id': productionProjectId, 'current_status': 'ACCEPTED'}
      ],
    };
void main() {
  test('艺人从专用约定projects读取本人样片，不先读通用PROJECT/fulfillment且不预载final', () async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/manual-sample')
            ? envelope(snapshot())
            : r.path.endsWith('/manual-sample-content')
                ? binaryReply(Uint8List.fromList([0, 1, 2]))
                : a.defaultReply(r));
    final s = await buyerSession(a), api = ManualSampleApi(s, otherVersionId);
    final sample = await api.read();
    expect(sample.projects.single['id'], productionProjectId);
    expect(a.requests.where((r) => r.path.endsWith('/manual-sample-content')),
        isEmpty);
    expect(await api.content(productionProjectId), [0, 1, 2]);
    expect(
        a.requests.where((r) =>
            r.path.startsWith('/api/v1/production/records') ||
            r.path.endsWith('/fulfillment')),
        isEmpty);
    expect(a.requests.last.path,
        '/api/v1/production/projects/$productionProjectId/manual-sample-content');
    expect(a.requests.last.headers['X-Acting-Party'], personId);
  });
  test('MCN可读委托约定但不能借艺人专用入口读取本人样片', () async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/manual-sample')
            ? envelope(snapshot())
            : a.defaultReply(r));
    final s = await buyerSession(a);
    s.select(identity(orgId));
    final api = ManualSampleApi(s, otherVersionId);
    expect((await api.read()).data['rights_owner_party_id'], personId);
    await expectLater(
        api.content(productionProjectId), throwsA(isA<AccountError>()));
    expect(a.requests.where((r) => r.path.contains('/manual-sample-content')),
        isEmpty);
  });
  test('本人确认未知结果恢复原快照hash、版本和请求键', () async {
    var writes = 0;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/manual-sample')) return envelope(snapshot());
      if (r.path.endsWith('/manual-sample/confirmation')) {
        if (++writes == 1) {
          return envelope({'code': 'SERVICE_UNAVAILABLE'},
              status: 503, error: true);
        }
        final result = snapshot();
        result['data']['confirmation'] = {
          'account_id': accountId,
          'confirmed_sha256': 'c' * 64,
          'confirmed_at': fulfillmentDate
        };
        return envelope(result);
      }
      return a.defaultReply(r);
    });
    final s = await buyerSession(a),
        api = ManualSampleApi(s, otherVersionId),
        sample = await api.read();
    await expectLater(api.confirm(sample), throwsA(isA<AccountError>()));
    final old = a.requests.last;
    await api.confirm(sample);
    expect(a.requests.last.data, {'content_sha256': 'c' * 64});
    expect(a.requests.last.headers['If-Match'], old.headers['If-Match']);
    expect(a.requests.last.headers['Idempotency-Key'],
        old.headers['Idempotency-Key']);
    expect(api.pending, isNull);
  });
}
