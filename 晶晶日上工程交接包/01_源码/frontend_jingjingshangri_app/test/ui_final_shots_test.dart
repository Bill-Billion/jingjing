// UI 提升阶段·高保真效果图 harness（2026-08-31）：
// 390x844 离屏渲染 5 张关键页 + 360/390/840 三档响应式，输出 build/shots/ui_final/。
// 数据走 demo（MockData），确定性、不联网。
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
import 'package:jingjingshangri_app/services/mock_data.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';
import 'package:jingjingshangri_app/widgets/main_scaffold.dart';
import 'package:jingjingshangri_app/widgets/glow_panel.dart';
import 'package:jingjingshangri_app/pages/humans/humans_page.dart';
import 'package:jingjingshangri_app/pages/ai_studio/ai_task_page.dart';
import 'package:jingjingshangri_app/pages/orders/orders_page.dart';
import 'package:jingjingshangri_app/pages/wallet/wallet_page.dart';
import 'package:jingjingshangri_app/pages/ai_studio/my_works_page.dart';
import 'package:jingjingshangri_app/pages/projects/projects_page.dart';

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

  await inject('Roboto', r'C:\Windows\Fonts\NotoSansSC-VF.ttf');
  await inject('serif', r'C:\Windows\Fonts\NotoSerifSC-VF.ttf');
  await inject('MaterialIcons',
      r'C:\src\flutter\bin\cache\artifacts\material_fonts\materialicons-regular.otf');
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
  int fakePumps = 4,
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

  for (var i = 0; i < fakePumps; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }

  final boundary = tester
      .renderObject(find.byType(RepaintBoundary).first) as RenderRepaintBoundary;
  late Uint8List bytes;
  await tester.runAsync(() async {
    if (settleAssets) {
      await Future<void>.delayed(const Duration(milliseconds: 650));
    }
    final image = await boundary
        .toImage(pixelRatio: 1.0)
        .timeout(const Duration(seconds: 10));
    final data = await image
        .toByteData(format: ui.ImageByteFormat.png)
        .timeout(const Duration(seconds: 10));
    bytes = data!.buffer.asUint8List();
    image.dispose();
  });

  final dir = Directory('build/shots/ui_final');
  dir.createSync(recursive: true);
  final file = File('${dir.path}/$name.png');
  file.writeAsBytesSync(bytes);
  // ignore: avoid_print
  print('SHOT ${file.path}  ${w.toInt()}x${h.toInt()}  ${bytes.length}B');
}

void main() {
  setUpAll(_bootDemo);

  // ── 5 张关键页高保真（390x844）──
  testWidgets('F01 登录页', (tester) async {
    await _shoot(tester, 'f01_login_390', const LoginPage());
  });

  testWidgets('F02 首页+五槽等宽底部导航', (tester) async {
    final up = await _loggedInUser();
    await _shoot(tester, 'f02_home_390', const MainScaffold(initialTab: 0),
        user: up);
  });

  testWidgets('F03 中央创作中心五板块', (tester) async {
    await _shoot(tester, 'f03_create_center_390', const GlowPanel());
  });

  testWidgets('F04 AI文生视频线性阶段进度(60%)', (tester) async {
    final created = MockData.aiVideoTask(
        '暖光客厅里，银发奶奶收到生日祝福，笑着挥手，电影感人像');
    final seed = Map<String, dynamic>.from(created['task'] as Map);
    final id = '${seed['id']}';
    await ApiService().getAiTask(id);
    await ApiService().getAiTask(id);
    await _shoot(
      tester,
      'f04_ai_video_progress_390',
      AiTaskPage(
        task: seed,
        kind: 'video',
        prompt: '暖光客厅里，银发奶奶收到生日祝福，笑着挥手，电影感人像',
      ),
      settleAssets: false,
      fakePumps: 5,
    );
  });

  testWidgets('F05 我的页（登录态真实数据）', (tester) async {
    final up = await _loggedInUser();
    await _shoot(tester, 'f05_profile_390', const MainScaffold(initialTab: 4),
        user: up);
  });

  // ── 三档响应式（艺人广场：360 单列不溢出 / 390 基准 / 840 多列双栏）──
  testWidgets('R360 折叠紧凑 360', (tester) async {
    await _shoot(tester, 'r360_humans', const HumansPage(), w: 360, h: 780);
  });

  testWidgets('R390 基准 390', (tester) async {
    await _shoot(tester, 'r390_humans', const HumansPage(), w: 390, h: 844);
  });

  testWidgets('R840 展开 840 多列', (tester) async {
    final up = await _loggedInUser();
    await _shoot(tester, 'r840_home', const MainScaffold(initialTab: 0),
        w: 840, h: 1100, user: up);
  });

  // ── 360 紧凑宽度逐页不溢出巡检（列表/订单/钱包/作品/项目）──
  testWidgets('C360 紧凑宽度逐页不溢出', (tester) async {
    final up = await _loggedInUser();
    await _shoot(tester, 'c360_orders', const OrdersPage(),
        w: 360, h: 780, user: up);
    await _shoot(tester, 'c360_wallet', const WalletPage(),
        w: 360, h: 780, user: up);
    await _shoot(tester, 'c360_my_works', const MyWorksPage(),
        w: 360, h: 780, user: up);
    await _shoot(tester, 'c360_projects', const ProjectsPage(),
        w: 360, h: 780, user: up);
  });
}
