// A8：锁定剧本阅读页错误态——online 远端 getSampleScript 失败时落统一 ErrorView
// （"加载失败"+"剧本加载失败"+"重新加载"），重试可再次发起、失败后稳定不崩。
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
import 'package:jingjingshangri_app/pages/script_reader/script_reader_page.dart';

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
    await t.pump();
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    await t.pump(const Duration(milliseconds: 300));
  }

  testWidgets('online 远端失败：剧本阅读落 ErrorView，可重试不崩', (t) async {
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const ScriptReaderPage(orderId: 1),
    ));
    await settle(t);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('剧本加载失败'), findsOneWidget);
    expect(find.text('重新加载'), findsOneWidget);

    await t.tap(find.text('重新加载'));
    await t.pump();
    await settle(t);
    expect(find.text('加载失败'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
