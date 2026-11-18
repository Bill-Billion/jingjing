import 'package:flutter/material.dart';
import '../account/account_theme.dart';
import 'trade_widgets.dart';

/// Choose an existing authorised record instead of asking for internal IDs.
/// Each destination retains its own login, identity and permission checks.
class AftercareEntryPage extends StatelessWidget {
  const AftercareEntryPage({super.key});

  Widget _entry(BuildContext context, String title, String detail,
          String action, String route, IconData icon) =>
      tradeSection(title, [
        Icon(icon, color: AccountTheme.accent, size: 28),
        const SizedBox(height: 12),
        Text(detail, style: const TextStyle(
            color: AccountTheme.muted, height: 1.6)),
        const SizedBox(height: 16),
        tradeButton(action, () => Navigator.pushNamed(context, route)),
      ]);

  @override
  Widget build(BuildContext context) => tradeScaffold(context, '售后与争议', [
        tradeHeading('售后与争议', eyebrow: '原记录 / 反馈、交付与退款分别核对', fontSize: 28),
        const Text('先选择这次购买或制作记录，再办理反馈、补充证据或退款。此页不会创建申请，也不会改变原订单。',
            style: TextStyle(color: AccountTheme.muted, height: 1.6)),
        const SizedBox(height: 20),
        _entry(context, '现货视频', '查看已购作品的许可、下载与售后处理。',
            '选择已购作品', '/stock/purchases', Icons.video_library_outlined),
        _entry(context, '定制制作与交付', '选择制作项目和具体版本，再反馈、验收或申请售后。',
            '选择制作项目', '/production', Icons.movie_creation_outlined),
        _entry(context, '试镜预约', '从本次预约处理交样片、取消、争议及退款。',
            '选择试镜预约', '/auditions/bookings', Icons.event_outlined),
        _entry(context, '付款与退款记录', '核对真实付款及退款处理。申请受理不表示资金已经到账。',
            '选择原订单', '/orders', Icons.receipt_long_outlined),
        tradeButton('其他问题与反馈',
            () => Navigator.pushNamed(context, '/support/new'), outline: true),
      ]);
}
