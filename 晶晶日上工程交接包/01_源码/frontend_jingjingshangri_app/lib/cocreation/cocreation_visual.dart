import 'package:flutter/material.dart';
import '../account/account_theme.dart';

Widget cocreationSection(String title, List<Widget> children) => Container(
    margin: const EdgeInsets.only(bottom: 18),
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
        color: AccountTheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AccountTheme.border)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(title, style: const TextStyle(
          fontFamily: AccountTheme.sans, fontSize: 18,
          fontWeight: FontWeight.w700, height: 1.4)),
      const SizedBox(height: 14),
      ...children,
    ]));

Widget cocreationGuide(String title, String detail) => cocreationSection(title, [
    const Row(children: [
      Icon(Icons.people_outline, size: 18, color: AccountTheme.accent),
      SizedBox(width: 8),
      Text('本人资料 · 独立授权 · 同一房间',
          style: TextStyle(color: AccountTheme.accent, fontSize: 12)),
    ]),
    const SizedBox(height: 12),
    Text(detail, style: const TextStyle(
        color: AccountTheme.muted, fontSize: 13, height: 1.6)),
  ]);
