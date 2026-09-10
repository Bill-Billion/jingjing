import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../utils/motion.dart';
import '../utils/money.dart';
import '../utils/pricing.dart';
import 'glass_icon.dart';
import '../pages/ai_studio/ai_create_page.dart';
import '../pages/video_order/video_order_page.dart';
import '../pages/launch/launch_page.dart';
import '../pages/my_humans/my_humans_page.dart';
import '../pages/projects/projects_page.dart';

/// 中央鎏金创作面板（追光设计系统 · 五分栏）。
/// 五个板块严格区分，不混线：
///   1) AI 创作：文生图 / 文生视频（自助生成）
///   2) 定制视频：选艺人定制祝福/口播视频（线①）
///   3) 定制剧：本人当主角，意向金 + 制作款（金额取 Pricing SSOT，七步成片含电子合同（线②）
///   4) 数字人：创建/管理我的数字人
///   5) 圆梦：认领平台自有 IP 的空缺角色/席位（非投资）
class GlowPanel extends StatelessWidget {
  const GlowPanel({super.key});

  /// 以 92% 高度的底部大面板打开创作中心（统一 sheet 动效，档案14 §三）。
  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.62),
      builder: (_) => FractionallySizedBox(
        heightFactor: 0.92,
        child: ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          child: const GlowPanel(),
        ),
      ),
    );
  }

  void _push(BuildContext context, Widget page) =>
      Navigator.push(context, Motion.fadeSlideRoute(page));

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppTheme.bgGlowPanel, AppTheme.background],
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            // 顶部标题栏
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 8, 4),
              child: Row(
                children: [
                  AppTheme.gradientText('创作中心',
                      fontSize: 24, fontWeight: FontWeight.w900),
                  const SizedBox(width: 6),
                  const Icon(Icons.auto_awesome,
                      size: 17, color: AppTheme.goldMain),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close,
                        color: AppTheme.textSecondary),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
                children: [
                  _blockTitle(Icons.auto_fix_high_rounded, 'AI 创作', '自助生成，按次计费'),
                  _aiGrid(context),
                  const SizedBox(height: 22),
                  _blockTitle(Icons.video_settings_rounded, '定制视频', '选艺人 · 真人/数字人交付'),
                  _actionRow(
                    context,
                    icon: Icons.celebration,
                    title: '定制祝福视频',
                    desc: '生日/婚礼/节日/企业口播，艺人接单交付',
                    onTap: () => _push(context, const VideoOrderPage()),
                  ),
                  const SizedBox(height: 22),
                  _blockTitle(Icons.movie_filter_rounded, '定制剧', '我当主角 · 七步成片'),
                  _actionRow(
                    context,
                    icon: Icons.person_pin_circle_rounded,
                    title: '我要当主角',
                    desc: '本人主角：${Money.rmbInt(Pricing.intentDeposit)} 意向金 + ${Money.rmbInt(Pricing.productionFee)} 制作款，电子合同担保',
                    highlight: true,
                    onTap: () => _push(context, const LaunchPage()),
                  ),
                  const SizedBox(height: 22),
                  _blockTitle(Icons.face_retouching_natural_rounded, '数字人', '我的专属分身'),
                  _actionRow(
                    context,
                    icon: Icons.badge,
                    title: '创建数字人',
                    desc: '授权建模，进入我的数字人列表',
                    onTap: () => _push(context, const MyHumansPage()),
                  ),
                  const SizedBox(height: 22),
                  _blockTitle(Icons.theater_comedy_rounded, '圆梦', '认领角色席位 · 非投资'),
                  _actionRow(
                    context,
                    icon: Icons.workspaces,
                    title: '认领空缺角色 / 席位',
                    desc: '平台自有 IP 项目，对应明确内容交付物',
                    onTap: () => _push(context, const ProjectsPage()),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _blockTitle(IconData icon, String title, String subtitle) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppTheme.goldMain),
          const SizedBox(width: 6),
          Text(
            title,
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.w900,
              fontFamily: AppTheme.serifFont,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: AppTheme.textHint, fontSize: 11.5)),
          ),
        ],
      ),
    );
  }

  // AI 创作两格
  Widget _aiGrid(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _aiTile(
            context,
            icon: Icons.image,
            title: 'AI 文生图',
            desc: '输入提示词出图',
            onTap: () => _push(context, const AiCreatePage(initialKind: 'image')),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _aiTile(
            context,
            icon: Icons.movie_creation_rounded,
            title: 'AI 文生视频',
            desc: '提示词生成短片',
            onTap: () => _push(context, const AiCreatePage(initialKind: 'video')),
          ),
        ),
      ],
    );
  }

  Widget _aiTile(BuildContext context,
      {required IconData icon,
      required String title,
      required String desc,
      required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: AppTheme.glassDecoration(radius: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            GlassIconCore(icon: icon, size: 44, iconSize: 22),
            const SizedBox(height: 12),
            Text(title,
                style: const TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(desc,
                style: const TextStyle(
                    color: AppTheme.textSecondary, fontSize: 11.5)),
          ],
        ),
      ),
    );
  }

  // 板块下的整行入口
  Widget _actionRow(BuildContext context,
      {required IconData icon,
      required String title,
      required String desc,
      bool highlight = false,
      required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: highlight
              ? AppTheme.gold.withValues(alpha: 0.08)
              : Colors.white.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: highlight
                ? AppTheme.goldMain.withValues(alpha: 0.45)
                : AppTheme.goldMain.withValues(alpha: 0.14),
          ),
        ),
        child: Row(
          children: [
            GlassIconCore(icon: icon, size: 46, iconSize: 23),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 15.5,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 3),
                  Text(desc,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: AppTheme.textSecondary, fontSize: 12, height: 1.3)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded,
                color: AppTheme.goldMain, size: 22),
          ],
        ),
      ),
    );
  }
}
