import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../pages/login/login_page.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_widgets.dart';
import 'gig_models.dart';

class GigGate extends StatelessWidget {
  const GigGate(
      {super.key,
      required this.builder,
      this.returnRoute = '/gigs',
      this.owner = true,
      this.embedded = false});
  final Widget Function(AccountSession) builder;
  final String returnRoute;
  final bool owner, embedded;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>();
    final allowed = s.isLoggedIn &&
        !s.gigsAccessDenied &&
        (!owner ||
            s.partyId != null &&
                s.isOwner &&
                s.selected?['membership']?['current_status'] == 'ACTIVE' &&
                !['SUSPENDED', 'CLOSED'].contains(s.party?['current_status']));
    if (allowed) {
      return KeyedSubtree(
          key: ValueKey('${s.epoch}:${s.partyId}:$returnRoute'),
          child: builder(s));
    }
    final children = [
      supplyCard('先确认办事身份', [
        supplyNote(!s.isLoggedIn
            ? '登录后查看已发布商单；选择负责人身份办理自己的商单与合作。'
            : s.gigsAccessDenied
                ? '当前记录权限已失效，私有内容已清空。请重新核对身份。'
                : '普通商单业务需要当前有效的个人或机构负责人身份。MCN 服务授权不能替代本人确认或独立审核。'),
        tradeButton(
            '前往账号与身份',
            () => s.isLoggedIn
                ? Navigator.pushNamed(context, '/account')
                : Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => LoginPage(returnRoute: returnRoute)))),
        if (s.gigsAccessDenied)
          tradeButton('重新核对权限', () async {
            try {
              await s.retryGigsAccess();
            } catch (_) {}
          }, outline: true)
      ])
    ];
    return embedded
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.stretch, children: children)
        : tradeScaffold(context, '商单与合作', children);
  }
}

Widget gigHeading(String title) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Text(title,
        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)));
Widget gigParagraph(String value) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: SelectableText(value,
        style: const TextStyle(fontSize: 16, height: 1.6)));
Widget gigStatus(GigRecord r) => tradeBanner(
    gigStatuses[r.status] ?? r.status,
    r.kind == 'OFFER'
        ? '接单约定的确认不代表付款；正式报价仍须审核，再由买方确认生成订单。'
        : r.kind == 'RELATION'
            ? '仅双方直接合作；范围、期间、排他与佣金按原约定办理。'
            : r.kind == 'COMMISSION'
                ? '仅佣金计提与待记账记录；没有出款、提现或税务办理接入。'
                : '审核与业务状态以本次服务器读取为准。');
Widget gigCommissionFacts(Map<String, dynamic> d) =>
    Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      tradeFact('平台费用', gigPercent(d['platform_bps'])),
      tradeFact('MCN 分成', gigPercent(d['mcn_bps'])),
      supplyNote('MCN 分成从平台费用中计提，不额外向服务提供方扣取。')
    ]);
Widget gigScopeFacts(Map<String, dynamic> d) =>
    Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      tradeFact('用途', '商业用途'),
      tradeFact('适用地区', d['territory']),
      tradeFact('有效截止', tradeDate(d['valid_until']))
    ]);
Widget gigTextField(TextEditingController c, String label,
        {int lines = 1,
        int max = 8000,
        bool enabled = true,
        ValueChanged<String>? changed}) =>
    Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: TextField(
            controller: c,
            enabled: enabled,
            maxLines: lines,
            maxLength: max,
            decoration: InputDecoration(labelText: label),
            onChanged: changed));
String gigSignedMoney(int minor) =>
    '${minor < 0 ? '-' : '+'}¥${minor.abs() ~/ 100}.${(minor.abs() % 100).toString().padLeft(2, '0')}';
