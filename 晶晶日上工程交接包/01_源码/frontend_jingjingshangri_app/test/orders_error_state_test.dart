// A8：锁定第28轮补的订单列表错误态——online 模式下远端请求失败时，
// 必须落到统一 ErrorView（标题"加载失败"+原因+"重新加载"），而不是误显"暂无订单"空态；
// 且点"重新加载"可再次发起、失败后仍稳定停在错误态（不崩、不死循环）。
// 通过给 ApiService 注入一个必然抛 DioException 的 HTTP 适配器实现，全程离线、确定、不打真实网络。
import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/orders/orders_page.dart';

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
    SharedPreferences.setMockInitialValues({'connMode': 'online'});
    await AppMode.instance.load();
    await ApiService().init();
    ApiService().debugInjectHttpAdapter(_FailAdapter());
  });

  tearDown(() async {
    // 单例全局状态复位，避免污染其它测试文件
    await AppMode.instance.setMode(ConnMode.demo);
  });

  Future<void> settle(WidgetTester t) async {
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    await t.pump(const Duration(milliseconds: 300));
  }

  testWidgets('online 远端失败：订单页落 ErrorView 而非空态，可重试', (t) async {
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const OrdersPage(),
    ));
    // 初始为加载转圈
    await t.pump();
    expect(find.byType(CircularProgressIndicator), findsWidgets);

    // 异步失败落地后呈现统一错误态
    await settle(t);
    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('订单加载失败，请检查网络后重试'), findsOneWidget);
    expect(find.text('重新加载'), findsOneWidget);
    // 关键回归点：失败时绝不能误显"暂无订单"空态
    expect(find.textContaining('暂无订单'), findsNothing);

    // 点重试：再次失败仍稳定停在错误态、不抛异常
    await t.tap(find.text('重新加载'));
    await t.pump();
    await settle(t);
    expect(find.text('加载失败'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
