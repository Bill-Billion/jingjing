import 'package:flutter/material.dart';
import '../../widgets/motion_fx.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../utils/responsive.dart';
import '../../utils/motion.dart';
import '../../utils/perf_trace.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/primary_button.dart';
import '../project_detail/project_detail_page.dart';

/// 圆梦 —— 平台自有 IP 项目的「角色/席位认领」（席位=内容交付物名额，非投资/众筹/分红）。
/// 与「定制剧（本人主角，走创作中心-我要当主角七步流程）」严格分成两个板块，本页不放定制剧入口。
/// 数据源统一后端 /api/projects，离线自动使用演示数据。
class ProjectsPage extends StatefulWidget {
  const ProjectsPage({super.key});

  @override
  State<ProjectsPage> createState() => _ProjectsPageState();
}

class _ProjectsPageState extends State<ProjectsPage> {
  final ApiService _api = ApiService();
  List<Map<String, dynamic>> _projects = [];
  bool _loading = true;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    PerfTrace.stamp('projects load start');
    // Gate0 F-R3：已有项目时下拉/后台刷新不回骨架，仅首屏无数据显示骨架
    final bool initial = _projects.isEmpty;
    setState(() {
      _loading = initial;
      _error = false;
    });
    try {
      final list = await _api.getProjects(params: {'pageSize': '50'});
      if (!mounted) return;
      setState(() {
        _projects =
            list.map((e) => _normalize(e as Map<String, dynamic>)).toList();
        _loading = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) =>
          PerfTrace.stamp('projects meaningful frame', meta: 'n=${_projects.length}'));
    } catch (e) {
      if (mounted) {
        // Gate0 F-R3：已有旧数据时刷新失败保留旧值，不踢回整页错误
        setState(() {
          _loading = false;
          if (_projects.isEmpty) _error = true;
        });
      }
    }
  }

  // 统一在线/演示字段：席位 seatsClaimed/seatsTotal 为整数名额
  Map<String, dynamic> _normalize(Map<String, dynamic> p) {
    return {
      ...p,
      'claimed': (p['seatsClaimed'] ?? p['claimed'] ?? 0) as num,
      'total': (p['seatsTotal'] ?? p['total'] ?? 100) as num,
      'backers': p['clientCount'] ?? p['backers'] ?? 0,
      'type': p['type'] ?? p['genre'] ?? '',
      'statusText': p['status'] == 'recruiting'
          ? '席位认领中'
          : (p['statusText'] ?? '进行中'),
    };
  }

  void _open(Map<String, dynamic> p) =>
      Navigator.push(context, Motion.fadeSlideRoute(ProjectDetailPage(project: p)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('圆梦 · 角色席位'),
        actions: [
          IconButton(
            icon: const Icon(Icons.info_outline_rounded, color: AppTheme.goldLight),
            tooltip: '席位说明',
            onPressed: _showSeatInfo,
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppTheme.goldMain,
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return _buildSkeleton();
    if (_error) {
      return ListView(children: [
        SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.6,
          child: ErrorView(onRetry: _load),
        ),
      ]);
    }
    if (_projects.isEmpty) {
      return ListView(children: [
        SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.6,
          child: const EmptyView(
            icon: Icons.theater_comedy_rounded,
            title: '暂无开放认领的项目',
            subtitle: '新的自有 IP 项目上线后会第一时间出现在这里',
          ),
        ),
      ]);
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        final cols = Responsive.gridColumns(context, compact: 1);
        if (cols <= 1) {
          return ListView.builder(
            padding: Responsive.pagePadding(context)
                .add(const EdgeInsets.only(bottom: 100)),
            itemCount: _projects.length,
            itemBuilder: (_, i) => StaggerItem(
              index: i,
              child: SizedBox(
                height: 300,
                child: _ProjectCard(
                    project: _projects[i], onTap: () => _open(_projects[i])),
              ),
            ),
          );
        }
        return Center(
          child: ConstrainedBox(
            constraints:
                const BoxConstraints(maxWidth: Responsive.contentLimit),
            child: GridView.builder(
              padding: Responsive.pagePadding(context)
                  .add(const EdgeInsets.only(bottom: 100)),
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: cols,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                childAspectRatio: 0.76,
              ),
              itemCount: _projects.length,
              itemBuilder: (_, i) => StaggerItem(
                  index: i,
                  child: _ProjectCard(
                      project: _projects[i], dense: true, onTap: () => _open(_projects[i]))),
            ),
          ),
        );
      },
    );
  }

  Widget _buildSkeleton() {
    return LayoutBuilder(builder: (context, _) {
      final cols = Responsive.gridColumns(context, compact: 1);
      if (cols <= 1) {
        return ListView.builder(
          padding: Responsive.pagePadding(context),
          itemCount: 3,
          itemBuilder: (_, __) => const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: Skeleton(height: 240, radius: BorderRadius.all(Radius.circular(22))),
          ),
        );
      }
      return GridView.builder(
        padding: Responsive.pagePadding(context),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: cols,
          mainAxisSpacing: 16,
          crossAxisSpacing: 16,
          childAspectRatio: 0.76,
        ),
        itemCount: 6,
        itemBuilder: (_, __) =>
            const Skeleton(radius: BorderRadius.all(Radius.circular(22))),
      );
    });
  }

  void _showSeatInfo() {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surfaceDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
            22, 18, 22, 22 + MediaQuery.paddingOf(ctx).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('什么是角色席位？',
                style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                    fontFamily: AppTheme.serifFont)),
            const SizedBox(height: 12),
            const Text(
              '席位对应明确的内容交付物：出镜镜头、片尾署名、数字成片、参与证明等。\n\n'
              '认领期 45 天，达 80% 成团；未成团全额原路退回。\n\n'
              '席位不是投资、不涉及任何票房分账、收益分红或货币回报，请理性认领。',
              style: TextStyle(
                  color: AppTheme.textSecondary, fontSize: 13.5, height: 1.7),
            ),
            const SizedBox(height: 18),
            PrimaryButton(
              label: '我知道了',
              onPressed: () => Navigator.pop(ctx),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProjectCard extends StatelessWidget {
  final Map<String, dynamic> project;
  final bool dense;
  final VoidCallback onTap;
  const _ProjectCard(
      {required this.project, this.dense = false, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final claimed = (project['claimed'] as num?)?.toInt() ?? 0;
    final total = (project['total'] as num?)?.toInt() ?? 100;
    final percent = total == 0 ? 0.0 : (claimed / total).clamp(0.0, 1.0);
    final localCover = project['localCover'] as String?;
    final type = '${project['type'] ?? ''}';

    return Padding(
      padding: EdgeInsets.only(bottom: dense ? 0 : 16),
      child: GlassCard(
        padding: EdgeInsets.zero,
        radius: 22,
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(22)),
              child: SizedBox(
                height: dense ? 108 : 150,
                width: double.infinity,
                child: (localCover != null && localCover.isNotEmpty)
                    ? Image.asset(localCover, fit: BoxFit.cover)
                    : Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              Colors.white.withValues(alpha: 0.05),
                              AppTheme.cyanSoft.withValues(alpha: 0.10),
                              AppTheme.cyanDeep.withValues(alpha: 0.06),
                            ],
                          ),
                        ),
                        child: const Center(
                            child: Icon(Icons.movie_creation_outlined,
                                size: 44, color: AppTheme.iceHighlight)),
                      ),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (type.isNotEmpty) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                                color:
                                    AppTheme.goldMain.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                    color: AppTheme.goldMain
                                        .withValues(alpha: 0.25))),
                            child: Text(type,
                                style: const TextStyle(
                                    color: AppTheme.goldMain, fontSize: 11)),
                          ),
                          const SizedBox(width: 6),
                        ],
                        Expanded(
                          child: Text('${project['title']}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: AppTheme.textPrimary,
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  fontFamily: AppTheme.serifFont)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.person,
                            size: 13, color: AppTheme.textSecondary),
                        const SizedBox(width: 4),
                        Expanded(
                            child: Text(
                                '主演：${project['protagonist'] ?? '数字人主演'}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    color: AppTheme.textSecondary,
                                    fontSize: 12))),
                        Text('${project['roles'] ?? 0}个角色',
                            style: const TextStyle(
                                color: AppTheme.textSecondary, fontSize: 12)),
                      ],
                    ),
                    const Spacer(),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: percent.toDouble(),
                        backgroundColor:
                            Colors.white.withValues(alpha: 0.06),
                        valueColor:
                            const AlwaysStoppedAnimation(AppTheme.goldMain),
                        minHeight: 7,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Flexible(
                          child: Text('已认领 $claimed/$total 席',
                              maxLines: 1, overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: AppTheme.goldLight, fontSize: 12, fontWeight: FontWeight.bold)),
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text('剩余招募${project['days'] ?? 0}天',
                              maxLines: 1, textAlign: TextAlign.right, overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
