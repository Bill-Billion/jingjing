import '../../utils/money.dart';
import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/motion_fx.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/state_views.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/app_mode.dart';

class WalletPage extends StatefulWidget {
  const WalletPage({super.key});

  @override
  State<WalletPage> createState() => _WalletPageState();
}

class _WalletPageState extends State<WalletPage> {
  final ApiService _api = ApiService();
  Map<String, dynamic> _wallet = {};
  List<dynamic> _txns = [];
  bool _loading = true;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        _api.getWallet(),
        _api.getTransactions(),
      ]);
      if (!mounted) return;
      setState(() {
        _wallet = results[0] as Map<String, dynamic>;
        _txns = results[1] as List<dynamic>;
        _loadError = null;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadError = '钱包信息加载失败，请检查网络后重试';
        _loading = false;
      });
    }
  }

  // V12.2 起 HTTP 边界统一返回「元」，演示 Mock 同为元，页面不再二次 /100
  double _money(dynamic v) {
    if (v is! num) return 0;
    return v.toDouble();
  }

  String _yuan(dynamic v, {String fallback = '0.00'}) {
    if (v is num) return v.toStringAsFixed(2);
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    final isDemo = AppMode.instance.isDemoNow;
    final balance = _yuan(_wallet['balance']);
    final frozen = _yuan(_wallet['frozen']);
    final pending = _yuan(_wallet['pending']);

    return LiquidScaffold(
      appBar: AppBar(title: const Text('我的钱包')),
      body: _loading
          ? const LoadingView()
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
              backgroundColor: AppTheme.surfaceDark,
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (isDemo)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(11),
                      decoration: BoxDecoration(
                        color: AppTheme.rimCyan.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.30)),
                      ),
                      child: const Row(children: [
                        Icon(Icons.info_outline_rounded, size: 15, color: AppTheme.iceHighlight),
                        SizedBox(width: 8),
                        Expanded(child: Text('演示数据，正式版将显示真实账户余额与流水', style: TextStyle(color: AppTheme.iceHighlight, fontSize: 11.5))),
                      ]),
                    ),
                  // 余额主卡：玻璃 + 克制金辉边
                  Container(
                    padding: const EdgeInsets.all(22),
                    decoration: AppTheme.glassDecoration(radius: 20).copyWith(
                      border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.28)),
                      boxShadow: AppTheme.elev1Shadow,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Icon(Icons.account_balance_wallet_rounded, size: 15, color: AppTheme.goldMain),
                          const SizedBox(width: 6),
                          const Text('可提现余额（元）', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
                        ]),
                        const SizedBox(height: 10),
                        CountUpText(value: double.tryParse(balance) ?? 0, prefix: '¥', decimals: 2, thousands: true, style: const TextStyle(color: AppTheme.goldLight, fontSize: 36, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        Text('待结算 ${Money.rmb(pending)} · 冻结保证金 ${Money.rmb(frozen)}', style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
                        const SizedBox(height: 20),
                        Row(
                          children: [
                            _ghostButton('提现', Icons.payments_rounded, _onWithdraw),
                            const SizedBox(width: 12),
                            _ghostButton('账单明细', Icons.receipt_long_rounded, _showBillHint),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 22),
                  _sectionTitle('交易记录'),
                  const SizedBox(height: 12),
                  if (_txns.isEmpty)
                    GlassCard(
                      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 16),
                      shadow: false,
                      child: const Center(child: Column(children: [
                        Icon(Icons.receipt_long_rounded, size: 44, color: AppTheme.textHint),
                        SizedBox(height: 12),
                        Text('暂无交易记录', style: TextStyle(color: AppTheme.textHint, fontSize: 13)),
                      ])),
                    )
                  else
                    ..._txns.map((t) => _txnItem(t as Map<String, dynamic>)),
                  const SizedBox(height: 20),
                  GlassCard(
                    shadow: false,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _sectionTitle('结算规则'),
                        const SizedBox(height: 12),
                        const Text('1. 担保交易：付款冻结→接单→交付→7天自动验收→结算入钱包', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.8)),
                        const Text('2. 99元基础档平台0服务费，299元及以上收取10%服务费', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.8)),
                        const Text('3. 新人前3个月享AI制作成本补贴，保证金从首笔收入冻结', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.8)),
                        const Text('4. 个人艺人由平台依法代扣税费，企业/MCN自行开票结算', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.8)),
                        const Text('5. 高端定制按剧本审核20%/开机25%/粗剪审核25%/成片交付30%四节点里程碑拨付', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.8)),
                        const Text('6. 钱包为艺人收入结算账户，不支持充值；提现需绑定实名收款账户，资金由第三方担保结算', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.8)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  // 金竖条分组标题
  Widget _sectionTitle(String t) => Row(children: [
        Container(
          width: 4,
          height: 15,
          decoration: BoxDecoration(
              gradient: AppTheme.brandGradient,
              borderRadius: BorderRadius.circular(2)),
        ),
        const SizedBox(width: 8),
        Text(t,
            style: const TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 15,
                fontWeight: FontWeight.w800)),
      ]);

  // 玻璃描边次级按钮
  Widget _ghostButton(String label, IconData icon, VoidCallback onTap) {
    return Expanded(
      child: PressScale(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusControl),
        child: Container(
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(AppTheme.radiusControl),
            border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.32)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: AppTheme.goldLight),
              const SizedBox(width: 6),
              Text(label,
                  style: const TextStyle(
                      color: AppTheme.goldLight,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _txnItem(Map<String, dynamic> t) {
    final amount = (t['amount'] as num?) ?? 0;
    final isIncome = amount >= 0;
    final icon = switch (t['type']) {
      'freeze' => Icons.ac_unit_rounded,
      'subsidy' => Icons.card_giftcard_rounded,
      'withdraw' => Icons.payments_rounded,
      _ => Icons.move_to_inbox_rounded,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GlassCard(
        padding: const EdgeInsets.all(13),
        shadow: false,
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Colors.white.withValues(alpha: 0.08),
                    AppTheme.cyanSoft.withValues(alpha: 0.10),
                    AppTheme.cyanDeep.withValues(alpha: 0.06),
                  ],
                ),
                border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.35)),
              ),
              child: Icon(icon, size: 18, color: isIncome ? AppTheme.goldMain : AppTheme.textSecondary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${t['title'] ?? '交易'}', style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text('${t['createdAt'] ?? ''}', style: const TextStyle(color: AppTheme.textHint, fontSize: 11)),
                ],
              ),
            ),
            Text(Money.format(_money(amount), withSign: isIncome),
                style: TextStyle(color: isIncome ? AppTheme.success : AppTheme.textSecondary, fontSize: 15, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  void _showBillHint() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('下方「交易记录」即为本月账单明细')),
    );
  }

  void _onWithdraw() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(AppMode.instance.isDemoNow ? '演示模式：正式版绑定实名收款账户后可提现' : '请先在身份认证中绑定实名收款账户，提现由第三方担保结算')),
    );
  }
}
