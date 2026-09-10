import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../sample_library/sample_library_page.dart';
import '../script_reader/script_reader_page.dart';
import '../checkout/checkout_page.dart';
import '../../utils/motion.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/state_views.dart';
import '../../widgets/press_scale.dart';
import '../project_brief/project_brief_page.dart';
import '../../utils/pricing.dart';
import '../../utils/money.dart';

/// V12 定制剧订单详情 - 7步标准化流程（意向金/制作款均走担保，验收后清分）
class SampleOrderDetailPage extends StatefulWidget {
  final int orderId;
  const SampleOrderDetailPage({super.key, required this.orderId});

  @override
  State<SampleOrderDetailPage> createState() => _SampleOrderDetailPageState();
}

class _SampleOrderDetailPageState extends State<SampleOrderDetailPage> {
  Map<String, dynamic>? _order;
  bool _loading = true;

  static final _steps = [
    {'label': '意向金担保', 'desc': '支付${Pricing.intentDeposit.toInt()}元意向金（可退可抵）', 'icon': Icons.account_balance_wallet},
    {'label': '选择类型', 'desc': '选剧库选类型', 'icon': Icons.category},
    {'label': '选定剧本并创作', 'desc': '选对标剧本，编剧创作', 'icon': Icons.menu_book},
    {'label': '剧本定稿', 'desc': '确认定稿+电子合同', 'icon': Icons.edit_note},
    {'label': '制作款担保·制作中', 'desc': '支付${Pricing.productionFee.toInt()}元到担保', 'icon': Icons.verified_user},
    {'label': '成片交付', 'desc': 'AI宣发片交付', 'icon': Icons.movie},
    {'label': '验收分账', 'desc': '验收后担保清分', 'icon': Icons.fact_check},
  ];

  @override
  void initState() {
    super.initState();
    _loadOrder();
  }

  Future<void> _loadOrder() async {
    try {
      final data = await ApiService().getSampleOrder(widget.orderId);
      if (mounted) setState(() { _order = data; _loading = false; });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('定制剧订单')),
      body: _loading
          ? const LoadingView()
          : _order == null
          ? ErrorView(message: '订单加载失败', onRetry: _loadOrder)
          : _buildContent(),
    );
  }

  Widget _buildContent() {
    final order = _order!;
    final currentStep = (order['step'] as num?)?.toInt() ?? 0;
    final status = order['status'] as String? ?? '';
    final isSettled = status == 'settled';

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 订单号和状态
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Colors.white.withValues(alpha: 0.06),
                AppTheme.cyanSoft.withValues(alpha: 0.10),
                AppTheme.cyanDeep.withValues(alpha: 0.06),
              ],
            ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.22)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('订单号：${order['orderNo'] ?? ''}', style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      gradient: isSettled ? AppTheme.brandGradient : null,
                      color: isSettled ? null : AppTheme.goldMain.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(_statusText(status),
                        style: TextStyle(
                            color: isSettled ? AppTheme.onGold : AppTheme.goldLight,
                            fontSize: 11,
                            fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text('总价 ${Money.rmbInt(order['totalPrice'] ?? Pricing.standardTotal)}',
                  style: const TextStyle(color: AppTheme.goldLight, fontSize: 22, fontWeight: FontWeight.bold, fontFamily: AppTheme.serifFont)),
              const SizedBox(height: 4),
              Text('意向金${Money.rmbInt(order['intentDeposit'] ?? Pricing.intentDeposit)}（担保）+ 制作款${Money.rmbInt(order['productionFee'] ?? Pricing.productionFee)}（担保）',
                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Text('制作进度', style: TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        ...List.generate(_steps.length, (i) => _buildStep(i, currentStep, isSettled)),
        const SizedBox(height: 20),
        _buildActionButton(status),
      ],
    );
  }

  Widget _buildStep(int index, int currentStep, bool isSettled) {
    final step = _steps[index];
    final isActive = index == currentStep && !isSettled;
    final isDone = index < currentStep || isSettled;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 32,
            child: Column(
              children: [
                Container(
                  width: 28, height: 28,
                  decoration: BoxDecoration(
                    gradient: isDone ? AppTheme.brandGradient : null,
                    color: isDone ? null : (isActive ? AppTheme.goldMain.withValues(alpha: 0.2) : AppTheme.card),
                    shape: BoxShape.circle,
                    border: Border.all(color: isDone ? AppTheme.goldMain : AppTheme.border, width: 2),
                  ),
                  child: isDone
                      ? const Icon(Icons.check, size: 16, color: AppTheme.onGold)
                      : Icon(step['icon'] as IconData, size: 14, color: isActive ? AppTheme.goldMain : AppTheme.textHint),
                ),
                if (index < _steps.length - 1)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: isDone ? AppTheme.goldMain : AppTheme.border,
                      margin: const EdgeInsets.symmetric(vertical: 2),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GlassCard(
                padding: const EdgeInsets.all(12),
                radius: 14,
                color: isActive ? AppTheme.goldMain.withValues(alpha: 0.07) : null,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('第${index + 1}步：${step['label']}',
                          style: TextStyle(
                            color: isDone ? AppTheme.goldMain : (isActive ? AppTheme.goldLight : AppTheme.textSecondary),
                            fontWeight: FontWeight.w600, fontSize: 14,
                          )),
                        if (isDone) const Text('已完成', style: TextStyle(color: AppTheme.green, fontSize: 11)),
                        if (isActive) const Text('进行中', style: TextStyle(color: AppTheme.goldMain, fontSize: 11)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(step['desc'] as String, style: const TextStyle(color: AppTheme.textHint, fontSize: 12)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton(String status) {
    String buttonText = '';
    VoidCallback? onPressed;
    IconData icon = Icons.arrow_forward;

    switch (status) {
      case 'draft':
        buttonText = '支付意向金 ${Money.rmbInt(Pricing.intentDeposit)}（担保）';
        icon = Icons.account_balance_wallet;
        onPressed = _payIntent;
        break;
      case 'intent_escrow':
        buttonText = '去选剧库选择类型';
        icon = Icons.category;
        onPressed = _openLibrary;
        break;
      case 'genre_selected':
        buttonText = '查看推荐对标剧本';
        icon = Icons.menu_book;
        onPressed = _openLibrary;
        break;
      case 'scripting':
        buttonText = '查看剧本进度';
        icon = Icons.edit_note;
        onPressed = _openScript;
        break;
      case 'script_finalized':
        buttonText = '确认电子合同并支付制作款 ${Money.rmbInt(Pricing.productionFee)}';
        icon = Icons.verified_user;
        onPressed = _confirmContractThenPay;
        break;
      case 'producing':
        buttonText = '制作中，等待交付（资金担保中）';
        onPressed = null;
        break;
      case 'delivered':
        return Column(
          children: [
            PrimaryButton(
              label: '确认验收（担保清分）',
              icon: Icons.check_circle_outline,
              onPressed: () => _reviewSample('accept'),
            ),
            const SizedBox(height: 8),
            PressScale(
              onTap: () => _reviewSample('redo'),
              borderRadius: BorderRadius.circular(999),
              child: Container(
                height: 48,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.3)),
                ),
                child: const Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.replay_rounded, size: 18, color: AppTheme.goldMain),
                  SizedBox(width: 8),
                  Text('申请免费修改（7天内1次）',
                      style: TextStyle(color: AppTheme.goldLight, fontSize: 14, fontWeight: FontWeight.w600)),
                ]),
              ),
            ),
          ],
        );
      case 'settled':
        buttonText = '查看项目计划书';
        icon = Icons.description;
        onPressed = _openProposal;
        break;
      default:
        return const SizedBox.shrink();
    }

    return PrimaryButton(
      label: buttonText,
      icon: icon,
      onPressed: onPressed,
    );
  }

  // 制作前电子合同确认（普通档补环节）
  Future<void> _confirmContractThenPay() async {
    final agreed = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppTheme.surfaceDark,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Padding(
        padding: EdgeInsets.only(
          left: 20, right: 20, top: 20,
          bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('制作前电子合同确认',
                style: TextStyle(color: AppTheme.goldLight, fontSize: 18, fontWeight: FontWeight.bold, fontFamily: AppTheme.serifFont)),
            const SizedBox(height: 12),
            Text(
              '1. 制作内容：按已定稿剧本制作AI宣发片，3-5个工作日交付；\n'
              '2. 费用：制作款${Money.rmbInt(Pricing.productionFee)}，叠加已担保的${Money.rmbInt(Pricing.intentDeposit)}意向金，合计${Money.rmbInt(Pricing.standardTotal)}，由第三方担保托管；\n'
              '3. 修改：交付后7天内可申请1次免费修改；\n'
              '4. 验收通过后担保资金才清分给制作方，未通过按规则退款/重做；\n'
              '5. 本服务为定制内容消费，非投资，不承诺货币回报。',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 1.7),
            ),
            const SizedBox(height: 16),
            PrimaryButton(
              label: '我已阅读并同意，支付制作款 ${Money.rmbInt(Pricing.productionFee)}',
              onPressed: () => Navigator.pop(context, true),
            ),
            const SizedBox(height: 8),
            PressScale(
              onTap: () => Navigator.pop(context, false),
              borderRadius: BorderRadius.circular(999),
              child: Container(
                height: 46,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                ),
                child: const Text('再想想',
                    style: TextStyle(color: AppTheme.textSecondary, fontSize: 14, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
    if (agreed == true) _payProduction();
  }

  Future<void> _payIntent() async {
    // 真实支付宝担保支付：统一走收银台（金额由服务端 config.sample 权威决定，前端不传金额）
    final orderNo = _order?['orderNo'] as String? ?? '';
    if (orderNo.isEmpty) return;
    final amount = num.tryParse('${_order?['intentDeposit'] ?? 99}') ?? 99;
    final ok = await Navigator.of(context).push<bool>(
      Motion.fadeSlideRoute(CheckoutPage(
        orderNo: orderNo,
        bizType: 'sample',
        stage: 'intent',
        title: '定制剧意向金（担保·可退可抵）',
        amount: amount,
      )),
    );
    if (ok == true && mounted) {
      _loadOrder();
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('意向金已担保支付，请选择剧集类型')));
    }
  }

  Future<void> _openLibrary() async {
    final genre = _order?['genre'] as String?;
    final result = await Navigator.push(context, Motion.fadeSlideRoute(SampleLibraryPage(orderId: widget.orderId, selectedGenre: genre)));
    if (result == true) _loadOrder();
  }

  Future<void> _openScript() async {
    await Navigator.push(context, Motion.fadeSlideRoute(ScriptReaderPage(orderId: widget.orderId)));
    _loadOrder();
  }

  Future<void> _payProduction() async {
    // 真实支付宝担保支付：统一走收银台（制作款金额由服务端 config.sample 权威决定）
    final orderNo = _order?['orderNo'] as String? ?? '';
    if (orderNo.isEmpty) return;
    final amount = num.tryParse('${_order?['productionFee'] ?? 4901}') ?? 4901;
    final ok = await Navigator.of(context).push<bool>(
      Motion.fadeSlideRoute(CheckoutPage(
        orderNo: orderNo,
        bizType: 'sample',
        stage: 'production',
        title: '定制剧制作款（担保）',
        amount: amount,
      )),
    );
    if (ok == true && mounted) {
      _loadOrder();
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('制作款已担保支付，进入AI制作')));
    }
  }

  Future<void> _reviewSample(String action) async {
    try {
      await ApiService().reviewSample(widget.orderId, action);
      if (mounted) {
        _loadOrder();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(action == 'accept' ? '验收成功，担保资金已清分' : '修改申请已提交')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('操作失败：$e')));
    }
  }

  Future<void> _openProposal() async {
    final url = ApiService().resolveUrl(_order?['proposalUrl'] as String?);
    if (url.isNotEmpty && await canLaunchUrl(Uri.parse(url))) {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      return;
    }
    if (mounted) {
      Navigator.push(
        context,
        Motion.fadeSlideRoute(
            ProjectBriefPage(source: _order ?? const {}, isProject: false)),
      );
    }
  }

  String _statusText(String status) {
    const map = {
      'draft': '待付意向金',
      'intent_escrow': '意向金担保中',
      'genre_selected': '待选剧本',
      'scripting': '剧本创作中',
      'script_finalized': '待付制作款',
      'producing': '制作中',
      'delivered': '待验收',
      'settled': '已完成',
      'cancelled': '已取消',
    };
    return map[status] ?? status;
  }
}
