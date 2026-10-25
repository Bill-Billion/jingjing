import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/engagement/engagement_pages.dart';
import 'package:jingjingshangri_app/redemption/redemption_pages.dart';
import 'package:jingjingshangri_app/stock/stock_pages.dart';
import 'package:jingjingshangri_app/wallet/wallet_pages.dart';
import '../wallet/wallet_fixtures.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import 'community_safety_test.dart' show communitySession;

void main() {
  for (final failed in [false, true]) {
    testWidgets('晶钻活动${failed ? '读取失败不冒充暂无开放' : '成功空返回显示关闭动作'}', (t) async {
      late FakeAccountAdapter a;
      a = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/redemption/pools') {
          return failed
              ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                  status: 503, error: true)
              : envelope({'items': <Object>[], 'next_cursor': null});
        }
        return a.defaultReply(r);
      });
      final s = (await t.runAsync(() => communitySession(a)))!;
      await host(t, s, const RedemptionPage(view: 'pools'));
      await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 40)));
      await frames(t);
      expect(find.text('暂无已审开放活动'), failed ? findsNothing : findsOneWidget);
      if (failed) {
        expect(find.textContaining('服务暂时不可用'), findsOneWidget);
      } else {
        await reveal(t, find.widgetWithText(FilledButton, '暂无开放活动'));
        expect(
            t
                .widget<FilledButton>(
                    find.widgetWithText(FilledButton, '暂无开放活动'))
                .onPressed,
            isNull);
      }
      expect(
          a.requests
              .where((r) => r.method == 'POST' && r.path.endsWith('/draws')),
          isEmpty);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('主页传入城市真实用于现货目录请求', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/stock/catalog') {
        return envelope({'items': <Object>[], 'next_cursor': null});
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const StockPage(city: '上海'));
    await t
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
    await frames(t);
    expect(
        a.requests
            .singleWhere((r) => r.path == '/api/v1/stock/catalog')
            .queryParameters['city'],
        '上海');
    expect(t.widget<TextField>(find.byType(TextField)).controller!.text, '上海');
    expect(t.takeException(), isNull);
  });

  for (final mode in ['points', 'scout']) {
    testWidgets('独立$mode页读取本人同一本真实账本且不混入消费余额', (t) async {
      late FakeAccountAdapter a;
      a = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/wallet/summary') {
          return envelope(walletSummary());
        }
        if (r.path == '/api/v1/wallet/rules') {
          return envelope({
            'items': [walletRule()]
          });
        }
        return a.defaultReply(r);
      });
      final s = (await t.runAsync(() => communitySession(a)))!;
      await host(t, s, WalletPage(mode: mode));
      await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 40)));
      await frames(t);
      expect(find.text(mode == 'points' ? '当前可用晶钻' : '合格消费成长'), findsOneWidget);
      expect(find.text(mode == 'points' ? '91' : '290'), findsOneWidget);
      expect(find.text('可消费余额'), findsNothing);
      if (mode == 'scout') {
        final progress = t
            .widgetList<LinearProgressIndicator>(
                find.byType(LinearProgressIndicator))
            .toList();
        expect(progress, hasLength(2));
        expect(progress.first.value, closeTo(290 / 10000, .00001));
        expect(progress.last.value, 0);
      }
      expect(
          a.requests.where(
              (r) => r.path.startsWith('/api/v1/wallet/') && r.method != 'GET'),
          isEmpty);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('星探规则编号不匹配时不画推测进度', (t) async {
    final otherRule = walletRule()..['id'] = personId;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/wallet/summary') return envelope(walletSummary());
      if (r.path == '/api/v1/wallet/rules') {
        return envelope({
          'items': [otherRule]
        });
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const WalletPage(mode: 'scout'));
    await t
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
    await frames(t);
    expect(find.byType(LinearProgressIndicator), findsNothing);
    expect(find.textContaining('当前未返回与本人账本对应的规则'), findsOneWidget);
    expect(find.text('290'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  for (final state in ['PUBLISHED_OPEN', 'PUBLISHED_CLOSED', 'IN_REVIEW']) {
    testWidgets('月冠军异议按钮遵守公示状态与截止时间：$state', (t) async {
      final now = DateTime.now().toUtc();
      late FakeAccountAdapter a;
      a = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/engagement/competitions/$invitationId') {
          return envelope({
            'id': invitationId,
            'title': '本期月冠军',
            'city': '上海',
            'status': state == 'IN_REVIEW' ? 'IN_REVIEW' : 'PUBLISHED',
            'starts_at':
                now.subtract(const Duration(days: 2)).toIso8601String(),
            'ends_at': now.subtract(const Duration(days: 1)).toIso8601String(),
            'appeal_until': now
                .add(Duration(days: state == 'PUBLISHED_CLOSED' ? -1 : 1))
                .toIso8601String(),
            'rules': {
              'vote_cost': 3,
              'daily_cap': 10,
              'tie_mode': 'MANUAL_REVIEW',
              'void_point_policy': 'HOLD_FOR_APPEAL',
              'ranking_bps': 3000,
              'vote_bps': 3000,
              'official_bps': 4000,
            },
            'candidates': <Object>[],
          });
        }
        if (r.path == '/api/v1/artists/catalog') {
          return envelope({'items': <Object>[], 'next_cursor': null});
        }
        if (r.path == '/api/v1/engagement/votes') {
          return envelope({
            'event_id': invitationId,
            'used_today': 0,
            'remaining_today': 10,
            'points_per_vote': 3,
            'items': <Object>[],
          });
        }
        return a.defaultReply(r);
      });
      final s = (await t.runAsync(() => communitySession(a)))!;
      await host(t, s,
          const EngagementPage(view: 'competition', recordId: invitationId));
      await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 40)));
      await frames(t);
      final button = find.widgetWithText(OutlinedButton, '提交本次活动异议');
      await reveal(t, button);
      expect(t.widget<OutlinedButton>(button).onPressed,
          state == 'PUBLISHED_OPEN' ? isNotNull : isNull);
      expect(t.takeException(), isNull);
    });
  }
}
