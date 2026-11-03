// Android-only, loopback synthetic fixture; no provider calls or real money.
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'synthetic_android.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const project = String.fromEnvironment('PR39_SUMMARY_PROJECT');
  const origin = String.fromEnvironment('R01_API_ORIGIN');
  const token = String.fromEnvironment('PR39_CONTROL_TOKEN');
  const note =
      '测试渠道的记账不代表真实资金到账；请核对原付款和退款记录的渠道、环境及回执。';

  Future<void> frames(WidgetTester tester, [int count = 5]) async {
    for (var i = 0; i < count; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
  }

  Future<void> reveal(WidgetTester tester, Finder target) async {
    for (var i = 0; i < 45 && target.evaluate().isEmpty; i++) {
      if (find.byType(Scrollable).evaluate().isNotEmpty) {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -300));
      }
      await frames(tester, 2);
    }
    expect(target, findsWidgets);
    await tester.ensureVisible(target.first);
    await frames(tester);
  }

  testWidgets('原生同一合成订单的记账汇总不声称真实到账', (tester) async {
    expect(Platform.isAndroid, true);
    expect(project, isNotEmpty);
    await bootSyntheticAndroid();
    for (var i = 0;
        i < 150 && find.byType(NavigationBar).evaluate().isEmpty;
        i++) {
      await frames(tester, 1);
    }
    expect(find.byType(NavigationBar), findsOneWidget);
    final navigator = Navigator.of(tester.element(find.byType(NavigationBar)));
    navigator.pushNamed('/production/project?projectId=$project');
    await frames(tester, 15);
    await reveal(tester, find.text('订单记账收款'));
    await reveal(tester, find.text(note));
    await binding.convertFlutterSurfaceToImage();
    await frames(tester);
    final bytes = await binding.takeScreenshot('android-pr39-ledger-note');
    binding.reportData?.remove('screenshots');
    final client = HttpClient();
    try {
      final request = await client.postUrl(
          Uri.parse('$origin/__synthetic/evidence/ledger-note'));
      request.headers.set('Authorization', 'Bearer $token');
      request.headers.contentType = ContentType('image', 'png');
      request.add(bytes);
      final response = await request.close();
      await response.drain<void>();
      expect(response.statusCode, 201);
    } finally {
      client.close(force: true);
    }
    expect(tester.takeException(), isNull);
  }, timeout: const Timeout(Duration(minutes: 4)));
}
