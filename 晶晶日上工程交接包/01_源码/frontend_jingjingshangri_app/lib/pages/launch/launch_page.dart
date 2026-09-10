import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../sample_order_detail/sample_order_detail_page.dart';
import '../custom_request/custom_request_page.dart';
import '../../utils/motion.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/milestone_bar.dart';
import '../../utils/pricing.dart';
import '../../utils/money.dart';

/// 定制剧 · 普通档（金额取 Pricing：standardTotal = intentDeposit 意向金 + productionFee 制作款）+ 高端定制（一剧一议）
class LaunchPage extends StatefulWidget {
  const LaunchPage({super.key});

  @override
  State<LaunchPage> createState() => _LaunchPageState();
}

class _LaunchPageState extends State<LaunchPage> {
  bool _submitting = false;
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('定制剧')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 普通档（主推走量）
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0x0FFFFFFF),
                  Color(0x1A7FD4E0),
                  Color(0x0F3FA9C0),
                ],
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.22)),
              boxShadow: AppTheme.brandShadowSmall,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(children: [
                      const Icon(Icons.auto_awesome, color: AppTheme.goldMain, size: 20),
                      const SizedBox(width: 8),
                      const Text('普通档', style: TextStyle(color: AppTheme.goldLight, fontSize: 18, fontWeight: FontWeight.bold, fontFamily: AppTheme.serifFont)),
                    ]),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(gradient: AppTheme.brandGradient, borderRadius: BorderRadius.circular(999)),
                      child: const Text('主推', style: TextStyle(color: AppTheme.onGold, fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    AppTheme.gradientText(Money.rmbInt(Pricing.standardTotal), fontSize: 32),
                    const SizedBox(width: 6),
                    const Flexible(
                      child: Padding(
                        padding: EdgeInsets.only(bottom: 4),
                        child: Text('起 · 上不封顶',
                            softWrap: false,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text('意向金${Money.rmbInt(Pricing.intentDeposit)}（担保托管·可退可抵）+ 制作款${Money.rmbInt(Pricing.productionFee)}（定稿后担保）',
                    style: TextStyle(color: AppTheme.textSecondary, fontSize: 12.5)),
                const SizedBox(height: 16),
                const Text('7步标准化流程', style: TextStyle(color: AppTheme.goldLight, fontSize: 14, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                _flowStep('1', '支付${Money.formatInt(Pricing.intentDeposit)}元意向金锁档（担保托管，可退/可抵）'),
                _flowStep('2', '选剧库选择类型（古装/甜宠/悬疑等）'),
                _flowStep('3', '编剧推荐2-3部对标剧本，选定1部'),
                _flowStep('4', '商务改本（含2轮免费修改，超出${Money.formatInt(Pricing.extraRevisionFee)}元/轮）'),
                _flowStep('5', '确认定稿，签署制作前电子合同'),
                _flowStep('6', '支付${Money.formatInt(Pricing.productionFee)}元制作款到担保，AI制作宣发片（3-5工作日）'),
                _flowStep('7', '交付验收（7天内1次免费修改），验收后担保清分'),
                const SizedBox(height: 16),
                const Text('包含：选剧库+对标剧本+剧本初稿2轮修改+制作前电子合同+AI宣发片+项目计划书+上线',
                  style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.6)),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: PrimaryButton(
   label: '付${Money.rmbInt(Pricing.intentDeposit)}意向金锁档',
   state: _submitting ? ButtonState.loading : ButtonState.idle,
   onPressed: _startBasicOrder,
 ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          // 高端定制档
          Container(
            padding: const EdgeInsets.all(20),
            decoration: AppTheme.glassDecoration(radius: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.diamond, color: AppTheme.goldMain, size: 20),
                    SizedBox(width: 8),
                    Text('高端定制', style: TextStyle(color: AppTheme.goldLight, fontSize: 18, fontWeight: FontWeight.bold, fontFamily: AppTheme.serifFont)),
                  ],
                ),
                const Text('一剧一议 · 几万至几百万', style: TextStyle(color: AppTheme.goldMain, fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 14),
                _sectionLabel('高端配置可含'),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: const [
                  _PremiumTag('金牌编剧'),
                  _PremiumTag('知名导演'),
                  _PremiumTag('明星参演'),
                ]),
                const SizedBox(height: 14),
                _sectionLabel('支持形态'),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: const [
                  _FormTag('电影'),
                  _FormTag('中剧'),
                  _FormTag('短剧'),
                  _FormTag('网络大电影'),
                ]),
                const SizedBox(height: 14),
                _sectionLabel('里程碑付款 · 担保分期'),
                const SizedBox(height: 10),
                const MilestoneBar(stages: [
                  ('剧本审核', '20%'),
                  ('开机', '25%'),
                  ('粗剪审核', '25%'),
                  ('成片交付', '30%'),
                ]),
                const SizedBox(height: 16),
                PressScale(
                  onTap: () => Navigator.push(context, Motion.fadeSlideRoute(const CustomRequestPage())),
                  borderRadius: BorderRadius.circular(999),
                  child: Container(
                    width: double.infinity,
                    height: 50,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.04),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.4)),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: const [
                      Icon(Icons.edit_note, size: 18, color: AppTheme.goldLight),
                      SizedBox(width: 8),
                      Text('提交高端定制需求', style: TextStyle(color: AppTheme.goldLight, fontSize: 14, fontWeight: FontWeight.w700)),
                    ]),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          // 联系方式输入（普通档快速下单）
          const Text('联系方式', style: TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: '联系人姓名'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: '手机号', hintText: '用于商务沟通和进度通知'),
          ),
          const SizedBox(height: 8),
          const Text('意向金与制作款均由第三方担保托管：未继续制作可退意向金，验收通过后才清分给制作方。',
              style: TextStyle(color: AppTheme.textHint, fontSize: 11, height: 1.5)),
        ],
      ),
    );
  }

  Widget _sectionLabel(String text) => Text(text,
      style: const TextStyle(color: AppTheme.goldLight, fontSize: 13, fontWeight: FontWeight.w600, letterSpacing: 0.5));

  Widget _flowStep(String num, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 20, height: 20,
            decoration: const BoxDecoration(gradient: AppTheme.brandGradient, shape: BoxShape.circle),
            child: Center(child: Text(num, style: const TextStyle(color: AppTheme.onGold, fontSize: 11, fontWeight: FontWeight.bold))),
          ),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 1.4))),
        ],
      ),
    );
  }

  Future<void> _startBasicOrder() async {
    if (_nameController.text.trim().isEmpty || _phoneController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('请填写联系人姓名和手机号')));
      return;
    }
    setState(() => _submitting = true);
    try {
      final result = await ApiService().createSampleOrder(
        contactName: _nameController.text.trim(),
        contactPhone: _phoneController.text.trim(),
      );
      if (!mounted) return;
      final rawId = result['id'] ?? result['orderId'];
      final orderId = rawId is int
          ? rawId
          : int.tryParse(rawId?.toString() ?? '') ?? 0;
      if (orderId <= 0) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('订单创建异常，请重试')));
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('订单已创建：${result['orderNo'] ?? orderId}，请支付${Money.formatInt(Pricing.intentDeposit)}元意向金锁档')),
      );
      Navigator.push(context, Motion.fadeSlideRoute(SampleOrderDetailPage(orderId: orderId)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('创建失败：$e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

/// 高端配置亮点胶囊（克制金描边 + 小金星）。
class _PremiumTag extends StatelessWidget {
  final String label;
  const _PremiumTag(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppTheme.goldMain.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.35)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.star_rounded, size: 13, color: AppTheme.goldLight),
        const SizedBox(width: 4),
        Text(label,
            style: const TextStyle(color: AppTheme.goldLight, fontSize: 12, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

/// 支持形态玻璃淡胶囊。
class _FormTag extends StatelessWidget {
  final String label;
  const _FormTag(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Text(label,
          style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
    );
  }
}
