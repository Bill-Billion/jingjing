// A8（第50轮）：锁定艺人详情 HumanDetailPage「用户评价」区。
// 旧实现写死一条“用户评价示例”假评价且未接 getTalentReviews；本轮改为真实接口 + 三态：
// 1) demo/离线回退本地评价：渲染 MockData 评价与“N条评价”，不显假示例/空态/错误态；
// 2) online 评价接口失败：区内角标“评价加载失败…/重新加载”，可重试、不拖垮详情主体、不崩；
// 3) online 成功但无评价：落“暂无评价/完成订单后…”空态与“0条评价”。
// 页面含 LiquidScaffold 流光与 StaggerItem（Timer），禁 settle，逐帧 pump、末尾排空。
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/human_detail/human_detail_page.dart';

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

class _EmptyReviewAdapter implements HttpClientAdapter {
  ResponseBody _json(Object body) => ResponseBody.fromString(
        jsonEncode(body),
        200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    if (options.path.contains('/order-reviews/')) {
      return _json({'list': const []});
    }
    return _json({'id': 1, 'name': '林沐雪', 'avgRating': 5.0});
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  tearDown(() async {
    await AppMode.instance.setMode(ConnMode.demo);
  });

  Future<void> frames(WidgetTester t, {int n = 10}) async {
    for (var i = 0; i < n; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
  }

  Widget boot() => MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: const HumanDetailPage(
            human: {'id': 1, 'name': '林沐雪'}),
      );

  testWidgets('demo：渲染真实回退评价与条数，不显示写死的示例评价', (t) async {
    SharedPreferences.setMockInitialValues({'connMode': 'demo'});
    await AppMode.instance.load();
    await ApiService().init();

    t.view.physicalSize = const Size(390, 1700);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(boot());
    await frames(t);

    expect(find.textContaining('效果非常逼真'), findsOneWidget);
    expect(find.text('3条评价'), findsOneWidget);
    expect(find.text('视频质量好，交付速度快，服务态度超赞！'), findsNothing);
    expect(find.text('— 用户评价示例'), findsNothing);
    expect(find.text('暂无评价'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('online 评价接口失败：落区内角标可重试，详情主体不崩', (t) async {
    SharedPreferences.setMockInitialValues({'connMode': 'online'});
    await AppMode.instance.load();
    await ApiService().init();
    ApiService().debugInjectHttpAdapter(_FailAdapter());

    t.view.physicalSize = const Size(390, 1700);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(boot());
    await t.pump();
    await frames(t);

    expect(find.text('评价加载失败，请检查网络后重试'), findsOneWidget);
    expect(find.text('重新加载'), findsOneWidget);
    expect(find.text('暂无评价'), findsNothing);
    // 详情主体仍在（底部 CTA 未被错误态拖垮）
    expect(find.textContaining('立即录制'), findsOneWidget);

    await t.tap(find.text('重新加载'));
    await t.pump();
    await frames(t);
    expect(find.text('评价加载失败，请检查网络后重试'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('online 成功但无评价：落暂无评价空态与 0 条评价', (t) async {
    SharedPreferences.setMockInitialValues({'connMode': 'online'});
    await AppMode.instance.load();
    await ApiService().init();
    ApiService().debugInjectHttpAdapter(_EmptyReviewAdapter());

    t.view.physicalSize = const Size(390, 1700);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(boot());
    await t.pump();
    await frames(t);

    expect(find.text('暂无评价'), findsOneWidget);
    expect(find.text('完成订单后，欢迎来分享真实体验'), findsOneWidget);
    expect(find.text('0条评价'), findsOneWidget);
    expect(find.text('评价加载失败，请检查网络后重试'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
