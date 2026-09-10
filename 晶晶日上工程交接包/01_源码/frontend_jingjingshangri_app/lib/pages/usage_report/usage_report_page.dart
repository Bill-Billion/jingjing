import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/state_views.dart';
import '../../widgets/press_scale.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../utils/money.dart';

/// 数字人使用报告：分别统计 祝福视频 / 品牌代言 / 定制剧 三类使用与收入
class UsageReportPage extends StatefulWidget {
  final int humanId;
  final String humanName;

  const UsageReportPage({super.key, required this.humanId, this.humanName = ''});

  @override
  State<UsageReportPage> createState() => _UsageReportPageState();
}

class _UsageReportPageState extends State<UsageReportPage> {
  bool _loading = true;
  String? _loadError;
  Map<String, dynamic> _report = {};

  @override
  void initState() {
    super.initState();
    _loadReport();
  }

  Future<void> _loadReport() async {
    setState(() { _loading = true; _loadError = null; });
    try {
      final data = await ApiService().getUsageReport(widget.humanId);
      if (mounted) setState(() { _report = data; _loadError = null; _loading = false; });
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadError = '使用报告加载失败，请检查网络后重试';
          _loading = false;
        });
      }
    }
  }

  // V12.5 起使用报告接口边界统一返回「元」，演示 Mock 同为元，不再 /100
  double _toYuan(dynamic v) {
    if (v is! num) return 0;
    return v.toDouble();
  }

  @override
  Widget build(BuildContext context) {
    final summary = (_report['summary'] as Map?)?.cast<String, dynamic>() ?? const {};
    final recentVideos = (_report['recentVideos'] as List?) ?? const [];
    final recentEndorsements = (_report['recentEndorsements'] as List?) ?? const [];
    final records = [
      ...recentVideos.map((v) => _Record('祝福视频', v['orderNo']?.toString() ?? '-',
          _toYuan(v['amount']), v['status']?.toString() ?? '-', v['createdAt']?.toString() ?? '-')),
      ...recentEndorsements.map((v) => _Record('品牌代言', v['orderNo']?.toString() ?? '-',
          _toYuan(v['amount']), v['status']?.toString() ?? '-', v['createdAt']?.toString() ?? '-')),
    ];

    return LiquidScaffold(
      appBar: AppBar(title: const Text('数字人使用报告')),
      body: _loading
          ? const LoadingView()
          : _loadError != null
              ? ErrorView(message: _loadError, onRetry: _loadReport)
              : RefreshIndicator(
              color: AppTheme.goldMain,
              backgroundColor: AppTheme.surfaceDark,
              onRefresh: _loadReport,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // 摘要卡片
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          Colors.white.withValues(alpha: 0.06),
                          AppTheme.cyanSoft.withValues(alpha: 0.10),
                          AppTheme.cyanDeep.withValues(alpha: 0.06),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.20)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.humanName.isNotEmpty ? '${widget.humanName}的数字人' : '我的数字人',
                          style: const TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            _buildStat('总使用次数', '${summary['totalUsage'] ?? 0}'),
                            _buildStat('祝福视频', '${summary['videoCount'] ?? 0}'),
                            _buildStat('品牌代言', '${summary['endorsementCount'] ?? 0}'),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            _buildStat('定制剧', '${summary['projectCount'] ?? 0}'),
                            _buildStat('累计收入', Money.rmbInt(summary['totalRevenue'])),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text('最近使用记录', style: TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 12),
                  if (records.isEmpty)
                    _buildEmptyState('暂无使用记录', '当有用户使用您的数字人生成视频/代言时，记录将显示在这里')
                  else
                    ...records.map((r) => _buildRecordItem(r)),
                  const SizedBox(height: 20),
                  // 安全提示
                  GlassCard(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Container(
                          width: 36, height: 36,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(colors: [
                              Colors.white.withValues(alpha: 0.20),
                              AppTheme.cyanSoft.withValues(alpha: 0.10),
                              AppTheme.cyanDeep.withValues(alpha: 0.06),
                            ]),
                            border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.4)),
                          ),
                          child: const Icon(Icons.shield_rounded, color: AppTheme.iceHighlight, size: 18),
                        ),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            '数字人授权范围分为：祝福视频 / 品牌代言 / 定制剧，如发现异常使用可立即撤回授权或联系平台举报',
                            style: TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                          ),
                        ),
                        PressScale(
                          onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('授权范围可在「创建/编辑数字人」时选择，撤回请联系平台客服')),
                          ),
                          borderRadius: BorderRadius.circular(999),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.05),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.3)),
                            ),
                            child: const Text('管理授权', style: TextStyle(color: AppTheme.goldMain, fontSize: 12, fontWeight: FontWeight.w600)),
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

  Widget _buildStat(String label, String value) {
    return Column(
      children: [
        Text(value, style: const TextStyle(color: AppTheme.goldMain, fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
      ],
    );
  }

  Widget _buildEmptyState(String title, String subtitle) {
    return EmptyView(icon: Icons.bar_chart_rounded, title: title, subtitle: subtitle);
  }

  Widget _buildRecordItem(_Record r) {
    final isEndorsement = r.type == '品牌代言';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GlassCard(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(children: [
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: (isEndorsement ? AppTheme.goldMain : AppTheme.cyanSoft).withValues(alpha: 0.14),
              border: Border.all(
                  color: (isEndorsement ? AppTheme.goldMain : AppTheme.rimCyan).withValues(alpha: 0.35)),
            ),
            child: Icon(isEndorsement ? Icons.campaign_rounded : Icons.videocam_rounded,
                color: isEndorsement ? AppTheme.goldMain : AppTheme.iceHighlight, size: 19),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(r.type, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14, fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text('${r.orderNo}  ${r.createdAt}', maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AppTheme.textHint, fontSize: 11)),
          ])),
          const SizedBox(width: 8),
          Text(Money.rmbInt(r.amount),
              style: const TextStyle(color: AppTheme.goldLight, fontSize: 14, fontWeight: FontWeight.w700)),
        ]),
      ),
    );
  }
}

class _Record {
  final String type;
  final String orderNo;
  final double amount;
  final String status;
  final String createdAt;
  _Record(this.type, this.orderNo, this.amount, this.status, this.createdAt);
}
