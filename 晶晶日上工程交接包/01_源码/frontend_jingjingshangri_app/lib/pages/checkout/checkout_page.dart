import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import 'package:tobias/tobias.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../utils/money.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/human_avatar.dart';

/// 全屏收银台（确认订单 + 选择支付方式）。
///
/// 规则（对齐后端 V12.4 /api/pay）：
/// - 页面金额仅用于展示，真实扣款金额一律以服务端业务订单为准，前端不传金额、不可篡改；
/// - 当前先开通「支付宝」，微信支付置灰为「即将开通」；
/// - 演示环境 / 服务端未配置密钥时不做假支付、不假装成功，只提示订单已提交、可稍后在订单中付款；
/// - 正式环境拿到 orderString 后由原生支付宝 SDK 唤起（插件接入点见 [_pay]）。
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
  final ApiService _api = ApiService();
  final Tobias _tobias = Tobias();

  /// alipay | wechat（当前仅支付宝可用）
  String _method = 'alipay';
  ButtonState _btn = ButtonState.idle;

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text(msg), duration: const Duration(seconds: 2)),
      );
  }

  Future<void> _pay() async {
    if (_btn == ButtonState.loading) return; // 防重复点击
    if (_method != 'alipay') {
      _toast('微信支付即将开通，请先选择支付宝');
      return;
    }
    setState(() => _btn = ButtonState.loading);
    try {
      final res = await _api.createAlipayOrder(
        orderNo: widget.orderNo,
        bizType: widget.bizType,
        stage: widget.stage,
      );
      if (!mounted) return;
      final configured = res['configured'] == true;
      final orderString = (res['orderString'] ?? '') as String;
      if (res['status'] == 'paid') {
        setState(() => _btn = ButtonState.idle);
        _toast('该订单已支付');
        Navigator.of(context).maybePop(true);
        return;
      }
      if (configured && orderString.isNotEmpty) {
        // 正式/沙箱通道：用 tobias 调起支付宝原生 SDK，环境由后端 sandbox 标志决定
        await _invokeAlipay(orderString, sandbox: res['sandbox'] == true);
      } else {
        // 演示环境 / 服务端尚未配置密钥：订单已创建，不做假支付，引导稍后付款。
        _toast('订单已提交，可稍后在「我的订单」完成付款');
      }
      if (!mounted) return;
      setState(() => _btn = ButtonState.idle);
    } catch (_) {
      if (!mounted) return;
      setState(() => _btn = ButtonState.errorState);
      _toast('支付发起失败，请检查网络后点击重试');
    }
  }

  /// 调起支付宝原生收银台，并按返回结果轮询服务端对账（前端结果码不作为入账依据，最终以服务端查单为准）
  Future<void> _invokeAlipay(String orderString,
      {required bool sandbox}) async {
    Map result = const {};
    try {
      result = await _tobias.pay(
        orderString,
        evn: sandbox ? AliPayEvn.sandbox : AliPayEvn.online,
      );
    } catch (_) {
      _toast(sandbox
          ? '未能唤起支付宝：沙箱联调需安装「支付宝沙箱版」并用沙箱买家账号登录'
          : '未能唤起支付宝，请确认已安装支付宝');
      return;
    }
    final code = '${result['resultStatus'] ?? ''}';
    if (code == '9000' || code == '8000') {
      // 9000 支付成功 / 8000 仍在处理：统一以服务端 trade.query 对账结果为准
      final paid = await _pollPaid();
      if (!mounted) return;
      if (paid) {
        _toast('支付成功');
        Navigator.of(context).maybePop(true);
      } else {
        _toast(code == '8000' ? '支付处理中，可稍后在订单中查看结果' : '已完成支付，结果同步中，可稍后在订单查看');
        Navigator.of(context).maybePop(false);
      }
    } else if (code == '6001') {
      _toast('已取消支付');
    } else {
      _toast('支付未完成（$code），可重试');
    }
  }

  /// 支付返回后轮询服务端状态（服务端自身也会主动 trade.query 补入账），最多约 11s
  Future<bool> _pollPaid() async {
    for (var i = 0; i < 7; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 1600));
      try {
        final st = await _api.getAlipayStatus(widget.orderNo);
        final list = st['payments'];
        if (list is List &&
            list.any((e) =>
                e is Map && (e['paid'] == true || e['status'] == 'paid'))) {
          return true;
        }
      } catch (_) {
        // 单次查询失败则继续下一次轮询
      }
    }
    return false;
  }

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

  // ── 支付宝（默认选中、可用） ──
  Widget _buildAlipayRow() {
    final selected = _method == 'alipay';
    return PressScale(
      onTap: () => setState(() => _method = 'alipay'),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.goldMain.withValues(alpha: 0.08)
              : Colors.white.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: selected ? AppTheme.goldMain : AppTheme.border,
              width: selected ? 1.4 : 1),
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
                  Text('推荐使用 · 安全加密',
                      style:
                          TextStyle(color: AppTheme.textHint, fontSize: 11.5)),
                ],
              ),
            ),
            Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_off,
              color: selected ? AppTheme.goldMain : AppTheme.textHint,
              size: 20,
            ),
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
            '支付由支付宝安全加密；定制数字商品按你的需求专属制作，不适用七日无理由退货。',
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
                  style: TextStyle(color: AppTheme.textSecondary, fontSize: 11)),
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
              label: '支付宝立即支付',
              state: _btn,
              onPressed: _pay,
            ),
          ),
        ],
        ),
      ),
    );
  }
}
