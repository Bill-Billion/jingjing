import '../../utils/money.dart';
import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/app_network_image.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../utils/responsive.dart';
import '../../utils/motion.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/motion_fx.dart';
import '../../widgets/region_picker.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/primary_button.dart';
import '../human_detail/human_detail_page.dart';

class HumansPage extends StatefulWidget {
  const HumansPage({super.key});

  @override
  State<HumansPage> createState() => _HumansPageState();
}

class _HumansPageState extends State<HumansPage> {
  String _selectedCategory = '全部';
  String _selectedProvince = '全国';
  String? _selectedCity;
  String? _selectedDistrict;
  String _sortBy = 'hot';
  bool _nearbyMode = false;

  // 真人风格筛选（不使用赛博/霓虹等虚拟风命名）
  final List<String> _categories = ['全部', '古风', '现代', '武侠', '商务', '青春'];

  List<Map<String, dynamic>> _humans = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadHumans();
  }

  Future<void> _loadHumans() async {
    setState(() { _loading = true; _error = null; });
    try {
      final params = <String, dynamic>{'pageSize': '50'};
      if (_selectedCategory != '全部') params['tag'] = _selectedCategory;
      if (!_nearbyMode && _selectedProvince != '全国') {
        params['province'] = _selectedProvince;
        if (_selectedCity != null) params['city'] = _selectedCity;
        if (_selectedDistrict != null) params['district'] = _selectedDistrict;
      }
      if (_sortBy == 'new') params['rank'] = 'new';
      if (_sortBy == 'sales') params['rank'] = 'sales';
      if (_sortBy == 'price') params['rank'] = 'price_asc';

      final list = await ApiService().getHumans(params: params);
      setState(() {
        _humans = list.cast<Map<String, dynamic>>();
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = '$e'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(
        title: const Text('艺人广场'),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.sort_rounded, color: AppTheme.goldMain),
            tooltip: '排序方式',
            color: AppTheme.surfaceDark,
            surfaceTintColor: Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(color: AppTheme.goldMain.withValues(alpha: 0.18)),
            ),
            onSelected: (v) { setState(() => _sortBy = v); _loadHumans(); },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'hot', child: Text('热度优先', style: TextStyle(color: AppTheme.textPrimary, fontSize: 13.5))),
              PopupMenuItem(value: 'new', child: Text('最新入驻', style: TextStyle(color: AppTheme.textPrimary, fontSize: 13.5))),
              PopupMenuItem(value: 'sales', child: Text('销量优先', style: TextStyle(color: AppTheme.textPrimary, fontSize: 13.5))),
              PopupMenuItem(value: 'price', child: Text('价格优先', style: TextStyle(color: AppTheme.textPrimary, fontSize: 13.5))),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          // 地区筛选
          SizedBox(
            height: 46,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _filterChip('附近', _nearbyMode, Icons.near_me_rounded, () {
                  setState(() { _nearbyMode = true; _selectedProvince = '全国'; _selectedCity = null; _selectedDistrict = null; });
                  _loadHumans();
                }),
                _filterChip('全国', _selectedProvince == '全国' && !_nearbyMode, Icons.public_rounded, () {
                  setState(() { _nearbyMode = false; _selectedProvince = '全国'; _selectedCity = null; _selectedDistrict = null; });
                  _loadHumans();
                }),
                if (_selectedProvince != '全国' && !_nearbyMode)
                  _filterChip(
                    _selectedDistrict != null ? '$_selectedProvince·$_selectedCity·$_selectedDistrict'
                    : _selectedCity != null ? '$_selectedProvince·$_selectedCity' : _selectedProvince,
                    true,
                    Icons.location_on_rounded,
                    () async {
                      final result = await RegionPicker.show(context,
                        province: _selectedProvince != '全国' ? _selectedProvince : null,
                        city: _selectedCity, district: _selectedDistrict);
                      if (result != null) {
                        setState(() { _nearbyMode = false; _selectedProvince = result[0]; _selectedCity = result[1]; _selectedDistrict = result[2]; });
                        _loadHumans();
                      }
                    },
                  )
                else
                  _filterChip('选择地区', false, Icons.keyboard_arrow_down_rounded, () async {
                    final result = await RegionPicker.show(context);
                    if (result != null) {
                      setState(() { _nearbyMode = false; _selectedProvince = result[0]; _selectedCity = result[1]; _selectedDistrict = result[2]; });
                      _loadHumans();
                    }
                  }),
              ],
            ),
          ),
          // 分类筛选
          SizedBox(
            height: 44,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _categories.length,
              itemBuilder: (_, i) {
                final selected = _categories[i] == _selectedCategory;
                // V15：自定义玻璃胶囊，不用 Material ChoiceChip（避免默认 checkmark 方框、风格不统一）
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () {
                      setState(() => _selectedCategory = _categories[i]);
                      _loadHumans();
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: Motion.short),
                      curve: Motion.inOut,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        gradient:
                            selected ? AppTheme.brandGradientHorizontal : null,
                        color: selected
                            ? null
                            : Colors.white.withValues(alpha: 0.04),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: selected
                              ? Colors.transparent
                              : AppTheme.goldMain.withValues(alpha: 0.25),
                        ),
                      ),
                      child: Text(
                        _categories[i],
                        style: TextStyle(
                          fontSize: 12.5,
                          color: selected
                              ? AppTheme.onGold
                              : AppTheme.textSecondary,
                          fontWeight:
                              selected ? FontWeight.w800 : FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 6),
          // 艺人列表
          Expanded(
            child: _loading
              ? _buildSkeleton(context)
              : _error != null
                ? _buildErrorView()
                : _humans.isEmpty
                  ? _buildEmptyView()
                  : RefreshIndicator(
                      color: AppTheme.goldMain,
                      backgroundColor: AppTheme.surfaceDark,
                      onRefresh: _loadHumans,
                      child: GridView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: Responsive.gridColumns(context),
                          childAspectRatio: Responsive.childAspectRatio(context),
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: _humans.length,
                        itemBuilder: (_, i) => StaggerItem(
                            index: i,
                            child: _buildHumanCard(context, _humans[i])),
                      ),
                    ),
          ),
        ],
      ),
    );
  }

  // 与卡片同形状的金色微光玻璃骨架（替代裸转圈，避免布局跳动）
  Widget _buildSkeleton(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: Responsive.gridColumns(context),
        childAspectRatio: Responsive.childAspectRatio(context),
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: 6,
      itemBuilder: (_, __) => Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppTheme.glassBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Expanded(
              child: Skeleton(
                radius: BorderRadius.vertical(top: Radius.circular(14)),
              ),
            ),
            const SizedBox(height: 10),
            Skeleton.line(width: 72),
            const SizedBox(height: 6),
            Skeleton.line(width: 120, height: 10),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0x33FFFFFF), Color(0x167FD4E0), Color(0x0A3FA9C0)],
                ),
                border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.4)),
              ),
              child: const Icon(Icons.cloud_off_rounded, size: 32, color: AppTheme.iceHighlight),
            ),
            const SizedBox(height: 16),
            const Text('无法连接服务器',
                style: TextStyle(color: AppTheme.textPrimary, fontSize: 15, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            const Text('可在「我的-设置」切换到演示模式体验',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppTheme.textHint, fontSize: 12)),
            const SizedBox(height: 18),
            SizedBox(
              width: 140,
              child: PrimaryButton(label: '重新加载', onPressed: _loadHumans),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyView() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.person_search_rounded, size: 52, color: AppTheme.textHint),
          SizedBox(height: 14),
          Text('暂无符合条件的艺人',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 14, fontWeight: FontWeight.w600)),
          SizedBox(height: 4),
          Text('换个分类或地区看看',
              style: TextStyle(color: AppTheme.textHint, fontSize: 12)),
        ],
      ),
    );
  }

  /// 地区筛选胶囊：与分类行同一套金渐变/玻璃描边语言。
  Widget _filterChip(String label, bool selected, IconData icon, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: Motion.short),
          curve: Motion.inOut,
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: selected ? AppTheme.brandGradientHorizontal : null,
            color: selected ? null : Colors.white.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
                color: selected
                    ? Colors.transparent
                    : AppTheme.goldMain.withValues(alpha: 0.25)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon,
                  size: 14,
                  color: selected ? AppTheme.onGold : AppTheme.goldMain),
              const SizedBox(width: 5),
              Text(
                label,
                style: TextStyle(
                    fontSize: 12,
                    color: selected ? AppTheme.onGold : AppTheme.textSecondary,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHumanCard(BuildContext context, Map<String, dynamic> h) {
    final avatarUrl = ApiService().resolveUrl(h['avatar'] as String?);
    final localAvatar = h['localAvatar'] as String?;
    final tags = (h['tags'] as List?)?.cast<String>() ?? [];
    final quality = h['qualityGrade'] as String? ?? 'B';
    final verified = h['verifiedLevel'] as String? ?? 'none';
    final isStar = verified == 'gold';

    return GlassCard(
      padding: EdgeInsets.zero,
      shadow: true,
      onTap: () => Navigator.push(context, Motion.fadeSlideRoute(HumanDetailPage(human: h))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 头像区 - 真实图片
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                Hero(
                  tag: 'humanHero-${h['id'] ?? h['name']}',
                  child: ClipRRect(
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                    child: (localAvatar != null && localAvatar.isNotEmpty)
                      ? Image.asset(localAvatar, fit: BoxFit.cover)
                      : avatarUrl.isNotEmpty
                      ? AppNetworkImage(
                          imageUrl: avatarUrl,
                          fit: BoxFit.cover,
                          placeholder: (_, __) => Container(color: AppTheme.card, child: const Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.goldMain)))),
                          errorWidget: (_, __, ___) => Container(
                            decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [AppTheme.surfaceDark, AppTheme.card])),
                            child: const Center(child: Icon(Icons.person, size: 44, color: AppTheme.textHint)),
                          ),
                        )
                      : Container(
                          decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [AppTheme.surfaceDark, AppTheme.card])),
                          child: const Center(child: Icon(Icons.person, size: 44, color: AppTheme.textHint)),
                        ),
                  ),
                ),
                // 质量等级
                Positioned(
                  top: 8, left: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2.5),
                    decoration: BoxDecoration(
                      gradient: quality == 'S'
                          ? AppTheme.brandGradient
                          : null,
                      color: quality == 'S'
                          ? null
                          : (quality == 'A'
                              ? AppTheme.cyanSoft.withValues(alpha: 0.85)
                              : Colors.black.withValues(alpha: 0.45)),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(quality == 'S' ? '金牌' : '$quality级',
                        style: TextStyle(
                            color: quality == 'S' ? AppTheme.onGold : Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.bold)),
                  ),
                ),
                if (isStar)
                  Positioned(
                    top: 8, right: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2.5),
                      decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.4))),
                      child: const Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.verified_rounded, size: 12, color: AppTheme.goldMain),
                        SizedBox(width: 2),
                        Text('金标', style: TextStyle(color: AppTheme.goldLight, fontSize: 10)),
                      ]),
                    ),
                  ),
                // 热度
                Positioned(
                  bottom: 8, right: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(6)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.local_fire_department_rounded, size: 12, color: AppTheme.goldMain),
                      const SizedBox(width: 2),
                      Text('${h['sales'] ?? 0}', style: const TextStyle(color: AppTheme.goldLight, fontSize: 10)),
                    ]),
                  ),
                ),
              ],
            ),
          ),
          // 信息区
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(h['name'] as String? ?? '', style: const TextStyle(color: AppTheme.textPrimary, fontSize: 15, fontWeight: FontWeight.bold), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Text(
                  tags.isNotEmpty ? tags.join(' / ') : (h['specialty'] as String? ?? ''),
                  style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                // 窄屏下地区可能很长：价签固定、地区弹性省略，杜绝横向溢出
                Row(
                  children: [
                    Text('${Money.rmbInt(h['price'] ?? 99)}起', style: const TextStyle(color: AppTheme.goldMain, fontSize: 14, fontWeight: FontWeight.bold)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        [h['province'], h['city'], h['district']]
                            .where((e) => e != null && '$e'.isNotEmpty)
                            .map((e) => '$e')
                            .join('·'),
                        style: const TextStyle(color: AppTheme.textHint, fontSize: 10),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.right,
                      ),
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
}
