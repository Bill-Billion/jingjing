// Real Android rendering and read-only isolated artists APIs; no paid services.
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'synthetic_android.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const person = String.fromEnvironment('R03_PERSON_ID');
  const hosting = String.fromEnvironment('R03_HOSTING_ID');
  Future<void> frames(WidgetTester t, [int count = 8]) async {
    for (var i = 0; i < count; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> wait(WidgetTester t, Finder f) async {
    for (var i = 0; i < 200 && f.evaluate().isEmpty; i++) {
      await frames(t, 1);
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

  Future<void> open(WidgetTester t, String route) async {
    Navigator.of(t.element(find.byType(Scaffold).last))
        .pushNamedAndRemoveUntil(route, (r) => r.isFirst);
    await frames(t, 15);
  }

  Future<void> shot(WidgetTester t, String name) async {
    await frames(t);
    final bytes = await binding.takeScreenshot('android-r03-$name');
    final dir = Directory('${Directory.systemTemp.path}/jx-native-evidence');
    await dir.create(recursive: true);
    await File('${dir.path}/android-r03-$name.png').writeAsBytes(bytes);
    binding.reportData!.remove('screenshots');
    (binding.reportData!['native_screenshot_files'] ??= <String>[])
        .add('android-r03-$name.png');
  }

  testWidgets('安卓本人艺人档案与实名未启用边界', (t) async {
    expect(Platform.isAndroid, true);
    expect(person, isNotEmpty);
    await bootSyntheticAndroid();
    await frames(t, 20);
    await wait(t, find.byType(NavigationBar));
    await binding.convertFlutterSurfaceToImage();
    await open(t, '/my-humans');
    await press(t, find.byKey(ValueKey('artist-person-$person')));
    await wait(t, find.text('核对实名服务结果'));
    final identityButton = find.ancestor(
      of: find.text('核对实名服务结果'),
      matching: find.byWidgetPredicate((w) => w is ButtonStyleButton),
    );
    expect(t.widget<ButtonStyleButton>(identityButton).onPressed, isNull);
    expect(find.textContaining('本人档案'), findsWidgets);
    await shot(t, 'person');
    expect(t.takeException(), isNull);
  });
  testWidgets('安卓托管记录打开同一原订单', (t) async {
    await bootSyntheticAndroid();
    await frames(t, 20);
    await wait(t, find.byType(NavigationBar));
    await binding.convertFlutterSurfaceToImage();
    await open(t, '/artists/record?personId=$person&recordId=$hosting');
    await wait(t, find.text('创建与托管'));
    await t.scrollUntilVisible(find.text('查看服务原订单'), 300,
        scrollable: find.byType(Scrollable).first);
    await frames(t);
    await wait(t, find.text('查看服务原订单'));
    await shot(t, 'hosting');
    await press(t, find.text('查看服务原订单'));
    await wait(t, find.text('订单详情'));
    await shot(t, 'hosting-order');
    expect(t.takeException(), isNull);
  });
  testWidgets('安卓公开目录通过受控接口读取预览', (t) async {
    await bootSyntheticAndroid();
    await frames(t, 20);
    await wait(t, find.byType(NavigationBar));
    await binding.convertFlutterSurfaceToImage();
    await open(t, '/artists/catalog');
    await wait(t, find.text('公开艺人'));
    await t.scrollUntilVisible(find.text('读取这份获准预览'), 300,
        scrollable: find.byType(Scrollable).first);
    await press(t, find.text('读取这份获准预览'));
    final preview = find.byWidgetPredicate(
        (w) => w is Semantics && w.properties.label == '当前获准的指定预览');
    await wait(t, preview);
    await t.ensureVisible(preview);
    await frames(t);
    await shot(t, 'catalog');
    expect(t.takeException(), isNull);
  });
}
