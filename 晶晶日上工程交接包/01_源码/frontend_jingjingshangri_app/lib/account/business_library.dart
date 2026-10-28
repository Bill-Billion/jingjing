import 'package:flutter/material.dart';
import '../trade/trade_widgets.dart';
import 'account_theme.dart';

/// A directory into authoritative business lists, with no client-side merged
/// balances or implied signature status from unrelated records.
class BusinessLibraryPage extends StatefulWidget {
  const BusinessLibraryPage({super.key, this.section = 'contracts'});
  final String section;
  @override
  State<BusinessLibraryPage> createState() => _BusinessLibraryPageState();
}

class _BusinessLibraryPageState extends State<BusinessLibraryPage> {
  late String section =
      _sections.containsKey(widget.section) ? widget.section : 'contracts';
  static const _sections = {
    'contracts': '合同与约定',
    'works': '我的作品',
    'income': '我的收入',
  };
  static const _entries = {
    'contracts': [
      ('订单合同', '报价、签约和付款状态，在原订单分别核对。', '/orders'),
      ('作品许可', '查看预留、许可范围及当时约定。', '/licensing'),
      ('参演条款', '查看本人参与项目的会签进度。', '/projects/participation'),
      ('商单约定', '查看接单、履行及原合作约定。', '/gigs/records?kind=GIG'),
      ('收入分配约定', '查看独立发行的分成与签署记录。', '/projects/income'),
      ('按合同编号查找', '已有合同编号时直接读取获准内容。', '/contract'),
    ],
    'works': [
      ('我购买的现成视频', '查看已购许可、收件和售后进度。', '/stock/purchases'),
      ('我的交付作品', '查看制作成片、验收和获准下载。', '/production/works'),
      ('制作中的项目', '查看样片、修改及交付进度。', '/production'),
      ('我的上架作品', '查看审核、公开状态和经营记录。', '/stock/listings'),
      ('作品资料', '查看已保存的作品及资料版本。', '/supply'),
    ],
    'income': [
      ('经营结算', '按结算约定核对待结、已结及实际收款。', '/finance'),
      ('发行收入', '查看发行报告、分配及原约定。', '/projects/income'),
      ('佣金记录', '查看来源、核算及相关合作记录。', '/gigs/records?kind=COMMISSION'),
      ('消费者钱包', '充值余额、消费流水和晶钻分别查看。', '/wallet'),
    ],
  };

  @override
  Widget build(BuildContext context) => tradeScaffold(context, '我的业务目录', [
        tradeHeading('约定、作品与收入', eyebrow: '从原业务继续办理'),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final item in _sections.entries)
            ChoiceChip(
                label: Text(item.value),
                selected: section == item.key,
                onSelected: (_) => setState(() => section = item.key)),
        ]),
        const SizedBox(height: 24),
        Text(
            section == 'income'
                ? '选择收入来源，查看当前身份的明细。客户付款、约定分成和实际收款分别记录。'
                : '选择业务类型，查看当前身份可读的记录；进入详情继续查看合同、状态和下一步。',
            style: const TextStyle(color: AccountTheme.muted, height: 1.6)),
        const SizedBox(height: 20),
        for (final entry in _entries[section]!)
          Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  shape: const RoundedRectangleBorder(
                      side: BorderSide(color: AccountTheme.border)),
                  title: Text(entry.$1,
                      style: const TextStyle(
                          fontFamily: AccountTheme.serif,
                          fontSize: 20,
                          fontWeight: FontWeight.w700)),
                  subtitle: Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(entry.$2)),
                  trailing: const Icon(Icons.arrow_forward),
                  onTap: () => Navigator.pushNamed(context, entry.$3))),
      ]);
}
