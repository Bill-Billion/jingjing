import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../pages/login/login_page.dart';
import '../supply/supply_widgets.dart';
import 'trade_models.dart';

Widget tradeScaffold(BuildContext context, String title, List<Widget> children,
        {bool locked = false, Widget? footer}) =>
    PopScope(
        canPop: !locked,
        onPopInvokedWithResult: (didPop, result) {
          if (!didPop && locked) {
            ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('操作结果尚未确认，请先恢复原请求核对。')));
          }
        },
        child: AccountTheme(
            child: Scaffold(
                bottomNavigationBar: footer == null
                    ? null
                    : SafeArea(
                        top: false,
                        child: Padding(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                            child: footer)),
                appBar: AppBar(
                    title: Text(title),
                    leading: BackButton(onPressed: () {
                      if (locked) {
                        ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                                content: Text('操作结果尚未确认，请先恢复原请求核对。')));
                        return;
                      }
                      if (Navigator.canPop(context)) {
                        Navigator.pop(context);
                      } else {
                        Navigator.pushReplacementNamed(context, '/my');
                      }
                    })),
                body: SafeArea(
                    child: Center(
                        child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 760),
                            child: ListView(
                                padding: const EdgeInsets.all(16),
                                children: [
                                  ...children,
                                  const SizedBox(height: 24)
                                ])))))));

class TradeGate extends StatelessWidget {
  const TradeGate(
      {super.key, required this.builder, this.returnRoute = '/orders'});
  final Widget Function(AccountSession) builder;
  final String returnRoute;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>();
    final allowed = s.isLoggedIn &&
        s.partyId != null &&
        s.isOwner &&
        s.selected?['membership']?['current_status'] == 'ACTIVE' &&
        !s.tradeAccessDenied &&
        !['SUSPENDED', 'CLOSED'].contains(s.party?['current_status']);
    return allowed
        ? KeyedSubtree(
            key: ValueKey('${s.epoch}:${s.partyId}:$returnRoute'),
            child: builder(s))
        : tradeScaffold(context, '订单与报价', [
            supplyCard('先确认办事身份', [
              supplyNote(!s.isLoggedIn
                  ? '登录后选择负责人身份，查看自己的报价、订单与付款记录。'
                  : s.tradeAccessDenied
                      ? '当前记录权限已失效，私有内容已清空。请重新核对当前身份。'
                      : '请先选择有效的个人或机构负责人身份。'),
              FilledButton(
                  onPressed: () => s.isLoggedIn
                      ? Navigator.pushNamed(context, '/account')
                      : Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) =>
                                  LoginPage(returnRoute: returnRoute))),
                  child: const Text('前往账号与身份')),
              if (s.tradeAccessDenied)
                TextButton(
                    onPressed: () async {
                      try {
                        await s.retryTradeAccess();
                      } catch (_) {}
                    },
                    child: const Text('重新核对权限')),
            ])
          ]);
  }
}

Widget tradeFact(String label, Object? value, {bool accent = false}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 10),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(
          flex: 2,
          child: Text(label,
              style: const TextStyle(fontSize: 16, color: AccountTheme.muted))),
      const SizedBox(width: 12),
      Expanded(
          flex: 3,
          child: SelectableText('${value ?? '—'}',
              style: TextStyle(
                  fontSize: 16,
                  height: 1.5,
                  color: accent ? AccountTheme.accent : AccountTheme.text,
                  fontWeight: accent ? FontWeight.w600 : FontWeight.normal)))
    ]));
Widget tradeBanner(String title, String body,
        {IconData icon = Icons.hourglass_empty}) =>
    Card(
        color: AccountTheme.accent.withValues(alpha: .06),
        child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, color: AccountTheme.accent, size: 40),
              const SizedBox(width: 16),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                    Text(title,
                        style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    Text(body,
                        style: const TextStyle(
                            fontSize: 16,
                            height: 1.6,
                            color: AccountTheme.muted))
                  ]))
            ])));
Widget tradeStatus(TradeRecord r) =>
    appNotice(tradeStatuses[r.status] ?? r.status);
Widget tradeButton(String label, VoidCallback? action,
        {bool outline = false}) =>
    Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: outline
            ? OutlinedButton(onPressed: action, child: Text(label))
            : FilledButton(onPressed: action, child: Text(label)));
Future<bool> tradeConfirm(
        BuildContext context, String title, List<Widget> facts) =>
    showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
                title: Text(title),
                content: SingleChildScrollView(
                    child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: facts)),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: const Text('返回核对')),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: const Text('确认办理'))
                ])).then((v) => v == true);
String tradeDate(dynamic v) =>
    DateTime.tryParse('$v')?.toLocal().toString().split('.').first ?? '$v';
