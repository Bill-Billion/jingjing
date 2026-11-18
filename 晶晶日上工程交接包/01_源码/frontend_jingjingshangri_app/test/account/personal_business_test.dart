import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/account/business_library.dart';
import 'package:jingjingshangri_app/account/personal_business.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'fake_account_api.dart';
import 'personal_business_fixtures.dart';
import '../navigation/app_navigation_test.dart' as nav;
import '../projects/project_fixtures.dart';
import 'package:jingjingshangri_app/projects/participation_pages.dart';
import 'package:jingjingshangri_app/projects/project_pages.dart';

Finder sourceCard(String source) =>
    find.byKey(ValueKey('business-source:$source'));
Future<void> pressSource(WidgetTester t, String source, String text) async {
  final button =
      find.descendant(of: sourceCard(source), matching: find.text(text));
  await reveal(t, button);
  await t.tap(button);
  await frames(t);
}

void main() {
  for (final entry in const {
    'PARTICIPATION_CONTRACTS': 'PARTICIPATION',
    'INCOME_AGREEMENTS': 'INCOME_AGREEMENT',
    'PROJECT_EDITIONS': 'EDITION',
  }.entries) {
    testWidgets('${entry.key}从汇总进入原详情并读取实际原记录', (t) async {
      final record = projectData(entry.value), id = record['id'] as String;
      final category = entry.value == 'EDITION' ? 'works' : 'contracts';
      final a = projectsAdapter(override: (r) {
        if (r.path == '/api/v1/me/business/$category') {
          return envelope(businessResponse(category, personId,
              source: r.queryParameters['source'],
              sections: {
                entry.key: businessSection(entry.key,
                    items: [businessRow(entry.key, id: id)])
              }));
        }
        if (r.path == '/api/v1/projects/participations/$id/progress') {
          return envelope(
              {'agreement_id': id, 'order_id': null, 'milestones': []});
        }
        if (entry.value != 'EDITION' &&
            r.path == '/api/v1/projects/records/$projectKey') {
          return envelope({'code': 'PROJECT_NOT_FOUND'},
              status: 404, error: true);
        }
        return null;
      });
      final s = (await t.runAsync(() => buyerSession(a)))!;
      await nav.openApp(t, s, route: '/library?section=$category');
      await pressSource(t, entry.key, '回到原业务');
      expect(a.requests.any((r) => r.path == '/api/v1/projects/records/$id'),
          isTrue);
      expect(s.projectsAccessDenied, isFalse);
      if (entry.value != 'EDITION') {
        expect(
            a.requests
                .any((r) => r.path == '/api/v1/projects/records/$projectKey'),
            isFalse);
        expect(
            find.byType(entry.value == 'PARTICIPATION'
                ? ProjectParticipationPage
                : ProjectIncomePage),
            findsOneWidget);
        expect(
            find.text(entry.value == 'PARTICIPATION' ? '本次参演约定' : '本次发行收入约定'),
            findsOneWidget);
      } else {
        expect(find.byType(ProjectRecordPage), findsOneWidget);
        await reveal(t, find.text('当前成片材料'));
        expect(find.text('当前成片材料'), findsOneWidget);
      }
      expect(t.takeException(), isNull);
    });
  }
  test('每种来源回到准确原单；域加编号为唯一键，封存不称签约', () {
    const routes = {
      'CONTRACT_SNAPSHOTS': '/contract?snapshotId=',
      'TRADE': '/trade/record?recordId=',
      'PROJECTS': '/projects/record?recordId=',
      'LICENSE': '/licensing/record?recordId=',
      'SUPPLY': '/supply/record?recordId=',
      'PRODUCTION': '/production/project?projectId=',
      'STOCK': '/stock/listing?listingId=',
      'STOCK_PURCHASE': '/stock/purchase?orderId=',
      'FINANCE': '/finance/record?recordId=',
      'GIGS': '/gigs/record?recordId=',
    };
    for (final source in personalSourceDomains.keys) {
      final row = businessRow(source,
          income: source == 'FINANCE' ? incomeFixture() : null);
      expect(personalBusinessItem(row, source), row);
      final route = switch (source) {
        'PARTICIPATION_CONTRACTS' =>
          '/projects/participation?view=agreement&recordId=',
        'INCOME_AGREEMENTS' => '/projects/income?view=agreement&recordId=',
        _ => routes[personalSourceDomains[source]],
      };
      expect(personalBusinessRoute(row, source: source),
          '$route$businessFixtureId');
      expect(
          () =>
              personalBusinessItem({...row, 'key': businessFixtureId}, source),
          throwsA(isA<AccountError>()));
      expect(
          () => personalBusinessItem({
                ...row,
                'target': {'domain': 'STOCK', 'record_id': orgId}
              }, source),
          throwsA(isA<AccountError>()));
    }
    expect(
        personalBusinessStatus(
            businessRow('CONTRACT_SNAPSHOTS', status: 'SEALED')),
        '内容已封存，不表示已签署或付款');
    expect(
        personalBusinessStatus(
            businessRow('PRODUCTION_PROJECTS', status: 'IN_PROGRESS')),
        '制作中');
  });

  test('收入保持有符号整数分、环境与口径；佣金空值不能解释为零', () {
    expect(personalIncomeMoney('adjustment_minor', -101), '-¥1.01');
    expect(personalIncomeMoney('adjustment_minor', 101), '+¥1.01');
    expect(personalIncomeMoney('accrued_minor', -1), '-¥0.01');
    expect(personalIncomeMoney('accrued_minor', 9007199254740991),
        '¥90,071,992,547,409.91');
    expect(
        () => personalBusinessItem(
            businessRow('FINANCE',
                income: {...incomeFixture(), 'currency': 'USD'}),
            'FINANCE'),
        throwsA(isA<AccountError>()));
    expect(() => personalBusinessItem(businessRow('FINANCE'), 'FINANCE'),
        throwsA(isA<AccountError>()));
    expect(
        () => personalBusinessItem(
            businessRow('COMMISSIONS', income: incomeFixture()), 'COMMISSIONS'),
        throwsA(isA<AccountError>()));
    expect(
        personalBusinessItem(
            businessRow('COMMISSIONS'), 'COMMISSIONS')['income'],
        isNull);
    expect(
        () => personalBusinessSections(
            businessResponse('works', orgId), 'works', personId),
        throwsA(isA<AccountError>()));
    expect(
        () => personalBusinessSections(
            businessResponse('income', personId), 'works', personId),
        throwsA(isA<AccountError>()));
  });

  testWidgets('失败来源独立重试，翻页失败原cursor保留，空中间页继续且按域编号去重', (t) async {
    var firstPageCount = 0, cursorAttempts = 0;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path != '/api/v1/me/business/contracts') return a.defaultReply(r);
      final source = r.queryParameters['source'];
      if (source == null) {
        firstPageCount++;
        return envelope(businessResponse('contracts', personId, sections: {
          'CONTRACT_SNAPSHOTS':
              businessSection('CONTRACT_SNAPSHOTS', failed: true),
          'TRADE_ORDERS': businessSection('TRADE_ORDERS',
              items: [businessRow('TRADE_ORDERS', title: '首条订单')],
              cursor: 'orders-page-1'),
        }));
      }
      if (source == 'CONTRACT_SNAPSHOTS') {
        return envelope(
            businessResponse('contracts', personId, source: source, sections: {
          source: businessSection(source,
              items: [businessRow(source, title: '同编号的封存内容', status: 'SEALED')])
        }));
      }
      final cursor = r.queryParameters['cursor'];
      return envelope(
          businessResponse('contracts', personId, source: source, sections: {
        source: cursor == 'orders-page-1'
            ? ++cursorAttempts == 1
                ? businessSection(source, failed: true)
                : businessSection(source, cursor: 'orders-page-2')
            : businessSection(source, items: [
                businessRow(source, title: '首条订单已重核'),
                businessRow(source, id: orgId, title: '下一条订单')
              ])
      }));
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const BusinessLibraryPage());
    await pressSource(t, 'CONTRACT_SNAPSHOTS', '重试这部分');
    expect(find.text('同编号的封存内容'), findsOneWidget);
    await pressSource(t, 'TRADE_ORDERS', '继续读取本来源');
    expect(find.text('首条订单'), findsOneWidget);
    await pressSource(t, 'TRADE_ORDERS', '重试这部分');
    expect(find.text('本页暂无可见记录，可以继续读取下一页。'), findsOneWidget);
    await pressSource(t, 'TRADE_ORDERS', '继续读取本来源');
    expect(find.text('首条订单已重核'), findsOneWidget);
    expect(find.text('下一条订单'), findsOneWidget);
    expect(find.text('首条订单'), findsNothing);
    expect(firstPageCount, 1);
    final pages = a.requests
        .where((r) => r.queryParameters['source'] == 'TRADE_ORDERS')
        .toList();
    expect(pages.map((r) => r.queryParameters['cursor']),
        ['orders-page-1', 'orders-page-1', 'orders-page-2']);
    expect(pages.every((r) => r.headers['X-Acting-Party'] == personId), isTrue);
    expect(t.takeException(), isNull);
  });

  testWidgets('切换分类和身份后迟到响应不能恢复旧记录或分页', (t) async {
    final contracts = Completer<void>(), oldWorks = Completer<void>();
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) async {
      if (!r.path.startsWith('/api/v1/me/business/')) return a.defaultReply(r);
      final category = r.path.split('/').last,
          party = r.headers['X-Acting-Party'];
      if (category == 'contracts') {
        await contracts.future;
        return envelope(businessResponse(category, party, sections: {
          'TRADE_ORDERS': businessSection('TRADE_ORDERS',
              items: [businessRow('TRADE_ORDERS', title: '迟到旧合同')])
        }));
      }
      if (r.queryParameters['cursor'] != null) {
        await oldWorks.future;
        return envelope(businessResponse(category, party,
            source: 'PRODUCTION_PROJECTS',
            sections: {
              'PRODUCTION_PROJECTS': businessSection('PRODUCTION_PROJECTS',
                  items: [businessRow('PRODUCTION_PROJECTS', title: '迟到个人作品')])
            }));
      }
      return envelope(businessResponse(category, party, sections: {
        'PRODUCTION_PROJECTS': businessSection('PRODUCTION_PROJECTS',
            items: [
              businessRow('PRODUCTION_PROJECTS',
                  title: party == personId ? '个人在制项目' : '机构在制项目',
                  status: 'IN_PROGRESS')
            ],
            cursor: party == personId ? 'personal-page' : null)
      }));
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const BusinessLibraryPage());
    await t.tap(find.widgetWithText(ChoiceChip, '我的作品'));
    await frames(t);
    await pressSource(t, 'PRODUCTION_PROJECTS', '继续读取本来源');
    s.select(identity(orgId));
    await frames(t);
    contracts.complete();
    oldWorks.complete();
    await frames(t);
    await reveal(t, find.text('机构在制项目'));
    expect(find.text('机构在制项目'), findsOneWidget);
    expect(find.textContaining('迟到'), findsNothing);
    expect(find.text('个人在制项目'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('坏游标保留已有记录，原cursor重试或明确从该来源重新读取', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path != '/api/v1/me/business/works') return a.defaultReply(r);
      if (r.queryParameters['cursor'] != null) {
        return envelope({'code': 'INVALID_CURSOR'}, status: 400, error: true);
      }
      final source = r.queryParameters['source'];
      return envelope(
          businessResponse('works', personId, source: source, sections: {
        'SUPPLY_WORKS': businessSection('SUPPLY_WORKS',
            items: [
              businessRow('SUPPLY_WORKS',
                  title: source == null ? '已有作品' : '重新读取的作品')
            ],
            cursor: source == null ? 'invalid-cursor' : null)
      }));
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const BusinessLibraryPage(section: 'works'));
    await pressSource(t, 'SUPPLY_WORKS', '继续读取本来源');
    expect(find.text('已有作品'), findsOneWidget);
    expect(find.text('这次翻页条件已失效，请重新读取该来源。'), findsOneWidget);
    await pressSource(t, 'SUPPLY_WORKS', '重试这部分');
    expect(
        a.requests
            .where((r) => r.queryParameters['cursor'] == 'invalid-cursor'),
        hasLength(2));
    await pressSource(t, 'SUPPLY_WORKS', '重新读取该来源');
    expect(find.text('重新读取的作品'), findsOneWidget);
    expect(find.text('已有作品'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('一个来源读取中另一来源仍可翻页；刷新不追加已有记录', (t) async {
    final slow = Completer<void>();
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) async {
      if (r.path != '/api/v1/me/business/works') return a.defaultReply(r);
      final source = r.queryParameters['source'];
      if (source == 'SUPPLY_WORKS') await slow.future;
      return envelope(
          businessResponse('works', personId, source: source, sections: {
        'SUPPLY_WORKS': businessSection('SUPPLY_WORKS',
            items: [businessRow('SUPPLY_WORKS', title: '作品版本')],
            cursor: source == null ? 'supply-next' : null),
        'PRODUCTION_PROJECTS': businessSection('PRODUCTION_PROJECTS',
            items: [
              businessRow('PRODUCTION_PROJECTS',
                  title: source == null ? '制作首条' : '制作下一条',
                  id: source == null ? businessFixtureId : orgId)
            ],
            cursor: source == null ? 'production-next' : null)
      }));
    });
    await host(t, (await t.runAsync(() => buyerSession(a)))!,
        const BusinessLibraryPage(section: 'works'));
    await pressSource(t, 'SUPPLY_WORKS', '继续读取本来源');
    await pressSource(t, 'PRODUCTION_PROJECTS', '继续读取本来源');
    expect(find.text('制作下一条'), findsOneWidget);
    slow.complete();
    await frames(t);
    await reveal(t, find.text('刷新当前分类'));
    await t.tap(find.text('刷新当前分类'));
    await frames(t);
    await reveal(t, find.text('制作首条'));
    expect(find.text('制作首条'), findsOneWidget);
    expect(find.text('制作下一条'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('收入窄屏大字分字段展示，佣金不显示0元或到账总额', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path == '/api/v1/me/business/income'
            ? envelope(businessResponse('income', personId, sections: {
                'FINANCE': businessSection('FINANCE', items: [
                  businessRow('FINANCE',
                      title: '商家核算', income: incomeFixture(merchant: true))
                ]),
                'COMMISSIONS': businessSection('COMMISSIONS',
                    items: [businessRow('COMMISSIONS', title: '佣金来源核对')]),
              }))
            : a.defaultReply(r));
    final s = (await t.runAsync(() => buyerSession(a)))!;
    t.view.physicalSize = const Size(320, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: s,
        child: MaterialApp(
            builder: (c, child) => MediaQuery(
                data: MediaQuery.of(c)
                    .copyWith(textScaler: const TextScaler.linear(2)),
                child: child!),
            home: const BusinessLibraryPage(section: 'income'))));
    await frames(t);
    await reveal(t, find.text('商家核算'));
    expect(find.text('-¥1.01'), findsOneWidget);
    expect(find.text('¥98.99'), findsOneWidget);
    expect(find.text('测试环境'), findsOneWidget);
    expect(find.text('CNY'), findsOneWidget);
    await reveal(t, find.text('佣金来源核对'));
    expect(
        find.descendant(
            of: sourceCard('COMMISSIONS'), matching: find.text('¥0.00')),
        findsNothing);
    expect(find.textContaining('总到账'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('购买作品使用原order_id跳转，回页仅重读该来源', (t) async {
    String? opened;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path == '/api/v1/me/business/works'
            ? envelope(businessResponse('works', personId,
                source: r.queryParameters['source'],
                sections: {
                    'STOCK_PURCHASES': businessSection('STOCK_PURCHASES',
                        items: [businessRow('STOCK_PURCHASES', title: '原购买作品')])
                  }))
            : a.defaultReply(r));
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: s,
        child: MaterialApp(
            home: const BusinessLibraryPage(section: 'works'),
            onGenerateRoute: (settings) {
              opened = settings.name;
              return MaterialPageRoute<void>(
                  builder: (_) => const Scaffold(body: Text('原购买详情')));
            })));
    await frames(t);
    await pressSource(t, 'STOCK_PURCHASES', '回到原业务');
    expect(opened, '/stock/purchase?orderId=$businessFixtureId');
    t.state<NavigatorState>(find.byType(Navigator)).pop();
    await frames(t);
    expect(a.requests.last.queryParameters['source'], 'STOCK_PURCHASES');
    expect(t.takeException(), isNull);
  });

  testWidgets('撤销本人读取权限清空三个分类缓存，不继续显示旧金额', (t) async {
    var revoked = false;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path != '/api/v1/me/business/income') return a.defaultReply(r);
      if (revoked) {
        return envelope({'code': 'PARTY_FORBIDDEN'}, status: 403, error: true);
      }
      return envelope(businessResponse('income', personId, sections: {
        'FINANCE': businessSection('FINANCE', items: [
          businessRow('FINANCE', title: '仅本人核算', income: incomeFixture())
        ])
      }));
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const BusinessLibraryPage(section: 'income'));
    revoked = true;
    await reveal(t, find.text('刷新当前分类'));
    await t.tap(find.text('刷新当前分类'));
    await frames(t);
    expect(find.text('仅本人核算'), findsNothing);
    expect(s.isDomainDenied('/api/v1/me/business/'), isTrue);
    expect(find.textContaining('当前访问权限已失效'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
