import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/production/production_api.dart';
import 'package:jingjingshangri_app/production/production_models.dart';
import 'package:jingjingshangri_app/production/production_pages.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import '../trade/trade_api_test.dart' show buyerSession;
import '../trade/trade_fixtures.dart';
import 'production_api_test.dart' show feedbackPath;
import 'production_fixtures.dart';

Future<void> quickFrames(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Future<void> reveal(WidgetTester tester, Finder finder) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pump(const Duration(milliseconds: 100));
  if (finder.evaluate().isEmpty) {
    tester
        .state<ScrollableState>(find.byType(Scrollable).first)
        .position
        .jumpTo(0);
    await tester.pump();
    await tester.scrollUntilVisible(finder, 250,
        scrollable: find.byType(Scrollable).first);
  } else {
    await tester.ensureVisible(finder);
  }
  await tester.pump();
  await tester.ensureVisible(finder);
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  testWidgets('当前剧本完整阅读、说明与检查项齐备后才确认具体版本', (tester) async {
    final adapter = productionAdapter(),
        s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s,
        route: '/production/version?versionId=$productionVersionId');
    expect(find.text('确认剧本'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    final button = find.widgetWithText(FilledButton, '确认这版剧本');
    await reveal(tester, button);
    expect(tester.widget<FilledButton>(button).onPressed, isNull);
    await tester.enterText(
        find.widgetWithText(TextField, '确认说明'), '已阅读并确认本版剧本。');
    await reveal(
        tester, find.byKey(const ValueKey('production-check-script_reviewed')));
    await tester
        .tap(find.byKey(const ValueKey('production-check-script_reviewed')));
    await nav.frames(tester);
    expect(tester.widget<FilledButton>(button).onPressed, isNull);
    await reveal(tester, find.text('完整阅读'));
    await tester.tap(find.text('完整阅读'));
    await nav.frames(tester);
    expect(
        find.descendant(
            of: find.byType(Dialog), matching: find.text(scriptBody)),
        findsOneWidget);
    expect(find.text('完整剧本 · 第 2 版'), findsOneWidget);
    await tester.tap(find.text('返回审阅'));
    await nav.frames(tester);
    await reveal(tester, button);
    expect(tester.widget<FilledButton>(button).onPressed, isNotNull);
    await tester.tap(button);
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    expect(find.text('制作项目'), findsOneWidget);
    final write = adapter.requests.where((r) => r.path == feedbackPath).single;
    expect(write.data, {
      'decision': 'ACCEPT',
      'note': '已阅读并确认本版剧本。',
      'checklist': {'script_reviewed': true}
    });
    expect(write.headers['If-Match'], '"3"');
    expect(tester.takeException(), isNull);
  });
  testWidgets('样片请求修改无需验收检查，绑定版本与额度可读并显示反馈历史', (tester) async {
    final adapter = productionAdapter(stage: 'SAMPLE'),
        s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s,
        route: '/production/feedback?versionId=$productionVersionId');
    expect(find.text('提交本版意见'), findsOneWidget);
    expect(find.text('样片 · 第 2 版'), findsOneWidget);
    await reveal(tester, find.text('请求修改时无需勾选验收项。'));
    expect(find.text('请求修改时无需勾选验收项。'), findsOneWidget);
    expect(find.byType(CheckboxListTile), findsNothing);
    await reveal(tester, find.widgetWithText(TextField, '本版修改意见'));
    await tester.enterText(
        find.widgetWithText(TextField, '本版修改意见'), '请放慢结尾对白。');
    await nav.frames(tester);
    await reveal(tester, find.text('提交修改意见'));
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '提交修改意见'))
            .onPressed,
        isNotNull);
    await tester.tap(find.text('提交修改意见'));
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    expect(adapter.requests.where((r) => r.path == feedbackPath).single.data,
        {'decision': 'REQUEST_CHANGES', 'note': '请放慢结尾对白。', 'checklist': null});
    await reveal(tester, find.text('样片 · 第 2 版'));
    await tester.tap(find.text('样片 · 第 2 版'));
    await nav.frames(tester);
    expect(find.text('请放慢对白，保留当前配乐。'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('503保留原意见并拦返回，恢复后清除旧警告且原key不变', (tester) async {
    var writes = 0;
    final adapter = productionAdapter(
        override: (r) => r.path == feedbackPath && ++writes == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : null);
    final s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await tester.runAsync(() async {
      try {
        await ProductionApi(s).feedback(
            ProductionRecord.parse(productionData('VERSION')),
            ProductionRecord.parse(productionData('PROJECT')),
            'REQUEST_CHANGES',
            '原意见',
            null);
      } on AccountError {/* Expected unresolved write. */}
    });
    final key = adapter.requests.last.headers['Idempotency-Key'];
    await nav.openApp(tester, s,
        route: '/production/feedback?versionId=$productionVersionId');
    expect(find.text('原意见结果待核实'), findsOneWidget);
    expect(find.text('原意见'), findsWidgets);
    await tester.tap(find.byType(BackButton));
    await quickFrames(tester);
    expect(find.text('操作结果尚未确认，请先恢复原请求核对。'), findsOneWidget);
    expect(find.byType(ProductionVersionPage), findsOneWidget);
    expect(s.productionPending, isNotEmpty);
    await tester.tap(find.text('恢复原请求核对'));
    await quickFrames(tester);
    await tester.tap(find.text('确认办理'));
    await quickFrames(tester);
    expect(s.productionPending, isEmpty);
    expect(find.text('操作结果尚未确认，请先恢复原请求核对。'), findsNothing);
    expect(
        adapter.requests
            .where((r) => r.path == feedbackPath)
            .last
            .headers['Idempotency-Key'],
        key);
    expect(find.text('制作项目'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('412读取新记录并清空旧说明，用户重新填写才能再次提交', (tester) async {
    var writes = 0;
    final adapter = productionAdapter(override: (r) {
      if (r.path == feedbackPath && ++writes == 1) {
        return envelope({'code': 'VERSION_CONFLICT'}, status: 412, error: true);
      }
      if (r.path == '/api/v1/production/records/$productionVersionId' &&
          writes > 0) {
        return envelope(productionData('VERSION', version: 4));
      }
      return null;
    });
    final s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s,
        route: '/production/feedback?versionId=$productionVersionId');
    await reveal(tester, find.widgetWithText(TextField, '本版修改意见'));
    await tester.enterText(find.widgetWithText(TextField, '本版修改意见'), '旧决定');
    await reveal(tester, find.text('提交修改意见'));
    await tester.tap(find.text('提交修改意见'));
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    expect(s.productionPending, isEmpty);
    expect(find.text('旧决定'), findsNothing);
    await reveal(tester, find.text('内容已更新，请重新查看当前版本，再填写并确认。本次旧决定不会自动重放。'));
    expect(find.text('内容已更新，请重新查看当前版本，再填写并确认。本次旧决定不会自动重放。'), findsOneWidget);
    await reveal(tester, find.text('提交修改意见'));
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '提交修改意见'))
            .onPressed,
        isNull);
    await reveal(tester, find.widgetWithText(TextField, '本版修改意见'));
    await tester.enterText(find.widgetWithText(TextField, '本版修改意见'), '新核对意见');
    await reveal(tester, find.text('提交修改意见'));
    await tester.tap(find.text('提交修改意见'));
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    expect(
        adapter.requests
            .where((r) => r.path == feedbackPath)
            .last
            .headers['If-Match'],
        '"4"');
    expect(
        adapter.requests.where((r) => r.path == feedbackPath).last.data['note'],
        '新核对意见');
    expect(tester.takeException(), isNull);
  });
  testWidgets('最终已验收仍需付清；已付清但旧版本确认失效同样不能下载', (tester) async {
    for (final scenario in [0, 1, 2]) {
      final adapter = productionAdapter(
              stage: 'FINAL', accepted: scenario != 1, paid: scenario != 0),
          s = (await tester.runAsync(() => buyerSession(adapter)))!;
      await tester.pumpWidget(const SizedBox.shrink());
      await nav.openApp(tester, s,
          route: '/production/work?projectId=$productionProjectId');
      expect(find.text('私人作品'), findsOneWidget);
      final button = find.widgetWithText(FilledButton, '下载当前原片');
      await reveal(tester, button);
      expect(tester.widget<FilledButton>(button).onPressed,
          scenario == 2 ? isNotNull : isNull);
      expect(adapter.requests.any((r) => r.path.endsWith('/content')), false);
      expect(find.text('示例成片预览'), findsNothing);
      expect(tester.takeException(), isNull);
    }
  });
  testWidgets('身份切换与退出立即清理私有剧本和未完成意见', (tester) async {
    final adapter = productionAdapter(),
        s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s,
        route: '/production/version?versionId=$productionVersionId');
    await tester.tap(find.text('完整阅读'));
    await nav.frames(tester);
    await tester.tap(find.text('返回审阅'));
    await nav.frames(tester);
    expect(find.text(scriptBody), findsOneWidget);
    await tester.runAsync(() => s.logout());
    await nav.frames(tester);
    expect(find.text(scriptBody), findsNothing);
    expect(find.text('先确认办事身份'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('完整阅读弹窗打开期间切换身份也立即隐藏私有正文', (tester) async {
    final adapter = productionAdapter(),
        s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s,
        route: '/production/version?versionId=$productionVersionId');
    await tester.tap(find.text('完整阅读'));
    await nav.frames(tester);
    expect(
        find.descendant(
            of: find.byType(Dialog), matching: find.text(scriptBody)),
        findsOneWidget);
    s.select(identity(orgId));
    await nav.frames(tester);
    expect(
        find.descendant(
            of: find.byType(Dialog), matching: find.text(scriptBody)),
        findsNothing);
    expect(find.text('当前身份已变化，私有内容已清空。'), findsOneWidget);
    await tester.tap(find.text('返回审阅'));
    await nav.frames(tester);
    expect(tester.takeException(), isNull);
  });
  testWidgets('订单展示真实当前阶段，只有全部制作明细当前样片已确认才衔接付款', (tester) async {
    final adapter = productionAdapter(stage: 'SAMPLE', accepted: true),
        s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s, route: '/trade/record?recordId=$orderId');
    expect(find.text('查看当前样片'), findsOneWidget);
    expect(find.text('当前版本已确认'), findsOneWidget);
    await reveal(tester, find.text('建立验收节点付款记录'));
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, '建立验收节点付款记录'))
            .onPressed,
        isNotNull);
    await reveal(tester, find.text('查看当前样片'));
    await tester.tap(find.text('查看当前样片'));
    await nav.frames(tester);
    expect(find.text('审阅样片'), findsOneWidget);
    expect(find.text('本版已确认。停止重复确认，请回订单查看原付款节点。'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('我的制作和许可分组独立，子页返回保持五栏目与无假作品元数据', (tester) async {
    final adapter =
            productionAdapter(stage: 'FINAL', accepted: true, paid: true),
        s = (await tester.runAsync(() => buyerSession(adapter)))!;
    await nav.openApp(tester, s, route: '/my');
    expect(find.byType(NavigationBar), findsOneWidget);
    await reveal(tester, find.text('我的交付作品'));
    await tester.tap(find.text('我的交付作品'));
    await nav.frames(tester);
    expect(find.text('我的交付作品'), findsOneWidget);
    expect(find.text('最终版本已验收'), findsOneWidget);
    expect(find.text('约定款项已付清'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('创建时间'), findsNothing);
    expect(find.text('时长'), findsNothing);
    await tester.tap(find.byType(BackButton));
    await nav.frames(tester);
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('我的许可办理'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
