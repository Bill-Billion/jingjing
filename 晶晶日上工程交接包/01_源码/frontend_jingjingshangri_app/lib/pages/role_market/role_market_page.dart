import 'package:flutter/material.dart';
import '../../widgets/motion_fx.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/glass_icon.dart';
import '../../widgets/state_views.dart';
import '../../widgets/press_scale.dart';
import '../../theme/app_theme.dart';
import '../../utils/money.dart';
import '../../services/api_service.dart';

/// 角色席位市场 —— 数据源 /api/projects/market/roles（离线演示兜底），价格单位：元
/// V15.5（A1）曜石流光玻璃化：仅替换视觉层，数据/接口/认领引导逻辑不变。
/// V15.6（A3）卡片信息层级深化：认领进度数字标注、稀缺席位克制金提示、按钮语义图标、
/// 网络失败与空列表分离（ErrorView 可重试），不新增/臆造任何后端字段。
class RoleMarketPage extends StatefulWidget {
  const RoleMarketPage({super.key});

  @override
  State<RoleMarketPage> createState() => _RoleMarketPageState();
}

class _RoleMarketPageState extends State<RoleMarketPage> {
  final ApiService _api = ApiService();
  List<dynamic> _roles = [];
  bool _loading = true;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await _api.getMarketRoles();
      if (mounted) {
        setState(() {
          _roles = list;
          _loadError = null;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loadError = '角色席位加载失败，请检查网络后重试';
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('角色席位市场')),
      body: _loading
          ? const LoadingView(size: 28)
          : _loadError != null
              ? ErrorView(
                  message: _loadError,
                  onRetry: () {
                    setState(() => _loading = true);
                    _load();
                  },
                )
              : RefreshIndicator(
                  color: AppTheme.goldMain,
                  onRefresh: _load,
                  child: _roles.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: const [
                            SizedBox(height: 96),
                            EmptyView(
                              icon: Icons.auto_awesome_mosaic_outlined,
                              title: '暂无可认领的角色席位',
                              subtitle: '新剧开放选角后，会第一时间出现在这里',
                            ),
                          ],
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                          physics: const AlwaysScrollableScrollPhysics(),
                          itemCount: _roles.length,
                          itemBuilder: (_, i) => StaggerItem(
                            index: i,
                            child: _RoleCard(role: _roles[i] as Map<String, dynamic>),
                          ),
                        ),
                ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  final Map<String, dynamic> role;
  const _RoleCard({required this.role});

  @override
  Widget build(BuildContext context) {
    final sold = (role['stockSold'] as num?)?.toInt() ?? 0;
    final total = (role['stockTotal'] as num?)?.toInt() ?? 0;
    final available = sold < total;
    final price = (role['price'] as num?)?.toDouble() ?? 0;
    final progress = total > 0 ? (sold / total).clamp(0.0, 1.0) : 0.0;
    final left = (total - sold).clamp(0, total);
    // 稀缺：仍可认领且剩余不足两成，用克制金提示（纯展示，不改认领逻辑）
    final leftRatio = total > 0 ? left / total : 1.0;
    final scarce = available && leftRatio <= 0.2;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GlassCard(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const GlassIconCore(
              icon: Icons.recent_actors_rounded,
              size: 54,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${role['role']}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 16,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 3),
                  Text('《${role['projectTitle']}》',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: AppTheme.textSecondary, fontSize: 12)),
                  const SizedBox(height: 8),
                  // 席位认领进度（青金）+ 已认数字标注
                  Row(
                    children: [
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(99),
                          child: SizedBox(
                            height: 5,
                            child: Stack(
                              children: [
                                Positioned.fill(
                                    child: ColoredBox(
                                        color: Colors.white.withValues(alpha: 0.10))),
                                FractionallySizedBox(
                                  alignment: Alignment.centerLeft,
                                  widthFactor: progress.toDouble(),
                                  child: DecoratedBox(
                                    decoration: BoxDecoration(
                                      gradient: AppTheme.brandGradient,
                                      borderRadius: BorderRadius.circular(99),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text('已认 $sold/$total',
                          style: const TextStyle(
                              color: AppTheme.textHint, fontSize: 10.5)),
                    ],
                  ),
                  const SizedBox(height: 7),
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                            Money.rmbInt(price),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: AppTheme.goldMain,
                                fontSize: 15,
                                fontWeight: FontWeight.w800)),
                      ),
                      const SizedBox(width: 8),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (scarce) ...[
                            const Icon(Icons.local_fire_department_rounded,
                                size: 13, color: AppTheme.goldMain),
                            const SizedBox(width: 2),
                          ],
                          Text(scarce ? '仅剩 $left 席' : '剩余 $left 席',
                              style: TextStyle(
                                  color: !available
                                      ? AppTheme.error
                                      : (scarce
                                          ? AppTheme.goldMain
                                          : AppTheme.textHint),
                                  fontSize: 11.5,
                                  fontWeight:
                                      scarce ? FontWeight.w700 : FontWeight.w400)),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            _ClaimButton(
              available: available,
              projectTitle: '${role['projectTitle']}',
              roleName: '${role['role']}',
            ),
          ],
        ),
      ),
    );
  }
}

/// 认领按钮：可认领=金渐变胶囊+箭头；已满=灰化描边+锁图标。
/// 点击引导去剧场项目详情（逻辑不变）。
class _ClaimButton extends StatelessWidget {
  final bool available;
  final String projectTitle;
  final String roleName;
  const _ClaimButton({
    required this.available,
    required this.projectTitle,
    required this.roleName,
  });

  @override
  Widget build(BuildContext context) {
    if (!available) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: AppTheme.border),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_outline_rounded, size: 12, color: AppTheme.textHint),
            SizedBox(width: 4),
            Text('已锁定',
                style: TextStyle(color: AppTheme.textHint, fontSize: 12.5)),
          ],
        ),
      );
    }
    return PressScale(
      onTap: () => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text('请在「剧场」进入《$projectTitle》项目详情认领「$roleName」席位')),
      ),
      borderRadius: BorderRadius.circular(99),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          gradient: AppTheme.brandGradient,
          borderRadius: BorderRadius.circular(99),
          boxShadow: [
            BoxShadow(
              color: AppTheme.goldMain.withValues(alpha: 0.28),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('可定制',
                style: TextStyle(
                    color: AppTheme.onGold,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800)),
            SizedBox(width: 3),
            Icon(Icons.arrow_forward_ios_rounded,
                size: 10, color: AppTheme.onGold),
          ],
        ),
      ),
    );
  }
}
