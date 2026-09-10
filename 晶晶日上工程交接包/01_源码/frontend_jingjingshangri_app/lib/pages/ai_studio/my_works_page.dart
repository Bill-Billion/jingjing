import '../../widgets/app_network_image.dart';
import 'package:flutter/material.dart';
import '../../widgets/motion_fx.dart';
import '../../widgets/liquid_scaffold.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/user_provider.dart';
import '../../utils/motion.dart';
import '../../utils/responsive.dart';
import '../../widgets/state_views.dart';
import '../../widgets/press_scale.dart';
import 'ai_create_page.dart';

/// 我的作品：AI 文生图/文生视频成品（本地持久化，断网可见）。
class MyWorksPage extends StatefulWidget {
  const MyWorksPage({super.key});

  @override
  State<MyWorksPage> createState() => _MyWorksPageState();
}

class _MyWorksPageState extends State<MyWorksPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 3, vsync: this);

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final works = context.watch<UserProvider>().myWorks;
    final images = works.where((w) => w['kind'] == 'image').toList();
    final videos = works.where((w) => w['kind'] == 'video').toList();

    return LiquidScaffold(
      appBar: AppBar(
        title: const Text('我的作品'),
        bottom: TabBar(
          controller: _tab,
          indicatorColor: AppTheme.goldMain,
          labelColor: AppTheme.goldLight,
          unselectedLabelColor: AppTheme.textHint,
          tabs: const [
            Tab(text: '全部'),
            Tab(text: '图片'),
            Tab(text: '视频'),
          ],
        ),
      ),
      floatingActionButton: PressScale(
        onTap: () => Navigator.push(
            context, Motion.fadeSlideRoute(const AiCreatePage())),
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          decoration: BoxDecoration(
            gradient: AppTheme.brandGradientHorizontal,
            borderRadius: BorderRadius.circular(999),
            boxShadow: AppTheme.ctaGlow,
          ),
          child: const Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.auto_fix_high_rounded, size: 18, color: AppTheme.onGold),
            SizedBox(width: 8),
            Text('新建作品',
                style: TextStyle(
                    color: AppTheme.onGold, fontWeight: FontWeight.w700)),
          ]),
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _grid(works),
          _grid(images),
          _grid(videos),
        ],
      ),
    );
  }

  Widget _grid(List<Map<String, dynamic>> list) {
    if (list.isEmpty) {
      return const EmptyView(
        icon: Icons.auto_awesome_outlined,
        title: '还没有作品',
        subtitle: '用一段文字描述，AI 帮你生成图片或视频',
      );
    }
    return GridView.builder(
      padding: EdgeInsets.fromLTRB(
          14, 14, 14, 14 + MediaQuery.of(context).padding.bottom + 72),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: Responsive.gridColumns(context),
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 0.82,
      ),
      itemCount: list.length,
      itemBuilder: (_, i) => StaggerItem(
        index: i,
        child: _WorkCard(
          work: list[i],
          onDelete: () => _confirmDelete(list[i]),
        ),
      ),
    );
  }

  Future<void> _confirmDelete(Map<String, dynamic> w) async {
    final provider = context.read<UserProvider>();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppTheme.surfaceDark,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('删除这件作品？',
                style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: PressScale(
                    borderRadius: BorderRadius.circular(999),
                    onTap: () => Navigator.pop(ctx, false),
                    child: Container(
                      height: 46,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.04),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                      ),
                      child: const Text('取消', style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: PressScale(
                    borderRadius: BorderRadius.circular(999),
                    onTap: () => Navigator.pop(ctx, true),
                    child: Container(
                      height: 46,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppTheme.errorStrong.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: AppTheme.errorStrong.withValues(alpha: 0.5)),
                      ),
                      child: Text('删除', style: TextStyle(color: AppTheme.errorStrong, fontWeight: FontWeight.w700)),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
    if (ok == true) {
      await provider.removeMyWork('${w['taskId']}');
    }
  }
}

class _WorkCard extends StatelessWidget {
  final Map<String, dynamic> work;
  final VoidCallback onDelete;
  const _WorkCard({required this.work, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final isVideo = work['kind'] == 'video';
    final remote = ApiService().resolveUrl(work['resultUrl'] as String?);
    final local = work['localResult'] as String?;

    return GestureDetector(
      onLongPress: onDelete,
      child: Container(
        decoration: AppTheme.glassDecoration(radius: 16),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (local != null)
                    Image.asset(local, fit: BoxFit.cover)
                  else if (remote.isNotEmpty)
                    AppNetworkImage(
                        imageUrl: remote, fit: BoxFit.cover)
                  else
                    Container(
                      color: AppTheme.surfaceDark,
                      child: const Center(
                        child: Icon(Icons.image,
                            size: 40, color: AppTheme.textHint),
                      ),
                    ),
                  if (isVideo)
                    Container(
                      color: Colors.black.withValues(alpha: 0.28),
                      alignment: Alignment.center,
                      child: const Icon(Icons.play_circle_fill_rounded,
                          size: 46, color: Colors.white),
                    ),
                  Positioned(
                    right: 6,
                    top: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.6),
                        borderRadius: BorderRadius.circular(99),
                      ),
                      child: Text(isVideo ? '视频' : '图片',
                          style: const TextStyle(
                              color: Colors.white, fontSize: 10)),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(9),
              child: Text('${work['prompt'] ?? ''}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 11.5,
                      height: 1.4)),
            ),
          ],
        ),
      ),
    );
  }
}
