import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/gigs/gig_models.dart';
import 'package:jingjingshangri_app/gigs/gig_widgets.dart';
import 'package:jingjingshangri_app/trade/trade_models.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import '../trade/trade_api_test.dart' show buyerSession;
import 'gig_fixtures.dart';
import 'gig_widget_test.dart' show reveal;

Map<String, dynamic> fixture() => jsonDecode(
    File('test/gigs/commission_contract_http.json').readAsStringSync());
void main() {
  test('读取实际MySQL HTTP新版机构协议、商单提案及退款后佣金快照', () {
    for (final r in fixture()['records']) {
      GigRecord.parse(r);
    }
    GigRecord.parse(gigData('OFFER'));
  });
  test('新版关系比例不能接受超范围或未知版本', () {
    for (final v in [999, 3001]) {
      final r = gigData('RELATION');
      r['data']['v5_terms'] = {'version': 'V5', 'supply_share_bps': v};
      r['content_sha256'] = gigDigest(r['data']);
      expect(() => GigRecord.parse(r), throwsA(anything));
    }
    expect(() => gigSupplyTerms({'version': 'OTHER', 'supply_share_bps': 2000}),
        throwsA(anything));
  });
  test('实际报价和订单保留规则与双方关系快照，拒绝混入另一机构或自营模型', () {
    for (final r in fixture()['trade_records']) {
      TradeRecord.parse(r, r['buyer_party_id']);
    }
    for (final change in ['party', 'share', 'model']) {
      final r = fixture()['trade_records'].first as Map<String, dynamic>;
      final d = r['data'];
      if (change == 'party') {
        d['marketplace_finance']['allocation']['mcn_party_id'] = personId;
      } else if (change == 'share') {
        d['marketplace_finance']['allocation']['mcn_supply_bps'] = 1000;
      } else {
        d['customization_finance'] = {};
      }
      r['content_sha256'] = gigDigest(d);
      expect(() => TradeRecord.parse(r, r['buyer_party_id']), throwsA(anything));
    }
  });
  testWidgets('新商单条款展示供给收益基数，历史条款保留旧算法', (t) async {
    final r = fixture()['records'].firstWhere((r) => r['kind'] == 'OFFER');
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                child: gigCommissionFacts(
                    Map<String, dynamic>.from(r['data']['commission']),
                    marketplace: r['data']['marketplace_terms'])))));
    expect(find.text('机构占供给收益'), findsOneWidget);
    expect(find.text('20.00%'), findsOneWidget);
    expect(find.text('22.00%'), findsOneWidget);
    expect(find.textContaining('机构15.60元，艺人62.40元'), findsOneWidget);
    expect(find.textContaining('MCN 分成从平台费用中计提'), findsNothing);
    await t.pumpWidget(
        MaterialApp(home: Scaffold(body: gigCommissionFacts(commission()))));
    expect(find.textContaining('MCN 分成从平台费用中计提'), findsOneWidget);
    expect(find.text('机构占供给收益'), findsNothing);
    expect(t.takeException(), isNull);
  });
  testWidgets('机构表单从接口读取新规则，默认供给20%且不再输入旧平台和机构费率', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/catalogue')
            ? envelope({
                ...catalogue(),
                'marketplace_contract_policy': 'CONTRACT_20261029'
              })
            : a.defaultReply(r));
    final s = (await t.runAsync(() => buyerSession(a)))!;
    final mcn = identity(orgId);
    mcn['party']['capabilities'] = [
      {'code': 'MCN', 'current_status': 'ACTIVE'}
    ];
    s.select(mcn);
    await nav.openApp(t, s, route: '/gigs/relations/new');
    final share = find.widgetWithText(TextField, '机构占供给收益（%，10—30）');
    await reveal(t, share);
    expect(t.widget<TextField>(share).controller!.text, '20');
    expect(find.widgetWithText(TextField, '平台费用（%）'), findsNothing);
    expect(find.widgetWithText(TextField, 'MCN 分成（%）'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
