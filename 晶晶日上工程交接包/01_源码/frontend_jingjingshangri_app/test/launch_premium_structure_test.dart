// 第77轮 A3：高端定制选项结构化——配置亮点/支持形态/里程碑分期必须以结构化控件呈现，
// 不再是一整段长文本；里程碑分期比例锁定为 20/25/25/30（商业数值不变）。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/pages/launch/launch_page.dart';

void main() {
  testWidgets('高端定制结构化呈现（配置/形态/里程碑）', (t) async {
    // 放大视口让 ListView 底部高端定制块一次性构建
    t.view
      ..devicePixelRatio = 1.0
      ..physicalSize = const Size(390, 1700);
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);

    await t.pumpWidget(const MaterialApp(home: LaunchPage()));
    await t.pump(const Duration(milliseconds: 120));

    // 配置亮点三枚金胶囊
    for (final x in ['金牌编剧', '知名导演', '明星参演']) {
      expect(find.text(x), findsOneWidget);
    }
    // 支持形态四枚玻璃标签
    for (final x in ['电影', '中剧', '短剧', '网络大电影']) {
      expect(find.text(x), findsOneWidget);
    }
    // 里程碑分期：20/25/25/30
    expect(find.text('里程碑付款 · 担保分期'), findsOneWidget);
    expect(find.text('20%'), findsOneWidget);
    expect(find.text('25%'), findsNWidgets(2));
    expect(find.text('30%'), findsOneWidget);
    for (final x in ['剧本审核', '开机', '粗剪审核', '成片交付']) {
      expect(find.text(x), findsOneWidget);
    }
    // 旧的一整段长句已被结构化取代
    expect(find.textContaining('可含金牌编剧、知名导演、明星参演'), findsNothing);

    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(milliseconds: 120));
  });
}
