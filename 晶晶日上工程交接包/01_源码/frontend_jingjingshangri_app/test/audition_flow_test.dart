// A8（第47轮）：创建数字人分步流 AuditionPage 护栏。
// 锁：①协议/同意默认不勾；②每步门槛（先同意照片说明、再必须有照片）顺序不可绕过；
// ③真人拍摄要点提示（本人正脸/禁动漫网图，呼应“真人头像非动漫”铁律）不被删；④步骤条六步完整。
// 页面含 LiquidScaffold 流光（无限动画），禁止 pumpAndSettle，统一逐帧 pump。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/audition/audition_page.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({'connMode': 'demo'});
    await AppMode.instance.load();
    await ApiService().init();
  });

  tearDown(() async {
    await AppMode.instance.setMode(ConnMode.demo);
  });

  Future<void> boot(WidgetTester t) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const AuditionPage(),
    ));
    for (var i = 0; i < 8; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
  }

  testWidgets('初始停在第1步、步骤条六步完整、当前步名正确', (t) async {
    await boot(t);
    expect(find.text('第 1/6 步 · 上传照片'), findsOneWidget);
    expect(find.text('创建数字人'), findsOneWidget);
    for (final n in ['1', '2', '3', '4', '5', '6']) {
      expect(find.text(n), findsOneWidget, reason: '步骤圆点 $n');
    }
    // 第1步只有“下一步”，没有“上一步”
    expect(find.text('下一步'), findsOneWidget);
    expect(find.text('上一步'), findsNothing);
  });

  testWidgets('未同意照片说明时点下一步被拦截、不前进（默认不勾）', (t) async {
    await boot(t);
    await t.tap(find.text('下一步'));
    for (var i = 0; i < 3; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    expect(find.text('请先阅读并同意照片使用说明'), findsOneWidget);
    expect(find.text('第 1/6 步 · 上传照片'), findsOneWidget); // 仍在第1步
  });

  testWidgets('同意说明但未上传照片，仍被拦截并提示上传', (t) async {
    await boot(t);
    await t.tap(find.text('我已知晓照片用途，同意上传')); // 勾选
    await t.pump(const Duration(milliseconds: 200));
    await t.tap(find.text('下一步'));
    for (var i = 0; i < 3; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    expect(find.text('请先上传照片'), findsOneWidget);
    expect(find.text('第 1/6 步 · 上传照片'), findsOneWidget); // 照片缺失，不得跳步
  });

  testWidgets('真人照片拍摄要点提示完整呈现（本人正脸/禁动漫网图）', (t) async {
    await boot(t);
    expect(find.textContaining('本人真实正脸'), findsOneWidget);
    expect(find.textContaining('正对镜头、光线均匀'), findsOneWidget);
    expect(find.textContaining('请勿上传动漫形象、网络图片或他人照片'),
        findsOneWidget);
  });
}
