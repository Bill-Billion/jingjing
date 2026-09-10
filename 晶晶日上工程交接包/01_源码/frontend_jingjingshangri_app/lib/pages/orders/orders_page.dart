import '../../utils/money.dart';
import 'package:flutter/material.dart';
import '../../widgets/motion_fx.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/state_views.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../review/review_page.dart';
import '../after_sales/after_sales_page.dart';
import '../sample_order_detail/sample_order_detail_page.dart';
import '../../utils/motion.dart';

/// 我的订单 —— 统一聚合：99元视频 / 品牌代言 / 定制剧
class OrdersPage extends StatelessWidget {
  const OrdersPage({super.key});

  static const _tabs = ['全部', '待付款', '制作中', '已完成'];
  static const _groups = ['all', 'pending', 'producing', 'completed'];

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: _tabs.length,
      child: LiquidScaffold(
        appBar: AppBar(
          title: const Text('我的订单'),
          bottom: TabBar(
            labelColor: AppTheme.goldMain,
            unselectedLabelColor: AppTheme.textSecondary,
            indicatorColor: AppTheme.goldMain,
            indicatorWeight: 2.5,
            indicatorSize: TabBarIndicatorSize.label,
            labelStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
            unselectedLabelStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500),
            tabs: const [
              Tab(text: '全部'),
              Tab(text: '待付款'),
              Tab(text: '制作中'),
              Tab(text: '已完成'),
            ],
          ),
        ),
        body: TabBarView(
          children: List.generate(
            _tabs.length,
            (i) => _OrderList(group: _groups[i]),
          ),
        ),
      ),
    );
  }
}

class _OrderList extends StatefulWidget {
  final String group;
  const _OrderList({required this.group});

  @override
  State<_OrderList> createState() => _OrderListState();
}

class _OrderListState extends State<_OrderList> {
  List<dynamic> _orders = [];
  bool _loading = true;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() { _loading = true; _loadError = null; });
    }
    try {
      final data = await ApiService().getAllOrders(group: widget.group);
      if (mounted) {
        setState(() {
          _orders = data['list'] as List? ?? [];
          _loadError = null;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadError = '订单加载失败，请检查网络后重试';
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const LoadingView();
    }
    if (_loadError != null) {
      return ErrorView(message: _loadError, onRetry: _load);
    }
    if (_orders.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.55,
            child: const EmptyView(
              icon: Icons.receipt_long_rounded,
              title: '暂无订单',
              subtitle: '在艺人广场或圆梦席位挑选心仪的内容后，订单会出现在这里',
            ),
          ),
        ],
      );
    }

    return RefreshIndicator(
      color: AppTheme.goldMain,
      backgroundColor: AppTheme.surfaceDark,
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _orders.length,
        itemBuilder: (_, i) => StaggerItem(
          index: i,
          child: _OrderCard(
            order: _orders[i] as Map<String, dynamic>,
            onChanged: _load,
          ),
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  final VoidCallback? onChanged;
  const _OrderCard({required this.order, this.onChanged});

  String get _kindLabel {
    switch (order['kind']) {
      case 'video':
        return '数字人视频';
      case 'endorsement':
        return '品牌代言';
      case 'sample':
        return '定制剧';
      default:
        return '订单';
    }
  }

  Color get _kindColor {
    switch (order['kind']) {
      case 'sample':
        return AppTheme.goldMain;
      case 'endorsement':
        return AppTheme.cyanSoft;
      default:
        return AppTheme.goldMain;
    }
  }

  // 售后：玻璃描边小胶囊
  Widget _ghostBtn(String label, VoidCallback onTap) {
    return PressScale(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        ),
        child: Text(label,
            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
      ),
    );
  }

  // 评价：金渐变小胶囊
  Widget _goldBtn(String label, VoidCallback onTap) {
    return PressScale(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          gradient: AppTheme.brandGradientHorizontal,
          borderRadius: BorderRadius.circular(999),
          boxShadow: [
            BoxShadow(
                color: AppTheme.goldMain.withValues(alpha: 0.25),
                blurRadius: 8,
                offset: const Offset(0, 2)),
          ],
        ),
        child: Text(label,
            style: const TextStyle(
                color: AppTheme.onGold, fontSize: 12, fontWeight: FontWeight.w800)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final completed = order['group'] == 'completed';
    final orderNo = order['orderNo']?.toString() ?? '';
    final amount = (order['amount'] as num?)?.toDouble() ?? 0;
    final canOpenDetail = order['kind'] == 'sample' && order['detailId'] != null;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GlassCard(
        padding: const EdgeInsets.all(16),
        radius: 18,
        onTap: canOpenDetail
            ? () => Navigator.push(
                  context,
                  Motion.fadeSlideRoute(SampleOrderDetailPage(
                      orderId: (order['detailId'] as num).toInt())),
                )
            : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Row(children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: _kindColor.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: _kindColor.withValues(alpha: 0.3)),
                      ),
                      child: Text(_kindLabel,
                          style: TextStyle(
                              color: _kindColor, fontSize: 11, fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(order['counterparty'] as String? ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: AppTheme.textPrimary, fontWeight: FontWeight.bold)),
                    ),
                  ]),
                ),
                const SizedBox(width: 8),
                Text(order['statusText'] as String? ?? '',
                    style: TextStyle(
                        color: completed ? AppTheme.green : AppTheme.goldMain,
                        fontSize: 12,
                        fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 8),
            Text(order['title'] as String? ?? '',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
            const SizedBox(height: 4),
            Text('订单号：$orderNo',
                style: const TextStyle(color: AppTheme.textHint, fontSize: 11)),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                    Money.rmbInt(amount),
                    style: const TextStyle(
                        color: AppTheme.goldLight,
                        fontSize: 16,
                        fontWeight: FontWeight.bold)),
                Row(
                  children: [
                    if (order['canAfterSales'] == true) ...[
                      _ghostBtn('售后',
                          () => Navigator.push(context,
                              Motion.fadeSlideRoute(AfterSalesPage(orderNo: orderNo)))),
                      const SizedBox(width: 8),
                    ],
                    if (order['canReview'] == true)
                      _goldBtn('评价', () async {
                        final ok = await Navigator.push<bool>(
                          context,
                          Motion.fadeSlideRoute(ReviewPage(
                            orderNo: orderNo,
                            orderType:
                                order['kind'] == 'endorsement' ? 'endorsement' : 'video',
                            talentName: order['counterparty']?.toString() ?? '',
                          )),
                        );
                        if (ok == true) onChanged?.call();
                      }),
                    if (order['kind'] == 'sample')
                      const Icon(Icons.chevron_right_rounded,
                          color: AppTheme.textHint, size: 20),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
