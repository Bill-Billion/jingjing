import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/plaza/plaza_data.dart';
import '../account/fake_account_api.dart';
import '../artists/artists_fixtures.dart';
import '../notices/notices_test.dart' show noticeId, noticeData;
import '../stock/stock_test.dart' show stockOffer;
import '../trade/trade_api_test.dart' show buyerSession;

Map<String, dynamic> plazaArtist(
        {String name = '真实公开姓名', String city = '郑州'}) =>
    {
      'listing_id': listingKey,
      'person_id': personKey,
      'avatar_id': avatarKey,
      'display_name': name,
      'city': city,
      'introduction': '仅用接口已批准的资料',
      'tags': ['表演'],
      'audition_public': true,
      'preview_asset_ids': [assetKey],
      'halo_level': 1
    };

Map<String, dynamic> plazaNotice() => {
      'id': noticeId,
      'object_version': 1,
      'rule_id': noticeId,
      'chat_enabled': false,
      'official': false,
      'owner_party_id': orgId,
      'notice': noticeData('RECRUITMENT')
    };

void main() {
  test('销毁读取层后迟到的三个目录响应不修改状态或通知旧页面', () async {
    final pending = Completer<void>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (request) async {
      if (request.path == '/api/v1/artists/catalog') {
        await pending.future;
        return envelope({
          'items': [plazaArtist()],
          'next_cursor': null
        });
      }
      if (request.path == '/api/v1/stock/catalog') {
        await pending.future;
        return envelope({
          'items': [stockOffer()],
          'next_cursor': null
        });
      }
      if (request.path == '/api/v1/notices/catalog') {
        await pending.future;
        return envelope({
          'items': [plazaNotice()],
          'next_cursor': null
        });
      }
      return adapter.defaultReply(request);
    });
    final data = PlazaData(await buyerSession(adapter));
    var notifications = 0;
    data.addListener(() => notifications++);
    final loading = data.load();
    await Future<void>.delayed(Duration.zero);
    final beforeDisposal = notifications;
    data.dispose();
    pending.complete();
    await loading;
    expect(data.artists.items, isEmpty);
    expect(data.works.items, isEmpty);
    expect(data.notices.items, isEmpty);
    expect(notifications, beforeDisposal);
  });

  test('城市过滤后的空页保留下一页入口，不能误判全城没有艺人', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (request) {
      if (request.path == '/api/v1/artists/catalog') {
        return envelope(request.queryParameters['cursor'] == null
            ? {'items': [], 'next_cursor': recordKey}
            : {
                'items': [plazaArtist()],
                'next_cursor': null
              });
      }
      return adapter.defaultReply(request);
    });
    final data = PlazaData(await buyerSession(adapter), city: '郑州');
    await data.loadArtists();
    expect(data.artists.items, isEmpty);
    expect(data.artists.hasRead, isTrue);
    expect(data.artists.cursor, recordKey);
    await data.loadArtists(more: true);
    expect(data.artists.items.single['display_name'], '真实公开姓名');
    expect(adapter.requests.last.queryParameters['cursor'], recordKey);
    expect(data.artists.cursor, isNull);
    data.dispose();
  });

  test('匿名广场不读取需要登录的公开目录', () async {
    final adapter = FakeAccountAdapter();
    final data = PlazaData(AccountSession(api: adapter.createApi()));
    await data.load();
    expect(adapter.requests, isEmpty);
    expect(data.artists.hasRead, isFalse);
    expect(data.works.hasRead, isFalse);
    data.dispose();
  });

  test('三个目录分别读取，作品故障不遮住艺人和通告，查询保留真实城市值', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (request) {
      if (request.path == '/api/v1/artists/catalog') {
        return envelope({
          'items': [plazaArtist()],
          'next_cursor': null
        });
      }
      if (request.path == '/api/v1/stock/catalog') {
        return envelope({'code': 'SERVICE_UNAVAILABLE'},
            status: 503, error: true);
      }
      if (request.path == '/api/v1/notices/catalog') {
        return envelope({
          'items': [plazaNotice()],
          'next_cursor': null
        });
      }
      return adapter.defaultReply(request);
    });
    final session = await buyerSession(adapter);
    final data = PlazaData(session, city: '郑州');
    await data.load();
    expect(data.artists.items.single['display_name'], '真实公开姓名');
    expect(data.notices.items.single.id, noticeId);
    expect(data.works.items, isEmpty);
    expect(data.works.hasRead, isFalse);
    expect(data.works.failure?.status, 503);
    expect(data.works.error, isNotNull);
    final catalogues =
        adapter.requests.where((r) => r.path.endsWith('/catalog'));
    expect(catalogues, hasLength(3));
    expect(
        catalogues.every((r) => r.headers['X-Acting-Party'] == null), isTrue);
    expect(
        catalogues
            .singleWhere((r) => r.path.contains('/artists/'))
            .queryParameters['city'],
        '郑州');
    expect(
        catalogues
            .singleWhere((r) => r.path.contains('/notices/'))
            .queryParameters['city'],
        '郑州');
    expect(
        catalogues
            .singleWhere((r) => r.path.contains('/stock/'))
            .queryParameters
            .containsKey('city'),
        isFalse);
    expect(catalogues.every((r) => r.method == 'GET'), isTrue);
    data.dispose();
  });

  test('切换城市使旧慢响应失效，作品全国池不重复读取', () async {
    final first = Completer<void>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (request) async {
      if (request.path == '/api/v1/artists/catalog') {
        if (request.queryParameters['city'] == '郑州') await first.future;
        return envelope({
          'items': [plazaArtist(city: request.queryParameters['city'])],
          'next_cursor': null
        });
      }
      if (request.path == '/api/v1/stock/catalog') {
        return envelope({
          'items': [stockOffer()],
          'next_cursor': null
        });
      }
      if (request.path == '/api/v1/notices/catalog') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return adapter.defaultReply(request);
    });
    final data = PlazaData(await buyerSession(adapter), city: '郑州');
    final pending = data.load();
    await Future<void>.delayed(Duration.zero);
    await data.changeCity('郑州市');
    expect(data.artists.items.single['city'], '郑州市');
    first.complete();
    await pending;
    expect(data.artists.items.single['city'], '郑州市');
    expect(data.city, '郑州市');
    expect(adapter.requests.where((r) => r.path == '/api/v1/stock/catalog'),
        hasLength(1));
    data.dispose();
  });

  test('身份改变立即清空公开图文并拒绝旧响应，过滤器发送原标签和试镜条件', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (request) {
      if (request.path == '/api/v1/artists/catalog') {
        return envelope({
          'items': [plazaArtist()],
          'next_cursor': null
        });
      }
      return adapter.defaultReply(request);
    });
    final session = await buyerSession(adapter);
    final data = PlazaData(session);
    await data.filterArtists(tag: ' 配音 ', audition: true);
    expect(data.artists.items, hasLength(1));
    final sent = adapter.requests.last;
    expect(sent.queryParameters['tag'], '配音');
    expect(sent.queryParameters['audition'], 'true');
    session.select(identity(orgId));
    expect(data.artists.items, isEmpty);
    expect(data.works.items, isEmpty);
    expect(data.notices.items, isEmpty);
    expect(data.artists.hasRead, isFalse);
    data.dispose();
  });
}
