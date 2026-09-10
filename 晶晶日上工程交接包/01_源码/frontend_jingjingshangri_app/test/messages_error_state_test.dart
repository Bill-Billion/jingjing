// A8：锁定消息页错误态——登录态下 online 远端 getConversations 失败时，
// 必须落到统一 ErrorView（"加载失败"+"消息加载失败"+"重新加载"），
// 既不能退回未登录"登录后查看消息"，也不能误显"还没有消息"空态；可重试、不崩。
// 复用第29轮离线失败注入通道；消息页依赖 UserProvider，这里包登录态用户。
import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/messages/messages_page.dart';

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

Future<UserProvider> loginUser() async {
  final up = UserProvider();
  await up.saveLogin({
    'token': 'demo-token',
    'user': {'id': 1, 'nickname': '林晚晴', 'phone': '138****6688', 'role': 'user'},
  });
  return up;
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
    // _load 在 postFrameCallback 里发起，先 pump 触发，再排空失败回调
    await t.pump();
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 120));
    }
    await t.pump(const Duration(milliseconds: 300));
  }

  testWidgets('登录态远端失败：消息页落 ErrorView 而非未登录/空态，可重试', (t) async {
    final up = await loginUser();
    await t.pumpWidget(ChangeNotifierProvider<UserProvider>.value(
      value: up,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: const MessagesPage(),
      ),
    ));
    await settle(t);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('消息加载失败'), findsOneWidget);
    expect(find.text('重新加载'), findsOneWidget);
    // 已登录用户失败时不能退回未登录态
    expect(find.text('登录后查看消息'), findsNothing);
    // 也不能误显"还没有消息"空态
    expect(find.textContaining('还没有消息'), findsNothing);

    await t.tap(find.text('重新加载'));
    await settle(t);
    expect(find.text('加载失败'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
