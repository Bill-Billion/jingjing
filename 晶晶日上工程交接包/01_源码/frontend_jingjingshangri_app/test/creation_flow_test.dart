// A8：以 widget 测试锁定 A3 两轮行为——
//  1) 角色席位市场卡片（第20轮）：进度数字标注、剩余/已锁定文案、可定制认领引导；
//  2) 创建数字人分步流（第21轮）：step0 每步门槛（未同意/未上传不得下一步）。
// 全部 demo 离线数据、不联网、不触发 image_picker 与真实提交。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/pages/role_market/role_market_page.dart';
import 'package:jingjingshangri_app/pages/audition/audition_page.dart';

Future<void> _boot() async {
  SharedPreferences.setMockInitialValues({'connMode': 'demo'});
  await AppMode.instance.load();
  await ApiService().init();
}

Future<UserProvider> _user() async {
  final up = UserProvider();
  await up.saveLogin({
    'token': 'demo-token',
    'user': {'id': 1, 'nickname': '林晚晴', 'phone': '138****6688', 'role': 'user'},
  });
  return up;
}

Widget _wrap(Widget child, UserProvider up) =>
    ChangeNotifierProvider<UserProvider>.value(
      value: up,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: child,
      ),
    );

Future<void> _settle(WidgetTester t) async {
  for (var i = 0; i < 6; i++) {
    await t.pump(const Duration(milliseconds: 120));
  }
  await t.pump(const Duration(milliseconds: 200));
}

// ListView.builder 懒加载，需足够高视口让 5 张席位卡全部构建入树。
Future<void> _tallView(WidgetTester t) async {
  t.view.physicalSize = const Size(390.0, 1800.0);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.reset);
}

void main() {
  setUpAll(_boot);

  group('角色席位市场卡片（第20轮）', () {
    testWidgets('demo 五张卡渲染进度标注与剩余席位', (t) async {
      final up = await _user();
      await _tallView(t);
      await t.pumpWidget(_wrap(const RoleMarketPage(), up));
      await _settle(t);

      // 主角席位：天下合 + 边境暗影各一
      expect(find.text('主角席位'), findsNWidgets(2));
      // 第20轮新增的「已认 sold/total」进度标注
      expect(find.text('已认 12/20'), findsOneWidget);
      expect(find.text('已认 20/20'), findsOneWidget);
      // 剩余席位文案（天下合主角 20-12=8，唯一）
      expect(find.text('剩余 8 席'), findsOneWidget);
      // 售罄卡：已锁定 + 剩余 0 席
      expect(find.text('已锁定'), findsOneWidget);
      expect(find.text('剩余 0 席'), findsOneWidget);
      // 4 张仍可认领
      expect(find.text('可定制'), findsNWidgets(4));
    });

    testWidgets('点可定制弹出去剧场认领的引导', (t) async {
      final up = await _user();
      await t.pumpWidget(_wrap(const RoleMarketPage(), up));
      await _settle(t);

      await t.tap(find.text('可定制').first);
      await t.pump(const Duration(milliseconds: 120));
      expect(find.textContaining('项目详情认领'), findsOneWidget);
      expect(find.textContaining('黄帝史诗·天下合'), findsWidgets);
    });
  });

  group('创建数字人分步流门槛（第21轮）', () {
    testWidgets('step0 未同意照片说明不得下一步', (t) async {
      final up = await _user();
      // 第47轮 step0 新增真人拍摄要点后内容变高，补足视口让同意行可点（产品侧有滚动兜底）。
      t.view.physicalSize = const Size(390.0, 844.0);
      t.view.devicePixelRatio = 1.0;
      addTearDown(t.view.reset);
      await t.pumpWidget(_wrap(const AuditionPage(), up));
      await _settle(t);
      // 初始停在第 1 步
      expect(find.text('第 1/6 步 · 上传照片'), findsOneWidget);

      await t.tap(find.text('下一步'));
      await t.pump(const Duration(milliseconds: 120));
      expect(find.text('请先阅读并同意照片使用说明'), findsOneWidget);
      // 仍停留在第 1 步，未前进
      expect(find.text('第 1/6 步 · 上传照片'), findsOneWidget);
      expect(find.text('第 2/6 步 · 真人验证'), findsNothing);
    });

    testWidgets('step0 已同意但未上传照片仍不得下一步', (t) async {
      final up = await _user();
      // 第47轮 step0 新增真人拍摄要点后内容变高，补足视口让同意行可点（产品侧有滚动兜底）。
      t.view.physicalSize = const Size(390.0, 844.0);
      t.view.devicePixelRatio = 1.0;
      addTearDown(t.view.reset);
      await t.pumpWidget(_wrap(const AuditionPage(), up));
      await _settle(t);

      // 勾选整行同意
      await t.tap(find.text('我已知晓照片用途，同意上传'));
      await t.pump(const Duration(milliseconds: 120));
      await t.tap(find.text('下一步'));
      await t.pump(const Duration(milliseconds: 120));
      expect(find.text('请先上传照片'), findsOneWidget);
      expect(find.text('第 1/6 步 · 上传照片'), findsOneWidget);
    });
  });
}
