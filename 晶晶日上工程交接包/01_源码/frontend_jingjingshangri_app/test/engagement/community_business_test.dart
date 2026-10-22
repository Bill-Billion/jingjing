import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/engagement/community_support.dart';
import 'package:jingjingshangri_app/engagement/engagement_pages.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_fixtures.dart' as trade;
import 'community_safety_test.dart' show communitySession;

Future<void> frames(WidgetTester tester) async {
  await tester
      .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
  await tester.pumpAndSettle();
}

Future<void> open(WidgetTester tester, AccountSession s, String view) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(800, 2200);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
      value: s, child: MaterialApp(home: EngagementPage(view: view))));
  await frames(tester);
}

void select(WidgetTester tester, String label, String value) {
  final f = find.byWidgetPredicate((w) =>
      w is DropdownButtonFormField<String> && w.decoration.labelText == label);
  tester.widget<DropdownButtonFormField<String>>(f).onChanged!(value);
}

Map<String, dynamic> buyers() => {
      'city': '上海',
      'personal': [
        {
          'party_id': personId,
          'party_kind': 'PERSON',
          'consumption_growth': 100,
          'completed_orders': 2,
          'verified_net_paid_minor': 128001,
          'scout_active': true,
          'scout_level': 1,
          'compliance_clear': true,
          'facts_available': true
        }
      ],
      'organizations': <Object>[],
      'ranking_enabled': false,
      'reason_code': 'BUYER_RANK_RULE_NOT_CONFIGURED',
      'rule_id': invitationId,
      'source': 'VERIFIED_CONSUMPTION_ONLY',
      'organization_wallet_enabled': false
    };
void main() {
  testWidgets('未配置同城排名只显示分组名单，不把顺序写成名次；公开选择不默认同意', (tester) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path == '/api/v1/engagement/buyers'
            ? envelope(buyers())
            : a.defaultReply(r));
    final s = (await tester.runAsync(() => communitySession(a)))!;
    await open(tester, s, 'buyers');
    await tester.enterText(find.byType(TextField), '上海');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.tap(find.text('读取同城名单'));
    await frames(tester);
    expect(find.text('同城出品人'), findsOneWidget);
    expect(find.text('同城机构'), findsOneWidget);
    expect(find.textContaining('第1名'), findsNothing);
    expect(find.textContaining('展示顺序不代表名次'), findsOneWidget);
    expect(tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
        false);
    final request =
        a.requests.lastWhere((r) => r.path == '/api/v1/engagement/buyers');
    expect(request.headers.containsKey('X-Acting-Party'), false);
    expect(
        a.requests.where(
            (r) => r.method == 'POST' && r.path.contains('buyer-city-profile')),
        isEmpty);
  });
  testWidgets('真实原订单评价保留三个独立评分和原文，奖励关闭不阻断评价也不先开钱包', (tester) async {
    final o = trade.tradeData('ORDER', status: 'PAID');
    o['data']['financial'] = {
      'received_minor': 128001,
      'refunded_minor': 0,
      'net_minor': 128001
    };
    o['data']['quote']['customization'] = {
      'request_id': personId,
      'submission_id': invitationId,
      'content_sha256': 'a' * 64
    };
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/trade/records') {
        return envelope({
          'items': [o],
          'next_cursor': null
        });
      }
      if (r.path == '/api/v1/engagement/reviews') {
        final d = {
          ...Map<String, dynamic>.from(r.data as Map),
          'seller_party_id': orgId,
          'stars': 2,
          'media': false,
          'at': '2026-10-22T01:00:00.000Z',
          'free_points_awarded': 0
        };
        return envelope({
          'id': invitationId,
          'kind': 'ORDER_REVIEW',
          'owner_party_id': personId,
          'parent_id': trade.orderId,
          'object_version': 1,
          'current_status': 'PUBLISHED',
          'data': d,
          'content_sha256': communityDigest(d)
        });
      }
      return a.defaultReply(r);
    });
    final s = (await tester.runAsync(() => communitySession(a)))!;
    await open(tester, s, 'reviews');
    expect(find.textContaining('评价奖励尚未开放'), findsOneWidget);
    select(tester, '本人已付款原订单', trade.orderId);
    await tester.pump();
    select(tester, '真实感', '1');
    await tester.pump();
    select(tester, '契合度', '2');
    await tester.pump();
    select(tester, '完整度', '3');
    await tester.pump();
    await tester.enterText(find.byType(TextField), '这次的真实感、契合度和完整度分别评价。');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    await tester.ensureVisible(find.text('发布本次订单评价'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('发布本次订单评价'));
    await frames(tester);
    final r =
        a.requests.singleWhere((r) => r.path == '/api/v1/engagement/reviews');
    expect(r.data, {
      'order_id': trade.orderId,
      'realism': 1,
      'fit': 2,
      'completeness': 3,
      'body': '这次的真实感、契合度和完整度分别评价。',
      'media_asset_ids': <String>[]
    });
    expect(
        a.requests.where((r) => r.path.startsWith('/api/v1/wallet/')), isEmpty);
    expect(find.textContaining('本次评价已按原订单发布'), findsOneWidget);
  });
  testWidgets('曝光公开摘要只显示实际截止，缺开始时间明确说明，不编造生效日期', (tester) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/engagement/exposures') {
        return envelope({
          'items': [
            {
              'person_id': personId,
              'placement': '已审核资源位',
              'ends_at': '2030-01-01T00:00:00.000Z',
              'event_id': invitationId,
              'source': 'EARNED_REWARD_NOT_PAID_AD'
            }
          ]
        });
      }
      if (r.path == '/api/v1/engagement/rewards') {
        return envelope({'items': <Object>[]});
      }
      if (r.path == '/api/v1/artists/catalog') {
        return envelope({'items': <Object>[], 'next_cursor': null});
      }
      return a.defaultReply(r);
    });
    final s = (await tester.runAsync(() => communitySession(a)))!;
    await open(tester, s, 'exposures');
    await tester.enterText(find.byType(TextField), '上海');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.tap(find.text('读取当前生效曝光'));
    await frames(tester);
    expect(find.text('已审核资源位'), findsOneWidget);
    expect(find.textContaining('未提供开始日期'), findsOneWidget);
    expect(find.text('本人已登记曝光开始'), findsNothing);
  });
}
