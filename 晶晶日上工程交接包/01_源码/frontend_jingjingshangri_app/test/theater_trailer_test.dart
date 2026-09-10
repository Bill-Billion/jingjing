// A8（第42轮）：锁定剧场「进行中的大剧」片花入口——
// 三大自有 IP 中仅《黄帝史诗·天下合》已挂已上云真实片花，海报叠唯一一个金边播放钮；
// 少年龙武/边境暗影无成片，不得出现播放钮（不臆造）。点播放钮经 Motion 转场进入真播放器 VideoPlayPage。
// VideoPlayerController 走平台 texture，离屏无法真播放，这里 mock 视频通道只验证"跳转闭环"，
// 真正的端到端播放留 integration_test/真机（B 类边界，第40/41轮已记录）。
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/theater/theater_page.dart';
import 'package:jingjingshangri_app/pages/video_lib/video_play_page.dart';

void main() {
  setUp(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    // 屏蔽视频平台通道，避免点进播放页时 MissingPluginException（不做真播放）
    const ch = MethodChannel('flutter.io/videoPlayer');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(ch, (MethodCall call) async {
      if (call.method == 'create') return <String, dynamic>{'textureId': 1};
      return null;
    });
    SharedPreferences.setMockInitialValues({'connMode': 'demo'});
    await AppMode.instance.load();
    await ApiService().init();
  });

  Future<void> boot(WidgetTester tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const Scaffold(body: TheaterPage()),
    ));
    // 让三张卡的 FadeSlideIn 入场（最大 delay 180ms）全部落到树中
    await tester.pump(const Duration(milliseconds: 320));
  }

  testWidgets('剧场三大自有 IP 均在，且仅黄帝卡有一个片花播放钮',
      (WidgetTester tester) async {
    await boot(tester);
    expect(find.text('《黄帝史诗·天下合》'), findsOneWidget);
    expect(find.text('《少年龙武》'), findsOneWidget);
    expect(find.text('《边境暗影》'), findsOneWidget);
    // 只有挂了 trailerUrl 的黄帝卡会叠播放圆钮
    expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
  });

  testWidgets('点黄帝片花钮进入真播放器，标题为该片片花',
      (WidgetTester tester) async {
    await boot(tester);
    await tester.tap(find.byIcon(Icons.play_arrow_rounded));
    await tester.pump(); // 转场首帧
    await tester.pump(const Duration(milliseconds: 120));
    expect(find.byType(VideoPlayPage), findsOneWidget);
    expect(find.text('《黄帝史诗·天下合》片花'), findsOneWidget);
  });
}
