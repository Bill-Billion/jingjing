// A8：创建数字人向导 step1 真人验证门槛、step4 授权范围门槛锁定（第21轮 A3 保险）。
// 复用 audition_name_gate_test 的范式：mock image_picker 假图过 step0、推进 2s 离线路演
// 活体过 step1；推进步骤直接调 PrimaryButton.onPressed 以避开 SnackBar 坐标遮挡。
//  - step1：未勾选活体同意 / 勾选但未完成活体，均不得下一步；
//  - step4：三项授权全不选不得下一步，勾选任一后进入确认创建步。
// 全程 demo 离线，不触插件原生层、不提交 createHuman。
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/widgets/primary_button.dart';
import 'package:jingjingshangri_app/pages/audition/audition_page.dart';

const _png1x1 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

Future<void> boot() async {
  SharedPreferences.setMockInitialValues({'connMode': 'demo'});
  await AppMode.instance.load();
  await ApiService().init();
}

Future<UserProvider> user() async {
  final up = UserProvider();
  await up.saveLogin({
    'token': 'demo-token',
    'user': {'id': 1, 'nickname': '林晚晴', 'phone': '138****6688', 'role': 'user'},
  });
  return up;
}

Widget wrap(Widget child, UserProvider up) =>
    ChangeNotifierProvider<UserProvider>.value(
      value: up,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: child,
      ),
    );

Future<void> nextBtn(WidgetTester t) async {
  t.widget<PrimaryButton>(find.widgetWithText(PrimaryButton, '下一步')).onPressed!();
  await t.pump(const Duration(milliseconds: 320));
}

// 清空 SnackBar 队列：先挂载、走完默认 4s、再退场。
Future<void> clearSnack(WidgetTester t) async {
  await t.pump(const Duration(milliseconds: 300));
  await t.pump(const Duration(seconds: 5));
  await t.pump(const Duration(milliseconds: 400));
}

Future<void> settle(WidgetTester t) async {
  for (var i = 0; i < 6; i++) {
    await t.pump(const Duration(milliseconds: 120));
  }
  await t.pump(const Duration(milliseconds: 200));
}

// 过 step0：勾选照片同意 → 弹层拍照（mock 通道返回假图）。
Future<void> passStep0(WidgetTester t, String photoPath) async {
  const ch = MethodChannel('plugins.flutter.io/image_picker');
  t.binding.defaultBinaryMessenger.setMockMethodCallHandler(ch,
      (call) async => call.method == 'pickImage' ? photoPath : null);
  addTearDown(() => t.binding.defaultBinaryMessenger
      .setMockMethodCallHandler(ch, null));
  await t.tap(find.text('我已知晓照片用途，同意上传'));
  await t.pump(const Duration(milliseconds: 160));
  await t.tap(find.text('点击上传正面清晰照片'));
  await t.pump(const Duration(milliseconds: 400));
  await t.pump(const Duration(milliseconds: 400));
  await t.tap(find.text('拍照'));
  await t.pump(const Duration(milliseconds: 400));
}

// 完成 step1 离线路演活体（调用前先勾选活体同意）。
Future<void> passLiveness(WidgetTester t) async {
  await t.tap(find.text('我已知晓，开始验证'));
  await t.pump(const Duration(milliseconds: 160));
  await t.tap(find.textContaining('点击开始真人验证'));
  await t.pump(const Duration(milliseconds: 300));
  await t.pump(const Duration(seconds: 2, milliseconds: 200));
  await clearSnack(t);
}

void main() {
  late String photoPath;
  setUpAll(() async {
    await boot();
    final f = File('${Directory.systemTemp.path}/jjsr_fake_face2.png');
    await f.writeAsBytes(base64Decode(_png1x1));
    photoPath = f.path;
  });

  testWidgets('step1 未勾选活体同意不得下一步', (t) async {
    t.view.physicalSize = const Size(390.0, 1700.0);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    final up = await user();
    await t.pumpWidget(wrap(const AuditionPage(), up));
    await settle(t);

    await passStep0(t, photoPath);
    await nextBtn(t);
    expect(find.text('第 2/6 步 · 真人验证'), findsOneWidget);

    // 不勾选同意，直接下一步
    await nextBtn(t);
    expect(find.text('请先阅读并同意活体检测说明'), findsOneWidget);
    expect(find.text('第 2/6 步 · 真人验证'), findsOneWidget);
    expect(find.text('第 3/6 步 · 选择风格'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('step1 勾选同意但未完成活体不得下一步', (t) async {
    t.view.physicalSize = const Size(390.0, 1700.0);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    final up = await user();
    await t.pumpWidget(wrap(const AuditionPage(), up));
    await settle(t);

    await passStep0(t, photoPath);
    await nextBtn(t);
    expect(find.text('第 2/6 步 · 真人验证'), findsOneWidget);

    // 只勾选同意、不点击完成活体
    await t.tap(find.text('我已知晓，开始验证'));
    await t.pump(const Duration(milliseconds: 160));
    await nextBtn(t);
    expect(find.text('请先完成活体检测'), findsOneWidget);
    expect(find.text('第 2/6 步 · 真人验证'), findsOneWidget);
    expect(find.text('第 3/6 步 · 选择风格'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('step4 授权范围空选拦截、勾选后进入确认步', (t) async {
    t.view.physicalSize = const Size(390.0, 1700.0);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    final up = await user();
    await t.pumpWidget(wrap(const AuditionPage(), up));
    await settle(t);

    // step0 → step1 → 完成活体 → step2 → step3 命名 → step4
    await passStep0(t, photoPath);
    await nextBtn(t);
    expect(find.text('第 2/6 步 · 真人验证'), findsOneWidget);
    await passLiveness(t);
    await nextBtn(t);
    expect(find.text('第 3/6 步 · 选择风格'), findsOneWidget);
    await nextBtn(t);
    expect(find.text('第 4/6 步 · 命名'), findsOneWidget);
    await t.enterText(find.byType(TextField), '顾夜白');
    await t.pump(const Duration(milliseconds: 160));
    await nextBtn(t);
    expect(find.text('第 5/6 步 · 授权范围'), findsOneWidget);

    // 产品默认勾选"祝福视频"，先手动取消使三项全不选：拦截
    await t.tap(find.text('祝福视频'));
    await t.pump(const Duration(milliseconds: 160));
    await nextBtn(t);
    expect(find.text('请至少选择一项授权范围'), findsOneWidget);
    expect(find.text('第 5/6 步 · 授权范围'), findsOneWidget);
    expect(find.text('第 6/6 步 · 确认创建'), findsNothing);

    // 重新勾上"祝福视频"后放行
    await t.tap(find.text('祝福视频'));
    await t.pump(const Duration(milliseconds: 160));
    await nextBtn(t);
    expect(find.text('第 6/6 步 · 确认创建'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
