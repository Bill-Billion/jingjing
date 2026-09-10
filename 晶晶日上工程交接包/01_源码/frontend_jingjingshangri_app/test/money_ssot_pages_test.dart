// A8（第46轮）：金额展示 SSOT 二轮收口的页面级守卫——锁定 MCN 看板 / 钱包确实走 Money
// （整数 rmbInt 千分位、非整两位；钱包余额/流水两位 format），防止回退成内联 ¥xx / toStringAsFixed 无分位。
// Money 纯函数千分位已由 money_format_test 锁定，这里锁“页面真的调用了 Money、import 与渲染链路正确”。
// 两页均含 LiquidScaffold 流光（无限动画），禁止 pumpAndSettle，统一逐帧 pump。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/mcn/mcn_page.dart';
import 'package:jingjingshangri_app/pages/wallet/wallet_page.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({'connMode': 'demo'});
    await AppMode.instance.load();
    await ApiService().init();
  });

  tearDown(() async {
    await AppMode.instance.setMode(ConnMode.demo);
  });

  Future<void> boot(WidgetTester t, Widget home) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: home,
    ));
    for (var i = 0; i < 8; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
  }

  group('MCN 看板金额走 Money.rmbInt（demo: 8642.50/1986.00/2360.80）', () {
    testWidgets('整数无小数、非整两位，且都带千分位', (t) async {
      await boot(t, const McnPage());
      expect(find.text('¥8,642.50'), findsOneWidget); // 总收益，非整
      expect(find.text('¥1,986'), findsOneWidget); // 本月收益，整数
      expect(find.text('¥2,360.80'), findsOneWidget); // 待提现，非整
    });

    testWidgets('旧的无千分位内联写法不再出现', (t) async {
      await boot(t, const McnPage());
      for (final old in const ['¥8642.50', '¥1986', '¥2360.80']) {
        expect(find.text(old), findsNothing, reason: '应千分位：$old');
      }
    });
  });

  group('钱包金额走 Money（两位小数）', () {
    testWidgets('顶部余额大字千分位、待结算/冻结保留两位且走 Money.rmb', (t) async {
      await boot(t, const WalletPage());
      expect(find.text('¥1,286.50'), findsOneWidget); // CountUpText thousands 终态
      expect(
          find.text('待结算 ¥396.00 · 冻结保证金 ¥500.00'), findsOneWidget);
    });

    testWidgets('流水 -1200 渲染为带千分位两位的 -1,200.00', (t) async {
      await boot(t, const WalletPage());
      final target = find.text('-1,200.00');
      if (!target.evaluate().isNotEmpty) {
        await t.scrollUntilVisible(target, 120,
            scrollable: find.byType(Scrollable).last);
      }
      expect(find.text('-1,200.00'), findsOneWidget);
      expect(find.text('-1200.00'), findsNothing);
    });
  });
}
