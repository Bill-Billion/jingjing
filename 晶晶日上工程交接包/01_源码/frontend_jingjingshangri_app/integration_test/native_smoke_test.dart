// Runs the current app on an actual iOS target. No demo session or fake API.
// This is a native startup/navigation check, not authenticated business coverage.
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:jingjingshangri_app/main.dart' as app;

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('真实iOS新版启动、五入口、子页返回与登录空态', (tester) async {
    expect(Platform.isIOS, isTrue, reason: '这个检查必须在 iOS 目标上执行。');
    await app.main();
    await tester.pumpAndSettle();

    void expectTabs(int selected) {
      final navigation = find.byType(NavigationBar);
      expect(navigation, findsOneWidget);
      expect(tester.widget<NavigationBar>(navigation).selectedIndex, selected);
      for (final label in ['首页', '入戏', '培育', '成角', '我的']) {
        expect(find.descendant(of: navigation, matching: find.text(label)),
            findsOneWidget);
      }
      expect(find.text('页面暂时无法显示'), findsNothing);
      expect(tester.takeException(), isNull);
    }

    Future<void> screenshot(String name) async {
      await tester.pumpAndSettle();
      final bytes = await binding.takeScreenshot(name);
      expect(bytes.length, greaterThan(8));
      expect(bytes.take(8).toList(), [137, 80, 78, 71, 13, 10, 26, 10],
          reason: '截图必须是原生插件实际返回的 PNG。');
    }

    for (var i = 0; i < 5; i++) {
      await tester.tap(find.byKey(Key('app-tab-$i')));
      await tester.pumpAndSettle();
      expectTabs(i);
      await screenshot('ios-tab-$i');
    }

    await tester.tap(find.byTooltip('设置与帮助'));
    await tester.pumpAndSettle();
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('用户协议'), findsOneWidget);
    await screenshot('ios-settings');
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expectTabs(4);

    await tester.tap(find.byKey(const Key('app-tab-0')));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('通知'));
    await tester.pumpAndSettle();
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('暂未开放'), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expectTabs(0);

    await tester.tap(find.byKey(const Key('app-tab-4')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('手机号登录'));
    await tester.pumpAndSettle();
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('手机号'), findsOneWidget);
    expect(find.text('验证码'), findsOneWidget);
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '登录 / 注册'))
            .onPressed,
        isNull);
    expect(tester.takeException(), isNull);
    await screenshot('ios-login-empty');

    // Check the actual phone-to-Mac path without a session or a write request.
    const api = String.fromEnvironment('JX_ACCOUNT_API_URL');
    final apiUri = Uri.parse(api);
    expect(apiUri.scheme, 'http');
    expect(
        RegExp(r'^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)')
            .hasMatch(apiUri.host),
        isTrue,
        reason: '仅验证私有局域网的隔离接口。');
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 10);
    try {
      final request = await client.getUrl(apiUri.resolve('/api/v1/health'));
      final response =
          await request.close().timeout(const Duration(seconds: 15));
      expect(response.statusCode, 401, reason: '未登录访问必须保留身份校验。');
      expect(response.headers.value('x-test-environment'),
          'isolated-pr14-synthetic-sms-private-memory-storage');
      await response.drain<void>();
      binding.reportData!['ios_isolated_api'] = {
        'unauthenticated_status': 401,
        'test_marker_verified': true,
      };
    } finally {
      client.close(force: true);
    }

    // The integration binding uses the real platform input connection.
    // Do not register TestTextInput or set artificial viewInsets for this check.
    expect(binding.registerTestTextInput, isFalse);
    final view = tester.view;
    Map<String, dynamic> metrics() => {
          'logical_width': view.physicalSize.width / view.devicePixelRatio,
          'logical_height': view.physicalSize.height / view.devicePixelRatio,
          'device_pixel_ratio': view.devicePixelRatio,
          'view_padding_top': view.viewPadding.top / view.devicePixelRatio,
          'view_padding_bottom':
              view.viewPadding.bottom / view.devicePixelRatio,
          'view_insets_bottom': view.viewInsets.bottom / view.devicePixelRatio,
        };
    binding.reportData!['ios_view_before_keyboard'] = metrics();
    await tester.tap(find.byType(TextField).first);
    for (var i = 0; i < 100 && view.viewInsets.bottom == 0; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(view.viewInsets.bottom, greaterThan(0),
        reason: '必须观察到实际 iOS 键盘占用区域，不能用模拟输入冒充。');
    binding.reportData!['ios_view_with_keyboard'] = metrics();
    expect(tester.takeException(), isNull);
    await screenshot('ios-login-keyboard');
  });
}
