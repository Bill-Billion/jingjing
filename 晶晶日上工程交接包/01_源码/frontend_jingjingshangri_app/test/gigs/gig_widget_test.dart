import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/navigation/app_shell.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import '../trade/trade_api_test.dart' show buyerSession;
import '../supply/supply_fixtures.dart';
import 'gig_fixtures.dart';

Future<void> reveal(WidgetTester tester, Finder f) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pump(const Duration(milliseconds: 100));
  final scroll = find
      .descendant(
          of: find.byType(ListView).first, matching: find.byType(Scrollable))
      .first;
  if (f.evaluate().isEmpty) {
    tester.state<ScrollableState>(scroll).position.jumpTo(0);
    await tester.pump();
    await tester.scrollUntilVisible(f, 250, scrollable: scroll);
  } else {
    await tester.ensureVisible(f);
  }
  await tester.pump(const Duration(milliseconds: 100));
  await tester.ensureVisible(f);
  await tester.pump(const Duration(milliseconds: 100));
}

Future<void> click(WidgetTester tester, String label,
    {bool outline = false}) async {
  final f = outline
      ? find.widgetWithText(OutlinedButton, label)
      : find.widgetWithText(FilledButton, label);
  await reveal(tester, f);
  await tester.tap(f);
  await tester.pump(const Duration(milliseconds: 200));
}

Future<void> consentConfirm(WidgetTester tester) async {
  await click(tester, '确认接单约定');
  expect(find.text('确认这份接单约定'), findsOneWidget);
  await tester.tap(find.widgetWithText(FilledButton, '确认办理'));
  await tester.pump(const Duration(milliseconds: 500));
}

ResponseBody emptyPage() => envelope({'items': [], 'next_cursor': null});
void main() {
  testWidgets('买方完整条款确认，与不同 offer 的报价隔离，身份切换清空原内容', (tester) async {
    late FakeAccountAdapter a;
    var accepted = false;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/acceptance')) {
        accepted = true;
        return envelope(gigData('OFFER', status: 'ACCEPTED'));
      }
      if (r.path.endsWith('/records/$offerId')) {
        return envelope(
            gigData('OFFER', status: accepted ? 'ACCEPTED' : 'APPROVED'));
      }
      if (r.path == '/api/v1/trade/records') {
        return envelope({
          'items': r.queryParameters['kind'] == 'QUOTE'
              ? [commercialTrade('QUOTE', id: relationId)]
              : [],
          'next_cursor': null
        });
      }
      return a.defaultReply(r);
    });
    final s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s, route: '/gigs/record?recordId=$offerId');
    await consentConfirm(tester);
    await nav.frames(tester);
    expect(a.requests.where((r) => r.path.endsWith('/acceptance')).single.data,
        {'offer_sha256': gigData('OFFER')['content_sha256']});
    await reveal(tester, find.textContaining('当前约定尚无对应报价或订单'));
    expect(find.widgetWithText(FilledButton, '确认接单约定'), findsNothing);
    expect(find.text('查看对应报价'), findsNothing);
    s.select(identity(orgId, owner: false));
    await nav.frames(tester);
    expect(find.text('当前完整约定原文'), findsNothing);
    expect(find.text('先确认办事身份'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('未知写入拦截返回且保留恢复，成功后立即清理过时警告', (tester) async {
    late FakeAccountAdapter a;
    var tries = 0;
    final second = Completer<ResponseBody>();
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/acceptance')) {
        return ++tries == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : second.future;
      }
      if (r.path.endsWith('/records/$offerId')) {
        return envelope(
            gigData('OFFER', status: tries > 1 ? 'ACCEPTED' : 'APPROVED'));
      }
      if (r.path == '/api/v1/trade/records') return emptyPage();
      return a.defaultReply(r);
    });
    final s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s, route: '/gigs/record?recordId=$offerId');
    await consentConfirm(tester);
    expect(s.gigsPending, hasLength(1));
    final key = a.requests.last.headers['Idempotency-Key'];
    await tester.tap(find.byType(BackButton));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('操作结果尚未确认，请先恢复原请求核对。'), findsOneWidget);
    expect(s.gigsPending, hasLength(1));
    await click(tester, '恢复原请求核对');
    expect(s.gigsPending, hasLength(1));
    expect(find.text('操作结果尚未确认，请先恢复原请求核对。'), findsOneWidget);
    second.complete(envelope(gigData('OFFER', status: 'ACCEPTED')));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 300));
    expect(s.gigsPending, isEmpty);
    expect(find.text('操作结果尚未确认，请先恢复原请求核对。'), findsNothing);
    expect(
        a.requests
            .where((r) => r.path.endsWith('/acceptance'))
            .last
            .headers['Idempotency-Key'],
        key);
    expect(tester.takeException(), isNull);
  });
  testWidgets('412重新读取与重新确认当前条款，不自动重放旧选择', (tester) async {
    late FakeAccountAdapter a;
    var tries = 0;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/acceptance')) {
        return ++tries == 1
            ? envelope({'code': 'VERSION_CONFLICT'}, status: 412, error: true)
            : envelope(gigData('OFFER',
                status: 'ACCEPTED', version: 4, terms: '更新后的实际条款'));
      }
      if (r.path.endsWith('/records/$offerId')) {
        return envelope(gigData('OFFER',
            version: tries == 0 ? 2 : 3,
            terms: tries == 0 ? '当前完整约定原文' : '更新后的实际条款'));
      }
      if (r.path == '/api/v1/trade/records') return emptyPage();
      return a.defaultReply(r);
    });
    final s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s, route: '/gigs/record?recordId=$offerId');
    await consentConfirm(tester);
    await nav.frames(tester);
    expect(tries, 1);
    expect(s.gigsPending, isEmpty);
    await reveal(tester, find.text('更新后的实际条款'));
    expect(find.text('当前完整约定原文'), findsNothing);
    await consentConfirm(tester);
    await nav.frames(tester);
    final post = a.requests.where((r) => r.path.endsWith('/acceptance')).last;
    expect(post.headers['If-Match'], '"3"');
    expect(post.data, {
      'offer_sha256':
          gigData('OFFER', version: 3, terms: '更新后的实际条款')['content_sha256']
    });
    expect(tester.takeException(), isNull);
  });
  testWidgets('真实空榜单在 320 宽显示不足依据与三个栏目，不冒充人物目录', (tester) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/rankings/$rankingId')
            ? envelope(publicRanking())
            : a.defaultReply(r));
    final s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s, route: '/gigs/ranking?recordId=$rankingId');
    tester.view.physicalSize = const Size(320, 844);
    await nav.frames(tester);
    await reveal(tester, find.text('暂未形成榜单'));
    expect(find.text('热度榜'), findsOneWidget);
    await tester.tap(find.text('新兴榜'));
    await tester.pump();
    expect(find.text('暂未形成榜单'), findsOneWidget);
    expect(
        a.requests.where((r) => r.path.endsWith('/rankings/$rankingId')).length,
        1);
    expect(find.text('已出款'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('培育保留五栏目及滚动状态，商单子页返回到原栏目', (tester) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/catalogue')
            ? envelope(catalogue())
            : a.defaultReply(r));
    final s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s, route: '/cultivate');
    expect(find.byType(AppShell), findsOneWidget);
    nav.expectFiveTabs();
    await click(tester, '查看商单需求', outline: true);
    await nav.frames(tester);
    expect(find.text('商单需求'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    await tester.tap(find.byType(BackButton));
    await nav.frames(tester);
    nav.expectFiveTabs();
    expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
        2);
    for (final i in [4, 0, 2]) {
      await tester.tap(find.byKey(Key('app-tab-$i')));
      await tester.pump();
      nav.expectFiveTabs();
    }
    expect(tester.takeException(), isNull);
  });
  testWidgets('佣金明确沙盒与无出款，负退款变动不变成已到账', (tester) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/records/$commissionId')
            ? envelope(gigData('COMMISSION'))
            : r.path.endsWith('/entries')
                ? envelope(entries())
                : a.defaultReply(r));
    final s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s, route: '/gigs/record?recordId=$commissionId');
    await reveal(tester, find.text('沙盒测试'));
    await reveal(tester, find.textContaining('没有出款接口'));
    expect(find.text('¥0.00'), findsOneWidget);
    await reveal(tester, find.text('-¥2.50'));
    expect(find.text('-¥2.50'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('接单表单实际选择资料，比例空白、入榜未勾选，同意排除第三方和单脸', (tester) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/catalogue')) return envelope(catalogue());
      if (r.path == '/api/v1/trade/records') {
        return envelope({
          'items': [supplierSpec()],
          'next_cursor': null
        });
      }
      if (r.path == '/api/v1/gigs/records') return emptyPage();
      if (r.path == '/api/v1/supply/records') {
        if (r.queryParameters['kind'] == 'AVATAR') {
          return envelope({
            'items': [supplyChoice('AVATAR')],
            'next_cursor': null
          });
        }
        final other = supplyChoice('CONSENT', id: relationId);
        other['data']['consent']['subject_party_id'] = personId;
        final face = supplyChoice('CONSENT', id: commercialRuleId);
        face['data']['consent']['features'] = ['FACE'];
        return envelope({
          'items': [
            supplyChoice('CONSENT'),
            other,
            face,
            supplyChoice('CONSENT', id: commissionId, purpose: 'PRIVATE')
          ],
          'next_cursor': null
        });
      }
      return a.defaultReply(r);
    });
    final s = (await tester.runAsync(() => buyerSession(a)))!;
    s.select(identity(orgId));
    await nav.openApp(tester, s, route: '/gigs/offers/new?gigId=$gigRecordId');
    final avatar = find.byWidgetPredicate((w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == '已记录数字人');
    await reveal(tester, avatar);
    await tester.tap(avatar);
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('当前身份数字人').last);
    await tester.pumpAndSettle();
    final consent = find.byWidgetPredicate((w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == '覆盖本次商业用途的本人同意');
    await reveal(tester, consent);
    final select = tester.widget<DropdownButton<String>>(find.descendant(
        of: consent, matching: find.byType(DropdownButton<String>)));
    expect(select.items!.map((i) => i.value).toList(), [consentId]);
    await reveal(tester, find.widgetWithText(TextField, '平台费用（%）'));
    expect(
        tester
            .widget<TextField>(find.widgetWithText(TextField, '平台费用（%）'))
            .controller!
            .text,
        isEmpty);
    await reveal(tester, find.byType(CheckboxListTile));
    expect(tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
        false);
    await reveal(tester, find.widgetWithText(FilledButton, '提交审核'));
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '提交审核'))
            .onPressed,
        null);
    expect(tester.takeException(), isNull);
  });
  testWidgets('MCN 合作必须本人办理原因，接受后仅合作生效', (tester) async {
    late FakeAccountAdapter a;
    var accepted = false;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/decision')) {
        accepted = true;
        return envelope(gigData('RELATION', status: 'ACTIVE'));
      }
      if (r.path.endsWith('/records/$relationId')) {
        return envelope(
            gigData('RELATION', status: accepted ? 'ACTIVE' : 'INVITED'));
      }
      return a.defaultReply(r);
    });
    final s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s, route: '/gigs/record?recordId=$relationId');
    await click(tester, '接受合作');
    await tester.enterText(
        find.widgetWithText(TextField, '办理原因'), '本人已核对直接合作原文');
    await tester.tap(find.widgetWithText(FilledButton, '确认办理'));
    await nav.frames(tester);
    expect(a.requests.where((r) => r.path.endsWith('/decision')).single.data,
        {'decision': 'ACCEPT', 'reason': '本人已核对直接合作原文'});
    await reveal(tester, find.text('合作有效'));
    expect(find.text('合作有效'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('通知只来自当前商单域；旧发现与商单通知入口正常返回', (tester) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/notifications')
            ? envelope({
                'items': [
                  {
                    'id': assetId,
                    'record_id': gigRecordId,
                    'event_code': 'GIG_SUSPENDED'
                  }
                ]
              })
            : a.defaultReply(r));
    final s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s, route: '/gigs/notifications');
    expect(find.text('商单已暂停'), findsOneWidget);
    expect(find.textContaining('不是全平台通知中心'), findsOneWidget);
    expect(a.requests.last.headers['X-Acting-Party'], personId);
    await tester.tap(find.byType(BackButton));
    await nav.frames(tester);
    nav.expectFiveTabs();
    expect(tester.takeException(), isNull);
  });
  testWidgets('下拉语义点击边界独立于卡片标题及两个日期按钮', (tester) async {
    final handle = tester.ensureSemantics();
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/catalogue')
            ? envelope(catalogue())
            : a.defaultReply(r));
    final s = (await tester.runAsync(() => buyerSession(a)))!;
    final mcn = identity(orgId);
    mcn['party']['capabilities'] = [
      {'code': 'MCN', 'current_status': 'ACTIVE'}
    ];
    s.select(mcn);
    await nav.openApp(tester, s, route: '/gigs/relations/new');
    final dropdown = find.byWidgetPredicate((w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == '排他约定');
    await reveal(tester, dropdown);
    final semantic = tester.getSemantics(find.bySemanticsLabel('排他约定'));
    expect(semantic.label, '排他约定');
    expect(semantic.getSemanticsData().hasAction(SemanticsAction.tap), true);
    expect(semantic.rect.height, lessThan(100));
    expect(semantic.rect.height, closeTo(tester.getRect(dropdown).height, 1));
    final labels = <String>[];
    void collect(SemanticsNode node) {
      labels.add(node.label);
      node.visitChildren((child) {
        collect(child);
        return true;
      });
    }

    collect(semantic);
    expect(
        labels.any((label) => label.contains('合作开始') || label.contains('合作结束')),
        false);
    await tester.tap(find.bySemanticsLabel('排他约定'));
    await tester.pumpAndSettle();
    expect(find.byType(DatePickerDialog), findsNothing);
    expect(find.text('不排他').last, findsOneWidget);
    await tester.tap(find.text('不排他').last);
    await tester.pumpAndSettle();
    expect(find.text('不排他'), findsOneWidget);
    expect(tester.takeException(), isNull);
    handle.dispose();
  });
}
