// A8：锁定圆梦项目列表错误态——online 模式远端 getProjects 失败时，
// 必须落到统一 ErrorView（"加载失败"+"重新加载"），而不是误显"暂无开放认领的项目"空态；
// 点"重新加载"可再次发起、失败后仍稳定停在错误态（不崩、不死循环）。
// 复用第29轮失败注入通道：给 ApiService 注入必然抛 DioException 的 HTTP 适配器，全程离线。
import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/projects/projects_page.dart';

class _FailAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    throw DioException(
        requestOptions: options, type: DioExceptionType.connectionError);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  setUp(() async {
    // 必须强制 online：auto 会回落 mock、demo 直接本地数据，逼不出远端错误态
    SharedPreferences.setMockInitialValues({'connMode': 'online'});
    await AppMode.instance.load();
    await ApiService().init();
    ApiService().debugInjectHttpAdapter(_FailAdapter());
  });

  tearDown(() async {
    await AppMode.instance.setMode(ConnMode.demo);
  });

  Future<void> settle(WidgetTester t) async {
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    await t.pump(const Duration(milliseconds: 300));
  }

  testWidgets('online 远端失败：圆梦项目落 ErrorView 而非空态，可重试', (t) async {
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const ProjectsPage(),
    ));
    await t.pump();
    await settle(t);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('请检查网络后重试'), findsOneWidget);
    expect(find.text('重新加载'), findsOneWidget);
    // 关键回归点：失败时绝不能误显"暂无开放认领的项目"空态
    expect(find.textContaining('暂无开放认领的项目'), findsNothing);

    // 点重试：再次失败仍稳定停在错误态、不抛异常
    await t.tap(find.text('重新加载'));
    await t.pump();
    await settle(t);
    expect(find.text('加载失败'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
