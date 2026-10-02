import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/licensing/license_api.dart';
import 'package:jingjingshangri_app/licensing/license_models.dart';
import '../account/fake_account_api.dart';
import '../contracts/contract_fixtures.dart';
import 'license_fixtures.dart';

void main() {
  test('所有已实现记录按接口校验，拒绝越权、缺失价格、金额浮点和非人工结果', () {
    for (final kind in [
      'PRODUCT',
      'RESERVATION',
      'GRANT',
      'PROJECT',
      'BINDING',
      'READING'
    ]) {
      expect(LicenseRecord.parse(licenseData(kind), orgId).kind, kind);
    }
    for (final bad in [
      licenseData('PRODUCT')..['data']['price']['amount_minor'] = 1.5,
      licenseData('PRODUCT')..['data'].remove('payment_due_minor'),
      licenseData('GRANT')..['owner_party_id'] = productId,
      licenseData('READING')..['data']['allows_generation'] = true
    ]) {
      expect(
          () => LicenseRecord.parse(bad, orgId), throwsA(isA<AccountError>()));
    }
    expect(licenseMoney({'currency': 'CNY', 'amount_minor': 12345}), '¥123.45');
    expect(licenseMoney({'currency': 'CNY', 'amount_minor': 9007199254740991}),
        '¥90071992547409.91');
    expect(
        licenseMoney({'currency': 'ZZZ', 'amount_minor': 1}), 'ZZZ 1（最小币种单位）');
  });
  test('目录分页仅用约定身份头，不加被跨域拒绝的缓存头，循环cursor拒绝', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/records')
            ? envelope({
                'items': [licenseData('PRODUCT')],
                'next_cursor':
                    r.queryParameters['cursor'] == null ? projectId : projectId
              })
            : adapter.defaultReply(r));
    final api = LicenseApi(await contractSession(adapter));
    expect((await api.page('PRODUCT', catalog: true)).items.single.title,
        '回到那年夏天');
    await expectLater(api.page('PRODUCT', catalog: true, cursor: projectId),
        throwsA(isA<AccountError>()));
    final request = adapter.requests.last;
    expect(request.headers['X-Acting-Party'], orgId);
    expect(request.headers.containsKey('Cache-Control'), isFalse);
    expect(request.queryParameters['catalog'], 'true');
  });
  test('未知绑定保存同一body、key、If-Match，412后必须读取新版本再确认', () async {
    var writes = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/bindings')) {
        writes++;
        return writes == 1
            ? envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                status: 503, error: true)
            : writes == 2
                ? envelope({'code': 'VERSION_CONFLICT'},
                    status: 412, error: true)
                : envelope(licenseData('BINDING'));
      }
      return adapter.defaultReply(r);
    });
    final api = LicenseApi(await contractSession(adapter)),
        path = '/api/v1/licensing/grants/$grantId/bindings';
    await expectLater(
        api.write(path, {'project_id': projectId}, version: 2, kind: 'BINDING'),
        throwsA(isA<AccountError>()));
    await expectLater(api.write(path, {'project_id': readingId}, version: 2),
        throwsA(isA<AccountError>()));
    expect(writes, 1);
    await expectLater(
        api.retry(path, kind: 'BINDING'), throwsA(isA<AccountError>()));
    expect(api.pending(path), isNull);
    await api.write(path, {'project_id': projectId},
        version: 3, kind: 'BINDING');
    final calls = adapter.requests.where((r) => r.path == path).toList();
    expect(calls[0].headers['Idempotency-Key'],
        calls[1].headers['Idempotency-Key']);
    expect(calls[0].headers['If-Match'], '"2"');
    expect(calls[1].headers['If-Match'], '"2"');
    expect(calls[2].headers['If-Match'], '"3"');
    expect(calls[2].headers['Idempotency-Key'],
        isNot(calls[0].headers['Idempotency-Key']));
  });
  test('写入2xx字段校验失败仍锁定原操作，不把响应成功当办理成功', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/reservations')
            ? envelope(licenseData('RESERVATION')
              ..['data']['contract']['rule_contents'] = [])
            : adapter.defaultReply(r));
    final api = LicenseApi(await contractSession(adapter));
    await expectLater(
        api.write('/api/v1/licensing/reservations', {'product_id': productId},
            kind: 'RESERVATION'),
        throwsA(isA<AccountError>()));
    expect(api.pending('/api/v1/licensing/reservations'), isNotNull);
  });
  test('切换身份使迟到读写失效，旧身份pending不重新进入', () async {
    final completer = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/reservations')
            ? completer.future
            : adapter.defaultReply(r));
    final session = await contractSession(adapter), api = LicenseApi(session);
    final operation = api.write(
        '/api/v1/licensing/reservations', {'product_id': productId},
        kind: 'RESERVATION');
    final assertion = expectLater(
        operation,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    await Future<void>.delayed(Duration.zero);
    session.select(identity(personId));
    completer.complete(
        envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'}, status: 503, error: true));
    await assertion;
    session.select(identity(orgId));
    expect(api.pending('/api/v1/licensing/reservations'), isNull);
  });
  test('403立刻清空许可权限并废弃同时进行的迟到响应', () async {
    final completer = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith(readingId)
            ? completer.future
            : r.path.endsWith(grantId)
                ? envelope({'code': 'LICENSE_PARTY_FORBIDDEN'},
                    status: 403, error: true)
                : adapter.defaultReply(r));
    final session = await contractSession(adapter), api = LicenseApi(session);
    final old = api.record(readingId);
    final assertion = expectLater(old, throwsA(isA<AccountError>()));
    await expectLater(api.record(grantId), throwsA(isA<AccountError>()));
    expect(session.licensingAccessDenied, isTrue);
    completer.complete(envelope(licenseData('READING')));
    await assertion;
  });
  test('阅读仅指定本人身份、未到期获批记录；正文只能水印纯文本', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/content')
            ? envelope({
                'record_id': readingId,
                'watermarked_text':
                    '读者水印 | $accountId | $readingId | 2026-09-30T00:00:00.000Z\n<script>恶意文本仍然是正文</script>',
                'allows_generation': false
              })
            : adapter.defaultReply(r));
    final api = LicenseApi(await contractSession(adapter));
    final r = LicenseRecord.parse(licenseData('READING'), orgId);
    expect(await api.reading(r), contains('<script>'));
    for (final bad in [
      licenseData('READING', status: 'REVOKED'),
      licenseData('READING')
        ..['data']['valid_until'] = '2020-01-01T00:00:00.000Z',
      licenseData('READING')..['data']['reader_account_id'] = personId
    ]) {
      await expectLater(api.reading(LicenseRecord.parse(bad, orgId)),
          throwsA(isA<AccountError>()));
    }
    expect(adapter.requests.where((r) => r.path.endsWith('/content')),
        hasLength(1));
  });
}
