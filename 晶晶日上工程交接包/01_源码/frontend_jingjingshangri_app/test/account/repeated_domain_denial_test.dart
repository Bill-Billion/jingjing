import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'fake_account_api.dart';

void main() {
  test('后台栏目重复403只失效一次，其它业务读取可以完成', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (o) => o.path.endsWith('/catalog')
            ? envelope({'code': 'FORBIDDEN'}, status: 403, error: true)
            : adapter.defaultReply(o));
    final session = await buyerSession(adapter);
    var notices = 0;
    session.addListener(() => notices++);
    final initial = session.epoch;
    await expectLater(
        session.read('/api/v1/stock/catalog'), throwsA(isA<AccountError>()));
    final denied = session.epoch;
    expect(denied, initial + 1);
    expect(session.stockAccessDenied, true);
    final pending = session.read('/api/v1/me');
    for (var i = 0; i < 3; i++) {
      await expectLater(
          session.read('/api/v1/stock/catalog'), throwsA(isA<AccountError>()));
    }
    await pending;
    expect(session.epoch, denied);
    expect(notices, 1);
    await expectLater(
        session.read('/api/v1/notices/catalog'), throwsA(isA<AccountError>()));
    expect(session.epoch, denied + 1);
    await expectLater(
        session.read('/api/v1/notices/catalog'), throwsA(isA<AccountError>()));
    expect(session.epoch, denied + 1);
    expect(notices, 2);
  });
}
