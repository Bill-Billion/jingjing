// 第59轮 A8：锁定剧本阅读页「超出改本费」兜底必须走 Pricing.extraRevisionFee（SSOT），
// 当远端/演示数据未下发 extraRevisionFee 时，状态条显示「已用修改轮次：x/2（超出200元/轮）」，
// 不允许再出现写死的 ?? 200。全程 demo 离线、确定、不打真实网络。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/utils/pricing.dart';
import 'package:jingjingshangri_app/pages/script_reader/script_reader_page.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await AppMode.instance.load();
    await ApiService().init();
  });

  tearDown(() async {
    await AppMode.instance.setMode(ConnMode.demo);
  });

  Future<void> settle(WidgetTester t) async {
    await t.pump();
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
  }

  testWidgets('演示数据缺 extraRevisionFee：改本费兜底走 Pricing SSOT', (t) async {
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const ScriptReaderPage(orderId: 1),
    ));
    await settle(t);

    final expectedFee = Pricing.extraRevisionFee.toInt();
    final finder = find.byWidgetPredicate((w) =>
        w is Text &&
        (w.data ?? '').contains('已用修改轮次：0/2') &&
        (w.data ?? '').contains('超出$expectedFee元/轮'));
    expect(finder, findsOneWidget,
        reason: '改本费兜底必须来自 Pricing.extraRevisionFee（=$expectedFee）');
    expect(t.takeException(), isNull);
  });
}
