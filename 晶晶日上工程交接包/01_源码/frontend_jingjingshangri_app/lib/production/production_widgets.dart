import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../trade/trade_models.dart';
import '../account/app_visual.dart';
import '../account/read_failure_widgets.dart';
import '../pages/login/login_page.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_widgets.dart';
import 'production_models.dart';
import 'fulfillment_models.dart';

class ProductionGate extends StatelessWidget {
  const ProductionGate(
      {super.key,
      required this.builder,
      this.returnRoute = '/production',
      this.showExpired = false,
      this.expiredLabel});
  final Widget Function(AccountSession) builder;
  final String returnRoute;
  final bool showExpired;
  final String? expiredLabel;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>();
    final allowed = s.isLoggedIn &&
        s.partyId != null &&
        !s.productionAccessDenied &&
        s.selected?['membership']?['current_status'] == 'ACTIVE' &&
        !['SUSPENDED', 'CLOSED'].contains(s.party?['current_status']);
    if (!allowed && showExpired && readSessionExpired(s)) {
      return ReadSessionExpiredPage(
          returnRoute: returnRoute, label: expiredLabel ?? '参与制作项目');
    }
    if (!allowed && s.productionAccessDenied) {
      return ReadAccessDeniedPage(
          reason: '当前账号暂时无法读取这页，私有内容已清空。请核对当前账号、参与身份和有效权限。',
          onRetry: () async {
            try {
              await s.retryProductionAccess();
            } catch (_) {}
          });
    }
    return allowed
        ? KeyedSubtree(
            key: ValueKey('${s.epoch}:${s.partyId}:$returnRoute'),
            child: builder(s))
        : tradeScaffold(context, '制作与交付', [
            supplyCard('先确认办事身份', [
              appNotice(!s.isLoggedIn
                  ? '登录后选择参与项目的身份。买方负责人可提交意见，实际指派的制作成员可查看自己的项目。'
                  : s.productionAccessDenied
                      ? '当前记录权限已失效，私有内容已清空。请重新核对身份。'
                      : '请选择有效的项目参与身份。'),
              tradeButton(
                  '前往账号与身份',
                  () => s.isLoggedIn
                      ? Navigator.pushNamed(context, '/account')
                      : Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) =>
                                  LoginPage(returnRoute: returnRoute)))),
              if (s.productionAccessDenied)
                tradeButton('重新核对权限', () async {
                  try {
                    await s.retryProductionAccess();
                  } catch (_) {}
                }, outline: true)
            ])
          ]);
  }
}

String productionVersionTitle(ProductionRecord version) =>
    '${productionStages[version.stage]} · 第 ${version.data['revision']} 版';
String productionVersionState(
        ProductionRecord version, ProductionRecord project) =>
    !version.current(project)
        ? '历史版本，当前确认已失效'
        : version.accepted(project)
            ? '本版已确认'
            : version.status == 'APPROVED'
                ? '审核通过，等待你确认'
                : productionStatuses[version.status]!;
Widget productionSpecification(ProductionRecord p) => supplyCard('原约定', [
      tradeFact('档位 / 版本',
          '${p.data['specification']['service_tier']} / ${p.data['specification']['version']}'),
      tradeFact('样片 / 成片',
          '${p.data['specification']['sample_seconds']} / ${p.data['specification']['final_seconds']} 秒'),
      tradeFact('修改次数',
          '已提出 ${p.data['change_requests']} 次 / 约定 ${p.data['specification']['revision_limit']} 次'),
      tradeFact(
          '交付内容', (p.data['specification']['deliverables'] as List).join('、')),
      ExpansionTile(title: const Text('查看完整约定条款'), children: [
        Padding(
            padding: const EdgeInsets.all(16),
            child: SelectableText(p.data['specification']['terms'],
                style: const TextStyle(fontSize: 16, height: 1.6)))
      ])
    ]);

String productionProjectTitle(ProductionRecord project, TradeRecord? order) {
  final line = order?.lines
      .where((line) => line['line_id'] == project.data['line_id'])
      .firstOrNull;
  return line == null ? '制作任务' : line['title'] as String;
}

int productionConfirmedStages(ProductionRecord project) => productionStages.keys
    .where((stage) =>
        project.data['current'][stage] != null &&
        project.data['current'][stage] == project.data['accepted'][stage])
    .length;

Widget productionCurrentTasks(
    ProductionRecord project, List<ProductionRecord> versions,
    {ProductionFulfillment? flow,
    TradeRecord? order,
    required bool buyerOwner}) {
  final stages = productionStages.keys.toList();
  final stage = stages.reversed
      .where((s) => project.data['current'][s] != null)
      .firstOrNull;
  final current =
      versions.where((v) => v.id == project.data['current'][stage]).firstOrNull;
  String title, detail;
  if (flow != null && !flow.active && flow.state != 'DELIVERED') {
    title = flow.state == 'PAUSED' ? '查看原项目问题与处理记录' : '核对取消与实际退款';
    detail = '${fulfillmentStates[flow.state]}。请按原处理决定核对；不会按普通制作流程继续催验收或付款。';
  } else if (project.status == 'IN_REVIEW' || project.status == 'REJECTED') {
    title = '核对开工依据审核';
    detail = '${productionStatuses[project.status]}。付款、项目审核和权利条件分别核对。';
  } else if (flow?.state == 'PLANNED') {
    title = '核对首款、权利与开工条件';
    detail = '尚未开工，请由受派制作人按原项目核对条件后办理。';
  } else if (stage == null) {
    title = '等待提交剧本版本';
    detail = '当前尚无制作版本。由实际指派的制作人在网页工作台提交，之后独立审核与买方确认。';
  } else if (current == null) {
    title = '重新核对当前${productionStages[stage]}';
    detail = '本次未读取到项目指定的当前版本，不能据此认定已审核或已验收。';
  } else if (current.status != 'APPROVED') {
    title = current.status == 'IN_REVIEW'
        ? '等待${productionStages[stage]}独立审核'
        : '核对${productionStages[stage]}审核意见';
    detail =
        '${productionVersionTitle(current)}，${productionStatuses[current.status]}。审核通过后再核对具体版本。';
  } else if (!current.accepted(project)) {
    title = buyerOwner
        ? '审阅并确认当前${productionStages[stage]}'
        : '等待买方负责人审阅当前${productionStages[stage]}';
    detail =
        '${productionVersionTitle(current)}已通过独立审核。请打开本版内容，核对修改记录后再确认或提出意见。';
  } else if (stage != 'FINAL') {
    title = '等待${productionStages[stages[stages.indexOf(stage) + 1]]}版本';
    detail = '${productionVersionTitle(current)}已确认。后续版本仍须独立审核与买方逐版确认。';
  } else {
    title = flow?.state == 'DELIVERED' ? '查看正式交付记录' : '核对最终交付条件';
    detail = '当前最终版本已确认。款项、正式收讫、交付记录与下载权利分别核对，验收不会自动完成其他步骤。';
  }
  final receipt = flow?.receipt;
  final receiptVersion =
      versions.where((v) => v.id == receipt?['version_id']).firstOrNull;
  return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    tradeBanner('当前待办：$title', detail, icon: Icons.movie_outlined),
    tradeSection('制作与交付核对', [
      tradeFact('当前版本确认', '已确认 ${productionConfirmedStages(project)}/4 个阶段'),
      supplyNote('仅计入各阶段当前版本的确认记录，不代表工时或付款比例。旧版本确认不计入。'),
      if (flow != null) ...[
        tradeFact('履约状态', fulfillmentStates[flow.state]),
        if (flow.raw['started_at'] != null)
          tradeFact('实际开工', tradeDate(flow.raw['started_at'])),
        tradeFact(
            '本次正式收讫',
            receipt == null
                ? '尚无正式交付记录，不能视为已收讫。'
                : receiptVersion == null
                    ? '本次未读取到交付指定版本，请从正式交付记录核对。'
                    : !receiptVersion.current(project)
                        ? '交付指向历史版本；旧版收讫不代表当前版本已收讫。'
                        : receipt['started_at'] != null
                            ? '该正式版本已明确收讫；版本验收仍另行核对。'
                            : receipt['view_observed_at'] == null
                                ? '先真实打开本次正式版本，再核对通知与明确收讫。'
                                : '已实际打开本次正式版本，尚未明确收讫；通知已读与收讫分别办理。'),
      ],
      tradeFact(
          '原订单款项',
          order == null
              ? '请由买方或商户负责人核对原订单，当前未读取款项记录。'
              : '${tradeStatuses[order.status]}；已核实收款 ${tradeMoney(order.data['financial']['received_minor'])}，退款 ${tradeMoney(order.data['financial']['refunded_minor'])}。'),
      supplyNote('最终原片每次下载仍须重新核验当前版本、财务状态与有效权利。'),
    ]),
  ]);
}

/// A stage is complete only when this project's current version is accepted.
Widget productionProgressStep(ProductionRecord project, String stage) {
  final current = project.data['current'][stage];
  final accepted =
      current != null && current == project.data['accepted'][stage];
  return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
            width: 24,
            height: 24,
            color: accepted
                ? AccountTheme.text
                : current != null
                    ? AccountTheme.vermilion
                    : AccountTheme.border,
            child: Icon(accepted ? Icons.check : Icons.circle,
                size: accepted ? 18 : 4,
                color: current != null
                    ? AccountTheme.canvas
                    : AccountTheme.muted)),
        const SizedBox(width: 12),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(productionStages[stage]!,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
              current == null
                  ? '未开始'
                  : accepted
                      ? '当前版本已确认'
                      : '当前版本待审阅',
              style: const TextStyle(
                  fontSize: 13, height: 1.6, color: AccountTheme.muted)),
        ])),
      ]));
}
