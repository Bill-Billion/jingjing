import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../pages/login/login_page.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_widgets.dart';
import 'production_models.dart';

class ProductionGate extends StatelessWidget {
  const ProductionGate(
      {super.key, required this.builder, this.returnRoute = '/production'});
  final Widget Function(AccountSession) builder;
  final String returnRoute;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>();
    final allowed = s.isLoggedIn &&
        s.partyId != null &&
        !s.productionAccessDenied &&
        s.selected?['membership']?['current_status'] == 'ACTIVE' &&
        !['SUSPENDED', 'CLOSED'].contains(s.party?['current_status']);
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
