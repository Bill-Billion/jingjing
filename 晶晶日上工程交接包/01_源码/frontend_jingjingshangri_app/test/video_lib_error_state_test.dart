// A8：锁定我的视频页错误态——VideoLibPage 内含"我购买的/我收到的"两个 _VideoList，
// online 远端 getMyVideos/getReceivedVideos 均失败时，两个列表都落统一 ErrorView
// （"加载失败"+"视频加载失败"+"重新加载"），而不是误显"暂无视频"空态；重试不崩。
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
import 'package:jingjingshangri_app/pages/video_lib/video_lib_page.dart';

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

  testWidgets('online 远端失败：两个视频列表均落 ErrorView 而非空态，可重试', (t) async {
    await t.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const VideoLibPage(),
    ));
    await settle(t);

    // 两个 Tab 列表都失败：错误态组件至少各一份
    expect(find.text('加载失败'), findsWidgets);
    expect(find.text('视频加载失败'), findsWidgets);
    expect(find.text('重新加载'), findsWidgets);
    // 关键回归点：失败时绝不能误显"暂无视频"空态
    expect(find.textContaining('暂无视频'), findsNothing);

    // 点第一个列表的重试：再次失败仍稳定、不抛异常
    await t.tap(find.text('重新加载').first);
    await t.pump();
    await settle(t);
    expect(find.text('视频加载失败'), findsWidgets);
    expect(t.takeException(), isNull);
  });
}
