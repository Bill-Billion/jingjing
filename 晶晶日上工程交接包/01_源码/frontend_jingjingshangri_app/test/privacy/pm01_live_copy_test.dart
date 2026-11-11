// Executed only by the isolated PM01 browser runner; no paid SMS or production.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/privacy/privacy_pages.dart';
import '../account/fake_account_api.dart';
import '../customization/customization_attachment_page_test.dart'
    show usePicker;
import '../stock/v5_test_host.dart';

class LoopbackHttp extends HttpOverrides {}

void main() {
  final file = Platform.environment['JX_PM01_APP_FIXTURE'];
  testWidgets('同一隔离库 App 提出申请并领取网页独审文件', (t) async {
    final fixture =
        jsonDecode(File(file!).readAsStringSync()) as Map<String, dynamic>;
    final base = Uri.parse(fixture['base']);
    expect(base.host, '127.0.0.1');
    final requests = <Map<String, dynamic>>[];
    final client =
        HttpOverrides.runWithHttpOverrides(() => HttpClient(), LoopbackHttp());
    addTearDown(() => client.close(force: true));
    Map<String, dynamic>? created;
    final adapter = FakeAccountAdapter(handler: (r) async {
      if (r.path.endsWith('/auth/sessions')) {
        return envelope({
          'access_token': fixture['token'],
          'token_type': 'Bearer',
          'account': {'id': fixture['account_id'], 'display_name': '合成验收本人'}
        });
      }
      final uri = base.resolve(r.path).replace(
          queryParameters: r.queryParameters.isEmpty
              ? null
              : r.queryParameters.map((k, v) => MapEntry(k, '$v')));
      final req = await client.openUrl(r.method, uri);
      req.persistentConnection = false;
      r.headers.forEach((k, v) {
        if (v != null) req.headers.set(k, v);
      });
      if (r.data != null) {
        req.headers.contentType = ContentType.json;
        req.write(jsonEncode(r.data));
      }
      final response = await req.close();
      final bytes = await response.fold<List<int>>([], (a, b) => a..addAll(b));
      requests.add(
          {'method': r.method, 'path': r.path, 'status': response.statusCode});
      if (r.method == 'POST' &&
          r.path == '/api/v1/privacy/requests' &&
          response.statusCode == 200) {
        created = jsonDecode(utf8.decode(bytes))['data'];
      }
      final headers = <String, List<String>>{};
      response.headers.forEach((k, v) => headers[k] = v);
      return ResponseBody.fromBytes(
          Uint8List.fromList(bytes), response.statusCode,
          headers: headers);
    });
    final session = AccountSession(api: adapter.createApi());
    await t
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    Future<void> settle() async {
      for (var i = 0; i < 15; i++) {
        await t.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 80)));
        await t.pump(const Duration(milliseconds: 100));
      }
    }

    final phase = fixture['phase'];
    final picker = usePicker();
    await host(
        t,
        session,
        PrivacyPage(
            view: phase == 'create' ? 'new' : 'request',
            recordId: fixture['request_id']));
    await settle();
    if (phase == 'create') {
      final select = find.byWidgetPredicate((w) =>
          w is DropdownButtonFormField<String> &&
          w.decoration.labelText == '希望办理的事项');
      t.widget<DropdownButtonFormField<String>>(select).onChanged!('COPY');
      await t.pump();
      final all = find.text('全部相关资料');
      await reveal(t, all);
      await t.tap(all);
      await t.pump();
      final details = find.byWidgetPredicate(
          (w) => w is TextField && w.decoration?.labelText == '具体说明');
      await reveal(t, details);
      await t.enterText(details, '合成验收：由 App 提出同申请，网页整理账户与原订单，其他项目保留待办。');
      final button = find.text('提交本次申请');
      await reveal(t, button);
      await t.tap(button);
      await settle();
      expect(created, isNotNull);
      await t.runAsync(() => File(fixture['output']).writeAsString(jsonEncode(
          {'phase': phase, 'request': created, 'requests': requests})));
    } else {
      final button = find.text('领取这份审核答复附件').first;
      await reveal(t, button);
      await t.tap(button);
      await settle();
      expect(picker.saved.length, 1);
      final bytes = picker.saved.single;
      expect(sha256.convert(bytes).toString(), fixture['sha256']);
      final bundle = jsonDecode(utf8.decode(bytes));
      expect(bundle['request_id'], fixture['request_id']);
      await t.runAsync(() => File(fixture['output']).writeAsString(jsonEncode({
            'phase': phase,
            'request_id': fixture['request_id'],
            'sha256': sha256.convert(bytes).toString(),
            'byte_size': bytes.length,
            'requests': requests
          })));
    }
    expect(t.takeException(), isNull);
    client.close(force: true);
    await t.pumpWidget(const SizedBox.shrink());
    await t.pumpAndSettle();
  }, skip: file == null);
}
