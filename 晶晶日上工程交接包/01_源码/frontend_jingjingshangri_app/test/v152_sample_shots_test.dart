// V15.2「曜石流光·位图材质+代码」样板 harness（2026-09-02）：
// 高保真渲染【登录】+【首页】两个真机样板（390x844），输出 build/shots/v152_sample/。
// 数据走 demo，确定性、不联网；位图背景/Logo 走真实 asset 解码。
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart' show FontLoader;
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';
import 'package:jingjingshangri_app/widgets/main_scaffold.dart';

Future<void> _bootDemo() async {
  SharedPreferences.setMockInitialValues({'connMode': 'demo'});
  await AppMode.instance.load();
  await ApiService().init();
  Future<void> inject(String family, String winPath) async {
    final f = File(winPath);
    if (!f.existsSync()) return;
    final raw = await f.readAsBytes();
    final loader = FontLoader(family);
    loader.addFont(Future<ByteData>.value(raw.buffer.asByteData()));
    await loader.load();
  }

  await inject('Roboto', r'C:\Windows\Fonts\msyh.ttc');
  await inject('serif', r'C:\Windows\Fonts\NotoSerifSC-VF.ttf');
  final iconFont =
      r'C:\src\flutter\bin\cache\artifacts\material_fonts\materialicons-regular.otf';
  await inject('MaterialIcons', iconFont);
  await inject('MaterialIcons Rounded', iconFont);
  await inject('MaterialIcons Outlined', iconFont);
  await inject('MaterialIcons Sharp', iconFont);
}

Future<UserProvider> _loggedInUser() async {
  final up = UserProvider();
  await up.saveLogin({
    'token': 'demo-token',
    'user': {
      'id': 1,
      'nickname': '林晚晴',
      'phone': '138****6688',
      'avatar': '',
      'role': 'user',
    },
  });
  return up;
}

Future<void> _shoot(
  WidgetTester tester,
  String name,
  Widget page, {
  double w = 390,
  double h = 844,
  UserProvider? user,
}) async {
  tester.view.physicalSize = Size(w, h);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final up = user ?? UserProvider();
  await tester.pumpWidget(
    ChangeNotifierProvider<UserProvider>.value(
      value: up,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: RepaintBoundary(child: Scaffold(body: page)),
      ),
    ),
  );

  // 动画推进到位
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 160));
  }
  // 等位图背景/Logo/网络占位 asset 解码
  await tester.runAsync(() async {
    await Future<void>.delayed(const Duration(milliseconds: 1400));
  });
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 90));
  }
  await tester.runAsync(() async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
  });
  await tester.pump(const Duration(milliseconds: 90));

  final boundary = tester
      .renderObject(find.byType(RepaintBoundary).first) as RenderRepaintBoundary;
  late Uint8List bytes;
  await tester.runAsync(() async {
    final image =
        await boundary.toImage(pixelRatio: 1.5).timeout(const Duration(seconds: 14));
    final data = await image
        .toByteData(format: ui.ImageByteFormat.png)
        .timeout(const Duration(seconds: 14));
    bytes = data!.buffer.asUint8List();
    image.dispose();
  });

  final dir = Directory('build/shots/v152_sample');
  dir.createSync(recursive: true);
  final file = File('${dir.path}/$name.png');
  file.writeAsBytesSync(bytes);
  // ignore: avoid_print
  print('SHOT ${file.path}  ${w.toInt()}x${h.toInt()}  ${bytes.length}B');
}

void main() {
  setUpAll(_bootDemo);

  testWidgets('V152-登录 390', (tester) async {
    await _shoot(tester, 'v152_login_390', const LoginPage());
  });

  testWidgets('V152-首页 390', (tester) async {
    await _shoot(tester, 'v152_home_390', const MainScaffold(initialTab: 0),
        user: await _loggedInUser());
  });
}
