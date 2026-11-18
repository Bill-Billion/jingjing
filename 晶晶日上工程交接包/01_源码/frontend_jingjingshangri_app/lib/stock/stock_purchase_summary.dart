import 'package:flutter/material.dart';
import '../account/account_theme.dart';
import '../trade/trade_widgets.dart';
import 'stock_models.dart';

/// A presentation of server facts, never a client-side payment/receipt state.
class StockPurchaseSummary extends StatelessWidget {
  const StockPurchaseSummary({super.key, required this.purchase});
  final StockPurchase purchase;

  String get nextStep {
    final p = purchase;
    if (p.data['current_case_id'] != null) {
      return '本单问题已提交，等待独立客服处理。正式文件暂停读取，可在原订单核对后续决定。';
    }
    if (p.status == 'AWAITING_PAYMENT') {
      return '前往原订单办理付款。只有服务器核实付款与资格后，才会开放正式文件。';
    }
    if (p.status == 'PAYMENT_REVIEW_REQUIRED') {
      return '本单付款需要进一步核对，请打开原订单恢复核对，不要重复付款。';
    }
    if (p.status == 'REFUND_REQUIRED') {
      return '本单需要退款处理。核定退款不等于到账，请在原订单跟进渠道结果。';
    }
    if (p.status == 'REVOKED') {
      return '本单许可已撤销，请停止使用已保存文件；原订单与售后记录仍可核对。';
    }
    if (!p.usable) {
      return '当前许可或文件使用条件未满足，请查看许可期限、权限及原订单状态。';
    }
    if (p.data['accepted_at'] != null) {
      return '交付已按服务器记录确认。可在许可范围内读取作品，仍须遵守当前授权与售后决定。';
    }
    return '先读取正式文件，核对内容后再确认收件与交付。有问题可在本页提交售后。';
  }

  @override
  Widget build(BuildContext context) => tradeSection('办理进度', [
        Wrap(spacing: 8, runSpacing: 8, children: [
          Chip(
              avatar: Icon(purchase.usable ? Icons.check_circle_outline : Icons.info_outline,
                  size: 18, color: AccountTheme.accent),
              label: Text(stockStatuses[purchase.status] ?? purchase.status)),
          if (purchase.data['current_case_id'] != null)
            const Chip(label: Text('售后处理中')),
        ]),
        const SizedBox(height: 12),
        Text(nextStep, style: const TextStyle(fontSize: 14, height: 1.6)),
        const SizedBox(height: 12),
        const Text('订单识别号 · 可复制给运营核对同一记录',
            style: TextStyle(color: AccountTheme.muted, fontSize: 12)),
        const SizedBox(height: 6),
        SelectableText(purchase.orderId,
            style: const TextStyle(fontSize: 12, color: AccountTheme.text)),
      ]);
}
