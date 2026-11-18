import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/discovery/public_discovery.dart';
import '../account/fake_account_api.dart';
import '../plaza/plaza_data_test.dart' show plazaArtist, plazaNotice;
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;

Map<String, dynamic> cities() => {
      'revision': 'quick-cities-v1',
      'scope': 'QUICK_CHOICES',
      'allows_custom_city': true,
      'items': [
        {
          'code': 'zhengzhou',
          'name': '郑州',
          'aliases': ['郑州市']
        }
      ]
    };
void main() {
  testWidgets('公开搜索空中间页仍可继续，修改条件立即清理旧游标', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/discovery/cities') return envelope(cities());
      if (r.path == '/api/v1/discovery/search') {
        return envelope({
          'kind': 'ARTIST',
          'city': null,
          'q': null,
          'items': r.queryParameters['cursor'] == null ? [] : [plazaArtist()],
          'next_cursor':
              r.queryParameters['cursor'] == null ? 'opaque-next' : null
        });
      }
      return a.defaultReply(r);
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const PublicSearchPage());
    expect(find.text('没有找到当前可公开的内容。'), findsNothing);
    await reveal(t, find.text('继续查找'));
    await t.tap(find.text('继续查找'));
    await frames(t);
    expect(
        a.requests
            .where((r) => r.path.endsWith('/search'))
            .last
            .queryParameters['cursor'],
        'opaque-next');
    expect(find.text('真实公开姓名'), findsOneWidget);
    await reveal(t, find.byType(TextField).last);
    await t.enterText(find.byType(TextField).last, '新关键词');
    await frames(t);
    expect(find.text('真实公开姓名'), findsNothing);
    expect(find.text('继续查找'), findsNothing);
    final requests =
        a.requests.where((r) => r.path.startsWith('/api/v1/discovery/'));
    expect(requests.every((r) => r.headers['X-Acting-Party'] == null), isTrue);
  });
  testWidgets('输入新关键词使迟到搜索结果失效', (t) async {
    final delayed = Completer<void>();
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) async {
      if (r.path.endsWith('/discovery/cities')) return envelope(cities());
      if (r.path.endsWith('/discovery/search')) {
        await delayed.future;
        return envelope({
          'kind': 'ARTIST',
          'city': null,
          'q': null,
          'items': [plazaArtist(name: '迟到旧结果')],
          'next_cursor': null
        });
      }
      return a.defaultReply(r);
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const PublicSearchPage());
    await t.enterText(find.byType(TextField).last, '现在的条件');
    delayed.complete();
    await frames(t);
    expect(find.text('迟到旧结果'), findsNothing);
    expect(t.takeException(), isNull);
  });
  test('公开详情路由保留正确的领域编号', () {
    expect(publicContentRoute('STOCK', personId),
        '/stock/video?listingId=$personId');
    expect(publicContentRoute('ARTIST', personId),
        '/artists/public?listingId=$personId');
    expect(() => publicContentRoute('ARTIST', 'not-an-id'), throwsException);
    expect(
        () => validatePublicPage({'items': [], 'next_cursor': 'same'},
            previous: 'same'),
        throwsException);
  });
  testWidgets('机构通告使用服务端发布方过滤，刷新时丢弃上一页迟到结果', (t) async {
    final oldPage = Completer<void>();
    var refreshed = false;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) async {
      if (r.path == '/api/v1/directory/organizations/$orgId') {
        return envelope({
          'record_id': orgId,
          'object_version': 1,
          'party_id': orgId,
          'display_name': '公开机构',
          'introduction': '已审介绍',
          'city': '郑州',
          'verified_capabilities': [],
          'cover': null
        });
      }
      if (r.path == '/api/v1/notices/catalog') {
        if (r.queryParameters['cursor'] != null) {
          await oldPage.future;
          final row = plazaNotice();
          row['notice']['title'] = '迟到的旧通告';
          return envelope({
            'items': [row],
            'next_cursor': null
          });
        }
        final row = plazaNotice();
        row['notice']['title'] = refreshed ? '刷新后通告' : '初始通告';
        return envelope({
          'items': [row],
          'next_cursor': refreshed ? null : personId
        });
      }
      return a.defaultReply(r);
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const PublicDirectoryPage(partyId: orgId));
    final first =
        a.requests.lastWhere((r) => r.path == '/api/v1/notices/catalog');
    expect(first.queryParameters['publisher_party_id'], orgId);
    expect(first.queryParameters.containsKey('city'), isFalse);
    await reveal(t, find.text('继续读取机构通告'));
    await t.tap(find.text('继续读取机构通告'));
    await frames(t);
    refreshed = true;
    await reveal(t, find.text('刷新当前公开资料'));
    await t.tap(find.text('刷新当前公开资料'));
    await frames(t);
    oldPage.complete();
    await frames(t);
    expect(find.text('迟到的旧通告'), findsNothing);
    expect(find.text('刷新后通告'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('机构撤回只清除当前公开资料，不锁住精选和搜索', (t) async {
    var withdrawn = false;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/directory/organizations/$orgId') {
        if (withdrawn) {
          return envelope({'code': 'DIRECTORY_NOT_FOUND'},
              status: 404, error: true);
        }
        return envelope({
          'record_id': orgId,
          'object_version': 1,
          'party_id': orgId,
          'display_name': '即将撤回的机构',
          'introduction': '已审核介绍',
          'city': '郑州',
          'verified_capabilities': [],
          'cover': null
        });
      }
      if (r.path == '/api/v1/notices/catalog') {
        return envelope({
          'items': [plazaNotice()],
          'next_cursor': null
        });
      }
      if (r.path == '/api/v1/directory/featured-artists') {
        return envelope({
          'items': [
            {
              'record_id': personId,
              'object_version': 1,
              'selection_kind': 'EDITORIAL_SELECTION',
              'recommendation': '当前推荐',
              'artist': plazaArtist(name: '仍可见的精选艺人')
            }
          ],
          'next_cursor': null
        });
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!, epoch = s.epoch;
    await host(t, s, const PublicDirectoryPage(partyId: orgId));
    expect(find.text('即将撤回的机构'), findsOneWidget);
    withdrawn = true;
    await reveal(t, find.text('刷新当前公开资料'));
    await t.tap(find.text('刷新当前公开资料'));
    await frames(t);
    expect(find.text('即将撤回的机构'), findsNothing);
    expect(find.text('这份机构公开资料已撤回或暂不可查看，请返回目录刷新。'), findsOneWidget);
    expect(s.epoch, epoch);
    expect(s.isDomainDenied('/api/v1/directory/'), isFalse);
    await host(t, s, const PublicDirectoryPage(featured: true));
    await reveal(t, find.text('仍可见的精选艺人'));
    expect(find.text('仍可见的精选艺人'), findsOneWidget);
    await host(t, s, const PublicSearchPage());
    expect(a.requests.where((r) => r.path == '/api/v1/discovery/search'),
        isNotEmpty);
    expect(t.takeException(), isNull);
  });
  test('公开主图404只清理图片，私人资料404仍触发领域权限保护', () async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/cover')) {
        return envelope({'code': 'DIRECTORY_COVER_NOT_FOUND'},
            status: 404, error: true);
      }
      if (r.path == '/api/v1/directory/records/$orgId') {
        return envelope({'code': 'DIRECTORY_NOT_FOUND'},
            status: 404, error: true);
      }
      return a.defaultReply(r);
    });
    final s = await buyerSession(a), epoch = s.epoch;
    await expectLater(
        s.readBytes('/api/v1/directory/organizations/$orgId/cover'),
        throwsA(isA<AccountError>()));
    expect(s.epoch, epoch);
    expect(s.isDomainDenied('/api/v1/directory/'), isFalse);
    await expectLater(
        s.read('/api/v1/directory/records/$orgId', actingParty: orgId),
        throwsA(isA<AccountError>()));
    expect(s.isDomainDenied('/api/v1/directory/'), isTrue);
  });
}
