// A8：锁定艺人广场（我的数字人/艺人列表）错误态——online 模式远端 getHumans 失败时，
// 必须落到自建错误视图"无法连接服务器"+"重新加载"，而不是误显"暂无符合条件的艺人"空态；
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
import 'package:jingjingshangri_app/pages/humans/humans_page.dart';

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

  testWidgets('online 远端失败：艺人广场落错误视图而非空态，可重试', (t) async {
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const HumansPage(),
    ));
    await t.pump();
    await settle(t);

    expect(find.text('无法连接服务器'), findsOneWidget);
    expect(find.text('可在「我的-设置」切换到演示模式体验'), findsOneWidget);
    expect(find.text('重新加载'), findsOneWidget);
    // 关键回归点：失败时绝不能误显"暂无符合条件的艺人"空态
    expect(find.textContaining('暂无符合条件的艺人'), findsNothing);

    // 点重试：再次失败仍稳定停在错误态、不抛异常
    await t.tap(find.text('重新加载'));
    await t.pump();
    await settle(t);
    expect(find.text('无法连接服务器'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
