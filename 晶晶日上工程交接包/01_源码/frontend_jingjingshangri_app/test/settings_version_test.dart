// 第66轮 A8：锁定设置页「版本信息」必须引用单点常量 kAppVersionLabel（与 pubspec 对齐），
// 不允许再写死落后版本号（曾误写 V12.1.0，而 pubspec 已 12.3.0）。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/utils/app_version.dart';
import 'package:jingjingshangri_app/pages/profile/settings_page.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  testWidgets('设置页版本信息走 kAppVersionLabel，不残留旧写死版本', (t) async {
    // 版本信息行在列表底部，放大视口确保 ListView 一次性构建（避免懒加载漏建）。
    t.view
      ..devicePixelRatio = 1.0
      ..physicalSize = const Size(390, 1400);
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const SettingsPage(),
    ));
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }

    expect(find.text(kAppVersionLabel), findsOneWidget,
        reason: '版本信息应展示单点常量（=$kAppVersionLabel）');
    expect(find.text('V12.1.0 云端版'), findsNothing,
        reason: '不允许残留写死的落后版本号 V12.1.0');
    // 不写死具体版本号（否则每次发版都要改测试）；锁定 label 由 name 派生、二者一致，
    // 且 name 为非空语义化版本。具体版本与 pubspec 的一致性由出包时 aapt 交叉核验。
    expect(kAppVersionName, isNotEmpty);
    expect(kAppVersionLabel, contains(kAppVersionName));
    expect(t.takeException(), isNull);
  });
}
