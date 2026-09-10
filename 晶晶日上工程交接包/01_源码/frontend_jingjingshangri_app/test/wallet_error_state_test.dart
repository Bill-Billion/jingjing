// A8：锁定钱包页错误态——online 下 getWallet/getTransactions 并发任一失败即落
// 统一 ErrorView（Future.wait 进 catch），点"重新加载"可再次发起、失败后稳定不崩。
// 复用 ApiService.debugInjectHttpAdapter 离线注入必失败适配器，不打真实网络。
import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/wallet/wallet_page.dart';

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
    await AppMode.instance.setMode(ConnMode.demo);
  });

  Future<void> settle(WidgetTester t) async {
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    await t.pump(const Duration(milliseconds: 300));
  }

  testWidgets('online 远端失败：钱包落 ErrorView，可重试且不崩', (t) async {
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const WalletPage(),
    ));
    await t.pump();
    expect(find.byType(CircularProgressIndicator), findsWidgets);

    await settle(t);
    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('钱包信息加载失败，请检查网络后重试'), findsOneWidget);
    expect(find.text('重新加载'), findsOneWidget);

    await t.tap(find.text('重新加载'));
    await t.pump();
    await settle(t);
    expect(find.text('加载失败'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
