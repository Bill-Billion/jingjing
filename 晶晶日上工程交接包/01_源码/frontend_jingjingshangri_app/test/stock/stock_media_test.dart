import 'dart:async';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/stock/stock_api.dart';
import 'package:jingjingshangri_app/stock/stock_models.dart';
import 'package:jingjingshangri_app/stock/stock_pages.dart';
import 'package:jingjingshangri_app/stock/stock_public_media.dart';
import 'package:jingjingshangri_app/stock/v5_media.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'stock_test.dart' show stockId, stockOffer;
import 'v5_test_host.dart' show frames, host;

// Two-pixel blue JPEG generated from an isolated synthetic color source.
final stockCoverJpeg = base64Decode(
    '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjExLjEwMAD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABMAAEBAAAAAAAAAAAAAAAAAAAABwEBAQAAAAAAAAAAAAAAAAAABQcQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAACAAIDASIAAhEAAxEA/9oADAMBAAIRAxEAPwCOAL+Kf//Z');
Map<String, dynamic> stockMediaData({int version = 3}) => {
      'listing_id': stockId,
      'listing_version': version,
      'source_sha256': 'a' * 64,
      'preview_sha256': 'b' * 64,
      'duration_ms': 61250,
      'preview_duration_ms': 1500,
      'preview_width': 1280,
      'preview_height': 720,
      'cover': {
        'media_type': 'image/jpeg',
        'byte_size': stockCoverJpeg.length,
        'content_sha256': sha256.convert(stockCoverJpeg).toString(),
        'width': 2,
        'height': 2,
        'frame_ms': 0,
        'source': 'REVIEWED_PREVIEW'
      }
    };
ResponseBody coverReply() =>
    ResponseBody.fromBytes(stockCoverJpeg, 200, headers: {
      'content-type': ['image/jpeg']
    });
Future<void> flushMedia(WidgetTester t) async {
  for (var i = 0; i < 10; i++) {
    await t
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
    await t.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  test('现货媒体严格区分完整/预览时长，拒绝错版本、伪封面及额外地址', () {
    final offer = StockOffer(stockOffer()), data = stockMediaData();
    expect(StockPublicMedia(data, offer).durationMs, 61250);
    expect(stockDuration(61250), '1:01.25');
    expect(stockDuration(1500), '0:01.5');
    expect(stockDuration(1), '0:00.001');
    for (final entry in {
      'listing_id': personId,
      'listing_version': 4,
      'duration_ms': 0,
      'preview_duration_ms': 1800001,
      'preview_width': 4097,
      'source_sha256': 'invalid',
      'preview_sha256': 'invalid',
      'url': 'https://not-public.invalid/full.mp4'
    }.entries) {
      expect(() => StockPublicMedia({...data, entry.key: entry.value}, offer),
          throwsA(isA<AccountError>()),
          reason: entry.key);
    }
    for (final entry in {
      'media_type': 'image/png',
      'byte_size': 2097152,
      'width': 641,
      'height': 0,
      'source': 'FULL_VIDEO',
      'frame_ms': 1,
      'content_sha256': 'invalid',
      'url': 'https://not-public.invalid/cover.jpg'
    }.entries) {
      expect(
          () => StockPublicMedia({
                ...data,
                'cover': <String, dynamic>{
                  ...data['cover'],
                  entry.key: entry.value
                }
              }, offer),
          throwsA(isA<AccountError>()),
          reason: entry.key);
    }
  });

  test('现货媒体只带账号凭证，JPEG只放行封面路径且核验原字节', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/media')) return envelope(stockMediaData());
      if (r.path.endsWith('/cover') || r.path.endsWith('/preview')) {
        return coverReply();
      }
      return adapter.defaultReply(r);
    });
    final session = await buyerSession(adapter),
        api = StockApi(session),
        offer = StockOffer(stockOffer());
    final media = await api.publicMedia(offer);
    expect(await api.publicCover(offer, media), stockCoverJpeg);
    await expectLater(api.bytes('/catalog/$stockId/preview', account: true),
        throwsA(isA<AccountError>()));
    final requests =
        adapter.requests.where((r) => r.path.contains('/stock/catalog/'));
    expect(requests.every((r) => !r.headers.containsKey('X-Acting-Party')),
        isTrue);
    final bad = StockPublicMedia({
      ...stockMediaData(),
      'cover': <String, dynamic>{
        ...stockMediaData()['cover'],
        'content_sha256': 'f' * 64
      }
    }, offer);
    await expectLater(
        api.publicCover(offer, bad),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'STOCK_COVER_MISMATCH')));
  });

  test('可见卡片串行读取，排队后失效的卡片不会再请求', () async {
    final pending = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/media')) return pending.future;
      if (r.path.endsWith('/cover')) return coverReply();
      return adapter.defaultReply(r);
    });
    final session = await buyerSession(adapter),
        api = StockApi(session),
        offer = StockOffer(stockOffer());
    final one = api.publicPresentation(offer, () => true);
    var visible = true;
    final two = api.publicPresentation(offer, () => visible);
    final rejected = expectLater(
        two,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(adapter.requests.where((r) => r.path.endsWith('/media')).length, 1);
    visible = false;
    pending.complete(envelope(stockMediaData()));
    await one;
    await rejected;
    expect(adapter.requests.where((r) => r.path.endsWith('/media')).length, 1);
  });

  for (final failure in [
    'none',
    'wrong-hash',
    'wrong-dimensions',
    'unavailable'
  ]) {
    testWidgets('封面真实解码、完整和预览时长，处理 $failure', (t) async {
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(handler: (r) {
        if (r.path.endsWith('/media')) {
          if (failure == 'unavailable') {
            return envelope({'code': 'MEDIA_PROCESS_BUSY'},
                status: 503, error: true);
          }
          final d = stockMediaData();
          if (failure == 'wrong-hash') d['cover']['content_sha256'] = 'f' * 64;
          if (failure == 'wrong-dimensions') d['cover']['width'] = 3;
          return envelope(d);
        }
        if (r.path.endsWith('/cover')) return coverReply();
        return adapter.defaultReply(r);
      });
      final session = (await t.runAsync(() => buyerSession(adapter)))!;
      await t.pumpWidget(MaterialApp(
          home: Scaffold(
              body: SizedBox(
                  width: 300,
                  child: StockPublicMediaView(
                      session: session, offer: StockOffer(stockOffer()))))));
      await flushMedia(t);
      expect(find.byType(Image),
          failure == 'none' ? findsOneWidget : findsNothing);
      expect(find.text('完整影片 1:01.25 · 预览 0:01.5'),
          failure == 'none' ? findsOneWidget : findsNothing);
      if (failure != 'none') {
        expect(find.text('封面或时长暂不可读取'), findsOneWidget);
        final count =
            adapter.requests.where((r) => r.path.endsWith('/media')).length;
        await frames(t);
        expect(adapter.requests.where((r) => r.path.endsWith('/media')).length,
            count);
        await t.tap(find.text('重新读取'));
        await flushMedia(t);
        expect(adapter.requests.where((r) => r.path.endsWith('/media')).length,
            count + 1);
      }
      expect(t.takeException(), isNull);
      await t.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('屏幕外卡片不发媒体请求，滚入可见范围后才读取', (t) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/media')) return envelope(stockMediaData());
      if (r.path.endsWith('/cover')) return coverReply();
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!,
        scroll = ScrollController();
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                controller: scroll,
                child: Column(children: [
                  const SizedBox(height: 1600),
                  SizedBox(
                      width: 300,
                      child: StockPublicMediaView(
                          session: session, offer: StockOffer(stockOffer())))
                ])))));
    await flushMedia(t);
    expect(adapter.requests.where((r) => r.path.endsWith('/media')), isEmpty);
    scroll.jumpTo(scroll.position.maxScrollExtent);
    await t.pump();
    await flushMedia(t);
    expect(adapter.requests.where((r) => r.path.endsWith('/media')).length, 1);
    expect(find.byType(Image), findsOneWidget);
    await t.pumpWidget(const SizedBox.shrink());
    scroll.dispose();
  });

  for (final change in ['identity', 'logout', 'version']) {
    testWidgets('$change 立即清旧封面和时长，旧响应不能复活', (t) async {
      final pending = Completer<ResponseBody>();
      var hold = false, version = 3;
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(handler: (r) {
        if (r.path.endsWith('/media')) {
          return envelope(stockMediaData(version: version));
        }
        if (r.path.endsWith('/cover')) {
          return hold ? pending.future : coverReply();
        }
        return adapter.defaultReply(r);
      });
      final session = (await t.runAsync(() => buyerSession(adapter)))!;
      Widget view(StockOffer offer) => MaterialApp(
          home: Scaffold(
              body: SizedBox(
                  width: 300,
                  child:
                      StockPublicMediaView(session: session, offer: offer))));
      final offer = StockOffer(stockOffer());
      await t.pumpWidget(view(offer));
      await flushMedia(t);
      expect(find.byType(Image), findsOneWidget);
      hold = true;
      if (change == 'version') {
        version = 4;
        await t.pumpWidget(
            view(StockOffer({...stockOffer(), 'object_version': 4})));
      } else if (change == 'logout') {
        await t.runAsync(session.logout);
        await t.pump();
      } else {
        session.select(identity(orgId));
        await t.pump();
      }
      await flushMedia(t);
      expect(find.byType(Image), findsNothing);
      expect(find.text('完整影片 1:01.25 · 预览 0:01.5'), findsNothing);
      await t.runAsync(session.logout);
      pending.complete(coverReply());
      await flushMedia(t);
      expect(find.byType(Image), findsNothing);
      expect(t.takeException(), isNull);
      await t.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('相同作品重建保留封面，离开页面清理且返回重新读取', (t) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/media')) return envelope(stockMediaData());
      if (r.path.endsWith('/cover')) return coverReply();
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    final navigator = GlobalKey<NavigatorState>();
    Widget view({bool active = true}) => MaterialApp(
        navigatorKey: navigator,
        home: Scaffold(
            body: TickerMode(
                enabled: active,
                child: SizedBox(
                    width: 300,
                    child: StockPublicMediaView(
                        session: session, offer: StockOffer(stockOffer()))))));
    await t.pumpWidget(view());
    await flushMedia(t);
    expect(find.byType(Image), findsOneWidget);
    await t.pumpWidget(view());
    await flushMedia(t);
    expect(adapter.requests.where((r) => r.path.endsWith('/media')).length, 1);
    await t.pumpWidget(view(active: false));
    await flushMedia(t);
    expect(find.byType(Image, skipOffstage: false), findsNothing);
    expect(adapter.requests.where((r) => r.path.endsWith('/media')).length, 1);
    await t.pumpWidget(view());
    await flushMedia(t);
    expect(find.byType(Image), findsOneWidget);
    expect(adapter.requests.where((r) => r.path.endsWith('/media')).length, 2);
    navigator.currentState!.push(MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('其他页面'))));
    await frames(t);
    expect(find.byType(Image, skipOffstage: false), findsNothing);
    navigator.currentState!.pop();
    await frames(t);
    await flushMedia(t);
    expect(adapter.requests.where((r) => r.path.endsWith('/media')).length, 3);
    expect(find.byType(Image), findsOneWidget);
    await t.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('旧图片迟到的失败回调不清除新身份已经核验的封面', (t) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/media')) return envelope(stockMediaData());
      if (r.path.endsWith('/cover')) return coverReply();
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SizedBox(
                width: 300,
                child: StockPublicMediaView(
                    session: session, offer: StockOffer(stockOffer()))))));
    await flushMedia(t);
    final previousImage = t.widget<Image>(find.byType(Image));
    session.select(identity(orgId));
    await t.pump();
    await flushMedia(t);
    expect(find.byType(Image), findsOneWidget);
    previousImage.errorBuilder!(t.element(find.byType(StockPublicMediaView)),
        StateError('late previous-image decoding failure'), StackTrace.current);
    await frames(t);
    expect(find.byType(Image), findsOneWidget);
    expect(find.text('完整影片 1:01.25 · 预览 0:01.5'), findsOneWidget);
    expect(adapter.requests.where((r) => r.path.endsWith('/media')).length, 2);
    await t.pumpWidget(const SizedBox.shrink());
  });

  for (final status in [401, 403, 404, 409]) {
    testWidgets('$status 重新核验失败清除旧封面时长且不自动重试', (t) async {
      int? failure;
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(handler: (r) {
        if (r.path.endsWith('/media')) {
          if (failure != null) {
            return envelope({'code': 'STOCK_MEDIA_SOURCE_CHANGED'},
                status: failure, error: true);
          }
          return envelope(stockMediaData());
        }
        if (r.path.endsWith('/cover')) return coverReply();
        return adapter.defaultReply(r);
      });
      final session = (await t.runAsync(() => buyerSession(adapter)))!;
      final navigator = GlobalKey<NavigatorState>();
      await t.pumpWidget(MaterialApp(
          navigatorKey: navigator,
          home: Scaffold(
              body: SizedBox(
                  width: 300,
                  child: StockPublicMediaView(
                      session: session, offer: StockOffer(stockOffer()))))));
      await flushMedia(t);
      expect(find.byType(Image), findsOneWidget);
      failure = status;
      navigator.currentState!.push(MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('其他页面'))));
      await frames(t);
      navigator.currentState!.pop();
      await frames(t);
      await flushMedia(t);
      expect(find.byType(Image, skipOffstage: false), findsNothing);
      expect(find.text('完整影片 1:01.25 · 预览 0:01.5'), findsNothing);
      if (status == 403 || status == 404) {
        expect(find.text('封面或时长暂不可读取'), findsOneWidget);
      }
      expect(
          adapter.requests.where((r) => r.path.endsWith('/media')).length, 2);
      await frames(t);
      expect(
          adapter.requests.where((r) => r.path.endsWith('/media')).length, 2);
      expect(t.takeException(), isNull);
      await t.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('封面服务不可用时保留独立预览入口和购买前原许可', (t) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/media')) {
        return envelope({'code': 'MEDIA_PROCESSOR_UNAVAILABLE'},
            status: 503, error: true);
      }
      if (r.path == '/api/v1/stock/catalog/$stockId') {
        return envelope(stockOffer());
      }
      return adapter.defaultReply(r);
    });
    final session = (await t.runAsync(() => buyerSession(adapter)))!;
    await host(t, session, const StockPage(mode: 'video', id: stockId));
    await flushMedia(t);
    expect(find.text('封面或时长暂不可读取'), findsOneWidget);
    expect(find.byType(V5Media), findsOneWidget);
    expect(find.text('读取已审预览'), findsOneWidget);
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox.shrink());
  });
}
