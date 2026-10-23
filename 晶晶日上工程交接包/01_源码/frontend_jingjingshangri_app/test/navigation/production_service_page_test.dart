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
    final image = t.widget<Image>(find.byType(Image));
    expect((image.image as AssetImage).assetName,
        'assets/images/editorial-rain.webp');
    expect(image.semanticLabel, contains('视觉示意'));
    await v5.reveal(t, find.text('付费精修'));
    expect(find.text('须从原制作项目核对追加约定'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, '付费精修'), findsNothing);
    expect(find.widgetWithText(OutlinedButton, '代做样片'), findsNothing);
    expect(find.byType(NavigationBar), findsNothing);
    expect(adapter.requests, isEmpty);
    expect(t.takeException(), isNull);
  });

  testWidgets('主页平台制作入口先进入服务介绍', (t) async {
    final adapter = FakeAccountAdapter();
    await openApp(t, AccountSession(api: adapter.createApi()),
        route: '/square');
    await v5.reveal(t, find.text('开始创作 ↗'));
    await t.tap(find.text('开始创作 ↗'));
    await v5.frames(t);
    expect(find.byType(ProductionServicePage), findsOneWidget);
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
      await v5.reveal(t, find.textContaining('规格、金额与付款节点以原确认报价为准。'));
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
