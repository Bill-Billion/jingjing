// A7 收尾：把内置 Timer 的两页纳入布局不溢出回归，达成 42/42 全覆盖。
//   - splash：_bootstrap 最短展示 1400ms 后 pushReplacement；
//   - ai_task：Timer.periodic 1500ms 轮询。
// 做法：只推进到 720ms（绘制首屏与进场动画、不触发导航/第二次轮询）做布局断言，
// 随后 unmount() 触发 dispose 取消 periodic，再 pump 1600ms 让残余一次性定时器落地
// （回调内 !mounted 直接 return，不导航、不 setState），从而测试结束无 pending timer。
// demo 离线数据、不联网。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/pages/splash/splash_page.dart';
import 'package:jingjingshangri_app/pages/ai_studio/ai_task_page.dart';

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

/// 绘制 720ms（短于 1400/1500 的定时器阈值）后卸载并排空残余定时器。
/// 本 Flutter 版本无 WidgetTester.unmount，用 pumpWidget 空组件替换以触发 dispose。
Future<void> _paintThenDrain(WidgetTester t) async {
  for (var i = 0; i < 6; i++) {
    await t.pump(const Duration(milliseconds: 120));
  }
  await t.pumpWidget(const SizedBox());
  await t.pump(const Duration(milliseconds: 1600));
}

void main() {
  setUpAll(_boot);

  for (final spec in [
    ['360', 360.0, 780.0],
    ['840', 840.0, 1100.0],
  ]) {
    final tag = spec[0] as String;
    final w = spec[1] as double, h = spec[2] as double;
    group('内置Timer页布局不溢出 $tag', () {
      testWidgets('splash 开屏页（绘制后卸载、不触发导航）', (t) async {
        t.view.physicalSize = Size(w, h);
        t.view.devicePixelRatio = 1.0;
        addTearDown(t.view.reset);
        final up = await _user();
        await t.pumpWidget(_wrap(const SplashPage(), up));
        await _paintThenDrain(t);
        // 能走到这里即无 RenderFlex 越界 / 无界约束 / 无 pending timer
        expect(t.takeException(), isNull);
      });

      testWidgets('ai_task AI生成进度页（轮询定时器随卸载取消）', (t) async {
        t.view.physicalSize = Size(w, h);
        t.view.devicePixelRatio = 1.0;
        addTearDown(t.view.reset);
        final up = await _user();
        await t.pumpWidget(
          _wrap(
            const AiTaskPage(
              kind: 'image',
              prompt: '演示提示词',
              task: {'id': 'demo-task', 'status': 'processing'},
            ),
            up,
          ),
        );
        await _paintThenDrain(t);
        expect(t.takeException(), isNull);
      });
    });
  }
}
