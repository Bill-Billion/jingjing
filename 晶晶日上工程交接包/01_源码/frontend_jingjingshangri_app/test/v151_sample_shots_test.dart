// V15.1「曜石流光」M0 样板 harness（2026-09-01）：
// 只高保真渲染【登录】+【首页】两个真机样板（390x844 基准，首页另出 360/840），
// 输出 build/shots/v151_sample/。数据走 demo，确定性、不联网；真实 Flutter 代码渲染。
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
  bool settleAssets = true,
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

  // 让流动背景/虹彩/呼吸动画推进到一个稳定可见相位
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 160));
  }

  if (settleAssets) {
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 1000));
    });
    for (var i = 0; i < 4; i++) {
      await tester.pump(const Duration(milliseconds: 90));
    }
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 400));
    });
    await tester.pump(const Duration(milliseconds: 90));
  }

  final boundary = tester
      .renderObject(find.byType(RepaintBoundary).first) as RenderRepaintBoundary;
  late Uint8List bytes;
  await tester.runAsync(() async {
    final image =
        await boundary.toImage(pixelRatio: 1.5).timeout(const Duration(seconds: 12));
    final data = await image
        .toByteData(format: ui.ImageByteFormat.png)
        .timeout(const Duration(seconds: 12));
    bytes = data!.buffer.asUint8List();
    image.dispose();
  });

  final dir = Directory('build/shots/v151_sample');
  dir.createSync(recursive: true);
  final file = File('${dir.path}/$name.png');
  file.writeAsBytesSync(bytes);
  // ignore: avoid_print
  print('SHOT ${file.path}  ${w.toInt()}x${h.toInt()}  ${bytes.length}B');
}

void main() {
  setUpAll(_bootDemo);

  testWidgets('M0-登录 390', (tester) async {
    await _shoot(tester, 'm0_login_390', const LoginPage(), settleAssets: false);
  });

  testWidgets('M0-首页 390', (tester) async {
    await _shoot(tester, 'm0_home_390', const MainScaffold(initialTab: 0),
        user: await _loggedInUser());
  });

  testWidgets('M0-首页 360', (tester) async {
    await _shoot(tester, 'm0_home_360', const MainScaffold(initialTab: 0),
        w: 360, h: 780, user: await _loggedInUser());
  });

  testWidgets('M0-首页 840', (tester) async {
    await _shoot(tester, 'm0_home_840', const MainScaffold(initialTab: 0),
        w: 840, h: 1100, user: await _loggedInUser());
  });
}
