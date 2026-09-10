import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../utils/responsive.dart';
import '../../utils/motion.dart';
import '../../utils/perf_trace.dart';
import '../../utils/money.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/glass_icon.dart';
import '../../widgets/liquid_glass.dart';
import '../../widgets/brand_mark.dart';
import '../../widgets/motion_fx.dart';
import '../../widgets/press_scale.dart';
import '../project_detail/project_detail_page.dart';
import '../human_detail/human_detail_page.dart';
import '../humans/humans_page.dart';
import '../messages/messages_page.dart';
import '../projects/projects_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  List<Map<String, dynamic>> _projects = [];
  bool _projectsLoading = true;
  int _tabIndex = 0;

  final List<String> _tabs = const ['推荐', '祝福·代言', '新人'];

  // 全量艺人（接口一次拉取，前端按 Tab 做确定性筛选/排序）
  List<Map<String, dynamic>> _allArtists = [];
  List<Map<String, dynamic>> _artists = [];
  bool _artistsLoading = true;
  bool _artistsError = false;

  @override
  void initState() {
    super.initState();
    PerfTrace.stamp('home initState');
    _loadProjects();
    _loadArtists();
  }

  Future<void> _loadArtists() async {
    // Gate0 F-R3：已有艺人数据时后台/下拉刷新不回骨架，仅首屏无数据显示骨架
    final bool initial = _allArtists.isEmpty;
    setState(() {
      _artistsLoading = initial;
      _artistsError = false;
    });
    try {
      final list = await ApiService().getHumans(params: {'pageSize': '30', 'rank': 'hot'});
      if (!mounted) return;
      final mapped = list.take(12).map((e) {
        final h = Map<String, dynamic>.from(e as Map);
        final tags = (h['tags'] as List?)?.map((x) => '$x').toList() ?? const [];
        return <String, dynamic>{
          'name': h['name'] ?? '数字人艺人',
          'tag': tags.isNotEmpty ? tags.join(' / ') : (h['specialty'] ?? '数字人定制'),
          'price': (h['price'] ?? h['minPrice'] ?? 99),
          'sales': (h['sales'] ?? h['heat'] ?? 0) as num,
          'img': h['localAvatar'],
          'remoteImg': h['avatar'],
          'grade': h['qualityGrade'] ?? 'B',
          'specialty': '${h['specialty'] ?? ''}',
          'raw': h,
        };
      }).toList();
      setState(() {
        _allArtists = mapped;
        _applyTab();
        _artistsLoading = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) =>
          PerfTrace.stamp('home artists meaningful frame', meta: 'n=${mapped.length}'));
    } catch (_) {
      if (mounted) {
        // Gate0 F-R3：已有旧数据时刷新失败保留旧值，不踢回整页错误
        setState(() {
          _artistsLoading = false;
          if (_allArtists.isEmpty) _artistsError = true;
        });
      }
    }
  }

  // Tab 真正生效：推荐按销量、祝福·代言按业务标签、新人按销量从低到高
  void _applyTab() {
    List<Map<String, dynamic>> v = List.of(_allArtists);
    if (_tabIndex == 1) {
      v = v.where((a) {
        final t = '${a['tag']}${a['specialty']}';
        return t.contains('祝福') || t.contains('代言') || t.contains('口播') || t.contains('商务');
      }).toList();
      if (v.isEmpty) v = List.of(_allArtists); // 演示数据不足时回退，避免空屏
    } else if (_tabIndex == 2) {
      v.sort((a, b) => (a['sales'] as num).compareTo(b['sales'] as num));
    } else {
      v.sort((a, b) => (b['sales'] as num).compareTo(a['sales'] as num));
    }
    _artists = v.take(6).toList();
  }

  Future<void> _loadProjects() async {
    // Gate0 F-R3：已有项目数据时刷新不回骨架
    if (_projects.isEmpty) setState(() => _projectsLoading = true);
    try {
      final list = await ApiService().getProjects(params: {'pageSize': '10'});
      if (mounted) {
        setState(() {
          _projects = list.cast<Map<String, dynamic>>();
          _projectsLoading = false;
        });
        WidgetsBinding.instance.addPostFrameCallback((_) =>
            PerfTrace.stamp('home projects meaningful frame', meta: 'n=${list.length}'));
      }
    } catch (e) {
      if (mounted) setState(() => _projectsLoading = false);
    }
  }

  void _push(Widget page) =>
      Navigator.push(context, Motion.fadeSlideRoute(page));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // 流光背景统一由 MainScaffold 承载，本页透明透出，避免双层背景与多套动画
      backgroundColor: Colors.transparent,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: _buildHeader()),
          SliverToBoxAdapter(child: _buildTabs()),
          SliverToBoxAdapter(child: _buildBanner()),
          SliverToBoxAdapter(child: _buildQuickActions()),
          SliverToBoxAdapter(
              child: _buildSectionTitle('热门艺人', '艺人广场 · 查看全部',
                  () => _push(const HumansPage()))),
          SliverToBoxAdapter(child: _buildArtistSection()),
          SliverToBoxAdapter(
              child: _buildSectionTitle('晶晶日上', '圆梦 · 更多',
                  () => _push(const ProjectsPage()))),
          SliverToBoxAdapter(child: _buildProjectList()),
          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }

  // ── 顶部：衬线品牌名 + 搜索/消息 ──
  Widget _buildHeader() {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 16, 4),
        child: Row(
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // V15.2：位图青玻璃金芒 Logo + 白色衬线字标
                const BrandMark(size: 38, glow: false),
                const SizedBox(width: 9),
                const Text('晶晶日上',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        fontFamily: AppTheme.serifFont,
                        letterSpacing: 3)),
              ],
            ),
            const Spacer(),
            _circleIcon(Icons.search, () => _push(const HumansPage())),
            const SizedBox(width: 10),
            _circleIcon(Icons.forum, () => _push(const MessagesPage())),
          ],
        ),
      ),
    );
  }

  Widget _circleIcon(IconData icon, VoidCallback onTap) {
    return LiquidGlass(
      radius: 999,
      halo: false,
      sheen: true,
      bright: true,
      padding: const EdgeInsets.all(9),
      onTap: onTap,
      child: Icon(icon, color: AppTheme.cyanSoft, size: 20),
    );
  }

  // ── 胶囊 Tab：选中暖金实心+深色字，切换真实筛选艺人 ──
  Widget _buildTabs() {
    return Container(
      height: 44,
      margin: const EdgeInsets.symmetric(vertical: 10),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _tabs.length,
        itemBuilder: (_, i) {
          final selected = i == _tabIndex;
          return GestureDetector(
            onTap: () => setState(() {
              _tabIndex = i;
              _applyTab();
            }),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: Motion.short),
              curve: Motion.inOut,
              margin: const EdgeInsets.only(right: 10),
              padding: const EdgeInsets.symmetric(horizontal: 22),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                gradient: selected ? AppTheme.brandGradientHorizontal : null,
                color: selected
                    ? null
                    : AppTheme.aquaBright.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: selected
                      ? Colors.transparent
                      : AppTheme.rimCyan.withValues(alpha: 0.55),
                ),
                boxShadow: selected ? AppTheme.brandShadowSmall : null,
              ),
              child: Text(
                _tabs[i],
                style: TextStyle(
                  color: selected ? AppTheme.onGold : AppTheme.textSecondary,
                  fontSize: 13.5,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ── 聚光灯 Banner（16:9 影院感），点按进圆梦 ──
  Widget _buildBanner() {
    return GestureDetector(
      onTap: () => _push(const ProjectsPage()),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16),
        height: 168,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: AppTheme.aquaBright.withValues(alpha: 0.28),
              blurRadius: 26,
              offset: const Offset(0, 8),
            ),
            BoxShadow(
              color: AppTheme.goldMain.withValues(alpha: 0.12),
              blurRadius: 18,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.asset('assets/images/banner.jpg', fit: BoxFit.cover),
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [
                      Colors.black.withValues(alpha: 0.62),
                      Colors.black.withValues(alpha: 0.12),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppTheme.goldMain.withValues(alpha: 0.9),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text('JINGJING RISING',
                          style: TextStyle(
                              color: AppTheme.onGold,
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1)),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      '做自己人生的主角',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          fontFamily: AppTheme.serifFont,
                          letterSpacing: 1),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'AI 数字人 · 定制祝福与专属影片',
                      style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.82),
                          fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              Positioned(
                right: 16,
                top: 0,
                bottom: 0,
                child: Center(
                  child: Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withValues(alpha: 0.18),
                      border: Border.all(
                          color: Colors.white.withValues(alpha: 0.4)),
                    ),
                    child: const Icon(Icons.chevron_right_rounded,
                        color: Colors.white, size: 22),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── 金刚区：五个统一「玻璃圆芯 + 金色线性图标」，点按进艺人广场对应场景 ──
  Widget _buildQuickActions() {
    final actions = [
      {'icon': Icons.cake, 'label': '生日'},
      {'icon': Icons.favorite_border_rounded, 'label': '婚礼'},
      {'icon': Icons.business_center_outlined, 'label': '企业'},
      {'icon': Icons.school, 'label': '毕业'},
      {'icon': Icons.apps, 'label': '更多'},
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: actions.map((a) {
            return GestureDetector(
              onTap: () => _push(const HumansPage()),
              child: Column(
                children: [
                  GlassIconCore(icon: a['icon'] as IconData, size: 54),
                  const SizedBox(height: 8),
                  Text(
                    a['label'] as String,
                    style: const TextStyle(
                        color: AppTheme.textPrimary,
                        fontSize: 12,
                        fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            );
        }).toList(),
      ),
    );
  }

  Widget _buildSectionTitle(String title, String action, VoidCallback onMore) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 12),
      child: Row(
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
          Text(
            title,
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 19,
              fontWeight: FontWeight.w900,
              fontFamily: AppTheme.serifFont,
            ),
          ),
          const SizedBox(width: 5),
          const Icon(Icons.auto_awesome, size: 14, color: AppTheme.goldMain),
          const Spacer(),
          GestureDetector(
            onTap: onMore,
            behavior: HitTestBehavior.opaque,
            child: Row(
              children: [
                Text(action,
                    style: const TextStyle(
                        color: AppTheme.textSecondary, fontSize: 12)),
                const Icon(Icons.chevron_right_rounded,
                    size: 16, color: AppTheme.textSecondary),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── 电影海报式艺人卡：骨架 / 错误重试 / 数据三态 ──
  Widget _buildArtistSection() {
    if (_artistsLoading) {
      return Padding(
        padding: Responsive.pagePadding(context),
        child: GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: Responsive.gridColumns(context),
            childAspectRatio: Responsive.childAspectRatio(context, compact: 0.66),
            crossAxisSpacing: 12, mainAxisSpacing: 12,
          ),
          itemCount: 4,
          itemBuilder: (_, __) => const Skeleton(
              radius: BorderRadius.all(Radius.circular(20))),
        ),
      );
    }
    if (_artistsError) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Column(
          children: [
            const Icon(Icons.cloud_off_rounded, color: AppTheme.textHint, size: 34),
            const SizedBox(height: 8),
            const Text('艺人列表加载失败',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
            const SizedBox(height: 10),
            PressScale(
              onTap: _loadArtists,
              borderRadius: BorderRadius.circular(999),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.4)),
                ),
                child: const Text('点击重试',
                    style: TextStyle(color: AppTheme.goldLight, fontSize: 13, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      );
    }
    if (_artists.isEmpty) return const SizedBox.shrink();
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: Responsive.pagePadding(context),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: Responsive.gridColumns(context),
        childAspectRatio: Responsive.childAspectRatio(context, compact: 0.66),
        crossAxisSpacing: 12, mainAxisSpacing: 12,
      ),
      itemCount: _artists.length,
      itemBuilder: (context, i) => StaggerItem(index: i, child: _buildArtistCard(_artists[i])),
    );
  }

  // 无封面 / 加载中 / 加载失败统一兜底：品牌渐变 + 线性人像，绝不纯黑空块
  Widget _artistCoverPlaceholder() => const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [AppTheme.bgGlowCard, AppTheme.surfaceDark],
          ),
        ),
        child: Center(
            child: Icon(Icons.person_outline_rounded,
                size: 48, color: AppTheme.goldMain)),
      );

  Widget _buildArtistCard(Map<String, dynamic> a) {
    final grade = a['grade'] as String;
    return GestureDetector(
      onTap: () => _push(HumanDetailPage(
          human: (a['raw'] is Map)
              ? Map<String, dynamic>.from(a['raw'] as Map)
              : a)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.35)),
          boxShadow: [
            BoxShadow(
                color: AppTheme.aquaBright.withValues(alpha: 0.16),
                blurRadius: 14,
                offset: const Offset(0, 4)),
            BoxShadow(
                color: Colors.black.withValues(alpha: 0.32),
                blurRadius: 12,
                offset: const Offset(0, 4)),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: Stack(
            fit: StackFit.expand,
            children: [
              (a['img'] != null)
                ? Image.asset(
                    a['img'] as String,
                    fit: BoxFit.cover,
                    // asset 首帧解码完成前也显示品牌渐变占位，绝不露纯黑
                    frameBuilder: (_, child, frame, __) =>
                        frame == null ? _artistCoverPlaceholder() : child,
                    errorBuilder: (_, __, ___) => _artistCoverPlaceholder(),
                  )
                : (a['remoteImg'] != null && '${a['remoteImg']}'.isNotEmpty)
                  ? Image.network(
                      ApiService().resolveUrl(a['remoteImg'] as String?),
                      fit: BoxFit.cover,
                      // 以「是否出帧」为准：加载中/首帧前与失败都回落品牌渐变，绝不露纯黑
                      frameBuilder: (_, child, frame, __) =>
                          frame == null ? _artistCoverPlaceholder() : child,
                      errorBuilder: (_, __, ___) => _artistCoverPlaceholder(),
                    )
                  : _artistCoverPlaceholder(),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Colors.transparent,
                        Colors.black.withValues(alpha: 0.55),
                        Colors.black.withValues(alpha: 0.82),
                      ],
                      stops: const [0, 0.45, 0.78, 1],
                    ),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                left: 8,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    gradient: AppTheme.brandGradient,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    grade == 'S' ? '金牌' : '$grade 级',
                    style: const TextStyle(
                        color: AppTheme.onGold,
                        fontSize: 10,
                        fontWeight: FontWeight.w800),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.local_fire_department_rounded,
                          size: 11, color: AppTheme.goldMain),
                      const SizedBox(width: 3),
                      Text('${a['sales']}',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: 10,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      a['name'] as String,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        fontFamily: AppTheme.serifFont,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            a['tag'] as String,
                            style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.72),
                                fontSize: 10.5),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 9, vertical: 3),
                          decoration: BoxDecoration(
                            gradient: AppTheme.brandGradient,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            Money.rmbInt(a['price']),
                            style: const TextStyle(
                                color: AppTheme.onGold,
                                fontSize: 12,
                                fontWeight: FontWeight.w900),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildProjectList() {
    if (_projectsLoading) {
      return SizedBox(
        height: 200,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemCount: 3,
          itemBuilder: (_, __) => const ProjectSkeletonCard(),
        ),
      );
    }
    final list = _projects.isEmpty ? _defaultProjects() : _projects;
    return SizedBox(
      height: 200,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: list.length,
        itemBuilder: (_, i) => StaggerItem(index: i, child: _buildProjectCard(list[i])),
      ),
    );
  }

  List<Map<String, dynamic>> _defaultProjects() => const [
        {'title': '黄帝史诗·天下合', 'type': '古装史诗', 'localCover': 'assets/images/theater_1.jpg', 'seatsClaimed': 72, 'seatsTotal': 100},
        {'title': '少年龙武', 'type': '热血成长', 'localCover': 'assets/images/theater_3.jpg', 'seatsClaimed': 45, 'seatsTotal': 100},
        {'title': '边境暗影', 'type': '悬疑短剧', 'localCover': 'assets/images/theater_2.jpg', 'seatsClaimed': 28, 'seatsTotal': 100},
      ];

  Widget _buildProjectCard(Map<String, dynamic> p) {
    final img = p['localCover'] as String? ??
        (p['img'] as String? ?? 'assets/images/theater_1.jpg');
    // 进度按席位认领比例（整数名额），不用制作预算金额
    final raised = ((p['seatsClaimed'] ?? p['claimed']) as num? ?? 0).toDouble();
    final goal = ((p['seatsTotal'] ?? p['total']) as num? ?? 100).toDouble();
    final percent = (p['percent'] is double
            ? p['percent'] as double
            : (goal == 0 ? 0.0 : raised / goal))
        .clamp(0.0, 1.0);

    return GestureDetector(
      onTap: () => _push(ProjectDetailPage(project: p)),
      child: Container(
        width: 220,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0x1FFFFFFF), Color(0x127FD4E0), Color(0x0F15223A)],
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.35)),
          boxShadow: [
            BoxShadow(
                color: AppTheme.aquaBright.withValues(alpha: 0.14),
                blurRadius: 12,
                offset: const Offset(0, 4)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(20)),
              child: Image.asset(img,
                  height: 110, width: double.infinity, fit: BoxFit.cover),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('《${p['title']}》',
                      style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          fontFamily: AppTheme.serifFont),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppTheme.goldMain.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(p['type'] as String? ?? '',
                        style: const TextStyle(
                            color: AppTheme.goldLight,
                            fontSize: 10,
                            fontWeight: FontWeight.w600)),
                  ),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: percent.toDouble(),
                      backgroundColor: Colors.white.withValues(alpha: 0.06),
                      valueColor:
                          const AlwaysStoppedAnimation(AppTheme.goldMain),
                      minHeight: 5,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 横滑项目卡骨架占位。
class ProjectSkeletonCard extends StatelessWidget {
  const ProjectSkeletonCard({super.key});
  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      width: 220,
      child: Skeleton(radius: BorderRadius.all(Radius.circular(20))),
    );
  }
}
