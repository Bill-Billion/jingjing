import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/discovery/public_discovery.dart';
import 'package:jingjingshangri_app/engagement/ranking_explanation.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'public_discovery_test.dart' show cities;

final cases = (jsonDecode(
        File('../../../contracts/examples/platform.json').readAsStringSync())
    as Map)['cases'] as List;
void select(WidgetTester t, String label, String value) {
  final f = find.byWidgetPredicate((w) =>
      w is DropdownButtonFormField<String> && w.decoration.labelText == label);
  t.widget<DropdownButtonFormField<String>>(f).onChanged!(value);
}

Future<void> enter(WidgetTester t, String label, String value) async {
  final f = find.byWidgetPredicate(
      (w) => w is TextField && w.decoration?.labelText == label);
  await reveal(t, f);
  await t.enterText(f, value);
}

void main() {
  for (final kind in ['ARTIST', 'STOCK', 'AUDITION', 'NOTICE']) {
    testWidgets('$kind 条件匹配空页继续、命中理由、清条件仍可普通搜索', (t) async {
      final sample = Map<String, dynamic>.from(cases.firstWhere((c) =>
          c['schema'] == 'DiscoveryMatchesResponse' &&
          c['value']['data']['kind'] == kind &&
          (c['value']['data']['items'] as List).isNotEmpty)['value']['data']);
      late FakeAccountAdapter a;
      var reads = 0;
      a = FakeAccountAdapter(handler: (r) {
        if (r.path.endsWith('/cities')) return envelope(cities());
        if (r.path.endsWith('/search')) {
          return envelope({
            'kind': r.queryParameters['kind'],
            'city': null,
            'q': null,
            'items': [],
            'next_cursor': null
          });
        }
        if (r.path.endsWith('/matches')) {
          reads++;
          expect(r.headers.containsKey('X-Acting-Party'), false);
          for (final e in (sample['filters'] as Map).entries) {
            expect(r.queryParameters[e.key].toString(), e.value.toString());
          }
          return envelope({
            ...sample,
            'items': reads == 1 ? [] : sample['items'],
            'next_cursor': reads == 1 ? 'matched-next' : null
          });
        }
        return a.defaultReply(r);
      });
      final session = (await t.runAsync(() => buyerSession(a)))!;
      await host(t, session, const PublicSearchPage());
      select(t, '内容类型', kind);
      await frames(t);
      await reveal(t, find.byType(SwitchListTile));
      t.widget<SwitchListTile>(find.byType(SwitchListTile)).onChanged!(true);
      await t.pumpAndSettle();
      if (kind == 'ARTIST') {
        select(t, '最低星环', '1');
        await t.pumpAndSettle();
        await enter(t, '人物标签', 'synthetic');
      }
      if (kind == 'STOCK') {
        select(t, '许可用途', 'PERSONAL_NONCOMMERCIAL');
        await t.pumpAndSettle();
        await enter(t, '最高公开价格（元）', '1.00');
      }
      if (kind == 'AUDITION') {
        select(t, '试镜方式', 'OFFLINE');
        await t.pumpAndSettle();
        await enter(t, '最高公开价格（元）', '100');
      }
      if (kind == 'NOTICE') {
        select(t, '通告类型', 'RECRUITMENT');
        await t.pumpAndSettle();
      }
      await reveal(t, find.text('查找'));
      await t.tap(find.text('查找'));
      await frames(t);
      expect(find.text('本页暂未找到匹配项，可以继续查找。'), findsOneWidget);
      await reveal(t, find.text('继续查找'));
      await t.tap(find.text('继续查找'));
      await frames(t);
      expect(reads, 2);
      expect(find.text('符合原因'), findsOneWidget);
      expect(find.textContaining('当前公开且可用'), findsOneWidget);
      await enter(t, '关键词', '新条件');
      await t.pumpAndSettle();
      expect(find.text('符合原因'), findsNothing);
      expect(find.text('继续查找'), findsNothing);
      await reveal(t, find.byType(SwitchListTile));
      t.widget<SwitchListTile>(find.byType(SwitchListTile)).onChanged!(false);
      await t.pumpAndSettle();
      await reveal(t, find.text('查找'));
      await t.tap(find.text('查找'));
      await frames(t);
      expect(a.requests.last.path, '/api/v1/discovery/search');
      expect(t.takeException(), isNull);
    });
  }
  for (final c in cases
      .where((c) => c['schema'] == 'EngagementRankingExplanationResponse')) {
    testWidgets('榜单说明区分 ${c['value']['data']['formula_scope']}', (t) async {
      final d = Map<String, dynamic>.from(c['value']['data']);
      late FakeAccountAdapter a;
      a = FakeAccountAdapter(
          handler: (r) => r.path.endsWith('/explanation')
              ? envelope(d)
              : a.defaultReply(r));
      final s = (await t.runAsync(() => buyerSession(a)))!;
      await t.pumpWidget(MaterialApp(
          home: Scaffold(
              body: SingleChildScrollView(
                  child:
                      RankingExplanation(session: s, id: d['snapshot_id'])))));
      await t.tap(find.text('本期榜单依据与说明'));
      await t.pumpAndSettle();
      await t.tap(find.text('读取本期实际规则与公式说明'));
      await frames(t);
      expect(
          find.textContaining(d['formula_scope'] == 'RECORDED_VERSION'
              ? '本期记录了计算版本'
              : '不能证明旧榜当时使用了这些公式'),
          findsOneWidget);
      expect(t.takeException(), isNull);
    });
  }
}
