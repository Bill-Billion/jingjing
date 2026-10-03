import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../account/account_theme.dart';
import '../pages/login/login_page.dart';
import '../projects/project_widgets.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_widgets.dart';
import 'finance_models.dart';

class FinanceGate extends StatelessWidget {
  const FinanceGate(
      {super.key, required this.builder, this.returnRoute = '/finance'});
  final Widget Function(AccountSession) builder;
  final String returnRoute;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>();
    if (s.isLoggedIn &&
        !s.financeAccessDenied &&
        s.partyId != null &&
        s.isOwner &&
        s.selected?['membership']?['current_status'] == 'ACTIVE' &&
        !['CLOSED', 'SUSPENDED'].contains(s.party?['current_status'])) {
      return KeyedSubtree(
          key: ValueKey('finance:${s.epoch}:${s.partyId!}:$returnRoute'),
          child: builder(s));
    }
    return tradeScaffold(context, '我的结算', [
      supplyCard('先确认办事身份', [
        appNotice(s.financeAccessDenied
            ? '记录权限已失效，私有结算内容已清空。请重新核对身份。'
            : '请登录并选择当前有效的个人或机构负责人身份，查看获准参与的结算约定。'),
        tradeButton(
            '前往账号与身份',
            () => s.isLoggedIn
                ? Navigator.pushNamed(context, '/account')
                : Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => LoginPage(returnRoute: returnRoute)))),
        if (s.financeAccessDenied)
          tradeButton('重新核对权限', () async {
            try {
              await s.retryFinanceAccess();
            } catch (_) {}
          }, outline: true)
      ])
    ]);
  }
}

Widget financeIdFact(String label, String id) => Row(children: [
      Expanded(child: tradeFact(label, '尾号 ${shortSupplyId(id)}')),
      IconButton(
          tooltip: '复制$label',
          onPressed: () => Clipboard.setData(ClipboardData(text: id)),
          icon: const Icon(Icons.copy_outlined, size: 20))
    ]);
Widget financeAmounts(Map<String, dynamic> d) => LayoutBuilder(
    builder: (context, c) => Wrap(spacing: 12, runSpacing: 12, children: [
          for (final entry in [
            ('本人应得', 'accrued_minor'),
            ('已核实付款', 'paid_minor'),
            ('尚未付款', 'balance_minor'),
            ('当前可申请', 'available_minor')
          ])
            Container(
                width: (c.maxWidth - 12) / 2,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                    color: AccountTheme.canvas,
                    borderRadius: BorderRadius.circular(10)),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(entry.$1,
                          style: const TextStyle(
                              fontSize: 16, color: AccountTheme.muted)),
                      const SizedBox(height: 12),
                      FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text(financeMoneyText(d[entry.$2]),
                              style: const TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w700,
                                  color: AccountTheme.accent)))
                    ]))
        ]));
Widget financeParagraph(String text) => projectParagraph(text);
void financeClearWarnings(BuildContext context) => ScaffoldMessenger.of(context)
  ..clearSnackBars()
  ..removeCurrentSnackBar();
const financeLabels = {
  'source_type': '结算来源类型',
  'source_id': '来源编号',
  'source_sha256': '来源指纹',
  'previous_agreement_id': '上一约定',
  'environment': '环境',
  'currency': '币种',
  'rule_id': '规则编号',
  'rule_snapshot': '保存规则',
  'rules': '本约定分配规则',
  'parties': '约定主体',
  'evidence_asset_id': '私有证据编号',
  'review': '独立审核',
  'decision': '审核决定',
  'reason': '理由',
  'verification': '核验结果',
  'parties_verified': '主体已核验',
  'contract_verified': '合同已核验',
  'amount_verified': '金额已核验',
  'evidence_verified': '凭据已核验',
  'reviewer_account_id': '核验账号',
  'method': '办理方式',
  'version': '规则版本',
  'settlement_at': '约定结算时间',
  'release_condition': '可结算条件',
  'terms': '原约定条款',
  'lines': '分配明细',
  'line_id': '明细编号',
  'shares': '各方比例',
  'party_id': '主体编号',
  'bps': '比例（万分数）',
  'role': '分配身份',
  'deductions': '费用承担',
  'category': '费用或问题类别',
  'amount_minor': '金额（人民币分）',
  'basis': '费用依据',
  'refund_behavior': '退款时费用处理',
  'period_reference': '结算期间',
  'note': '说明',
  'facts_sha256': '来源事实指纹',
  'source_references': '来源事实',
  'received_minor': '已核实收款（人民币分）',
  'receivable_minor': '应收差额（人民币分）',
  'balances': '本版余额快照',
  'accrued_minor': '暂计应得（人民币分）',
  'adjustment_minor': '已核实调整（人民币分）',
  'paid_minor': '已核实实付（人民币分）',
  'balance_minor': '尚未付款（人民币分）',
  'rule_sha256': '分配规则指纹',
  'recipient_party_id': '收款主体',
  'destination_asset_id': '私有收款资料编号',
  'destination_owner_party_id': '资料提交主体',
  'cancel_reason': '取消原因',
  'last_evidence_id': '最后已核实凭据编号',
  'payout_id': '付款申请编号',
  'outcome': '登记结果',
  'external_reference': '外部凭据编号',
  'occurred_at': '真实发生时间',
  'about_record_id': '异议关联记录',
  'evidence_asset_ids': '私有证据编号',
  'decision_history': '历史独立处理决定',
  'action_record_id': '已核实补救记录',
  'dispute_id': '异议编号',
  'message': '回复',
  'entries': '差额明细',
  'provider': '付款渠道',
  'items': '核对明细',
  'differences': '核对差异',
  'meaning': '事实说明',
  'record_id': '业务记录编号',
  'direction': '收退款方向',
  'sha256': '事实指纹',
  'period_start': '账单开始',
  'period_end': '账单结束',
  'gross_minor': '毛收入（人民币分）',
  'refund_minor': '渠道退款（人民币分）',
  'channel_fee_minor': '渠道费（人民币分）',
  'tax_minor': '税额（人民币分）',
  'net_minor': '账单净额（人民币分）',
  'original_statement_id': '原账单编号',
  'statement_id': '关联账单编号',
  'id': '编号',
  'rule_key': '规则名称',
  'content_sha256': '保存指纹',
  'format_version': '内容格式'
};
