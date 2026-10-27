import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/account/account_theme.dart';
import 'package:jingjingshangri_app/artists/artists_public_media.dart';
import 'package:jingjingshangri_app/plaza/plaza_pages.dart';
import 'package:jingjingshangri_app/stock/stock_public_card.dart';
import '../account/fake_account_api.dart';
import '../stock/stock_test.dart' show stockOffer;
import '../stock/v5_test_host.dart' show frames, reveal;
import '../trade/trade_api_test.dart' show buyerSession;
import 'artists_public_media_test.dart' show portraitPng;
import 'plaza_data_test.dart' show plazaArtist, plazaNotice;

FakeAccountAdapter plazaAdapter({bool failedWorks = false}) {
  late FakeAccountAdapter adapter;
  adapter = FakeAccountAdapter(handler: (request) {
    if (request.path == '/api/v1/artists/catalog') {
      return envelope({
        'items': List.generate(
            8,
            (i) => plazaArtist(name: '公开艺人$i')
              ..['listing_id'] =
                  'a6666666-6666-4666-8666-${(i + 1).toString().padLeft(12, '0')}'),
        'next_cursor': null
      });
    }
    if (request.path.contains('/artists/catalog/') &&
        request.path.endsWith('/content')) {
      return ResponseBody.fromBytes(portraitPng, 200, headers: {
        'content-type': ['application/octet-stream']
      });
    }
    if (request.path == '/api/v1/stock/catalog') {
      return failedWorks
          ? envelope({'code': 'SERVICE_UNAVAILABLE'}, status: 503, error: true)
          : envelope({
              'items': List.generate(
                  6,
                  (i) => stockOffer()
                    ..['id'] =
                        'b1000000-0000-4000-8000-${(i + 1).toString().padLeft(12, '0')}'
                    ..['title'] = '公开作品$i'),
              'next_cursor': null
            });
    }
    if (request.path == '/api/v1/notices/catalog') {
      return envelope({
        'items': List.generate(6, (i) {
          final row = plazaNotice();
          row['id'] =
              'b2000000-0000-4000-8000-${(i + 1).toString().padLeft(12, '0')}';
          row['notice']['city'] = '郑州';
          row['notice']['title'] = '公开通告$i';
          return row;
        }),
        'next_cursor': null
      });
    }
    return adapter.defaultReply(request);
  });
  return adapter;
}

Future<void> host(WidgetTester t, AccountSession session,
    {Size size = const Size(390, 844),
    double scale = 1,
    Future<void> Function(String)? onOpen,
    ValueChanged<String>? onCity}) async {
  SharedPreferences.setMockInitialValues({});
  t.view.physicalSize = size;
  t.view.devicePixelRatio = 1;
  t.platformDispatcher.textScaleFactorTestValue = scale;
  addTearDown(t.view.reset);
  addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
  await t.pumpWidget(ChangeNotifierProvider.value(
      value: session,
      child: MaterialApp(
          theme: AccountTheme.data,
          home: Scaffold(
              body: PlazaPage(
                  session: session,
                  onOpen: onOpen ?? (_) async {},
                  onCityChanged: onCity ?? (_) {})))));
  await t
      .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
  await frames(t);
}

Future<void> selectChannel(WidgetTester t, int index) async {
  final scroll = t.state<ScrollableState>(find.byType(Scrollable).first);
  scroll.position.jumpTo(0);
  await t.pump();
  await t.tap(find.byKey(ValueKey('plaza-channel-$index')));
  await frames(t);
}

void main() {
  testWidgets('搜索按三类真实目录衔接，作品入口不限定城市', (t) async {
    final opened = <String>[];
    await t.pumpWidget(MaterialApp(
        theme: AccountTheme.plazaData,
        home: const PlazaSearchPage(initialCity: '郑州'),
        onGenerateRoute: (settings) {
          opened.add(settings.name!);
          return MaterialPageRoute<void>(
              builder: (_) => const Scaffold(body: Text('真实目录入口')));
        }));
    expect(find.text('入口'), findsNWidgets(3));
    expect(find.text('公开'), findsNothing);
    for (final entry in [
      ('找艺人', '/artists/catalog?city=%E9%83%91%E5%B7%9E'),
      ('找作品', '/stock/catalog'),
      ('找通告', '/notices/catalog?city=%E9%83%91%E5%B7%9E'),
    ]) {
      expect(t.getTopLeft(find.text(entry.$1)).dx, closeTo(82, .1));
      await t.tap(find.text(entry.$1));
      await frames(t);
      expect(opened.last, entry.$2);
      t.state<NavigatorState>(find.byType(Navigator)).pop();
      await frames(t);
    }
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('艺人频道复用正式筛选子页并发送真实标签及展示条件', (t) async {
    final adapter = plazaAdapter();
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await host(t, session);
    await selectChannel(t, 1);
    await t.tap(find.text('筛选'));
    await frames(t);
    expect(find.text('艺人筛选'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    await t.enterText(find.widgetWithText(TextField, '标签'), '配音');
    await reveal(t, find.text('只看已开放试镜展示的艺人'));
    await t.tap(find.text('只看已开放试镜展示的艺人'));
    await reveal(t, find.text('按条件查看艺人'));
    await t.tap(find.text('按条件查看艺人'));
    await frames(t);
    final request =
        adapter.requests.lastWhere((r) => r.path == '/api/v1/artists/catalog');
    expect(request.queryParameters['tag'], '配音');
    expect(request.queryParameters['audition'], 'true');
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('主页人物密度、唯一作品矩阵和四频道都使用真实目录', (t) async {
    final adapter = plazaAdapter();
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    final opened = <String>[];
    await host(t, session, onOpen: (route) async => opened.add(route));
    expect(find.text('明星推荐'), findsOneWidget);
    expect(find.text('暂无本城明星推荐'), findsOneWidget);
    expect(find.text('查看全部艺人 ↗'), findsNothing);
    expect(find.text('本地艺人'), findsOneWidget);
    expect(find.byType(ArtistPublicPortrait), findsNWidgets(8));
    expect(find.text('作品精选'), findsOneWidget);
    expect(find.byType(StockPublicCard), findsNWidgets(6));
    expect(find.text('本期精选'), findsNothing);
    expect(find.text('现成作品'), findsNothing);
    await selectChannel(t, 1);
    expect(find.byType(ArtistPublicPortrait), findsNWidgets(8));
    expect(find.byType(StockPublicCard), findsNothing);
    expect(find.text('试镜展示'), findsOneWidget);
    await selectChannel(t, 2);
    expect(find.byType(StockPublicCard), findsNWidgets(6));
    expect(find.byType(ArtistPublicPortrait), findsNothing);
    expect(find.text('作品按公开目录展示，面向全部城市。'), findsOneWidget);
    await reveal(t, find.byType(StockPublicCard).first);
    await t.tap(find.byType(StockPublicCard).first);
    await frames(t);
    expect(opened.single,
        '/stock/video?listingId=b1000000-0000-4000-8000-000000000001');
    await selectChannel(t, 3);
    expect(find.text('剧与角色'), findsOneWidget);
    expect(find.text('平台官方'), findsOneWidget);
    expect(find.text('公开通告5'), findsOneWidget);
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('选城使用已返回的真实查询值并保存手选，作品不随城市重读', (t) async {
    final adapter = plazaAdapter();
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    String? city;
    await host(t, session, onCity: (value) => city = value);
    final before =
        adapter.requests.where((r) => r.path == '/api/v1/stock/catalog').length;
    await t.tap(find.byKey(const ValueKey('plaza-city')));
    await frames(t);
    expect(find.byType(PlazaCityPage), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    await reveal(t, find.widgetWithText(OutlinedButton, '郑州'));
    await t.tap(find.widgetWithText(OutlinedButton, '郑州'));
    await t
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
    await frames(t);
    expect(city, '郑州');
    final cities = adapter.requests.where((r) => [
          '/api/v1/artists/catalog',
          '/api/v1/notices/catalog'
        ].contains(r.path));
    expect(
        cities.where((r) => r.queryParameters['city'] == '郑州'), hasLength(2));
    expect(adapter.requests.where((r) => r.path == '/api/v1/stock/catalog'),
        hasLength(before));
    expect(
        (await SharedPreferences.getInstance())
            .getString('plaza_manual_city_v1'),
        '郑州');
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('作品故障不遮住本地艺人和同城机会，错误不冒充空池', (t) async {
    final adapter = plazaAdapter(failedWorks: true);
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await host(t, session);
    expect(find.byType(ArtistPublicPortrait), findsNWidgets(8));
    expect(find.text('作品读取未完成'), findsOneWidget);
    expect(find.text('暂无公开作品'), findsNothing);
    expect(find.text('公开通告0'), findsOneWidget);
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('未登录四频道保留登录门而不读取受保护目录', (t) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await host(t, session);
    for (var i = 0; i < 4; i++) {
      await selectChannel(t, i);
      expect(find.text('登录后浏览'), findsOneWidget);
    }
    expect(adapter.requests, isEmpty);
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox.shrink());
  });

  for (final width in [320.0, 390.0]) {
    testWidgets('四频道${width.toInt()}宽及放大文字没有溢出', (t) async {
      final adapter = plazaAdapter();
      final session = (await t.runAsync(() => buyerSession(adapter)))!;
      await host(t, session, size: Size(width, 844), scale: 1.6);
      for (var i = 0; i < 4; i++) {
        await selectChannel(t, i);
        expect(t.takeException(), isNull, reason: 'channel $i');
      }
      await t.pumpWidget(const SizedBox.shrink());
    });
  }
}
