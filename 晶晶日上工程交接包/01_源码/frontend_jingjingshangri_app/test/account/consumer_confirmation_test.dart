import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/account/consumer_confirmation.dart';
import 'package:jingjingshangri_app/account/rest_usage.dart';
import 'fake_account_api.dart';
import 'rest_reminder_test.dart' as rest;

const pay = '/api/v1/trade/payments', risk = '/api/v1/wallet/consumer-risk';
final hash = 'a' * 64;
Future<void> settle() async {
  for (var i = 0; i < 12; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

class Harness {
  Harness() {
    adapter = FakeAccountAdapter(handler: (r) async {
      final override = await handler?.call(r);
      if (override != null) return override;
      if (r.path == '$risk/preview')
        return envelope({
          'configured': configured,
          'required': required,
          'rule_id': invitationId,
          'preview_sha256': hash,
          'reasons': ['FREQUENT_CASH_REQUESTS'],
          'message': '合成消费提示',
          'target': {...r.queryParameters, 'amount_minor': 100},
          'expires_in_seconds': 60
        });
      if (r.path == '$risk/confirm')
        return envelope({
          'id': invitationId,
          'owner_party_id': personId,
          'current_status': 'CONFIRMED',
          'data': {
            'preview': {'preview_sha256': r.data['preview_sha256']}
          }
        });
      if (r.path == pay || r.path.endsWith('/reconciliation'))
        return envelope({'id': invitationId, 'current_status': 'CREATED'});
      return adapter.defaultReply(r);
    });
  }
  late FakeAccountAdapter adapter;
  late AccountSession session;
  late ConsumerConfirmationController c;
  bool required = true, configured = true;
  FutureOr<ResponseBody?> Function(RequestOptions)? handler;
  Future<void> start() async {
    session = await rest.actor(adapter);
    c = ConsumerConfirmationController(session);
    session.api.consumptionGuard = c.guard;
  }

  Future<Map<String, dynamic>> payment() => session.write('POST', pay,
      actingParty: personId,
      body: {'order_id': invitationId, 'installment_key': 'stock'});
  void dispose() {
    c.dispose();
    session.dispose();
  }

  List<RequestOptions> get confirmations =>
      adapter.requests.where((r) => r.path == '$risk/confirm').toList();
  List<RequestOptions> get payments =>
      adapter.requests.where((r) => r.path == pay).toList();
}

void main() {
  test('旧付款读取迟到时切身份，不能继续核对旧账号', () async {
    final h = Harness();
    await h.start();
    final pending = Completer<ResponseBody>();
    final path = '$pay/$invitationId/reconciliation';
    h.handler = (r) {
      if (r.path == '$risk/preview') {
        return envelope({'code': 'VERIFIED_ADULT_REQUIRED'},
            status: 409, error: true);
      }
      if (r.path == '/api/v1/trade/records/$invitationId')
        return pending.future;
      return null;
    };
    final action = h.session.write('POST', path,
        actingParty: personId, body: {'transaction_id': null});
    final expected = expectLater(
        action,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'context', 'CONTEXT_CHANGED')));
    await settle();
    h.session.select(identity(orgId));
    pending.complete(envelope({
      'id': invitationId,
      'kind': 'PAYMENT',
      'buyer_party_id': personId,
      'current_status': 'UNKNOWN'
    }));
    await expected;
    expect(h.adapter.requests.where((r) => r.path == path), isEmpty);
    h.dispose();
  });
  test('未核验者只能核对本人已发出的原付款，不能借旧单发起新消费', () async {
    for (final sample in [
      ('UNKNOWN', invitationId, personId, true),
      ('PENDING', invitationId, personId, true),
      ('CREATED', invitationId, personId, false),
      ('CLOSED', invitationId, personId, false),
      ('UNKNOWN', orgId, personId, false),
      ('UNKNOWN', invitationId, orgId, false),
    ]) {
      final h = Harness();
      await h.start();
      final path = '$pay/$invitationId/reconciliation';
      h.handler = (r) {
        if (r.path == '$risk/preview') {
          return envelope({'code': 'VERIFIED_ADULT_REQUIRED'},
              status: 409, error: true);
        }
        if (r.path == '/api/v1/trade/records/$invitationId') {
          return envelope({
            'id': sample.$2,
            'kind': 'PAYMENT',
            'buyer_party_id': sample.$3,
            'current_status': sample.$1
          });
        }
        return null;
      };
      final action = h.session.write('POST', path,
          actingParty: personId, body: {'transaction_id': null});
      if (sample.$4) {
        await action;
      } else {
        await expectLater(action, throwsA(isA<AccountError>()));
      }
      expect(h.adapter.requests.where((r) => r.path == path),
          hasLength(sample.$4 ? 1 : 0));
      expect(h.payments, isEmpty);
      h.dispose();
    }
    final h = Harness();
    await h.start();
    h.handler = (r) => r.path == '$risk/preview'
        ? envelope({'code': 'VERIFIED_ADULT_REQUIRED'},
            status: 401, error: true)
        : null;
    final path = '$pay/$invitationId/reconciliation';
    await expectLater(
        h.session.write('POST', path,
            actingParty: personId, body: {'transaction_id': null}),
        throwsA(isA<AccountError>()));
    expect(
        h.adapter.requests.where((r) =>
            r.path == '/api/v1/trade/records/$invitationId' || r.path == path),
        isEmpty);
    h.dispose();
  });
  test('未发送原付款预览按契约展开，保留原编号确认和原核对请求', () async {
    final h = Harness();
    await h.start();
    h.handler = (r) => r.path == '$risk/preview'
        ? envelope({
            'configured': true,
            'required': true,
            'rule_id': invitationId,
            'preview_sha256': hash,
            'reasons': ['FREQUENT_CASH_REQUESTS'],
            'message': '合成提示',
            'expires_in_seconds': 60,
            'target': {
              'kind': 'PAYMENT',
              'order_id': personId,
              'installment_key': 'stock',
              'request_key': 'original-payment',
              'amount_minor': 100
            }
          })
        : null;
    final path = '$pay/$invitationId/reconciliation';
    final p = h.session.write('POST', path,
        actingParty: personId, body: {'transaction_id': null});
    await settle();
    expect(h.c.phase, 'read');
    expect(h.adapter.requests.where((r) => r.path == path), isEmpty);
    h.c.choose(true);
    await p;
    expect(h.confirmations.single.data['target'],
        {'kind': 'PAYMENT_RECORD', 'payment_id': invitationId});
    expect(h.adapter.requests.where((r) => r.path == path), hasLength(1));
    expect(h.payments, isEmpty);
    h.dispose();
  });
  test('缺失或错误预览不能靠未配置规则绕过消费校验', () async {
    for (final target in [
      null,
      {'kind': 'PAYMENT'},
      {
        'kind': 'PAYMENT',
        'order_id': 'wrong',
        'installment_key': 'stock',
        'request_key': 'key',
        'amount_minor': 100
      }
    ]) {
      final h = Harness();
      await h.start();
      h.handler = (r) => r.path == '$risk/preview'
          ? envelope({
              'configured': false,
              'required': false,
              'reasons': [],
              'target': target
            })
          : null;
      final path = '$pay/$invitationId/reconciliation';
      await expectLater(
          h.session.write('POST', path,
              actingParty: personId, body: {'transaction_id': null}),
          throwsA(isA<AccountError>()));
      expect(
          h.adapter.requests.where((r) =>
              r.path == path || r.path == pay || r.path == '$risk/confirm'),
          isEmpty);
      h.dispose();
    }
  });
  test('主动阅读后继续原付款，确认键独立且原始目标不混入计算金额', () async {
    final h = Harness();
    await h.start();
    final p = h.payment();
    await settle();
    expect(h.c.phase, 'read');
    expect(h.payments, isEmpty);
    h.c.choose(true);
    await p;
    expect(h.confirmations.single.data['target'].containsKey('amount_minor'),
        false);
    expect(h.confirmations.single.headers['Idempotency-Key'],
        isNot(h.payments.single.headers['Idempotency-Key']));
    h.dispose();
  });
  test('确认响应丢失跨页面重试先恢复原确认键，消费键保持', () async {
    final h = Harness();
    await h.start();
    var lost = true;
    h.handler = (r) {
      if (r.path == '$risk/confirm' && lost) {
        lost = false;
        return envelope({'code': 'UNAVAILABLE'}, status: 503, error: true);
      }
      return null;
    };
    final p = h.payment();
    await settle();
    final expected = expectLater(
        p,
        throwsA(
            isA<AccountError>().having((e) => e.uncertain, 'unknown', true)));
    h.c.choose(true);
    await expected;
    final key = h.confirmations.single.headers['Idempotency-Key'];
    final old = h.session.pending('POST', pay, actingParty: personId)!['key'];
    final q = h.payment();
    await settle();
    expect(h.c.phase, 'recover');
    h.c.choose(true);
    await settle();
    expect(h.confirmations.last.headers['Idempotency-Key'], key);
    expect(h.c.phase, 'read');
    h.c.choose(true);
    await q;
    expect(h.payments.single.headers['Idempotency-Key'], old);
    h.dispose();
  });
  test('原付款结果未知先恢复原结果，不因目标不再待付款重开', () async {
    final h = Harness();
    await h.start();
    h.required = false;
    var lost = true;
    h.handler = (r) {
      if (r.path == pay && lost) {
        lost = false;
        return envelope({'code': 'UNAVAILABLE'}, status: 503, error: true);
      }
      return null;
    };
    await expectLater(h.payment(), throwsA(isA<AccountError>()));
    final n = h.adapter.requests.where((r) => r.path == '$risk/preview').length;
    await h.payment();
    expect(
        h.adapter.requests.where((r) => r.path == '$risk/preview').length, n);
    expect(h.payments.first.headers['Idempotency-Key'],
        h.payments.last.headers['Idempotency-Key']);
    h.dispose();
  });
  test('过期和规则替换须重新点击与阅读，仅确认键变化', () async {
    for (final code in [
      'CONSUMER_RISK_CONFIRMATION_EXPIRED',
      'CONSUMER_RISK_PREVIEW_CHANGED'
    ]) {
      final h = Harness();
      await h.start();
      var once = true;
      h.handler = (r) {
        if (once &&
            r.path == (code.endsWith('CHANGED') ? '$risk/confirm' : pay)) {
          once = false;
          return envelope({'code': code}, status: 409, error: true);
        }
        return null;
      };
      final p = h.payment();
      await settle();
      h.c.choose(true);
      await settle();
      expect(h.c.phase, 'preview');
      final n = h.adapter.requests.length;
      await settle();
      expect(h.adapter.requests.length, n);
      h.c.choose(true);
      await settle();
      expect(h.c.phase, 'read');
      h.c.choose(true);
      await p;
      expect(h.confirmations.first.headers['Idempotency-Key'],
          isNot(h.confirmations.last.headers['Idempotency-Key']));
      if (h.payments.length > 1)
        expect(h.payments.first.headers['Idempotency-Key'],
            h.payments.last.headers['Idempotency-Key']);
      h.dispose();
    }
  });
  test('切身份和迟到预览停止原消费；机构不代本人确认', () async {
    final h = Harness();
    await h.start();
    final pending = Completer<ResponseBody>();
    h.handler = (r) => r.path == '$risk/preview' ? pending.future : null;
    final p = h.payment();
    final expected = expectLater(
        p,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'context', 'CONTEXT_CHANGED')));
    await settle();
    h.session.select(identity(orgId));
    pending.complete(envelope({
      'configured': false,
      'required': false,
      'rule_id': null,
      'preview_sha256': null,
      'reasons': [],
      'message': null,
      'target': {
        ...h.adapter.requests.last.queryParameters,
        'amount_minor': 100
      },
      'expires_in_seconds': null
    }));
    await expected;
    expect(h.payments, isEmpty);
    expect(h.c.phase, isNull);
    h.handler = null;
    await h.session.write('POST', pay,
        actingParty: orgId,
        body: {'order_id': invitationId, 'installment_key': 'stock'});
    expect(h.payments.length, 1);
    h.dispose();
  });
  test('重复点击合并原请求；超限不自动重试、不扣钻', () async {
    final h = Harness();
    await h.start();
    final p = h.payment(), q = h.payment();
    await settle();
    expect(h.c.phase, 'read');
    h.c.choose(true);
    await Future.wait([p, q]);
    expect(h.payments.length, 1);
    h.handler = (r) => r.path == '$risk/preview'
        ? envelope({'code': 'LOTTERY_PARTICIPATION_LIMIT'},
            status: 409, error: true)
        : null;
    await expectLater(
        h.payment(),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'limit', 'LOTTERY_PARTICIPATION_LIMIT')));
    expect(h.payments.length, 1);
    h.dispose();
  });
  test('新合同池无规则不调用抽奖；不把晶钻误标现金', () async {
    final h = Harness();
    await h.start();
    h.required = false;
    h.configured = false;
    h.handler = (r) => r.path.startsWith('/api/v1/redemption/pools/')
        ? envelope({
            'data': {
              'config': {'source_profile': 'CONTRACT_20261029'}
            }
          })
        : null;
    await expectLater(
        h.session.write('POST', '/api/v1/redemption/draws',
            actingParty: personId, body: {'pool_id': invitationId, 'count': 1}),
        throwsA(isA<AccountError>().having((e) => e.code, 'not configured',
            'CONSUMER_POLICY_NOT_CONFIGURED')));
    expect(
        h.adapter.requests.where((r) => r.path == '/api/v1/redemption/draws'),
        isEmpty);
    h.dispose();
  });
  test('夜间单独启用不报时长，同日已读与重建不重复，下一日可提示', () async {
    SharedPreferences.setMockInitialValues({});
    var day = '2026-11-03';
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path.startsWith(rest.usagePath)
            ? envelope({
                ...rest.usage(enabled: false, due: false),
                'local_date': day,
                'night_reminder': {
                  'enabled': true,
                  'due': true,
                  'timezone': 'Asia/Shanghai',
                  'start_minute': 1320,
                  'end_minute': 480
                }
              })
            : a.defaultReply(r));
    final s = await rest.actor(a);
    var c = RestUsageController(s);
    await settle();
    expect(c.nightVisible, true);
    c.dismissNight();
    await c.refresh();
    expect(c.nightVisible, false);
    c.dispose();
    c = RestUsageController(s);
    await settle();
    expect(c.nightVisible, false);
    day = '2026-11-04';
    await c.refresh();
    expect(c.nightVisible, true);
    expect(a.requests.where((r) => r.path.endsWith('/pulse')), isEmpty);
    c.dispose();
    s.dispose();
  });
  testWidgets('原生确认框必须本人勾选，取消不发付款', (t) async {
    final h = Harness();
    await t.runAsync(h.start);
    h.c.dispose();
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: h.session,
        child: MaterialApp(
            builder: (_, child) => ConsumerConfirmation(child: child!),
            home: const Scaffold(body: Text('业务页面')))));
    final p = h.payment();
    final expected = expectLater(p, throwsA(isA<AccountError>()));
    for (var i = 0; i < 20; i++) {
      await t.pump(const Duration(milliseconds: 10));
    }
    expect(find.text('本次消费提示'), findsOneWidget);
    expect(
        t
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, '已阅读，继续原操作'))
            .onPressed,
        isNull);
    await t.tap(find.byType(CheckboxListTile));
    await t.pump();
    expect(
        t
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, '已阅读，继续原操作'))
            .onPressed,
        isNotNull);
    await t.tap(find.text('暂不继续'));
    await t.pump();
    await expected;
    expect(h.payments, isEmpty);
    await t.pumpWidget(const SizedBox());
    h.session.dispose();
  });
}
