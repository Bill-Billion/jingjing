import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/artists/artists_pages.dart';
import 'package:jingjingshangri_app/artists/artists_public_media.dart';
import 'package:jingjingshangri_app/notices/notices_pages.dart';
import 'package:jingjingshangri_app/notices/notices_api.dart';
import 'package:jingjingshangri_app/stock/v5_support.dart';
import 'package:jingjingshangri_app/stock/stock_pages.dart';
import 'package:jingjingshangri_app/stock/stock_public_card.dart';
import 'package:jingjingshangri_app/stock/stock_public_media.dart';
import 'account/fake_account_api.dart';
import 'artists/artists_fixtures.dart' show publicMediaData;
import 'catalog_editorial_restore_test.dart' show publicListing;
import 'notices/notices_test.dart' show noticeId, noticeData;
import 'stock/stock_test.dart' show stockOffer;
import 'stock/v5_test_host.dart' show frames, reveal;
import 'trade/trade_api_test.dart' show buyerSession;

Future<void> layoutHost(WidgetTester t, AccountSession session, Widget page,
    double width, double scale) async {
  t.view.physicalSize = Size(width, 844);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.reset);
  await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
      value: session,
      child: MaterialApp(
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(scale)),
              child: child!),
          home: page)));
  await frames(t);
}

void main() {
  testWidgets('公开详情为32px紧凑肖像并按真实城市进入有效试镜目录', (t) async {
    final adapter = FakeAccountAdapter(
        handler: (request) => request.path ==
                '/api/v1/artists/catalog/${publicListing()['listing_id']}'
            ? envelope(publicListing())
            : request.path.endsWith('/media')
                ? envelope(publicMediaData(primary: null))
                : request.path.endsWith('/content')
                    ? ResponseBody.fromBytes([1, 2, 3], 200)
                    : FakeAccountAdapter().defaultReply(request));
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    String? destination;
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: session,
        child: MaterialApp(
            onGenerateRoute: (settings) {
              destination = settings.name;
              return MaterialPageRoute<void>(
                  builder: (_) => const Scaffold(body: Text('试镜目录入口')));
            },
            home: Builder(
                builder: (context) => Scaffold(
                    body: TextButton(
                        onPressed: () => openArtistPublicDetails(context,
                            session: session, listing: publicListing()),
                        child: const Text('公开详情入口')))))));
    await t.tap(find.text('公开详情入口'));
    await frames(t);
    final name = t.widget<Text>(find.text('当前公开艺人'));
    expect(name.style!.fontSize, 32);
    expect(name.style!.fontWeight, FontWeight.w900);
    expect(
        t.getSize(find.byKey(const ValueKey('artist-public-portrait'))).height,
        228);
    await reveal(t, find.text('查看公开试镜方案'));
    await t.tap(find.text('查看公开试镜方案'));
    await frames(t);
    final route = Uri.parse(destination!);
    expect(route.path, '/auditions/catalog');
    expect(route.queryParameters, {'city': '杭州'});
    expect(find.text('试镜目录入口'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('长授权在320宽可展开完整内容，不改变或提交授权引用', (t) async {
    final adapter = FakeAccountAdapter();
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    final api = NoticesApi(session);
    final full = '完整数字人名称与本次明确接收方合作投稿授权；必须核对全部条件，不用省略号代替授权事实。' * 3 +
        '\n用途：合作投稿\n有效期：2026-10-22 至 2027-10-22\n接收通告：本次具体招募';
    await layoutHost(
        t,
        session,
        V5Frame(api: api, plaza: true, title: '本次授权', children: [
          V5Form(
              api: api,
              title: '只读样式检查',
              action: '提交',
              suffix: '/submissions',
              canSubmit: false,
              initial: {'consent_id': noticeId},
              fields: [
                V5Field('consent_id', '本次已审授权',
                    choices: {noticeId: full}, wrapChoices: true)
              ],
              buildBody: (values) => {},
              parse: (_) {})
        ]),
        320,
        1);
    final details = find.byKey(const ValueKey('v5-choice-detail-consent_id'));
    await reveal(t, details);
    await t.tap(find.text('查看完整选中内容'));
    await frames(t);
    final complete = find.byWidgetPredicate(
        (widget) => widget is SelectableText && widget.data == full);
    expect(complete, findsOneWidget);
    expect(t.getSize(complete).height, greaterThan(42));
    expect(
        adapter.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('/api/v1/notices/')),
        isEmpty);
    expect(t.takeException(), isNull);
  });

  testWidgets('公开筛选按钮实际表面44高，许可框在文字左侧', (t) async {
    final adapter = FakeAccountAdapter(handler: (request) {
      if (request.path == '/api/v1/artists/catalog') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return FakeAccountAdapter().defaultReply(request);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await layoutHost(
        t, session, const ArtistCataloguePage(initialCity: '上海'), 390, 1);
    await t.tap(find.byKey(const ValueKey('artist-catalog-filters')));
    await frames(t);
    final checkbox = find.byType(Checkbox);
    final label = find.text('只看已开放试镜展示的艺人');
    expect(t.getTopLeft(checkbox).dx, lessThan(t.getTopLeft(label).dx));
    await reveal(t, find.text('按条件查看艺人'));
    final button = find.ancestor(
        of: find.text('按条件查看艺人'), matching: find.byType(FilledButton));
    final material =
        find.descendant(of: button, matching: find.byType(Material));
    expect(t.getSize(material).height, 44);
    expect(t.takeException(), isNull);
  });

  for (final width in [320.0, 390.0]) {
    for (final scale in [1.0, 1.6]) {
      testWidgets('艺人小肖像在宽${width.toInt()}和字号$scale下可比较且不溢出', (t) async {
        final adapter = FakeAccountAdapter(handler: (request) {
          if (request.path == '/api/v1/artists/catalog') {
            return envelope({
              'items': List.generate(
                  8,
                  (index) => {
                        ...publicListing(),
                        'listing_id':
                            'a6666666-6666-4666-8666-${(index + 1).toString().padLeft(12, '0')}',
                        'display_name': '艺人${index + 1}',
                      }),
              'next_cursor': null,
            });
          }
          if (request.path.endsWith('/content')) {
            return ResponseBody.fromBytes([1, 2, 3], 200);
          }
          return FakeAccountAdapter().defaultReply(request);
        });
        final session = (await t.runAsync(() => buyerSession(adapter)))!;
        await layoutHost(t, session,
            const ArtistCataloguePage(initialCity: '上海'), width, scale);
        final portraits = find.byType(ArtistPublicPortrait);
        expect(portraits, findsNWidgets(8));
        final first = t.getTopLeft(portraits.at(0));
        final second = t.getTopLeft(portraits.at(1));
        final third = t.getTopLeft(portraits.at(2));
        expect(second.dy, closeTo(first.dy, .1));
        if (scale == 1) {
          expect(third.dy, closeTo(first.dy, .1));
        } else {
          expect(third.dy, greaterThan(first.dy));
        }
        expect(find.text('读取这份获准预览'), findsNothing);
        expect(t.takeException(), isNull);
      });

      testWidgets('作品小横框在宽${width.toInt()}和字号$scale下保持可读', (t) async {
        final adapter = FakeAccountAdapter(handler: (request) {
          if (request.path == '/api/v1/stock/catalog') {
            return envelope({
              'items': List.generate(
                  6,
                  (index) => {
                        ...stockOffer(),
                        'id':
                            'b1000000-0000-4000-8000-${(index + 1).toString().padLeft(12, '0')}',
                        'title': '作品${index + 1}',
                      }),
              'next_cursor': null,
            });
          }
          return FakeAccountAdapter().defaultReply(request);
        });
        final session = (await t.runAsync(() => buyerSession(adapter)))!;
        await layoutHost(t, session, const StockPage(city: '上海'), width, scale);
        final cards = find.byType(StockPublicCard);
        expect(cards, findsNWidgets(6));
        final first = t.getTopLeft(cards.at(0));
        final second = t.getTopLeft(cards.at(1));
        if (scale == 1) {
          expect(second.dy, closeTo(first.dy, .1));
        } else {
          expect(second.dy, greaterThan(first.dy));
        }
        expect(find.byType(StockPublicMediaView), findsNWidgets(6));
        expect(find.text('封面待提供'), findsNothing);
        expect(t.takeException(), isNull);
      });
    }
  }

  testWidgets('通告六类可见且首条与后续保持紧凑列表', (t) async {
    final adapter = FakeAccountAdapter(handler: (request) {
      if (request.path == '/api/v1/notices/catalog') {
        return envelope({
          'items': [
            {
              'id': noticeId,
              'owner_party_id': orgId,
              'object_version': 1,
              'rule_id': noticeId,
              'notice': {
                ...noticeData('RECRUITMENT'),
                'title': '这是一份可以完整换行查看的较长公开招募标题'
              },
              'official': false,
              'chat_enabled': false,
            }
          ],
          'next_cursor': null,
        });
      }
      return FakeAccountAdapter().defaultReply(request);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await layoutHost(
        t, session, const NoticesPage(initialCity: '上海'), 320, 1.6);
    for (final label in ['全部', '剧与角色', '商演', '商单', '活动', '招募', '平台官方']) {
      expect(find.widgetWithText(OutlinedButton, label), findsOneWidget);
    }
    expect(find.text('未提供通告封面'), findsNothing);
    await t.tap(find.widgetWithText(OutlinedButton, '活动'));
    await frames(t);
    expect(
        adapter.requests
            .lastWhere((r) => r.path == '/api/v1/notices/catalog')
            .queryParameters['type'],
        'EVENT');
    expect(t.takeException(), isNull);
  });
}
