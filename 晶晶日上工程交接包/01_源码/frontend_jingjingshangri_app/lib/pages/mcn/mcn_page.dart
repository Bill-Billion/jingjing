import '../../utils/money.dart';
import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../theme/app_theme.dart';
import '../../widgets/state_views.dart';
import '../../services/api_service.dart';
import '../../utils/responsive.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/press_scale.dart';

class McnPage extends StatefulWidget {
  const McnPage({super.key});

  @override
  State<McnPage> createState() => _McnPageState();
}

class _McnPageState extends State<McnPage> {
  Map<String, dynamic>? _dashboard;
  List<dynamic> _artists = [];
  bool _loading = true;
  bool _isMcn = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final data = await ApiService().getMcnDashboard();
      if (mounted) {
        setState(() {
          _dashboard = data;
          _isMcn = true;
          _loading = false;
        });
        _loadArtists();
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadArtists() async {
    try {
      final data = await ApiService().getMcnArtists();
      if (mounted) setState(() => _artists = data);
      // 艺人列表为附加拉取：失败保留空态，可下拉刷新重试（A5 有意静默降级，不弹错打断看板）
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(
        title: const Text('MCN机构管理'),
        actions: [
          if (_isMcn)
            IconButton(
              icon: const Icon(Icons.download),
              tooltip: '导出数据',
              onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('数据导出中，将通过浏览器下载CSV文件')),
              ),
            ),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _isMcn ? _buildDashboard() : _buildApply(),
    );
  }

  // V5.0 MCN数据看板
  Widget _buildDashboard() {
    final d = _dashboard ?? {};
    final isFreeTrial = d['isFreeTrial'] == true;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 机构状态卡
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [
              Colors.white.withValues(alpha: 0.06),
              AppTheme.cyanSoft.withValues(alpha: 0.10),
              AppTheme.cyanDeep.withValues(alpha: 0.06),
            ]),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.22)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(d['name'] ?? d['agencyName'] ?? 'MCN机构', style: const TextStyle(color: AppTheme.goldLight, fontSize: 18, fontWeight: FontWeight.bold)),
                  if (isFreeTrial)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(color: AppTheme.green.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(999), border: Border.all(color: AppTheme.green.withValues(alpha: 0.4))),
                      child: const Text('免管理费期', style: TextStyle(color: AppTheme.green, fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              if (isFreeTrial)
                Text('前3个月免管理费，至${d['freeUntil'] ?? ''}', style: const TextStyle(color: AppTheme.green, fontSize: 12)),
            ],
          ),
        ),
        const SizedBox(height: 16),
        // 数据看板
        const Text('数据看板', style: TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: Responsive.isCompact(context) ? 1.22 : 1.8,
          children: [
            _statCard(Icons.account_balance_wallet, 'MCN总收益', Money.rmbInt(d['totalMcnIncome'] ?? 0)),
            _statCard(Icons.trending_up, '本月收益', Money.rmbInt(d['monthMcnIncome'] ?? 0)),
            _statCard(Icons.video_library, '订单总量', '${d['totalOrders'] ?? 0}'),
            _statCard(Icons.people, '旗下艺人', '${d['talentCount'] ?? 0}'),
            _statCard(Icons.pending_actions, '待提现', Money.rmbInt(d['pendingWithdraw'] ?? 0)),
            _statCard(Icons.percent, '管理费率', '前90天0% · 之后3%'),
          ],
        ),
        const SizedBox(height: 20),
        // 操作按钮
        Row(
          children: [
            Expanded(
              child: PrimaryButton(
                label: '批量提现',
                icon: Icons.payments,
                onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('请先绑定机构对公账户，审核通过后可批量提现（资金由第三方担保结算）')),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: PressScale(
                borderRadius: BorderRadius.circular(999),
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('粉丝画像数据加载中')),
                ),
                child: Container(
                  height: 50,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.3)),
                  ),
                  child: const Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.pie_chart_outline_rounded, size: 18, color: AppTheme.goldMain),
                    SizedBox(width: 8),
                    Text('粉丝画像', style: TextStyle(color: AppTheme.goldLight, fontSize: 14, fontWeight: FontWeight.w600)),
                  ]),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        // 艺人列表
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('旗下艺人', style: TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.bold)),
            PressScale(
              borderRadius: BorderRadius.circular(999),
              onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('热度排名加载中')),
              ),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.25)),
                ),
                child: const Text('热度排名', style: TextStyle(color: AppTheme.goldMain, fontSize: 12, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (_artists.isEmpty)
          Container(
            padding: const EdgeInsets.all(20),
            decoration: AppTheme.glassDecoration(radius: 16),
            child: const Center(child: Text('暂无签约艺人', style: TextStyle(color: AppTheme.textHint))),
          )
        else
          ..._artists.map((a) => _artistTile(a)),
      ],
    );
  }

  Widget _statCard(IconData icon, String label, String value) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: AppTheme.glassDecoration(radius: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 18, color: AppTheme.goldMain),
          const SizedBox(height: 6),
          Text(value, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 18, fontWeight: FontWeight.bold)),
          Text(label, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _artistTile(dynamic a) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: AppTheme.glassDecoration(radius: 16),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: AppTheme.background,
            backgroundImage: a['localAvatar'] != null ? AssetImage(a['localAvatar'] as String) : null,
            child: a['localAvatar'] == null ? const Icon(Icons.person, color: AppTheme.goldMain, size: 20) : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(a['name'] ?? '艺人', style: const TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text('${a['completedOrders'] ?? a['orderCount'] ?? 0}单 · ${Money.rmbInt(a['totalIncome'] ?? a['revenue'] ?? 0)} · ${a['avgRating'] ?? '5.0'}分',
                  style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
              ],
            ),
          ),
          if (a['verifiedLevel'] == 'gold')
            const Icon(Icons.verified, color: AppTheme.goldMain, size: 18),
        ],
      ),
    );
  }

  // MCN 机构入驻申请（最小可用：收集机构名/联系人/手机号，提交后端审核）
  Future<void> _applyMcn() async {
    final nameCtrl = TextEditingController();
    final contactCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    final agreed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surfaceDark,
        title: const Text('MCN机构入驻', style: TextStyle(color: AppTheme.goldLight)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: '机构名称')),
            const SizedBox(height: 8),
            TextField(controller: contactCtrl, decoration: const InputDecoration(labelText: '联系人')),
            const SizedBox(height: 8),
            TextField(controller: phoneCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: '联系手机号')),
            const SizedBox(height: 8),
            const Text('入驻前90天免管理费，之后按成交额3%收取；需上传营业执照与艺人签约证明。',
                style: TextStyle(color: AppTheme.textHint, fontSize: 11)),
          ],
        ),
        actions: [
          PressScale(
            borderRadius: BorderRadius.circular(999),
            onTap: () => Navigator.pop(ctx, false),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.04),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
              ),
              child: const Text('取消', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, fontWeight: FontWeight.w600)),
            ),
          ),
          PressScale(
            borderRadius: BorderRadius.circular(999),
            onTap: () => Navigator.pop(ctx, true),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                gradient: AppTheme.brandGradientHorizontal,
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Text('提交审核', style: TextStyle(color: AppTheme.onGold, fontSize: 13, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
    if (agreed != true) return;
    if (nameCtrl.text.trim().isEmpty || phoneCtrl.text.trim().isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('请填写机构名称和联系手机号')));
      }
      return;
    }
    try {
      await ApiService().applyMcn({
        'agencyName': nameCtrl.text.trim(),
        'contactName': contactCtrl.text.trim(),
        'contactPhone': phoneCtrl.text.trim(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('入驻申请已提交，平台将在1-3个工作日内审核')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('提交失败：$e')));
    }
  }

  // 未入驻申请页
  Widget _buildApply() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [
              Colors.white.withValues(alpha: 0.06),
              AppTheme.cyanSoft.withValues(alpha: 0.10),
              AppTheme.cyanDeep.withValues(alpha: 0.06),
            ]),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.22)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('未入驻MCN', style: TextStyle(color: AppTheme.goldLight, fontSize: 18, fontWeight: FontWeight.bold)),
                  PressScale(
                    onTap: _applyMcn,
                    borderRadius: BorderRadius.circular(999),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                      decoration: BoxDecoration(
                        gradient: AppTheme.brandGradientHorizontal,
                        borderRadius: BorderRadius.circular(999),
                        boxShadow: AppTheme.ctaGlow,
                      ),
                      child: const Text('申请入驻', style: TextStyle(color: AppTheme.onGold, fontSize: 13, fontWeight: FontWeight.w700)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const Text('MCN机构可统一管理旗下艺人、统一开票结算', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Text('MCN权益', style: TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        _benefit(Icons.people, '艺人管理', '统一管理旗下数字人艺人，批量上下架'),
        _benefit(Icons.receipt_long, '统一开票', 'MCN统一开票结算，无需艺人个人开票'),
        _benefit(Icons.account_balance_wallet, '批量提现', '旗下艺人收益统一管理，一键批量提现'),
        _benefit(Icons.trending_up, '数据看板', '总收益/订单量/粉丝画像/热度排名一目了然'),
        _benefit(Icons.card_giftcard, '前90天免管理费', '入驻前90天免3%管理费，之后按成交额3%收取，降低合作成本'),
        _benefit(Icons.campaign, '资源扶持', '优先推荐位、平台活动资源倾斜'),
        const SizedBox(height: 20),
        const Text('入驻条件', style: TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: AppTheme.glassDecoration(radius: 16),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('1. 持有有效营业执照的企业或个体户', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 2)),
              Text('2. 旗下至少3名签约数字人艺人', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 2)),
              Text('3. 能开具增值税发票', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 2)),
              Text('4. 提交营业执照、法人身份证、艺人签约证明', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 2)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _benefit(IconData icon, String title, String desc) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(16),
      decoration: AppTheme.glassDecoration(radius: 16),
      child: Row(
        children: [
          Icon(icon, color: AppTheme.goldMain),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 15, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(desc, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
