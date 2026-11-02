import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/rights/rights_models.dart';
import 'package:jingjingshangri_app/rights/rights_widgets.dart';
import 'package:jingjingshangri_app/licensing/license_models.dart';
import 'package:jingjingshangri_app/licensing/procurement_models.dart';
import 'package:jingjingshangri_app/licensing/license_widgets.dart';
import 'package:jingjingshangri_app/stock/stock_models.dart';
import '../account/fake_account_api.dart';
import '../stock/stock_test.dart' show stockPurchase;
import 'license_fixtures.dart';

Map<String, dynamic> commercial() => {
      'scope': 'COMMERCIAL_LIMITED',
      'exclusive': false,
      'territory': 'CN',
      'duration': 'FIXED_TERM',
      'personal_social_sharing': false,
      'acceptance_hours': 48,
      'aftercare_terms': '核对原单售后',
      'commercial_uses': ['BRAND_PROMOTION'],
      'valid_from': '2020-01-01T00:00:00.000Z',
      'valid_until': '2099-01-01T00:00:00.000Z',
      'limited_to_buyer': true,
      'excluded': [...stockExclusions]
    };
Map<String, dynamic> buyerCopyright() => {
      'version': 'CONTRACT_20261029',
      'mode': 'BUYER_OWNERSHIP',
      'buyout_price_included': true,
      'license': null,
      'personality_rights_retained': true,
      'underlying_assets_excluded': true,
      'third_party_licenses_retained': true
    };
Map<String, dynamic> buyoutTerms() => {
      ...termsData(),
      'contract_kind': 'IP_BUYOUT_20261029',
      'exclusive': true,
      'rights': [...ipRights],
      'purposes': ['PRIVATE', 'PUBLIC_SHARE', 'COMMERCIAL', 'RELEASE'],
      'territories': ['WORLD'],
      'languages': ['ALL'],
      'valid_from': '2024-02-29T00:00:00.000Z',
      'valid_until': null,
      'development_until': null,
      'project_limit': null,
      'episode_limit': null
    };
Map<String, dynamic> procurement() => {
      'version': 'CONTRACT_20261029',
      'mode': 'BUYOUT',
      'buyer_party_id': orgId,
      'upfront_minor': 5000000,
      'royalty_bps': 0,
      'sublicensing_allowed': true,
      'attribution_terms': '原作者署名',
      'rights_evidence': {
        'rights_chain_ids': [productId],
        'ownership_proof_ids': [productId],
        'original_creation_ids': [productId],
        'has_coauthors': false,
        'coauthor_consent_ids': []
      },
      'settlement_annex': null
    };
void main() {
  test('同单实际接口的许可、开发、上线及收益记录均能解析，缺项仍拒绝', () {
    final fixture = jsonDecode(
        File('test/licensing/rights_real_synthetic_records.json')
            .readAsStringSync()) as Map<String, dynamic>;
    final records = (fixture['records'] as List).cast<Map<String, dynamic>>();
    expect(records.map((r) => r['kind']).toSet(),
        containsAll(['GRANT', 'PROCUREMENT_EVENT', 'ROYALTY_STATEMENT']));
    for (final raw in records) {
      expect(LicenseRecord.parse(raw, fixture['party']).id, raw['id']);
    }
    for (final kind in ['PROCUREMENT_EVENT', 'ROYALTY_STATEMENT']) {
      final broken =
          jsonDecode(jsonEncode(records.firstWhere((r) => r['kind'] == kind)))
              as Map<String, dynamic>;
      broken['data'].remove('evidence_asset_ids');
      expect(() => LicenseRecord.parse(broken, fixture['party']),
          throwsA(anything));
    }
  });
  test('商用原单范围保留，未开始到期退款不提供下载', () {
    for (final period in ['future', 'expired', 'active']) {
      final raw = stockPurchase();
      final l = commercial();
      if (period == 'future') {
        l['valid_from'] = '2098-01-01T00:00:00.000Z';
      }
      if (period == 'expired') {
        l['valid_until'] = '2021-01-01T00:00:00.000Z';
      }
      raw['buyer_party_id'] = orgId;
      raw['data']['license'] = l;
      final p = StockPurchase(raw, orgId);
      expect(p.usable, period == 'active');
      expect(p.license.data['territory'], 'CN');
    }
    final refunded = stockPurchase(status: 'REVOKED');
    refunded['data']['license'] = commercial();
    expect(StockPurchase(refunded, personId).usable, false);
    expect(StockPurchase(stockPurchase(), personId).license.data['scope'],
        'PERSONAL_NONCOMMERCIAL');
  });
  test('排除项与具体商用授权一致，不扩大广告或发行', () {
    final l = commercial();
    expect(isStockTerms(l, snapshot: true), true);
    l['commercial_uses'] = ['COMMERCIAL_ADVERTISING'];
    expect(isStockTerms(l, snapshot: true), false);
    l['excluded'] =
        stockExclusions.where((x) => x != 'COMMERCIAL_ADVERTISING').toList();
    expect(isStockTerms(l, snapshot: true), true);
    l['commercial_uses'] = ['DISTRIBUTION'];
    expect(isStockTerms(l, snapshot: true), false);
  });
  test('版权选择一致，个人许可不能静默升级商业', () {
    final t = buyerCopyright();
    expect(isCopyrightTerms(t), true);
    t['personality_rights_retained'] = false;
    expect(isCopyrightTerms(t), false);
    final l = <String, dynamic>{
      ...buyerCopyright(),
      'mode': 'PRODUCER_OWNERSHIP_LICENSE',
      'buyout_price_included': false,
      'license': {
        'scope': 'PERSONAL_NONCOMMERCIAL',
        'territories': ['CN'],
        'purposes': ['COMMERCIAL'],
        'perpetual': true,
        'exclusive': false,
        'transferable': false,
        'sublicensable': false,
        'terms_text': '只有个人用途'
      }
    };
    expect(isCopyrightTerms(l), false);
    l['license']['purposes'] = ['PRIVATE'];
    expect(isCopyrightTerms(l), true);
  });
  test('永久买断可读，分红按日历年且旧许可不放宽', () {
    final terms = buyoutTerms();
    expect(LicenseTerms.parse(terms).developmentOpen, true);
    final r = licenseData('PRODUCT');
    r['data']['terms'] = terms;
    r['data']['procurement'] = procurement();
    r['data']['price'] = {'currency': 'CNY', 'amount_minor': 5000000};
    r['data']['payment_due_minor'] = 5000000;
    expect(LicenseRecord.parse(r, personId).terms!.data['project_limit'], null);
    r['data']['payment_due_minor'] = 1;
    expect(() => LicenseRecord.parse(r, personId), throwsA(anything));
    final share = {
      ...terms,
      'contract_kind': 'IP_REVENUE_SHARE_20261029',
      'valid_until': '2029-02-28T00:00:00.000Z',
      'development_until': '2026-02-28T00:00:00.000Z'
    };
    expect(isIPTerms(share), true);
    share['valid_until'] = '2029-03-01T00:00:00.000Z';
    expect(isIPTerms(share), false);
    terms.remove('contract_kind');
    expect(() => LicenseTerms.parse(terms), throwsA(anything));
  });
  test('完整权属与共同作者依据不能缺少', () {
    final p = procurement();
    expect(isProcurement(p), true);
    p['rights_evidence']['has_coauthors'] = true;
    expect(isProcurement(p), false);
    p['rights_evidence']['coauthor_consent_ids'] = [productId];
    expect(isProcurement(p), true);
    p['rights_evidence']['rights_chain_ids'] = [];
    expect(isProcurement(p), false);
  });
  testWidgets('窄屏权利展示和旧合同不出现null期限', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                child: Column(children: [
      CopyrightFacts(terms: buyerCopyright()),
      const CopyrightFacts(),
      ...stockRightsFacts(commercial()),
      licenseGrantTerms(LicenseTerms.parse(buyoutTerms()))
    ])))));
    expect(find.text('客户取得成片版权'), findsOneWidget);
    expect(find.textContaining('按原合同约定。历史记录'), findsOneWidget);
    expect(find.textContaining('品牌宣传'), findsOneWidget);
    expect(find.textContaining('null 个项目'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
