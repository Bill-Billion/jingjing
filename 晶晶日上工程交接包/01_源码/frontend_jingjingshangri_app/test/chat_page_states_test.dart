// A8（第49轮）：锁定私信会话 ChatPage 的三态与 demo 会话 id 兼容。
// 1) demo 下 createConversation 回退只给 id（无 conversationId），兼容后应能加载预置历史、不空白不死页；
// 2) online 初始化（建会话）失败：落统一 ErrorView“加载失败/会话加载失败…/重新加载”，可重试、不崩、不误显空态；
// 3) online 建会话成功但历史为空：落统一 EmptyView“还没有聊天记录/发送一条消息…”引导。
// 页面含 LiquidScaffold 流光（无限动画），禁止 pumpAndSettle，统一逐帧 pump。
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/chat/chat_page.dart';

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

/// 建会话成功、但消息历史为空——用于逼出“空消息引导态”。
class _EmptyHistoryAdapter implements HttpClientAdapter {
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
    final path = options.path;
    if (path.endsWith('/messages')) {
      return _json({'list': const []});
    }
    return _json({'conversationId': 1});
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  tearDown(() async {
    await AppMode.instance.setMode(ConnMode.demo);
  });

  Future<void> frames(WidgetTester t, {int n = 8}) async {
    for (var i = 0; i < n; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
  }

  Widget boot() => MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: const ChatPage(human: {'id': 1, 'name': '林沐雪'}),
      );

  testWidgets('demo：会话 id 兼容后正常加载历史消息，不显空态/错误态', (t) async {
    SharedPreferences.setMockInitialValues({'connMode': 'demo'});
    await AppMode.instance.load();
    await ApiService().init();

    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(boot());
    await frames(t);

    // MockData.messages(1) 的预置历史出现，证明 result['id'] 兜底生效
    expect(find.textContaining('想要温柔一点的生日祝福'), findsOneWidget);
    expect(find.text('还没有聊天记录'), findsNothing);
    expect(find.text('加载失败'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('online 建会话失败：落错误态可重试，不误显空态', (t) async {
    SharedPreferences.setMockInitialValues({'connMode': 'online'});
    await AppMode.instance.load();
    await ApiService().init();
    ApiService().debugInjectHttpAdapter(_FailAdapter());

    await t.pumpWidget(boot());
    await t.pump();
    await frames(t);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('会话加载失败，请检查网络后重试'), findsOneWidget);
    expect(find.text('重新加载'), findsOneWidget);
    expect(find.text('还没有聊天记录'), findsNothing);

    await t.tap(find.text('重新加载'));
    await t.pump();
    await frames(t);
    expect(find.text('加载失败'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('online 建会话成功但无历史：落空消息引导态', (t) async {
    SharedPreferences.setMockInitialValues({'connMode': 'online'});
    await AppMode.instance.load();
    await ApiService().init();
    ApiService().debugInjectHttpAdapter(_EmptyHistoryAdapter());

    await t.pumpWidget(boot());
    await t.pump();
    await frames(t);

    expect(find.text('还没有聊天记录'), findsOneWidget);
    expect(find.text('发送一条消息，和艺人打个招呼吧'), findsOneWidget);
    expect(find.text('加载失败'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
