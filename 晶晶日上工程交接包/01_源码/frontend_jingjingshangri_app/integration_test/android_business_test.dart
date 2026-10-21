// Actual Android rendering/input + isolated HTTP/MySQL. No paid providers.
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/main.dart' as app;
import 'package:jingjingshangri_app/account/account_session.dart';
import 'synthetic_android.dart';
import 'package:jingjingshangri_app/account/account_page.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  Future<void> frames(WidgetTester t, [int count = 8]) async {
    for (var i = 0; i < count; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> wait(WidgetTester t, Finder f) async {
    for (var i = 0; i < 200 && f.evaluate().isEmpty; i++) {
      await frames(t, 1);
    }
    if (f.evaluate().isEmpty) {
      debugPrint('NATIVE_WAIT_FAILED');
      debugPrint(t
          .widgetList<Text>(find.byType(Text))
          .map((x) => x.data ?? '')
          .join(' | '));
    }
    expect(f, findsWidgets);
  }

  Future<void> press(WidgetTester t, Finder f) async {
    await wait(t, f);
    await t.ensureVisible(f.first);
    await frames(t, 3);
    await t.tap(f.first);
    await frames(t);
  }

  Future<void> shot(WidgetTester t, String name) async {
    await frames(t);
    final bytes = await binding.takeScreenshot('android-$name');
    expect(bytes.take(8).toList(), [137, 80, 78, 71, 13, 10, 26, 10]);
    final dir = Directory('${Directory.systemTemp.path}/jx-native-evidence');
    await dir.create(recursive: true);
    await File('${dir.path}/android-$name.png').writeAsBytes(bytes);
    // Transfer files with adb after the run; avoid one enormous final VM-service message.
    binding.reportData!.remove('screenshots');
    (binding.reportData!['native_screenshot_files'] ??= <String>[])
        .add('android-$name.png');
  }

  testWidgets('安卓实际启动、五入口、未开放业务说明和登录', (t) async {
    expect(Platform.isAndroid, isTrue);
    final previousErrorBuilder = ErrorWidget.builder;
    addTearDown(() {
      ErrorWidget.builder = previousErrorBuilder;
    });
    await app.main();
    ErrorWidget.builder = previousErrorBuilder;
    await frames(t, 20);
    await binding.convertFlutterSurfaceToImage();
    for (var i = 0; i < 5; i++) {
      await press(t, find.byKey(Key('app-tab-$i')));
      final nav = find.byType(NavigationBar);
      expect(t.widget<NavigationBar>(nav).selectedIndex, i);
      for (final label in ['广场', '试镜', '通告', '消息', '我的']) {
        expect(find.descendant(of: nav, matching: find.text(label)),
            findsOneWidget);
      }
      if (i == 1) expect(find.textContaining('试镜预约暂未开放'), findsOneWidget);
      if (i == 2) expect(find.textContaining('六类通告与单向投稿正在接入'), findsOneWidget);
      expect(t.takeException(), isNull);
      await shot(t, 'tab-$i');
    }
    await press(t, find.byTooltip('设置与帮助'));
    expect(find.text('用户协议'), findsWidgets);
    expect(find.byType(NavigationBar), findsNothing);
    await press(t, find.byType(BackButton));
    await press(t, find.text('手机号登录'));
    expect(find.text('手机号'), findsWidgets);
    expect(find.text('验证码'), findsWidgets);
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '登录 / 注册'))
            .onPressed,
        isNull);
    await shot(t, 'login-empty');
    expect(t.takeException(), isNull);
  });

  testWidgets('安卓真实故事草稿、提交和身份切换', (t) async {
    await bootSyntheticAndroid();
    await wait(t, find.byType(NavigationBar));
    await frames(t, 15);
    await binding.convertFlutterSurfaceToImage();
    final session =
        t.element(find.byType(NavigationBar)).read<AccountSession>();
    expect(session.isLoggedIn, isTrue);
    await press(t, find.text('把我的故事拍成片'));
    await press(t, find.text('测试用必填附件场景'));
    await wait(t, find.text('正式提交需求'));
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '正式提交需求'))
            .onPressed,
        isNull);
    await press(t, find.text('测试用家庭故事'));
    await press(t, find.text('正式提交需求'));
    expect(find.text('这一项尚未填写。'), findsNWidgets(2));
    final field = find.byKey(const ValueKey('story-field-story'));
    await t.ensureVisible(field);
    await t.enterText(field, '安卓合成故事：记录一家人团聚的片段。');
    FocusManager.instance.primaryFocus?.unfocus();
    await frames(t);
    await press(t, find.text('保存业务草稿'));
    await t.drag(find.byType(Scrollable).first, const Offset(0, 1600));
    await frames(t, 15);
    await wait(t, find.text('故事草稿已保存，可以从“我的需求”继续填写。'));
    await shot(t, 'story-draft');
    await press(t, find.byType(DropdownButtonFormField<String>));
    await press(t, find.text('温暖').last);
    await press(t, find.text('正式提交需求'));
    await press(t, find.text('确认'));
    await wait(t, find.text('平台待查看'));
    expect(find.text('保存业务草稿'), findsNothing);
    await shot(t, 'story-submitted');
    await press(t, find.byType(BackButton));
    await press(t, find.byKey(const Key('app-tab-4')));
    final original = session.partyId;
    final others =
        session.parties.where((p) => p['party']?['id'] != original).toList();
    expect(others, isNotEmpty, reason: '模拟账号必须同时有个人和机构身份。');
    await press(t, find.text('切换身份'));
    await wait(t, find.text('选择办事身份'));
    for (var i = 0; i < 4; i++) {
      final before = session.partyId;
      await t.drag(find.byType(Scrollable).first, const Offset(0, 2000));
      await frames(t, 10);
      await t.scrollUntilVisible(find.text('使用此身份'), 250,
          scrollable: find.byType(Scrollable).first, maxScrolls: 20);
      await press(t, find.text('使用此身份'));
      expect(session.partyId, isNot(before));
      final selected = session.partyId;
      await frames(t, 25);
      expect(session.partyId, selected, reason: '切换后旧请求不得让身份跳回。');
      expect(find.byType(AccountPage), findsOneWidget);
      expect(ModalRoute.of(t.element(find.byType(AccountPage)))!.settings.name,
          '/account');
      if (i == 0) await shot(t, 'identity-selected');
      expect(t.takeException(), isNull);
    }
    await shot(t, 'identity-switch');
    await press(t, find.byType(BackButton));
    binding.reportData ??= <String, dynamic>{};
    binding.reportData!['synthetic_logged_in'] = true;
    binding.reportData!['other_identity_count'] = others.length;
    await shot(t, 'logged-in-my');
    expect(t.takeException(), isNull);
  });
  testWidgets('安卓报价确认生成未付款订单，金额与合同状态核对', (t) async {
    await bootSyntheticAndroid();
    await wait(t, find.byType(NavigationBar));
    await frames(t, 15);
    await binding.convertFlutterSurfaceToImage();
    final ctx = t.element(find.byType(NavigationBar));
    final session = ctx.read<AccountSession>();
    const quoteId = String.fromEnvironment('R01_QUOTE_ID');
    expect(quoteId, isNotEmpty);
    Navigator.of(ctx).pushNamed('/trade/record?recordId=$quoteId');
    final initialQuote = await session.read('/api/v1/trade/records/$quoteId',
        actingParty: session.partyId);
    final alreadyAccepted = initialQuote['current_status'] == 'ACCEPTED';
    await wait(t, find.text(alreadyAccepted ? '查看已形成订单' : '确认报价形成订单'));
    await shot(t, 'quote-confirm');
    if (alreadyAccepted) {
      await press(t, find.text('查看已形成订单'));
    } else {
      await press(t, find.text('确认报价形成订单'));
      await press(t, find.text('确认办理'));
    }
    await wait(t, find.textContaining('生成订单不代表已付款或签署'));
    await shot(t, 'order-unpaid');
    final quote = await session.read('/api/v1/trade/records/$quoteId',
        actingParty: session.partyId);
    expect(quote['current_status'], 'ACCEPTED');
    final orderId = quote['order_id'] ?? quote['data']['order_id'];
    expect(orderId, isNotNull);
    final order = await session.read('/api/v1/trade/records/$orderId',
        actingParty: session.partyId);
    expect(order['current_status'], 'OPEN');
    expect(order['data']['financial']['received_minor'], 0);
    expect(order['data']['contract']['signing_method'], 'NOT_SIGNED');
    binding.reportData ??= <String, dynamic>{};
    binding.reportData!['native_quote_order_verified'] = {
      'action': alreadyAccepted ? 'OPENED_EXISTING_ORDER' : 'CREATED_ORDER',
      'order_id': orderId,
      'received_minor': 0,
      'signing_method': 'NOT_SIGNED'
    };
    expect(t.takeException(), isNull);
  });
}
