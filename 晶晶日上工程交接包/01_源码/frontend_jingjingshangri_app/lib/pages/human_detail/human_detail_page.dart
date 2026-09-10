import '../../utils/money.dart';
import 'dart:ui';
import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/motion_fx.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/app_network_image.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../video_order/video_order_page.dart';
import '../endorsement/endorsement_page.dart';
import '../chat/chat_page.dart';
import '../../utils/motion.dart';
import '../../utils/pricing.dart';

class HumanDetailPage extends StatefulWidget {
  final Map<String, dynamic> human;
  const HumanDetailPage({super.key, required this.human});

  @override
  State<HumanDetailPage> createState() => _HumanDetailPageState();
}

class _HumanDetailPageState extends State<HumanDetailPage> {
  Map<String, dynamic>? _detail;
  List<dynamic> _reviews = const [];
  bool _reviewsLoading = true;
  bool _reviewsError = false;

  @override
  void initState() {
    super.initState();
    _loadDetail();
    _loadReviews();
  }

  int? get _humanId {
    final id = widget.human['id'] ?? widget.human['humanId'];
    if (id == null) return null;
    return id is int ? id : int.tryParse(id.toString());
  }

  Future<void> _loadDetail() async {
    try {
      final id = _humanId;
      if (id != null) {
        final data = await ApiService().getHumanDetail(id);
        if (mounted) setState(() => _detail = data);
      }
    } catch (e) {
      // 使用传入的 human 数据兜底
    }
  }

  // 用户评价：接真实接口（_guard 在 demo/离线回退本地评价），单区加载/错误重试/空态，不影响详情主体
  Future<void> _loadReviews() async {
    setState(() {
      _reviewsLoading = true;
      _reviewsError = false;
    });
    try {
      final id = _humanId;
      if (id == null) {
        if (mounted) setState(() => _reviewsLoading = false);
        return;
      }
      final data = await ApiService().getTalentReviews(id);
      final list = (data['list'] as List?) ?? const [];
      if (mounted) {
        setState(() {
          _reviews = list;
          _reviewsLoading = false;
        });
      }
    } catch (_) {
      // online 强制在线失败时暴露错误，给区内角标重试，不拖垮整页（主体仍由传入 human 渲染）
      if (mounted) {
        setState(() {
          _reviewsError = true;
          _reviewsLoading = false;
        });
      }
    }
  }

  void _openChat() {
    final h = _detail ?? widget.human;
    final canMessage = h['canMessage'] == true || h['purchased'] == true;
    if (!canMessage) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('下单后可与艺人私信沟通订单细节')),
      );
      return;
    }
    Navigator.push(context, Motion.fadeSlideRoute(ChatPage(human: Map<String, dynamic>.from(h))));
  }

  @override
  Widget build(BuildContext context) {
    final h = _detail ?? widget.human;
    final num price = h['price'] ?? h['minPrice'] ?? Pricing.videoMinPrice;
    final localAvatar = h['localAvatar'] as String?;
    final avatarUrl = localAvatar != null
        ? null
        : ApiService().resolveUrl(h['avatar'] as String?);

    return LiquidScaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              // 艺人大图
              SliverAppBar(
                expandedHeight: 420,
                pinned: true,
                backgroundColor: AppTheme.background,
                leading: GestureDetector(
                  onTap: () => Navigator.pop(context),
                  child: Container(
                    margin: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.35),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.arrow_back_rounded,
                        color: Colors.white),
                  ),
                ),
                flexibleSpace: FlexibleSpaceBar(
                  background: Stack(
                    fit: StackFit.expand,
                    children: [
                      Hero(
                        tag: 'humanHero-${h['id'] ?? h['name']}',
                        child: Builder(builder: (_) {
                          if (localAvatar != null) {
                            return Image.asset(localAvatar, fit: BoxFit.cover);
                          }
                          if (avatarUrl != null && avatarUrl.isNotEmpty) {
                            return AppNetworkImage(
                              imageUrl: avatarUrl,
                              fit: BoxFit.cover,
                              placeholder: (_, __) => Container(
                                  color:
                                      AppTheme.cardLight.withValues(alpha: 0.4)),
                              errorWidget: (_, __, ___) => Container(
                                decoration: const BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [
                                      AppTheme.cardLight,
                                      AppTheme.background
                                    ],
                                  ),
                                ),
                                child: const Center(
                                  child: Icon(Icons.person_outline_rounded, size: 80, color: AppTheme.textHint),
                                ),
                              ),
                            );
                          }
                          return Container(
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [
                                  AppTheme.cardLight,
                                  AppTheme.background
                                ],
                              ),
                            ),
                            child: const Center(
                              child: Icon(Icons.person_outline_rounded, size: 80, color: AppTheme.textHint),
                            ),
                          );
                        }),
                      ),
                      // 底部渐变
                      Positioned(
                        bottom: 0,
                        left: 0,
                        right: 0,
                        child: Container(
                          height: 140,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.transparent,
                                AppTheme.background
                                    .withValues(alpha: 0.8),
                                AppTheme.background,
                              ],
                            ),
                          ),
                        ),
                      ),
                      // 艺人名 + 标签
                      Positioned(
                        bottom: 20,
                        left: 20,
                        right: 20,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  h['name'] as String? ?? '艺人',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 28,
                                    fontWeight: FontWeight.w900,
                                    fontFamily: AppTheme.serifFont,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                if (h['qualityGrade'] != null &&
                                    h['qualityGrade'] != 'B')
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      gradient: h['qualityGrade'] == 'S'
                                          ? AppTheme.brandGradient
                                          : const LinearGradient(colors: [
                                              AppTheme.cyanDeep,
                                              AppTheme.goldDeep
                                            ]),
                                      borderRadius:
                                          BorderRadius.circular(999),
                                    ),
                                    child: Text(
                                      h['qualityGrade'] == 'S'
                                          ? '金牌艺人'
                                          : '${h['qualityGrade']}级',
                                      style: const TextStyle(
                                          color: AppTheme.onGold,
                                          fontSize: 10,
                                          fontWeight: FontWeight.w800),
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              h['desc'] as String? ??
                                  h['specialty'] as String? ??
                                  '',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.7),
                                fontSize: 14,
                              ),
                            ),
                          ],
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
                      // 毛玻璃数据卡
                      StaggerItem(
                          index: 0, child: _buildGlassStats(h)),
                      const SizedBox(height: 24),
                      // 服务套餐
                      _buildSectionTitle('服务套餐'),
                      const SizedBox(height: 12),
                      StaggerItem(
                        index: 1,
                        child: _serviceCard(
                        icon: Icons.video_call_rounded,
                        title: '祝福视频',
                        desc: '数字人口播视频 · 社交见面礼\n下单后可与艺人私信沟通',
                        price: price.toInt(),
                        color: AppTheme.goldMain,
                        onTap: () => Navigator.push(
                            context,
                            Motion.fadeSlideRoute(VideoOrderPage(
                                    human:
                                        Map<String, dynamic>.from(h)))),
                        ),
                      ),
                      const SizedBox(height: 12),
                      StaggerItem(
                        index: 2,
                        child: _serviceCard(
                        icon: Icons.campaign,
                        title: '品牌代言',
                        desc: '数字人品牌代言，含视频+图片素材',
                        price: Pricing.endorsementSingle.toInt(),
                        color: AppTheme.cyanDeep,
                        onTap: () => Navigator.push(
                            context,
                            Motion.fadeSlideRoute(EndorsementPage(
                                    human:
                                        Map<String, dynamic>.from(h)))),
                        ),
                      ),
                      const SizedBox(height: 24),
                      // 用户评价
                      _buildSectionTitle('用户评价'),
                      const SizedBox(height: 12),
                      StaggerItem(index: 3, child: _buildReviews(h)),
                      const SizedBox(height: 100),
                    ],
                  ),
                ),
              ),
            ],
          ),
          // 底部胶囊 CTA
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _buildBottomBar(h),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
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
        Text(
          title,
          style: const TextStyle(
            color: AppTheme.textPrimary,
            fontSize: 19,
            fontWeight: FontWeight.w900,
            fontFamily: AppTheme.serifFont,
          ),
        ),
      ],
    );
  }

  Widget _buildGlassStats(Map<String, dynamic> h) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 20),
          decoration: AppTheme.glassDecoration(radius: 24),
          child: Row(
            children: [
              _statItem(Icons.star, '${h['avgRating'] ?? '5.0'}', '评分', AppTheme.goldMain),
              _divider(),
              _statItem(Icons.local_fire_department_rounded, '${h['sales'] ?? 0}', '订单', AppTheme.goldAccent),
              _divider(),
              _statItem(Icons.verified,
                  h['verifiedLevel'] == 'gold' ? '金标' : '认证', '资质', AppTheme.goldLight),
            ],
          ),
        ),
      ),
    );
  }

  Widget _statItem(IconData icon, String value, String label, Color color) {
    return Expanded(
      child: Column(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 2),
          Text(label,
              style:
                  const TextStyle(color: AppTheme.textSecondary, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _divider() {
    return Container(width: 1, height: 36, color: Colors.white.withValues(alpha: 0.08));
  }

  Widget _serviceCard({
    required IconData icon,
    required String title,
    required String desc,
    required int price,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
        ),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                gradient: AppTheme.brandGradient,
                shape: BoxShape.circle,
                boxShadow: AppTheme.brandShadowSmall,
              ),
              child: Icon(icon, color: AppTheme.onGold, size: 26),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 16,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text(desc,
                      style: const TextStyle(
                          color: AppTheme.textSecondary, fontSize: 12, height: 1.4)),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                ShaderMask(
                  shaderCallback: (b) =>
                      AppTheme.brandGradient.createShader(b),
                  child: Text(
                    Money.rmbInt(price),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const Text('起',
                    style: TextStyle(
                        color: AppTheme.textSecondary, fontSize: 11)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReviews(Map<String, dynamic> h) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.star, size: 20, color: AppTheme.goldAccent),
              const SizedBox(width: 4),
              Text('${h['avgRating'] ?? '5.0'}分',
                  style: const TextStyle(
                      color: AppTheme.goldAccent,
                      fontSize: 18,
                      fontWeight: FontWeight.w900)),
              const SizedBox(width: 8),
              Text(_reviewsLoading ? '评价加载中' : '${_reviews.length}条评价',
                  style: const TextStyle(
                      color: AppTheme.textHint, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 12),
          if (_reviewsLoading)
            ..._buildReviewSkeleton()
          else if (_reviewsError)
            _buildReviewError()
          else if (_reviews.isEmpty)
            _buildReviewEmpty()
          else
            ..._reviews.take(3).map((r) => _reviewTile(r as Map<String, dynamic>)),
        ],
      ),
    );
  }

  List<Widget> _buildReviewSkeleton() => [
        Row(children: [
          const Skeleton(width: 88, height: 14),
          const SizedBox(width: 8),
          Skeleton.line(width: 140),
        ]),
        const SizedBox(height: 10),
        Skeleton.line(width: double.infinity),
        const SizedBox(height: 8),
        Skeleton.line(width: 220),
      ];

  Widget _buildReviewError() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('评价加载失败，请检查网络后重试',
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
        const SizedBox(height: 10),
        PrimaryButton(
          label: '重新加载',
          icon: Icons.refresh_rounded,
          isSecondary: true,
          expand: false,
          height: 36,
          onPressed: _loadReviews,
        ),
      ],
    );
  }

  Widget _buildReviewEmpty() {
    return Row(
      children: [
        const Icon(Icons.rate_review_outlined,
            size: 20, color: AppTheme.textHint),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              Text('暂无评价',
                  style: TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 13,
                      fontWeight: FontWeight.w700)),
              SizedBox(height: 2),
              Text('完成订单后，欢迎来分享真实体验',
                  style: TextStyle(color: AppTheme.textHint, fontSize: 11.5)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _reviewTile(Map<String, dynamic> r) {
    final rating = (r['overallRating'] as num?)?.toInt() ?? 5;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _stars(rating),
              const Spacer(),
              Text('${r['createdAt'] ?? ''}',
                  style: const TextStyle(
                      color: AppTheme.textHint, fontSize: 11)),
            ],
          ),
          const SizedBox(height: 6),
          Text('${r['content'] ?? ''}',
              style: const TextStyle(
                  color: AppTheme.textSecondary, fontSize: 13, height: 1.5)),
        ],
      ),
    );
  }

  Widget _stars(int rating) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        return Icon(
          i < rating ? Icons.star_rounded : Icons.star_outline_rounded,
          size: 14,
          color: i < rating ? AppTheme.goldAccent : AppTheme.textHint,
        );
      }),
    );
  }

  Widget _buildBottomBar(Map<String, dynamic> h) {
    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.of(context).padding.bottom + 12,
      ),
      decoration: BoxDecoration(
        color: AppTheme.background.withValues(alpha: 0.9),
                        border: Border(
          top: BorderSide(color: Colors.white.withValues(alpha: 0.06)),
        ),
      ),
      child: Row(
        children: [
          // 私信胶囊按钮
          Expanded(
            child: GestureDetector(
              onTap: _openChat,
              child: Container(
                height: 50,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                      color: AppTheme.goldMain.withValues(alpha: 0.6)),
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.chat_bubble_outline_rounded,
                        size: 18, color: AppTheme.textPrimary),
                    SizedBox(width: 6),
                    Text('私信',
                        style: TextStyle(
                            color: AppTheme.textPrimary,
                            fontSize: 15,
                            fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // 立即下单胶囊渐变按钮
          Expanded(
            flex: 2,
            child: GestureDetector(
              onTap: () => Navigator.push(
                  context,
                  Motion.fadeSlideRoute(VideoOrderPage(
                          human: Map<String, dynamic>.from(h)))),
              child: Container(
                height: 50,
                decoration: BoxDecoration(
                  gradient: AppTheme.brandGradient,
                  borderRadius: BorderRadius.circular(999),
                  boxShadow: AppTheme.brandShadow,
                ),
                child: Center(
                  child: Text(
                    '立即录制  ${Money.rmbInt(h['price'] ?? h['minPrice'] ?? Pricing.videoMinPrice)} 起',
                    style: const TextStyle(
                      color: AppTheme.onGold,
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
