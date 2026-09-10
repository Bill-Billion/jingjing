// A8（第48轮）：我的数字人——卡片可点 + 按审核状态给出预期说明弹层。
// 锁：审核中卡弹“1 个工作日审核/通过后上架”，已上架卡弹“艺人广场展示/可接单”，
// “我知道了”可关闭。纯离线注入 UserProvider，不登录（不触发在线同步）、不碰真实照片文件。
// 页面含 LiquidScaffold 流光（无限动画），禁止 pumpAndSettle，统一逐帧 pump。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/my_humans/my_humans_page.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({'connMode': 'demo'});
    await AppMode.instance.load();
    await ApiService().init();
  });

  tearDown(() async {
    await AppMode.instance.setMode(ConnMode.demo);
  });

  Future<UserProvider> seeded() async {
    final up = UserProvider(); // 不 saveLogin → initState 不触发在线同步，保证只看注入数据
    await up.addMyHuman({
      'id': 1,
      'name': '苏婉儿',
      'style': '古风',
      'status': 'pending',
      'statusText': '审核中',
      'scopeVideo': true,
    });
    await up.addMyHuman({
      'id': 2,
      'name': '顾云舟',
      'style': '商务',
      'status': 'active',
      'statusText': '已上架',
      'scopeVideo': true,
      'scopeEndorsement': true,
    });
    return up;
  }

  Future<void> boot(WidgetTester t, UserProvider up) async {
    t.view.physicalSize = const Size(390, 1500);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(ChangeNotifierProvider<UserProvider>.value(
      value: up,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: const MyHumansPage(),
      ),
    ));
    for (var i = 0; i < 8; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
  }

  Future<void> pumpFrames(WidgetTester t) async {
    for (var i = 0; i < 4; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
  }

  testWidgets('两张卡渲染：一张审核中、一张已上架，且都有可点提示箭头', (t) async {
    final up = await seeded();
    await boot(t, up);
    expect(find.text('苏婉儿'), findsOneWidget);
    expect(find.text('顾云舟'), findsOneWidget);
    expect(find.text('审核中'), findsOneWidget);
    expect(find.text('已上架'), findsOneWidget);
    expect(find.byIcon(Icons.chevron_right_rounded), findsNWidgets(2));
  });

  testWidgets('点审核中卡：弹审核预期说明，可关闭', (t) async {
    final up = await seeded();
    await boot(t, up);
    await t.tap(find.text('苏婉儿'));
    await pumpFrames(t);
    expect(find.text('审核中 · 等待平台审核'), findsOneWidget);
    expect(find.textContaining('1 个工作日内完成真人与合规审核'), findsOneWidget);
    expect(find.textContaining('审核通过后自动上架'), findsOneWidget);

    await t.tap(find.text('我知道了'));
    for (var i = 0; i < 5; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    expect(find.text('审核中 · 等待平台审核'), findsNothing);
  });

  testWidgets('点已上架卡：弹上架可接单说明', (t) async {
    final up = await seeded();
    await boot(t, up);
    await t.tap(find.text('顾云舟'));
    await pumpFrames(t);
    expect(find.text('已上架 · 可以接单'), findsOneWidget);
    expect(find.textContaining('已在艺人广场展示'), findsOneWidget);
    expect(find.textContaining('收益自动进入钱包'), findsOneWidget);
  });
}
