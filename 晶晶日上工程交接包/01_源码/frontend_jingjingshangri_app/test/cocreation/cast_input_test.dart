import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/cocreation/cocreation_cast.dart';
import '../account/fake_account_api.dart';
import '../artists/artists_fixtures.dart' as artists;

Map<String, dynamic> supplyConsent() => {
      'id': invitedOrgId,
      'kind': 'CONSENT',
      'stream_ref': invitationId,
      'revision': 1,
      'owner_party_id': personId,
      'created_by': accountId,
      'current_status': 'APPROVED',
      'object_version': 2,
      'data': {
        'consent': {
          'avatar_id': artists.avatarKey,
          'subject_party_id': personId,
          'features': ['FACE'],
          'purposes': ['PRIVATE'],
          'territories': ['CN'],
          'valid_from': '2020-01-01T00:00:00.000Z',
          'valid_until': '2099-01-01T00:00:00.000Z',
          'terms': '本人共创作品使用原约定',
          'evidence_asset_ids': [artists.assetKey],
        },
        'review': {
          'decision': 'APPROVED',
          'reason': '独立核对本人同意',
          'reviewer_account_id': invitationId,
          'recorded_at': '2026-10-22T01:00:00.000Z',
        },
        'withdrawal': null,
        'signing_method': 'IN_APP_DECLARATION',
        'identity_verification': 'NOT_VERIFIED',
      },
    };

void main() {
  test('共创直接读取真实作品授权DTO，核对本人范围和独立审核', () {
    expect(
        cocreationSupplyConsent(supplyConsent(), personId)['id'], invitedOrgId);
    expect(() => cocreationSupplyConsent(supplyConsent(), orgId),
        throwsA(isA<AccountError>()));
    final changed = supplyConsent();
    changed['data']['review']['decision'] = 'REJECTED';
    expect(() => cocreationSupplyConsent(changed, personId),
        throwsA(isA<AccountError>()));
  });
  testWidgets('已有本人形象载入真实CONSENT，不走仅作者/原作的旧SupplyDto', (tester) async {
    final adapter = artists.artistAdapter(override: (r) {
      if (r.path == '/api/v1/supply/records') {
        return envelope({
          'items': [supplyConsent()],
          'next_cursor': null
        });
      }
      return null;
    });
    final session =
        (await tester.runAsync(() => artists.artistSession(adapter)))!;
    final controllers = <TextEditingController>[];
    TextEditingController create([String text = '']) {
      final c = TextEditingController(text: text);
      controllers.add(c);
      return c;
    }

    final input = CocreationCastInput(create, initial: {
      'person_id': artists.personKey,
      'avatar_id': artists.avatarKey,
      'supply_consent_id': invitedOrgId,
      'look_version_id': artists.recordKey,
      'artist_consent_ids': [artists.recordKey],
    });
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                child:
                    input.chooser(session, enabled: true, changed: () {})))));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
    await tester.pumpAndSettle();
    expect(find.text('本人测试艺人 · 版本1'), findsOneWidget);
    expect(find.text('本人共创作品使用原约定 · 版本2'), findsOneWidget);
    expect(find.textContaining('尚无属于当前本人的艺人资料'), findsNothing);
    expect(find.textContaining('账号服务暂时无法返回有效结果'), findsNothing);
    final request =
        adapter.requests.singleWhere((r) => r.path == '/api/v1/supply/records');
    expect(request.headers['X-Acting-Party'], personId);
    expect(request.queryParameters, {'kind': 'CONSENT', 'limit': 20});
    await tester.pumpWidget(const SizedBox.shrink());
    for (final c in controllers) {
      c.dispose();
    }
    session.dispose();
  });
  test('本人形象逐项引用，声音可空，不能超两份或重复脸声授权', () {
    final controllers = <TextEditingController>[];
    TextEditingController create([String text = '']) {
      final c = TextEditingController(text: text);
      controllers.add(c);
      return c;
    }

    final input = CocreationCastInput(create, initial: {
      'person_id': personId,
      'avatar_id': orgId,
      'supply_consent_id': invitedOrgId,
      'look_version_id': invitationId,
      'voice_version_id': null,
      'artist_consent_ids': [accountId],
      'usage': 'NEW_GENERATION'
    });
    expect(input.value()['voice_version_id'], isNull);
    expect(input.value()['usage'], 'NEW_GENERATION');
    input.consents.text = '$personId\n$orgId\n$invitedOrgId';
    expect(input.value, throwsA(isA<AccountError>()));
    input.consents.text = '$accountId\n$accountId';
    expect(input.value, throwsA(isA<AccountError>()));
    input.consents.text = accountId;
    input.person.text = '';
    expect(input.value, throwsA(isA<AccountError>()));
    for (final c in controllers) {
      c.dispose();
    }
  });
}
