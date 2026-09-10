import '../../widgets/app_network_image.dart';
import 'package:flutter/material.dart';
import '../../widgets/state_views.dart';
import '../video_lib/video_play_page.dart';
import '../../widgets/motion_fx.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/primary_button.dart';
import '../../theme/app_theme.dart';
import '../../utils/haptics.dart';
import '../../utils/motion.dart';
import '../../services/api_service.dart';

/// V10 选剧库页面 - 按类型分类浏览对标剧本
class SampleLibraryPage extends StatefulWidget {
  final int? orderId;
  final String? selectedGenre;
  const SampleLibraryPage({super.key, this.orderId, this.selectedGenre});

  @override
  State<SampleLibraryPage> createState() => _SampleLibraryPageState();
}

class _SampleLibraryPageState extends State<SampleLibraryPage> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  Map<String, dynamic> _library = {};
  bool _loading = true;
  String? _loadError;

  static const _allGenres = ['古装逆袭', '都市甜宠', '悬疑推理', '家庭伦理', '青春校园', '职场商战', '军旅谍战'];

  @override
  void initState() {
    super.initState();
    final initialIndex = widget.selectedGenre != null
        ? _allGenres.indexOf(widget.selectedGenre!).clamp(0, _allGenres.length - 1)
        : 0;
    _tabController = TabController(length: _allGenres.length, vsync: this, initialIndex: initialIndex);
    _loadLibrary();
  }

  Future<void> _loadLibrary() async {
    try {
      final data = await ApiService().getSampleLibrary();
      if (mounted) {
        setState(() {
          _library = data['library'] as Map<String, dynamic>? ?? {};
          _loadError = null;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadError = '$e';
          _loading = false;
        });
      }
    }
  }

  // 青玻璃圆芯图标
  Widget _glassIcon(IconData icon, {double size = 56, double iconSize = 28}) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0x33FFFFFF), Color(0x167FD4E0), Color(0x0A3FA9C0)],
        ),
        border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.4)),
      ),
      child: Icon(icon, color: AppTheme.iceHighlight, size: iconSize),
    );
  }

  // 金竖条小标题
  Widget _miniTitle(String t) => Row(children: [
        Container(
          width: 3,
          height: 13,
          decoration: BoxDecoration(
              gradient: AppTheme.brandGradient,
              borderRadius: BorderRadius.circular(2)),
        ),
        const SizedBox(width: 6),
        Text(t,
            style: const TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 13,
                fontWeight: FontWeight.w700)),
      ]);

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(
        title: const Text('选剧库'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          labelColor: AppTheme.goldMain,
          unselectedLabelColor: AppTheme.textSecondary,
          indicatorColor: AppTheme.goldMain,
          indicatorWeight: 2.5,
          indicatorSize: TabBarIndicatorSize.label,
          labelStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
          unselectedLabelStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500),
          tabAlignment: TabAlignment.start,
          tabs: _allGenres.map((g) => Tab(text: g)).toList(),
        ),
      ),
      body: _loading
          ? const LoadingView()
          : (_loadError != null && _library.isEmpty)
              ? ErrorView(message: '网络开小差了，点击重试', onRetry: _loadLibrary)
              : TabBarView(
                  controller: _tabController,
                  children: _allGenres.map((genre) => _buildGenreList(genre)).toList(),
                ),
    );
  }

  Widget _buildGenreList(String genre) {
    final items = (_library[genre] as List?) ?? [];
    if (items.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _glassIcon(Icons.movie_creation_outlined, iconSize: 26),
            const SizedBox(height: 14),
            Text('$genre类剧本即将上线',
                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
          ],
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      itemBuilder: (context, i) => StaggerItem(index: i, child: _buildScriptCard(items[i] as Map<String, dynamic>)),
    );
  }

  Widget _buildScriptCard(Map<String, dynamic> item) {
    final characters = (item['characters'] as List?) ?? [];
    final tags = (item['tags'] as List?) ?? [];
    final marketData = item['market_data'] as Map<String, dynamic>? ?? {};

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GlassCard(
        padding: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHero(item),

            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (tags.isNotEmpty)
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: tags.map<Widget>((t) => Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                                color: AppTheme.goldMain.withValues(alpha: 0.10),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.2))),
                            child: Text(t.toString(),
                                style: const TextStyle(color: AppTheme.goldMain, fontSize: 11)),
                          )).toList(),
                    ),
                  const SizedBox(height: 10),
                  _miniTitle('故事大纲'),
                  const SizedBox(height: 4),
                  Text(
                    item['outline'] as String? ?? '',
                    style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.5),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 10),
                  if (characters.isNotEmpty) ...[
                    _miniTitle('主要人物'),
                    const SizedBox(height: 4),
                    Text(
                      characters.map((c) {
                        if (c is Map) return c['name']?.toString() ?? '';
                        return c.toString();
                      }).where((s) => s.isNotEmpty).join(' / '),
                      style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (marketData.isNotEmpty)
                    Row(
                      children: [
                        const Icon(Icons.trending_up_rounded, size: 14, color: AppTheme.goldMain),
                        const SizedBox(width: 4),
                        Text(
                          '热度${marketData['heat'] ?? item['heat_score'] ?? 0}  ${marketData['rating'] ?? ''}',
                          style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11),
                        ),
                      ],
                    ),
                  const SizedBox(height: 12),
                  if (widget.orderId != null)
                    PrimaryButton(
                      label: '选定此剧本',
                      onPressed: () => _pickReference(item),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ───────── 样片封面/播放入口 ─────────
  // 有 cover_url 显示真实封面；有 video_url 叠加播放钮进入真播放器；无视频维持原渐变标题头
  Widget _buildHero(Map<String, dynamic> item) {
    final title = item['title'] as String? ?? '未定名';
    final cover = (item['cover_url'] ?? '').toString();
    final video = (item['video_url'] ?? '').toString();
    final hasVideo = video.isNotEmpty;
    final coverUrl = ApiService().resolveUrl(cover);

    Widget body;
    if (cover.isNotEmpty && coverUrl.isNotEmpty) {
      body = Stack(
        fit: StackFit.expand,
        children: [
          AppNetworkImage(
            imageUrl: coverUrl,
            fit: BoxFit.cover,
            width: double.infinity,
            height: double.infinity,
            placeholder: (_, __) => _heroFallback(),
            errorWidget: (_, __, ___) => _heroFallback(),
          ),
          Positioned(
            left: 0, right: 0, bottom: 0, height: 74,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Color(0x8A000000)],
                ),
              ),
            ),
          ),
          Positioned(
            left: 12, right: hasVideo ? 84 : 12, bottom: 10,
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800,
                shadows: [Shadow(color: Colors.black54, blurRadius: 6)],
              ),
            ),
          ),
          if (hasVideo) ...[
            Center(
              child: Container(
                width: 46, height: 46,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.black.withValues(alpha: 0.42),
                  border: Border.all(color: AppTheme.goldLight, width: 1.4),
                ),
                child: const Icon(Icons.play_arrow_rounded, color: AppTheme.goldLight, size: 28),
              ),
            ),
            Positioned(right: 10, top: 10, child: _sampleBadge()),
          ],
        ],
      );
    } else {
      body = Stack(
        fit: StackFit.expand,
        children: [
          _heroFallback(),
          if (hasVideo) Positioned(right: 10, top: 10, child: _sampleBadge()),
        ],
      );
    }

    final clipped = ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      child: SizedBox(height: 120, width: double.infinity, child: body),
    );
    if (!hasVideo) return clipped;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _playSample(video, title),
      child: clipped,
    );
  }

  Widget _sampleBadge() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: AppTheme.gold.withValues(alpha: 0.18),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: AppTheme.goldLight.withValues(alpha: 0.55)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: const [
        Icon(Icons.play_circle_outline_rounded, color: AppTheme.goldLight, size: 13),
        SizedBox(width: 3),
        Text('观看样片', style: TextStyle(color: AppTheme.goldLight, fontSize: 10.5, fontWeight: FontWeight.w600)),
      ],
    ),
  );

  // 无封面/加载中/失败时的曜石渐变氛围底：只留图标；标题统一由封面底部遮罩层或下方卡片承担，避免重复
  Widget _heroFallback() => DecoratedBox(
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
    child: Center(
      child: _glassIcon(Icons.movie_creation_outlined, size: 48, iconSize: 24),
    ),
  );

  void _playSample(String videoPath, String title) {
    final url = ApiService().resolveUrl(videoPath);
    if (url.isEmpty) return;
    Haptics.tick();
    Navigator.push(context, Motion.fadeSlideRoute(VideoPlayPage(url: url, title: title)));
  }

  Future<void> _pickReference(Map<String, dynamic> item) async {
    try {
      await ApiService().pickSampleReference(widget.orderId!, item['id'] as int);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('对标剧本已选定，编剧开始创作')));
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('选定失败：$e')));
    }
  }
}
