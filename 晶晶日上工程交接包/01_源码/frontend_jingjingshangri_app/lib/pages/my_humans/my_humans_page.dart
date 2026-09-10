import 'dart:io';
import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../services/user_provider.dart';
import '../../utils/motion.dart';
import '../../utils/responsive.dart';
import '../../widgets/state_views.dart';
import '../../widgets/press_scale.dart';
import '../audition/audition_page.dart';

/// 我的-我的数字人：只展示当前账号创建的数字人（本地持久化，断网可见）。
/// 与「艺人广场」（平台审核通过的公开艺人）严格区分，杜绝互相跳死循环。
class MyHumansPage extends StatefulWidget {
  final bool justCreated;
  const MyHumansPage({super.key, this.justCreated = false});

  @override
  State<MyHumansPage> createState() => _MyHumansPageState();
}

class _MyHumansPageState extends State<MyHumansPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final up = context.read<UserProvider>();
      if (up.isLoggedIn) up.syncOnlineHumans();
      if (widget.justCreated) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(const SnackBar(
            content: Text('数字人创建成功，审核通过后即可接单与生成作品'),
            behavior: SnackBarBehavior.floating,
          ));
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final humans = context.watch<UserProvider>().myHumans;
    return LiquidScaffold(
      appBar: AppBar(title: const Text('我的数字人')),
      floatingActionButton: humans.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: _goCreate,
              icon: const Icon(Icons.add),
              label: const Text('新建数字人'),
            ),
      body: RefreshIndicator(
        color: AppTheme.gold,
        onRefresh: () => context.read<UserProvider>().syncOnlineHumans(),
        child: humans.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(height: MediaQuery.of(context).size.height * 0.16),
                  EmptyView(
                    icon: Icons.person_add_alt_1_rounded,
                    title: '还没有数字人',
                    subtitle: '上传一张真人暖光照片，3 分钟创建你的数字分身',
                    actionText: '立即创建',
                    onAction: _goCreate,
                  ),
                ],
              )
            : LayoutBuilder(builder: (context, constraints) {
                final cols = Responsive.gridColumns(context);
                return GridView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(
                      14, 14, 14, 14 + MediaQuery.of(context).padding.bottom + 72),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: cols,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio: constraints.maxWidth >= 840 ? 0.95 : 0.82,
                  ),
                  itemCount: humans.length,
                  itemBuilder: (_, i) => _HumanCard(
                    human: humans[i],
                    onTap: () => _showHumanSheet(context, humans[i]),
                  ),
                );
              }),
      ),
    );
  }

  void _goCreate() {
    Navigator.push(context, Motion.fadeSlideRoute(const AuditionPage()));
  }

  /// 点击数字人卡片：按审核状态给出可回看的预期说明（纯引导，不改任何数据/状态）。
  void _showHumanSheet(BuildContext context, Map<String, dynamic> human) {
    final active = (human['status'] ?? 'pending').toString() == 'active';
    final points = active
        ? const [
            '数字人已在艺人广场展示，可被买家浏览与选中',
            '可承接祝福视频、品牌代言订单，收益自动进入钱包',
            '如需调整授权范围或形象，可再新建一个数字人',
          ]
        : const [
            '平台将在 1 个工作日内完成真人与合规审核',
            '审核通过后自动上架，即可接单并生成作品',
            '审核期间不影响你浏览剧场、发起定制剧',
          ];
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => Container(
        decoration: const BoxDecoration(
          color: AppTheme.surfaceDark,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
          border: Border(top: BorderSide(color: Color(0x26E6C586))),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(99))),
                ),
                const SizedBox(height: 14),
                Row(children: [
                  Icon(
                      active
                          ? Icons.verified_rounded
                          : Icons.hourglass_top_rounded,
                      color: active ? AppTheme.success : AppTheme.goldMain,
                      size: 20),
                  const SizedBox(width: 8),
                  Text(active ? '已上架 · 可以接单' : '审核中 · 等待平台审核',
                      style: const TextStyle(
                          color: AppTheme.goldLight,
                          fontSize: 16,
                          fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 14),
                for (final p in points)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 5,
                          height: 5,
                          margin: const EdgeInsets.only(top: 7),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: AppTheme.goldMain.withValues(alpha: 0.75),
                          ),
                        ),
                        const SizedBox(width: 9),
                        Expanded(
                          child: Text(p,
                              style: const TextStyle(
                                  color: AppTheme.textSecondary,
                                  fontSize: 13,
                                  height: 1.55)),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: PressScale(
                    borderRadius: BorderRadius.circular(AppTheme.radiusControl),
                    onTap: () => Navigator.pop(sheetCtx),
                    child: Container(
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        gradient: AppTheme.brandGradient,
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusControl),
                      ),
                      child: const Text('我知道了',
                          style: TextStyle(
                              color: AppTheme.onGold,
                              fontSize: 15,
                              fontWeight: FontWeight.w700)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HumanCard extends StatelessWidget {
  final Map<String, dynamic> human;
  final VoidCallback onTap;
  const _HumanCard({required this.human, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final status = (human['status'] ?? 'pending').toString();
    final statusText = (human['statusText'] ??
            (status == 'active' ? '已上架' : '审核中'))
        .toString();
    final scopes = <String>[
      if (human['scopeVideo'] == true) '视频定制',
      if (human['scopeEndorsement'] == true) '品牌代言',
      if (human['scopeFilm'] == true) '剧场参演',
    ];
    final localPhoto = human['localPhoto'] as String?;
    final localAsset = human['localAvatar'] as String?;

    return PressScale(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (localPhoto != null && File(localPhoto).existsSync())
                  Image.file(File(localPhoto), fit: BoxFit.cover)
                else if (localAsset != null)
                  Image.asset(localAsset, fit: BoxFit.cover)
                else
                  Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [AppTheme.bgGlowCard, AppTheme.surfaceDark],
                      ),
                    ),
                    child: const Center(
                      child: Icon(Icons.person,
                          size: 52, color: AppTheme.textHint),
                    ),
                  ),
                Positioned(
                  left: 8,
                  top: 8,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                    decoration: BoxDecoration(
                      color: status == 'active'
                          ? AppTheme.successDeep
                          : Colors.black.withValues(alpha: 0.62),
                      borderRadius: BorderRadius.circular(99),
                      border: Border.all(
                          color: status == 'active'
                              ? AppTheme.successLight
                              : AppTheme.goldMain.withValues(alpha: 0.5)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          status == 'active'
                              ? Icons.verified
                              : Icons.hourglass_top_rounded,
                          size: 12,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 4),
                        Text(statusText,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(11),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('${human['name'] ?? '我的数字人'}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: AppTheme.textPrimary,
                              fontSize: 15,
                              fontWeight: FontWeight.w800)),
                    ),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('${human['style'] ?? ''}',
                            style: const TextStyle(
                                color: AppTheme.goldLight, fontSize: 11.5)),
                        const Icon(Icons.chevron_right_rounded,
                            size: 16, color: AppTheme.textHint),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 7),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: (scopes.isEmpty ? ['视频定制'] : scopes)
                      .map((e) => Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2.5),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.05),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                  color: Colors.white.withValues(alpha: 0.08)),
                            ),
                            child: Text(e,
                                style: const TextStyle(
                                    color: AppTheme.textSecondary,
                                    fontSize: 10.5)),
                          ))
                      .toList(),
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
