import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/artists/artists_public_media.dart';
import '../account/fake_account_api.dart';
import '../artists/artists_fixtures.dart';
import '../stock/v5_test_host.dart' show frames;
import '../trade/trade_api_test.dart' show buyerSession;
import 'plaza_data_test.dart' show plazaArtist;

final portraitPng = base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');

void main() {
  for (final mode in ['image', 'audio', 'revoked']) {
    testWidgets('公开肖像仅解码获准图片且处理$mode', (tester) async {
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(handler: (request) {
        if (request.path.endsWith('/assets/$assetKey/content')) {
          if (mode == 'revoked') {
            return envelope({'code': 'ARTIST_CONSENT_REQUIRED'},
                status: 409, error: true);
          }
          return ResponseBody.fromBytes(
              mode == 'image'
                  ? portraitPng
                  : [82, 73, 70, 70, 65, 85, 68, 73, 79],
              200,
              headers: {
                'content-type': ['application/octet-stream']
              });
        }
        return adapter.defaultReply(request);
      });
      final session = (await tester.runAsync(() => buyerSession(adapter)))!;
      var unavailable = false;
      await tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: SizedBox(
                  width: 80,
                  child: ArtistPublicPortrait(
                      session: session,
                      listing: plazaArtist(),
                      onUnavailable: () => unavailable = true)))));
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 50)));
      await frames(tester);
      expect(
          find.byType(Image), mode == 'image' ? findsOneWidget : findsNothing);
      expect(unavailable, mode == 'revoked');
      expect(
          adapter.requests
              .where((r) => r.path.endsWith('/content'))
              .single
              .path,
          '/api/v1/artists/catalog/$listingKey/assets/$assetKey/content');
      if (mode != 'image') {
        expect(
            find.text(mode == 'audio' ? '暂无公开照片' : '图片暂不可用'), findsOneWidget);
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('退出后迟到的肖像不重新进入画面', (tester) async {
    final pending = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (request) {
      if (request.path.endsWith('/assets/$assetKey/content')) {
        return pending.future;
      }
      return adapter.defaultReply(request);
    });
    final session = (await tester.runAsync(() => buyerSession(adapter)))!;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SizedBox(
                width: 80,
                child: ArtistPublicPortrait(
                    session: session, listing: plazaArtist())))));
    await tester.runAsync(session.logout);
    pending.complete(ResponseBody.fromBytes(portraitPng, 200, headers: {
      'content-type': ['application/octet-stream']
    }));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
    await frames(tester);
    expect(find.byType(Image), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
