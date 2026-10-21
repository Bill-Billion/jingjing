import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../pages/login/login_page.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_widgets.dart';

class OperationsGate extends StatelessWidget {
  const OperationsGate(
      {super.key, required this.builder, this.returnRoute = '/messages'});
  final Widget Function(AccountSession) builder;
  final String returnRoute;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>();
    if (s.isLoggedIn &&
        s.partyId != null &&
        !s.operationsAccessDenied &&
        s.selected?['membership']?['current_status'] == 'ACTIVE' &&
        !['CLOSED', 'SUSPENDED'].contains(s.party?['current_status'])) {
      return KeyedSubtree(
          key: ValueKey('operations:${s.epoch}:${s.partyId}:$returnRoute'),
          child: builder(s));
    }
    return tradeScaffold(context, '业务通知与留言', [
      supplyCard('先确认办事身份', [
        appNotice(s.operationsAccessDenied
            ? '当前权限已失效，私有通知、留言与原请求内容已清空，请重新核对身份。'
            : '登录并选择当前有效的个人或机构身份，查看本人获准业务。通知与已读状态按账号和办事身份分别保存。'),
        tradeButton(
            '前往账号与身份',
            () => s.isLoggedIn
                ? Navigator.pushNamed(context, '/account')
                : Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => LoginPage(returnRoute: returnRoute)))),
        if (s.operationsAccessDenied)
          tradeButton('重新核对权限', () async {
            try {
              await s.retryOperationsAccess();
            } catch (_) {}
          }, outline: true)
      ])
    ]);
  }
}

Widget operationIdFact(String label, String id) => Row(children: [
      Expanded(child: tradeFact(label, '尾号 ${shortSupplyId(id)}')),
      IconButton(
          tooltip: '复制$label',
          onPressed: () => Clipboard.setData(ClipboardData(text: id)),
          icon: const Icon(Icons.copy_outlined, size: 20))
    ]);
void operationClearWarnings(BuildContext context) =>
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..removeCurrentSnackBar();
Widget operationCommentLink(
        BuildContext context, String domain, String id, String title,
        {bool enabled = true, VoidCallback? returned}) =>
    tradeButton(
        title,
        enabled
            ? () => Navigator.pushNamed(
                    context, '/operations/comments?domain=$domain&recordId=$id')
                .then((_) => returned?.call())
            : null,
        outline: true);
