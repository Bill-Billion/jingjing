import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/redemption/redemption_pages.dart';
import 'package:jingjingshangri_app/wallet/consumer_limits.dart';
import 'package:jingjingshangri_app/engagement/community_support.dart';
import 'fake_account_api.dart';

void main() {
  test('公示期、新旧奖池、活动结束均检查，PUBLISHED不等于可抽', () {
    final r = {
      'current_status': 'PUBLISHED',
      'starts_at': '2026-11-01T00:00:00Z',
      'ends_at': '2026-12-01T00:00:00Z'
    };
    final now = DateTime.parse('2026-11-03T00:00:00Z');
    expect(lotteryAvailability(r, now: now), isNull);
    expect(
        lotteryAvailability({
          ...r,
          'publication_notice': {
            'published_at': '2026-11-02T00:00:00Z',
            'opens_at': '2026-11-09T00:00:00Z',
            'days': 7
          }
        }, now: now),
        contains('公示'));
    expect(lotteryAvailability(r, now: DateTime.parse('2027-01-01T00:00:00Z')),
        contains('结束'));
  });
  test('限额0、无上限与待确认分别解析，错身份或负数不可显示', () {
    final r = {
      'id': invitationId,
      'object_version': 1,
      'party_id': personId,
      'scope': 'PERSONAL_CASH_ONLY',
      'accounting_basis': 'GROSS_MONTH_REQUESTS_RECEIPTS_AND_OPEN_ATTEMPTS',
      'as_of': '2026-11-03T00:00:00Z',
      'period': {'timezone': 'Asia/Shanghai'},
      'limits': {'PAYMENT': 0, 'RECHARGE': null},
      'pending': {'PAYMENT': null, 'RECHARGE': null},
      'usage': {
        'PAYMENT': {
          'used_minor': 100,
          'pending_minor': 100,
          'remaining_minor': 0,
          'over_limit': true
        },
        'RECHARGE': {
          'used_minor': 0,
          'pending_minor': 0,
          'remaining_minor': null,
          'over_limit': false
        }
      }
    };
    expect(ConsumerLimits(r, personId).version, 1);
    expect(() => ConsumerLimits(r, orgId), throwsA(isA<AccountError>()));
    expect(() => ConsumerLimits({...r, 'usage': {}}, personId),
        throwsA(isA<AccountError>()));
    expect(communityMinor('1.50', '上限', zero: true), 150);
    expect(communityMinor('0', '上限', zero: true), 0);
  });
  testWidgets('个人限额真实页面可挂载并读取本人接口，服务失败清空额度', (t) async {
    var broken = false;
    late FakeAccountAdapter a;
    final value = {
      'id': invitationId,
      'object_version': 1,
      'party_id': personId,
      'scope': 'PERSONAL_CASH_ONLY',
      'accounting_basis': 'GROSS_MONTH_REQUESTS_RECEIPTS_AND_OPEN_ATTEMPTS',
      'as_of': '2026-11-03T00:00:00Z',
      'period': {'timezone': 'Asia/Shanghai', 'month': '2026-11'},
      'limits': {'PAYMENT': 0, 'RECHARGE': null},
      'pending': {'PAYMENT': null, 'RECHARGE': null},
      'usage': {
        'PAYMENT': {
          'used_minor': 100,
          'pending_minor': 100,
          'remaining_minor': 0,
          'over_limit': true
        },
        'RECHARGE': {
          'used_minor': 0,
          'pending_minor': 0,
          'remaining_minor': null,
          'over_limit': false
        }
      }
    };
    a = FakeAccountAdapter(
        handler: (r) => r.path == '/api/v1/wallet/consumer-controls'
            ? (broken
                ? envelope({'code': 'UNAVAILABLE'}, status: 503, error: true)
                : envelope(value))
            : a.defaultReply(r));
    final session = AccountSession(api: a.createApi());
    await t.runAsync(() async {
      await session.login('13800000000', invitationId, '123456');
      session.select(identity(personId));
    });
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: session, child: const MaterialApp(home: ConsumerLimitsPage())));
    for (var i = 0; i < 20; i++) {
      await t.pump(const Duration(milliseconds: 10));
    }
    expect(t.takeException(), isNull);
    expect(find.text('本人充值与现金消费限额'), findsOneWidget);
    expect(
        a.requests.any((r) =>
            r.path == '/api/v1/wallet/consumer-controls' &&
            r.headers['X-Acting-Party'] == personId),
        true);
    broken = true;
    await t.tap(find.text('刷新本人限额'));
    for (var i = 0; i < 20; i++) {
      await t.pump(const Duration(milliseconds: 10));
    }
    expect(find.text('当前月度上限'), findsNothing);
    await t.pumpWidget(const SizedBox());
    session.dispose();
  });
}
