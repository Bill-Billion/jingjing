// 离屏渲染效果图 harness（档案15 遗留项①、§10 验收）：
// 用 flutter test 在无模拟器环境下把关键页面渲染成 PNG，输出到 build/shots/。
// 数据走 demo（MockData），确定性、不联网。
// 运行：flutter test test/shots_test.dart
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
import 'package:jingjingshangri_app/pages/wallet/wallet_page.dart';
import 'package:jingjingshangri_app/pages/usage_report/usage_report_page.dart';
import 'package:jingjingshangri_app/pages/after_sales/after_sales_page.dart';
import 'package:jingjingshangri_app/pages/review/review_page.dart';

Future<void> _bootDemo() async {
  SharedPreferences.setMockInitialValues({'connMode': 'demo'});
  await AppMode.instance.load();
  await ApiService().init();
  // headless 引擎默认字体不含中文字形（会渲染成豆腐块），从系统字体注入
  // Roboto(默认族) 与 serif(标题族)；仅本机存在时生效，跨机自动跳过。
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

/// 把 [page] 在给定逻辑像素尺寸离屏渲染并保存为 PNG。
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
  tester.view.physicalSize = Size(w, h); // devicePixelRatio = 1，逻辑=物理
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final up = user ?? UserProvider();
  await tester.pumpWidget(
    ChangeNotifierProvider<UserProvider>.value(
      value: up,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        // 包一层 Scaffold：为 GlowPanel 这类本由 BottomSheet 提供
        // Material/DefaultTextStyle 的组件补上默认文字样式，避免裸挂时回退到
        // 引擎空字体导致中文豆腐块。
        home: RepaintBoundary(child: Scaffold(body: page)),
      ),
    ),
  );

  // 先用假时钟帧把 setState / demo 数据 / 布局全部定型（动画也推进到稳定相位）。
  for (var i = 0; i < fakePumps; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }

  // 关键：解码等待与 toImage 必须放在「同一个」runAsync 内，且其间不再 pump，
  // 否则图片解码后产生的待绘制帧会让 toImage 在测试假时钟里永久死锁。
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

  final dir = Directory('build/shots');
  dir.createSync(recursive: true);
  final file = File('${dir.path}/$name.png');
  file.writeAsBytesSync(bytes);
  // ignore: avoid_print
  print('SHOT ${file.path}  ${w.toInt()}x${h.toInt()}  ${bytes.length}B');
}

void main() {
  setUpAll(_bootDemo);

  testWidgets('01 登录页', (tester) async {
    await _shoot(tester, '01_login', const LoginPage());
  });

  testWidgets('02 首页+五槽等宽底部导航', (tester) async {
    final up = await _loggedInUser();
    await _shoot(tester, '02_home', const MainScaffold(initialTab: 0),
        user: up);
  });

  testWidgets('03 中央创作 GlowPanel 五板块', (tester) async {
    await _shoot(tester, '03_create_panel', const GlowPanel());
  });

  testWidgets('04 AI 文生视频线性阶段进度(60%)', (tester) async {
    // 预登记一个视频演示任务并推进到第 3 轮（分镜阶段 60%），页面首帧 poll 后定格。
    final created = MockData.aiVideoTask(
        '暖光客厅里，银发奶奶收到生日祝福，笑着挥手，电影感人像');
    final seed = Map<String, dynamic>.from(created['task'] as Map);
    final id = '${seed['id']}';
    await ApiService().getAiTask(id); // polls=1
    await ApiService().getAiTask(id); // polls=2
    await _shoot(
      tester,
      '04_ai_progress',
      AiTaskPage(
        task: seed,
        kind: 'video',
        prompt: '暖光客厅里，银发奶奶收到生日祝福，笑着挥手，电影感人像',
      ),
      settleAssets: false,
      fakePumps: 5, // 合计 600ms < 1500ms 轮询间隔，定格在 60%
    );
  });

  testWidgets('05 我的页（登录态真实数据）', (tester) async {
    final up = await _loggedInUser();
    await _shoot(tester, '05_profile', const MainScaffold(initialTab: 4),
        user: up);
  });

  // ── 三档宽度适配核对（艺人广场网格列数随宽度变化）──
  testWidgets('W1 紧凑 360 宽', (tester) async {
    await _shoot(tester, 'w360_humans', const HumansPage(),
        w: 360, h: 780);
  });

  testWidgets('W2 基准 390 宽', (tester) async {
    await _shoot(tester, 'w390_humans', const HumansPage(),
        w: 390, h: 844);
  });

  testWidgets('W3 展开 840 宽（多列）', (tester) async {
    await _shoot(tester, 'w840_humans', const HumansPage(),
        w: 840, h: 1100);
  });

  // ── V12.5 金额边界/闭环修复页离屏核对（演示数据，金额单位元）──
  testWidgets('06 我的钱包（元口径，不再二次/100）', (tester) async {
    final up = await _loggedInUser();
    await _shoot(tester, '06_wallet', const WalletPage(), user: up);
  });

  testWidgets('07 数字人使用报告（元口径）', (tester) async {
    final up = await _loggedInUser();
    await _shoot(
        tester,
        '07_usage_report',
        const UsageReportPage(humanId: 1, humanName: '林沐雪'),
        user: up);
  });

  testWidgets('08 售后进度（真实接口结构+演示兜底时间轴）', (tester) async {
    final up = await _loggedInUser();
    await _shoot(
        tester,
        '08_after_sales',
        const AfterSalesPage(orderNo: 'VD20260824001'),
        user: up);
  });

  testWidgets('09 订单评价（四维星级+图片区）', (tester) async {
    final up = await _loggedInUser();
    await _shoot(
      tester,
      '09_review',
      const ReviewPage(orderNo: 'VD20260824001', talentName: '苏婉儿'),
      user: up,
      settleAssets: false,
    );
  });
}
