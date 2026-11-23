import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/production/production_service_page.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart' as v5;
import 'app_navigation_test.dart' show openApp;

void main() {
  testWidgets('制作介绍可公开直达，不读取本人记录或显示底栏', (t) async {
    final adapter = FakeAccountAdapter();
    await openApp(t, AccountSession(api: adapter.createApi()),
        route: '/production/services');
    expect(find.byType(ProductionServicePage), findsOneWidget);
    expect(find.text('把故事拍成片'), findsOneWidget);
    final service = find.byType(ProductionServicePage);
    expect(
        find.descendant(of: service, matching: find.text('本页尚未提供可播放的服务介绍媒体')),
        findsOneWidget);
    expect(find.descendant(of: service, matching: find.byType(Image)),
        findsNothing,
        reason: '无服务媒体时使用诚实的占位说明，不展示替代图片');
    await v5.reveal(t, find.text('付费精修'));
    expect(find.text('从原制作项目核对追加约定'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, '付费精修'), findsNothing);
    expect(find.widgetWithText(OutlinedButton, '代做样片'), findsNothing);
    expect(find.byType(NavigationBar), findsNothing);
    expect(adapter.requests, isEmpty);
    expect(t.takeException(), isNull);
  });

  testWidgets('主页全部功能中的平台制作先进入服务介绍', (t) async {
    final adapter = FakeAccountAdapter();
    await openApp(t, AccountSession(api: adapter.createApi()),
        route: '/square');
    await t.tap(find.text('全部'));
    await v5.frames(t);
    final service = find.text('平台制作服务');
    await v5.reveal(t, service);
    await Scrollable.ensureVisible(t.element(service), alignment: .5);
    await t.pump();
    expect(service.hitTestable(), findsOneWidget);
    await t.tap(service);
    await v5.frames(t);
    expect(find.byType(ProductionServicePage), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(adapter.requests, isEmpty);
    expect(t.takeException(), isNull);
  });

  for (final action in [
    ('填写制作需求', '/customization/new'),
    ('查看我的制作', '/production'),
  ]) {
    testWidgets('${action.$1}保留原业务路由', (t) async {
      String? opened;
      await t.pumpWidget(MaterialApp(
          home: const ProductionServicePage(),
          onGenerateRoute: (settings) {
            opened = settings.name;
            return MaterialPageRoute<void>(
                builder: (_) => const Scaffold(body: Text('原业务')));
          }));
      await t.pump();
      final target = find.widgetWithText(
          action.$2 == '/production' ? OutlinedButton : FilledButton,
          action.$1);
      await v5.reveal(t, target);
      await t.tap(target);
      await t.pumpAndSettle();
      expect(opened, action.$2);
      expect(t.takeException(), isNull);
    });
  }

  for (final scale in [1.0, 1.6]) {
    testWidgets('320窄屏$scale倍文字可读，报价保留真实约定边界', (t) async {
      t.view.physicalSize = const Size(320, 844);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(scale)),
              child: child!),
          home: const ProductionServicePage()));
      await t.pump();
      expect(find.text('把故事拍成片'), findsOneWidget);
      await v5.reveal(t, find.text('以本次确认报价为准'));
      expect(find.text('以本次确认报价为准'), findsOneWidget);
      expect(find.text('确认费用、付款节点及交付标准'), findsOneWidget);
      expect(find.textContaining('2500'), findsNothing);
      expect(find.textContaining('2,500'), findsNothing);
      expect(find.textContaining('90秒'), findsNothing);
      expect(find.textContaining('填写或提交需求不会收款'), findsOneWidget);
      await v5.reveal(t, find.text('成片与素材归属'));
      expect(find.widgetWithText(FilledButton, '填写制作需求'), findsOneWidget);
      expect(t.takeException(), isNull);
    });
  }
}
