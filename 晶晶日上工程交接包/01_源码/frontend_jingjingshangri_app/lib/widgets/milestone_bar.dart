import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// 里程碑分期条（高端定制“一剧一议”担保分期的统一可视化）。
/// 均分自适应：百分比（克制金）在上、阶段名在下，段间 chevron，窄屏不横溢。
/// 数值由调用处传入（商业比例不在此写死），定制剧下单页与高端定制需求页共用，
/// 保证同一套里程碑在链路上视觉一致。
class MilestoneBar extends StatelessWidget {
  final List<(String, String)> stages;
  const MilestoneBar({super.key, required this.stages});

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[];
    for (var i = 0; i < stages.length; i++) {
      children.add(Expanded(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(stages[i].$2,
                style: const TextStyle(
                    color: AppTheme.goldMain,
                    fontSize: 14,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(stages[i].$1,
                textAlign: TextAlign.center,
                maxLines: 2,
                style: const TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 10,
                    height: 1.2)),
          ],
        ),
      ));
      if (i != stages.length - 1) {
        children.add(const Padding(
          padding: EdgeInsets.symmetric(horizontal: 2),
          child: Icon(Icons.chevron_right, size: 14, color: AppTheme.textHint),
        ));
      }
    }
    return Row(
        crossAxisAlignment: CrossAxisAlignment.start, children: children);
  }
}
