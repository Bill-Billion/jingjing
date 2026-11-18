import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../account/account_session.dart';
import '../account/account_api.dart';
import '../contracts/contract_text.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_widgets.dart';
import 'license_api.dart';
import 'license_models.dart';
import 'procurement_models.dart';

const ipFactLabels = {
  'procurement': '本合同采购',
  'rights_evidence': '分类权属材料',
  'rights_chain_ids': '权利链依据',
  'ownership_proof_ids': '权属证明',
  'original_creation_ids': '原始创作依据',
  'has_coauthors': '是否有共同作者',
  'coauthor_consent_ids': '共同作者同意',
  'settlement_annex': '原结算附件',
  'cycle': '结算周期',
  'net_basis': '净收益口径',
  'upfront_minor': '前置对价（分）',
  'royalty_bps': '净收益比例（万分比）',
  'attribution_terms': '署名约定',
  'sublicensing_allowed': '合同允许转许可（下游另办）',
  'event': '事实类型',
  'occurred_at': '实际发生时间',
  'evidence_asset_ids': '受控依据',
  'external_reference': '外部编号',
  'note': '核验说明',
  'statement': '原账单',
  'period_from': '账期开始',
  'period_until': '账期结束',
  'income_minor': '发行及衍生收入（分）',
  'platform_minor': '平台佣金（分）',
  'tax_minor': '税费（分）',
  'distribution_minor': '发行成本（分）',
  'production_minor': '制作成本（分）',
  'calculation': '独立审核计算',
  'project_net_minor': '项目累计净收益（分）',
  'cumulative_accrued_minor': '累计应计（分）',
  'adjustment_minor': '本次调整（分）',
  'payment_state': '款项状态（NOT_TRANSFERRED为未转账）',
  'review': '独立核验结论'
};

class ProcurementFacts extends StatefulWidget {
  const ProcurementFacts(
      {super.key, required this.record, required this.session});
  final LicenseRecord record;
  final AccountSession session;
  @override
  State<ProcurementFacts> createState() => _ProcurementFactsState();
}

class _ProcurementFactsState extends State<ProcurementFacts> {
  bool busy = false;
  String? error;
  Future<void> download(String asset) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    final api = LicenseApi(widget.session),
        party = api.owner(),
        epoch = widget.session.epoch,
        id = widget.record.id;
    try {
      final current = await api.record(id);
      api.check(epoch, party);
      List<String> assets(LicenseRecord r) => r.data['procurement'] is Map
          ? procurementAssets(Map<String, dynamic>.from(r.data['procurement']))
          : List<String>.from(r.data['evidence_asset_ids'] ?? []);
      if (!assets(current).contains(asset)) {
        throw const AccountError(403, 'LICENSE_NOT_FOUND');
      }
      final bytes = await widget.session.readBytes(
          '/api/v1/licensing/procurement/$id/assets/$asset/content',
          actingParty: party);
      api.check(epoch, party);
      final after = await api.record(id);
      api.check(epoch, party);
      if (!mounted ||
          after.version != current.version ||
          !assets(after).contains(asset)) {
        return;
      }
      final path = await FilePicker.saveFile(
          fileName: 'ip-evidence-$asset.bin', bytes: bytes);
      api.check(epoch, party);
      if (mounted && path != null) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('已保存本份采购依据')));
      }
    } catch (e) {
      if (mounted && widget.session.epoch == epoch) {
        setState(() => error = licenseError(e));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.record.data,
        p = d['procurement'] is Map
            ? Map<String, dynamic>.from(d['procurement'])
            : null,
        ids = p == null
            ? List<String>.from(d['evidence_asset_ids'] ?? [])
            : procurementAssets(p);
    return tradeSection(p == null ? 'IP事实与收益记录' : '本份 IP 采购合同', [
      if (p != null) ...[
        Text(p['mode'] == 'BUYOUT'
            ? '本合同买断：人民币50,000元、分红0%，永久全球独家，无项目或集数上限。须全款和双方签署独审后生效。'
            : '本合同分红：前置0元、净收益8%，5个日历年授权、2年开发期，无数量上限。零前置不是免费买断。'),
        SelectableText('指定采购方：${p['buyer_party_id']}'),
        Text('署名：${p['attribution_terms']}'),
        const Text('允许转许可不代表已有下游授权。肖像声音等人格权另外确认。')
      ],
      const Text('开发、上线及撤回须独立核验；绑定项目不等于开发。收益应计与调整均未转账，不自动扣款或付款。'),
      ContractText(value: p ?? d, fieldLabels: ipFactLabels),
      if (error != null) supplyNote(error!, error: true),
      for (final id in ids)
        OutlinedButton(
            onPressed: busy ? null : () => download(id),
            child: Text('受控读取依据 ${id.substring(id.length - 4)}')),
    ]);
  }
}
