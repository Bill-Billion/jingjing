// 黄金主链路端到端旅程（2026-09-06，对应"五大 skill 审查"动作②）。
//
// 定位：标准 integration_test 形态，补齐此前只有离屏 widget 测试、没有跨页连续 E2E 的空白。
// 运行方式：
//   * 无头逻辑回归（纳入全量、必须全绿）：
//       flutter test -d flutter-tester integration_test/golden_journeys_test.dart --no-pub
//   * 真机/模拟器（平台能力步骤）：flutter test integration_test -d <device>
//
// 覆盖三条"不能崩、不能断"的黄金旅程，全程 demo 模式、确定性、不联网：
//   J1 买家：协议门登录 → 主导航五槽 → 切 Tab → 艺人广场 → 数字人详情 → 祝福视频下单页
//   J2 圆梦：项目详情 → 意向金锁档对话框（可取消）→ 项目书圆梦版/定制剧版严格分版预览
//   J3 艺人：创建数字人 6 步向导护栏（顺序不可绕）→ 落盘后"我的数字人"跨页可见
//
// 真机专属、host 无法驱动的步骤（image_picker 选图、火山人脸、真实支付）不在 host 硬跑，
// 仅在对应位置以护栏断言 + 注释标明，留给 -d <device> 旅程，绝不假装已通过。
//
// 页面含 LiquidScaffold 无限流光动画，统一逐帧 pump，禁止 pumpAndSettle；
// integration binding 下重建/动画需多帧，交互后统一用 _waitFor 轮询，不用单帧硬等。
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show FontLoader, MethodChannel, MethodCall;
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/services/mock_data.dart';
import 'package:jingjingshangri_app/utils/project_brief.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';
import 'package:jingjingshangri_app/widgets/main_scaffold.dart';
import 'package:jingjingshangri_app/widgets/glass_card.dart';
import 'package:jingjingshangri_app/pages/projects/projects_page.dart';
import 'package:jingjingshangri_app/pages/profile/profile_page.dart';
import 'package:jingjingshangri_app/pages/humans/humans_page.dart';
import 'package:jingjingshangri_app/pages/human_detail/human_detail_page.dart';
import 'package:jingjingshangri_app/pages/video_order/video_order_page.dart';
import 'package:jingjingshangri_app/pages/project_detail/project_detail_page.dart';
import 'package:jingjingshangri_app/pages/project_brief/project_brief_page.dart';
import 'package:jingjingshangri_app/pages/audition/audition_page.dart';
import 'package:jingjingshangri_app/pages/my_humans/my_humans_page.dart';

const _demoProject = {
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
};

Future<void> _bootInfra() async {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  // path_provider 离屏通道（CachedNetworkImage/缓存目录），返回临时目录避免 MissingPlugin
  const pp = MethodChannel('plugins.flutter.io/path_provider');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(pp, (MethodCall call) async {
    return (await Directory.systemTemp.createTemp('jjsr_e2e_')).path;
  });
  SharedPreferences.setMockInitialValues({'connMode': 'demo'});
  await AppMode.instance.load();
  await ApiService().init();

  // host(Windows)注入中文字体与图标字体，保证文本测量/渲染真实；真机上文件不存在则安全跳过。
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
  const iconFont =
      r'C:\src\flutter\bin\cache\artifacts\material_fonts\materialicons-regular.otf';
  await inject('MaterialIcons', iconFont);
  await inject('MaterialIcons Rounded', iconFont);
  await inject('MaterialIcons Outlined', iconFont);
  await inject('MaterialIcons Sharp', iconFont);
}

Future<UserProvider> _loggedUser() async {
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

Future<void> _frames(WidgetTester t, {int n = 6, int ms = 100}) async {
  for (var i = 0; i < n; i++) {
    await t.pump(Duration(milliseconds: ms));
  }
}

// 交互后轮询等待目标入树（integration binding 下重建需多帧，比单帧硬等稳）。
Future<bool> _waitFor(WidgetTester t, Finder f,
    {int frames = 12, int ms = 100}) async {
  for (var i = 0; i < frames; i++) {
    if (f.evaluate().isNotEmpty) return true;
    await t.pump(Duration(milliseconds: ms));
  }
  return f.evaluate().isNotEmpty;
}

// 推进假时钟让上一条 SnackBar 完成退场，避免浮层遮挡下一次底部按钮点击。
Future<void> _dismissSnack(WidgetTester t, {int seconds = 4}) async {
  await t.pump(Duration(seconds: seconds));
  await _frames(t, n: 4, ms: 120);
}

Future<void> _pump(WidgetTester t, Widget home, UserProvider up,
    {double h = 844}) async {
  t.view.physicalSize = Size(390, h);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.reset);
  await t.pumpWidget(
    ChangeNotifierProvider<UserProvider>.value(
      value: up,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: home,
      ),
    ),
  );
  await _frames(t, n: 8);
}

void main() {
  setUpAll(_bootInfra);

  testWidgets(
      'J1 买家黄金旅程：协议门登录→主导航五槽→切Tab→艺人详情→祝福视频下单',
      (t) async {
    // —— 起点：登录页（未登录态），完整走一遍协议门登录 ——
    await _pump(t, const LoginPage(), UserProvider());

    await t.enterText(find.byType(TextField).first, '13800001111');
    await _frames(t, n: 2);
    await t.tap(find.text('获取验证码'));
    expect(await _waitFor(t, find.textContaining('后重发')), isTrue);
    await t.enterText(find.byType(TextField).last, '123456');
    await _frames(t, n: 2);

    // 协议默认不勾：首次登录必须被拦
    await t.tap(find.text('登录 / 注册'));
    expect(
        await _waitFor(
            t, find.text('请先阅读并同意用户协议与隐私政策')),
        isTrue);
    expect(find.byType(MainScaffold), findsNothing);

    // 等拦截 SnackBar 退场，避免浮层遮挡下一次点击
    await _dismissSnack(t, seconds: 3);

    // 勾选后登录，进入主导航
    await t.tap(find.byIcon(Icons.radio_button_unchecked_rounded));
    await _frames(t, n: 2);
    await t.tap(find.text('登录 / 注册'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 700)); // 越过 650ms 成功停留
    await _frames(t, n: 3);
    expect(find.byType(MainScaffold), findsOneWidget);

    // 主导航五槽文案（中央创作位无文字）
    expect(find.text('首页'), findsOneWidget);
    expect(find.text('圆梦'), findsWidgets);
    expect(find.text('消息'), findsWidgets);
    expect(find.text('我的'), findsWidgets);

    // 底部导航栏在 widget 树最后构建，取 .last 命中底部 Tab（避开首页同名文案）。
    // 切到"圆梦"Tab：ProjectsPage 入树、不崩
    await t.tap(find.text('圆梦').last);
    await _frames(t, n: 4);
    expect(find.byType(ProjectsPage), findsOneWidget);

    // 切到"我的"Tab：ProfilePage 入树
    await t.tap(find.text('我的').last);
    await _frames(t, n: 4);
    expect(find.byType(ProfilePage), findsOneWidget);

    // —— 同一连续会话内继续：主导航 → 艺人广场 → 详情 → 下单 ——
    // 注意：不能 await Navigator.push（其 Future 在路由 pop 时才 complete，会永久挂起）。
    final navCtx = t.element(find.byType(MainScaffold));
    Navigator.of(navCtx)
        .push(MaterialPageRoute(builder: (_) => const HumansPage()));
    await _frames(t, n: 6);
    expect(find.byType(HumansPage), findsOneWidget);

    final firstName = '${(MockData.humans().first as Map)['name']}';
    expect(find.text(firstName), findsWidgets);
    final card = find
        .ancestor(
            of: find.text(firstName).first, matching: find.byType(GlassCard))
        .first;
    await t.ensureVisible(card);
    await _frames(t, n: 2);
    await t.tap(card);
    expect(await _waitFor(t, find.byType(HumanDetailPage)), isTrue);
    expect(find.text('祝福视频'), findsWidgets);

    await t.ensureVisible(find.text('祝福视频').first);
    await _frames(t, n: 2);
    await t.tap(find.text('祝福视频').first);
    expect(await _waitFor(t, find.byType(VideoOrderPage)), isTrue);
    expect(find.text('提交订单'), findsWidgets);

    // 排空 PrimaryButton 成功态等遗留定时器
    await t.pump(const Duration(seconds: 1));
    expect(t.takeException(), isNull);
  });

  testWidgets('J2 圆梦旅程：意向金锁档对话框可取消，项目书两版严格分版预览',
      (t) async {
    final up = await _loggedUser();
    // 项目详情内容较高，沿用专项测试的高视口，保证入口按钮已构建入树。
    await _pump(t, const ProjectDetailPage(project: _demoProject), up,
        h: 1700);

    // 项目详情 → 说明底表
    final entry = find.text('付意向金 ¥99 启动');
    expect(await _waitFor(t, entry), isTrue);
    await t.tap(entry);
    expect(await _waitFor(t, find.text('开启你的定制剧')), isTrue);

    // 说明底表 → 意向金锁档对话框（必须先填联系人、再提交支付，不能一键直付）
    await t.tap(find.text('支付意向金 ¥99'));
    final lockSubmit = find.text('提交并支付意向金');
    expect(await _waitFor(t, lockSubmit), isTrue);
    expect(find.text('联系人姓名'), findsOneWidget);
    expect(find.text('手机号'), findsOneWidget);

    // 取消可关闭、不产生支付/崩溃
    await t.tap(find.text('取消'));
    for (var i = 0; i < 10; i++) {
      await t.pump(const Duration(milliseconds: 100));
      if (lockSubmit.evaluate().isEmpty) break;
    }
    expect(find.text('提交并支付意向金'), findsNothing);
    expect(t.takeException(), isNull);

    // 项目书纯函数：圆梦版 4 节、定制剧版 6 节，措辞严格不串
    final dream = ProjectBrief.build(_demoProject, isProject: true);
    expect(dream.isProject, isTrue);
    expect(dream.sections.length, 4);
    final order = ProjectBrief.build(const {}, isProject: false);
    expect(order.isProject, isFalse);
    expect(order.sections.length, 6);
    expect(dream.toFullText(), isNot(contains('七步标准化流程')));
    expect(order.toFullText(), isNot(contains('角色席位认领')));

    // 项目书预览页：圆梦版独立挂载并真实渲染（不依赖跨页转场动画，保证 host 稳定）
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: ProjectBriefPage(source: _demoProject, isProject: true),
    ));
    expect(await _waitFor(t, find.text('圆梦项目书')), isTrue);
    expect(find.text('定制剧项目书'), findsNothing);
    expect(find.textContaining('自有 IP 角色席位认领'), findsOneWidget);

    // 定制剧版独立挂载：标题/分版与圆梦严格互斥
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: ProjectBriefPage(source: const {}, isProject: false),
    ));
    expect(await _waitFor(t, find.text('定制剧项目书')), isTrue);
    expect(find.text('圆梦项目书'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('J3 艺人旅程：创建数字人6步护栏不可绕→落盘后我的数字人可见',
      (t) async {
    final up = await _loggedUser();
    await _pump(t, const AuditionPage(), up);

    // 6 步步骤条完整、当前停在第 1 步
    expect(
        await _waitFor(t, find.text('第 1/6 步 · 上传照片')), isTrue);
    for (final n in ['1', '2', '3', '4', '5', '6']) {
      expect(find.text(n), findsOneWidget, reason: '步骤圆点 $n');
    }

    // 护栏1：未同意照片说明 → 拦截、不前进
    await t.tap(find.text('下一步').first);
    expect(
        await _waitFor(t, find.text('请先阅读并同意照片使用说明')), isTrue);
    expect(find.text('第 1/6 步 · 上传照片'), findsOneWidget);

    // 护栏2：已同意但未上传照片 → 仍拦截（选图/真人验证为平台能力，留真机旅程）
    final consent = find.text('我已知晓照片用途，同意上传');
    await t.ensureVisible(consent); // 第1步内容较长，先滚到勾选行再点
    await _frames(t, n: 2);
    await t.tap(consent);
    await _dismissSnack(t, seconds: 4); // 等护栏1的 SnackBar 退场，别挡住底部"下一步"
    await t.tap(find.text('下一步').first);
    expect(await _waitFor(t, find.text('请先上传照片')), isTrue);
    expect(find.text('第 1/6 步 · 上传照片'), findsOneWidget);

    // 模拟向导走完后的本地落盘结果，跨页验证"我的数字人"可见（状态真实传递）
    await up.addMyHuman({
      'id': 'e2e-golden-1',
      'name': 'E2E·阿瑶数字人',
      'status': 'pending',
      'scopeVideo': true,
    });
    // 提交后进入「我的数字人」页：复用同一 UserProvider，验证落盘结果跨页真实可见。
    await t.pumpWidget(ChangeNotifierProvider<UserProvider>.value(
      value: up,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: const MyHumansPage(),
      ),
    ));
    expect(await _waitFor(t, find.text('E2E·阿瑶数字人')), isTrue);
    expect(find.text('还没有数字人'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
