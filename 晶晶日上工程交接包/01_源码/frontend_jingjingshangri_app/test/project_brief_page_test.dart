// A8/A4（第44轮）：定制剧项目书「本地预览页」ProjectBriefPage 的页面级护栏。
// 锁定：分版 AppBar 标题、免责声明常驻、复制全文真正写入系统剪贴板并弹已复制提示、
// 导出 PDF 当前为占位提示（不引重依赖、不假装已导出）。
// LiquidScaffold 内含无限流光动画，禁止 pumpAndSettle，统一逐帧 pump。
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/project_brief/project_brief_page.dart';

void main() {
  String? clipboard;

  Future<void> boot(WidgetTester t, {required bool isProject}) async {
    clipboard = null;
    // 捕获系统剪贴板写入
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform,
            (MethodCall call) async {
      if (call.method == 'Clipboard.setData') {
        clipboard = (call.arguments as Map)['text'] as String?;
      }
      return null;
    });
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: ProjectBriefPage(
        source: const {
          'scriptTitle': '逆风翻盘的夏天',
          'genre': '都市励志',
          'orderNo': 'JJSR20260904001',
          'contactName': '林晚晴',
          'title': '黄帝史诗·天下合',
          'type': '古装逆袭',
        },
        isProject: isProject,
      ),
    ));
    for (var i = 0; i < 5; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
  }

  testWidgets('定制剧版：分版标题/免责声明/复制与 PDF 按钮都在', (t) async {
    await boot(t, isProject: false);
    expect(find.text('定制剧项目书'), findsOneWidget); // AppBar
    expect(find.text('圆梦项目书'), findsNothing);
    expect(find.text('复制全文'), findsOneWidget);
    expect(find.text('导出PDF'), findsOneWidget);
    // 正文渲染了源里的真实剧目（顶部标题卡，滚动前断言，避免滚到底后被懒加载回收）
    expect(find.textContaining('逆风翻盘的夏天'), findsWidgets);
    // 免责声明在长 ListView 末尾，离屏懒加载未构建，先滚到可见
    await t.scrollUntilVisible(
      find.textContaining('正式条款以电子合同为准'), 140,
      scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('正式条款以电子合同为准'), findsOneWidget);
    // 滚动沿途新建的 StaggerItem 入场 Future.delayed（上限 360ms）需排空，避免 pending timer
    for (var i = 0; i < 8; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
  });

  testWidgets('复制全文：写入剪贴板且弹“已复制”提示', (t) async {
    await boot(t, isProject: false);
    await t.tap(find.text('复制全文'));
    for (var i = 0; i < 4; i++) {
      await t.pump(const Duration(milliseconds: 80));
    }
    expect(clipboard, isNotNull);
    expect(clipboard!, contains('逆风翻盘的夏天'));
    expect(clipboard!, contains('七步标准化流程'));
    expect(find.text('项目书全文已复制，可粘贴发送或存档'), findsOneWidget);
  });

  testWidgets('导出 PDF：当前为“正式版开放”占位提示，不假装导出', (t) async {
    await boot(t, isProject: false);
    await t.tap(find.text('导出PDF'));
    for (var i = 0; i < 4; i++) {
      await t.pump(const Duration(milliseconds: 80));
    }
    expect(find.textContaining('PDF 导出将在正式版开放'), findsOneWidget);
  });

  testWidgets('圆梦版 AppBar 切换为“圆梦项目书”，分版不串', (t) async {
    await boot(t, isProject: true);
    expect(find.text('圆梦项目书'), findsOneWidget);
    expect(find.text('定制剧项目书'), findsNothing);
    expect(find.textContaining('自有 IP 角色席位认领'), findsOneWidget);
  });
}
