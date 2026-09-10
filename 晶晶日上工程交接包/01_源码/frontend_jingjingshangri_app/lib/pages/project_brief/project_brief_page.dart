import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../theme/app_theme.dart';
import '../../utils/project_brief.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/motion_fx.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/primary_button.dart';

/// 定制剧 / 圆梦项目书本地预览：结构化章节玻璃卡 + 一键复制全文；
/// PDF 导出留接口（暂以 SnackBar 说明），不引第三方重依赖。
class ProjectBriefPage extends StatelessWidget {
  final Map<String, dynamic> source;
  final bool isProject;

  const ProjectBriefPage({
    super.key,
    required this.source,
    this.isProject = false,
  });

  @override
  Widget build(BuildContext context) {
    final brief = ProjectBrief.build(source, isProject: isProject);
    return LiquidScaffold(
      appBar: AppBar(title: Text(isProject ? '圆梦项目书' : '定制剧项目书')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
        children: [
          FadeSlideIn(
            child: GlassCard(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0x0FFFFFFF),
                  Color(0x1A7FD4E0),
                  Color(0x0F3FA9C0),
                ],
              ),
              border: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Container(
                      width: 4,
                      height: 20,
                      decoration: BoxDecoration(
                        gradient: AppTheme.brandGradient,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(brief.title,
                          style: const TextStyle(
                              color: AppTheme.textPrimary,
                              fontSize: 18,
                              fontWeight: FontWeight.w900,
                              fontFamily: AppTheme.serifFont)),
                    ),
                  ]),
                  const SizedBox(height: 8),
                  Text(brief.subtitle,
                      style: const TextStyle(
                          color: AppTheme.goldLight, fontSize: 12.5)),
                  const SizedBox(height: 6),
                  const Text('生成方：晶晶日上 · 做自己人生的主角',
                      style: TextStyle(
                          color: AppTheme.textSecondary, fontSize: 12)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          for (int i = 0; i < brief.sections.length; i++)
            StaggerItem(
              index: i,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _sectionCard(brief.sections[i]),
              ),
            ),
          Container(
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              color: AppTheme.rimCyan.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                  color: AppTheme.rimCyan.withValues(alpha: 0.28)),
            ),
            child: const Row(children: [
              Icon(Icons.info_outline_rounded,
                  size: 17, color: AppTheme.iceHighlight),
              SizedBox(width: 8),
              Expanded(
                child: Text('本项目书依据订单 / 项目信息自动生成，正式条款以电子合同为准。',
                    style: TextStyle(
                        color: AppTheme.textSecondary, fontSize: 12, height: 1.5)),
              ),
            ]),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: Row(children: [
            Expanded(
              child: PrimaryButton(
                label: '复制全文',
                icon: Icons.copy_rounded,
                onPressed: () async {
                  await Clipboard.setData(
                      ClipboardData(text: brief.toFullText()));
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('项目书全文已复制，可粘贴发送或存档')),
                  );
                },
              ),
            ),
            const SizedBox(width: 12),
            PressScale(
              borderRadius: BorderRadius.circular(999),
              onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('PDF 导出将在正式版开放，当前可先复制全文留存')),
              ),
              child: Container(
                height: 50,
                padding: const EdgeInsets.symmetric(horizontal: 18),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                      color: AppTheme.goldMain.withValues(alpha: 0.35)),
                ),
                child: const Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.picture_as_pdf_rounded,
                      size: 18, color: AppTheme.goldLight),
                  SizedBox(width: 6),
                  Text('导出PDF',
                      style: TextStyle(
                          color: AppTheme.goldLight,
                          fontSize: 14,
                          fontWeight: FontWeight.w700)),
                ]),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _sectionCard(BriefSection sec) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 4,
              height: 15,
              decoration: BoxDecoration(
                gradient: AppTheme.brandGradient,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(sec.title,
                  style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w800)),
            ),
          ]),
          const SizedBox(height: 10),
          for (final line in sec.bullets)
            Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    margin: const EdgeInsets.only(top: 7, right: 9),
                    width: 5,
                    height: 5,
                    decoration: const BoxDecoration(
                        color: AppTheme.cyanSoft, shape: BoxShape.circle),
                  ),
                  Expanded(
                    child: Text(line,
                        style: const TextStyle(
                            color: AppTheme.textSecondary,
                            fontSize: 13,
                            height: 1.55)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
