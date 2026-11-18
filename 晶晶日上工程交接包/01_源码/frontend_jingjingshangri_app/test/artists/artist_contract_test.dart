import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/artists/artists_models.dart';
import 'package:jingjingshangri_app/artists/artists_forms.dart';
import '../account/fake_account_api.dart';
import 'artists_fixtures.dart';
import 'artists_widgets_test.dart' show host, press;

Map<String, dynamic> freeSpec(String kind) {
  final s = serviceSpec(kind: kind);
  s['service'] = <String, dynamic>{
    ...s['service'],
    'unit': kind == 'AVATAR_CREATION' ? 'AVATAR' : 'AVATAR_PERPETUAL',
    'rule_version': 'CONTRACT_20261029',
    'failure_policy': 'NO_CASH_REFUND',
    'retry_limit': 0,
    'hosting_months': null
  };
  return s;
}

Map<String, dynamic> freeRecord(String kind) {
  final r = artistRecord(
      kind: 'SERVICE',
      status: kind == 'AVATAR_CREATION' ? 'READY' : 'DELIVERED');
  r['data'] = <String, dynamic>{
    ...r['data'],
    'kind': kind,
    'specification': freeSpec(kind),
    'spec_id': null,
    'price_minor': 0,
    'payment_requirement': 'NONE',
    'hosting_period': kind == 'AVATAR_HOSTING'
        ? {
            'valid_from': '2026-11-01T00:00:00.000Z',
            'valid_until': null,
            'perpetual': true
          }
        : null
  };
  r['order'] = null;
  return r;
}

Map<String, dynamic> modernOffers() {
  final s = servicesData();
  s['offers'] = <String, dynamic>{
    ...s['offers'],
    'contract_policy': 'CONTRACT_20261029',
    'items': [],
    'free_services': [
      for (final k in ['AVATAR_CREATION', 'AVATAR_HOSTING'])
        {
          'kind': k,
          'price_minor': 0,
          'currency': 'CNY',
          'payment_requirement': 'NONE',
          'specification': freeSpec(k)
        }
    ]
  };
  return s;
}

Map<String, dynamic> materials() => {
      'model_card_asset_id': assetKey,
      'lifestyle_asset_ids': [assetKey],
      'full_body_asset_ids': [assetKey],
      'personal_introduction': '本人合成简介',
      'resume': '本人合成简历'
    };
void main() {
  test('免费创建与永久托管严格区分历史收费，nullable规格/订单/期限可读', () {
    expect(ArtistServices.parse(modernOffers()).freeOffers.length, 2);
    for (final kind in ['AVATAR_CREATION', 'AVATAR_HOSTING']) {
      final r = freeRecord(kind);
      expect(ArtistRecord.parse(r, personKey).freeService, true);
      for (final field in ['spec_id', 'price_minor', 'renewal_reminder']) {
        final bad = freeRecord(kind);
        bad['data'][field] = field == 'spec_id'
            ? specKey
            : field == 'price_minor'
                ? 1
                : true;
        expect(() => ArtistRecord.parse(bad, personKey),
            throwsA(isA<AccountError>()));
      }
    }
    expect(
        ArtistRecord.parse(
                artistRecord(kind: 'SERVICE', status: 'READY'), personKey)
            .data['price_minor'],
        2900);
    final failed = freeRecord('AVATAR_CREATION')..['current_status'] = 'FAILED';
    expect(ArtistRecord.parse(failed, personKey).status, 'FAILED');
    final disabled = modernOffers();
    disabled['offers']['current_status'] = 'NOT_ENABLED';
    expect(() => ArtistServices.parse(disabled), throwsA(isA<AccountError>()));
  });
  test('新版分类材料及补件旧版可读，只有新版待审/补件允许撤回', () {
    final r = artistRecord(kind: 'HALO', status: 'SUBMITTED');
    r['data'] = <String, dynamic>{
      ...r['data'],
      'level': 2,
      'service_id': recordKey,
      'rule_version': 'CONTRACT_20261029',
      'certification_materials': materials(),
      'supplements': [
        {
          'previous_certification_materials': materials(),
          'certification_materials': materials()
        }
      ]
    };
    expect(ArtistRecord.parse(r, personKey).canWithdraw, true);
    r['current_status'] = 'APPROVED';
    expect(ArtistRecord.parse(r, personKey).canWithdraw, false);
    r['current_status'] = 'WITHDRAWN';
    expect(ArtistRecord.parse(r, personKey).canWithdraw, false);
    for (final change in [
      <String, dynamic>{'resume': ''},
      <String, dynamic>{'full_body_asset_ids': []},
      <String, dynamic>{'personal_introduction': '长' * 2001}
    ]) {
      final m = {...materials(), ...change};
      expect(
          () => artistCertificationMaterials(m), throwsA(isA<AccountError>()));
    }
    expect(
        ArtistRecord.parse(
                artistRecord(kind: 'HALO', status: 'SUBMITTED'), personKey)
            .canWithdraw,
        false);
  });
  testWidgets('免费创建真实表单选择具体数字人，只提交kind/version，不建价格或收银单', (t) async {
    final a = artistAdapter(
            override: (r) => r.path == '$artistRoot/services'
                ? envelope(modernOffers())
                : r.path == '$artistRoot/people/$personKey/free-services'
                    ? envelope(freeRecord('AVATAR_CREATION'))
                    : null),
        s = (await t.runAsync(() => artistSession(a)))!;
    await host(
        t,
        s,
        const ArtistFormPage(
            mode: 'SERVICE', personId: personKey, avatarId: avatarKey));
    await press(t, find.byType(DropdownButtonFormField<String>).first);
    await press(t, find.text('首次创建服务 · 永久免费').last);
    await press(t, find.byKey(const ValueKey('artist-submit')));
    expect(find.text('本次免费申请无需付款；人工创建结果另行核对。'), findsOneWidget);
    await press(t, find.text('确认办理'));
    final post = a.requests.singleWhere(
        (r) => r.method == 'POST' && r.path.endsWith('/free-services'));
    expect(post.data, {
      'avatar_id': avatarKey,
      'kind': 'AVATAR_CREATION',
      'rule_version': 'CONTRACT_20261029'
    });
    expect(
        a.requests.where((r) =>
            r.method == 'POST' &&
            (r.path.contains('/payments') || r.path.contains('/quotes'))),
        isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets('机构不能代本人申请免费服务，切身份不保留可提交表单', (t) async {
    final a = artistAdapter(
            override: (r) => r.path == '$artistRoot/services'
                ? envelope(modernOffers())
                : null),
        s = (await t.runAsync(() => artistSession(a)))!;
    await host(
        t,
        s,
        const ArtistFormPage(
            mode: 'SERVICE', personId: personKey, avatarId: avatarKey));
    s.select(identity(orgId));
    await t.pumpAndSettle();
    final button = find.byKey(const ValueKey('artist-submit'));
    if (button.evaluate().isNotEmpty) {
      expect(t.widget<FilledButton>(button).onPressed, isNull);
    }
    expect(
        a.requests.where(
            (r) => r.method == 'POST' && r.path.endsWith('/free-services')),
        isEmpty);
    expect(t.takeException(), isNull);
  });
}
