import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/auditions/auditions_pages.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../stock/v5_test_host.dart';
import 'auditions_fixtures.dart';

Future<void> cityHost(
    WidgetTester t, AccountSession session, ValueNotifier<String> city) async {
  t.view.physicalSize = const Size(390, 844);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.reset);
  await t.pumpWidget(ChangeNotifierProvider.value(
      value: session,
      child: MaterialApp(
          home: Scaffold(
              body: ValueListenableBuilder<String>(
                  valueListenable: city,
                  builder: (context, city, child) => ListView(children: [
                        AuditionsPage(embedded: true, initialCity: city)
                      ]))))));
  await frames(t);
}

Finder get cityField => find.byWidgetPredicate(
    (widget) => widget is TextField && widget.decoration?.labelText == '城市筛选');

void main() {
  testWidgets('保活目录跟随全局城市，本页手动筛选优先且可恢复跟随', (t) async {
    final adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/catalog')
            ? envelope({'items': [], 'next_cursor': null})
            : FakeAccountAdapter().defaultReply(r));
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    final city = ValueNotifier('郑州');
    addTearDown(city.dispose);
    await cityHost(t, session, city);
    final controller = t.widget<TextField>(cityField).controller;
    List<String?> queries() => adapter.requests
        .where((r) => r.path.endsWith('/catalog'))
        .map((r) => r.queryParameters['city'] as String?)
        .toList();
    expect(queries(), ['郑州']);
    city.value = '杭州';
    await frames(t);
    expect(t.widget<TextField>(cityField).controller, same(controller));
    expect(controller!.text, '杭州');
    expect(queries(), ['郑州', '杭州']);

    await t.enterText(cityField, '北京');
    await reveal(t, find.text('按城市查找'));
    await t.tap(find.text('按城市查找'));
    await frames(t);
    expect(queries().last, '北京');
    city.value = '上海';
    await frames(t);
    expect(controller.text, '北京');
    expect(queries(), ['郑州', '杭州', '北京']);
    expect(find.text('当前使用本页城市，广场换城不会覆盖。'), findsOneWidget);

    await reveal(t, find.text('使用广场城市：上海'));
    await t.tap(find.text('使用广场城市：上海'));
    await frames(t);
    expect(controller.text, '上海');
    expect(queries().last, '上海');
    city.value = '广州';
    await frames(t);
    expect(controller.text, '广州');
    expect(queries().last, '广州');
    expect(t.takeException(), isNull);
  });

  testWidgets('旧城市慢响应不能混入新城市结果', (t) async {
    final oldReply = Completer<ResponseBody>();
    final adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/catalog')) {
        if (r.queryParameters['city'] == '郑州') return oldReply.future;
        return envelope({'items': [], 'next_cursor': null});
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    final city = ValueNotifier('郑州');
    addTearDown(city.dispose);
    await cityHost(t, session, city);
    city.value = '杭州';
    await frames(t);
    expect(find.text('当前筛选没有仍可约的有效方案。'), findsOneWidget);
    oldReply.complete(envelope({
      'items': [auditionPublic()],
      'next_cursor': null
    }));
    await frames(t);
    expect(t.widget<TextField>(cityField).controller!.text, '杭州');
    expect(find.text('当前筛选没有仍可约的有效方案。'), findsOneWidget);
    expect(find.text('查看并预约本方案'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
