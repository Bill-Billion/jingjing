import 'package:flutter/material.dart';
import '../account/account_theme.dart';

/// Highlights facts already returned by the server. No implied completion.
class ActivitySummaryCard extends StatelessWidget {
  const ActivitySummaryCard({super.key, required this.label, required this.value,
    required this.description, this.icon = Icons.auto_awesome_outlined});
  final String label, value, description;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
          color: AccountTheme.selectedSurface,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: AccountTheme.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 20, color: AccountTheme.accent),
          const SizedBox(width: 8),
          Expanded(child: Text(label, style: const TextStyle(
              color: AccountTheme.muted, fontSize: 13, height: 1.5))),
        ]),
        const SizedBox(height: 14),
        Text(value, style: const TextStyle(fontFamily: AccountTheme.sans,
            fontSize: 28, fontWeight: FontWeight.w700,
            color: AccountTheme.accent, height: 1.25)),
        const SizedBox(height: 12),
        Text(description, style: const TextStyle(color: AccountTheme.text,
            fontSize: 13, height: 1.6)),
      ]));
}
