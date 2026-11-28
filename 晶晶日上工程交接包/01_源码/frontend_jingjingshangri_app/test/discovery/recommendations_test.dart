import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/discovery/public_discovery.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'public_discovery_test.dart' show cities;
import 'explicit_matching_test.dart' show cases, enter;

void main() {
  testWidgets('推荐与预算条件组合保持筛选，未开启偏好仍可读取', (t) async {
    final data = Map<String, dynamic>.from(cases.firstWhere((c) => c['schema'] == 'DiscoveryRecommendedMatchesResponse')['value']['data']);
    data['items'] = [for (final (i, row) in (data['items'] as List).indexed)
      {...Map<String, dynamic>.from(row), 'item': {
        ...Map<String, dynamic>.from(row['item']), 'title': 'Synthetic recommendation ${i + 1}'
      }}];
    late FakeAccountAdapter a;
    var reads = 0;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/cities')) return envelope(cities());
      if (r.path.endsWith('/search')) return envelope({'kind': r.queryParameters['kind'], 'city': null, 'q': null, 'items': [], 'next_cursor': null});
      if (r.path.endsWith('/recommended-matches')) {
        reads++;
        expect(r.queryParameters['kind'], 'STOCK');
        expect(r.queryParameters['max_price_minor'], 100);
        expect(r.headers.containsKey('X-Acting-Party'), false);
        return envelope(data);
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const PublicSearchPage());
    final video = find.widgetWithText(TextButton, '视频');
    await reveal(t, video);await t.tap(video.hitTestable());await frames(t);
    for (final name in ['参考我的浏览与交易排序', '按明确条件匹配']) {
      final mode = find.widgetWithText(SwitchListTile, name);
      await reveal(t, mode);await t.tap(mode.hitTestable());await frames(t);
    }
    await enter(t, '最高公开价格（元）', '1.00');
    final match = find.widgetWithText(FilledButton, '开始匹配');
    await reveal(t, match);await t.tap(match.hitTestable());await frames(t);
    expect(reads, 1);
    for (final row in data['items']) {
      final title = find.text(row['item']['title']);
      await reveal(t, title);
      expect(title.hitTestable(), findsOneWidget);
      expect(find.textContaining('公开价格在预算内'), findsWidgets);
    }
    final fallback = find.textContaining('当前个性化推荐已关闭');
    await reveal(t, fallback);
    expect(fallback, findsOneWidget);
    expect(t.takeException(), isNull);
  });
  test('推荐回应拒绝个性化定价与未知依据', () {
    final data = Map<String, dynamic>.from(cases.firstWhere((c) => c['schema'] == 'DiscoveryRecommendationsResponse' && c['value']['data']['kind'] == 'NOTICE' && c['value']['data']['personalized'] == true)['value']['data']);
    expect(() => validateDiscoveryRanking({...data, 'price_personalized': true}, matching: false), throwsException);
    expect(() => validateDiscoveryRanking({...data, 'items': [{'item': data['items'][0]['item'], 'reasons': ['SECRET_PROFILE']}]}, matching: false), throwsException);
  });
  for (final personalized in [false, true]) {
    testWidgets('推荐尊重服务器偏好 $personalized，旧排序失效清理并可回普通搜索', (t) async {
      final data = Map<String, dynamic>.from(cases.firstWhere((c) =>
          c['schema'] == 'DiscoveryRecommendationsResponse' &&
          c['value']['data']['kind'] == 'NOTICE' &&
          c['value']['data']['personalized'] == personalized)['value']['data']);
      late FakeAccountAdapter a;
      var reads = 0;
      a = FakeAccountAdapter(handler: (r) {
        if (r.path.endsWith('/cities')) return envelope(cities());
        if (r.path.endsWith('/search')) return envelope({'kind': r.queryParameters['kind'], 'city': null, 'q': null, 'items': [], 'next_cursor': null});
        if (r.path.endsWith('/recommendations')) {
          expect(r.method, 'GET');
          expect(r.headers.containsKey('X-Acting-Party'), false);
          expect(r.queryParameters['kind'], 'NOTICE');
          if (++reads == 2) return envelope({'code': 'RECOMMENDATION_CHANGED', 'message': 'changed'}, status: 409, error: true);
          return envelope({...data, 'next_cursor': 'original-ranking-cursor'});
        }
        return a.defaultReply(r);
      });
      final s = (await t.runAsync(() => buyerSession(a)))!;
      await host(t, s, const PublicSearchPage());
      final category = find.widgetWithText(TextButton, '通告');
      await reveal(t, category);await t.tap(category.hitTestable());await frames(t);
      final mode = find.widgetWithText(SwitchListTile, '参考我的浏览与交易排序');
      expect(mode, findsOneWidget);
      await reveal(t, mode);await t.tap(mode.hitTestable());await frames(t);
      final search = find.widgetWithText(FilledButton, '开始查找');
      await reveal(t, search);await t.tap(search.hitTestable());await frames(t);
      expect(reads, 1);
      expect(find.textContaining('排序依据：'), findsWidgets);
      expect(find.textContaining(personalized ? '当前使用已开启的个性化偏好' : '当前个性化推荐已关闭'), findsOneWidget);
      await reveal(t, find.text('继续查找'));await t.tap(find.text('继续查找'));await frames(t);
      expect(find.textContaining('排序依据：'), findsNothing);
      expect(find.text('继续查找'), findsNothing);
      await reveal(t, mode);await t.tap(mode.hitTestable());await frames(t);
      await reveal(t, search);await t.tap(search.hitTestable());await frames(t);
      expect(a.requests.last.path, '/api/v1/discovery/search');
      expect(a.requests.where((r) => r.method != 'GET' && r.path.startsWith('/api/v1/privacy/')), isEmpty);
      expect(t.takeException(), isNull);
    });
  }
}
