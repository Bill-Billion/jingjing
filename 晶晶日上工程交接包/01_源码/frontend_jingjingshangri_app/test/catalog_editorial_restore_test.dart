import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:jingjingshangri_app/artists/artists_pages.dart';
import 'package:jingjingshangri_app/auditions/auditions_pages.dart';
import 'package:jingjingshangri_app/notices/notices_pages.dart';
import 'package:jingjingshangri_app/production/production_models.dart';
import 'package:jingjingshangri_app/production/production_widgets.dart';
import 'package:jingjingshangri_app/trade/trade_models.dart';
import 'account/fake_account_api.dart';
import 'artists/artists_fixtures.dart';
import 'artists/artists_widgets_test.dart' as artists;
import 'auditions/auditions_fixtures.dart';
import 'notices/notices_test.dart' show noticeId, noticeData;
import 'production/production_fixtures.dart';
import 'stock/v5_test_host.dart' as v5;
import 'trade/trade_api_test.dart' show buyerSession;
import 'trade/trade_fixtures.dart';

Map<String, dynamic> publicListing() => {
      'listing_id': listingKey,
      'person_id': personKey,
      'avatar_id': avatarKey,
      'display_name': '当前公开艺人',
      'city': '杭州',
      'introduction': '已审核的公开介绍',
      'tags': ['都市', '悬疑'],
      'audition_public': true,
      'preview_asset_ids': [assetKey],
      'halo_level': 1,
    };

void main() {
  test('制作标题仅采用匹配原订单明细，不用设计示例名补齐', () {
    final project = ProductionRecord.parse(productionData('PROJECT'));
    expect(productionProjectTitle(project, null), '制作任务');
    expect(
        productionProjectTitle(
            project, TradeRecord.parse(tradeData('ORDER'), personId)),
        '私人短片制作');
  });

  testWidgets('制作阶段不会将历史版本确认画成当前已完成', (t) async {
    final raw = productionData('PROJECT', stage: 'FINAL', accepted: true);
    raw['data']['accepted']['FINAL'] = otherVersionId;
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body:
                productionProgressStep(ProductionRecord.parse(raw), 'FINAL'))));
    expect(find.text('当前版本待审阅'), findsOneWidget);
    expect(find.text('当前版本已确认'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('公开艺人详情沿用真实资料，预览撤权后不保留名称与简介', (t) async {
    var revoked = false;
    final adapter = artistAdapter(override: (request) {
      if (request.path == '$artistRoot/catalog') {
        return envelope({
          'items': [publicListing()],
          'next_cursor': null
        });
      }
      if (request.path == '$artistRoot/catalog/$listingKey') {
        return revoked
            ? envelope({'code': 'ARTIST_CONSENT_REQUIRED'},
                status: 409, error: true)
            : envelope(publicListing());
      }
      if (request.path == '$artistRoot/catalog/$listingKey/media') {
        return envelope(publicMediaData(primary: null));
      }
      if (request.path.endsWith('/assets/$assetKey/content')) {
        return revoked
            ? envelope({'code': 'ARTIST_CONSENT_REQUIRED'},
                status: 409, error: true)
            : ResponseBody.fromBytes([1, 2, 3], 200);
      }
      return null;
    });
    final session = (await t.runAsync(() => artistSession(adapter)))!;
    await artists.host(
        t, session, const ArtistCataloguePage(initialCity: '杭州'));
    expect(
        adapter.requests
            .lastWhere((r) => r.path == '$artistRoot/catalog')
            .queryParameters['city'],
        '杭州');
    await artists.press(t, find.text('当前公开艺人'));
    expect(t.widget<Text>(find.text('当前公开艺人')).style!.fontSize, 32);
    expect(find.text('当前公开艺人'), findsOneWidget);
    expect(
        adapter.requests.where((r) => r.path.endsWith('/content')).every((r) =>
            r.path ==
            '$artistRoot/catalog/$listingKey/assets/$assetKey/content'),
        isTrue);
    revoked = true;
    await artists.press(t, find.text('读取图片预览 1'));
    expect(find.text('当前公开艺人'), findsNothing);
    expect(find.text('已审核的公开介绍'), findsNothing);
    expect(find.text('这份公开资料当前不可用'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('数字人详情重新核对本人档案，退出后清空私人名称', (t) async {
    final adapter = artistAdapter();
    final session = (await t.runAsync(() => artistSession(adapter)))!;
    await artists.host(t, session, const ArtistPersonPage(personId: personKey));
    await artists.press(t, find.text('查看数字人档案'));
    expect(find.text('数字人详情'), findsOneWidget);
    expect(find.text('本人的测试数字人'), findsWidgets);
    expect(
        adapter.requests
            .where((r) => r.path == '$artistRoot/people/$personKey')
            .length,
        greaterThanOrEqualTo(2));
    expect(adapter.requests.where((r) => r.path.endsWith('/content')), isEmpty);
    await t.runAsync(() => session.logout());
    await t.pumpAndSettle();
    expect(find.text('本人的测试数字人'), findsNothing);
    expect(t.takeException(), isNull);
  });

  for (final domain in ['auditions', 'notices']) {
    testWidgets('$domain 嵌入主壳保留单一Scaffold并只加载一次城市目录', (t) async {
      final adapter = FakeAccountAdapter(handler: (request) {
        if (request.path == '/api/v1/$domain/catalog') {
          return envelope({
            'items': domain == 'auditions'
                ? [auditionPublic()]
                : [
                    {
                      'id': noticeId,
                      'owner_party_id': orgId,
                      'object_version': 1,
                      'rule_id': noticeId,
                      'notice': noticeData('DRAMA'),
                      'official': false,
                      'chat_enabled': false,
                    }
                  ],
            'next_cursor': null
          });
        }
        return FakeAccountAdapter().defaultReply(request);
      });
      final session = (await t.runAsync(() => buyerSession(adapter)))!;
      await v5.host(
          t,
          session,
          Scaffold(
              body: SingleChildScrollView(
                  child: domain == 'auditions'
                      ? const AuditionsPage(embedded: true, initialCity: '杭州')
                      : const NoticesPage(embedded: true, initialCity: '杭州'))));
      final requests =
          adapter.requests.where((r) => r.path == '/api/v1/$domain/catalog');
      expect(requests, hasLength(1));
      expect(requests.single.queryParameters['city'], '杭州');
      expect(find.byType(Scaffold), findsOneWidget);
      expect(find.byType(BackButton), findsNothing);
      expect(t.takeException(), isNull);
    });
  }
}
