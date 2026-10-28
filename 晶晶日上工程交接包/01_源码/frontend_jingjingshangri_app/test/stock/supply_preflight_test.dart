import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/auditions/auditions_offer_form.dart';
import 'package:jingjingshangri_app/stock/stock_listing_form.dart';
import 'package:jingjingshangri_app/stock/v5_support.dart';
import '../account/fake_account_api.dart';
import '../artists/artists_fixtures.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import '../trade/trade_fixtures.dart';
import 'v5_test_host.dart';

Map<String, dynamic> publishedStockSpec() => {
      ...tradeData('QUOTE'),
      'id': specKey,
      'kind': 'SPEC',
      'buyer_party_id': null,
      'merchant_party_id': personId,
      'current_status': 'PUBLISHED',
      'data': {
        'title': '本人已发布现货规格',
        'unit_minor': 2900,
        'currency': 'CNY',
        'product_profile': {'version': 'V5', 'type': 'STOCK_VIDEO'},
        'specification': (quoteData()['lines'] as List).first['specification'],
      },
    };

Finder selector(String label) => find.byWidgetPredicate((w) =>
    w is DropdownButtonFormField<String> && w.decoration.labelText == label);

Future<void> choosePerson(WidgetTester t, String label) async {
  await reveal(t, selector(label));
  await t.tap(selector(label));
  await frames(t);
  await t.tap(find.text('本人测试艺人').last);
  await frames(t);
}

void main() {
  testWidgets('首次现货读取当前销售说明，不读历史作品推断规则；改变人数保护填写', (t) async {
    final a = artistAdapter(override: (r) {
      if (r.path == '/api/v1/stock/sales-publications' ||
          r.path == '/api/v1/stock/participant-options') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return null;
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, StockListingForm(session: s));
    await choosePerson(t, '卖方具体真人');
    final count = find.byType(DropdownButtonFormField<int>);
    await reveal(t, count);
    await t.tap(count);
    await frames(t);
    await t.tap(find.text('无可识别人物').last);
    await frames(t);
    final form = t.widget<V5Form>(find.byType(V5Form));
    expect(form.fields.firstWhere((f) => f.keyName == 'publication_id').choices,
        isEmpty);
    expect(form.canSubmit, false);
    final city = find.widgetWithText(TextField, '城市');
    await reveal(t, city);
    await t.enterText(city, '杭州');
    await reveal(t, count);
    await t.tap(count);
    await frames(t);
    await t.tap(find.text('1 位（逐人选择已审授权）').last);
    await frames(t);
    expect(find.text('更换当前选择？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    await reveal(t, city);
    expect(t.widget<TextField>(city).controller!.text, '杭州');
    expect(
        a.requests.where((r) => r.path == '/api/v1/stock/listings'), isEmpty);
    expect(t.takeException(), isNull);
  });

  testWidgets('首次试镜保留完整方案，但不会从旧 OFFER 引用规则', (t) async {
    final a = artistAdapter(override: (r) {
      if (r.path == '/api/v1/auditions/offer-options') {
        return envelope({'items': [], 'next_cursor': null});
      }
      if (r.path == '$artistRoot/people/$personKey') {
        return envelope(detailData()..['halo_level'] = 2);
      }
      return null;
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, AuditionOfferForm(session: s));
    await choosePerson(t, '选择具体真人');
    await reveal(t, find.byType(V5Form));
    final form = t.widget<V5Form>(find.byType(V5Form));
    expect(
        form.fields.firstWhere((f) => f.keyName == 'rule_id').choices, isEmpty);
    expect(form.canSubmit, false);
    final title = find.widgetWithText(TextField, '方案名称');
    await reveal(t, title);
    await t.enterText(title, '本人线上方案');
    await t.tap(find.byType(BackButton));
    await frames(t);
    expect(find.text('离开当前页面？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    expect(t.widget<TextField>(title).controller!.text, '本人线上方案');
    expect(
        a.requests.where((r) =>
            r.path == '/api/v1/auditions/records' ||
            r.method == 'POST' && r.path.startsWith('/api/v1/auditions/')),
        isEmpty);
    expect(a.requests.where((r) => r.path == '/api/v1/auditions/offer-options'),
        hasLength(2));
    expect(t.takeException(), isNull);
  });
}
