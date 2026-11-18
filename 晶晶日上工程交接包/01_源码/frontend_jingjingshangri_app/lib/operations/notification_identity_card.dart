import 'package:flutter/material.dart';
import '../account/account_theme.dart';

class NotificationIdentityCard extends StatelessWidget {
  const NotificationIdentityCard({super.key, required this.identity,
    this.unread, this.showUnread = false});
  final String identity;
  final int? unread;
  final bool showUnread;

  @override
  Widget build(BuildContext context) => Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
          color: AccountTheme.selectedSurface,
          borderRadius: BorderRadius.circular(20)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('当前办事身份', style: TextStyle(
            fontSize: 12, color: AccountTheme.muted)),
        const SizedBox(height: 8),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.badge_outlined, color: AccountTheme.accent, size: 22),
          const SizedBox(width: 10),
          Expanded(child: Text(identity, style: const TextStyle(
              fontSize: 18, color: AccountTheme.text, fontWeight: FontWeight.w700))),
        ]),
        if (showUnread) ...[
          const SizedBox(height: 12),
          Text(unread == null ? '未读数量尚未核实' : '本次快照未读 $unread 条',
              style: const TextStyle(color: AccountTheme.accent, fontSize: 14)),
        ],
        const SizedBox(height: 10),
        const Text('通知记录业务变化；是否仍需办理，请打开对应业务核对当前状态。',
            style: TextStyle(fontSize: 12, height: 1.6, color: AccountTheme.muted)),
      ]));
}
