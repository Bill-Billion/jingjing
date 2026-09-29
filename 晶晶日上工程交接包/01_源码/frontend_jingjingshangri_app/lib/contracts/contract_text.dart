import 'package:flutter/material.dart';
import '../account/account_theme.dart';

/// Business-defined JSON is rendered recursively as inert, wrapping text.
/// Strings retain paragraphs; booleans, zero and null retain their exact value.
class ContractText extends StatelessWidget {
  const ContractText({super.key, required this.value});
  final dynamic value;
  @override
  Widget build(BuildContext context) {
    final data = value;
    if (data is Map) {
      if (data.isEmpty) return const SelectableText('空对象');
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (final entry in data.entries)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SelectableText('${entry.key}',
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, height: 1.6)),
                  const SizedBox(height: 6),
                  Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: ContractText(value: entry.value)),
                ]),
          ),
      ]);
    }
    if (data is List) {
      if (data.isEmpty) return const SelectableText('空列表');
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (var i = 0; i < data.length; i++)
          Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${i + 1}.',
                    style: const TextStyle(
                        color: AccountTheme.muted, height: 1.65)),
                const SizedBox(width: 10),
                Expanded(child: ContractText(value: data[i])),
              ])),
      ]);
    }
    return SelectableText(data == null ? 'null' : '$data',
        style: const TextStyle(fontSize: 14, height: 1.65));
  }
}
