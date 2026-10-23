import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../pages/login/login_page.dart';
import '../supply/supply_widgets.dart';
import 'trade_models.dart';
import '../contracts/contract_text.dart';

Widget tradeScaffold(BuildContext context, String title, List<Widget> children,
        {bool locked = false,
        Widget? footer,
        VoidCallback? onBack,
        String lockedMessage = '操作结果尚未确认，请先恢复原请求核对。'}) =>
    PopScope(
        canPop: !locked,
        onPopInvokedWithResult: (didPop, result) {
          if (!didPop && locked) {
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text(lockedMessage)));
          }
        },
        child: AccountTheme(
            child: Scaffold(
                bottomNavigationBar: footer == null
                    ? null
                    : DecoratedBox(
                        decoration: const BoxDecoration(
                            color: AccountTheme.canvas,
                            border: Border(
                                top: BorderSide(color: AccountTheme.border))),
                        child: SafeArea(
                            top: false,
                            child: Center(
                                heightFactor: 1,
                                child: ConstrainedBox(
                                    constraints:
                                        const BoxConstraints(maxWidth: 560),
                                    child: Padding(
                                        padding: const EdgeInsets.fromLTRB(
                                            18, 10, 18, 12),
                                        child: SizedBox(
                                            width: double.infinity,
                                            child: footer)))))),
                appBar: AppBar(
                    title: Text(title),
                    leading: BackButton(onPressed: () {
                      if (onBack != null) {
                        onBack();
                        return;
                      }
                      if (locked) {
                        ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(lockedMessage)));
                        return;
                      }
                      if (Navigator.canPop(context)) {
                        Navigator.pop(context);
                      } else {
                        Navigator.pushReplacementNamed(context, '/my');
                      }
                    })),
                body: SafeArea(
                    child:
                        Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 560), child: ListView(padding: const EdgeInsets.fromLTRB(18, 20, 18, 0), children: [...children, const SizedBox(height: 24)])))))));

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
            tradeSection('先确认办事身份', [
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

Widget tradeHeading(String title, {String? eyebrow}) => Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (eyebrow != null) ...[
        Text(eyebrow,
            style: const TextStyle(
                fontSize: 12, color: AccountTheme.accent, height: 1.5)),
        const SizedBox(height: 14),
      ],
      Semantics(
          header: true,
          child: Text(title,
              style: const TextStyle(
                  fontFamily: 'EditorialSerif',
                  fontSize: 32,
                  height: 1.25,
                  fontWeight: FontWeight.w700))),
    ]));

/// Paper sections follow the ruled, card-free layout of the film editorial.
Widget tradeSection(String title, List<Widget> children) => Container(
    margin: const EdgeInsets.only(bottom: 8),
    padding: const EdgeInsets.symmetric(vertical: 18),
    decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AccountTheme.border))),
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(title,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      const SizedBox(height: 12),
      ...children,
    ]));

Widget tradeFact(String label, Object? value, {bool accent = false}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(
          flex: 2,
          child: Text(label,
              style: const TextStyle(fontSize: 14, color: AccountTheme.muted))),
      const SizedBox(width: 12),
      Expanded(
          flex: 3,
          child: SelectableText('${value ?? '—'}',
              style: TextStyle(
                  fontSize: 14,
                  height: 1.5,
                  color: accent ? AccountTheme.accent : AccountTheme.text,
                  fontWeight: accent ? FontWeight.w600 : FontWeight.normal)))
    ]));
Widget tradeBanner(String title, String body,
        {IconData icon = Icons.hourglass_empty}) =>
    Container(
        margin: const EdgeInsets.only(bottom: 18),
        color: AccountTheme.text,
        child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, color: AccountTheme.accent, size: 20),
              const SizedBox(width: 12),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                    Text(title,
                        style: const TextStyle(
                            color: AccountTheme.canvas,
                            fontSize: 16,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    Text(body,
                        style: const TextStyle(
                            fontSize: 14,
                            height: 1.6,
                            color: Color(0xFFD9D5CB)))
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

List<Widget> tradeSpecificationFacts(Map<String, dynamic> spec) {
  if (spec['stock_license'] is Map) {
    final license = spec['stock_license'];
    return [
      tradeFact('许可用途', '仅买方本人非商业使用，可在个人社交账号分享'),
      tradeFact('地区 / 期限', '全球 / 永久；非独家'),
      tradeFact('确认期限', '${license['acceptance_hours']} 小时；从明确收讫后起算'),
      tradeFact('售后约定', license['aftercare_terms']),
      appNotice('商业广告、改编、发行、单独声音使用、再次AI生成、源文件及模型、新数字人内容和独家买断均须另行办理。'),
    ];
  }
  if (spec['audition'] is Map) {
    final terms = spec['audition'];
    return [
      tradeFact('接单时限', '${terms['accept_hours']} 小时'),
      tradeFact(
          '约定材料', '${terms['photo_count']} 张照片 / ${terms['video_count']} 段视频'),
      tradeFact('明确收讫后确认期限', '${terms['acceptance_hours']} 小时'),
      tradeFact('付款窗口', '${terms['payment_window_minutes']} 分钟'),
      ContractText(value: terms['terms']),
      if (spec['additional_terms'] != null)
        ContractText(value: spec['additional_terms']),
      appNotice('此订单仅为试镜服务，不授予演出、数字人生产或商业代言权利。'),
    ];
  }
  if (spec.length == 2 && spec['version'] != null && spec['terms'] != null) {
    return [tradeFact('本次允许用途', spec['terms'])];
  }
  final service = spec['service'];
  if (service is! Map) {
    return [
      tradeFact('样片 / 成片',
          '${spec['sample_seconds']} 秒 / ${spec['final_seconds']} 秒'),
      tradeFact('修改次数', spec['revision_limit']),
      if (spec['customization_delivery'] != null) ...[
        tradeFact(
            '预览与中间付款顺序',
            spec['customization_delivery']['preview_payment_order'] ==
                    'PREVIEW_BEFORE_INTERIM'
                ? '正式预览确认后，按原订单补款'
                : '沿用本单先中间付款、再预览的历史约定'),
        tradeFact('明确收讫后的原约定期限',
            '${spec['customization_delivery']['acceptance_hours']} 小时'),
        tradeFact('取消约定', spec['customization_delivery']['cancellation_terms']),
      ]
    ];
  }
  return [
    tradeFact('服务对象', artistServiceNames[service['kind']]),
    if (service['hosting_months'] != null)
      tradeFact(
          '托管月数', '${service['hosting_months']} 个月；首次核实收款后起算，续期接已有期限，以服务记录为准'),
    if (service['halo_level'] != null)
      tradeFact('认证审核', 'L${service['halo_level']}；付费不等于审核通过'),
    if (service['kind'] == 'AVATAR_CREATION')
      tradeFact('约定重试', '${service['retry_limit']} 次；档案交付不代表长期模型训练成功'),
    tradeFact('未交付处理', '按原订单办理未交付退款，待退款与到账分别核对'),
    tradeFact(
        '服务规则 / 来源', '${service['rule_version']} / ${service['source_ref']}'),
  ];
}

List<Widget> tradeArtistFacts(Map<String, dynamic> source) => [
      tradeFact('服务', artistServiceNames[source['kind']]),
      tradeFact('真人档案', source['person_id']),
      tradeFact('具体数字人', source['avatar_id'] ?? '认证申请不绑定数字人'),
      tradeFact('原服务请求', source['service_id']),
    ];
