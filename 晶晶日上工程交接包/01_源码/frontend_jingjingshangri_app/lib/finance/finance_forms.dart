import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../projects/project_widgets.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_models.dart';
import '../trade/trade_widgets.dart';
import 'finance_api.dart';
import 'finance_models.dart';
import 'finance_widgets.dart';

class FinanceFormPage extends StatelessWidget {
  const FinanceFormPage({super.key, required this.mode, required this.id});
  final String mode, id;
  @override
  Widget build(BuildContext context) => FinanceGate(
      returnRoute: mode == 'PAYOUT'
          ? '/finance/payout/new?agreementId=$id'
          : '/finance/dispute/new?recordId=$id',
      builder: (s) => _Form(session: s, mode: mode, id: id));
}

class _Form extends StatefulWidget {
  const _Form({required this.session, required this.mode, required this.id});
  final AccountSession session;
  final String mode, id;
  @override
  State<_Form> createState() => _FormState();
}

class _FormState extends State<_Form> {
  late final api = FinanceApi(widget.session),
      supply = SupplyApi(widget.session);
  FinanceRecord? target;
  Map<String, dynamic>? mine;
  final amount = TextEditingController(), note = TextEditingController();
  String? category, error;
  List<String> assets = [];
  bool busy = false;
  String get path => widget.mode == 'PAYOUT'
      ? '/api/v1/finance/agreements/${widget.id}/payouts'
      : '/api/v1/finance/records/${widget.id}/disputes';
  bool get locked =>
      busy ||
      widget.session.financePending.isNotEmpty ||
      supply.pending('/api/v1/supply/assets') != null;
  int? get money => tradeParseYuan(amount.text);
  bool get canSubmit =>
      !locked &&
      target != null &&
      note.text.trim().isNotEmpty &&
      assets.isNotEmpty &&
      (widget.mode == 'PAYOUT'
          ? money != null &&
              mine != null &&
              money! <= mine!['available_minor'] &&
              mine!['meaning'] != 'MERCHANT_RETAINED_NOT_TRANSFER'
          : financeCategories.containsKey(category));
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    amount.dispose();
    note.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
      target = null;
      mine = null;
    });
    try {
      final r = await api.record(widget.id,
          kind: widget.mode == 'PAYOUT' ? 'AGREEMENT' : null);
      final balances = widget.mode == 'PAYOUT' ? await api.balances(r) : null;
      if (mounted) {
        setState(() {
          target = r;
          mine = (balances?['items'] as List? ?? [])
              .where((x) => x['party_id'] == api.owner())
              .firstOrNull;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = financeError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> submit({bool retry = false}) async {
    if (!retry && !canSubmit) return;
    if (!retry &&
        !await tradeConfirm(
            context, widget.mode == 'PAYOUT' ? '提交付款申请' : '提交结算或权利异议', [
          if (widget.mode == 'PAYOUT')
            tradeFact('本次申请', financeMoneyText(money!)),
          financeParagraph(widget.mode == 'PAYOUT'
              ? '申请将进入独立审核。申请、批准与真实外部付款分别核验。'
              : '异议与原退款流程分别办理。未决异议暂停新的付款申请与批准。')
        ])) {
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final r = retry
          ? await api.retry(path)
          : await api.write(
              path,
              widget.mode == 'PAYOUT'
                  ? {
                      'recipient_party_id': api.owner(),
                      'amount_minor': money,
                      'destination_asset_id': assets.single,
                      'note': note.text.trim()
                    }
                  : {
                      'category': category,
                      'reason': note.text.trim(),
                      'evidence_asset_ids': assets
                    },
              version: target!.version,
              kind: widget.mode);
      if (!mounted) return;
      financeClearWarnings(context);
      await Navigator.pushReplacementNamed(
          context, '/finance/record?recordId=${r.id}');
    } on AccountError catch (e) {
      if (!mounted) return;
      if (e.status == 412) {
        await load();
        if (mounted) setState(() => error = financeError(e, writing: true));
      } else {
        setState(() => error = financeError(e, writing: true));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  List<Widget> payout() => [
        supplyCard('收款主体', [
          financeIdFact('当前主体', api.owner()),
          supplyNote('本次申请的收款主体为当前登录身份。')
        ]),
        supplyCard('可申请金额', [
          if (mine != null) ...[
            tradeFact('当前可申请', financeMoneyText(mine!['available_minor']),
                accent: true),
            if (mine!['reason_code'] != null)
              appNotice(financeError(AccountError(409, mine!['reason_code']))),
            if (mine!['meaning'] == 'MERCHANT_RETAINED_NOT_TRANSFER')
              appNotice('这是商户留存，不形成给自己的付款申请。')
          ] else
            supplyNote('服务器没有返回本人可申请额度，不能填写其他主体金额。')
        ]),
        supplyCard('申请金额', [
          projectField(amount, '申请金额（元）',
              keyboard: const TextInputType.numberWithOptions(decimal: true),
              max: 16,
              enabled: !locked,
              changed: (_) => setState(() {})),
          supplyNote('金额精确到分，不默认填写额度；并发申请共同占用当前可付金额。')
        ]),
        supplyCard('收款资料', [
          supplyNote('上传私有收款资料，仅用于本次付款核验。'),
          SupplyFiles(
              api: supply,
              purpose: 'REVIEW_EVIDENCE',
              ids: assets,
              single: true,
              enabled: !locked,
              onChanged: (v) => setState(() => assets = v))
        ]),
        supplyCard('备注', [
          projectField(note, '备注',
              lines: 3,
              max: 4000,
              enabled: !locked,
              changed: (_) => setState(() {}))
        ]),
        supplyCard('付款方式', [appNotice('实际付款后核验凭据；自动出款未启用。申请通过不代表已付款。')]),
        tradeButton('提交付款申请', canSubmit ? submit : null)
      ];
  List<Widget> dispute() => [
        if (target != null)
          supplyCard('本次结算记录', [
            tradeFact('记录类型', financeKinds[target!.kind]),
            financeIdFact('异议对象', target!.id),
            tradeFact('当前版本', '第 ${target!.version} 版')
          ]),
        financeParagraph('如对结算、权利或相关约定有异议，请提交真实说明与材料。处理结果保留历史，退款另走原付款记录。'),
        supplyCard('问题类型', [
          projectSelect(
              '问题类型',
              category,
              [for (final e in financeCategories.entries) (e.key, e.value)],
              locked ? null : (v) => setState(() => category = v))
        ]),
        supplyCard('原因', [
          projectField(note, '原因',
              lines: 4,
              max: 8000,
              enabled: !locked,
              changed: (_) => setState(() {}))
        ]),
        supplyCard('证据', [
          supplyNote('上传相关私有证据，如合同、截图或沟通记录。'),
          SupplyFiles(
              api: supply,
              purpose: 'REVIEW_EVIDENCE',
              ids: assets,
              enabled: !locked,
              onChanged: (v) => setState(() => assets = v))
        ]),
        tradeButton('提交异议', canSubmit ? submit : null)
      ];
  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      widget.mode == 'PAYOUT' ? '申请付款' : '结算或权利异议',
      [
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!, icon: Icons.error_outline),
        if (api.pending(path) != null)
          supplyCard('原请求结果待核实', [
            supplyNote('原内容、版本和请求编号已保留。恢复会先读取目标与获准结果，再原样核对。'),
            tradeButton('恢复原请求核对', busy ? null : () => submit(retry: true))
          ]),
        if (target != null) ...(widget.mode == 'PAYOUT' ? payout() : dispute()),
        tradeButton('重新核对当前记录', locked ? null : load, outline: true)
      ],
      locked: locked);
}
