import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../theme/app_theme.dart';
import '../../widgets/state_views.dart';
import '../../services/api_service.dart';
import '../../utils/money.dart';
import '../../utils/pricing.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/human_avatar.dart';
import '../orders/orders_page.dart';
import '../checkout/checkout_page.dart';
import '../../utils/motion.dart';
import '../../widgets/primary_button.dart';

/// 品牌代言下单页（V11 去分账版）：
/// - 买家只见套餐价与实付合计，不出现平台服务费/AI成本/艺人到手；
/// - 套餐定价对齐线④：单品口播/季度代言金额统一取 Pricing.endorsementSingle / endorsementQuarter；
/// - 保留「广告」显著标识与授权说明；支付宝走统一收银台真实付款，微信支付即将开通。
class EndorsementPage extends StatefulWidget {
  final Map<String, dynamic>? human;
  const EndorsementPage({super.key, this.human});

  @override
  State<EndorsementPage> createState() => _EndorsementPageState();
}

class _EndorsementPageState extends State<EndorsementPage> {
  final ApiService _api = ApiService();
  final TextEditingController _brandCtrl = TextEditingController();
  final TextEditingController _titleCtrl = TextEditingController();
  final TextEditingController _reqCtrl = TextEditingController();

  List<dynamic> _packages = [];
  int _selected = 0;
  bool _loading = true;
  bool _submitting = false;
  bool _agreed = false; // 买家需主动勾选广告投放与授权说明，不默认同意

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await _api.getEndorsementPackages();
      if (!mounted) return;
      setState(() {
        _packages = list;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _packages = _demoPackages();
        _loading = false;
      });
    }
  }

  List<dynamic> _demoPackages() => const [
        {
          'id': 1, 'name': '单品口播', 'price': Pricing.endorsementSingle, 'duration': 30,
          'deliverables': '1条口播视频 + 3张精修定妆图',
          'desc': '15-30秒数字人口播，含30天投放授权',
        },
        {
          'id': 2, 'name': '季度代言', 'price': Pricing.endorsementQuarter, 'duration': 90,
          'deliverables': '6条视频 + 12张图 + 全渠道季度授权',
          'desc': '90天季度代言，分批交付，专属经纪对接',
        },
      ];

  @override
  void dispose() {
    _brandCtrl.dispose();
    _titleCtrl.dispose();
    _reqCtrl.dispose();
    super.dispose();
  }

  Map<String, dynamic> get _pkg =>
      _packages.isEmpty ? {} : _packages[_selected] as Map<String, dynamic>;
  num get _price => (_pkg['price'] is num) ? _pkg['price'] as num : 0;

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _submit() async {
    // 代言必须选定具体数字人，禁止无 human 的空下单
    final humanId = widget.human?['id'];
    if (humanId == null) {
      return _toast('请先在艺人广场选择一位数字人，再发起品牌代言');
    }
    if (_packages.isEmpty) return _toast('套餐加载中，请稍候');
    if (_brandCtrl.text.trim().isEmpty) return _toast('请填写品牌名称');
    if (_titleCtrl.text.trim().isEmpty) return _toast('请填写合作标题');
    if (!_agreed) return _toast('请先阅读并同意广告投放与授权说明');
    setState(() => _submitting = true);
    try {
      final res = await _api.createEndorsementOrder({
        'talentId': widget.human?['id'],
        'brand': _brandCtrl.text.trim(),
        'title': _titleCtrl.text.trim(),
        'category': _pkg['name'],
        'requirements': _reqCtrl.text.trim(),
        'amount': _price,
      });
      if (!mounted) return;
      _showPaySheet(res);
    } catch (e) {
      _toast('提交失败，请稍后重试');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showPaySheet(Map<String, dynamic> order) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surfaceDark,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(ctx).viewInsets.bottom + 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('选择支付方式', textAlign: TextAlign.center,
              style: TextStyle(color: AppTheme.textPrimary, fontSize: 18, fontWeight: FontWeight.w900, fontFamily: AppTheme.serifFont)),
          const SizedBox(height: 6),
          Text('订单号 ${order['orderNo'] ?? '—'}', textAlign: TextAlign.center,
              style: const TextStyle(color: AppTheme.textHint, fontSize: 12)),
          const SizedBox(height: 18),
          _payRow(Icons.wechat, AppTheme.wechatGreen, '微信支付'),
          const SizedBox(height: 12),
          _payRow(Icons.account_balance_wallet_rounded, AppTheme.alipayBlue, '支付宝',
              onTap: () => _goAlipay(order)),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: AppTheme.glassDecoration(radius: 14),
            child: const Text(
              '选择支付宝可立即安全付款，付款成功后经纪将与你对接制作排期；微信支付即将开通。',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.6),
            ),
          ),
          const SizedBox(height: 14),
          PressScale(
            onTap: () {
              Navigator.pop(ctx);
              Navigator.of(context).pushReplacement(Motion.fadeSlideRoute(const OrdersPage()));
            },
            borderRadius: BorderRadius.circular(999),
            child: Container(
              height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.04),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.3)),
              ),
              child: const Text('稍后支付 · 去看我的订单',
                  style: TextStyle(color: AppTheme.goldLight, fontSize: 13.5, fontWeight: FontWeight.w700)),
            ),
          ),
        ]),
      ),
    );
  }

  // 支付宝真实付款：关闭支付方式弹层 → 进入统一收银台 → 成功后回订单页
  Future<void> _goAlipay(Map<String, dynamic> order) async {
    final orderNo = order['orderNo'] as String? ?? '';
    if (orderNo.isEmpty) {
      Navigator.of(context).pop();
      return _toast('订单号缺失，请到「我的订单」重新发起支付');
    }
    Navigator.of(context).pop(); // 先关闭支付方式底部弹层
    final ok = await Navigator.of(context).push<bool>(
      Motion.fadeSlideRoute(CheckoutPage(
        orderNo: orderNo,
        bizType: 'endorsement',
        title: '${_pkg['name']}品牌代言',
        spec: _pkg['deliverables'] as String?,
        talentName: widget.human?['name'] as String?,
        human: widget.human,
        amount: _price,
      )),
    );
    if (ok == true && mounted) {
      Navigator.of(context)
          .pushReplacement(Motion.fadeSlideRoute(const OrdersPage()));
    }
  }

  Widget _payRow(IconData icon, Color color, String name, {VoidCallback? onTap}) {
    return PressScale(
      onTap: onTap ?? () => _toast('该支付方式即将开通，可选择支付宝或稍后在订单中支付'),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: Row(children: [
          Icon(icon, color: color, size: 26),
          const SizedBox(width: 12),
          Expanded(child: Text(name, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 15, fontWeight: FontWeight.w700))),
          Text(Money.rmb(_price), style: const TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.w900)),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right_rounded, color: AppTheme.textHint),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('品牌代言合作')),
      body: _loading
          ? const LoadingView()
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (widget.human != null) _artistCard(),
                if (widget.human != null) const SizedBox(height: 16),
                _adNotice(),
                const SizedBox(height: 18),
                _title('选择合作套餐'),
                const SizedBox(height: 10),
                ...List.generate(_packages.length, (i) => _packageItem(i)),
                const SizedBox(height: 18),
                _title('品牌信息'),
                const SizedBox(height: 10),
                TextField(
                  controller: _brandCtrl,
                  style: const TextStyle(color: AppTheme.textPrimary),
                  decoration: const InputDecoration(hintText: '品牌 / 店铺名称', prefixIcon: Icon(Icons.business_center_rounded, color: AppTheme.goldMain)),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _titleCtrl,
                  style: const TextStyle(color: AppTheme.textPrimary),
                  decoration: const InputDecoration(hintText: '合作标题，如：新品上市口播', prefixIcon: Icon(Icons.title, color: AppTheme.goldMain)),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _reqCtrl,
                  maxLines: 4,
                  maxLength: 500,
                  style: const TextStyle(color: AppTheme.textPrimary, height: 1.5),
                  decoration: const InputDecoration(
                    hintText: '产品卖点、想要的风格、投放渠道等需求（选填）',
                    alignLabelWithHint: true),
                ),
                const SizedBox(height: 18),
                _priceCard(),
                const SizedBox(height: 14),
                _authNote(),
                const SizedBox(height: 100),
              ],
            ),
      bottomNavigationBar: _bottomBar(),
    );
  }

  Widget _artistCard() {
    final h = widget.human!;
    return GlassCard(
      padding: const EdgeInsets.all(12),
      radius: 18,
      child: Row(children: [
        HumanAvatar(localAsset: h['localAvatar'] as String?, remotePath: h['avatar'] as String?, width: 56, height: 56, radius: BorderRadius.circular(14)),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${h['name'] ?? '艺人'}', style: const TextStyle(color: AppTheme.textPrimary, fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text('${h['specialty'] ?? '数字人品牌代言'}', maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
        ])),
      ]),
    );
  }

  Widget _adNotice() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.rimCyan.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.30)),
      ),
      child: const Row(children: [
        Icon(Icons.campaign_rounded, size: 18, color: AppTheme.iceHighlight),
        SizedBox(width: 8),
        Expanded(child: Text('代言内容发布时将显著标注「广告」，并遵守《广告法》及平台内容规范。',
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.5))),
      ]),
    );
  }

  Widget _title(String t) => Row(children: [
        Container(width: 4, height: 16, decoration: BoxDecoration(gradient: AppTheme.brandGradient, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 8),
        Text(t, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 15, fontWeight: FontWeight.w800)),
      ]);

  Widget _packageItem(int i) {
    final p = _packages[i] as Map;
    final selected = i == _selected;
    final rights = (p['rights'] as List?) ?? (p['deliverables'] is String ? [p['deliverables']] : const []);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: PressScale(
        onTap: () => setState(() => _selected = i),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: selected ? AppTheme.goldMain.withValues(alpha: 0.10) : Colors.white.withValues(alpha: 0.03),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: selected ? AppTheme.goldMain : AppTheme.border, width: selected ? 1.4 : 1),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(selected ? Icons.radio_button_checked : Icons.radio_button_off, color: selected ? AppTheme.goldMain : AppTheme.textHint, size: 20),
              const SizedBox(width: 12),
              Expanded(child: Text('${p['name']}', style: const TextStyle(color: AppTheme.textPrimary, fontSize: 15, fontWeight: FontWeight.w800))),
              Text(Money.rmbInt(p['price']), style: const TextStyle(color: AppTheme.goldLight, fontSize: 17, fontWeight: FontWeight.w900)),
            ]),
            if ((p['desc'] ?? '').toString().isNotEmpty) ...[
              const SizedBox(height: 6),
              Padding(padding: const EdgeInsets.only(left: 32), child: Text('${p['desc']}', style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12))),
            ],
            if (rights.isNotEmpty) ...[
              const SizedBox(height: 8),
              ...rights.map((r) => Padding(
                padding: const EdgeInsets.only(left: 32, bottom: 3),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Padding(padding: EdgeInsets.only(top: 5), child: Icon(Icons.check_circle_outline, size: 12, color: AppTheme.goldMain)),
                  const SizedBox(width: 6),
                  Expanded(child: Text('$r', style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.4))),
                ]),
              )),
            ],
          ]),
        ),
      ),
    );
  }

  Widget _priceCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: AppTheme.glassDecoration(radius: 18),
      child: Column(children: [
        row('${_pkg['name']}', Money.rmb(_price)),
        const SizedBox(height: 10),
        Divider(color: Colors.white.withValues(alpha: 0.08), height: 1),
        const SizedBox(height: 10),
        row('实付合计', Money.rmb(_price), bold: true, big: true),
      ]),
    );
  }

  Widget row(String l, String v, {bool bold = false, bool big = false}) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(l, style: TextStyle(color: AppTheme.textSecondary, fontSize: big ? 15 : 13.5, fontWeight: bold ? FontWeight.w800 : FontWeight.w500)),
          Text(v, style: TextStyle(color: AppTheme.goldLight, fontSize: big ? 20 : 14, fontWeight: FontWeight.w900)),
        ],
      );

  Widget _authNote() {
    return GestureDetector(
      onTap: () => setState(() => _agreed = !_agreed),
      behavior: HitTestBehavior.opaque,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(_agreed ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, color: _agreed ? AppTheme.goldMain : AppTheme.textHint, size: 18),
        const SizedBox(width: 8),
        const Expanded(child: Text('我已阅读并同意：代言内容显著标注「广告」，肖像/声音授权以订单约定范围与期限为准。',
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.5))),
      ]),
    );
  }

  Widget _bottomBar() {
    return FrostedBar(
      tint: AppTheme.surfaceDark.withValues(alpha: 0.86),
      border: Border(top: BorderSide(color: AppTheme.goldMain.withValues(alpha: 0.10))),
      child: Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 12, bottom: MediaQuery.of(context).padding.bottom + 12),
        child: Row(children: [
        Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          const Text('实付', style: TextStyle(color: AppTheme.textSecondary, fontSize: 11)),
          Text(Money.rmb(_price), style: const TextStyle(color: AppTheme.goldLight, fontSize: 22, fontWeight: FontWeight.w900)),
        ]),
        const SizedBox(width: 16),
        Expanded(
          child: SizedBox(
            height: 50,
            child: PrimaryButton(
   label: '提交订单',
   state: _submitting ? ButtonState.loading : ButtonState.idle,
   onPressed: _submit,
 ),
          ),
        ),
        ]),
      ),
    );
  }
}
