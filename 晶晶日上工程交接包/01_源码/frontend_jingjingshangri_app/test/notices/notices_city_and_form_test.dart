import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/notices/notices_pages.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../stock/v5_test_host.dart';
import 'notices_test.dart' show noticeId, noticeData;

Finder get cityField => find.byWidgetPredicate((widget) =>
    widget is TextField && widget.decoration?.labelText == '城市（可留空）');

void main() {
  testWidgets('保活通告目录跟随城市且保留品类，本地城市优先并可恢复同步', (t) async {
    final adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/catalog')
            ? envelope({'items': [], 'next_cursor': null})
            : FakeAccountAdapter().defaultReply(r));
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    final city = ValueNotifier('郑州');
    addTearDown(city.dispose);
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: MaterialApp(
            home: Scaffold(
                body: ValueListenableBuilder<String>(
                    valueListenable: city,
                    builder: (context, city, child) => ListView(children: [
                          NoticesPage(embedded: true, initialCity: city)
                        ]))))));
    await frames(t);
    final controller = t.widget<TextField>(cityField).controller!;
    await t.tap(find.text('商单'));
    await frames(t);
    city.value = '杭州';
    await frames(t);
    expect(t.widget<TextField>(cityField).controller, same(controller));
    expect(controller.text, '杭州');
    expect(adapter.requests.last.queryParameters['city'], '杭州');
    expect(adapter.requests.last.queryParameters['type'], 'COMMERCIAL');
    await t.enterText(cityField, '北京');
    await reveal(t, find.text('筛选通告'));
    await t.tap(find.text('筛选通告'));
    await frames(t);
    final requestCount = adapter.requests.length;
    city.value = '上海';
    await frames(t);
    expect(controller.text, '北京');
    expect(adapter.requests.length, requestCount);
    await reveal(t, find.text('使用广场城市：上海'));
    await t.tap(find.text('使用广场城市：上海'));
    await frames(t);
    expect(controller.text, '上海');
    expect(adapter.requests.last.queryParameters['city'], '上海');
    expect(adapter.requests.last.queryParameters['type'], 'COMMERCIAL');
    expect(t.takeException(), isNull);
  });

  testWidgets('过时城市结果不会进入新城市通告列表', (t) async {
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
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: MaterialApp(
            home: Scaffold(
                body: ValueListenableBuilder<String>(
                    valueListenable: city,
                    builder: (context, city, child) => ListView(children: [
                          NoticesPage(embedded: true, initialCity: city)
                        ]))))));
    await frames(t);
    city.value = '杭州';
    await frames(t);
    oldReply.complete(envelope({
      'items': [
        {
          'id': noticeId,
          'owner_party_id': orgId,
          'object_version': 1,
          'rule_id': noticeId,
          'notice': noticeData('COMMERCIAL'),
          'official': false,
          'chat_enabled': false,
        }
      ],
      'next_cursor': null
    }));
    await frames(t);
    expect(find.text('合成通告'), findsNothing);
    expect(find.text('当前筛选没有仍有效的已审公开通告。'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('切换发布品类或规则先确认，取消后原选择与输入仍在', (t) async {
    const otherRule = 'b2000000-0000-4000-8000-000000000009';
    final adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/rules')) {
        return envelope({
          'items': [
            for (final entry in [(noticeId, '第一版'), (otherRule, '第二版')])
              {
                'id': entry.$1,
                'content_sha256': 'c' * 64,
                'rule': {
                  'version': entry.$2,
                  'terms': '已生效规则',
                  'submission_days': 7,
                  'minimum_levels': {
                    'EVENT': 3,
                    'COMMERCIAL': 1,
                    'RECRUITMENT': 1,
                    'OFFICIAL': null
                  }
                }
              }
          ],
          'next_cursor': null
        });
      }
      if (r.path.endsWith('/eligibility')) {
        return envelope({
          'rule_id': r.queryParameters['rule_id'],
          'rule_sha256': 'c' * 64,
          'active': true,
          'level': 1,
          'source_ids': <String>[],
          'types': ['COMMERCIAL', 'RECRUITMENT']
        });
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await host(t, session, const NoticesPage(mode: 'new'));
    final rule =
        find.widgetWithText(DropdownButtonFormField<String>, '选择已生效发布规则');
    final type =
        find.widgetWithText(DropdownButtonFormField<String>, '本次可发布类型');
    Future<void> select(Finder field, String option) async {
      await reveal(t, field);
      await t.tap(field);
      await frames(t);
      await t.tap(find.text(option).last);
      await frames(t);
    }

    await select(rule, '第一版 · 投稿7天');
    await select(type, '商单');
    final title = find.widgetWithText(TextFormField, '通告标题');
    await reveal(t, title);
    await t.enterText(title, '尚未提交的通告');
    await select(type, '招募');
    expect(find.text('更换当前选择？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    expect(t.state<FormFieldState<String>>(type).value, 'COMMERCIAL');
    await reveal(t, title);
    expect(t.widget<TextFormField>(title).controller!.text, '尚未提交的通告');
    await select(rule, '第二版 · 投稿7天');
    expect(find.text('更换当前选择？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    expect(t.state<FormFieldState<String>>(rule).value, noticeId);
    expect(
        adapter.requests.where((r) => r.path.endsWith('/eligibility')).length,
        1);
    await select(type, '招募');
    await t.tap(find.text('放弃填写并更换'));
    await frames(t);
    await reveal(t, title);
    expect(t.widget<TextFormField>(title).controller!.text, '');
    await reveal(t, type);
    expect(t.state<FormFieldState<String>>(type).value, 'RECRUITMENT');
    expect(
        adapter.requests.where(
            (r) => r.method == 'POST' && r.path.endsWith('/announcements')),
        isEmpty);
    expect(t.takeException(), isNull);
  });
}
