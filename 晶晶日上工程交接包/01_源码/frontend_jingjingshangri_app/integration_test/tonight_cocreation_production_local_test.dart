import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/production/production_pages.dart';

const origin = String.fromEnvironment('NATIVE_ORIGIN');
const controlToken = String.fromEnvironment('NATIVE_CONTROL');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  Future<Map<String, dynamic>> control(String action) async {
    final client = HttpClient();
    try {
      final request =
          await client.postUrl(Uri.parse('$origin/__native/control'));
      request.headers.set('Authorization', 'Bearer $controlToken');
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({'action': action}));
      final response = await request.close();
      final text = await utf8.decoder.bind(response).join();
      expect(response.statusCode, 200, reason: action);
      return Map<String, dynamic>.from(jsonDecode(text) as Map);
    } finally {
      client.close(force: true);
    }
  }

  Future<void> frames(WidgetTester t, [int n = 6]) async {
    for (var i = 0; i < n; i++) {
      await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)));
      await t.pump(const Duration(milliseconds: 150));
    }
  }

  Future<void> reveal(WidgetTester t, Finder finder) async {
    FocusManager.instance.primaryFocus?.unfocus();
    await frames(t, 2);
    if (finder.evaluate().isEmpty &&
        find.byType(Scrollable).evaluate().isNotEmpty) {
      t
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .jumpTo(0);
      await frames(t, 2);
    }
    for (var i = 0; i < 50 && finder.evaluate().isEmpty; i++) {
      if (find.byType(Scrollable).evaluate().isNotEmpty) {
        await t.drag(find.byType(Scrollable).first, const Offset(0, -280));
      }
      await frames(t, 1);
    }
    expect(finder, findsWidgets);
    await Scrollable.ensureVisible(t.element(finder.first), alignment: .4);
    await frames(t, 2);
  }

  Future<void> tap(WidgetTester t, Finder finder) async {
    await reveal(t, finder);
    await t.tap(finder.first.hitTestable());
    await frames(t);
  }

  testWidgets('同一共创订单的四版原生确认与剧本响应丢失恢复', (t) async {
    final fixture = await control('production-setup');
    final account = fixture['account'] as Map;
    final versionId = fixture['version_id'] as String;
    final projectId = fixture['project_id'] as String;
    final dio = Dio(BaseOptions(
        baseUrl: origin,
        validateStatus: (_) => true,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 30)));
    final api = AccountApi(dio: dio);
    final me =
        await api.request('GET', '/api/v1/me', token: account['bearer_token']);
    final keys = <String>[], bodies = <String>[];
    var bootstrap = true, loseResponse = true;
    dio.interceptors.add(InterceptorsWrapper(onRequest: (r, h) {
      if (bootstrap &&
          r.method == 'POST' &&
          r.path == '/api/v1/auth/sessions') {
        bootstrap = false;
        h.resolve(Response<dynamic>(requestOptions: r, statusCode: 200, data: {
          'data': {
            'access_token': account['bearer_token'],
            'token_type': 'Bearer',
            'account': me
          }
        }));
        return;
      }
      if (r.method == 'POST' &&
          r.path == '/api/v1/production/versions/$versionId/feedback') {
        keys.add('${r.headers['Idempotency-Key']}');
        bodies.add(jsonEncode(r.data));
      }
      h.next(r);
    }, onResponse: (r, h) {
      if (loseResponse &&
          r.statusCode == 200 &&
          r.requestOptions.method == 'POST' &&
          r.requestOptions.path ==
              '/api/v1/production/versions/$versionId/feedback') {
        loseResponse = false;
        h.reject(DioException(
            requestOptions: r.requestOptions,
            type: DioExceptionType.connectionError,
            message: 'synthetic response loss after commit'));
        return;
      }
      h.next(r);
    }));
    final session = AccountSession(api: api);
    await session.login('synthetic', 'synthetic', 'synthetic');
    await session.loadParties();
    session.select(session.parties
        .singleWhere((p) => p['party']['id'] == account['party_id']));
    Future<void> showVersion(String id) async {
      await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
          value: session,
          child: MaterialApp(
              key: ValueKey(id),
              home: ProductionVersionPage(versionId: id),
              onGenerateRoute: (settings) => MaterialPageRoute<void>(
                  settings: settings,
                  builder: (_) =>
                      settings.name!.startsWith('/production/feedback')
                          ? ProductionVersionPage(
                              versionId: id,
                              feedback: true,
                              evidence: Map<String, dynamic>.from(
                                  settings.arguments as Map))
                          : ProductionProjectPage(projectId: projectId)))));
      await frames(t, 20);
    }

    await showVersion(versionId);
    await frames(t, 20);
    await tap(t, find.text('完整阅读'));
    await frames(t, 10);
    expect(
        find.descendant(
            of: find.byType(Dialog),
            matching: find.text('Synthetic script only')),
        findsOneWidget);
    await tap(t, find.text('返回审阅'));
    await tap(t, find.widgetWithText(CheckboxListTile, '我已完整阅读本版剧本。'));
    final note = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == '确认说明');
    await reveal(t, note);
    await t.enterText(note, '合成测试：已完整阅读当前版本');
    await frames(t, 2);
    await tap(t, find.text('确认这版剧本'));
    await tap(t, find.text('确认办理'));
    await reveal(t, find.text('恢复原请求核对'));
    await tap(t, find.text('恢复原请求核对'));
    await tap(t, find.text('确认办理'));
    for (var i = 0;
        i < 100 && find.byType(ProductionProjectPage).evaluate().isEmpty;
        i++) {
      await frames(t, 1);
    }
    expect(find.byType(ProductionProjectPage), findsOneWidget);
    expect(keys, hasLength(2));
    expect(keys.first, keys.last);
    expect(bodies.first, bodies.last);

    for (final stage in ['SAMPLE', 'ROUGH_CUT', 'FINAL']) {
      final next = await control('production-next');
      expect(next['stage'], stage);
      await showVersion(next['version_id'] as String);
      await tap(t, find.text('播放预览'));
      for (var i = 0;
          i < 100 && find.text('本版内容已打开。请自行核对完整内容，再勾选验收项。').evaluate().isEmpty;
          i++) {
        await frames(t, 1);
      }
      expect(find.text('本版内容已打开。请自行核对完整内容，再勾选验收项。'), findsOneWidget);
      for (final name in [
        'script_reviewed',
        'specification_reviewed',
        'audio_reviewed',
        'branding_reviewed'
      ]) {
        await tap(t, find.byKey(ValueKey('production-check-$name')));
      }
      await tap(t, find.text('本版确认与修改意见'));
      await tap(t, find.text('确认本版'));
      final stageNote = find.byWidgetPredicate(
          (w) => w is TextField && w.decoration?.labelText == '确认说明');
      await reveal(t, stageNote);
      await t.enterText(stageNote, '合成测试：已查看并确认 $stage 版本');
      await frames(t, 2);
      await tap(t, find.text('提交本版确认'));
      await tap(t, find.text('确认办理'));
      for (var i = 0;
          i < 100 && find.byType(ProductionProjectPage).evaluate().isEmpty;
          i++) {
        await frames(t, 1);
      }
      expect(find.byType(ProductionProjectPage), findsOneWidget, reason: stage);
    }
    expect(t.takeException(), isNull);
    await control('production-complete');
    await t.pumpWidget(const SizedBox.shrink());
    session.dispose();
  });
}
