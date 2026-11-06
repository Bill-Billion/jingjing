import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/engagement/community_support.dart';
import 'package:jingjingshangri_app/redemption/redemption_pages.dart';
import '../account/fake_account_api.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import '../trade/trade_fixtures.dart' as trade;
import '../artists/artists_fixtures.dart' as artists;

Map<String, dynamic> grant() {
  final data = {
    'template': {
      'title': '合成面试权益',
      'kind': 'INTERVIEW',
      'terms': '只用于隔离测试',
      'valid_days': 30,
      'available_until': '2099-01-01T00:00:00.000Z',
      'interview': {'batch': '合成批次'}
    },
    'expires_at': '2099-01-01T00:00:00.000Z',
    'cashable': false,
    'transferable': false,
    'delivery': null
  };
  return {
    'id': invitationId,
    'kind': 'GRANT',
    'owner_party_id': personId,
    'object_version': 1,
    'current_status': 'BOUND',
    'effective_status': 'BOUND',
    'data': data,
    'content_sha256': communityDigest(data)
  };
}

void main() {
  for (final view in ['grants', 'grant']) {
    testWidgets('$view 不依赖无关报价接口读取面试权益', (tester) async {
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(handler: (request) {
        if (request.path == '/api/v1/trade/records') {
          return envelope({'code': 'TEST_TRADE_UNAVAILABLE', 'message': '不可用'},
              status: 503, error: true);
        }
        if (request.path == '/api/v1/redemption/grants') {
          return envelope({
            'items': [grant()]
          });
        }
        if (request.path == '/api/v1/redemption/grants/$invitationId') {
          return envelope(grant());
        }
        return adapter.defaultReply(request);
      });
      final session = (await tester.runAsync(() => communitySession(adapter)))!;
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(800, 1800);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
          value: session,
          child: MaterialApp(
              home: RedemptionPage(
                  view: view,
                  recordId: view == 'grant' ? invitationId : null))));
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 40)));
      await tester.pumpAndSettle();
      expect(find.text('合成面试权益'), findsOneWidget);
      expect(find.text('已绑定本人'), findsOneWidget);
      expect(adapter.requests.where((r) => r.path == '/api/v1/trade/records'),
          isEmpty);
    });
  }

  testWidgets('制作金原报价读取失败保留权益，重试成功后才可选择抵扣', (tester) async {
    final credit = grant();
    final data = Map<String, dynamic>.from(credit['data'] as Map);
    data['template'] = {
      'title': '合成制作金',
      'kind': 'PRODUCTION_CREDIT',
      'terms': '只用于隔离测试',
      'valid_days': 30,
      'available_until': '2099-01-01T00:00:00.000Z',
      'production': {'face_minor': 100, 'minimum_minor': 100}
    };
    credit['data'] = data;
    credit['content_sha256'] = communityDigest(data);
    credit['current_status'] = 'AVAILABLE';
    credit['effective_status'] = 'AVAILABLE';
    var fails = true;
    final quote = trade.tradeData('QUOTE');
    (quote['data'] as Map)['customization'] = {
      'request_id': personId,
      'submission_id': invitationId,
      'content_sha256': 'a' * 64
    };
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (request) {
      if (request.path == '/api/v1/trade/records') {
        return fails
            ? envelope({'code': 'TEST_TRADE_UNAVAILABLE', 'message': '不可用'},
                status: 503, error: true)
            : envelope({
                'items': [quote],
                'next_cursor': null
              });
      }
      if (request.path == '/api/v1/redemption/grants/$invitationId') {
        return envelope(credit);
      }
      return adapter.defaultReply(request);
    });
    final session = (await tester.runAsync(() => communitySession(adapter)))!;
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 1800);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: session,
        child: const MaterialApp(
            home: RedemptionPage(view: 'grant', recordId: invitationId))));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
    await tester.pumpAndSettle();
    expect(find.text('合成制作金'), findsOneWidget);
    expect(find.textContaining('原报价暂时无法读取'), findsOneWidget);
    FilledButton button() => tester.widget<FilledButton>(find.ancestor(
        of: find.text('读取服务器抵扣后的报价'), matching: find.byType(FilledButton)));
    expect(button().onPressed, isNull);
    fails = false;
    await tester.tap(find.text('重新读取本人原报价'));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
    await tester.pumpAndSettle();
    expect(find.textContaining('原报价暂时无法读取'), findsNothing);
    final dropdown = tester.widget<DropdownButtonFormField<String>>(
        find.byType(DropdownButtonFormField<String>));
    dropdown.onChanged!(trade.quoteId);
    await tester.pumpAndSettle();
    expect(button().onPressed, isNotNull);
    expect(
        adapter.requests.where((r) =>
            r.method == 'POST' && r.path.startsWith('/api/v1/redemption/')),
        isEmpty);
  });

  testWidgets('曝光权益选择本人和有效公开资料，撤回后刷新不能继续绑定', (tester) async {
    final exposure = grant();
    final data = Map<String, dynamic>.from(exposure['data'] as Map);
    data['template'] = {
      'title': '合成曝光权益',
      'kind': 'EXPOSURE',
      'terms': '仅隔离测试',
      'valid_days': 30,
      'available_until': '2099-01-01T00:00:00.000Z',
      'exposure': {'placement': '合成位置', 'duration_days': 7}
    };
    exposure['data'] = data;
    exposure['content_sha256'] = communityDigest(data);
    exposure['current_status'] = 'AVAILABLE';
    exposure['effective_status'] = 'AVAILABLE';
    var visible = true, artistReadFails = false;
    var bindingWrites = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (request) {
      if (request.method == 'POST' && request.path.endsWith('/bind')) {
        bindingWrites++;
        expect(request.data, {
          'person_id': artists.personKey,
          'avatar_id': artists.avatarKey,
          'cast': null,
          'profile_id': artists.recordKey
        });
        exposure['current_status'] = 'BOUND';
        exposure['effective_status'] = 'BOUND';
        return envelope(exposure);
      }
      if (request.path == '/api/v1/redemption/grants/$invitationId') {
        return envelope(exposure);
      }
      if (request.path == '/api/v1/engagement/profiles/mine') {
        return envelope({
          'items': visible
              ? [
                  {
                    'id': artists.recordKey,
                    'person_id': artists.personKey,
                    'city': '测试城',
                    'district': '测试区',
                    'category': '演员'
                  }
                ]
              : <Object>[]
        });
      }
      if (request.path == '/api/v1/artists/people') {
        return envelope({
          'items': [artists.personData()],
          'next_cursor': null
        });
      }
      if (request.path == '/api/v1/artists/people/${artists.personKey}') {
        return artistReadFails
            ? envelope({'code': 'TEST_ARTIST_UNAVAILABLE', 'message': '不可用'},
                status: 503, error: true)
            : envelope(artists.detailData());
      }
      return adapter.defaultReply(request);
    });
    final session = (await tester.runAsync(() => communitySession(adapter)))!;
    session.denyDomain('/api/v1/engagement/');
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 2000);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: session,
        child: const MaterialApp(
            home: RedemptionPage(view: 'grant', recordId: invitationId))));
    Future<void> frames() async {
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 40)));
      await tester.pumpAndSettle();
    }

    DropdownButtonFormField<String> dropdown(String label) =>
        tester.widget<DropdownButtonFormField<String>>(find.byWidgetPredicate(
            (w) =>
                w is DropdownButtonFormField<String> &&
                w.decoration.labelText == label));
    FilledButton bind() => tester.widget<FilledButton>(find.ancestor(
        of: find.text('确认绑定本人'), matching: find.byType(FilledButton)));
    await frames();
    expect(find.textContaining('本人公开资料暂时无法核对'), findsOneWidget);
    await tester.tap(find.text('重新核对本人公开资料'));
    await frames();
    expect(session.isDomainDenied('/api/v1/engagement/'), false);
    dropdown('本人艺人').onChanged!(artists.personKey);
    await frames();
    dropdown('本人数字人').onChanged!(artists.avatarKey);
    await frames();
    dropdown('本人有效公开榜单资料').onChanged!(artists.recordKey);
    await tester.pump();
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    expect(bind().onPressed, isNotNull);
    artistReadFails = true;
    await tester.tap(find.text('重新核对本人资料与授权'));
    await frames();
    expect(bind().onPressed, isNull);
    artistReadFails = false;
    await tester.tap(find.text('重新核对本人资料与授权'));
    await frames();
    dropdown('本人艺人').onChanged!(artists.personKey);
    await frames();
    dropdown('本人数字人').onChanged!(artists.avatarKey);
    await frames();
    dropdown('本人有效公开榜单资料').onChanged!(artists.recordKey);
    await tester.pump();
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    expect(bind().onPressed, isNotNull);
    visible = false;
    await tester.tap(find.text('重新读取当前记录'));
    await frames();
    expect(bind().onPressed, isNull);
    expect(
        adapter.requests
            .where((r) => r.method == 'POST' && r.path.endsWith('/bind')),
        isEmpty);
    visible = true;
    await tester.tap(find.text('重新读取当前记录'));
    await frames();
    dropdown('本人有效公开榜单资料').onChanged!(artists.recordKey);
    await tester.pump();
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    await tester.tap(find.text('确认绑定本人'));
    await frames();
    expect(bindingWrites, 1);
    expect(find.text('已绑定本人'), findsOneWidget);
    expect(find.text('确认绑定本人'), findsNothing);
  });
}
