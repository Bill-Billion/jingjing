// Splash now enters /home on its first frame; verify that navigation at both widths.
// The legacy AI task still polls on a timer, which must stop on disposal.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/pages/splash/splash_page.dart';
import 'package:jingjingshangri_app/widgets/main_scaffold.dart';
import 'support/historical_layout_host.dart';
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
    'user': {
      'id': 1,
      'nickname': '林晚晴',
      'phone': '138****6688',
      'role': 'user'
    },
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

/// 再绘制 720ms，卸载页面后继续推进时钟，检查是否残留定时器或导航。
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
      testWidgets('splash 首帧进入新版首页，卸载后不再导航', (t) async {
        t.view.physicalSize = Size(w, h);
        t.view.devicePixelRatio = 1.0;
        addTearDown(t.view.reset);
        final up = await _user();
        final session = await historicalLayoutSession(t, loggedIn: false);
        await t.pumpWidget(HistoricalLayoutProviders(
            user: up,
            session: session,
            child: MaterialApp(home: const SplashPage(), routes: {
              '/home': (_) => const MainScaffold(),
            })));
        await t.pumpAndSettle();
        expect(find.byType(SplashPage), findsNothing);
        expect(find.byType(MainScaffold), findsOneWidget);
        expectCurrentShell(t, const MainScaffold());
        final context = t.element(find.byType(MainScaffold));
        expect(ModalRoute.of(context)?.settings.name, '/home');
        expect(Navigator.of(context).canPop(), isFalse);
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
