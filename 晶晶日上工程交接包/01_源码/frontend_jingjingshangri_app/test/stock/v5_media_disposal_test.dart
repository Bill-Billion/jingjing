import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_player/video_player.dart';
// ignore: depend_on_referenced_packages
import 'package:video_player_platform_interface/video_player_platform_interface.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/stock/stock_api.dart';
import 'package:jingjingshangri_app/stock/v5_media.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../artists/artists_media_view_test.dart'
    show MediaPlatform, settleMedia, expectRemoved;

class SlowReleasePlatform extends MediaPlatform {
  final releasing = Completer<void>();
  final finish = Completer<void>();
  @override
  Future<void> setPlaybackSpeed(int playerId, double speed) async {}
  @override
  Future<void> dispose(int playerId) async {
    if (!releasing.isCompleted) releasing.complete();
    await finish.future;
    await super.dispose(playerId);
  }
}

void main() {
  testWidgets('重新读取先移除旧播放器，释放未结束或随后失权都不再显示旧预览', (t) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final before = VideoPlayerPlatform.instance;
    final platform = SlowReleasePlatform();
    VideoPlayerPlatform.instance = platform;
    addTearDown(() {
      if (!platform.finish.isCompleted) platform.finish.complete();
      VideoPlayerPlatform.instance = before;
    });
    final session =
        (await t.runAsync(() => buyerSession(FakeAccountAdapter())))!;
    var reads = 0;
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: V5Media(
      api: StockApi(session),
      label: '读取本单',
      load: () async {
        reads++;
        if (reads > 1) throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
        return Uint8List.fromList([1, 2, 3]);
      },
    ))));
    await t.tap(find.text('读取本单'));
    await settleMedia(t);
    expect(find.byType(VideoPlayer), findsOneWidget);
    final file = File.fromUri(Uri.parse(platform.sources.single.uri!));
    await t.tap(find.text('读取本单'));
    await settleMedia(t, ready: () => platform.releasing.isCompleted);
    expect(find.byType(VideoPlayer), findsNothing);
    expect(reads, 1, reason: '下一次请求须在旧播放器退出后开始');
    platform.finish.complete();
    await settleMedia(t);
    expect(reads, 2);
    expect(find.byType(VideoPlayer), findsNothing);
    expect(find.text('本次私有预览已打开，请核对完整内容。'), findsNothing);
    expect(t.takeException(), isNull);
    await expectRemoved(t, file);
    await t.pumpWidget(const SizedBox.shrink());
    expect(platform.disposed, [1]);
  });
}
