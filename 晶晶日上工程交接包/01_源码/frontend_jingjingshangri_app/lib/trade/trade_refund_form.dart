import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../contracts/contract_text.dart';
import '../supply/supply_widgets.dart';
import 'trade_api.dart';
import 'trade_models.dart';
import 'trade_widgets.dart';

class TradeRefundForm extends StatefulWidget {
  const TradeRefundForm(
      {super.key, required this.session, required this.paymentId});
  final AccountSession session;
  final String paymentId;
  @override
  State<TradeRefundForm> createState() => _TradeRefundFormState();
}

class _TradeRefundFormState extends State<TradeRefundForm> {
  late final api = TradeApi(widget.session);
  TradeRecord? payment, order;
  List<TradeRecord> refunds = [];
  final reason = TextEditingController(),
      amounts = <String, TextEditingController>{};
  bool busy = false;
  String? error;
  static const path = '/api/v1/trade/refunds';
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    reason.dispose();
    for (final c in amounts.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
      payment = null;
      order = null;
    });
    try {
      final p = await api.record(widget.paymentId);
      tradeRequire(p.kind == 'PAYMENT');
      final rs = await api.all('REFUND');
      final o = p.orderId == null ? null : await api.record(p.orderId!);
      if (!mounted) return;
      final remaining = tradeRefundRemaining(p, rs);
      final pending = api.pending(path);
      final saved = pending == null ? null : tradeMap(pending['body']);
      setState(() {
        payment = p;
        refunds = rs;
        order = o;
        for (final e in remaining.entries) {
          amounts.putIfAbsent(e.key, TextEditingController.new);
        }
        if (saved != null && saved['payment_id'] == p.id) {
          reason.text = saved['reason'];
          for (final a in tradeRows(saved['allocations'])) {
            amounts[a['line_id']]?.text = _yuan(a['amount_minor']);
          }
        } else if (p.data['provider'] == 'APPLE') {
          for (final e in remaining.entries) {
            amounts[e.key]!.text = _yuan(e.value);
          }
        }
      });
    } catch (e) {
      if (mounted) setState(() => error = tradeError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String _yuan(int n) => '${n ~/ 100}.${(n % 100).toString().padLeft(2, '0')}';
  bool get locked => busy || widget.session.tradePending.isNotEmpty;
  List<Map<String, dynamic>>? validate() {
    final p = payment;
    if (p == null ||
        !p.refundable ||
        reason.text.trim().isEmpty ||
        reason.text.trim().length > 2000) {
      return null;
    }
    final remaining = tradeRefundRemaining(p, refunds);
    final rows = <Map<String, dynamic>>[];
    for (final e in amounts.entries) {
      if (e.value.text.trim().isEmpty) continue;
      final n = tradeParseYuan(e.value.text);
      if (n == null || n > (remaining[e.key] ?? 0)) return null;
      rows.add({'line_id': e.key, 'amount_minor': n});
    }
    if (rows.isEmpty) return null;
    if (p.data['provider'] == 'APPLE' &&
        (rows.length != remaining.length ||
            rows.any((a) => a['amount_minor'] != remaining[a['line_id']]) ||
            remaining.values.fold<int>(0, (a, b) => a + b) != p.amount)) {
      return null;
    }
    return rows;
  }

  Future<void> submit({bool retry = false}) async {
    final p = payment;
    if (p == null) return;
    final epoch = widget.session.epoch, party = api.owner();
    final values = retry ? null : validate();
    if (!retry && values == null) {
      setState(() => error = '请按可申请余额填写明细金额与原因；Apple 仅支持原付款的完整退款。');
      return;
    }
    if (!await tradeConfirm(context, retry ? '恢复原退款申请' : '确认提交退款审核', [
          tradeFact('原付款', p.id),
          if (values != null)
            tradeFact(
                '申请金额',
                tradeMoney(
                    values.fold(0, (a, v) => a + (v['amount_minor'] as int)))),
          const Text('提交后由独立人员审核，批准不代表已经退款。'),
        ]) ||
        !mounted) {
      return;
    }
    try {
      api.check(epoch, party);
    } catch (_) {
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final r = await (retry
          ? api.retry(path)
          : api.refund(p, values!, reason.text, refunds));
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..removeCurrentSnackBar();
      setState(() => busy = false);
      await Navigator.pushReplacementNamed(
          context, '/trade/record?recordId=${r.id}');
    } catch (e) {
      if (!mounted) return;
      if (e is AccountError && e.status == 412) {
        await load();
        if (mounted) setState(() => error = '记录已更新，请核对最新退款范围后重新确认。');
      } else {
        setState(() => error = tradeError(e, writing: true));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = payment;
    final pending = widget.session.tradePending;
    final remaining =
        p == null ? <String, int>{} : tradeRefundRemaining(p, refunds);
    return tradeScaffold(
        context,
        '申请退款',
        [
          const Text('请选择退款的真实付款与明细，并填写申请原因。我们将根据原订单条款进行审核。',
              style: TextStyle(
                  fontSize: 16, height: 1.6, color: AccountTheme.muted)),
          const SizedBox(height: 16),
          if (error != null) supplyNote(error!, error: true),
          if (busy) const LinearProgressIndicator(),
          if (pending.isNotEmpty)
            supplyCard('原操作结果待核实', [
              appNotice('原申请内容与编号已保留，请先恢复核对。'),
              for (final op in pending)
                tradeButton(
                    '恢复原请求核对',
                    busy
                        ? null
                        : () async {
                            if (op['path'] == path) {
                              await submit(retry: true);
                            } else {
                              final r = await api.retry(op['path']);
                              if (context.mounted) {
                                ScaffoldMessenger.of(context)
                                  ..clearSnackBars()
                                  ..removeCurrentSnackBar();
                                Navigator.pushReplacementNamed(
                                    context, '/trade/record?recordId=${r.id}');
                              }
                            }
                          }),
            ]),
          if (p != null) ...[
            supplyCard('关联订单与付款', [
              tradeFact('原付款', p.id),
              tradeFact('金额', tradeMoney(p.amount)),
              tradeFact('服务器状态', tradeStatuses[p.status]),
              if (p.orderId != null) tradeFact('订单', p.orderId)
            ]),
            supplyCard('原约定退款依据', [
              if (order != null)
                ExpansionTile(title: const Text('展开原订单保存条款'), children: [
                  ContractText(
                      value: order!.data['contract']['commitments'],
                      fieldLabels: tradeContractLabels)
                ]),
              appNotice('按原订单已确认条款核对。申请范围仅限原付款明细；待审核及待核实申请已经占用对应金额。')
            ]),
            if (!p.refundable)
              tradeBanner('这笔付款暂不能申请退款', '仅服务器核实成功且有真实交易编号的付款可以申请退款。请返回原付款核对。',
                  icon: Icons.info_outline),
            if (p.data['provider'] == 'APPLE')
              appNotice('Apple 当前仅支持原付款全额退款。审核通过后仍需用户通过 Apple 官方流程申请。'),
            supplyCard('退款明细与本次金额', [
              for (final e in remaining.entries) ...[
                tradeFact('明细 ${e.key}', '可申请 ${tradeMoney(e.value)}'),
                TextField(
                    controller: amounts[e.key],
                    enabled: !locked &&
                        p.refundable &&
                        p.data['provider'] != 'APPLE' &&
                        e.value > 0,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(
                        labelText: '${e.key} 退款金额', suffixText: '元'),
                    onChanged: (_) => setState(() {})),
                const SizedBox(height: 16),
              ],
            ]),
            supplyCard('申请原因', [
              TextField(
                  controller: reason,
                  enabled: !locked && p.refundable,
                  maxLength: 2000,
                  minLines: 3,
                  maxLines: 6,
                  decoration: const InputDecoration(labelText: '说明与原约定有关的原因'),
                  onChanged: (_) => setState(() {}))
            ]),
            tradeButton('提交退款审核', locked || validate() == null ? null : submit),
          ],
          if (payment == null && !busy)
            tradeButton('重新读取原付款', load, outline: true),
        ],
        locked: locked);
  }
}
