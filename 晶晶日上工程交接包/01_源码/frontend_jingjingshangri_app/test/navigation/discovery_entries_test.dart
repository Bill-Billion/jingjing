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

  testWidgets('查找不捏造匹配结果，跳转传入实际条件', (t) async {
    String? opened;
    await t.pumpWidget(MaterialApp(
        onGenerateRoute: (settings) {
          opened = settings.name;
          return MaterialPageRoute<void>(
              builder: (_) => const Scaffold(body: Text('真实目录')));
        },
        home: const DiscoverySearchPage(initialCity: '上海')));
    expect(find.text('林知夏'), findsNothing);
    expect(find.text('匹配 96%'), findsNothing);
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '智能匹配尚未开放'))
            .onPressed,
        isNull);
    await t.enterText(find.byKey(const ValueKey('discovery-tag')), '悬疑');
    await v5.reveal(t, find.text('查看所选目录'));
    await t.tap(find.text('查看所选目录'));
    await t.pumpAndSettle();
    expect(Uri.parse(opened!).queryParameters, {'city': '上海', 'tag': '悬疑'});
    expect(t.takeException(), isNull);
  });

  testWidgets('公开主体只读名单、不补私有姓名；重读撤回后清除资料', (t) async {
    var include = true;
    final adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/engagement/buyers') {
        return envelope(buyers(include: include));
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
}
