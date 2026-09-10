// 三角色【交互级】走查（2026-08-31）：用 widget test 模拟真实点击流，
// 断言关键节点不崩、页面真的发生跳转/出现反馈。全程 demo 模式、不联网。
import 'package:flutter/material.dart';
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
import 'package:jingjingshangri_app/pages/humans/humans_page.dart';
import 'package:jingjingshangri_app/pages/human_detail/human_detail_page.dart';
import 'package:jingjingshangri_app/widgets/glass_card.dart';
import 'package:jingjingshangri_app/pages/video_order/video_order_page.dart';
import 'package:jingjingshangri_app/pages/orders/orders_page.dart';
import 'package:jingjingshangri_app/pages/review/review_page.dart';
import 'package:jingjingshangri_app/pages/audition/audition_page.dart';
import 'package:jingjingshangri_app/pages/my_humans/my_humans_page.dart';
import 'package:jingjingshangri_app/pages/wallet/wallet_page.dart';
import 'package:jingjingshangri_app/pages/usage_report/usage_report_page.dart';
import 'package:jingjingshangri_app/pages/identity/identity_page.dart';

Future<void> _bootDemo() async {
  SharedPreferences.setMockInitialValues({'connMode': 'demo'});
  await AppMode.instance.load();
  await ApiService().init();
}

Future<UserProvider> _loggedUser() async {
  final up = UserProvider();
  await up.saveLogin({
    'token': 'demo-token',
    'user': {'id': 1, 'nickname': '林晚晴', 'phone': '138****6688', 'role': 'user'},
  });
  return up;
}

Future<void> _pump(WidgetTester t, Widget home, {UserProvider? up}) async {
  t.view.physicalSize = const Size(390, 844);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.reset);
  await t.pumpWidget(
    ChangeNotifierProvider<UserProvider>.value(
      value: up ?? UserProvider(),
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: home,
      ),
    ),
  );
  for (var i = 0; i < 6; i++) {
    await t.pump(const Duration(milliseconds: 120));
  }
}

void main() {
  setUpAll(_bootDemo);

  group('买家流', () {
    testWidgets('B1 手机号验证码登录：未勾协议被拦→勾选→登录进主导航', (t) async {
      await _pump(t, const LoginPage());
      // 输入合法手机号
      await t.enterText(find.byType(TextField).first, '13800001111');
      await t.pump(); // 等 onChanged 重建，使获取验证码按钮变为可用
      // 获取验证码 → 出现 60s 倒计时反馈
      await t.tap(find.text('获取验证码'));
      await t.pump(const Duration(milliseconds: 300));
      expect(find.textContaining('后重发'), findsWidgets);
      // 输入 6 位验证码
      await t.enterText(find.byType(TextField).last, '123456');
      // 未勾协议点登录 → 被拦截并提示，仍在登录页
      await t.tap(find.text('登录 / 注册'));
      await t.pump(const Duration(milliseconds: 200));
      expect(find.text('请先阅读并同意用户协议与隐私政策'), findsOneWidget);
      expect(find.byType(MainScaffold), findsNothing);
      // 勾选协议（点左侧圆形勾选图标；点《用户协议》文字只弹说明、不会勾选）
      await t.tap(find.byIcon(Icons.radio_button_unchecked_rounded));
      await t.pump();
      expect(find.byIcon(Icons.check_circle_rounded), findsWidgets);
      // 再次登录 → 成功态 650ms 后进入主导航
      await t.tap(find.text('登录 / 注册'));
      await t.pump(); // 跑完登录异步链
      await t.pump(const Duration(milliseconds: 700)); // 越过 650ms 成功停留
      await t.pump(); // 构建新路由
      expect(find.byType(MainScaffold), findsOneWidget);
      expect(find.text('首页'), findsOneWidget);
      // 走完 PrimaryButton 成功态 900ms 回调定时器，避免悬挂
      await t.pump(const Duration(seconds: 1));
    });

    testWidgets('B2 艺人广场→数字人详情→祝福视频下单页跳转', (t) async {
      final up = await _loggedUser();
      await _pump(t, const HumansPage(), up: up);
      // demo 艺人卡片渲染：点第一个艺人名字进入详情
      final first = MockData.humans().first as Map;
      final name = '${first['name']}';
      expect(find.text(name), findsWidgets);
      // 点包含名字的整张艺人玻璃卡（V15.5 卡片由 InkWell 改为 GlassCard）
      final card = find.ancestor(
        of: find.text(name).first,
        matching: find.byType(GlassCard),
      ).first;
      await t.ensureVisible(card);
      await t.tap(card);
      await t.pump(const Duration(milliseconds: 400));
      await t.pump();
      expect(find.byType(HumanDetailPage), findsOneWidget);
      expect(find.text('祝福视频'), findsOneWidget);
      // 点服务套餐「祝福视频」→ 视频下单页
      await t.ensureVisible(find.text('祝福视频').first);
      await t.tap(find.text('祝福视频').first);
      await t.pump(const Duration(milliseconds: 400));
      await t.pump();
      expect(find.byType(VideoOrderPage), findsOneWidget);
      expect(find.text('提交订单'), findsWidgets);
    });

    testWidgets('B3 统一订单→评价：填内容提交后关闭回写', (t) async {
      final up = await _loggedUser();
      await _pump(t, const OrdersPage(), up: up);
      // demo 有已完成订单 → 出现「评价」入口
      final reviewBtn = find.text('评价');
      expect(reviewBtn, findsWidgets);
      await t.ensureVisible(reviewBtn.first);
      await t.tap(reviewBtn.first);
      await t.pump(const Duration(milliseconds: 400));
      await t.pump();
      expect(find.byType(ReviewPage), findsOneWidget);
      // 四维评分默认 5 星；填写内容后提交
      await t.enterText(find.byType(TextField), '成片自然，节奏满意，五星好评');
      await t.pump();
      await t.ensureVisible(find.text('提交评价'));
      await t.tap(find.text('提交评价'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 700));
      await t.pump();
      // 成功 pop(true)：评价页关闭
      expect(find.byType(ReviewPage), findsNothing);
    });
  });

  group('艺人流', () {
    testWidgets('A1 创建数字人首步未同意照片说明被拦截并反馈', (t) async {
      final up = await _loggedUser();
      await _pump(t, const AuditionPage(), up: up);
      // V15.5 自建分步流：首步标题在顶部步骤条，上传区有引导文案
      expect(find.textContaining('上传照片'), findsWidgets);
      // 当前只渲染当前步，取唯一「下一步」主按钮
      await t.tap(find.text('下一步').first);
      await t.pump(const Duration(milliseconds: 200));
      expect(find.text('请先阅读并同意照片使用说明'), findsOneWidget);
      // 仍停留在第 1 步：上传区还在，未出现第二步的真人验证入口
      expect(find.text('点击上传正面清晰照片'), findsOneWidget);
      expect(find.textContaining('点击开始真人验证'), findsNothing);
    });

    testWidgets('A2 本地落盘数字人在「我的数字人」可见', (t) async {
      final up = await _loggedUser();
      await up.addMyHuman({
        'id': 'local-flow-1',
        'name': '阿瑶·测试数字人',
        'status': 'pending',
        'scopeVideo': true,
      });
      await _pump(t, const MyHumansPage(), up: up);
      expect(find.text('阿瑶·测试数字人'), findsWidgets);
      expect(find.text('还没有数字人'), findsNothing);
    });

    testWidgets('A3 钱包与使用报告（元口径）正常渲染不崩', (t) async {
      final up = await _loggedUser();
      await _pump(t, const WalletPage(), up: up);
      expect(find.textContaining('可提现余额'), findsWidgets);
    });

    testWidgets('A4 数字人使用报告渲染累计收入', (t) async {
      final up = await _loggedUser();
      await _pump(t, const UsageReportPage(humanId: 1, humanName: '林沐雪'), up: up);
      expect(find.textContaining('累计收入'), findsWidgets);
    });
  });

  group('MCN 流', () {
    testWidgets('M1 身份认证选 MCN → 仅 H5 引导，C 端不受理机构表单', (t) async {
      await _pump(t, const IdentityPage());
      // 初始为个人艺人，无 H5 引导
      expect(find.textContaining('独立 H5 管理后台'), findsNothing);
      await t.tap(find.text('MCN机构'));
      await t.pump();
      // 出现 H5 引导，主按钮文案变「我知道了」
      expect(
        find.text('MCN 机构请通过独立 H5 管理后台完成入驻、艺人签约与运营；C 端仅面向买家与个人艺人，不开放机构下单。'),
        findsOneWidget,
      );
      expect(find.text('我知道了'), findsOneWidget);
      // 证件上传区对 MCN 隐藏（C 端不受理机构材料）
      expect(find.text('证件照片'), findsNothing);
      await t.tap(find.text('我知道了'));
      await t.pump(const Duration(milliseconds: 200));
      // 弹出 SnackBar 再次提示走 H5
      expect(
        find.text('MCN 机构请通过独立 H5 管理后台入驻与运营，C 端不开放机构业务'),
        findsOneWidget,
      );
      // 仍停留在身份认证页，未产生任何下单跳转
      expect(find.byType(IdentityPage), findsOneWidget);
    });
  });
}
