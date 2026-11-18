import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/auditions/auditions_actions.dart';
import 'package:jingjingshangri_app/auditions/auditions_api.dart';
import 'package:jingjingshangri_app/auditions/auditions_models.dart';
import 'package:jingjingshangri_app/stock/v5_support.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'auditions_fixtures.dart';

Map<String, dynamic> page(String kind, List<Map<String, dynamic>> items,
        {String? cursor, String booking = auditionId}) =>
    {
      'booking_id': booking,
      'person_id': auditionPersonId,
      'avatar_id': auditionAvatarId,
      'kind': kind,
      'items': items,
      'next_cursor': cursor
    };
Map<String, dynamic> media(String id, String type) => {
      'id': id,
      'media_type': type,
      'byte_size': 100,
      'content_sha256': 'a' * 64
    };
Map<String, dynamic> consent() =>
    {'id': auditionConsentId, 'valid_until': '2099-01-01T00:00:00.000Z'};

void main() {
  test('预约选项翻过空页且严格验证同预约、人物、形象与材料类型', () async {
    var wrong = false;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/delivery-options')) {
        if (wrong) {
          return envelope(page('PHOTO', [], booking: auditionOfferId));
        }
        return envelope(r.queryParameters['cursor'] == null
            ? page('PHOTO', [], cursor: auditionRuleId)
            : page('PHOTO', [media(auditionPhotos.first, 'image/jpeg')]));
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a);
    s.select(identity(orgId, owner: false));
    final api = AuditionsApi(s),
        booking = AuditionRecord(auditionBooking(status: 'ACCEPTED'));
    final options = await api.deliveryOptions(booking, 'PHOTO');
    expect(options.single['id'], auditionPhotos.first);
    final reads =
        a.requests.where((r) => r.path.endsWith('/delivery-options')).toList();
    expect(reads.length, 2);
    expect(reads.last.queryParameters['cursor'], auditionRuleId);
    expect(reads.every((r) => r.headers['X-Acting-Party'] == orgId), isTrue);
    wrong = true;
    await expectLater(
        api.deliveryOptions(booking, 'PHOTO'), throwsA(isA<AccountError>()));
  });

  test('员工缺材料权限仅阻止本预约选项，不封禁整个试镜域', () async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/delivery-options')) {
        return envelope({'code': 'MCN_EMPLOYEE_SCOPE_REQUIRED'},
            status: 403, error: true);
      }
      if (r.path.endsWith('/records/$auditionId')) {
        return envelope(auditionBooking(status: 'ACCEPTED'));
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a);
    s.select(identity(orgId, owner: false));
    final api = AuditionsApi(s),
        booking = AuditionRecord(auditionBooking(status: 'ACCEPTED'));
    await expectLater(
        api.deliveryOptions(booking, 'PHOTO'), throwsA(isA<AccountError>()));
    expect(s.auditionsAccessDenied, isFalse);
    expect((await api.record(auditionId)).id, auditionId);
  });

  testWidgets('获授权机构员工能选择本预约材料并按原数量交付', (t) async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/records/$auditionId')) {
        return envelope(auditionBooking(status: 'ACCEPTED'));
      }
      if (r.path.endsWith('/delivery-options')) {
        final kind = r.queryParameters['kind'] as String;
        final items = kind == 'PHOTO'
            ? [for (final id in auditionPhotos) media(id, 'image/jpeg')]
            : kind == 'VIDEO'
                ? [media(auditionVideoId, 'video/mp4')]
                : [consent()];
        return envelope(page(kind, items));
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    s.select(identity(orgId, owner: false));
    await host(t, s,
        AuditionActionPage(session: s, id: auditionId, action: 'delivery'));
    await reveal(t, find.byType(V5Form));
    final form = t.widget<V5Form>(find.byType(V5Form));
    expect(form.canSubmit, isTrue);
    expect(form.fields.single.choices!.containsKey(auditionConsentId), isTrue);
    final body = form.buildBody({
      'photos': auditionPhotos.join(','),
      'videos': auditionVideoId,
      'consent_id': auditionConsentId
    });
    expect(body['delivery']['photos'], auditionPhotos);
    expect(body['delivery']['videos'], [auditionVideoId]);
    expect(a.requests.where((r) => r.path.endsWith('/delivery-options')).length,
        3);
    expect(a.requests.where((r) => r.path.startsWith('/api/v1/artists/')),
        isEmpty);
    expect(t.takeException(), isNull);
  });

  testWidgets('空材料或撤权后不能继续提交，原选择会清空', (t) async {
    var denied = false, empty = true;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/records/$auditionId')) {
        return envelope(auditionBooking(status: 'ACCEPTED'));
      }
      if (r.path.endsWith('/delivery-options')) {
        if (denied) {
          return envelope({'code': 'MCN_EMPLOYEE_SCOPE_REQUIRED'},
              status: 403, error: true);
        }
        final kind = r.queryParameters['kind'] as String;
        final items = kind == 'PHOTO'
            ? (empty
                ? <Map<String, dynamic>>[]
                : [for (final id in auditionPhotos) media(id, 'image/jpeg')])
            : kind == 'VIDEO'
                ? [media(auditionVideoId, 'video/mp4')]
                : [consent()];
        return envelope(page(kind, items));
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    s.select(identity(orgId, owner: false));
    await host(t, s,
        AuditionActionPage(session: s, id: auditionId, action: 'delivery'));
    await reveal(t, find.byType(V5Form));
    expect(t.widget<V5Form>(find.byType(V5Form)).canSubmit, isFalse);
    empty = false;
    await reveal(t, find.text('重新读取本预约材料与授权'));
    await t.tap(find.text('重新读取本预约材料与授权'));
    await frames(t);
    await reveal(t, find.byType(V5Form));
    final form = t.widget<V5Form>(find.byType(V5Form));
    expect(form.canSubmit, isTrue);
    final body = form.buildBody({
      'photos': auditionPhotos.join(','),
      'videos': auditionVideoId,
      'consent_id': auditionConsentId
    });
    denied = true;
    await t.runAsync(() async {
      await expectLater(form.beforeSubmit!(body), throwsA(isA<AccountError>()));
    });
    await t.pump();
    final currentForm = find.byType(V5Form);
    if (currentForm.evaluate().isNotEmpty) {
      expect(t.widget<V5Form>(currentForm).canSubmit, isFalse);
    }
    expect(s.auditionsAccessDenied, isFalse);
    expect(
        a.requests
            .where((r) => r.method == 'POST' && r.path.endsWith('/delivery')),
        isEmpty);
  });

  testWidgets('切身份后迟到的原预约材料不回写页面', (t) async {
    final delayed = Completer<ResponseBody>();
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/records/$auditionId')) {
        return envelope(auditionBooking(status: 'ACCEPTED'));
      }
      if (r.path.endsWith('/delivery-options')) {
        if (r.headers['X-Acting-Party'] == personId) {
          return envelope({'code': 'AUDITION_PARTY_FORBIDDEN'},
              status: 403, error: true);
        }
        final kind = r.queryParameters['kind'] as String;
        if (kind == 'PHOTO') return delayed.future;
        return envelope(page(
            kind,
            kind == 'VIDEO'
                ? [media(auditionVideoId, 'video/mp4')]
                : [consent()]));
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    s.select(identity(orgId, owner: false));
    await host(t, s,
        AuditionActionPage(session: s, id: auditionId, action: 'delivery'));
    await reveal(t, find.byType(V5Form));
    s.select(identity(personId));
    delayed.complete(
        envelope(page('PHOTO', [media(auditionPhotos.first, 'image/jpeg')])));
    await frames(t);
    expect(find.byKey(ValueKey('audition-photos-${auditionPhotos.first}')),
        findsNothing);
    final currentForm = find.byType(V5Form);
    if (currentForm.evaluate().isNotEmpty) {
      expect(t.widget<V5Form>(currentForm).canSubmit, isFalse);
    }
    expect(s.auditionsAccessDenied, isFalse);
    expect(t.takeException(), isNull);
  });

  testWidgets('交付成功但响应丢失后只重读原预约，不用已关闭的选项阻断原请求', (t) async {
    var committed = false, optionReads = 0;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.method == 'POST' && r.path.endsWith('/delivery')) {
        committed = true;
        return envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'}, status: 503, error: true);
      }
      if (r.path.endsWith('/records/$auditionId')) {
        final booking = auditionBooking(status: committed ? 'DELIVERED' : 'ACCEPTED');
        if (committed) { booking['current_status'] = 'DELIVERY_REVIEW'; booking['data']['status'] = 'DELIVERY_REVIEW'; booking['data']['delivery_review'] = null; }
        return envelope(booking);
      }
      if (r.path.endsWith('/delivery-options')) {
        optionReads++;
        if (committed) return envelope({'code': 'AUDITION_NOT_DELIVERABLE'}, status: 409, error: true);
        final kind = r.queryParameters['kind'] as String;
        return envelope(page(kind, kind == 'PHOTO' ? [for (final id in auditionPhotos) media(id, 'image/jpeg')] : kind == 'VIDEO' ? [media(auditionVideoId, 'video/mp4')] : [consent()]));
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!; s.select(identity(orgId, owner: false));
    await host(t, s, AuditionActionPage(session: s, id: auditionId, action: 'delivery'));
    await reveal(t, find.byType(V5Form));
    final form = t.widget<V5Form>(find.byType(V5Form));
    final body = form.buildBody({'photos': auditionPhotos.join(','), 'videos': auditionVideoId, 'consent_id': auditionConsentId});
    await t.runAsync(() async {
      await expectLater(form.api.post(form.suffix, body, (d) => form.parse(d), version: 4), throwsA(isA<AccountError>()));
      expect(await form.reload!(), isNotNull);
    });
    expect(optionReads, 3);
    expect(form.api.pending(form.suffix), isNotNull);
  });

  test('重复交付共享请求，未知结果恢复原键、原版本及正文', () async {
    final first = Completer<ResponseBody>();
    var posts = 0;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.method == 'POST' && r.path.endsWith('/delivery')) {
        posts++;
        return posts == 1
            ? first.future
            : envelope(auditionBooking(version: 5, status: 'DELIVERED'));
      }
      if (r.path.endsWith('/records/$auditionId')) {
        return envelope(auditionBooking(status: 'ACCEPTED'));
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a);
    s.select(identity(orgId, owner: false));
    final api = AuditionsApi(s),
        body = {
          'delivery': {
            'photos': auditionPhotos,
            'videos': [auditionVideoId],
            'consent_id': auditionConsentId
          }
        };
    const suffix = '/bookings/$auditionId/delivery';
    final one = api.post(
        suffix, body, (d) => api.validateBooking(d, auditionId),
        version: 4);
    final two = api.post(
        suffix, body, (d) => api.validateBooking(d, auditionId),
        version: 4);
    for (var i = 0; i < 20 && posts == 0; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 1));
    }
    expect(posts, 1);
    final failures = Future.wait([
      expectLater(one, throwsA(isA<AccountError>())),
      expectLater(two, throwsA(isA<AccountError>()))
    ]);
    first.complete(
        envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'}, status: 503, error: true));
    await failures;
    await api.restoreOperation('${api.base}$suffix');
    final writes = a.requests
        .where((r) => r.method == 'POST' && r.path.endsWith('/delivery'))
        .toList();
    expect(writes.length, 2);
    expect(writes[1].headers['Idempotency-Key'],
        writes[0].headers['Idempotency-Key']);
    expect(writes[1].headers['If-Match'], '"4"');
    expect(writes[1].data, writes[0].data);
  });
}
