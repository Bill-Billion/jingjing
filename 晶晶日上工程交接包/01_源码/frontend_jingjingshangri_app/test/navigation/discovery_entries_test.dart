import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/discovery/discovery_pages.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart' as v5;
import '../trade/trade_api_test.dart' show buyerSession;

Map<String, dynamic> buyers({bool include = true, String city = '上海'}) => {
      'city': city,
      'ranking_enabled': false,
      'organization_wallet_enabled': false,
      'source': 'VERIFIED_CONSUMPTION_ONLY',
      'organizations': [],
      'personal': [
        if (include)
          {
            'party_id': personId,
            'party_kind': 'PERSON',
            'completed_orders': 3,
            'verified_net_paid_minor': 1099,
            'facts_available': true,
            'scout_active': false,
            'scout_level': 0,
            'compliance_clear': true,
            'consumption_growth': 9,
          }
      ]
    };

Map<String, dynamic> publicNotice(String id,
        {String owner = personId, String city = '上海', String title = '公开招募'}) =>
    {
      'id': id,
      'owner_party_id': owner,
      'object_version': 1,
      'rule_id': invitedOrgId,
      'chat_enabled': false,
      'official': false,
      'notice': {
        'type': 'RECRUITMENT',
        'title': title,
        'description': '当前公开事项',
        'city': city,
        'valid_from': '2026-01-01T00:00:00Z',
        'valid_until': '2030-01-01T00:00:00Z',
        'accept_submissions': true,
        'project_id': null,
        'details': {'roles': '角色', 'requirements': '要求'}
      }
    };

void main() {
  test('查找仅传服务支持的条件，艺人标签不泄入其他目录', () {
    final artist = Uri.parse(discoveryDirectoryRoute(DiscoveryKind.artists,
        city: ' 上海 ', tag: ' 悬疑 '));
    expect(artist.path, '/artists/catalog');
    expect(artist.queryParameters, {'city': '上海', 'tag': '悬疑'});
    expect(
        Uri.parse(discoveryDirectoryRoute(DiscoveryKind.videos,
                city: '杭州', tag: '悬疑'))
            .queryParameters,
        {'city': '杭州'});
    expect(discoveryDirectoryRoute(DiscoveryKind.notices), '/notices/catalog');
  });

  test('公开主体只能来自当前同城名单，跨城或重复响应不展示', () {
    expect(
        currentPublicBuyer(buyers(), '上海', personId)?['completed_orders'], 3);
    expect(currentPublicBuyer(buyers(include: false), '上海', personId), isNull);
    expect(() => currentPublicBuyer(buyers(city: '杭州'), '上海', personId),
        throwsA(isA<AccountError>()));
    final duplicate = buyers();
    (duplicate['personal'] as List).add((duplicate['personal'] as List).first);
    expect(() => currentPublicBuyer(duplicate, '上海', personId),
        throwsA(isA<AccountError>()));
  });

  testWidgets('搜索别名保留城市并向服务端发送关键词，不捏造匹配率', (t) async {
    final adapter = FakeAccountAdapter();
    final active = (await t.runAsync(() => buyerSession(adapter)))!;
    await v5.host(t, active, const DiscoverySearchPage(initialCity: '上海'));
    expect(find.text('匹配 96%'), findsNothing);
    await v5.reveal(t, find.byType(TextField).last);
    await t.enterText(find.byType(TextField).last, '悬疑');
    await v5.reveal(t, find.text('查找'));
    await t.tap(find.text('查找'));
    await v5.frames(t);
    final request =
        adapter.requests.lastWhere((r) => r.path == '/api/v1/discovery/search');
    expect(request.queryParameters,
        {'kind': 'ARTIST', 'limit': 20, 'city': '上海', 'q': '悬疑'});
    expect(request.headers['X-Acting-Party'], isNull);
    expect(t.takeException(), isNull);
  });

  testWidgets('公开主体只读名单、不补私有姓名；重读撤回后清除资料', (t) async {
    var include = true;
    final adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/engagement/buyers') {
        return envelope(buyers(include: include));
      }
      if (r.path == '/api/v1/notices/catalog') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await v5.host(
        t, session, const PublicProducerPage(partyId: personId, city: '上海'));
    expect(find.text('¥10.99'), findsOneWidget);
    expect(find.text('周见川'), findsNothing);
    expect(find.text('我的个人身份'), findsNothing);
    expect(adapter.requests.where((r) => r.path.contains('/parties/$personId')),
        isEmpty);
    include = false;
    await v5.reveal(t, find.text('重新核对公开名单'));
    await t.tap(find.text('重新核对公开名单'));
    await v5.frames(t);
    expect(find.text('¥10.99'), findsNothing);
    expect(find.text('该主体目前不在这个城市的公开名单中。'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('出品人通告按主体和城市筛选，分页重核公开选择，分值只用真实规则', (t) async {
    var include = true;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/engagement/buyers') {
        final data = buyers(include: include);
        data['ranking_enabled'] = true;
        if (include) (data['personal'] as List).single['score'] = 63.25;
        return envelope(data);
      }
      if (r.path == '/api/v1/notices/catalog') {
        return envelope({
          'items': r.queryParameters['cursor'] == null
              ? [
                  publicNotice(invitationId, title: '本主体首条'),
                  publicNotice(invitedOrgId, owner: orgId, title: '别的主体'),
                  publicNotice(accountId, city: '杭州', title: '其他城市')
                ]
              : [publicNotice(orgId, title: '本主体下一条')],
          'next_cursor':
              r.queryParameters['cursor'] == null ? invitedOrgId : accountId
        });
      }
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await v5.host(
        t, session, const PublicProducerPage(partyId: personId, city: '上海'));
    expect(find.text('63.25'), findsOneWidget);
    await v5.reveal(t, find.text('继续读取本城通告'));
    expect(find.text('本主体首条'), findsOneWidget);
    expect(find.text('别的主体'), findsNothing);
    expect(find.text('其他城市'), findsNothing);
    await t.tap(find.text('继续读取本城通告'));
    await v5.frames(t);
    expect(find.text('本主体下一条'), findsOneWidget);
    final pages = adapter.requests
        .where((r) => r.path == '/api/v1/notices/catalog')
        .toList();
    expect(pages, hasLength(2));
    expect(pages.last.queryParameters['cursor'], invitedOrgId);
    expect(pages.every((r) => r.queryParameters['city'] == '上海'), isTrue);
    expect(
        pages.every((r) => !r.headers.containsKey('X-Acting-Party')), isTrue);
    include = false;
    await v5.reveal(t, find.text('继续读取本城通告'));
    await t.tap(find.text('继续读取本城通告'));
    await v5.frames(t);
    expect(find.text('本主体首条'), findsNothing);
    expect(find.text('本主体下一条'), findsNothing);
    expect(find.text('63.25'), findsNothing);
    expect(find.text('该主体目前不在这个城市的公开名单中。'), findsOneWidget);
    expect(adapter.requests.where((r) => r.path == '/api/v1/notices/catalog'),
        hasLength(2));
    expect(t.takeException(), isNull);
  });

  testWidgets('通告读取故障不显示成功空态，也不隐藏已核实的出品事实', (t) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/engagement/buyers') return envelope(buyers());
      if (r.path == '/api/v1/notices/catalog') {
        return envelope({'code': 'SERVICE_UNAVAILABLE'},
            status: 503, error: true);
      }
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await v5.host(
        t, session, const PublicProducerPage(partyId: personId, city: '上海'));
    expect(find.text('¥10.99'), findsOneWidget);
    await v5.reveal(t, find.text('重新核对公开名单与通告'));
    expect(find.text('当前已读取范围内没有该主体的公开通告。'), findsNothing);
    expect(find.text('重新核对公开名单与通告'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('分页时无法重新核对公开主体，清除旧资料且停止目录读取', (t) async {
    var unavailable = false;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/engagement/buyers') {
        return unavailable
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope(buyers());
      }
      if (r.path == '/api/v1/notices/catalog') {
        return envelope({
          'items': [publicNotice(invitationId, title: '旧公开通告')],
          'next_cursor': invitedOrgId
        });
      }
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await v5.host(
        t, session, const PublicProducerPage(partyId: personId, city: '上海'));
    await v5.reveal(t, find.text('继续读取本城通告'));
    expect(find.text('旧公开通告'), findsOneWidget);
    unavailable = true;
    await t.tap(find.text('继续读取本城通告'));
    await v5.frames(t);
    expect(find.text('旧公开通告'), findsNothing);
    expect(find.text('¥10.99'), findsNothing);
    expect(adapter.requests.where((r) => r.path == '/api/v1/notices/catalog'),
        hasLength(1));
    expect(t.takeException(), isNull);
  });
}
