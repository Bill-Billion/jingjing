import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import 'supply_models.dart';
import '../pages/login/login_page.dart';

String shortSupplyId(String id) => id.length > 16
    ? '${id.substring(0, 8)}…${id.substring(id.length - 4)}'
    : id;
Widget supplyCard(String title, List<Widget> children) => Card(
    child: Padding(
        padding: const EdgeInsets.all(16),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title,
              style:
                  const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          ...children
        ])));
Widget supplyNote(String text, {bool error = false}) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Text(text,
        style: TextStyle(
            fontSize: 14,
            height: 1.5,
            color: error ? AccountTheme.danger : AccountTheme.muted)));
Widget supplyFact(String label, Object? value) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SizedBox(
          width: 96,
          child: Text(label,
              style: const TextStyle(fontSize: 14, color: AccountTheme.muted))),
      const SizedBox(width: 8),
      Expanded(
          child: SelectableText('${value ?? '—'}',
              style: const TextStyle(fontSize: 14, height: 1.5)))
    ]));
Widget supplyStatus(String status) => Align(
    alignment: Alignment.centerLeft,
    child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
            color: AccountTheme.accent.withValues(alpha: .08),
            borderRadius: BorderRadius.circular(6)),
        child: Text(supplyStatuses[status] ?? status,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AccountTheme.accent))));
Widget supplyScaffold(BuildContext context, String title, List<Widget> children,
        {Widget? action}) =>
    Scaffold(
        appBar: AppBar(
            title: Text(title),
            leading: BackButton(onPressed: () {
              if (Navigator.canPop(context)) {
                Navigator.pop(context);
              } else {
                Navigator.pushReplacementNamed(context, '/account');
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
                          const SizedBox(height: 20)
                        ])))));

/// The key destroys forms, private metadata and delayed callbacks on any scope change.
class SupplyGate extends StatelessWidget {
  const SupplyGate(
      {super.key, required this.builder, this.returnRoute = '/supply'});
  final Widget Function(AccountSession session) builder;
  final String returnRoute;
  @override
  Widget build(BuildContext context) {
    final session = context.watch<AccountSession>();
    final canRead = session.isLoggedIn &&
        session.partyId != null &&
        session.isOwner &&
        !['SUSPENDED', 'CLOSED'].contains(session.party?['current_status']) &&
        !session.supplyAccessDenied;
    return AccountTheme(
        child: canRead
            ? KeyedSubtree(
                key: ValueKey(
                    '${session.epoch}:${session.partyId}:${session.isOwner}:$returnRoute'),
                child: builder(session))
            : Builder(
                builder: (context) => supplyScaffold(context, '作者与作品', [
                      supplyCard('先确认办事身份', [
                        supplyNote(!session.isLoggedIn
                            ? '请先登录，再选择投稿身份。'
                            : session.supplyAccessDenied
                                ? '当前身份的私有资料权限已失效，内容已清空。'
                                : session.partyId == null
                                    ? '请先选择办事身份。'
                                    : !session.isOwner
                                        ? '机构作品与证明仅负责人可以管理。当前成员身份没有私有资料权限。'
                                        : '当前身份暂停或关闭，暂不能管理作品。'),
                        FilledButton(
                            onPressed: () => session.isLoggedIn
                                ? Navigator.pushNamed(context, '/account')
                                : Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                        builder: (_) => LoginPage(
                                            returnRoute: returnRoute))),
                            child: const Text('前往账号与身份')),
                        if (session.supplyAccessDenied)
                          TextButton(
                              onPressed: () async {
                                try {
                                  await session.retrySupplyAccess();
                                } catch (_) {}
                              },
                              child: const Text('重新核对权限')),
                      ])
                    ])));
  }
}
