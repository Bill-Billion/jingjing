import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../pages/login/login_page.dart';
import '../supply/supply_widgets.dart';
import 'license_models.dart';

Widget licenseScaffold(
        BuildContext context, String title, List<Widget> children) =>
    AccountTheme(
        child: Scaffold(
            appBar: AppBar(
                title: Text(title),
                leading: BackButton(onPressed: () {
                  if (Navigator.canPop(context)) {
                    Navigator.pop(context);
                  } else {
                    Navigator.pushReplacementNamed(context, '/enter');
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
                            ]))))));

class LicenseGate extends StatelessWidget {
  const LicenseGate(
      {super.key,
      required this.builder,
      this.returnRoute = '/licensing',
      this.embedded = false});
  final Widget Function(AccountSession) builder;
  final String returnRoute;
  final bool embedded;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>();
    final allowed = s.isLoggedIn &&
        s.partyId != null &&
        s.isOwner &&
        s.selected?['membership']?['current_status'] == 'ACTIVE' &&
        !s.licensingAccessDenied &&
        !['SUSPENDED', 'CLOSED'].contains(s.party?['current_status']);
    if (allowed) {
      return KeyedSubtree(
          key: ValueKey('${s.epoch}:${s.partyId}:$returnRoute'),
          child: builder(s));
    }
    final content = [
      supplyCard('先确认办事身份', [
        supplyNote(!s.isLoggedIn
            ? '登录后选择办事身份，查看剧本和自己的许可。'
            : s.licensingAccessDenied
                ? '当前许可权限已失效，私有内容已清空。'
                : !s.isOwner
                    ? '当前成员没有许可办理和私有阅稿权限，请使用负责人身份。'
                    : '请先选择有效的个人或机构负责人身份。'),
        FilledButton(
            onPressed: () => s.isLoggedIn
                ? Navigator.pushNamed(context, '/account')
                : Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => LoginPage(returnRoute: returnRoute))),
            child: const Text('前往账号与身份')),
        if (s.licensingAccessDenied)
          TextButton(
              onPressed: () async {
                try {
                  await s.retryLicensingAccess();
                } catch (_) {}
              },
              child: const Text('重新核对权限')),
      ])
    ];
    return embedded
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.stretch, children: content)
        : licenseScaffold(context, '剧本与许可', content);
  }
}

Widget licenseTermsView(LicenseTerms terms) {
  final d = terms.data;
  return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    supplyCard('权利范围', [
      supplyFact('许可', terms.summary),
      supplyFact('地域 / 语言',
          '${(d['territories'] as List).map((v) => licenseCountries[v] ?? v).join('、')} / ${(d['languages'] as List).map((v) => licenseLanguages[v] ?? v).join('、')}'),
      appNotice('仅包含明确列出的权利。独家不自动包含发行，阅稿不授予生成或训练。'),
    ]),
    supplyCard('期限与额度', [
      supplyFact('许可开始', licenseDate(d['valid_from'])),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: _termDate('开发至', licenseDate(d['development_until']))),
        Container(width: 1, height: 48, color: AccountTheme.border),
        const SizedBox(width: 16),
        Expanded(child: _termDate('有效至', licenseDate(d['valid_until']))),
      ]),
      const SizedBox(height: 16),
      supplyFact(
          '项目 / 集数额度', '${d['project_limit']} 个项目 / ${d['episode_limit']} 集'),
    ]),
    Card(
        child: ExpansionTile(
            title: const Text('完整许可条款',
                style: TextStyle(fontWeight: FontWeight.w600)),
            childrenPadding: const EdgeInsets.all(16),
            children: [
          SelectableText(d['terms_text'], style: const TextStyle(height: 1.7))
        ])),
  ]);
}

Widget _termDate(String label, String value) =>
    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label,
          style: const TextStyle(fontSize: 14, color: AccountTheme.muted)),
      const SizedBox(height: 6),
      Text(value, style: const TextStyle(fontSize: 16, height: 1.4)),
    ]);

Widget licenseGrantTerms(LicenseTerms terms) {
  final d = terms.data;
  return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    supplyCard('权利与用途', [
      supplyFact('权利',
          (d['rights'] as List).map((v) => licenseRights[v] ?? v).join('、')),
      supplyFact(
          '用途',
          (d['purposes'] as List)
              .map((v) => licensePurposes[v] ?? v)
              .join('、')),
      supplyFact('独家性', d['exclusive'] == true ? '独家' : '非独家'),
    ]),
    supplyCard('范围与期限', [
      supplyFact('地域 / 语言',
          '${(d['territories'] as List).map((v) => licenseCountries[v] ?? v).join('、')} / ${(d['languages'] as List).map((v) => licenseLanguages[v] ?? v).join('、')}'),
      supplyFact('开发截止', licenseDate(d['development_until'])),
      supplyFact('有效截止', licenseDate(d['valid_until'])),
      supplyFact('许可开始', licenseDate(d['valid_from'])),
    ]),
    supplyCard('项目与集数约定', [
      supplyFact('额度', '${d['project_limit']} 个项目 / ${d['episode_limit']} 集')
    ]),
    Card(
        child: ExpansionTile(
            title: const Text('完整许可条款',
                style: TextStyle(fontWeight: FontWeight.w600)),
            childrenPadding: const EdgeInsets.all(16),
            children: [
          SelectableText(d['terms_text'],
              style: const TextStyle(fontSize: 14, height: 1.7))
        ])),
  ]);
}

Widget licenseAmount(Map<String, dynamic> price, {int? due}) => Card(
    child: Padding(
        padding: const EdgeInsets.all(16),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: _amount('总价', licenseMoney(price))),
            if (due != null) ...[
              Container(width: 1, height: 56, color: AccountTheme.border),
              const SizedBox(width: 16),
              Expanded(
                  child: _amount('生效前应付', licenseMoney(price, amount: due))),
            ],
          ]),
          const SizedBox(height: 16),
          supplyNote('许可费用不等于整片制作费用。签署与付款由真实外部材料经独立人员核验。'),
        ])));

Widget _amount(String label, String value) =>
    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label,
          style: const TextStyle(fontSize: 14, color: AccountTheme.muted)),
      const SizedBox(height: 6),
      Text(value,
          style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: AccountTheme.accent,
              height: 1.3)),
    ]);
Future<bool> licenseConfirm(
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
