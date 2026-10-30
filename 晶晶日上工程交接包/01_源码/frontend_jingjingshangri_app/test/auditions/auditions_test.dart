import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/auditions/auditions_api.dart';
import 'package:jingjingshangri_app/auditions/auditions_models.dart';
import 'package:jingjingshangri_app/auditions/auditions_pages.dart';
import 'package:jingjingshangri_app/stock/v5_support.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'auditions_fixtures.dart';
import 'package:jingjingshangri_app/auditions/auditions_offer_form.dart';
import '../artists/artists_fixtures.dart' as artist;

void main() {
  testWidgets('首次试镜从当前经营规则和授权选择，不借旧方案', (t) async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/artists/people') {
        return envelope({
          'items': [artist.personData()],
          'next_cursor': null
        });
      }
      if (r.path == '/api/v1/artists/people/${artist.personKey}') {
        return envelope(artist.detailData()..['halo_level'] = 2);
      }
      if (r.path == '/api/v1/auditions/offer-options') {
        return envelope({
          'items': r.queryParameters['kind'] == 'RULE'
              ? [
                  {
                    'id': artist.specKey,
                    'person_id': artist.personKey,
                    'version': '测试1',
                    'terms': {'version': '测试1', 'terms': '交通已包含，具体取样约定'}
                  }
                ]
              : [
                  {
                    'id': artist.recordKey,
                    'person_id': artist.personKey,
                    'avatar_id': artist.avatarKey,
                    'avatar_name': '本人形象',
                    'public_consent_id': artist.recordKey,
                    'valid_until': '2099-01-01T00:00:00.000Z'
                  }
                ],
          'next_cursor': null
        });
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, AuditionOfferForm(session: s));
    await t.tap(find.byType(DropdownButtonFormField<String>).first);
    await frames(t);
    await t.tap(find.text('本人测试艺人').last);
    await frames(t);
    final form = t.widget<V5Form>(find.byType(V5Form));
    expect(form.canSubmit, isTrue);
    expect(
        form.fields.firstWhere((f) => f.keyName == 'rule_id').choices!.length,
        1);
    expect(a.requests.where((r) => r.path == '/api/v1/auditions/records'),
        isEmpty);
    expect(a.requests.where((r) => r.queryParameters['kind'] == 'CONSENT'),
        isEmpty);
    expect(t.takeException(), isNull);
  });

  test('隐藏价格仍为未公开，试镜绝不冒授出演权或接受错误材料数量', () {
    expect(AuditionOffer(auditionPublic(publicPrice: false)).raw['unit_minor'],
        isNull);
    final hidden = auditionPublic(publicPrice: false)..['unit_minor'] = 2901;
    expect(() => AuditionOffer(hidden), throwsA(isA<AccountError>()));
    final rights = auditionBooking()..['performance_rights_granted'] = true;
    expect(() => AuditionRecord(rights), throwsA(isA<AccountError>()));
    final count = auditionBooking();
    count['data']['delivery']['photos'].removeLast();
    expect(() => AuditionRecord(count), throwsA(isA<AccountError>()));
    expect(() => AuditionRecord(auditionBooking(), id: auditionOfferId),
        throwsA(isA<AccountError>()));
  });

  test('普通公开方案查询不带主体，不通过私有艺人接口补价格或身份', () async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/catalog')) {
        return envelope({
          'items': [auditionPublic()],
          'next_cursor': null
        });
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a), api = AuditionsApi(s);
    expect((await api.offer(auditionOfferId)).id, auditionOfferId);
    expect(a.requests.last.headers['X-Acting-Party'], isNull);
    expect(
        a.requests.where((r) => r.path.startsWith('/api/v1/artists')), isEmpty);
  });

  test('有效MCN成员可请求实际受派记录，其他域仍保留负责人边界', () async {
    final a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/records/$auditionId')
            ? envelope(auditionBooking(status: 'ACCEPTED'))
            : FakeAccountAdapter().defaultReply(r));
    final s = await buyerSession(a);
    s.select(identity(orgId, owner: false));
    expect((await AuditionsApi(s).record(auditionId)).id, auditionId);
    expect(a.requests.last.headers['X-Acting-Party'], orgId);
    expect(() => V5Api(s, 'stock').owner(), throwsA(isA<AccountError>()));
    expect(() => V5Api(s, 'wallet').owner(), throwsA(isA<AccountError>()));
    s.selected!['membership']['current_status'] = 'SUSPENDED';
    expect(() => AuditionsApi(s).owner(), throwsA(isA<AccountError>()));
  });

  test('取样只允许本次已审材料且逐项校验冻结摘要', () async {
    final a = FakeAccountAdapter(
        handler: (r) => r.path.contains('/materials/')
            ? ResponseBody.fromBytes([9, 9, 9], 200,
                headers: {
                  Headers.contentTypeHeader: ['application/octet-stream']
                })
            : FakeAccountAdapter().defaultReply(r));
    final s = await buyerSession(a), api = AuditionsApi(s);
    final booking = AuditionRecord(auditionBooking());
    await expectLater(
        api.material(booking, auditionPhotos.first),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PRIVATE_CONTENT_MISMATCH')));
    final before = a.requests.length;
    await expectLater(
        api.material(booking, auditionConsentId), throwsA(isA<AccountError>()));
    final unreviewed = auditionBooking();
    unreviewed['data']['delivery_review']['decision'] = 'REJECT';
    await expectLater(
        api.material(AuditionRecord(unreviewed), auditionPhotos.first),
        throwsA(isA<AccountError>()));
    expect(a.requests.length, before);
  });

  test('行程未知结果先复读本单，仍用原正文、版本和同键', () async {
    var posts = 0;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.method == 'POST' && r.path.endsWith('/travel')) {
        return ++posts == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope(auditionBooking(version: 5, status: 'DEPARTED'));
      }
      if (r.path.endsWith('/records/$auditionId')) {
        return envelope(auditionBooking(version: 9, status: 'ACCEPTED'));
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a), api = AuditionsApi(s);
    const suffix = '/bookings/$auditionId/travel';
    final body = {'action': 'DEPART', 'evidence_asset_ids': <String>[]};
    await expectLater(
        api.post(suffix, body, (d) => api.validateBooking(d, auditionId),
            version: 4),
        throwsA(isA<AccountError>()));
    await expectLater(
        api.post(suffix, {'action': 'ARRIVE', 'evidence_asset_ids': <String>[]},
            (d) => api.validateBooking(d, auditionId),
            version: 9),
        throwsA(isA<AccountError>()));
    expect(posts, 1);
    await api.restoreOperation('${api.base}$suffix');
    final writes = a.requests.where((r) => r.path.endsWith('/travel')).toList();
    expect(writes.length, 2);
    expect(writes.last.data, writes.first.data);
    expect(writes.last.headers['If-Match'], '"4"');
    expect(writes.last.headers['Idempotency-Key'],
        writes.first.headers['Idempotency-Key']);
    expect(a.requests[a.requests.indexOf(writes.last) - 1].path,
        endsWith('/records/$auditionId'));
  });

  testWidgets('取样页面不预取，摘要正确但图片解码失败也不能收讫或完成', (t) async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/records/$auditionId')) {
        return envelope(auditionBooking());
      }
      if (r.path.endsWith('/supplements')) {
        return envelope({'booking_id': auditionId, 'items': []});
      }
      if (r.path.contains('/materials/')) {
        return ResponseBody.fromBytes([0, 1, 2, 3], 200,
            headers: {
              Headers.contentTypeHeader: ['application/octet-stream']
            });
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const AuditionsPage(mode: 'booking', id: auditionId));
    expect(a.requests.where((r) => r.path.contains('/materials/')), isEmpty);
    final firstId = auditionPhotos.first;
    final hash = auditionBooking()['data']['delivery']['hashes'][firstId];
    final media = find.byKey(ValueKey('$firstId:$hash'));
    await reveal(t, media);
    final photo =
        find.descendant(of: media, matching: find.text('实际读取第1张取样照片'));
    await t.tap(photo);
    await frames(t);
    expect(a.requests.where((r) => r.path.contains('/materials/')).length, 1);
    expect(find.textContaining('文件未能实际打开'), findsOneWidget);
    final receipt = find.widgetWithText(FilledButton, '明确确认本次全部取样已收到');
    await reveal(t, receipt);
    expect(t.widget<FilledButton>(receipt).onPressed, isNull);
    final confirm = find.widgetWithText(FilledButton, '明确确认本次试镜履约完成');
    await reveal(t, confirm);
    expect(t.widget<FilledButton>(confirm).onPressed, isNull);
    expect(
        a.requests.where(
            (r) => r.path.endsWith('/receipt') || r.path.endsWith('/confirm')),
        isEmpty);
    expect(t.takeException(), isNull);
  });

  test('日期选择显示本地时间，提交原ISO且不为未选时段造默认值', () {
    final slots = v5InputSlots([
      {'starts_at': '2026-10-22 10:00', 'ends_at': '2026-10-22 11:00'}
    ]);
    expect(slots.single['starts_at'],
        DateTime(2026, 10, 22, 10).toUtc().toIso8601String());
    expect(v5LocalDate(auditionDate), isNot(contains('T')));
    expect(() => v5InputSlots([]), throwsA(isA<AccountError>()));
    expect(
        () => v5InputSlots([
              {'starts_at': '', 'ends_at': ''}
            ]),
        throwsA(isA<AccountError>()));
    expect(
        () => v5InputSlots([
              {'starts_at': auditionEnd, 'ends_at': auditionDate}
            ]),
        throwsA(isA<AccountError>()));
    final window = {
      'starts_at': '2026-10-21T00:00:00.000Z',
      'ends_at': '2026-11-01T00:00:00.000Z'
    };
    final times = auditionSelectedTimes(window, auditionDate, auditionEnd);
    expect(times['starts_at'], auditionDate);
    expect(times['ends_at'], auditionEnd);
    expect(
        () => auditionSelectedTimes(
            window, window['starts_at'], window['ends_at']),
        throwsA(isA<AccountError>()));
    expect(
        () =>
            auditionSelectedTimes(window, '2026-10-20T23:00:00Z', auditionEnd),
        throwsA(isA<AccountError>()));
  });

  testWidgets('本地日期选择取消后仍为空且不提交', (t) async {
    final a = FakeAccountAdapter(),
        s = (await t.runAsync(() => buyerSession(a)))!;
    final api = AuditionsApi(s);
    await host(
        t,
        s,
        Scaffold(
            body: V5Form(
                api: api,
                title: '选择时间',
                action: '确认本次时间',
                suffix: '/bookings',
                fields: const [
                  V5Field('starts_at', '本次开始时间', type: 'datetime')
                ],
                buildBody: (v) => {'starts_at': v5InputDate(v['starts_at'])},
                parse: (_) {})));
    final field = find.byType(TextFormField);
    expect(t.widget<TextFormField>(field).initialValue, '');
    await t.tap(field);
    await frames(t);
    expect(find.byType(DatePickerDialog), findsOneWidget);
    await t.tap(find.text('返回'));
    await frames(t);
    expect(t.widget<TextFormField>(field).initialValue, '');
    expect(a.requests.where((r) => r.path == '/api/v1/auditions/bookings'),
        isEmpty);
  });
}
