// 第76轮 A8：AppNetworkImage 在有界/无界约束下都能构建不崩（解码尺寸自适应/回退分支）。
// 不断言网络 errorWidget（依赖真实 IO 时序，易 flaky）。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/widgets/app_network_image.dart';

void main() {
  testWidgets('有界约束下正常构建（按尺寸限解码）', (t) async {
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 120,
          height: 120,
          child: AppNetworkImage(
            imageUrl: 'https://example.com/x.png',
            placeholder: (_, __) => const Text('ph'),
          ),
        ),
      ),
    ));
    await t.pump(const Duration(milliseconds: 30));
    expect(find.byType(AppNetworkImage), findsOneWidget);
    expect(find.text('ph'), findsOneWidget);
  });

  testWidgets('无界约束下不崩（解码尺寸回退 null）', (t) async {
    await t.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: UnconstrainedBox(
          child: AppNetworkImage(imageUrl: 'https://example.com/y.png'),
        ),
      ),
    ));
    await t.pump(const Duration(milliseconds: 30));
    expect(find.byType(AppNetworkImage), findsOneWidget);
  });
}
