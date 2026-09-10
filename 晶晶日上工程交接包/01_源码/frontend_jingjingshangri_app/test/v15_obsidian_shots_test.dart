// V15「曜石流光」阶段一效果图 harness（2026-09-01）：
// 离屏渲染全部一级页（390x844 基准）+ 关键页 360/840 三档，输出 build/shots/v15_obsidian/。
// 数据走 demo（MockData），确定性、不联网；效果图为真实 Flutter 代码渲染，非 AI 位图。
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart' show FontLoader, MethodChannel, MethodCall;
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
import 'package:jingjingshangri_app/pages/ai_studio/ai_task_page.dart';
import 'package:jingjingshangri_app/pages/humans/humans_page.dart';
import 'package:jingjingshangri_app/pages/projects/projects_page.dart';
import 'package:jingjingshangri_app/pages/orders/orders_page.dart';
import 'package:jingjingshangri_app/pages/wallet/wallet_page.dart';
import 'package:jingjingshangri_app/pages/checkout/checkout_page.dart';
import 'package:jingjingshangri_app/pages/ai_studio/my_works_page.dart';
import 'package:jingjingshangri_app/pages/video_order/video_order_page.dart';
import 'package:jingjingshangri_app/pages/endorsement/endorsement_page.dart';
import 'package:jingjingshangri_app/pages/project_detail/project_detail_page.dart';
import 'package:jingjingshangri_app/pages/after_sales/after_sales_page.dart';
import 'package:jingjingshangri_app/pages/identity/identity_page.dart';
import 'package:jingjingshangri_app/pages/sample_order_detail/sample_order_detail_page.dart';
import 'package:jingjingshangri_app/pages/script_reader/script_reader_page.dart';
import 'package:jingjingshangri_app/pages/human_detail/human_detail_page.dart';
import 'package:jingjingshangri_app/pages/video_lib/video_lib_page.dart';
import 'package:jingjingshangri_app/pages/launch/launch_page.dart';
import 'package:jingjingshangri_app/pages/onboarding/onboarding_page.dart';
import 'package:jingjingshangri_app/pages/chat/chat_page.dart';
import 'package:jingjingshangri_app/pages/project_brief/project_brief_page.dart';
import 'package:jingjingshangri_app/pages/review/review_page.dart';
import 'package:jingjingshangri_app/pages/usage_report/usage_report_page.dart';
import 'package:jingjingshangri_app/pages/sample_library/sample_library_page.dart';
import 'package:jingjingshangri_app/pages/mcn/mcn_page.dart';
import 'package:jingjingshangri_app/pages/profile/settings_page.dart';
import 'package:jingjingshangri_app/pages/role_market/role_market_page.dart';
import 'package:jingjingshangri_app/pages/custom_request/custom_request_page.dart';
import 'package:jingjingshangri_app/pages/theater/theater_page.dart';
import 'package:jingjingshangri_app/pages/my_humans/my_humans_page.dart';
import 'package:jingjingshangri_app/pages/audition/audition_page.dart';

Future<void> _bootDemo() async {
  // 离屏补齐 path_provider，供 CachedNetworkImage/flutter_cache_manager 取缓存目录（测试 HTTP 400 时落占位/errorWidget，不抛 MissingPlugin）
  TestWidgetsFlutterBinding.ensureInitialized();
  const ppChannel = MethodChannel('plugins.flutter.io/path_provider');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(ppChannel, (MethodCall call) async {
    final d = Directory.systemTemp.createTempSync('jjsr_pp_');
    return d.path;
  });
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
  // 新版 SDK 全量图标（含 rounded/outlined/sharp 字形）合并在同一 otf，
  // 但变体按独立 family 名查找，离屏需把同一字体按四个 family 名都注册，否则 _rounded 图标豆腐。
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

  if (settleAssets) {
    // 先在真实事件循环里等图片完成解码，再 pump 让已解码帧落到 frameBuilder，
    // 两轮确保本地头像/远程图在离屏出图前真正显示，而不是停在占位。
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 900));
    });
    for (var i = 0; i < 3; i++) {
      await tester.pump(const Duration(milliseconds: 80));
    }
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 350));
    });
    await tester.pump(const Duration(milliseconds: 80));
  }

  final boundary = tester
      .renderObject(find.byType(RepaintBoundary).first) as RenderRepaintBoundary;
  late Uint8List bytes;
  await tester.runAsync(() async {
    final image =
        await boundary.toImage(pixelRatio: 1.0).timeout(const Duration(seconds: 10));
    final data = await image
        .toByteData(format: ui.ImageByteFormat.png)
        .timeout(const Duration(seconds: 10));
    bytes = data!.buffer.asUint8List();
    image.dispose();
  });

  final dir = Directory('build/shots/v15_obsidian');
  dir.createSync(recursive: true);
  final file = File('${dir.path}/$name.png');
  file.writeAsBytesSync(bytes);
  // ignore: avoid_print
  print('SHOT ${file.path}  ${w.toInt()}x${h.toInt()}  ${bytes.length}B');

  // 排空 CachedNetworkImage/flutter_cache_manager 的一次性 10s 清理 Timer，避免离屏 'A Timer is still pending'（假时间，不占真实耗时、不改变已存截图）
  await tester.pump(const Duration(seconds: 11));
}

void main() {
  setUpAll(_bootDemo);

  // ── 一级页基准 390x844 ──
  testWidgets('01 登录页', (tester) async {
    await _shoot(tester, '01_login_390', const LoginPage());
    await _shoot(tester, 'r_login_360', const LoginPage(),
        w: 360, h: 780);
    await _shoot(tester, 'r_login_840', const LoginPage(),
        w: 840, h: 1100);
  });

  testWidgets('02 首页', (tester) async {
    await _shoot(tester, '02_home_390', const MainScaffold(initialTab: 0),
        user: await _loggedInUser());
  });

  testWidgets('03 创作中心', (tester) async {
    await _shoot(tester, '03_create_390', const GlowPanel(), settleAssets: false);
    await _shoot(tester, 'r_create_360', const GlowPanel(),
        w: 360, h: 780, settleAssets: false);
    await _shoot(tester, 'r_create_840', const GlowPanel(),
        w: 840, h: 1100, settleAssets: false);
  });

  testWidgets('04 AI文生视频阶段进度', (tester) async {
    final created =
        MockData.aiVideoTask('暖光客厅里，银发奶奶收到生日祝福，笑着挥手，电影感人像');
    final seed = Map<String, dynamic>.from(created['task'] as Map);
    final id = '${seed['id']}';
    await ApiService().getAiTask(id);
    await ApiService().getAiTask(id);
    await _shoot(
      tester,
      '04_ai_progress_390',
      AiTaskPage(
        task: seed,
        kind: 'video',
        prompt: '暖光客厅里，银发奶奶收到生日祝福，笑着挥手，电影感人像',
      ),
      settleAssets: false,
      fakePumps: 5,
    );
    await _shoot(
      tester,
      'r_ai_progress_360',
      AiTaskPage(
        task: seed,
        kind: 'video',
        prompt: '暖光客厅里，银发奶奶收到生日祝福，笑着挥手，电影感人像',
      ),
      w: 360, h: 780,
      settleAssets: false,
      fakePumps: 5,
    );
    await _shoot(
      tester,
      'r_ai_progress_840',
      AiTaskPage(
        task: seed,
        kind: 'video',
        prompt: '暖光客厅里，银发奶奶收到生日祝福，笑着挥手，电影感人像',
      ),
      w: 840, h: 1100,
      settleAssets: false,
      fakePumps: 5,
    );
  });

  testWidgets('05 圆梦项目市场', (tester) async {
    await _shoot(tester, '05_dream_390', const MainScaffold(initialTab: 1),
        user: await _loggedInUser());
    await _shoot(tester, 'r_dream_360', const MainScaffold(initialTab: 1),
        w: 360, h: 780, user: await _loggedInUser());
    await _shoot(tester, 'r_dream_840', const MainScaffold(initialTab: 1),
        w: 840, h: 1100, user: await _loggedInUser());
  });

  testWidgets('06 消息', (tester) async {
    await _shoot(tester, '06_messages_390', const MainScaffold(initialTab: 3),
        user: await _loggedInUser());
    await _shoot(tester, 'r_messages_360', const MainScaffold(initialTab: 3),
        w: 360, h: 780, user: await _loggedInUser());
    await _shoot(tester, 'r_messages_840', const MainScaffold(initialTab: 3),
        w: 840, h: 1100, user: await _loggedInUser());
  });

  testWidgets('07 我的', (tester) async {
    await _shoot(tester, '07_profile_390', const MainScaffold(initialTab: 4),
        user: await _loggedInUser());
    await _shoot(tester, 'r_profile_360', const MainScaffold(initialTab: 4),
        w: 360, h: 780, user: await _loggedInUser());
    await _shoot(tester, 'r_profile_840', const MainScaffold(initialTab: 4),
        w: 840, h: 1100, user: await _loggedInUser());
  });

  testWidgets('08 艺人广场', (tester) async {
    await _shoot(tester, '08_humans_390', const HumansPage());
  });

  testWidgets('09 统一订单', (tester) async {
    await _shoot(tester, '09_orders_390', const OrdersPage(),
        user: await _loggedInUser());
    await _shoot(tester, 'r_orders_360', const OrdersPage(),
        w: 360, h: 780, user: await _loggedInUser());
    await _shoot(tester, 'r_orders_840', const OrdersPage(),
        w: 840, h: 1100, user: await _loggedInUser());
  });

  testWidgets('10 钱包', (tester) async {
    await _shoot(tester, '10_wallet_390', const WalletPage(),
        user: await _loggedInUser());
    await _shoot(tester, 'r_wallet_360', const WalletPage(),
        w: 360, h: 780, user: await _loggedInUser());
    await _shoot(tester, 'r_wallet_840', const WalletPage(),
        w: 840, h: 1100, user: await _loggedInUser());
  });

  testWidgets('11 我的作品', (tester) async {
    await _shoot(tester, '11_my_works_390', const MyWorksPage(),
        user: await _loggedInUser());
    await _shoot(tester, 'r_my_works_360', const MyWorksPage(),
        w: 360, h: 780, user: await _loggedInUser());
    await _shoot(tester, 'r_my_works_840', const MyWorksPage(),
        w: 840, h: 1100, user: await _loggedInUser());
  });

  testWidgets('12 定制剧项目', (tester) async {
    await _shoot(tester, '12_projects_390', const ProjectsPage());
    await _shoot(tester, 'r_projects_360', const ProjectsPage(),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_projects_840', const ProjectsPage(),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('13 祝福视频下单', (tester) async {
    await _shoot(tester, '13_video_order_390', const VideoOrderPage());
    await _shoot(tester, 'r_video_order_360', const VideoOrderPage(),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_video_order_840', const VideoOrderPage(),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('14 品牌代言下单', (tester) async {
    await _shoot(tester, '14_endorsement_390', const EndorsementPage());
    await _shoot(tester, 'r_endorsement_360', const EndorsementPage(),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_endorsement_840', const EndorsementPage(),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('15 选剧样片库', (tester) async {
    await _shoot(tester, '15_sample_library_390', const SampleLibraryPage());
  });

  testWidgets('16 晶典剧场', (tester) async {
    await _shoot(tester, '16_theater_390', const TheaterPage());
    await _shoot(tester, 'r_theater_360', const TheaterPage(),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_theater_840', const TheaterPage(),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('17 我的数字人', (tester) async {
    await _shoot(tester, '17_my_humans_390', const MyHumansPage(),
        user: await _loggedInUser());
    await _shoot(tester, 'r_my_humans_360', const MyHumansPage(),
        w: 360, h: 780, user: await _loggedInUser());
    await _shoot(tester, 'r_my_humans_840', const MyHumansPage(),
        w: 840, h: 1100, user: await _loggedInUser());
  });

  testWidgets('18 MCN看板(H5引导)', (tester) async {
    await _shoot(tester, '18_mcn_390', const McnPage());
    await _shoot(tester, 'r_mcn_360', const McnPage(),
        w: 360, h: 780);
    await _shoot(tester, 'r_mcn_840', const McnPage(),
        w: 840, h: 1100);
  });

  testWidgets('19 设置', (tester) async {
    await _shoot(tester, '19_settings_390', const SettingsPage());
    await _shoot(tester, 'r_settings_360', const SettingsPage(),
        w: 360, h: 780);
    await _shoot(tester, 'r_settings_840', const SettingsPage(),
        w: 840, h: 1100);
  });

  testWidgets('20 角色席位市场', (tester) async {
    await _shoot(tester, '20_role_market_390', const RoleMarketPage(),
        fakePumps: 6);
    await _shoot(tester, 'r_role_market_360', const RoleMarketPage(),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_role_market_840', const RoleMarketPage(),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('21 高端定制需求', (tester) async {
    await _shoot(tester, '21_custom_request_390', const CustomRequestPage());
    await _shoot(tester, 'r_custom_request_360', const CustomRequestPage(),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_custom_request_840', const CustomRequestPage(),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('22 创建数字人向导', (tester) async {
    // 依赖 LiquidBackdrop 本地丝绸位图承担深色底，需 settleAssets 等其解码
    await _shoot(tester, '22_audition_390', const AuditionPage());
    await _shoot(tester, 'r_audition_360', const AuditionPage(), w: 360, h: 780);
    await _shoot(tester, 'r_audition_840', const AuditionPage(), w: 840, h: 1100);
  });

  // ── 关键页三档响应式 ──
  testWidgets('R 首页 360', (tester) async {
    await _shoot(tester, 'r_home_360', const MainScaffold(initialTab: 0),
        w: 360, h: 780, user: await _loggedInUser());
  });

  testWidgets('R 首页 840', (tester) async {
    await _shoot(tester, 'r_home_840', const MainScaffold(initialTab: 0),
        w: 840, h: 1100, user: await _loggedInUser());
  });

  testWidgets('R 广场 360', (tester) async {
    await _shoot(tester, 'r_humans_360', const HumansPage(), w: 360, h: 780);
  });

  testWidgets('R 广场 840', (tester) async {
    await _shoot(tester, 'r_humans_840', const HumansPage(), w: 840, h: 1100);
  });

  testWidgets('R 我的 360', (tester) async {
    await _shoot(tester, 'r_profile_360', const MainScaffold(initialTab: 4),
        w: 360, h: 780, user: await _loggedInUser());
  });

  testWidgets('23 我的钱包', (tester) async {
    await _shoot(tester, '23_wallet_390', const WalletPage(), fakePumps: 6);
  });

  testWidgets('24 确认订单收银台', (tester) async {
    await _shoot(tester, '24_checkout_390', const CheckoutPage(
      orderNo: 'DEMO202609040001',
      bizType: 'video',
      title: '基础祝福视频',
      spec: '基础祝福 · 约15秒',
      talentName: '林沐雪',
      amount: 99,
    ));
    await _shoot(tester, 'r_checkout_360', const CheckoutPage(
      orderNo: 'DEMO202609040001',
      bizType: 'video',
      title: '基础祝福视频',
      spec: '基础祝福 · 约15秒',
      talentName: '林沐雪',
      amount: 99,
    ), w: 360, h: 780);
    await _shoot(tester, 'r_checkout_840', const CheckoutPage(
      orderNo: 'DEMO202609040001',
      bizType: 'video',
      title: '基础祝福视频',
      spec: '基础祝福 · 约15秒',
      talentName: '林沐雪',
      amount: 99,
    ), w: 840, h: 1100);
  });

  testWidgets('25 定制视频下单', (tester) async {
    await _shoot(
        tester,
        '25_video_order_390',
        VideoOrderPage(human: const {
          'id': 1,
          'name': '林沐雪',
          'specialty': '古风 / 温婉 / 祝福',
        }),
        fakePumps: 6);
    await _shoot(
        tester,
        'r_video_order_human_360',
        VideoOrderPage(human: const {
          'id': 1,
          'name': '林沐雪',
          'specialty': '古风 / 温婉 / 祝福',
        }),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(
        tester,
        'r_video_order_human_840',
        VideoOrderPage(human: const {
          'id': 1,
          'name': '林沐雪',
          'specialty': '古风 / 温婉 / 祝福',
        }),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('26 选剧库', (tester) async {
    await _shoot(tester, '26_sample_library_390', const SampleLibraryPage(),
        fakePumps: 6);
  });

  testWidgets('R 选剧库 360', (tester) async {
    await _shoot(tester, 'r_sample_library_360', const SampleLibraryPage(),
        w: 360, h: 780, fakePumps: 6);
  });

  testWidgets('R 选剧库 840', (tester) async {
    await _shoot(tester, 'r_sample_library_840', const SampleLibraryPage(),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('27 我的订单', (tester) async {
    await _shoot(tester, '27_orders_390', const OrdersPage(), fakePumps: 6);
  });

  testWidgets('28 圆梦席位', (tester) async {
    await _shoot(tester, '28_projects_390', const ProjectsPage(),
        fakePumps: 6);
  });

  testWidgets('29 项目详情', (tester) async {
    await _shoot(
        tester,
        '29_project_detail_390',
        ProjectDetailPage(project: {
          'title': '黄帝史诗·天下合',
          'type': '古装史诗',
          'status': 'recruiting',
          'seatsClaimed': 72,
          'seatsTotal': 100,
          'clientCount': 318,
          'days': 23,
          'protagonist': '少年轩辕',
          'localCover': 'assets/images/theater_1.jpg',
          'intro': '上古洪荒，群雄并起，少年轩辕集结百家席位于天下合的宏大史诗。',
        }),
        fakePumps: 4);
    await _shoot(
        tester,
        'r_project_detail_360',
        ProjectDetailPage(project: {
          'title': '黄帝史诗·天下合',
          'type': '古装史诗',
          'status': 'recruiting',
          'seatsClaimed': 72,
          'seatsTotal': 100,
          'clientCount': 318,
          'days': 23,
          'protagonist': '少年轩辕',
          'localCover': 'assets/images/theater_1.jpg',
          'intro': '上古洪荒，群雄并起，少年轩辕集结百家席位于天下合的宏大史诗。',
        }),
        w: 360, h: 780, fakePumps: 4);
    await _shoot(
        tester,
        'r_project_detail_840',
        ProjectDetailPage(project: {
          'title': '黄帝史诗·天下合',
          'type': '古装史诗',
          'status': 'recruiting',
          'seatsClaimed': 72,
          'seatsTotal': 100,
          'clientCount': 318,
          'days': 23,
          'protagonist': '少年轩辕',
          'localCover': 'assets/images/theater_1.jpg',
          'intro': '上古洪荒，群雄并起，少年轩辕集结百家席位于天下合的宏大史诗。',
        }),
        w: 840, h: 1100, fakePumps: 4);
  });

  testWidgets('30 售后进度', (tester) async {
    await _shoot(tester, '30_after_sales_390',
        const AfterSalesPage(orderNo: 'VD20260824001'),
        fakePumps: 6);
    await _shoot(tester, 'r_after_sales_360',
        const AfterSalesPage(orderNo: 'VD20260824001'),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_after_sales_840',
        const AfterSalesPage(orderNo: 'VD20260824001'),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('31 订单评价', (tester) async {
    await _shoot(tester, '31_review_390',
        const ReviewPage(orderNo: 'VD20260824001', talentName: '林沐雪'),
        fakePumps: 3);
    await _shoot(tester, 'r_review_360',
        const ReviewPage(orderNo: 'VD20260824001', talentName: '林沐雪'),
        w: 360, h: 780, fakePumps: 3);
    await _shoot(tester, 'r_review_840',
        const ReviewPage(orderNo: 'VD20260824001', talentName: '林沐雪'),
        w: 840, h: 1100, fakePumps: 3);
  });

  testWidgets('32 使用报告', (tester) async {
    await _shoot(tester, '32_usage_report_390',
        const UsageReportPage(humanId: 1, humanName: '林沐雪'),
        fakePumps: 6);
    await _shoot(tester, 'r_usage_report_360',
        const UsageReportPage(humanId: 1, humanName: '林沐雪'),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_usage_report_840',
        const UsageReportPage(humanId: 1, humanName: '林沐雪'),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('33 身份认证', (tester) async {
    await _shoot(tester, '33_identity_390',
        const IdentityPage(),
        fakePumps: 3);
    await _shoot(tester, 'r_identity_360',
        const IdentityPage(),
        w: 360, h: 780, fakePumps: 3);
    await _shoot(tester, 'r_identity_840',
        const IdentityPage(),
        w: 840, h: 1100, fakePumps: 3);
  });

  testWidgets('34 定制剧订单详情', (tester) async {
    await _shoot(tester, '34_sample_order_detail_390',
        const SampleOrderDetailPage(orderId: 1),
        fakePumps: 6);
    await _shoot(tester, 'r_sample_order_detail_360',
        const SampleOrderDetailPage(orderId: 1),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_sample_order_detail_840',
        const SampleOrderDetailPage(orderId: 1),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('35 剧本阅读', (tester) async {
    await _shoot(tester, '35_script_reader_390',
        const ScriptReaderPage(orderId: 1),
        fakePumps: 6);
    await _shoot(tester, 'r_script_reader_360',
        const ScriptReaderPage(orderId: 1),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_script_reader_840',
        const ScriptReaderPage(orderId: 1),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('36 艺人详情', (tester) async {
    await _shoot(tester, '36_human_detail_390',
        HumanDetailPage(human: const {
          'id': 1,
          'name': '林沐雪',
          'price': 99,
          'minPrice': 99,
          'avgRating': '4.9',
          'sales': 1280,
          'reviewCount': 326,
          'verifiedLevel': 'gold',
          'qualityGrade': 'S',
          'desc': '温柔治愈系数字人，擅长祝福与陪伴口播',
          'localAvatar': 'assets/images/artist_1.jpg',
        }),
        fakePumps: 6);
    await _shoot(tester, 'r_human_detail_360',
        HumanDetailPage(human: const {
          'id': 1,
          'name': '林沐雪',
          'price': 99,
          'minPrice': 99,
          'avgRating': '4.9',
          'sales': 1280,
          'reviewCount': 326,
          'verifiedLevel': 'gold',
          'qualityGrade': 'S',
          'desc': '温柔治愈系数字人，擅长祝福与陪伴口播',
          'localAvatar': 'assets/images/artist_1.jpg',
        }),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_human_detail_840',
        HumanDetailPage(human: const {
          'id': 1,
          'name': '林沐雪',
          'price': 99,
          'minPrice': 99,
          'avgRating': '4.9',
          'sales': 1280,
          'reviewCount': 326,
          'verifiedLevel': 'gold',
          'qualityGrade': 'S',
          'desc': '温柔治愈系数字人，擅长祝福与陪伴口播',
          'localAvatar': 'assets/images/artist_1.jpg',
        }),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('37 我的视频', (tester) async {
    await _shoot(tester, '37_video_lib_390',
        const VideoLibPage(),
        fakePumps: 6);
    await _shoot(tester, 'r_video_lib_360',
        const VideoLibPage(),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_video_lib_840',
        const VideoLibPage(),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('38 定制剧档位', (tester) async {
    await _shoot(tester, '38_launch_390', const LaunchPage());
    await _shoot(tester, 'r_launch_360', const LaunchPage(),
        w: 360, h: 780, fakePumps: 6);
    await _shoot(tester, 'r_launch_840', const LaunchPage(),
        w: 840, h: 1100, fakePumps: 6);
  });

  testWidgets('39 开屏引导', (tester) async {
    await _shoot(tester, '39_onboarding_390', const OnboardingPage());
    await _shoot(tester, 'r_onboarding_360', const OnboardingPage(),
        w: 360, h: 780);
    await _shoot(tester, 'r_onboarding_840', const OnboardingPage(),
        w: 840, h: 1100);
  });

  testWidgets('40 私信会话', (tester) async {
    await _shoot(
      tester,
      '40_chat_390',
      ChatPage(human: const {'id': 1, 'name': '林沐雪'}),
      fakePumps: 6,
    );
    await _shoot(
      tester,
      'r_chat_360',
      ChatPage(human: const {'id': 1, 'name': '林沐雪'}),
      w: 360, h: 780, fakePumps: 6,
    );
    await _shoot(
      tester,
      'r_chat_840',
      ChatPage(human: const {'id': 1, 'name': '林沐雪'}),
      w: 840, h: 1100, fakePumps: 6,
    );
  });

  testWidgets('41 定制剧项目书', (tester) async {
    await _shoot(
      tester,
      '41_brief_order_390',
      const ProjectBriefPage(isProject: false, source: {
        'orderNo': 'SP20260904001',
        'title': '我的人生剧',
        'genre': '古装史诗',
      }),
    );
    await _shoot(
      tester,
      'r_brief_order_360',
      const ProjectBriefPage(isProject: false, source: {
        'orderNo': 'SP20260904001',
        'title': '我的人生剧',
        'genre': '古装史诗',
      }),
      w: 360, h: 780,
    );
    await _shoot(
      tester,
      'r_brief_order_840',
      const ProjectBriefPage(isProject: false, source: {
        'orderNo': 'SP20260904001',
        'title': '我的人生剧',
        'genre': '古装史诗',
      }),
      w: 840, h: 1100,
    );
  });

  testWidgets('42 圆梦项目书', (tester) async {
    await _shoot(
      tester,
      '42_brief_project_390',
      const ProjectBriefPage(isProject: true, source: {
        'title': '黄帝史诗·天下合',
        'type': '古装史诗',
        'genre': '华夏史诗',
        'intro': '上古炎黄合盟、涿鹿定鼎，做自己人生的主角。',
        'protagonist': '少年轩辕',
        'roles': 9,
        'seatsTotal': 100,
        'seatsClaimed': 72,
        'days': 23,
      }),
    );
    await _shoot(
      tester,
      'r_brief_project_360',
      const ProjectBriefPage(isProject: true, source: {
        'title': '黄帝史诗·天下合',
        'type': '古装史诗',
        'genre': '华夏史诗',
        'intro': '上古炎黄合盟、涿鹿定鼎，做自己人生的主角。',
        'protagonist': '少年轩辕',
        'roles': 9,
        'seatsTotal': 100,
        'seatsClaimed': 72,
        'days': 23,
      }),
      w: 360, h: 780,
    );
    await _shoot(
      tester,
      'r_brief_project_840',
      const ProjectBriefPage(isProject: true, source: {
        'title': '黄帝史诗·天下合',
        'type': '古装史诗',
        'genre': '华夏史诗',
        'intro': '上古炎黄合盟、涿鹿定鼎，做自己人生的主角。',
        'protagonist': '少年轩辕',
        'roles': 9,
        'seatsTotal': 100,
        'seatsClaimed': 72,
        'days': 23,
      }),
      w: 840, h: 1100,
    );
  });
}
