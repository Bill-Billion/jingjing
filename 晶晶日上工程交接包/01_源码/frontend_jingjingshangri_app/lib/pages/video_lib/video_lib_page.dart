import 'package:flutter/material.dart';
import '../../widgets/motion_fx.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../utils/money.dart';
import '../../utils/motion.dart';
import '../../utils/responsive.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import '../../widgets/press_scale.dart';
import '../humans/humans_page.dart';
import '../ai_studio/my_works_page.dart';
import 'video_play_page.dart';

/// 我的视频：我购买的 / 我收到的，数据走 /api/videos/my、/api/videos/received，
/// 断网时 _guard 自动回退 MockData，保证闭环可演示。
class VideoLibPage extends StatelessWidget {
  const VideoLibPage({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: LiquidScaffold(
        appBar: AppBar(
          title: const Text('我的视频'),
          bottom: TabBar(
            labelColor: AppTheme.goldMain,
            unselectedLabelColor: AppTheme.textSecondary,
            indicatorColor: AppTheme.goldMain,
            indicatorSize: TabBarIndicatorSize.label,
            tabs: const [Tab(text: '我购买的'), Tab(text: '我收到的')],
          ),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: PressScale(
                borderRadius: BorderRadius.circular(999),
                onTap: () => Navigator.push(
                  context,
                  Motion.fadeSlideRoute(const MyWorksPage()),
                ),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.28)),
                  ),
                  child: const Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.auto_awesome, size: 15, color: AppTheme.goldMain),
                    SizedBox(width: 5),
                    Text('我的AI作品', style: TextStyle(color: AppTheme.goldLight, fontSize: 12, fontWeight: FontWeight.w600)),
                  ]),
                ),
              ),
            ),
          ],
        ),
        body: const TabBarView(
          children: [
            _VideoList(mode: _VideoMode.bought),
            _VideoList(mode: _VideoMode.received),
          ],
        ),
      ),
    );
  }
}

enum _VideoMode { bought, received }

class _VideoList extends StatefulWidget {
  final _VideoMode mode;
  const _VideoList({required this.mode});

  @override
  State<_VideoList> createState() => _VideoListState();
}

class _VideoListState extends State<_VideoList> {
  final ApiService _api = ApiService();
  List<dynamic> _list = [];
  bool _loading = true;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final list = widget.mode == _VideoMode.bought
          ? await _api.getMyVideos()
          : await _api.getReceivedVideos();
      if (!mounted) return;
      setState(() {
        _list = list;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return _buildSkeleton();
    if (_error) {
      return ErrorView(message: '视频加载失败', onRetry: _load);
    }
    if (_list.isEmpty) {
      return EmptyView(
        icon: Icons.video_library_outlined,
        title: '暂无视频',
        subtitle: widget.mode == _VideoMode.bought
            ? '下单并交付后，成片会出现在这里'
            : '好友为你定制的视频，交付后会出现在这里',
        actionText: '去艺人广场看看',
        onAction: () => Navigator.push(
          context,
          Motion.fadeSlideRoute(const HumansPage()),
        ),
      );
    }
    return RefreshIndicator(
      color: AppTheme.goldMain,
      backgroundColor: AppTheme.surfaceDark,
      onRefresh: _load,
      child: ListView.separated(
        padding: Responsive.pagePadding(context).copyWith(top: 14, bottom: 28),
        itemCount: _list.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) => StaggerItem(index: i, child: _VideoCard(item: _list[i] as Map<String, dynamic>)),
      ),
    );
  }

  Widget _buildSkeleton() {
    return ListView.separated(
      padding: Responsive.pagePadding(context).copyWith(top: 14),
      itemCount: 4,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (_, __) => Container(
        padding: const EdgeInsets.all(12),
        decoration: AppTheme.glassDecoration(radius: 18),
        child: Row(
          children: [
            const Skeleton(width: 96, height: 68, radius: BorderRadius.all(Radius.circular(12))),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Skeleton(width: 140, height: 14, radius: BorderRadius.all(Radius.circular(7))),
                  SizedBox(height: 10),
                  Skeleton(width: 200, height: 11, radius: BorderRadius.all(Radius.circular(6))),
                  SizedBox(height: 10),
                  Skeleton(width: 90, height: 11, radius: BorderRadius.all(Radius.circular(6))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _VideoCard extends StatelessWidget {
  final Map<String, dynamic> item;
  const _VideoCard({required this.item});

  ({String text, Color color}) _status() {
    switch (item['status']) {
      case 'paid':
      case 'delivering':
        return (text: '制作中', color: AppTheme.goldMain);
      case 'completed':
      case 'delivered':
        return (text: '已交付', color: AppTheme.success);
      case 'redo':
        return (text: '返修中', color: AppTheme.warning);
      default:
        return (text: '处理中', color: AppTheme.textSecondary);
    }
  }

  @override
  Widget build(BuildContext context) {
    final st = _status();
    final url = (item['videoUrl'] ?? '').toString();
    final delivered = url.isNotEmpty;
    return Container(
      decoration: AppTheme.glassDecoration(radius: 18),
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: delivered ? () => _play(context, url) : null,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 96,
                height: 68,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    const ColoredBox(
                      color: AppTheme.surfaceDark,
                      child: Icon(Icons.movie_creation_outlined,
                          color: AppTheme.textHint, size: 26),
                    ),
                    Center(
                      child: Container(
                        width: 30,
                        height: 30,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.black.withValues(alpha: 0.5),
                        ),
                        child: Icon(
                          delivered ? Icons.play_arrow_rounded : Icons.hourglass_top_rounded,
                          color: delivered ? AppTheme.goldMain : AppTheme.textHint,
                          size: 19,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        (item['title'] ?? '定制视频').toString(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: AppTheme.textPrimary,
                            fontSize: 15,
                            fontWeight: FontWeight.w700),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: st.color.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(st.text,
                          style: TextStyle(
                              color: st.color, fontSize: 11, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  '艺人：${item['talentName'] ?? '数字人艺人'}',
                  style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                ),
                if ((item['recipient'] ?? '').toString().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(
                      '送给：${item['recipient']}',
                      style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                    ),
                  ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        item['createdAt']?.toString() ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppTheme.textHint, fontSize: 11),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      Money.rmb(item['amount']),
                      style: const TextStyle(
                          color: AppTheme.goldMain, fontSize: 13, fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _play(BuildContext context, String url) {
    final full = ApiService().resolveUrl(url);
    if (full.isEmpty) return;
    Navigator.push(
      context,
      Motion.fadeSlideRoute(VideoPlayPage(
        url: full,
        title: (item['title'] ?? '成片播放').toString(),
      )),
    );
  }
}
