import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../theme/app_theme.dart';
import '../../utils/money.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/human_avatar.dart';

/// 遗留收银台资料视图，不在当前新版路由中。
/// 原生付款尚未接通；仅保留历史页面结构，不能发起付款或轮询付款成功。
class CheckoutPage extends StatefulWidget {
  /// 业务订单号
  final String orderNo;

  /// 业务类型：video | endorsement | dream | sample
  final String bizType;

  /// 样片两阶段：intent | production
  final String? stage;

  /// 商品/服务名称
  final String title;

  /// 规格描述（如 基础祝福 · 约15秒）
  final String? spec;

  /// 数字人/艺人名称
  final String? talentName;

  /// 展示金额（元，来自下单时服务端返回；仅展示）
  final num amount;

  /// 可选：艺人信息（用于展示头像）
  final Map<String, dynamic>? human;

  const CheckoutPage({
    super.key,
    required this.orderNo,
    required this.bizType,
    this.stage,
    required this.title,
    this.spec,
    this.talentName,
    this.amount = 0,
    this.human,
  });

  @override
  State<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends State<CheckoutPage> {
  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('确认订单')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          _buildGoodsCard(),
          const SizedBox(height: 16),
          _buildAmountCard(),
          const SizedBox(height: 18),
          _sectionTitle('选择支付方式'),
          const SizedBox(height: 10),
          _buildAlipayRow(),
          const SizedBox(height: 10),
          _buildWechatRow(),
          const SizedBox(height: 16),
          _buildSafeNote(),
        ],
      ),
      bottomNavigationBar: _buildBottomBar(),
    );
  }

  // ── 商品/服务信息 ──
  Widget _buildGoodsCard() {
    final local = widget.human?['localAvatar'] as String?;
    final remote = widget.human?['avatar'] as String?;
    return GlassCard(
      padding: const EdgeInsets.all(14),
      radius: 18,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (local != null || remote != null) ...[
            HumanAvatar(
              localAsset: local,
              remotePath: remote,
              width: 58,
              height: 58,
              radius: BorderRadius.circular(14),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.title,
                    style: const TextStyle(
                        color: AppTheme.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w800)),
                if ((widget.spec ?? '').isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(widget.spec!,
                      style: const TextStyle(
                          color: AppTheme.textSecondary, fontSize: 12.5)),
                ],
                if ((widget.talentName ?? '').isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text('数字人：${widget.talentName}',
                      style: const TextStyle(
                          color: AppTheme.textSecondary, fontSize: 12)),
                ],
                const SizedBox(height: 8),
                Text('订单号 ${widget.orderNo}',
                    style: const TextStyle(
                        color: AppTheme.textHint, fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── 金额明细 ──
  Widget _buildAmountCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: AppTheme.glassDecoration(radius: 18),
      child: Column(
        children: [
          _amountRow('商品金额', Money.rmb(widget.amount), AppTheme.textSecondary),
          const SizedBox(height: 10),
          _amountRow('优惠减免', Money.rmb(0), AppTheme.textSecondary),
          const SizedBox(height: 12),
          Divider(color: Colors.white.withValues(alpha: 0.08), height: 1),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('实付合计',
                  style: TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w800)),
              Text(Money.rmb(widget.amount),
                  style: const TextStyle(
                      color: AppTheme.goldLight,
                      fontSize: 22,
                      fontWeight: FontWeight.w900)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _amountRow(String label, String value, Color color) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(
                  color: AppTheme.textSecondary, fontSize: 13.5)),
          Text(value, style: TextStyle(color: color, fontSize: 14)),
        ],
      );

  Widget _sectionTitle(String t) => Row(children: [
        Container(
          width: 4,
          height: 16,
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

  Widget _payIcon(IconData icon, Color color) => Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(11),
        ),
        alignment: Alignment.center,
        child: Icon(icon, color: color, size: 24),
      );

  // ── 支付宝（尚未接通，不可选择） ──
  Widget _buildAlipayRow() {
    return PressScale(
      onTap: null,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.border),
        ),
        child: Row(
          children: [
            _payIcon(Icons.account_balance_wallet_rounded, AppTheme.alipayBlue),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('支付宝',
                      style: TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 15,
                          fontWeight: FontWeight.w800)),
                  SizedBox(height: 2),
                  Text('原生付款尚未开放',
                      style:
                          TextStyle(color: AppTheme.textHint, fontSize: 11.5)),
                ],
              ),
            ),
            const Icon(Icons.radio_button_off,
                color: AppTheme.textHint, size: 20),
          ],
        ),
      ),
    );
  }

  // ── 微信（即将开通，置灰不可选） ──
  Widget _buildWechatRow() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.02),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        children: [
          _payIcon(Icons.wechat, AppTheme.textHint),
          const SizedBox(width: 12),
          const Text('微信支付',
              style: TextStyle(
                  color: AppTheme.textHint,
                  fontSize: 15,
                  fontWeight: FontWeight.w700)),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(999),
            ),
            child: const Text('即将开通',
                style: TextStyle(color: AppTheme.textHint, fontSize: 10.5)),
          ),
          const Spacer(),
          const Icon(Icons.radio_button_off,
              color: AppTheme.textHint, size: 20),
        ],
      ),
    );
  }

  Widget _buildSafeNote() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.lock_outline_rounded,
            color: AppTheme.textHint, size: 15),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            '付款暂未开放。接通并验证正式付款流程后，才能发起付款；当前页面不会创建支付单或显示支付成功。',
            style: TextStyle(
                color: AppTheme.textHint.withValues(alpha: 0.9),
                fontSize: 11.5,
                height: 1.6),
          ),
        ),
      ],
    );
  }

  Widget _buildBottomBar() {
    return FrostedBar(
      tint: AppTheme.surfaceDark.withValues(alpha: 0.86),
      border: Border(
          top: BorderSide(color: AppTheme.goldMain.withValues(alpha: 0.10))),
      child: Padding(
        padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 12,
            bottom: MediaQuery.of(context).padding.bottom + 12),
        child: Row(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('实付',
                    style:
                        TextStyle(color: AppTheme.textSecondary, fontSize: 11)),
                Text(Money.rmb(widget.amount),
                    style: const TextStyle(
                        color: AppTheme.goldLight,
                        fontSize: 22,
                        fontWeight: FontWeight.w900)),
              ],
            ),
            const SizedBox(width: 16),
            Expanded(
              child: PrimaryButton(
                label: '付款暂未开放',
                state: ButtonState.disabled,
                onPressed: null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
