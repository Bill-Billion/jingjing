import 'package:flutter/material.dart';
import '../account/account_session.dart';
import '../account/account_api.dart';
import '../projects/project_api.dart';
import '../projects/project_models.dart';
import 'trade_api.dart';
import 'trade_models.dart';
import 'trade_widgets.dart';

class ParticipationCheckoutPage extends StatelessWidget {
  const ParticipationCheckoutPage(
      {super.key, required this.agreementId, required this.agreementSha256});
  final String agreementId, agreementSha256;
  @override
  Widget build(BuildContext context) => TradeGate(
      returnRoute:
          '/trade/participation-checkout?agreementId=$agreementId&agreementSha256=$agreementSha256',
      builder: (s) =>
          _Checkout(session: s, id: agreementId, hash: agreementSha256));
}

class _Checkout extends StatefulWidget {
  const _Checkout(
      {required this.session, required this.id, required this.hash});
  final AccountSession session;
  final String id, hash;
  @override
  State<_Checkout> createState() => _CheckoutState();
}

class _CheckoutState extends State<_Checkout> {
  static const path = '/api/v1/trade/participation-checkout';
  late final api = TradeApi(widget.session);
  ProjectRecord? agreement, project;
  String? error;
  String channel = 'ALIPAY';
  bool busy = true;
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final t = ++ticket;
    setState(() => busy = true);
    try {
      final a = await ProjectsApi(widget.session)
          .record(widget.id, kind: 'PARTICIPATION');
      if (a.hash != widget.hash) {
        throw const AccountError(412, 'CONFIRMATION_VERSION_MISMATCH');
      }
      final p = await ProjectsApi(widget.session)
          .record(a.projectId!, kind: 'PROJECT');
      if (mounted && t == ticket) {
        setState(() {
          agreement = a;
          project = p;
          error = null;
        });
      }
    } catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          agreement = null;
          project = null;
          error = tradeError(e);
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  int get amount =>
      agreement?.data['amendment']?['cash_required_minor'] ??
      agreement?.data['fee_minor'] ??
      0;
  bool get pending => api.pending(path) != null;
  Future<void> submit() async {
    final epoch = widget.session.epoch, party = api.owner(), a = agreement;
    final recovering = pending;
    if (!recovering && (a == null || amount <= 0 || project?.owner != party)) {
      return;
    }
    if (!await tradeConfirm(
            context, recovering ? '恢复原参演订单请求' : '按原参演约定建立付款订单', [
          tradeFact('本次现金金额', tradeMoney(amount)),
          const Text('约定须由各方确认，服务器重新核对本次合同指纹；建立订单不代表付款或演出许可生效。'),
        ]) ||
        !mounted) {
      return;
    }
    setState(() => busy = true);
    try {
      api.check(epoch, party);
      final result = recovering
          ? await api.retry(path)
          : await api.participationCheckout(a!.id, a.hash, channel);
      api.check(epoch, party);
      if (mounted) {
        await Navigator.pushReplacementNamed(
            context, '/trade/record?recordId=${result.id}');
      }
    } catch (e) {
      if (mounted) setState(() => error = tradeError(e, writing: true));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      '参演付款约定',
      [
        tradeHeading('按原约定付款', eyebrow: 'PARTICIPATION / PAYMENT'),
        if (error != null) Text(error!),
        if (busy) const LinearProgressIndicator(),
        if (agreement != null)
          tradeSection('本次已读取的约定', [
            tradeFact('合同版本', agreement!.version),
            tradeFact('核定现金金额', tradeMoney(amount)),
            tradeFact('原约定用途', agreement!.data['terms']?['permitted_uses']),
            if (project?.owner != api.owner())
              const Text('只有本项目出品方可按会签完成的约定建立付款订单。'),
            if (amount == 0) const Text('本次约定没有现金付款，不创建付款订单。'),
            DropdownButtonFormField<String>(
                initialValue: channel,
                decoration: const InputDecoration(labelText: '付款渠道'),
                items: const [
                  DropdownMenuItem(value: 'ALIPAY', child: Text('支付宝')),
                  DropdownMenuItem(
                      value: 'CUSTODY', child: Text('资金托管账户 · 当前服务未接通'))
                ],
                onChanged: busy || pending
                    ? null
                    : (v) => setState(() => channel = v!)),
          ]),
        if (pending) const Text('上次请求结果待核实。恢复时沿用原内容、渠道和请求编号。'),
        tradeButton('重新读取原约定', busy || pending ? null : load, outline: true),
        tradeButton(
            '查看参演条款与会签',
            busy || pending
                ? null
                : () => Navigator.pushNamed(context,
                    '/projects/participation?view=agreement&recordId=${widget.id}'),
            outline: true),
      ],
      locked: busy || pending,
      footer: FilledButton(
          onPressed: busy ||
                  (!pending &&
                      (agreement == null ||
                          amount <= 0 ||
                          project?.owner != api.owner()))
              ? null
              : submit,
          child: Text(pending ? '恢复原订单请求' : '按原约定建立付款订单')));
}
