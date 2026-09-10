import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/app_mode.dart';
import '../../utils/money.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/human_avatar.dart';
import '../../utils/motion.dart';
import '../orders/orders_page.dart';
import '../checkout/checkout_page.dart';
import '../humans/humans_page.dart';
import '../../widgets/primary_button.dart';

/// 买家下单页（V11 去分账版）：
/// - 买家只看到「商品价格 / 实付合计」，不出现平台服务费、AI成本、个税、艺人到手；
/// - 不再让买家选择个人/企业/MCN 身份，企业发票统一在支付成功后补开；
/// - 支付为占位（微信/支付宝通道接入后开放），不做假支付。
class VideoOrderPage extends StatefulWidget {
  /// 选中的艺人；为空（无 id）时页面拦截，引导先去艺人广场选择。
  final Map<String, dynamic> human;
  const VideoOrderPage({super.key, this.human = const {}});

  @override
  State<VideoOrderPage> createState() => _VideoOrderPageState();
}

class _Tier {
  final int? id;
  final String name;
  final int duration;
  final num price;
  final String desc;
  const _Tier(this.id, this.name, this.duration, this.price, this.desc);
}

class _VideoOrderPageState extends State<VideoOrderPage> {
  final ApiService _api = ApiService();
  final TextEditingController _recipientCtrl = TextEditingController();
  final TextEditingController _messageCtrl = TextEditingController();

  int _tierIndex = 0;
  String _scene = '生日祝福';
  bool _agreed = false; // 买家需主动勾选定制商品说明，不默认同意
  bool _submitting = false;

  final List<String> _scenes = const ['生日祝福', '婚礼祝福', '企业开业', '毕业祝福', '节日问候', '鼓励加油', '表白告白'];

  late final List<_Tier> _tiers = _buildTiers();

  List<_Tier> _buildTiers() {
    final tpls = (widget.human['templates'] as List?) ?? const [];
    if (tpls.isNotEmpty) {
      return tpls.map((t) {
        final m = t as Map;
        return _Tier(
          m['id'] is num ? (m['id'] as num).toInt() : null,
          (m['title'] ?? '定制视频').toString(),
          (m['duration'] is num ? (m['duration'] as num).toInt() : 15),
          (m['price'] is num ? m['price'] as num : num.tryParse('${m['price']}') ?? 99),
          (m['desc'] ?? m['description'] ?? '').toString(),
        );
      }).toList();
    }
    // 演示兜底三档（单位：元）
    return const [
      _Tier(null, '基础祝福', 15, 99, '15秒以内，适合生日、节日祝福'),
      _Tier(null, '精品祝福', 30, 299, '30秒精品祝福，可定制台词和场景'),
      _Tier(null, '豪华定制', 60, 699, '60秒豪华定制，多场景切换，含品牌露出'),
    ];
  }

  _Tier get _tier => _tiers[_tierIndex];
  num get _price => _tier.price;

  @override
  void dispose() {
    _recipientCtrl.dispose();
    _messageCtrl.dispose();
    super.dispose();
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg), duration: const Duration(seconds: 2)));
  }

  Future<void> _submit() async {
    if (widget.human['id'] == null) {
      _toast('请先选择艺人后再下单');
      return;
    }
    if (!_agreed) {
      _toast('请先确认定制数字商品的相关说明');
      return;
    }
    if (_messageCtrl.text.trim().isEmpty) {
      _toast('请填写想要艺人说的祝福台词');
      return;
    }
    setState(() => _submitting = true);
    try {
      final payload = <String, dynamic>{
        'talentId': widget.human['id'],
        'scene': _scene,
        'recipient': _recipientCtrl.text.trim(),
        'message': _messageCtrl.text.trim(),
        'remark': _messageCtrl.text.trim(),
        'amount': _price,
        'tier': _tier.name,
        'agreeNoReturn': true,
        'talentName': widget.human['name'],
      };
      if (_tier.id != null) payload['tplId'] = _tier.id;
      final res = await _api.createVideoOrder(payload);
      if (!mounted) return;
      _showPaySheet(res);
    } catch (e) {
      _toast('下单失败，请稍后重试');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// 支付占位弹层：演示环境不发起真实支付。
  void _showPaySheet(Map<String, dynamic> order) {
    final isDemo = AppMode.instance.isDemoNow;
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surfaceDark,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20, right: 20, top: 20,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(width: 40, height: 4,
                decoration: BoxDecoration(color: AppTheme.goldMain.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(2))),
            ),
            const SizedBox(height: 18),
            const Text('选择支付方式', textAlign: TextAlign.center,
                style: TextStyle(color: AppTheme.textPrimary, fontSize: 18, fontWeight: FontWeight.w900, fontFamily: AppTheme.serifFont)),
            const SizedBox(height: 6),
            Text('订单号 ${order['orderNo'] ?? '—'}', textAlign: TextAlign.center,
                style: const TextStyle(color: AppTheme.textHint, fontSize: 12)),
            const SizedBox(height: 18),
            _payRow(Icons.wechat, AppTheme.wechatGreen, '微信支付', _price),
            const SizedBox(height: 12),
            _payRow(Icons.account_balance_wallet_rounded, AppTheme.alipayBlue, '支付宝', _price, onTap: () {
              Navigator.pop(ctx);
              Navigator.of(context).push(Motion.fadeSlideRoute(CheckoutPage(
                orderNo: '${order['orderNo'] ?? ''}',
                bizType: 'video',
                title: '定制祝福视频·$_scene',
                spec: '${_tier.name} · 约${_tier.duration}秒',
                talentName: '${widget.human['name'] ?? ''}',
                amount: _price,
                human: widget.human,
              )));
            }),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: AppTheme.glassDecoration(radius: 14),
              child: Text(
                isDemo
                    ? '演示环境暂不发起真实支付，正式版接入微信/支付宝后在此完成付款；企业发票可在支付成功后于订单详情补开。'
                    : '支付通道正在接入中，付款成功后进入制作流程；企业发票可在支付成功后于订单详情补开。',
                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.6),
              ),
            ),
            const SizedBox(height: 14),
            PressScale(
              onTap: () {
                Navigator.pop(ctx);
                Navigator.of(context).pushReplacement(
                  Motion.fadeSlideRoute(const OrdersPage()),
                );
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
          ],
        ),
      ),
    );
  }

  Widget _payRow(IconData icon, Color color, String name, num price, {VoidCallback? onTap}) {
    return PressScale(
      onTap: onTap ?? () => _toast('支付通道接入后开放，当前可先提交订单稍后支付'),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 26),
            const SizedBox(width: 12),
            Expanded(child: Text(name, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 15, fontWeight: FontWeight.w700))),
            Text(Money.rmb(price), style: const TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.w900)),
            const SizedBox(width: 8),
            const Icon(Icons.chevron_right_rounded, color: AppTheme.textHint),
          ],
        ),
      ),
    );
  }

  /// 无艺人时拦截：不允许对着空艺人下单，引导先去广场选人。
  Widget _buildNeedArtist(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('定制祝福视频')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 76, height: 76,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0x33FFFFFF), Color(0x167FD4E0), Color(0x0A3FA9C0)],
                  ),
                  border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.4)),
                ),
                child: const Icon(Icons.face_retouching_natural_rounded,
                    color: AppTheme.iceHighlight, size: 38),
              ),
              const SizedBox(height: 18),
              const Text('还没有选择艺人',
                  style: TextStyle(color: AppTheme.textPrimary, fontSize: 18, fontWeight: FontWeight.w900, fontFamily: AppTheme.serifFont)),
              const SizedBox(height: 8),
              const Text('定制祝福视频需要先在艺人广场选择一位数字人艺人，再挑选套餐与台词。',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 1.6)),
              const SizedBox(height: 22),
              SizedBox(
                width: double.infinity,
                child: PrimaryButton(
                  label: '去艺人广场选择',
                  icon: Icons.person_search_rounded,
                  onPressed: () => Navigator.of(context).push(
                    Motion.fadeSlideRoute(const HumansPage()),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.human['id'] == null) return _buildNeedArtist(context);
    return LiquidScaffold(
      appBar: AppBar(title: const Text('定制祝福视频')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildArtistCard(),
          const SizedBox(height: 18),
          _sectionTitle('选择套餐档位'),
          const SizedBox(height: 10),
          ...List.generate(_tiers.length, (i) => _buildTierItem(i)),
          const SizedBox(height: 18),
          _sectionTitle('使用场景'),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8, runSpacing: 8,
            children: _scenes.map((s) {
              final selected = s == _scene;
              return PressScale(
                onTap: () => setState(() => _scene = s),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    gradient: selected ? AppTheme.brandGradientHorizontal : null,
                    color: selected ? null : Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: selected ? Colors.transparent : AppTheme.goldMain.withValues(alpha: 0.25)),
                  ),
                  child: Text(s, style: TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w600,
                    color: selected ? AppTheme.onGold : AppTheme.textSecondary)),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 18),
          _sectionTitle('收片人（选填）'),
          const SizedBox(height: 10),
          TextField(
            controller: _recipientCtrl,
            maxLength: 20,
            style: const TextStyle(color: AppTheme.textPrimary),
            decoration: const InputDecoration(
              hintText: '如：妈妈 / 王总 / 最好的朋友',
              counterText: '',
              prefixIcon: Icon(Icons.person_outline_rounded, color: AppTheme.goldMain),
            ),
          ),
          const SizedBox(height: 18),
          _sectionTitle('祝福台词'),
          const SizedBox(height: 10),
          TextField(
            controller: _messageCtrl,
            maxLines: 5,
            maxLength: 300,
            style: const TextStyle(color: AppTheme.textPrimary, height: 1.5),
            decoration: const InputDecoration(
              hintText: '写下你想让艺人说的话，例如：祝妈妈生日快乐，身体健康，天天开心～',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 18),
          _buildPriceCard(),
          const SizedBox(height: 14),
          _buildAgree(),
          const SizedBox(height: 100),
        ],
      ),
      bottomNavigationBar: _buildBottomBar(),
    );
  }

  Widget _buildArtistCard() {
    final h = widget.human;
    return GlassCard(
      padding: const EdgeInsets.all(12),
      radius: 18,
      child: Row(
        children: [
          HumanAvatar(
            localAsset: h['localAvatar'] as String?,
            remotePath: h['avatar'] as String?,
            width: 60, height: 60, radius: BorderRadius.circular(14),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${h['name'] ?? '艺人'}',
                    style: const TextStyle(color: AppTheme.textPrimary, fontSize: 16, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text('${h['specialty'] ?? '数字人定制'}',
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String t) => Row(children: [
        Container(width: 4, height: 16,
          decoration: BoxDecoration(gradient: AppTheme.brandGradient, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 8),
        Text(t, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 15, fontWeight: FontWeight.w800)),
      ]);

  Widget _buildTierItem(int i) {
    final t = _tiers[i];
    final selected = i == _tierIndex;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: PressScale(
        onTap: () => setState(() => _tierIndex = i),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: selected ? AppTheme.goldMain.withValues(alpha: 0.10) : Colors.white.withValues(alpha: 0.03),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: selected ? AppTheme.goldMain : AppTheme.border, width: selected ? 1.4 : 1),
          ),
          child: Row(
            children: [
              Icon(selected ? Icons.radio_button_checked : Icons.radio_button_off,
                  color: selected ? AppTheme.goldMain : AppTheme.textHint, size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Text(t.name, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 15, fontWeight: FontWeight.w800)),
                      const SizedBox(width: 8),
                      Text('约${t.duration}秒', style: const TextStyle(color: AppTheme.textHint, fontSize: 11.5)),
                    ]),
                    if (t.desc.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(t.desc, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
                    ],
                  ],
                ),
              ),
              Text(Money.rmbInt(t.price),
                  style: const TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.w900)),
            ],
          ),
        ),
      ),
    );
  }

  /// 价格卡：买家只见商品价与实付合计，不出现任何分账/税费。
  Widget _buildPriceCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: AppTheme.glassDecoration(radius: 18),
      child: Column(
        children: [
          _priceRow('${_tier.name}（约${_tier.duration}秒）', Money.rmb(_price), AppTheme.textPrimary),
          const SizedBox(height: 10),
          Divider(color: Colors.white.withValues(alpha: 0.08), height: 1),
          const SizedBox(height: 10),
          _priceRow('实付合计', Money.rmb(_price), AppTheme.goldLight, bold: true, big: true),
        ],
      ),
    );
  }

  Widget _priceRow(String label, String value, Color color, {bool bold = false, bool big = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: AppTheme.textSecondary, fontSize: big ? 15 : 13.5, fontWeight: bold ? FontWeight.w800 : FontWeight.w500)),
        Text(value, style: TextStyle(color: color, fontSize: big ? 20 : 14, fontWeight: FontWeight.w900)),
      ],
    );
  }

  Widget _buildAgree() {
    return GestureDetector(
      onTap: () => setState(() => _agreed = !_agreed),
      behavior: HitTestBehavior.opaque,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(_agreed ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
              color: _agreed ? AppTheme.goldMain : AppTheme.textHint, size: 18),
          const SizedBox(width: 8),
          const Expanded(
            child: Text('定制数字商品按你的台词专属制作，不适用七日无理由退货；企业发票可在支付成功后补开。',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.5)),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomBar() {
    return FrostedBar(
      tint: AppTheme.surfaceDark.withValues(alpha: 0.86),
      border: Border(top: BorderSide(color: AppTheme.goldMain.withValues(alpha: 0.10))),
      child: Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 12, bottom: MediaQuery.of(context).padding.bottom + 12),
        child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('实付', style: TextStyle(color: AppTheme.textSecondary, fontSize: 11)),
              Text(Money.rmb(_price), style: const TextStyle(color: AppTheme.goldLight, fontSize: 22, fontWeight: FontWeight.w900)),
            ],
          ),
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
        ],
        ),
      ),
    );
  }
}
