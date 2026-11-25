import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/engagement/community_support.dart';

void main() {
  testWidgets('评选事实读出当前名称和值，刷新后不残留旧分值或票数', (t) async {
    final semantics = t.ensureSemantics();
    try {
      for (final score in [0, 88]) {
        await t.pumpWidget(MaterialApp(home: Scaffold(body: Column(children: [
          communityFact('本期结果', '总分 $score · 有效票 ${score == 0 ? 0 : 9}'),
          communityFact('原票已返还', 100),
          communityFact('尚未核定', null),
        ]))));
        await t.pumpAndSettle();
        expect(find.bySemanticsLabel('本期结果: 总分 $score · 有效票 ${score == 0 ? 0 : 9}'), findsOneWidget);
        expect(find.bySemanticsLabel('原票已返还: 100'), findsOneWidget);
        expect(find.bySemanticsLabel('尚未核定: 暂无记录'), findsOneWidget);
        expect(find.text('总分 $score · 有效票 ${score == 0 ? 0 : 9}'), findsOneWidget);
        if (score == 88) expect(find.bySemanticsLabel('本期结果: 总分 0 · 有效票 0'), findsNothing);
      }
    } finally {
      semantics.dispose();
    }
  });
}
