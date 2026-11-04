import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/app.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';

const origin = String.fromEnvironment('NATIVE_ORIGIN');
const controlToken = String.fromEnvironment('NATIVE_CONTROL');
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  AccountSession? session;
  NavigatorState? nav;
  Map<String, dynamic> fixture = {};
  final keys = <String>[];
  bool loseDelivery = false;
  bool receiptOk = false, confirmOk = false;
  String? bookingId, orderId, paymentId;
  Future<Map<String, dynamic>> control(String action,
      [Map<String, dynamic> args = const {}]) async {
    final client = HttpClient();
    try {
      final req = await client.postUrl(Uri.parse('$origin/__native/control'));
      req.headers.set('Authorization', 'Bearer $controlToken');
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({'action': action, ...args}));
      final response = await req.close();
      expect(response.statusCode, 200, reason: action);
      return Map<String, dynamic>.from(
          jsonDecode(await utf8.decoder.bind(response).join()));
    } finally {
      client.close(force: true);
    }
  }

  Future<void> frames(WidgetTester t, [int n = 5]) async {
    for (var i = 0; i < n; i++) {
      await t.pump(const Duration(milliseconds: 200));
    }
  }

  Future<void> wait(WidgetTester t, Finder f) async {
    for (var i = 0; i < 150 && f.evaluate().isEmpty; i++) {
      await frames(t, 1);
    }
    if (f.evaluate().isEmpty) {
      final labels = find
          .byType(Text)
          .evaluate()
          .map((e) => (e.widget as Text).data)
          .whereType<String>()
          .take(80)
          .join(' | ');
      debugPrint('SYNTHETIC_PAGE_LABELS $labels');
    }
    expect(f, findsWidgets);
  }

  Future<void> reveal(WidgetTester t, Finder f) async {
    if (f.evaluate().isEmpty && find.byType(Scrollable).evaluate().isNotEmpty) {
      t
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .jumpTo(0);
      await frames(t, 2);
    }
    for (var i = 0; i < 35 && f.evaluate().isEmpty; i++) {
      if (find.byType(Scrollable).evaluate().isNotEmpty) {
        await t.drag(find.byType(Scrollable).first, const Offset(0, -350));
      }
      await frames(t, 2);
    }
    await wait(t, f);
    await frames(t, 8);
    for (var i = 0; i < 35; i++) {
      final element = f.evaluate();
      final render = element.isEmpty ? null : element.first.renderObject;
      if (render is RenderBox && render.hasSize && !render.debugNeedsLayout) {
        break;
      }
      final scrollables = element.isEmpty
          ? find.byType(Scrollable)
          : find.ancestor(of: f.first, matching: find.byType(Scrollable));
      if (scrollables.evaluate().isNotEmpty) {
        await t.drag(scrollables.first, const Offset(0, -250));
      }
      await frames(t, 2);
    }
    await wait(t, f);
    await Scrollable.ensureVisible(t.element(f.first), alignment: 0.4);
    await frames(t, 2);
  }

  Future<void> tap(WidgetTester t, Finder f) async {
    FocusManager.instance.primaryFocus?.unfocus();
    await frames(t, 2);
    await reveal(t, f);
    await t.tap(f.first.hitTestable());
    await frames(t);
  }

  Future<void> boot(WidgetTester t, String role) async {
    session?.dispose();
    runApp(const SizedBox.shrink());
    await frames(t);
    fixture = await control('setup', {'role': role});
    final a = fixture['account'];
    final legacy = UserProvider();
    await legacy.logout();
    final dio = Dio(BaseOptions(
        baseUrl: origin,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        followRedirects: false,
        validateStatus: (_) => true));
    final api = AccountApi(dio: dio),
        account =
            await api.request('GET', '/api/v1/me', token: a['bearer_token']);
    var first = true;
    dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
      if (o.method == 'POST' && o.path.endsWith('/delivery')) {
        keys.add('${o.headers['Idempotency-Key']}');
      }
      if (first && o.method == 'POST' && o.path == '/api/v1/auth/sessions') {
        first = false;
        h.resolve(Response<dynamic>(requestOptions: o, statusCode: 200, data: {
          'data': {
            'access_token': a['bearer_token'],
            'token_type': 'Bearer',
            'account': account
          }
        }));
      } else {
        h.next(o);
      }
    }, onResponse: (r, h) {
      if (r.requestOptions.method == 'POST' &&
          r.requestOptions.path.endsWith('/receipt')) {
        receiptOk = r.statusCode == 200;
        debugPrint('SYNTHETIC_RECEIPT_STATUS ${r.statusCode}');
      }
      if (r.requestOptions.method == 'POST' &&
          r.requestOptions.path.endsWith('/confirm')) {
        confirmOk = r.statusCode == 200;
        debugPrint('SYNTHETIC_CONFIRM_STATUS ${r.statusCode}');
      }
      if (r.statusCode == 200 &&
          r.requestOptions.method == 'POST' &&
          r.data is Map) {
        final d = r.data['data'];
        if (d is Map) {
          if (r.requestOptions.path == '/api/v1/auditions/bookings') {
            bookingId = d['id'];
          }
          if (r.requestOptions.path == '/api/v1/auditions/checkout') {
            orderId = d['id'];
          }
          if (r.requestOptions.path == '/api/v1/trade/payments') {
            paymentId = d['id'];
          }
        }
      }
      if (loseDelivery &&
          r.statusCode == 200 &&
          r.requestOptions.method == 'POST' &&
          r.requestOptions.path.endsWith('/delivery')) {
        loseDelivery = false;
        h.reject(DioException(
            requestOptions: r.requestOptions,
            type: DioExceptionType.connectionError,
            message: 'Synthetic response lost after commit'));
        return;
      }
      h.next(r);
    }));
    session = AccountSession(api: api);
    await session!
        .login('local-synthetic-$role', 'local-bootstrap', 'local-only');
    await session!.loadParties();
    session!.select(
        session!.parties.singleWhere((r) => r['party']['id'] == a['party_id']));
    runApp(MultiProvider(
        providers: [
          ChangeNotifierProvider<UserProvider>.value(value: legacy),
          ChangeNotifierProvider<AccountSession>.value(value: session!)
        ],
        child: const Directionality(
            textDirection: TextDirection.ltr,
            child: Banner(
                message: '本机模拟测试',
                location: BannerLocation.topEnd,
                child: JingjingShangriApp()))));
    await wait(t, find.byType(NavigationBar));
    nav = Navigator.of(t.element(find.byType(NavigationBar)));
    await frames(t, 5);
  }

  Future<void> open(WidgetTester t, String route) async {
    nav!.pushNamedAndRemoveUntil(route, (r) => r.isFirst);
    await frames(t, 15);
  }

  Future<void> selectTime(WidgetTester t, String label, int hour) async {
    await tap(t, find.widgetWithText(TextFormField, label));
    await wait(t, find.byType(DatePickerDialog));
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    if (tomorrow.month != DateTime.now().month) {
      await tap(t, find.byIcon(Icons.chevron_right));
    }
    await tap(t, find.text('${tomorrow.day}').last);
    await tap(t, find.text('下一步'));
    await wait(t, find.byType(TimePickerDialog));
    await tap(t, find.byIcon(Icons.keyboard_outlined));
    final fields = find.descendant(
        of: find.byType(TimePickerDialog), matching: find.byType(TextField));
    expect(fields, findsNWidgets(2));
    await t.enterText(fields.first, '$hour');
    await t.enterText(fields.last, '00');
    await tap(t, find.text('确定'));
  }

  Future<void> selectChoice(WidgetTester t, String label, Finder option) async {
    final field = find.byWidgetPredicate((w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == label);
    await tap(t, field);
    await tap(t, option.last);
  }

  Future<void> confirm(WidgetTester t) async {
    await wait(t, find.text('确认办理'));
    await tap(t, find.text('确认办理'));
  }

  Future<void> waitId(WidgetTester t, bool Function() ready) async {
    for (var i = 0; i < 150 && !ready(); i++) {
      await frames(t, 1);
    }
    expect(ready(), isTrue);
  }

  testWidgets(
      'new native audition booking, simulated payment and same-booking delivery',
      (t) async {
    await boot(t, 'buyer');
    final offer = fixture['offer_id'] as String;
    expect(offer, matches(RegExp(r'^[0-9a-f-]{36}$')));
    await open(t, '/auditions/catalog');
    await wait(t, find.text('Synthetic audition'));
    await control('record', {'name': 'native-public-catalog'});
    await tap(t, find.text('约试镜 ↗').first);
    await wait(t, find.text('选择真实可约时段'));
    await selectChoice(t, '选择真实可约时段', find.byType(DropdownMenuItem<String>));
    await selectTime(t, '本次开始时间', 10);
    await selectTime(t, '本次结束时间', 11);
    for (final entry in <String, String>{
      '正规拍摄或试镜场地': '合成线上材料',
      '明确场地地址': '隔离本机',
      '本次真实用途': '合成首次试镜预约'
    }.entries) {
      final field = find.widgetWithText(TextFormField, entry.key);
      await reveal(t, field);
      await t.enterText(field, entry.value);
    }
    await tap(t, find.textContaining('我确认按本人已核实的成年身份办理'));
    await tap(t, find.text('提交本次预约安全核查'));
    await confirm(t);
    await waitId(t, () => bookingId != null);
    await control('review-booking', {'booking_id': bookingId});
    await open(t, '/auditions/booking?bookingId=$bookingId');
    await selectChoice(t, '本订单支付渠道', find.text('支付宝'));
    await tap(t, find.text('确认本版并建立未付款订单'));
    await confirm(t);
    await waitId(t, () => orderId != null);
    await control('record', {
      'name': 'native-new-booking-and-checkout',
      'booking_id': bookingId,
      'order_id': orderId
    });
    await open(t, '/trade/record?recordId=$orderId');
    await tap(t, find.text('建立付款记录'));
    await confirm(t);
    await waitId(t, () => paymentId != null);
    await control('simulate-payment', {
      'booking_id': bookingId,
      'order_id': orderId,
      'payment_id': paymentId
    });
    await open(t, '/trade/record?recordId=$paymentId');
    await tap(t, find.text('核对这笔付款'));
    await confirm(t);
    await wait(t, find.textContaining('服务器已核实'));
    await control('verify-payment', {
      'booking_id': bookingId,
      'order_id': orderId,
      'payment_id': paymentId
    });
    await control('record', {
      'name': 'native-payment-created-and-reconciled',
      'booking_id': bookingId,
      'order_id': orderId
    });
    await boot(t, 'seller');
    await open(t, '/auditions/booking?bookingId=$bookingId');
    await tap(t, find.text('接受或拒绝本次已付款邀约'));
    await selectChoice(t, '本次接单选择', find.text('明确接受本次预约'));
    final reason = find.widgetWithText(TextFormField, '本次接拒说明');
    await reveal(t, reason);
    await t.enterText(reason, '合成测试接单');
    await tap(t, find.widgetWithText(FilledButton, '接受或拒绝本次邀约'));
    await confirm(t);
    await control('prepare-delivery-protections', {'booking_id': bookingId});
    await open(t, '/auditions/booking?bookingId=$bookingId');
    await tap(t, find.text('提交本次约定取样'));
    final consent = find.byWidgetPredicate((w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == '本人与本次买方的取样授权');
    await tap(t, consent);
    await tap(t, find.byType(DropdownMenuItem<String>).last);
    for (final id in (fixture['photo_ids'] as List).cast<String>()) {
      await tap(t, find.byKey(ValueKey('audition-photos-$id')));
    }
    await tap(
        t, find.byKey(ValueKey('audition-videos-${fixture['video_id']}')));
    loseDelivery = true;
    await tap(t, find.widgetWithText(FilledButton, '提交本次试镜取样'));
    await confirm(t);
    await tap(t, find.text('恢复原请求核对'));
    await wait(t, find.textContaining('取样等待独立审核'));
    expect(keys.length, 2);
    expect(keys[0], keys[1]);
    await control(
        'review-delivery', {'booking_id': bookingId, 'order_id': orderId});
    await boot(t, 'buyer');
    await open(t, '/auditions/booking?bookingId=$bookingId');
    for (var i = 1; i <= 6; i++) {
      await tap(t, find.text('实际读取第$i张取样照片'));
    }
    await tap(t, find.text('实际播放本段取样视频'));
    await tap(t, find.text('我已成功取得本次全部照片和视频，明确确认收讫'));
    await tap(t, find.text('明确确认本次全部取样已收到'));
    await confirm(t);
    await waitId(t, () => receiptOk);
    await frames(t, 5);
    await tap(t, find.text('我已核对本次全部取样和原约定，明确确认完成'));
    await tap(t, find.text('明确确认本次试镜履约完成'));
    await confirm(t);
    await waitId(t, () => confirmOk);
    await control(
        'verify-completion', {'booking_id': bookingId, 'order_id': orderId});
    await control('record', {
      'name': 'native-same-booking-delivery-confirmed',
      'booking_id': bookingId,
      'order_id': orderId
    });
    await control('complete');
  });
}
