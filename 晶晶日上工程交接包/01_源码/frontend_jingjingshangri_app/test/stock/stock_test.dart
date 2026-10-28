import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/account/read_failure_widgets.dart';
import 'package:jingjingshangri_app/operations/operation_api.dart';
import 'package:jingjingshangri_app/stock/stock_api.dart';
import 'package:jingjingshangri_app/stock/stock_models.dart';
import 'package:jingjingshangri_app/stock/stock_pages.dart';
import 'package:jingjingshangri_app/stock/v5_support.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../trade/trade_fixtures.dart';
import '../operations/operation_fixtures.dart' show noticeData;
import 'v5_test_host.dart';
import '../artists/artists_fixtures.dart' as artist;
import 'package:jingjingshangri_app/stock/stock_listing_form.dart';

const stockId = 'b1000000-0000-4000-8000-000000000001';
const stockDate = '2026-10-22T00:00:00.000Z';
Map<String, dynamic> stockLicense() => {
      'scope': 'PERSONAL_NONCOMMERCIAL',
      'exclusive': false,
      'territory': 'WORLDWIDE',
      'duration': 'PERPETUAL',
      'personal_social_sharing': true,
      'limited_to_buyer': true,
      'acceptance_hours': 72,
      'aftercare_terms': '按原本单处理',
      'excluded': [...stockExcluded]
    };
Map<String, dynamic> stockOffer() => {
      'id': stockId,
      'seller_party_id': orgId,
      'title': '合成现货作品',
      'description': '仅用于权限检查',
      'city': '上海',
      'person_ids': [personId],
      'unit_minor': 2901,
      'currency': 'CNY',
      'license': stockLicense(),
      'object_version': 3,
      'offer_sha256': 'c' * 64
    };
Map<String, dynamic> stockPurchase(
        {int version = 4, String status = 'ACTIVE'}) =>
    {
      'order_id': orderId,
      'listing_id': stockId,
      'buyer_party_id': personId,
      'object_version': version,
      'order_status': status == 'ACTIVE' ? 'PAID' : 'OPEN',
      'contract_sha256': 'c' * 64,
      'data': {
        'status': status,
        'listing_snapshot': {'title': '合成现货作品', 'seller_party_id': orgId},
        'offer_sha256': 'c' * 64,
        'license': stockLicense(),
        'granted_at': status == 'ACTIVE' ? stockDate : null,
        'notification_event_id': 71,
        'viewed_at': null,
        'observed_rights_epoch': null,
        'receipt_at': null,
        'deadline_at': null,
        'job_id': null,
        'accepted_at': null,
        'acceptance_method': null,
        'cases': [],
        'current_case_id': null
      }
    };

void main() {
  testWidgets('首次上架读取已发布销售说明和当前授权，不读取旧商品', (t) async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/artists/people') {
        return envelope({
          'items': [artist.personData()],
          'next_cursor': null
        });
      }
      if (r.path == '/api/v1/stock/sales-publications') {
        return envelope({
          'items': [
            {
              'id': stockId,
              'spec_id': artist.specKey,
              'rule_id': artist.recordKey,
              'title': '个人使用许可',
              'terms': '本版仅个人非商用，不含改编或发行',
              'rule_version': '测试1',
              'spec_title': '测试影片',
              'unit_minor': 100,
              'currency': 'CNY'
            }
          ],
          'next_cursor': null
        });
      }
      if (r.path == '/api/v1/stock/participant-options') {
        return envelope({
          'items': [
            {
              'person_id': artist.personKey,
              'person_name': '本人测试艺人',
              'avatar_id': artist.avatarKey,
              'avatar_name': '本人测试形象',
              'consent_id': artist.recordKey,
              'seller_party_id': personId,
              'valid_from': '2020-01-01T00:00:00.000Z',
              'valid_until': '2099-01-01T00:00:00.000Z'
            }
          ],
          'next_cursor': null
        });
      }
      if (r.path == '/api/v1/artists/people/${artist.personKey}') {
        return envelope(artist.detailData());
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, StockListingForm(session: s));
    final person = find.byType(DropdownButtonFormField<String>).first;
    await t.tap(person);
    await frames(t);
    await t.tap(find.text('本人测试艺人').last);
    await frames(t);
    final count = find.byType(DropdownButtonFormField<int>);
    await reveal(t, count);
    await t.tap(count);
    await frames(t);
    await t.tap(find.text('1 位（逐人选择已审授权）').last);
    await frames(t);
    expect(find.byType(V5Form), findsOneWidget);
    final form = t.widget<V5Form>(find.byType(V5Form));
    expect(form.canSubmit, isTrue);
    expect(form.fields.first.keyName, 'publication_id');
    expect(form.fields.first.choices!.values.single, contains('测试影片'));
    expect(
        form.fields
            .firstWhere((f) => f.keyName == 'participant_0')
            .choices!
            .values
            .single,
        contains('本人测试形象'));
    expect(
        a.requests.where((r) => r.path == '/api/v1/stock/listings'), isEmpty);
    expect(
        a.requests.where((r) =>
            r.path.contains('/records') &&
            r.queryParameters['kind'] == 'CONSENT'),
        isEmpty);
    expect(t.takeException(), isNull);
  });

  test('销售说明分页中空页仍继续读取，不把过滤空页当无资格', () async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/stock/sales-publications') {
        return envelope(r.queryParameters['cursor'] == null
            ? {'items': [], 'next_cursor': stockId}
            : {
                'items': [
                  {'id': artist.recordKey}
                ],
                'next_cursor': null
              });
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a);
    final result = await StockApi(s).salesPublications();
    expect(result.single['id'], artist.recordKey);
    expect(
        a.requests
            .where((r) => r.path == '/api/v1/stock/sales-publications')
            .length,
        2);
  });

  testWidgets('现货目录503用C06，返回保留城市，原条件重读成功才显示真空态', (t) async {
    var failed = true;
    final a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/stock/catalog')
            ? failed
                ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                    status: 503, error: true)
                : envelope({'items': [], 'next_cursor': null})
            : FakeAccountAdapter().defaultReply(r));
    final s = (await t.runAsync(() => buyerSession(a)))!;
    await host(t, s, const StockPage(city: '杭州'));
    expect(find.byType(ReadFailureContent), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('read-failure-back')));
    await frames(t);
    final city = find.widgetWithText(TextField, '城市筛选（可留空）');
    expect(t.widget<TextField>(city).controller!.text, '杭州');
    expect(find.text('当前筛选没有可公开销售的已审作品。'), findsNothing);
    await reveal(t, city);
    await t.enterText(city, '上海');
    await reveal(t, find.text('按城市读取'));
    await t.tap(find.text('按城市读取'));
    await frames(t);
    expect(find.byType(ReadFailureContent), findsOneWidget);
    failed = false;
    await t.tap(find.byKey(const ValueKey('read-failure-retry')));
    await frames(t);
    expect(find.byType(ReadFailureContent), findsNothing);
    await reveal(t, find.text('当前筛选没有可公开销售的已审作品。'));
    expect(
        a.requests
            .lastWhere((r) => r.path.endsWith('/stock/catalog'))
            .queryParameters['city'],
        '上海');
    expect(
        a.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('/api/v1/stock/')),
        isEmpty);
    expect(t.takeException(), isNull);
  });

  for (final failure in ['before-read', 'mark-read', 'after-read']) {
    test('现货通知在$failure失败仅真实写入阶段恢复原请求，不受其他pending影响', () async {
      const readPath = '/api/v1/operations/notifications/71/read';
      var purchaseReads = 0, markReads = 0;
      final viewed = stockPurchase();
      viewed['data']['viewed_at'] = stockDate;
      viewed['data']['observed_rights_epoch'] = 1;
      final a = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/operations/notifications/7/read') {
          return envelope({'code': 'SERVICE_UNAVAILABLE'},
              status: 503, error: true);
        }
        if (r.path.endsWith('/purchases/$orderId')) {
          purchaseReads++;
          if (failure == 'before-read' ||
              failure == 'after-read' && purchaseReads == 2) {
            return envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true);
          }
          return envelope(viewed);
        }
        if (r.path == '/api/v1/operations/notifications') {
          return envelope({
            'items': [
              {
                ...noticeData(id: 71, domain: 'TRADE', recordId: orderId),
                'event_code': 'STOCK_DELIVERY_AVAILABLE',
              }
            ],
            'next_cursor': null
          });
        }
        if (r.path == readPath) {
          markReads++;
          return failure == 'mark-read' && markReads == 1
              ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                  status: 503, error: true)
              : envelope({'id': 71, 'read': true});
        }
        return FakeAccountAdapter().defaultReply(r);
      });
      final s = await buyerSession(a), api = StockApi(s);
      if (failure == 'before-read') {
        await expectLater(
            OperationApi(s).markRead(7), throwsA(isA<AccountError>()));
        expect(s.operationsPending.single['path'], endsWith('/7/read'));
      }
      var writing = false;
      final phases = <bool>[];
      try {
        await api.notification(StockPurchase(viewed, personId), opened: true,
            onMarkReadPhase: (value) {
          phases.add(value);
          writing = value;
        });
        fail('Expected the selected failure phase.');
      } on AccountError catch (e) {
        final message = v5Error(e, writing: writing);
        if (failure == 'mark-read') {
          expect(writing, isTrue);
          expect(message, contains('恢复原请求'));
        } else {
          expect(writing, isFalse);
          expect(message, contains('重读不会重复提交业务'));
          expect(message, isNot(contains('恢复原请求')));
        }
      }
      expect(
          phases,
          failure == 'before-read'
              ? []
              : failure == 'mark-read'
                  ? [true]
                  : [true, false]);
      if (failure == 'mark-read') {
        expect(s.operationsPending.single['path'], readPath);
        final firstWrite = a.requests.singleWhere((r) => r.path == readPath);
        await api.notification(StockPurchase(viewed, personId), opened: true);
        expect(
            a.requests
                .lastWhere((r) => r.path == readPath)
                .headers['Idempotency-Key'],
            firstWrite.headers['Idempotency-Key']);
        expect(s.operationsPending, isEmpty);
      } else if (failure == 'before-read') {
        expect(markReads, 0);
        expect(s.operationsPending.single['path'], endsWith('/7/read'));
      } else {
        expect(markReads, 1);
        expect(s.operationsPending, isEmpty);
      }
      expect(
          a.requests.where(
              (r) => r.method == 'POST' && r.path.startsWith('/api/v1/stock/')),
          isEmpty);
    });
  }

  test('许可固定个人非商用且绑定本人，金额用整数分', () {
    expect(StockOffer(stockOffer()).price, 2901);
    expect(v5InputMoney('0.29'), 29);
    expect(v5InputMoney('29.01'), 2901);
    expect(() => v5InputMoney('1.001'), throwsA(isA<AccountError>()));
    final bad = stockOffer();
    bad['license']['exclusive'] = true;
    expect(() => StockOffer(bad), throwsA(isA<AccountError>()));
    expect(() => StockPurchase(stockPurchase(), orgId),
        throwsA(isA<AccountError>()));
  });
  test('公开目录不带操作主体，空页仍保留真实下一页游标', () async {
    final a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/catalog')
            ? envelope({'items': [], 'next_cursor': stockId})
            : FakeAccountAdapter().defaultReply(r));
    final s = await buyerSession(a), api = StockApi(s);
    final page = await api.catalog();
    expect(page.items, isEmpty);
    expect(page.cursor, stockId);
    expect(a.requests.last.headers['X-Acting-Party'], isNull);
  });
  test('售后未知结果复读原记录后仍用原正文版本与同键，禁止换问题', () async {
    var posts = 0;
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/cases')) {
        posts++;
        return posts == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope(stockPurchase(version: 5));
      }
      if (r.path.endsWith('/purchases/$orderId')) {
        return envelope(stockPurchase(version: 9));
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = await buyerSession(a),
        api = StockApi(s),
        p = StockPurchase(stockPurchase(), personId);
    await expectLater(
        api.action(
            p, 'cases', {'kind': 'FILE_UNAVAILABLE', 'reason': '原文件不能打开'}),
        throwsA(isA<AccountError>()));
    await expectLater(
        api.action(p, 'cases', {'kind': 'REFUND', 'reason': '不可换新请求'}),
        throwsA(isA<AccountError>()));
    expect(posts, 1);
    await api.action(p, 'cases', {}, retry: true);
    final writes = a.requests.where((r) => r.path.endsWith('/cases')).toList();
    expect(writes.length, 2);
    expect(writes.last.data, writes.first.data);
    expect(writes.last.headers['Idempotency-Key'],
        writes.first.headers['Idempotency-Key']);
    expect(writes.last.headers['If-Match'], '"4"');
    expect(a.requests[a.requests.indexOf(writes.last) - 1].path,
        endsWith('/purchases/$orderId'));
  });
  test('未实际打开文件不能通知已读，不提交收件', () async {
    final a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/purchases/$orderId')
            ? envelope(stockPurchase())
            : FakeAccountAdapter().defaultReply(r));
    final s = await buyerSession(a), api = StockApi(s);
    await expectLater(
        api.notification(StockPurchase(stockPurchase(), personId),
            opened: false),
        throwsA(isA<AccountError>()));
    expect(
        a.requests.where(
            (r) => r.path.endsWith('/read') || r.path.endsWith('/receipt')),
        isEmpty);
  });
  for (final paid in [false, true]) {
    testWidgets('已购页面付款=$paid 不预取私有内容，实际读取失败不开放收件', (t) async {
      final a = FakeAccountAdapter(handler: (r) {
        if (r.path.endsWith('/purchases/$orderId')) {
          return envelope(
              stockPurchase(status: paid ? 'ACTIVE' : 'AWAITING_PAYMENT'));
        }
        if (r.path.endsWith('/content')) {
          return envelope({'code': 'PRIVATE_CONTENT_MISMATCH'},
              status: 503, error: true);
        }
        return FakeAccountAdapter().defaultReply(r);
      });
      final s = (await t.runAsync(() => buyerSession(a)))!;
      t.view.physicalSize = const Size(390, 844);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
          value: s,
          child: MaterialApp(home: StockPage(mode: 'purchase', id: orderId))));
      await frames(t);
      expect(a.requests.where((r) => r.path.endsWith('/content')), isEmpty);
      if (paid) {
        await reveal(t, find.text('受控播放已购作品'));
        await t.tap(find.text('受控播放已购作品'));
        await frames(t);
        await reveal(t, find.text('确认本次交付通知已读'));
        expect(
            t
                .widget<OutlinedButton>(
                    find.widgetWithText(OutlinedButton, '确认本次交付通知已读'))
                .onPressed,
            isNull);
        expect(
            t
                .widget<FilledButton>(
                    find.widgetWithText(FilledButton, '明确确认本次文件已收到'))
                .onPressed,
            isNull);
      } else {
        expect(find.text('受控播放已购作品'), findsNothing);
      }
      expect(
          a.requests.where(
              (r) => r.path.endsWith('/receipt') || r.path.endsWith('/read')),
          isEmpty);
      expect(t.takeException(), isNull);
    });
  }
}
