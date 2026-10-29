import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/artists/artists_models.dart';
import 'package:jingjingshangri_app/artists/artists_public_media.dart';
import 'package:video_player/video_player.dart';
// Uses the existing video_player test seam without adding a production dependency.
// ignore: depend_on_referenced_packages
import 'package:video_player_platform_interface/video_player_platform_interface.dart';
import '../account/fake_account_api.dart';
import '../plaza/artists_public_media_test.dart' show portraitPng;
import 'artists_fixtures.dart';

class MediaPlatform extends VideoPlayerPlatform {
  final sources = <DataSource>[];
  final disposed = <int>[];
  final events = <int, StreamController<VideoEvent>>{};
  bool initialize = true;
  @override
  Future<void> init() async {}
  @override
  Future<int?> create(DataSource dataSource) async {
    sources.add(dataSource);
    return sources.length;
  }

  @override
  Stream<VideoEvent> videoEventsFor(int playerId) {
    final stream = StreamController<VideoEvent>();
    events[playerId] = stream;
    if (initialize) {
      stream.add(VideoEvent(
          eventType: VideoEventType.initialized,
          duration: const Duration(seconds: 3),
          size: const Size(320, 180)));
    }
    return stream.stream;
  }

  @override
  Future<void> dispose(int playerId) async {
    disposed.add(playerId);
    await events[playerId]?.close();
  }

  @override
  Future<void> setLooping(int playerId, bool looping) async {}
  @override
  Future<void> play(int playerId) async {}
  @override
  Future<void> pause(int playerId) async {}
  @override
  Future<void> setVolume(int playerId, double volume) async {}
  @override
  Future<void> seekTo(int playerId, Duration position) async {}
  @override
  Future<Duration> getPosition(int playerId) async => Duration.zero;
  @override
  Widget buildView(int playerId) => const SizedBox();
}

class SavePicker extends FilePickerPlatform {
  String? saved;
  Uint8List? content;
  @override
  Future<String?> saveFile(
      {String? dialogTitle,
      String? fileName,
      String? initialDirectory,
      FileType type = FileType.any,
      List<String>? allowedExtensions,
      Uint8List? bytes,
      bool lockParentWindow = false}) async {
    saved = fileName;
    content = bytes;
    return fileName;
  }
}

Future<void> settleMedia(WidgetTester t) async {
  await t.pump(const Duration(milliseconds: 100));
  for (var i = 0; i < 20; i++) {
    await t
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
    await t.pump();
    if (find.byType(LinearProgressIndicator).evaluate().isEmpty) break;
  }
}

void main() {
  for (final type in ['audio/mpeg', 'audio/wav', 'video/mp4']) {
    testWidgets('$type使用正确播放器并在身份切换时清理临时内容', (t) async {
      t.view.physicalSize = const Size(390, 844);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      final old = VideoPlayerPlatform.instance, platform = MediaPlatform();
      VideoPlayerPlatform.instance = platform;
      addTearDown(() => VideoPlayerPlatform.instance = old);
      final a = artistAdapter(
          override: (r) => r.path.endsWith('/content')
              ? ResponseBody.fromBytes(artistBytes, 200, headers: {
                  'content-type': ['application/octet-stream']
                })
              : null);
      final s = (await t.runAsync(() => artistSession(a)))!;
      final item = ArtistPublicMediaItem.parse(publicMediaItemData(type: type));
      await t.pumpWidget(MaterialApp(
          home: Scaffold(
              body: ArtistPublicMediaView(
                  session: s, listingId: listingKey, item: item, index: 1))));
      await t.pumpAndSettle();
      await t.pumpAndSettle();
      await t.tap(find.text('读取${item.label}预览 1'));
      await t.pump(const Duration(milliseconds: 100));
      await settleMedia(t);
      expect(find.byTooltip('播放'), findsOneWidget);
      expect(find.byType(VideoPlayer),
          type == 'video/mp4' ? findsOneWidget : findsNothing);
      expect(find.byType(Image), findsNothing);
      final file = File.fromUri(Uri.parse(platform.sources.single.uri!));
      expect(file.path, endsWith('.${item.extension}'));
      expect(await t.runAsync(file.exists), isTrue);
      if (type == 'audio/wav') {
        platform.events[1]!.addError(PlatformException(
            code: 'decode_failed', message: 'Cannot decode test audio'));
        await settleMedia(t);
        expect(find.byTooltip('播放'), findsNothing);
        expect(await t.runAsync(file.exists), isFalse);
      }
      s.select(identity(orgId));
      await settleMedia(t);
      expect(find.byTooltip('播放'), findsNothing);
      expect(platform.disposed, [1]);
      expect(await t.runAsync(file.exists), isFalse);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('播放器初始化期间退出也立即删除临时内容', (t) async {
    final old = VideoPlayerPlatform.instance,
        platform = MediaPlatform()..initialize = false;
    VideoPlayerPlatform.instance = platform;
    addTearDown(() => VideoPlayerPlatform.instance = old);
    final a = artistAdapter(
        override: (r) => r.path.endsWith('/content')
            ? ResponseBody.fromBytes(artistBytes, 200, headers: {
                'content-type': ['application/octet-stream']
              })
            : null);
    final s = (await t.runAsync(() => artistSession(a)))!;
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ArtistPublicMediaView(
                session: s,
                listingId: listingKey,
                item: ArtistPublicMediaItem.parse(
                    publicMediaItemData(type: 'audio/wav')),
                index: 1))));
    await t.pumpAndSettle();
    await t.tap(find.text('读取声音预览 1'));
    await settleMedia(t);
    final file = File.fromUri(Uri.parse(platform.sources.single.uri!));
    expect(await t.runAsync(file.exists), isTrue);
    await t.runAsync(s.logout);
    await settleMedia(t);
    expect(platform.disposed, [1]);
    expect(await t.runAsync(file.exists), isFalse);
    expect(find.byTooltip('播放'), findsNothing);
  });

  testWidgets('图片解码失败与撤权都清除上一次预览', (t) async {
    var invalid = false, revoked = false, unavailable = false;
    final a = artistAdapter(override: (r) {
      if (!r.path.endsWith('/content')) return null;
      if (revoked) {
        return envelope({'code': 'ARTIST_CONSENT_REQUIRED'},
            status: 409, error: true);
      }
      return ResponseBody.fromBytes(invalid ? artistBytes : portraitPng, 200,
          headers: {
            'content-type': ['application/octet-stream']
          });
    });
    final s = (await t.runAsync(() => artistSession(a)))!;
    Widget view(Uint8List bytes) => MaterialApp(
        home: Scaffold(
            body: ArtistPublicMediaView(
                session: s,
                listingId: listingKey,
                item: ArtistPublicMediaItem.parse(
                    publicMediaItemData(bytes: bytes)),
                index: 1,
                onUnavailable: () => unavailable = true)));
    await t.pumpWidget(view(portraitPng));
    await t.pumpAndSettle();
    await t.tap(find.text('读取图片预览 1'));
    await settleMedia(t);
    expect(find.byType(Image), findsOneWidget);
    invalid = true;
    await t.pumpWidget(view(artistBytes));
    await t.pumpAndSettle();
    await t.tap(find.text('读取图片预览 1'));
    await settleMedia(t);
    expect(find.byType(Image), findsNothing);
    revoked = true;
    await t.pumpAndSettle();
    await t.tap(find.text('读取图片预览 1'));
    await settleMedia(t);
    expect(unavailable, isTrue);
    expect(find.byType(Image), findsNothing);
  });

  for (final type in ['application/pdf', 'text/plain']) {
    testWidgets('$type只提供受控保存并保留正确扩展名', (t) async {
      final old = FilePickerPlatform.instance, picker = SavePicker();
      FilePickerPlatform.instance = picker;
      addTearDown(() => FilePickerPlatform.instance = old);
      final a = artistAdapter(
          override: (r) => r.path.endsWith('/content')
              ? ResponseBody.fromBytes(artistBytes, 200, headers: {
                  'content-type': ['application/octet-stream']
                })
              : null);
      final s = (await t.runAsync(() => artistSession(a)))!;
      final item = ArtistPublicMediaItem.parse(publicMediaItemData(type: type));
      await t.pumpWidget(MaterialApp(
          home: Scaffold(
              body: ArtistPublicMediaView(
                  session: s, listingId: listingKey, item: item, index: 1))));
      expect(find.text('读取文档预览 1'), findsNothing);
      await t.pumpAndSettle();
      await t.tap(find.text('重新核权并保存文档 1'));
      await settleMedia(t);
      expect(picker.saved, endsWith('.${item.extension}'));
      expect(picker.content, artistBytes);
      expect(find.byType(Image), findsNothing);
      expect(find.byType(VideoPlayer), findsNothing);
      expect(
          a.requests
              .where((r) => r.path.endsWith('/content'))
              .single
              .headers
              .containsKey('X-Acting-Party'),
          isFalse);
    });
  }
}
