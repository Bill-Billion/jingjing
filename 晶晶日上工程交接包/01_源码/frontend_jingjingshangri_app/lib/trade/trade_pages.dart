import 'package:flutter/material.dart';
import '../account/account_session.dart';
import '../account/account_api.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../contracts/contract_text.dart';
import '../supply/supply_widgets.dart';
import 'trade_api.dart';
import 'trade_models.dart';
import 'trade_widgets.dart';
import 'trade_refund_form.dart';

// Gallery: APP-13-01-v2. This route remains a return-based child of the five-tab shell.
class TradeRecordsPage extends StatelessWidget {
  const TradeRecordsPage({super.key, this.kind = 'ORDER'});
  final String kind;
  @override
  Widget build(BuildContext context) => TradeGate(
      returnRoute: '/orders?kind=$kind',
      builder: (s) => _TradeList(
          session: s,
          kind: ['ORDER', 'QUOTE', 'LEGACY', 'PAYMENT', 'REFUND'].contains(kind)
              ? kind
              : 'ORDER'));
}

class _TradeList extends StatefulWidget {
  const _TradeList({required this.session, required this.kind});
  final AccountSession session;
  final String kind;
  @override
  State<_TradeList> createState() => _TradeListState();
}

class _TradeListState extends State<_TradeList> {
  late final api = TradeApi(widget.session);
  late String kind = widget.kind;
  final items = <TradeRecord>[];
  String? cursor, error;
  bool busy = false;
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    final t = ++ticket;
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        items.clear();
        cursor = null;
      }
    });
    try {
      final page = await api.page(kind, cursor: more ? cursor : null);
      if (!mounted || t != ticket) return;
      setState(() {
        items.addAll(
            page.items.where((r) => !items.any((old) => old.id == r.id)));
        cursor = page.nextCursor;
      });
    } catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          items.clear();
          cursor = null;
          error = tradeError(e);
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> open(TradeRecord r) async {
    await Navigator.pushNamed(context, '/trade/record?recordId=${r.id}');
    if (mounted) load();
  }

  Future<void> restore(String path) async {
    setState(() => busy = true);
    try {
      final r = await api.retry(path);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..removeCurrentSnackBar();
      setState(() => busy = false);
      await open(r);
    } catch (e) {
      if (mounted) setState(() => error = tradeError(e, writing: true));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      '订单与报价',
      [
        Text('订单与报价', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text(
            '当前身份：${widget.session.party?['display_name'] ?? shortSupplyId(api.owner())}',
            style: const TextStyle(fontSize: 16, color: AccountTheme.muted)),
        const SizedBox(height: 16),
        SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'ORDER', label: Text('订单')),
              ButtonSegment(value: 'QUOTE', label: Text('报价')),
              ButtonSegment(value: 'LEGACY', label: Text('旧记录'))
            ],
            selected: {
              ['ORDER', 'QUOTE', 'LEGACY'].contains(kind) ? kind : 'ORDER'
            },
            onSelectionChanged: busy || widget.session.tradePending.isNotEmpty
                ? null
                : (v) {
                    setState(() => kind = v.first);
                    load();
                  }),
        const SizedBox(height: 16),
        for (final op in widget.session.tradePending)
          supplyCard('有操作结果待核实', [
            appNotice('原请求内容与编号已保留，先恢复核对，再办理新的操作。'),
            if (op['resultId'] != null) tradeFact('已知结果编号', op['resultId']),
            tradeButton('恢复原请求核对', busy ? null : () => restore(op['path'])),
          ]),
        if (error != null) supplyNote(error!, error: true),
        if (busy) const LinearProgressIndicator(),
        if (!busy && items.isEmpty && error == null)
          supplyCard('暂无${tradeKinds[kind]}',
              [supplyNote('当前身份还没有这类记录。报价由服务提供方在网页建立并经独立审核。')]),
        for (final r in items)
          supplyCard(r.title, [
            Row(children: [
              const Icon(Icons.description_outlined,
                  size: 40, color: AccountTheme.accent),
              const SizedBox(width: 16),
              Expanded(
                  child: Text('${tradeKinds[r.kind]} ${shortSupplyId(r.id)}',
                      style: const TextStyle(fontSize: 16)))
            ]),
            const Divider(),
            tradeFact('金额', tradeMoney(r.amount), accent: true),
            const Divider(),
            tradeFact('当前状态', tradeStatuses[r.status]),
            if (r.kind == 'ORDER')
              tradeFact(
                  '已核实收款', tradeMoney(r.data['financial']['received_minor'])),
            if (r.kind == 'LEGACY') appNotice('仅保留历史依据，不代表渠道已确认到账。'),
            tradeButton('查看${tradeKinds[r.kind]}', busy ? null : () => open(r))
          ]),
        tradeButton('重新读取', busy ? null : () => load(), outline: true),
        if (cursor != null)
          tradeButton('加载更多', busy ? null : () => load(more: true),
              outline: true),
        tradeButton(
            '查看剧本许可',
            widget.session.tradePending.isNotEmpty
                ? null
                : () => Navigator.pushNamed(context, '/licensing'),
            outline: true),
      ],
      locked: busy || widget.session.tradePending.isNotEmpty);
}

class TradeRecordPage extends StatelessWidget {
  const TradeRecordPage({super.key, required this.recordId, this.section});
  final String recordId;
  final String? section;
  @override
  Widget build(BuildContext context) => TradeGate(
      returnRoute:
          '/trade/record?recordId=$recordId${section == null ? '' : '&section=$section'}',
      builder: (s) => _TradeDetail(session: s, id: recordId, section: section));
}

class _TradeDetail extends StatefulWidget {
  const _TradeDetail({required this.session, required this.id, this.section});
  final AccountSession session;
  final String id;
  final String? section;
  @override
  State<_TradeDetail> createState() => _TradeDetailState();
}

class _TradeDetailState extends State<_TradeDetail> {
  late final api = TradeApi(widget.session);
  TradeRecord? record;
  List<TradeRecord> payments = [], refunds = [];
  String? error;
  bool busy = false;
  int ticket = 0;
  final transaction = TextEditingController();
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    transaction.dispose();
    super.dispose();
  }

  Future<void> load() async {
    final t = ++ticket;
    setState(() {
      busy = true;
      record = null;
      payments = [];
      refunds = [];
      error = null;
    });
    try {
      final r = await api.record(widget.id);
      List<TradeRecord> ps = [], rs = [];
      if (r.kind == 'ORDER' && widget.section != 'contract') {
        ps =
            (await api.all('PAYMENT')).where((p) => p.orderId == r.id).toList();
        rs = (await api.all('REFUND')).where((p) => p.orderId == r.id).toList();
      }
      if (!mounted || t != ticket) return;
      setState(() {
        record = r;
        payments = ps;
        refunds = rs;
        transaction.text =
            r.kind == 'PAYMENT' ? (r.data['transaction_id'] ?? '') : '';
      });
    } catch (e) {
      if (mounted && t == ticket) setState(() => error = tradeError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  bool get locked => busy || widget.session.tradePending.isNotEmpty;
  Future<void> mutate(
      String title, String path, Future<TradeRecord> Function() action,
      {List<Widget> facts = const []}) async {
    final epoch = widget.session.epoch, p = api.owner();
    final pending = api.pending(path);
    if (!await tradeConfirm(context, pending == null ? title : '恢复原操作核对', [
          ...facts,
          if (pending != null) const Text('系统使用原请求编号、原内容与原版本核对，不另建相同操作。'),
        ]) ||
        !mounted) {
      return;
    }
    try {
      api.check(epoch, p);
    } catch (_) {
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await (pending != null ? api.retry(path) : action());
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..removeCurrentSnackBar();
      setState(() => busy = false);
      if (result.id != widget.id) {
        await Navigator.pushReplacementNamed(
            context, '/trade/record?recordId=${result.id}');
      } else {
        await load();
      }
    } catch (e) {
      if (!mounted) return;
      if (e is AccountError && e.status == 412) {
        await load();
        if (mounted) {
          setState(() => error = '记录已更新，已重新读取。请核对最新内容并重新确认，旧决定不会重放。');
        }
      } else {
        setState(() => error = tradeError(e, writing: true));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> open(String id, {String? section}) async {
    await Navigator.pushNamed(context,
        '/trade/record?recordId=$id${section == null ? '' : '&section=$section'}');
    if (mounted) load();
  }

  Future<void> cancel() async {
    final input = TextEditingController();
    final reason = await showDialog<String>(
        context: context,
        builder: (c) => AlertDialog(
                title: const Text('取消未付款订单'),
                content: TextField(
                    controller: input,
                    maxLength: 2000,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: '请填写取消理由')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c),
                      child: const Text('返回')),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, input.text.trim()),
                      child: const Text('核对取消'))
                ]));
    input.dispose();
    if (!mounted || reason == null || reason.isEmpty) return;
    final r = record!;
    await mutate('确认取消订单', '/api/v1/trade/orders/${r.id}/cancellation',
        () => api.cancel(r, reason),
        facts: [Text(reason)]);
  }

  List<Widget> quoteView(TradeRecord r, {bool order = false}) {
    final d = r.quote;
    return [
      if (!order)
        tradeBanner(
            tradeStatuses[r.status] ?? r.status,
            r.status == 'APPROVED'
                ? '买方确认后形成订单，付款和签署另行办理。'
                : '仅独立审核通过且在有效期内的指定买方可以确认。'),
      supplyCard('交易双方', [
        tradeFact('提供方', shortSupplyId(r.merchant)),
        tradeFact('买方', r.buyer == null ? '—' : shortSupplyId(r.buyer!)),
        const Divider(),
        tradeFact(
            '交易模式',
            d['transaction_model'] == 'DIRECT_SUPPLIER'
                ? '由服务提供方直接履约'
                : '平台作为交易主体')
      ]),
      supplyCard('报价明细', [
        for (final l in r.lines) ...[
          tradeFact(l['title'], tradeMoney(l['total_minor']), accent: true),
          tradeFact(
              '数量 / 单价', '${l['quantity']} × ${tradeMoney(l['unit_minor'])}'),
          const Divider()
        ],
        tradeFact('总计', tradeMoney(d['total_minor']), accent: true)
      ]),
      Card(
          child: ExpansionTile(
              title: const Text('合同规格'),
              subtitle: const Text('查看交付规格与修改约定'),
              childrenPadding: const EdgeInsets.all(16),
              children: [
            for (final l in r.lines)
              supplyCard('服务规格 · ${l['title']}', [
                tradeFact('档位 / 版本',
                    '${l['specification']['service_tier']} / ${l['specification']['version']}'),
                tradeFact('样片 / 成片',
                    '${l['specification']['sample_seconds']} 秒 / ${l['specification']['final_seconds']} 秒'),
                tradeFact('修改次数', l['specification']['revision_limit']),
                tradeFact('交付内容',
                    (l['specification']['deliverables'] as List).join('\n')),
                ExpansionTile(title: const Text('完整服务条款'), children: [
                  Padding(
                      padding: const EdgeInsets.all(12),
                      child: ContractText(value: l['specification']['terms']))
                ]),
              ]),
          ])),
      supplyCard('付款节点', [
        for (final i in tradeRows(d['installments'], max: 20)) ...[
          tradeFact(
              tradeTriggers[i['trigger']]!,
              tradeMoney(tradeRows(i['allocations'])
                  .fold(0, (a, v) => a + (v['amount_minor'] as int)))),
          ExpansionTile(title: Text('节点 ${i['key']} · 分项金额'), children: [
            for (final a in tradeRows(i['allocations']))
              tradeFact('分配 · ${a['line_id']}', tradeMoney(a['amount_minor'])),
          ]),
          if (i['trigger'] != 'ORDER_ACCEPTED')
            appNotice('本阶段尚未开放验收，此付款节点不可办理。'),
          const Divider(),
        ]
      ]),
      supplyCard('原约定与审核', [
        tradeFact('有效至', tradeDate(d['expires_at'])),
        tradeFact('付款窗口', '${d['payment_window_minutes']} 分钟'),
        tradeFact('渠道', d['channel'] == 'ALIPAY' ? '支付宝' : 'Apple'),
        tradeFact('规则编号', d['rule_id']),
        if (d['review'] != null) tradeFact('独立审核理由', d['review']['reason'])
      ]),
      if (!order &&
          r.status == 'ACCEPTED' &&
          (r.orderId ?? d['order_id']) != null)
        tradeButton(
            '查看已形成订单', locked ? null : () => open(r.orderId ?? d['order_id'])),
      if (!order) appNotice('按当前报价内容确认。后续改价不会覆盖本次原约定。'),
    ];
  }

  List<Widget> orderView(TradeRecord r) {
    final f = r.data['financial'];
    return [
      supplyCard('订单 ${shortSupplyId(r.id)}',
          [tradeStatus(r), appNotice('款项收齐不等于制作完成。样片、成片和验收将在后续开放。')]),
      supplyCard('订单付款', [
        tradeFact('应付总额', tradeMoney(r.amount)),
        const Divider(),
        tradeFact('已核实收款', tradeMoney(f['received_minor']), accent: true),
        const Divider(),
        tradeFact('已核实退款', tradeMoney(f['refunded_minor'])),
        tradeFact('净收款', tradeMoney(f['net_minor']))
      ]),
      supplyCard('合同与许可', [
        tradeButton(
            '查看原合同内容', locked ? null : () => open(r.id, section: 'contract')),
        appNotice('合同内容已保存，尚未签署。付款不代替签约、身份和权属核验。'),
        if (r.quote['license_reservation_id'] != null)
          tradeButton(
              '查看关联许可',
              locked
                  ? null
                  : () => Navigator.pushNamed(context,
                      '/licensing/record?recordId=${r.quote['license_reservation_id']}'),
              outline: true)
      ]),
      ...quoteView(r, order: true),
      if (r.isBuyer(api.owner()) &&
          ['OPEN', 'PARTIALLY_PAID'].contains(r.status))
        supplyCard('办理付款记录', [
          appNotice('当前客户端不能发起实际支付。可以建立并核对原付款记录，真实结果以服务器核对为准。未开通渠道将返回暂不可用。'),
          for (final i in tradeRows(r.quote['installments'], max: 20)) ...[
            Text(tradeTriggers[i['trigger']]!,
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            if (payments.any((p) =>
                p.data['installment_key'] == i['key'] && p.status != 'CLOSED'))
              tradeButton(
                  '查看该节点原付款',
                  locked
                      ? null
                      : () => open(payments
                          .lastWhere((p) =>
                              p.data['installment_key'] == i['key'] &&
                              p.status != 'CLOSED')
                          .id),
                  outline: true)
            else
              tradeButton(
                  i['trigger'] == 'ORDER_ACCEPTED' ? '建立付款记录' : '验收付款暂未开放',
                  locked || i['trigger'] != 'ORDER_ACCEPTED'
                      ? null
                      : () => mutate('建立指定节点付款记录', '/api/v1/trade/payments',
                              () => api.payment(r, i['key']),
                              facts: [
                                tradeFact('节点', tradeTriggers[i['trigger']]),
                                tradeFact(
                                    '本次金额',
                                    tradeMoney(tradeRows(i['allocations']).fold(
                                        0,
                                        (a, v) =>
                                            a + (v['amount_minor'] as int)))),
                                const Text('此操作不会在客户端发起实际支付。')
                              ])),
          ],
        ]),
      supplyCard('原付款与售后退款', [
        if (payments.isEmpty) supplyNote('尚无付款记录。'),
        for (final p in payments)
          ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${p.data['title']} · ${tradeMoney(p.amount)}'),
              subtitle: Text(tradeStatuses[p.status]!),
              trailing: const Icon(Icons.chevron_right),
              onTap: locked ? null : () => open(p.id)),
        for (final x in refunds)
          ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('退款 ${tradeMoney(x.amount)}'),
              subtitle: Text(tradeStatuses[x.status]!),
              trailing: const Icon(Icons.chevron_right),
              onTap: locked ? null : () => open(x.id)),
      ]),
      if (r.isBuyer(api.owner()) &&
          r.status == 'OPEN' &&
          f['received_minor'] == 0 &&
          !payments.any((p) => [
                'CREATED',
                'SUBMITTING',
                'PENDING',
                'UNKNOWN',
                'REVIEW_REQUIRED'
              ].contains(p.status)))
        tradeButton('取消未付款订单', locked ? null : cancel, outline: true),
      if (r.data['cancel_reason'] != null)
        supplyCard('取消理由', [ContractText(value: r.data['cancel_reason'])]),
    ];
  }

  List<Widget> contractView(TradeRecord r) {
    final c = r.data['contract'];
    return [
      tradeBanner('合同内容已保存，尚未签署', '这是本订单返回的合同快照，用于留存与核对。',
          icon: Icons.description_outlined),
      supplyCard('合同信息', [
        tradeFact('合同编号', c['id']),
        tradeFact('买方', r.buyer),
        tradeFact('服务方', r.merchant),
        tradeFact('保存时间', tradeDate(c['created_at']))
      ]),
      supplyCard('已成交报价与付款节点', [
        appNotice('价格、交付规格、修改与退款约定以保存内容为准。'),
        for (final line in r.lines) ...[
          tradeFact(line['title'], tradeMoney(line['total_minor']),
              accent: true),
          tradeFact('数量 / 单价',
              '${line['quantity']} × ${tradeMoney(line['unit_minor'])}'),
        ],
        const Divider(),
        tradeFact('原报价总额', tradeMoney(r.amount), accent: true),
        for (final installment in tradeRows(r.quote['installments'], max: 20))
          tradeFact(
              tradeTriggers[installment['trigger']]!,
              tradeMoney(tradeRows(installment['allocations'])
                  .fold(0, (sum, row) => sum + (row['amount_minor'] as int)))),
      ]),
      supplyCard('规格 / 交付 / 修改 / 退款条款', [
        for (final line in r.lines) ...[
          tradeFact('服务', line['title']),
          tradeFact('档位 / 版本',
              '${line['specification']['service_tier']} / ${line['specification']['version']}'),
          tradeFact('样片 / 成片',
              '${line['specification']['sample_seconds']} 秒 / ${line['specification']['final_seconds']} 秒'),
          tradeFact('修改次数', line['specification']['revision_limit']),
          tradeFact('交付内容',
              (line['specification']['deliverables'] as List).join('、')),
          const Divider(),
        ],
        appNotice('具体责任与退款条件请展开完整保存合同核对。'),
      ]),
      supplyCard('采用规则与版本', [
        for (final rule in c['rule_contents'])
          tradeFact('规则 / 版本', '${rule['rule_key']} / ${rule['version']}'),
      ]),
      Card(
          child: ExpansionTile(
        key: const Key('trade-contract-content'),
        title: const Text('展开完整保存合同'),
        subtitle: const Text('查看全部原约定、规则和保存内容'),
        childrenPadding: const EdgeInsets.all(16),
        children: [ContractText(value: c, fieldLabels: tradeContractLabels)],
      )),
    ];
  }

  List<Widget> paymentView(TradeRecord r) => [
        supplyCard('本次金额', [
          Text(tradeMoney(r.amount),
              style: const TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.w700,
                  color: AccountTheme.accent)),
          const Divider(),
          tradeFact('付款节点', r.data['installment_key']),
          tradeFact('付款编号', r.id)
        ]),
        supplyCard('付款渠道', [
          tradeFact('渠道', r.data['provider'] == 'ALIPAY' ? '支付宝' : 'Apple'),
          tradeFact('环境', r.data['environment'] == 'SANDBOX' ? '测试环境' : '正式环境')
        ]),
        tradeBanner(
            tradeStatuses[r.status]!,
            r.status == 'SUCCEEDED'
                ? '服务器已核实真实收款，仍须另行办理制作、签署和许可。'
                : '请先核对这笔付款，不要重复支付。客户端不能发起实际支付。',
            icon: Icons.receipt_long_outlined),
        if (r.data['provider'] == 'APPLE')
          supplyCard('核对 Apple 交易', [
            appNotice('请填写这笔真实付款的 Apple 交易编号；没有交易编号时请等待，不填写示例编号。'),
            TextField(
                controller: transaction,
                maxLength: 128,
                decoration: const InputDecoration(labelText: '真实 Apple 交易编号'))
          ]),
        if (r.isBuyer(api.owner()))
          tradeButton(
              '核对这笔付款',
              locked
                  ? null
                  : () => mutate(
                      '核对原付款记录',
                      '/api/v1/trade/payments/${r.id}/reconciliation',
                      () => api.reconcile(r,
                          transaction: transaction.text.trim()))),
        if (r.refundable)
          tradeButton(
              '申请逐项退款',
              locked
                  ? null
                  : () async {
                      await Navigator.pushNamed(
                          context, '/trade/refund?paymentId=${r.id}');
                      if (mounted) load();
                    },
              outline: true),
        if (r.orderId != null)
          tradeButton('返回订单', locked ? null : () => open(r.orderId!),
              outline: true),
      ];
  List<Widget> refundView(TradeRecord r) => [
        tradeBanner(
            tradeStatuses[r.status]!,
            r.status == 'AWAITING_APPLE_REQUEST'
                ? '等待用户通过 Apple 官方退款流程提交申请。本客户端尚未接入 StoreKit 退款，当前状态不表示已退款。'
                : r.status == 'SUCCEEDED'
                    ? '服务器已核实退款；后续许可使用仍需核对退款影响。'
                    : '申请、批准和执行均不代表已实际退款，最终以服务器核对为准。',
            icon: Icons.receipt_long_outlined),
        supplyCard('退款申请', [
          tradeFact('退款编号', r.id),
          tradeFact('原付款', r.data['payment_id']),
          tradeFact('金额', tradeMoney(r.amount), accent: true),
          for (final a in tradeRows(r.data['allocations']))
            tradeFact('明细 ${a['line_id']}', tradeMoney(a['amount_minor'])),
          tradeFact('原因', r.data['reason'])
        ]),
        supplyCard('独立审核', [
          tradeFact(
              '审核结论',
              r.data['review'] == null
                  ? '等待审核'
                  : tradeStatuses[r.data['review']['decision']]),
          if (r.data['review'] != null)
            tradeFact('审核理由', r.data['review']['reason']),
          appNotice('审核与执行由独立人员在网页办理。')
        ]),
        if ([
          'SUBMITTING',
          'PENDING',
          'UNKNOWN',
          'AWAITING_APPLE_REQUEST',
          'SUCCEEDED'
        ].contains(r.status))
          tradeButton(
              '核对这笔退款',
              locked
                  ? null
                  : () => mutate(
                      '核对原退款记录',
                      '/api/v1/trade/refunds/${r.id}/reconciliation',
                      () => api.reconcile(r))),
        tradeButton('查看原付款', locked ? null : () => open(r.data['payment_id']),
            outline: true),
        if (r.orderId != null)
          tradeButton('返回订单', locked ? null : () => open(r.orderId!),
              outline: true),
      ];
  List<Widget> legacyView(TradeRecord r) => [
        tradeBanner(tradeStatuses[r.status]!, '历史材料仅用于保留与核对，不追认为支付渠道已确认到账。',
            icon: Icons.history),
        supplyCard('历史原始依据', [
          tradeFact('来源系统', r.data['source_system']),
          tradeFact('原订单编号', r.data['source_order_id']),
          for (final l in tradeRows(r.data['original_lines'])) ...[
            tradeFact(l['line_id'], tradeMoney(l['amount_minor'])),
            tradeFact(
                '原报告状态',
                {
                  'REPORTED_PAID': '原报告已付款',
                  'REPORTED_UNPAID': '原报告未付款',
                  'UNKNOWN': '原报告状态未知'
                }[l['reported_status']]),
            const Divider(),
          ]
        ]),
        supplyCard('原条款', [ContractText(value: r.data['original_terms'])]),
        supplyCard('历史材料审核', [
          tradeFact('附件编号', r.data['evidence_asset_id']),
          appNotice('私有附件仅供独立审核人员在网页按权限下载。'),
          if (r.data['review'] != null)
            tradeFact('审核理由', r.data['review']['reason'])
        ]),
      ];
  @override
  Widget build(BuildContext context) {
    final r = record;
    return tradeScaffold(
        context,
        widget.section == 'contract'
            ? '订单合同与原约定'
            : r == null
                ? '交易详情'
                : '${tradeKinds[r.kind]}详情',
        [
          if (busy) const LinearProgressIndicator(),
          if (error != null) supplyNote(error!, error: true),
          for (final op in widget.session.tradePending)
            supplyCard('操作结果待核实', [
              appNotice('请恢复原请求核对，不要修改原内容或重复建立付款。'),
              if (op['resultId'] != null) tradeFact('已知结果编号', op['resultId']),
              tradeButton(
                  '恢复原请求核对',
                  busy
                      ? null
                      : () => mutate(
                          '恢复核对', op['path'], () => api.retry(op['path']))),
            ]),
          if (r != null)
            ...switch (r.kind) {
              'QUOTE' => quoteView(r),
              'ORDER' =>
                widget.section == 'contract' ? contractView(r) : orderView(r),
              'PAYMENT' => paymentView(r),
              'REFUND' => refundView(r),
              'LEGACY' => legacyView(r),
              _ => [supplyNote('服务规格由商家在网页管理。')]
            },
          tradeButton('重新读取当前记录', busy ? null : load, outline: true),
        ],
        locked: locked,
        footer: r?.kind == 'QUOTE' &&
                r!.status == 'APPROVED' &&
                r.isBuyer(api.owner())
            ? FilledButton(
                onPressed: locked ||
                        !DateTime.parse(r.data['expires_at'])
                            .isAfter(DateTime.now())
                    ? null
                    : () => mutate(
                            '确认本报价与原约定',
                            '/api/v1/trade/quotes/${r.id}/acceptance',
                            () => api.accept(r),
                            facts: [
                              tradeFact('总价', tradeMoney(r.amount)),
                              const Text('确认后保存合同内容，尚未签署；付款和许可另行办理。')
                            ]),
                child: const Text('确认报价形成订单'))
            : null);
  }
}

// APP-31-01; a new form reads the original payment and all existing refund reservations.
class TradeRefundPage extends StatelessWidget {
  const TradeRefundPage({super.key, required this.paymentId});
  final String paymentId;
  @override
  Widget build(BuildContext context) => TradeGate(
      returnRoute: '/trade/refund?paymentId=$paymentId',
      builder: (s) => TradeRefundForm(session: s, paymentId: paymentId));
}
