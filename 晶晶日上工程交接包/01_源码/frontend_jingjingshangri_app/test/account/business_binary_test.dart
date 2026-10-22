import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'fake_account_api.dart';

void main() {
  test('现货受控内容接受MP4，其他域与可执行类型仍拒绝', () async {
    var type = 'video/mp4';
    final api = FakeAccountAdapter(
        handler: (_) => ResponseBody.fromBytes([0, 1, 2], 200,
            headers: {
              Headers.contentTypeHeader: [type]
            })).createApi();
    for (final path in [
      '/api/v1/stock/catalog/$personId/preview',
      '/api/v1/stock/listings/$personId/files/full',
      '/api/v1/stock/purchases/$personId/content',
    ]) {
      expect(await api.readBytes(path, token: 'synthetic'), [0, 1, 2]);
    }
    await expectLater(
        api.readBytes('/api/v1/privacy/requests/$personId/attachments',
            token: 'synthetic'),
        throwsA(isA<AccountError>()));
    type = 'text/html';
    await expectLater(
        api.readBytes('/api/v1/stock/purchases/$personId/content',
            token: 'synthetic'),
        throwsA(isA<AccountError>()));
  });
  test('已核实充值接入拒绝不挂未知待办；其他托管503仍保持原请求', () async {
    final api = FakeAccountAdapter(
        handler: (_) => envelope({'code': 'CUSTODY_PROVIDER_NOT_CONNECTED'},
            status: 503, error: true)).createApi();
    await expectLater(
        api.request('POST', '/api/v1/wallet/recharges',
            token: 'synthetic', party: personId, body: {'amount_minor': 100}),
        throwsA(isA<AccountError>()
            .having((e) => e.uncertain, 'uncertain', false)));
    expect(
        api.pendingForPrefix('/api/v1/wallet/',
            token: 'synthetic', party: personId),
        isEmpty);
    await expectLater(
        api.request('POST', '/api/v1/trade/payments',
            token: 'synthetic', party: personId, body: {}),
        throwsA(
            isA<AccountError>().having((e) => e.uncertain, 'uncertain', true)));
    expect(
        api.pendingForPrefix('/api/v1/trade/',
            token: 'synthetic', party: personId),
        hasLength(1));
  });
}
