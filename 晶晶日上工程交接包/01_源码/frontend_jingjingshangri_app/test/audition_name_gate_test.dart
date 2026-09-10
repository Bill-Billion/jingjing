// A8：创建数字人向导 step3「命名」门槛锁定（第21轮 A3 行为保险）。
// 完整走通 step0 上传照片（mock image_picker 返回真实临时 PNG）→ step1 真人验证
// （勾选同意 + 推进 2s 离线路演活体）→ step2 风格 → step3 命名，断言：
//  - 名字为空点下一步：弹"请给数字人起个名字"，且停留在第 4 步不前进；
//  - 输入名字后点下一步：顺利进入第 5 步授权范围。
// 全程 demo 离线，不触真实拍照插件原生层、不提交 createHuman。
// 踩坑备注：①临时文件写入必须放 setUpAll 真实异步区，testWidgets 的 fakeAsync 区
// await 真实 File IO 会死锁；②活体成功/空名警告的 SnackBar 会贴底遮挡"下一步"
// 按钮导致坐标 tap 命中 SnackBar，故这里直接调用 PrimaryButton.onPressed 回调来
// 推进步骤（本测验证的是门槛逻辑，不是命中几何）。
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

// 直接触发底部"下一步"，绕过 SnackBar 的坐标遮挡；随后 pump 让步骤切换动画落地。
Future<void> next(WidgetTester t) async {
  t.widget<PrimaryButton>(find.widgetWithText(PrimaryButton, '下一步')).onPressed!();
  await t.pump(const Duration(milliseconds: 320));
}

// 1x1 透明 PNG，写入临时目录，供 Image.file 正常解码（避免缺文件异步异常）。
const _png1x1 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

void main() {
  late String photoPath;
  setUpAll(() async {
    await boot();
    final f = File('${Directory.systemTemp.path}/jjsr_fake_face.png');
    await f.writeAsBytes(base64Decode(_png1x1));
    photoPath = f.path;
  });

  testWidgets('step3 命名：空名被拦截、填写后进入下一步', (t) async {
    t.view.physicalSize = const Size(390.0, 1700.0);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);

    // mock image_picker 通道：单图 pickImage 返回临时照片路径
    const pickerCh = MethodChannel('plugins.flutter.io/image_picker');
    t.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(pickerCh, (call) async {
      return call.method == 'pickImage' ? photoPath : null;
    });
    addTearDown(() => t.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(pickerCh, null));

    final up = await user();
    await t.pumpWidget(wrap(const AuditionPage(), up));
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    await t.pump(const Duration(milliseconds: 200));

    // ---- step0：勾选同意 → 上传照片（底部弹层选"拍照"） ----
    await t.tap(find.text('我已知晓照片用途，同意上传'));
    await t.pump(const Duration(milliseconds: 160));
    await t.tap(find.text('点击上传正面清晰照片'));
    await t.pump(const Duration(milliseconds: 400)); // bottom sheet 动画
    await t.pump(const Duration(milliseconds: 400)); // 完全落位
    expect(find.text('拍照'), findsOneWidget);
    await t.tap(find.text('拍照'));
    await t.pump(const Duration(milliseconds: 400)); // pickImage 回写 _photo
    await next(t);
    expect(find.text('第 2/6 步 · 真人验证'), findsOneWidget);

    // ---- step1：勾选同意 → 点验证区 → 推进 2s 离线路演活体 ----
    await t.tap(find.text('我已知晓，开始验证'));
    await t.pump(const Duration(milliseconds: 160));
    await t.tap(find.textContaining('点击开始真人验证'));
    await t.pump(const Duration(milliseconds: 300)); // 验证弹窗出现
    await t.pump(const Duration(seconds: 2, milliseconds: 200)); // 演示活体完成
    // 让活体成功 SnackBar 先挂载、走完默认 4s 时长、再退场，清空提示队列，
    // 否则后续 warn 提示会排队、断言时还没上屏。
    await t.pump(const Duration(milliseconds: 300));
    await t.pump(const Duration(seconds: 5));
    await t.pump(const Duration(milliseconds: 400));
    expect(find.textContaining('真人验证步骤完成'), findsNothing);
    await next(t);
    expect(find.text('第 3/6 步 · 选择风格'), findsOneWidget);

    // ---- step2 风格无门槛，直接下一步到 step3 命名 ----
    await next(t);
    expect(find.text('第 4/6 步 · 命名'), findsOneWidget);

    // ---- 空名：拦截，停留在命名步 ----
    await next(t);
    expect(find.text('请给数字人起个名字'), findsOneWidget);
    expect(find.text('第 4/6 步 · 命名'), findsOneWidget);
    expect(find.text('第 5/6 步 · 授权范围'), findsNothing);

    // ---- 填写名字：进入授权步 ----
    await t.enterText(find.byType(TextField), '苏念卿');
    await t.pump(const Duration(milliseconds: 160));
    await next(t);
    expect(find.text('第 5/6 步 · 授权范围'), findsOneWidget);

    expect(t.takeException(), isNull);
  });
}
