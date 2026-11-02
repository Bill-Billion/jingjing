// Real Android widgets, private video decoder and isolated HTTP/MySQL.
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'synthetic_android.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const origin = String.fromEnvironment('R01_API_ORIGIN');
  const controlToken = String.fromEnvironment('PR39_CONTROL_TOKEN');
  Future<Map<String, dynamic>> control(String action) async {
    debugPrint('PR39_NATIVE_STEP $action');
    final client = HttpClient();
    try {
      final r = await client.postUrl(Uri.parse('$origin/__synthetic/control'));
      r.headers.set('Authorization', 'Bearer $controlToken');
      r.headers.contentType = ContentType.json;
      r.write(jsonEncode({'action': action}));
      final response = await r.close();
      final data = jsonDecode(await utf8.decoder.bind(response).join())
          as Map<String, dynamic>;
      expect(response.statusCode, 200, reason: '$action: $data');
      return data;
    } finally {
      client.close(force: true);
    }
  }

  Future<void> frames(WidgetTester t, [int n = 5]) async {
    for (var i = 0; i < n; i++) {
      await t.pump(const Duration(milliseconds: 200));
    }
  }

  Future<void> wait(WidgetTester t, Finder f) async {
    for (var i = 0; i < 150 && f.evaluate().isEmpty; i++) {
      await frames(t, 1);
    }
    if (f.evaluate().isEmpty) {
      debugPrint('PR39_NATIVE_MISSING $f');
      debugPrint(find
          .byType(Text)
          .evaluate()
          .map((e) => (e.widget as Text).data)
          .whereType<String>()
          .join(' | '));
    }
    expect(f, findsWidgets);
  }

  Future<void> reveal(WidgetTester t, Finder f) async {
    if (f.evaluate().isEmpty && find.byType(Scrollable).evaluate().isNotEmpty) {
      t
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .jumpTo(0);
      await frames(t, 2);
    }
    for (var i = 0; i < 30 && f.evaluate().isEmpty; i++) {
      final scroll = find.byType(Scrollable);
      if (scroll.evaluate().isNotEmpty)
        await t.drag(scroll.first, const Offset(0, -400));
      await frames(t, 2);
    }
    await wait(t, f);
    await t.ensureVisible(f.first);
    await frames(t, 2);
  }

  Future<void> press(WidgetTester t, Finder f) async {
    await reveal(t, f);
    await t.tap(f.first);
    await frames(t);
  }

  Future<void> shot(WidgetTester t, String name) async {
    await frames(t);
    final bytes = await binding.takeScreenshot('android-pr39-$name');
    final dir = Directory('${Directory.systemTemp.path}/jx-native-evidence');
    await dir.create(recursive: true);
    await File('${dir.path}/android-pr39-$name.png').writeAsBytes(bytes);
    binding.reportData!.remove('screenshots');
    final client = HttpClient();
    try {
      final request = await client.postUrl(Uri.parse('$origin/__synthetic/evidence/$name'));
      request.headers.set('Authorization', 'Bearer $controlToken');
      request.headers.contentType = ContentType('image', 'png');
      request.add(bytes);
      final response = await request.close();
      await response.drain<void>();
      expect(response.statusCode, 201);
    } finally {
      client.close(force: true);
    }

  }

  const resumeProject = String.fromEnvironment('PR39_RESUME_PROJECT');
  testWidgets(resumeProject.isEmpty ? '原生Android同一人工视频订单：报价、30/40/30、脚本改版、5工作日、付清后私有下载' : '原生Android同一订单重启后再次核权、下载与保存', (t) async {
    expect(Platform.isAndroid, true);
    await bootSyntheticAndroid();
    await wait(t, find.byType(NavigationBar));
    await frames(t, 10);
    await binding.convertFlutterSurfaceToImage();
    final navigator = Navigator.of(t.element(find.byType(NavigationBar)));
    Future<void> open(String route) async {
      navigator.popUntil((r) => r.isFirst);
      await frames(t);
      navigator.pushNamed(route);
      await frames(t, 15);
    }

    Future<void> savedOriginal() async {
      debugPrint('PR39_NATIVE_SAVE_DIALOG');
      final saved = find.text('当前原片已保存。');
      // The native document picker pauses rendering. Keep the asynchronous
      // result's top-of-page slot in view after returning to Flutter.
      for (var i = 0; i < 300 && saved.evaluate().isEmpty; i++) {
        final scrolls = find.byType(Scrollable);
        if (scrolls.evaluate().isNotEmpty) {
          t.state<ScrollableState>(scrolls.first).position.jumpTo(0);
        }
        await frames(t, 1);
      }
      expect(saved, findsOneWidget);
      await shot(t, 'final-saved');
      final result = await control('complete');
      expect(result['state'], 'DELIVERED');
      binding.reportData ??= {};
      binding.reportData!['pr39_same_order'] = result;
      expect(t.takeException(), isNull);
    }
    if (resumeProject.isNotEmpty) {
      await open('/production/work?projectId=$resumeProject');
      await press(t, find.text('下载当前原片'));
      await savedOriginal();
      return;
    }

    await open(
        '/trade/record?recordId=${const String.fromEnvironment('R01_QUOTE_ID')}');
    await press(t, find.text('确认报价形成订单'));
    await press(t, find.text('确认办理'));
    await frames(t, 15);
    await shot(t, 'order-created');
    final setup = await control('start');
    final project = setup['project_id'] as String;
    Future<void> accept(String version,
        {required bool script, bool receipt = false}) async {
      await open('/production/version?versionId=$version');
      await press(t, find.text(script ? '完整阅读' : '播放预览'));
      await frames(t, 12);
      // Native video must actually initialize/play before the page marks it opened.
      if (script && find.text('返回审阅').evaluate().isNotEmpty) {
        await press(t, find.text('返回审阅'));
      }
      await reveal(t, find.text('本版内容已打开。请自行核对完整内容，再勾选验收项。'));
      if (receipt) {
        await press(t, find.text('确认本次交付通知已读'));
        await press(t, find.text('明确确认本次交付已收到'));
        await press(t, find.text('确认办理'));
        await frames(t, 10);
        await control('check-receipt');
        await shot(t, 'five-working-days');
      }
      for (final name in script
          ? ['script_reviewed']
          : [
              'script_reviewed',
              'specification_reviewed',
              'audio_reviewed',
              'branding_reviewed'
            ]) {
        await press(t, find.byKey(ValueKey('production-check-$name')));
      }
      if (!script) {
        await press(t, find.text('本版确认与修改意见'));
        await press(t, find.text('确认本版'));
      }
      final note = find.byWidgetPredicate(
          (w) => w is TextField && w.decoration?.labelText == '确认说明');
      await reveal(t, note);
      await t.enterText(note.first, '合成安卓客户逐版核对');
      FocusManager.instance.primaryFocus?.unfocus();
      await frames(t);
      await press(t, find.text(script ? '确认这版剧本' : '提交本版确认'));
      await press(t, find.text('确认办理'));
      // Wait for the confirmed write and its replacement route before changing
      // the server version. Fixed frame delays can race real native HTTP.
      await wait(t, find.text('制作项目'));
      for (var i = 0;
          i < 150 && find.byType(LinearProgressIndicator).evaluate().isNotEmpty;
          i++) {
        await frames(t, 1);
      }
      expect(find.byType(LinearProgressIndicator), findsNothing);
    }

    await accept(setup['version_id'] as String, script: true);
    await shot(t, 'script-confirmed');
    final revision = await control('revise-script');
    await accept(revision['version_id'] as String, script: true);
    final sample = await control('interim');
    await accept(sample['version_id'] as String, script: false);
    await shot(t, 'sample-confirmed');
    final rough = await control('rough');
    await accept(rough['version_id'] as String, script: false);
    final finalVersion = await control('final');
    await accept(finalVersion['version_id'] as String,
        script: false, receipt: true);
    await open('/production/work?projectId=$project');
    await reveal(t, find.widgetWithText(FilledButton, '下载当前原片'));
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '下载当前原片'))
            .onPressed,
        isNull);
    await shot(t, 'tail-unpaid');
    await control('tail');
    await press(t, find.text('重新核对交付条件'));
    await press(t, find.text('下载当前原片'));
    await savedOriginal();
  }, timeout: const Timeout(Duration(minutes: 12)));
}
