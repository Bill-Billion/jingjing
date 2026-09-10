import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/state_views.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../utils/money.dart';

/// V5.0 售后进度页面
/// 退款/重做/纠纷进度透明化展示；数据来自 GET /api/videos/after-sales/:orderNo
/// （演示模式自动走 MockData 兜底；金额边界统一为「元」）
class AfterSalesPage extends StatefulWidget {
  final String orderNo;

  const AfterSalesPage({super.key, required this.orderNo});

  @override
  State<AfterSalesPage> createState() => _AfterSalesPageState();
}

class _AfterSalesPageState extends State<AfterSalesPage> {
  final ApiService _api = ApiService();
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _api.getAfterSales(widget.orderNo);
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'load_failed'; // 仅作错误标志，原始异常不向用户展示
      });
    }
  }

  IconData _actionIcon(String action) {
    switch (action) {
      case 'apply':
        return Icons.assignment;
      case 'accept':
        return Icons.how_to_reg_outlined;
      case 'processing':
        return Icons.autorenew;
      case 'redo':
        return Icons.refresh;
      case 'refund_approve':
        return Icons.approval;
      case 'refund_success':
        return Icons.check_circle_outline;
      case 'reject':
        return Icons.cancel;
      default:
        return Icons.circle;
    }
  }

  String _actionText(String action) {
    switch (action) {
      case 'apply':
        return '提交申请';
      case 'accept':
        return '平台受理';
      case 'processing':
        return '处理中';
      case 'redo':
        return '免费重做';
      case 'refund_approve':
        return '退款批准';
      case 'refund_success':
        return '退款到账';
      case 'reject':
        return '已驳回';
      default:
        return action;
    }
  }

  String get _headline {
    final s = (_data?['afterSalesStatus'] ?? '').toString();
    switch (s) {
      case 'refunded':
      case 'refund_success':
        return '退款已完成';
      case 'redoing':
      case 'redo':
        return '免费重做中';
      case 'reject':
      case 'rejected':
        return '售后已驳回';
      case 'completed':
        return '售后已完结';
      default:
        return '售后处理中';
    }
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('售后进度')),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const LoadingView();
    }
    if (_error != null && _data == null) {
      return _errorView();
    }
    final data = _data ?? const {};
    final timeline = (data['timeline'] as List?) ?? const [];
    final refund = data['refund'];
    final isDemo = data['isDemo'] == true;

    return RefreshIndicator(
      color: AppTheme.goldMain,
      backgroundColor: AppTheme.surfaceDark,
      onRefresh: _loadData,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          if (isDemo)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppTheme.rimCyan.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: AppTheme.rimCyan.withValues(alpha: 0.30)),
              ),
              child: const Row(children: [
                Icon(Icons.info_outline_rounded,
                    size: 15, color: AppTheme.iceHighlight),
                SizedBox(width: 8),
                Expanded(
                    child: Text('演示数据，正式版展示真实售后与退款进度',
                        style: TextStyle(
                            color: AppTheme.textSecondary, fontSize: 11.5))),
              ]),
            ),
          // 状态卡片
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.22)),
            ),
            child: Column(
              children: [
                const Icon(Icons.support_agent_rounded,
                    color: AppTheme.goldMain, size: 40),
                const SizedBox(height: 8),
                Text(
                  _headline,
                  style: const TextStyle(
                      color: AppTheme.goldLight,
                      fontSize: 18,
                      fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text('订单号：${widget.orderNo}',
                    style: const TextStyle(
                        color: AppTheme.textHint, fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const Text('处理进度',
              style: TextStyle(
                  color: AppTheme.goldLight,
                  fontSize: 16,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 16),
          if (timeline.isEmpty)
            GlassCard(
              padding: const EdgeInsets.all(28),
              child: const Center(
                child: Column(children: [
                  Icon(Icons.timeline_rounded,
                      size: 40, color: AppTheme.textHint),
                  SizedBox(height: 10),
                  Text('暂无售后进度记录',
                      style: TextStyle(color: AppTheme.textHint)),
                ]),
              ),
            )
          else
            ..._buildTimeline(timeline),
          if (refund is Map) ...[
            const SizedBox(height: 20),
            GlassCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('退款信息',
                      style: TextStyle(
                          color: AppTheme.goldLight,
                          fontSize: 14,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  // 金额边界统一为「元」，禁止再 /100
                  Text('退款金额：${Money.rmb(refund['amount'])}',
                      style: const TextStyle(
                          color: AppTheme.textPrimary, fontSize: 13)),
                  const SizedBox(height: 4),
                  Text(
                      '退款单号：${refund['refundNo'] ?? '-'}　状态：${_refundStatusText(refund['status'])}',
                      style: const TextStyle(
                          color: AppTheme.textSecondary, fontSize: 12)),
                  if ('${refund['reason'] ?? ''}'.trim().isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text('退款原因：${refund['reason']}',
                        style: const TextStyle(
                            color: AppTheme.textSecondary, fontSize: 13)),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _refundStatusText(dynamic s) {
    switch ('$s') {
      case 'success':
      case 'refunded':
        return '已到账';
      case 'reviewing':
        return '审核中';
      case 'rejected':
        return '已驳回';
      case 'pending':
        return '处理中';
      default:
        return '$s'.isEmpty ? '-' : '$s';
    }
  }

  Widget _errorView() {
    return ErrorView(message: '售后进度加载失败，请检查网络后重试', onRetry: _loadData);
  }

  List<Widget> _buildTimeline(List<dynamic> timeline) {
    return timeline.asMap().entries.map((entry) {
      final i = entry.key;
      final item = Map<String, dynamic>.from(entry.value as Map);
      final isLast = i == timeline.length - 1;
      return IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 40,
              child: Column(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      gradient: isLast ? AppTheme.brandGradientHorizontal : null,
                      color: isLast ? null : Colors.white.withValues(alpha: 0.05),
                      shape: BoxShape.circle,
                      border: Border.all(color: AppTheme.goldMain),
                    ),
                    child: Icon(_actionIcon(item['action']?.toString() ?? ''),
                        size: 16,
                        color: isLast ? AppTheme.onGold : AppTheme.goldMain),
                  ),
                  if (!isLast)
                    Expanded(child: Container(width: 2, color: AppTheme.border)),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(left: 8, bottom: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        _actionText(item['action']?.toString() ?? ''),
                        style: const TextStyle(
                            color: AppTheme.textPrimary,
                            fontSize: 14,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text(item['remark'] ?? '',
                        style: const TextStyle(
                            color: AppTheme.textSecondary, fontSize: 12)),
                    const SizedBox(height: 2),
                    Text(item['createdAt'] ?? '',
                        style: const TextStyle(
                            color: AppTheme.textHint, fontSize: 11)),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }).toList();
  }
}
