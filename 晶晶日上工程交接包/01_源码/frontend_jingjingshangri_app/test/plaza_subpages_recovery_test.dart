import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/artists/artists_pages.dart';
import 'package:jingjingshangri_app/notices/notices_pages.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';
import 'package:jingjingshangri_app/stock/stock_pages.dart';
import 'account/fake_account_api.dart';
import 'catalog_editorial_restore_test.dart' show publicListing;
import 'notices/notices_test.dart'
    show noticeId, noticeData, noticeRecord, submissionId;
import 'stock/stock_test.dart' show stockId, stockOffer;
import 'stock/v5_test_host.dart';
import 'trade/trade_api_test.dart' show buyerSession;

void main() {
  for (final domain in ['artists', 'stock', 'notices']) {
    testWidgets('$domain 空分页仍有游标时继续读取，不冒称全城无结果', (t) async {
      final path = '/api/v1/$domain/catalog';
      final adapter = FakeAccountAdapter(handler: (request) {
        if (request.path == path) {
          final next = request.queryParameters['cursor'] != null;
          return envelope({
            'items': !next
                ? []
                : [
                    if (domain == 'artists') publicListing(),
                    if (domain == 'stock') stockOffer(),
                    if (domain == 'notices')
                      {
                        'id': noticeId,
                        'owner_party_id': orgId,
                        'object_version': 1,
                        'rule_id': noticeId,
                        'notice': noticeData('DRAMA'),
                        'official': false,
                        'chat_enabled': false,
                      },
                  ],
            'next_cursor': next ? null : noticeId,
          });
        }
        if (request.path.endsWith('/content')) {
          return ResponseBody.fromBytes([1, 2, 3], 200);
        }
        return FakeAccountAdapter().defaultReply(request);
      });
      final session = (await t.runAsync(() => buyerSession(adapter)))!;
      final page = switch (domain) {
        'artists' => const ArtistCataloguePage(initialCity: '上海'),
        'stock' => const StockPage(city: '上海'),
        _ => const NoticesPage(initialCity: '上海'),
      };
      await host(t, session, page);
      final kind = {'artists': '艺人', 'stock': '作品', 'notices': '通告'}[domain]!;
      await reveal(t, find.text('本页没有符合条件的$kind，可继续读取下一页。'));
      final next = find.text(domain == 'artists' ? '加载更多公开艺人' : '继续读取下一页');
      await reveal(t, next);
      await t.tap(next);
      await frames(t);
      final title =
          {'artists': '当前公开艺人', 'stock': '合成现货作品', 'notices': '合成通告'}[domain]!;
      await reveal(t, find.text(title));
      expect(find.text(title), findsWidgets);
      expect(
          adapter.requests
              .where((r) => r.path == path)
              .last
              .queryParameters['cursor'],
          noticeId);
      expect(t.takeException(), isNull);
    });
  }

  final destinations = <String, Widget>{
    '/stock/video?listingId=$stockId':
        const StockPage(mode: 'video', id: stockId),
    '/stock/listing?listingId=$stockId&action=UNLIST':
        const StockPage(mode: 'listing', id: stockId, action: 'UNLIST'),
    '/stock/purchase?orderId=$stockId':
        const StockPage(mode: 'purchase', id: stockId),
    '/notices/public?noticeId=$noticeId':
        const NoticesPage(mode: 'public', id: noticeId),
    '/notices/record?recordId=$submissionId':
        const NoticesPage(mode: 'record', id: submissionId),
    '/notices/submit?noticeId=$noticeId&kind=ROLE':
        const NoticesPage(mode: 'submit', id: noticeId, kind: 'ROLE'),
  };
  for (final entry in destinations.entries) {
    testWidgets('登录返回保留具体页面和参数 ${entry.key}', (t) async {
      final session = AccountSession(api: FakeAccountAdapter().createApi());
      await host(t, session, entry.value);
      await reveal(t, find.text('前往账号与身份'));
      await t.tap(find.text('前往账号与身份'));
      await frames(t);
      expect(
          t.widget<LoginPage>(find.byType(LoginPage)).returnRoute, entry.key);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('艺人目录登录回到原城市和标签', (t) async {
    final session = AccountSession(api: FakeAccountAdapter().createApi());
    String? destination;
    await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: session,
        child: MaterialApp(
            home:
                const ArtistCataloguePage(initialCity: '上海', initialTag: '表演'),
            onGenerateRoute: (settings) {
              destination = settings.name;
              return MaterialPageRoute<void>(builder: (_) => const Scaffold());
            })));
    await frames(t);
    await reveal(t, find.text('前往账号与身份'));
    await t.tap(find.text('前往账号与身份'));
    await frames(t);
    final login = Uri.parse(destination!);
    expect(login.path, '/login');
    final original = Uri.parse(login.queryParameters['returnRoute']!);
    expect(original.path, '/artists/catalog');
    expect(original.queryParameters, {'city': '上海', 'tag': '表演'});
    expect(t.takeException(), isNull);
  });

  testWidgets('艺人筛选取消保留旧条件，确认才按新城市标签读取', (t) async {
    final adapter = FakeAccountAdapter(handler: (request) {
      if (request.path == '/api/v1/artists/catalog') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return FakeAccountAdapter().defaultReply(request);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await host(t, session,
        const ArtistCataloguePage(initialCity: '上海', initialTag: '表演'));
    final filters = find.byKey(const ValueKey('artist-catalog-filters'));
    await t.tap(filters);
    await frames(t);
    await t.enterText(find.widgetWithText(TextField, '城市'), '杭州');
    await t.tap(find.byType(BackButton));
    await frames(t);
    expect(find.text('上海 · 表演'), findsOneWidget);
    expect(adapter.requests.where((r) => r.path == '/api/v1/artists/catalog'),
        hasLength(1));
    await t.tap(filters);
    await frames(t);
    expect(
        t
            .widget<TextField>(find.widgetWithText(TextField, '城市'))
            .controller!
            .text,
        '上海');
    await t.enterText(find.widgetWithText(TextField, '城市'), '杭州');
    await t.enterText(find.widgetWithText(TextField, '标签'), '配音');
    await reveal(t, find.byType(CheckboxListTile));
    await t.tap(find.byType(CheckboxListTile));
    await reveal(t, find.text('按条件查看艺人'));
    await t.tap(find.text('按条件查看艺人'));
    await frames(t);
    final request =
        adapter.requests.lastWhere((r) => r.path == '/api/v1/artists/catalog');
    expect(request.queryParameters['city'], '杭州');
    expect(request.queryParameters['tag'], '配音');
    expect(request.queryParameters['audition'], 'true');
    expect(t.takeException(), isNull);
  });

  testWidgets('公开艺人详情在身份切换后不重显旧目录快照', (t) async {
    final adapter = FakeAccountAdapter(
        handler: (request) => request.path ==
                '/api/v1/artists/catalog/${publicListing()['listing_id']}'
            ? envelope(publicListing())
            : request.path.endsWith('/content')
                ? ResponseBody.fromBytes([1, 2, 3], 200)
                : FakeAccountAdapter().defaultReply(request));
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await host(
        t,
        session,
        Builder(
            builder: (context) => Scaffold(
                body: FilledButton(
                    onPressed: () => openArtistPublicDetails(context,
                        session: session, listing: publicListing()),
                    child: const Text('打开公开资料')))));
    await t.tap(find.text('打开公开资料'));
    await frames(t);
    expect(find.text('当前公开艺人'), findsOneWidget);
    session.select(identity(orgId));
    await frames(t);
    expect(find.text('当前公开艺人'), findsNothing);
    expect(find.text('已审核的公开介绍'), findsNothing);
    expect(find.text('账号或身份已变化，请返回艺人目录重新读取。'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  for (final mode in ['public', 'record']) {
    testWidgets('通告 $mode 重读失败清空旧详情及动作', (t) async {
      var failed = false;
      final id = mode == 'public' ? noticeId : submissionId;
      final path =
          '/api/v1/notices/${mode == 'public' ? 'catalog' : 'records'}/$id';
      final adapter = FakeAccountAdapter(handler: (request) {
        if (request.path == path) {
          if (failed) {
            return envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true);
          }
          return envelope(mode == 'public'
              ? {
                  'id': noticeId,
                  'owner_party_id': orgId,
                  'object_version': 1,
                  'rule_id': noticeId,
                  'notice': noticeData('DRAMA'),
                  'official': false,
                  'chat_enabled': false,
                }
              : noticeRecord());
        }
        return FakeAccountAdapter().defaultReply(request);
      });
      final session = (await t.runAsync(() => buyerSession(adapter)))!;
      await host(t, session, NoticesPage(mode: mode, id: id));
      final oldContent = mode == 'public' ? '合成通告' : '本次单向意向';
      expect(find.text(oldContent), findsWidgets);
      failed = true;
      await reveal(t, find.text('重新读取'));
      await t.tap(find.text('重新读取'));
      await frames(t);
      expect(find.text(oldContent), findsNothing);
      expect(find.text('提交个人资料'), findsNothing);
      expect(find.text('明确撤回本记录'), findsNothing);
      expect(
          adapter.requests.where((r) =>
              r.method == 'POST' && r.path.startsWith('/api/v1/notices/')),
          isEmpty);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('作品重读新报价后必须重新确认本版许可', (t) async {
    var changed = false;
    final adapter = FakeAccountAdapter(handler: (request) {
      if (request.path == '/api/v1/stock/catalog/$stockId') {
        return envelope({
          ...stockOffer(),
          if (changed) 'unit_minor': 3901,
          if (changed) 'object_version': 4,
          if (changed) 'offer_sha256': 'd' * 64,
        });
      }
      return FakeAccountAdapter().defaultReply(request);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await host(t, session, const StockPage(mode: 'video', id: stockId));
    final consent = find.byType(CheckboxListTile);
    await reveal(t, consent);
    await t.tap(consent);
    await frames(t);
    expect(t.widget<CheckboxListTile>(consent).value, isTrue);
    changed = true;
    await reveal(t, find.text('重新读取本页'));
    await t.tap(find.text('重新读取本页'));
    await frames(t);
    await reveal(t, consent);
    expect(t.widget<CheckboxListTile>(consent).value, isFalse);
    expect(
        adapter.requests.where((r) => r.path.endsWith('/checkout')), isEmpty);
    expect(t.takeException(), isNull);
  });

  testWidgets('购买确认遇到报价变化展示重核状态且不创建旧价订单', (t) async {
    var reads = 0;
    final adapter = FakeAccountAdapter(handler: (request) {
      if (request.path == '/api/v1/stock/catalog/$stockId') {
        reads++;
        return envelope({
          ...stockOffer(),
          if (reads > 1) 'offer_sha256': 'd' * 64,
        });
      }
      return FakeAccountAdapter().defaultReply(request);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await host(t, session, const StockPage(mode: 'video', id: stockId));
    await reveal(t, find.byType(CheckboxListTile));
    await t.tap(find.byType(CheckboxListTile));
    await reveal(t, find.text('确认本版购买并查看原订单'));
    await t.tap(find.text('确认本版购买并查看原订单'));
    await frames(t);
    await t.tap(find.text('确认办理'));
    await frames(t);
    await reveal(t, find.text('重新确认本版许可'));
    expect(find.text('合成现货作品'), findsNothing);
    await reveal(t, find.byType(CheckboxListTile));
    expect(t.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
        isFalse);
    expect(t.widget<CheckboxListTile>(find.byType(CheckboxListTile)).onChanged,
        isNull);
    expect(
        adapter.requests.where((r) => r.path.endsWith('/checkout')), isEmpty);
    expect(t.takeException(), isNull);
  });

  testWidgets('作品预览撤权清空报价和许可勾选，重读后须重新确认', (t) async {
    final adapter = FakeAccountAdapter(handler: (request) {
      if (request.path == '/api/v1/stock/catalog/$stockId') {
        return envelope(stockOffer());
      }
      if (request.path == '/api/v1/stock/catalog/$stockId/preview') {
        return envelope({'code': 'STOCK_RIGHTS_HOLD'},
            status: 409, error: true);
      }
      return FakeAccountAdapter().defaultReply(request);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await host(t, session, const StockPage(mode: 'video', id: stockId));
    final consent = find.byType(CheckboxListTile);
    await reveal(t, consent);
    await t.tap(consent);
    await frames(t);
    expect(t.widget<CheckboxListTile>(consent).value, isTrue);
    await reveal(t, find.text('读取已审预览'));
    await t.tap(find.text('读取已审预览'));
    await frames(t);
    expect(find.text('合成现货作品'), findsNothing);
    expect(find.byType(CheckboxListTile), findsNothing);
    expect(find.text('确认本版购买并查看原订单'), findsNothing);
    await reveal(t, find.text('重新读取本页'));
    await t.tap(find.text('重新读取本页'));
    await frames(t);
    expect(find.text('合成现货作品'), findsOneWidget);
    await reveal(t, consent);
    expect(t.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
        isFalse);
    expect(
        adapter.requests.where((r) => r.path.endsWith('/checkout')), isEmpty);
    expect(t.takeException(), isNull);
  });
}
