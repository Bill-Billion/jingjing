// A8：锁定角色席位市场错误态——online 模式远端 getMarketRoles 失败时，
// 必须落到统一 ErrorView（"加载失败"+原因+"重新加载"），而不是误显"暂无可认领的角色席位"空态；
// 点"重新加载"可再次发起、失败后稳定停在错误态（不崩、不死循环）。
// 复用第29轮离线失败注入通道，全程离线、确定、不打真实网络。
import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/role_market/role_market_page.dart';

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
    // 必须强制 online：auto 回落 mock、demo 走本地，逼不出远端错误态
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

  testWidgets('online 远端失败：角色席位市场落 ErrorView 而非空态，可重试', (t) async {
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const RoleMarketPage(),
    ));
    await t.pump();
    await settle(t);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('角色席位加载失败，请检查网络后重试'), findsOneWidget);
    expect(find.text('重新加载'), findsOneWidget);
    // 关键回归点：失败时绝不能误显"暂无可认领的角色席位"空态
    expect(find.textContaining('暂无可认领的角色席位'), findsNothing);

    await t.tap(find.text('重新加载'));
    await t.pump();
    await settle(t);
    expect(find.text('加载失败'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
