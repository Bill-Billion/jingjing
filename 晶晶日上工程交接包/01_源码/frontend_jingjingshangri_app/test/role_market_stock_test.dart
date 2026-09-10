// 第74轮 A3/A8：锁定角色席位市场“已认 sold/total”与“剩余 total-sold 席”永远自洽，
// 防止出现 12/20 却剩 9 这类库存矛盾；同时锁定满员锁定/可认领语义。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/pages/role_market/role_market_page.dart';

void main() {
  testWidgets('角色席位库存口径自洽（已认 + 剩余 = 总数）', (t) async {
    // 手机视口，避免 ListView 懒加载漏掉底部卡片
    t.view
      ..devicePixelRatio = 1.0
      ..physicalSize = const Size(390, 1400);
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(const MaterialApp(home: RoleMarketPage()));
    // getMarketRoles 离线兜底为异步，逐帧推进（不用 pumpAndSettle，避开流光无限动画）
    for (var i = 0; i < 8; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }

    // 静态兜底数据：sold/total -> 剩余 = total - sold
    const pairs = {
      '12/20': '剩余 8 席',
      '15/30': '剩余 15 席',
      '31/50': '剩余 19 席',
      '20/20': '剩余 0 席',
      '9/40': '剩余 31 席',
    };
    pairs.forEach((soldTotal, left) {
      expect(find.text('已认 $soldTotal'), findsWidgets);
      expect(find.text(left), findsWidgets);
    });

    // 满员（20/20）显示“已锁定”，其余“可定制”
    expect(find.text('已锁定'), findsOneWidget);
    expect(find.text('可定制'), findsNWidgets(4));
  });
}
