import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../pages/login/login_page.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_widgets.dart';
import 'project_models.dart';

class ProjectsGate extends StatelessWidget {
  const ProjectsGate(
      {super.key,
      required this.builder,
      this.owner = true,
      this.embedded = false,
      this.returnRoute = '/projects'});
  final Widget Function(AccountSession) builder;
  final bool owner, embedded;
  final String returnRoute;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>();
    final allowed = s.isLoggedIn &&
        !s.projectsAccessDenied &&
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
        appNotice(!s.isLoggedIn
            ? '登录后查看公开招募项目。选择当前有效的负责人身份，办理本人报名、入组与版本确认。'
            : s.projectsAccessDenied
                ? '当前记录权限已失效，私有内容已清空。请重新核对身份。'
                : '请选择有效的个人或机构负责人身份。'),
        tradeButton(
            '前往账号与身份',
            () => s.isLoggedIn
                ? Navigator.pushNamed(context, '/account')
                : Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => LoginPage(returnRoute: returnRoute)))),
        if (s.projectsAccessDenied)
          tradeButton('重新核对权限', () async {
            try {
              await s.retryProjectsAccess();
            } catch (_) {}
          }, outline: true)
      ])
    ];
    return embedded
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.stretch, children: children)
        : tradeScaffold(context, '项目与发行', children);
  }
}

Widget projectParagraph(String value) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: SelectableText(value,
        style: const TextStyle(fontSize: 16, height: 1.6)));
Widget projectHeading(String value) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Text(value,
        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)));
Widget projectScopeFacts(Map<String, dynamic> d) =>
    Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      tradeFact('项目用途', d['purpose'] == 'RELEASE' ? '公开发行' : '公开分享'),
      tradeFact('地域 / 语言',
          '${d['territory'] == 'CN' ? '中国' : d['territory']} · ${d['language'] == 'zh' ? '中文' : d['language']}'),
      tradeFact('授权截止', tradeDate(d['valid_until']))
    ]);
Widget projectField(TextEditingController c, String label,
        {int lines = 1,
        int max = 2000,
        bool enabled = true,
        ValueChanged<String>? changed,
        TextInputType? keyboard}) =>
    Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: TextField(
            controller: c,
            enabled: enabled,
            maxLines: lines,
            maxLength: max,
            keyboardType: keyboard,
            decoration: InputDecoration(labelText: label),
            onChanged: changed));
Widget projectSelect(String label, String? value, List<(String, String)> values,
        ValueChanged<String?>? changed) =>
    Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Semantics(
            container: true,
            explicitChildNodes: true,
            child: DropdownButtonFormField<String>(
                key: ValueKey('$label:$value'),
                initialValue: value,
                decoration: InputDecoration(labelText: label),
                isExpanded: true,
                items: [
                  for (final v in values)
                    DropdownMenuItem(
                        value: v.$1,
                        child: Text(v.$2, overflow: TextOverflow.ellipsis))
                ],
                onChanged: changed)));
void projectClearWarnings(BuildContext context) => ScaffoldMessenger.of(context)
  ..clearSnackBars()
  ..removeCurrentSnackBar();
Widget projectReadiness(Map<String, dynamic> d) => supplyCard('开工条件', [
      Text(d['current_status'] == 'AVAILABLE' ? '当前开工条件齐备' : '仍有开工条件待完成',
          style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: AccountTheme.accent)),
      const SizedBox(height: 12),
      projectParagraph(d['current_status'] == 'AVAILABLE'
          ? '仅表示当前开工条件齐备。实际开工、成片交付与外部发行另行办理。'
          : projectError(AccountError(409, d['reason_code']))),
      supplyNote('显示服务器本次核对的当前原因；完成相关准备后请刷新条件。')
    ]);

Widget projectNextStep(ProjectRecord record) {
  final message = switch (record.status) {
    'INVITED' => '请本人先核对角色、用途与约定，再回应邀请；邀请不是已入组。',
    'APPLIED' => '报名已记录，等待筛选结果；不要把报名当作获选或签约。',
    'SELECTED' => '获选后仍需本人明确确认入组，再办理对应授权和约定。',
    'CONFIRMED' => '本人入组已确认；制作、付款和发行仍按各自条件与记录办理。',
    'CHANGES_REQUESTED' || 'EXTERNAL_CHANGES_REQUESTED' => '按当前补件意见处理原版本，再核对新的审核结果。',
    'READY_TO_SUBMIT' => '内部审核已通过，仍需办理外部提交并核对真实回执。',
    'EXTERNAL_SUBMITTED' => '外部提交已核实，等待外部结果；不等于已经发行。',
    'EXTERNAL_PUBLISHED' => '外部发行已核实，继续按原约定核对收入、权限与后续渠道事件。',
    'IN_REVIEW' || 'INTERNAL_PENDING' => '等待独立审核，当前提交或内部受理不代表制作、外部发行完成。',
    'CANCELLED' || 'WITHDRAWN' || 'DECLINED' || 'SUPERSEDED' => '本记录保留供追溯；后续办理请核对当前有效版本与权限。',
    _ => '按本次服务器记录核对角色、方案、授权和发行条件，再执行页面开放的操作。',
  };
  return tradeSection('当前进度与下一步', [
    Text(projectStatuses[record.status] ?? '状态待核对',
        style: const TextStyle(color: AccountTheme.accent,
            fontSize: 18, fontWeight: FontWeight.w700)),
    const SizedBox(height: 10),
    Text(message, style: const TextStyle(fontSize: 14, height: 1.6)),
  ]);
}
