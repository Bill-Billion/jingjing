import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/auditions/auditions_pages.dart';
import 'package:jingjingshangri_app/notices/notices_pages.dart';
import 'package:jingjingshangri_app/stock/stock_pages.dart';
import '../account/fake_account_api.dart';
import 'community_safety_test.dart' show communitySession;
import '../stock/v5_test_host.dart';
import '../auditions/auditions_fixtures.dart';

void main() {
  for (final kind in ['auditions', 'notices', 'stock']) {
    testWidgets('$kind已开列表跟随换城，独立筛选保留并可恢复', (t) async {
      final city = ValueNotifier('郑州');
      addTearDown(city.dispose);
      final a = FakeAccountAdapter(handler: (r) {
        if (r.path.endsWith('/catalog'))
          return envelope({'items': [], 'next_cursor': null});
        return FakeAccountAdapter().defaultReply(r);
      });
      final s = (await t.runAsync(() => communitySession(a)))!;
      Widget page(String value) => kind == 'auditions'
          ? AuditionsPage(initialCity: value)
          : kind == 'notices'
              ? NoticesPage(initialCity: value)
              : StockPage(city: value);
      await host(
          t,
          s,
          ValueListenableBuilder<String>(
              valueListenable: city, builder: (_, value, child) => page(value)));
      final reads =
          () => a.requests.where((r) => r.path == '/api/v1/$kind/catalog');
      expect(reads().last.queryParameters['city'], '郑州');
      city.value = '北京';
      await frames(t);
      expect(reads().last.queryParameters['city'], '北京');
      final field = find.byWidgetPredicate((w) =>
          w is TextField &&
          (w.decoration?.labelText?.startsWith('城市') ?? false));
      await reveal(t, field);
      await t.enterText(field, '上海');
      await frames(t);
      final button = find.text(kind == 'auditions'
          ? '按城市查找'
          : kind == 'notices'
              ? '筛选通告'
              : '按城市读取');
      await reveal(t, button);
      await t.tap(button);
      await frames(t);
      expect(reads().last.queryParameters['city'], '上海');
      final count = reads().length;
      city.value = '深圳';
      await frames(t);
      expect(reads().length, count);
      expect(reads().last.queryParameters['city'], '上海');
      final restore = find.text('恢复跟随广场城市');
      await reveal(t, restore);
      await t.tap(restore);
      await frames(t);
      expect(reads().last.queryParameters['city'], '深圳');
      expect(find.textContaining('跟随广场城市'), findsOneWidget);
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('旧城市慢返回不能混进新城市结果', (t) async {
    final city = ValueNotifier('郑州');
    addTearDown(city.dispose);
    final delayed = Completer<ResponseBody>();
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/auditions/catalog') {
        if (r.queryParameters['city'] == '郑州') return delayed.future;
        return envelope({'items': [], 'next_cursor': null});
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(
        t,
        s,
        ValueListenableBuilder<String>(
            valueListenable: city,
            builder: (_, v, child) => AuditionsPage(initialCity: v)));
    city.value = '北京';
    await frames(t);
    delayed.complete(envelope({
      'items': [auditionPublic()],
      'next_cursor': null
    }));
    await frames(t);
    expect(find.text('试镜专用合成方案'), findsNothing);
    expect(find.textContaining('当前结果：北京'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
