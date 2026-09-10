import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../theme/app_theme.dart';

/// 通用法律/协议长文档页（曜石流光风格）。
/// body 采用极简标记：以 "## " 开头的段落渲染为小节标题，其余为正文段落；段落间用空行分隔。
class LegalDocPage extends StatelessWidget {
  final String title;
  final String body;
  final String? updatedAt;

  const LegalDocPage({
    super.key,
    required this.title,
    required this.body,
    this.updatedAt,
  });

  @override
  Widget build(BuildContext context) {
    final blocks = body.split('\n\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    return LiquidScaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 48),
        children: [
          Text(title,
              style: const TextStyle(
                  color: AppTheme.goldLight,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  fontFamily: AppTheme.serifFont)),
          if (updatedAt != null) ...[
            const SizedBox(height: 6),
            Text(updatedAt!, style: const TextStyle(color: AppTheme.textHint, fontSize: 12)),
          ],
          const SizedBox(height: 18),
          for (final b in blocks) ..._renderBlock(b),
        ],
      ),
    );
  }

  List<Widget> _renderBlock(String raw) {
    if (raw.startsWith('## ')) {
      return [
        Padding(
          padding: const EdgeInsets.only(top: 18, bottom: 8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 4,
              height: 18,
              margin: const EdgeInsets.only(top: 2, right: 8),
              decoration: BoxDecoration(
                  gradient: AppTheme.brandGradient, borderRadius: BorderRadius.circular(2)),
            ),
            Expanded(
              child: Text(raw.substring(3).trim(),
                  style: const TextStyle(
                      color: AppTheme.textPrimary, fontSize: 16, fontWeight: FontWeight.w800, height: 1.4)),
            ),
          ]),
        ),
      ];
    }
    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(raw,
            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13.5, height: 1.75)),
      ),
    ];
  }
}
