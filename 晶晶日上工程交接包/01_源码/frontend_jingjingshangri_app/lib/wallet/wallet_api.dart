import '../account/account_session.dart';
import '../account/account_api.dart';
import '../stock/v5_support.dart';
import 'wallet_models.dart';

class WalletApi extends V5Api {
  WalletApi(AccountSession s) : super(s, 'wallet');
  String? recoveryLabel(String path) =>
      switch (path.startsWith(base) ? path.substring(base.length) : '') {
        '/accounts' => '接受规则开户',
        '/check-in' => '每日签到',
        '/recharges' => '本次充值',
        '/earnings/sync' => '原订单晶钻核对',
        '/level-six' => '六级独立资质',
        _ => null
      };
  Future<Map<String, dynamic>> restoreOperation(String path) async {
    if (recoveryLabel(path) == null) {
      throw const AccountError(400, 'INVALID_ACTION');
    }
    final s = path.substring(base.length), p = owner();
    return (await retry(
            s,
            (d) => WalletRecord(d, p,
                kind: s == '/accounts'
                    ? 'ACCOUNT'
                    : s == '/level-six'
                        ? 'LEVEL_REVIEW'
                        : s == '/recharges'
                            ? 'RECHARGE'
                            : 'EARNING'), reread: () async {
      if (s == '/accounts') {
        await rules();
      } else {
        await records(s == '/level-six'
            ? 'LEVEL_REVIEW'
            : s == '/recharges'
                ? 'RECHARGE'
                : 'EARNING');
      }
    }))
        .raw;
  }

  @override
  String owner({bool personal = false}) => super.owner(personal: true);
  Future<List<WalletRule>> rules() =>
      get('/rules', (d) => v5Rows(d['items']).map(WalletRule.new).toList(),
          account: true);
  Future<WalletSummary> summary() => get('/summary', WalletSummary.new);
  Future<V5Page<WalletRecord>> records(String kind, {String? cursor}) {
    final p = owner();
    return get(
        '/records',
        (d) => V5Page.parse(d, (r) => WalletRecord(r, p, kind: kind),
            previous: cursor),
        query: {
          'kind': kind,
          'limit': 20,
          if (cursor != null) 'cursor': cursor
        });
  }

  void validate(Map<String, dynamic> d, {String? kind}) {
    WalletRecord(d, owner(), kind: kind);
  }
}
