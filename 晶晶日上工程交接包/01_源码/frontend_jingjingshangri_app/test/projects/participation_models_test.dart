import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/projects/participation_pages.dart';
import 'package:jingjingshangri_app/projects/project_models.dart';
import 'project_fixtures.dart';

void main() {
  Map<String, dynamic> clone(Map<String, dynamic> v) =>
      Map<String, dynamic>.from(jsonDecode(jsonEncode(v)) as Map);
  test('参演纯分成、独立发行约定与原项目读取兼容，记录原文不可篡改', () {
    for (final kind in ['PARTICIPATION', 'INCOME_AGREEMENT']) {
      final r = projectData(kind);
      expect(participationRecord(r)['kind'], kind);
      expect(ProjectRecord.parse(r).kind, kind);
      r['data']['evidence_asset_id'] = avatarKey;
      expect(() => participationRecord(r), throwsA(isA<AccountError>()));
    }
    final p = projectData('PROJECT');
    p['data'].addAll({
      'business_version': 'V5',
      'current_income_id': assetKey,
      'revision': {
        'previous_plan_id': planKey,
        'previous_edition_id': editionKey,
        'reason': '换角后重新会签',
        'evidence_asset_id': assetKey
      }
    });
    p['content_sha256'] = projectDigest(p['data']);
    expect(ProjectRecord.parse(p).data['business_version'], 'V5');
  });
  test('分成合计100%、实际主体不重复，不接受浮点万分比', () {
    for (final change in [0, 1, 2]) {
      final r = clone(participationRevenueData());
      if (change == 0) r['shares'][0]['bps'] = 9999;
      if (change == 1) r['shares'].add(clone(r['shares'][0]));
      if (change == 2) r['shares'][0]['bps'] = 10000.0;
      expect(() => participationRevenue(r), throwsA(isA<AccountError>()));
    }
  });
  test('片酬分期必须等于原额、开工节点来自本期，不产生0元付款分期', () {
    final t = participationTermsData();
    participationTermsValid(t, 0);
    expect(() => participationTermsValid(t, 100), throwsA(isA<AccountError>()));
    t.addAll({
      'mode': 'FIXED_FEE',
      'revenue': null,
      'installments': [
        {'key': 'first', 'amount_minor': 10001, 'milestone': '本人确认开工条件'}
      ],
      'start_payment_keys': ['first']
    });
    participationTermsValid(t, 10001);
    final invalid = clone(t);
    invalid['installments'][0]['amount_minor'] = 10000;
    expect(() => participationTermsValid(invalid, 10001),
        throwsA(isA<AccountError>()));
    t['start_payment_keys'] = ['unknown'];
    expect(
        () => participationTermsValid(t, 10001), throwsA(isA<AccountError>()));
  });
}
