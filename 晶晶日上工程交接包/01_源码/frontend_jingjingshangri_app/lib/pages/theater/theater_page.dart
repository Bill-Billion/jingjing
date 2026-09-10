import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/motion_fx.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../utils/haptics.dart';
import '../../utils/motion.dart';
import '../video_lib/video_play_page.dart';
import '../project_brief/project_brief_page.dart';

class TheaterPage extends StatelessWidget {
  const TheaterPage({super.key});

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      backgroundColor: Colors.transparent,
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.transparent, Colors.transparent],
            stops: [0.0, 0.3],
          ),
        ),
        child: CustomScrollView(
          slivers: [
            // 顶部
            SliverAppBar(
              expandedHeight: 200,
              pinned: true,
              backgroundColor: AppTheme.background,
              flexibleSpace: FlexibleSpaceBar(
                background: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.asset('assets/images/theater_1.jpg',
                        fit: BoxFit.cover),
                    Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.3),
                            AppTheme.background,
                          ],
                        ),
                      ),
                    ),
                    const SafeArea(
                      child: Padding(
                        padding: EdgeInsets.only(bottom: 20),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Text('晶晶日上',
                                style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 28,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 4)),
                            SizedBox(height: 6),
                            Text('自制大剧 · 下一个主演可能就是你',
                                style: TextStyle(
                                    color: Colors.white70, fontSize: 13)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _sectionTitle('进行中的大剧'),
                    const SizedBox(height: 14),
                    FadeSlideIn(delayMs: 60, child: _dramaCard(
                      context: context,
                      title: '黄帝史诗·天下合',
                      type: '古装史诗',
                      status: '选角进行中',
                      team: '专业主创团队承制',
                      active: true,
                      img: 'assets/images/theater_1.jpg',
                      progress: 0.72,
                      progressColor: AppTheme.goldMain,
                      trailerUrl: '/uploads/samples/huangdi_ttx.mp4',
                    )),
                    FadeSlideIn(delayMs: 120, child: _dramaCard(
                      context: context,
                      title: '少年龙武',
                      type: '热血成长',
                      status: '席位认领中',
                      team: '专业主创团队承制',
                      active: false,
                      img: 'assets/images/theater_3.jpg',
                      progress: 0.45,
                      progressColor: AppTheme.cyanDeep,
                    )),
                    FadeSlideIn(delayMs: 180, child: _dramaCard(
                      context: context,
                      title: '边境暗影',
                      type: '悬疑短剧',
                      status: '席位认领中',
                      team: '专业主创团队承制',
                      active: false,
                      img: 'assets/images/theater_2.jpg',
                      progress: 0.28,
                      progressColor: AppTheme.cyanSoft,
                    )),
                    const SizedBox(height: 24),
                    _sectionTitle('抽奖选角活动'),
                    const SizedBox(height: 14),
                    FadeSlideIn(delayMs: 240, child: _buildLotteryCard(context)),
                    const SizedBox(height: 20),
                    FadeSlideIn(delayMs: 300, child: _buildProjectPlanEntry(context)),
                    const SizedBox(height: 100),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Row(
      children: [
        Container(
          width: 4,
          height: 20,
          decoration: BoxDecoration(
            gradient: AppTheme.brandGradient,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Text(title,
            style: const TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 19,
                fontWeight: FontWeight.w900)),
      ],
    );
  }

  Widget _dramaCard({
    required BuildContext context,
    required String title,
    required String type,
    required String status,
    required String team,
    required bool active,
    required String img,
    required double progress,
    required Color progressColor,
    String? trailerUrl,
  }) {
    final hasTrailer = trailerUrl != null && trailerUrl.isNotEmpty;
    Widget poster = ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Image.asset(img, width: 80, height: 106, fit: BoxFit.cover),
    );
    if (hasTrailer) {
      final trailer = trailerUrl;
      poster = GestureDetector(
        onTap: () {
          final url = ApiService().resolveUrl(trailer);
          if (url.isEmpty) return;
          Haptics.tick();
          Navigator.push(context, Motion.fadeSlideRoute(
              VideoPlayPage(url: url, title: '《$title》片花')));
        },
        child: Stack(
          children: [
            poster,
            Positioned.fill(
              child: Center(
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.black.withValues(alpha: 0.42),
                    border: Border.all(color: AppTheme.goldMain, width: 1.2),
                  ),
                  child: const Icon(Icons.play_arrow_rounded,
                      size: 18, color: AppTheme.goldMain),
                ),
              ),
            ),
          ],
        ),
      );
    }
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: active
              ? AppTheme.goldMain.withValues(alpha: 0.4)
              : Colors.white.withValues(alpha: 0.06),
        ),
        boxShadow: active
            ? [
                BoxShadow(
                  color: AppTheme.goldMain.withValues(alpha: 0.15),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                )
              ]
            : null,
      ),
      child: Row(
        children: [
          // 海报（有片花时叠金边播放钮，点按进真播放器；无片花保持原样）
          poster,
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('《$title》',
                          style: const TextStyle(
                              color: AppTheme.textPrimary,
                              fontSize: 16,
                              fontWeight: FontWeight.w800),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                    ),
                    // 胶囊徽章
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        gradient: active
                            ? AppTheme.brandGradient
                            : null,
                        color: active
                            ? null
                            : Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        status,
                        style: TextStyle(
                          color: active
                              ? AppTheme.onGold
                              : AppTheme.textSecondary,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                // 类型胶囊
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: progressColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(type,
                      style: TextStyle(
                          color: progressColor,
                          fontSize: 10,
                          fontWeight: FontWeight.w600)),
                ),
                const SizedBox(height: 8),
                Text(team,
                    style: const TextStyle(
                        color: AppTheme.textHint, fontSize: 11)),
                const SizedBox(height: 10),
                // 多彩进度条
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: progress,
                    backgroundColor: Colors.white.withValues(alpha: 0.06),
                    valueColor: AlwaysStoppedAnimation(progressColor),
                    minHeight: 6,
                  ),
                ),
                const SizedBox(height: 4),
                Text('${(progress * 100).toInt()}%',
                    style: TextStyle(
                        color: progressColor,
                        fontSize: 10,
                        fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLotteryCard(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withValues(alpha: 0.06),
            AppTheme.cyanSoft.withValues(alpha: 0.10),
            AppTheme.cyanDeep.withValues(alpha: 0.06),
          ],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
            color: AppTheme.goldMain.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  gradient: AppTheme.brandGradient,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text('进行中',
                    style: TextStyle(
                        color: AppTheme.onGold,
                        fontSize: 11,
                        fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 8),
              const Text('第3期选角抽奖',
                  style: TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 17,
                      fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 14),
          _lotteryInfo(Icons.how_to_reg_rounded, '参与条件：已定制数字人 + 完成实名认证'),
          const SizedBox(height: 8),
          _lotteryInfo(Icons.card_giftcard_rounded, '奖品：《黄帝史诗·天下合》客串角色名额'),
          const SizedBox(height: 8),
          _lotteryInfo(Icons.event, '开奖时间：2026年9月15日'),
          const SizedBox(height: 16),
          Row(
            children: [
              const Icon(Icons.people_alt_rounded,
                  size: 16, color: AppTheme.goldMain),
              const SizedBox(width: 4),
              const Text('1,286人已参与',
                  style: TextStyle(
                      color: AppTheme.goldLight,
                      fontSize: 13,
                      fontWeight: FontWeight.w700)),
              const Spacer(),
              GestureDetector(
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('请先创建数字人并完成实名认证后参与选角抽奖')),
                ),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 24, vertical: 10),
                  decoration: BoxDecoration(
                    gradient: AppTheme.brandGradient,
                    borderRadius: BorderRadius.circular(999),
                    boxShadow: AppTheme.ctaGlow,
                  ),
                  child: const Text('立即参与',
                      style: TextStyle(
                          color: AppTheme.onGold,
                          fontSize: 14,
                          fontWeight: FontWeight.w800)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _lotteryInfo(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 15, color: AppTheme.textSecondary),
        const SizedBox(width: 8),
        Expanded(
          child: Text(text,
              style: const TextStyle(
                  color: AppTheme.textSecondary, fontSize: 13)),
        ),
      ],
    );
  }

  Widget _buildProjectPlanEntry(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          Motion.fadeSlideRoute(const ProjectBriefPage(
              source: {}, isProject: false)),
        ),
        child: const Row(
        children: [
          Icon(Icons.description_rounded, color: AppTheme.goldMain),
          SizedBox(width: 14),
          Expanded(
            child: Text('查看晶晶日上项目计划书',
                style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w600)),
          ),
          Icon(Icons.chevron_right_rounded, color: AppTheme.textHint),
        ],
      ),
      ),
    );
  }
}
