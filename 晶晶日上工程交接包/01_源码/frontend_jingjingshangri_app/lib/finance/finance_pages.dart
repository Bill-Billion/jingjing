import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../contracts/contract_text.dart';
import '../projects/project_widgets.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_widgets.dart';
import 'finance_api.dart';
import 'finance_models.dart';
import 'finance_widgets.dart';

class FinanceAgreementsPage extends StatelessWidget {
  const FinanceAgreementsPage({super.key, this.sourceId});
  final String? sourceId;
  @override
  Widget build(BuildContext context) => FinanceGate(
      returnRoute:
          sourceId == null ? '/finance' : '/finance?sourceId=${sourceId!}',
      builder: (s) => _Agreements(session: s, sourceId: sourceId));
}

class _Agreements extends StatefulWidget {
  const _Agreements({required this.session, this.sourceId});
  final AccountSession session;
  final String? sourceId;
  @override
  State<_Agreements> createState() => _AgreementsState();
}

class _AgreementsState extends State<_Agreements> {
  late final api = FinanceApi(widget.session);
  List<FinanceRecord> rows = [];
  String? cursor, error;
  bool busy = false;
  bool get locked => busy || widget.session.financePending.isNotEmpty;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    setState(() {
      busy = true;
      error = null;
      if (!more) rows = [];
    });
    try {
      final d = await api.page(cursor: more ? cursor : null);
      if (mounted) {
        setState(() {
          rows = {
            for (final r in [...(more ? rows : <FinanceRecord>[]), ...d.items])
              r.id: r
          }.values.toList();
          cursor = d.cursor;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = financeError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      '我的结算',
      [
        supplyCard('当前身份', [
          tradeFact('办事身份', widget.session.party?['display_name']),
          financeParagraph('先选择一份结算约定，再查看本人金额。客户付款、约定分成与合作方实际收款分别核对。')
        ]),
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!, icon: Icons.error_outline),
        for (final op in widget.session.financePending)
          supplyCard('原操作待核实', [
            supplyNote('原内容、版本及请求编号已保留。'),
            tradeButton(
                '恢复原请求核对',
                busy
                    ? null
                    : () async {
                        setState(() => busy = true);
                        try {
                          final r = await api.retry(op['path']);
                          if (!mounted || !context.mounted) return;
                          financeClearWarnings(context);
                          await Navigator.pushNamed(
                              context, '/finance/record?recordId=${r.id}');
                          if (mounted) await load();
                        } on AccountError catch (e) {
                          if (mounted) {
                            setState(
                                () => error = financeError(e, writing: true));
                          }
                        } finally {
                          if (mounted) setState(() => busy = false);
                        }
                      })
          ]),
        if (widget.sourceId != null)
          supplyNote('按此来源查找本次返回的可读约定。若当前页没有匹配，可继续读取下一页。'),
        for (final r in rows.where((r) =>
            widget.sourceId == null || r.data['source_id'] == widget.sourceId))
          supplyCard('结算约定 · ${shortSupplyId(r.id)}', [
            tradeFact('来源', r.data['source_type'] == 'ORDER' ? '订单结算' : '发行结算'),
            financeIdFact('来源', r.data['source_id']),
            tradeFact(
                '环境', r.data['environment'] == 'SANDBOX' ? '测试数据' : '正式环境'),
            tradeFact('审核状态', financeStatuses[r.status]),
            tradeButton(
                '查看本人结算',
                locked
                    ? null
                    : () => Navigator.pushNamed(
                        context, '/finance/agreement?agreementId=${r.id}'))
          ]),
        if (!busy && rows.isEmpty && error == null)
          supplyCard('暂无可读结算约定',
              [supplyNote('仅列当前身份获准参与的约定。新约定、独立审核和实际外部付款由财务网页工作台办理。')]),
        if (cursor != null)
          tradeButton('继续读取下一页', locked ? null : () => load(more: true),
              outline: true),
        tradeButton('重新读取约定', locked ? null : load, outline: true),
        supplyCard('真实付款', [appNotice('自动出款未启用。申请通过不代表已经付款，到账以真实外部凭据独立核验为准。')])
      ],
      locked: locked);
}

class FinanceOverviewPage extends StatelessWidget {
  const FinanceOverviewPage({super.key, required this.agreementId});
  final String agreementId;
  @override
  Widget build(BuildContext context) => FinanceGate(
      returnRoute: '/finance/agreement?agreementId=$agreementId',
      builder: (s) => _Overview(session: s, id: agreementId));
}

class _Overview extends StatefulWidget {
  const _Overview({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_Overview> createState() => _OverviewState();
}

class _OverviewState extends State<_Overview> {
  late final api = FinanceApi(widget.session);
  FinanceRecord? g;
  Map<String, dynamic>? balance, readiness;
  bool busy = false;
  String? error;
  bool get locked => busy || widget.session.financePending.isNotEmpty;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      g = null;
      balance = null;
      readiness = null;
      error = null;
    });
    try {
      final r = await api.record(widget.id, kind: 'AGREEMENT'),
          b = await api.balances(r),
          ready = await api.readiness(r);
      if (mounted) {
        setState(() {
          g = r;
          balance = b;
          readiness = ready;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = financeError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void open(String path) => Navigator.pushNamed(context, path).then((_) {
        if (mounted) load();
      });
  @override
  Widget build(BuildContext context) {
    final mine = (balance?['items'] as List? ?? [])
        .where((r) => r['party_id'] == api.owner())
        .firstOrNull;
    return tradeScaffold(
        context,
        '我的结算',
        [
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!, icon: Icons.error_outline),
          if (g != null) ...[
            supplyCard('当前约定', [
              financeIdFact('约定', g!.id),
              tradeFact('当前身份', widget.session.party?['display_name']),
              supplyNote('已选择一份结算约定，以下为本人结算信息。'),
              tradeButton('切换结算约定', locked ? null : () => open('/finance'),
                  outline: true)
            ]),
            supplyCard('来源与环境', [
              tradeFact(
                  '结算来源', g!.data['source_type'] == 'ORDER' ? '订单结算' : '发行结算'),
              financeIdFact('来源', g!.data['source_id']),
              tradeFact(
                  '环境', balance!['environment'] == 'SANDBOX' ? '测试数据' : '正式环境')
            ]),
            if (mine != null)
              supplyCard('本人金额', [
                supplyNote('仅展示当前约定下本人的结算金额。'),
                financeAmounts(financeMap(mine)),
                const SizedBox(height: 12),
                tradeFact('已核实调整', financeMoneyText(mine['adjustment_minor'])),
                if (mine['recovery_due_minor'] > 0)
                  tradeFact('待追回', financeMoneyText(mine['recovery_due_minor']),
                      accent: true),
                if (mine['meaning'] == 'MERCHANT_RETAINED_NOT_TRANSFER')
                  appNotice('商户自身留存，不形成给自己转账或提现。')
              ])
            else
              supplyCard('本人金额', [supplyNote('服务器本次没有返回本人余额，不能推算或合并其他主体的金额。')]),
            if (mine?['reason_code'] != null)
              supplyCard('当前限制原因', [
                appNotice(financeError(AccountError(409, mine['reason_code'])))
              ]),
            if (g!.data['source_type'] == 'RELEASE')
              supplyCard('发行收入与实收', [
                tradeFact(
                    '已核实实际收款', financeMoneyText(balance!['received_minor'])),
                tradeFact(
                    balance!['receivable_minor'] < 0 ? '渠道多收待核对' : '渠道尚欠',
                    financeMoneyText(balance!['receivable_minor'] < 0
                        ? -balance!['receivable_minor']
                        : balance!['receivable_minor'])),
                supplyNote('账单确认收入与真实收款分别保存。多收仅列待核对，没有自动退回渠道。')
              ])
            else
              supplyCard('客户付款', [
                tradeFact(
                    '订单已核实净收款', financeMoneyText(balance!['received_minor'])),
                supplyNote('客户付款不等于本人分成已经收到。')
              ]),
            supplyCard('相关记录', [
              tradeButton(
                  '查看结算单',
                  locked
                      ? null
                      : () => open(
                          '/finance/records?agreementId=${g!.id}&kind=SETTLEMENT'),
                  outline: true),
              tradeButton(
                  '查看本约定流水',
                  locked
                      ? null
                      : () => open('/finance/entries?agreementId=${g!.id}'),
                  outline: true),
              tradeButton(
                  '查看约定与确认',
                  locked
                      ? null
                      : () => open('/finance/record?recordId=${g!.id}'),
                  outline: true),
              tradeButton(
                  '查看付款申请',
                  locked
                      ? null
                      : () => open(
                          '/finance/records?agreementId=${g!.id}&kind=PAYOUT'),
                  outline: true),
              tradeButton(
                  '查看异议记录',
                  locked
                      ? null
                      : () => open(
                          '/finance/records?agreementId=${g!.id}&kind=DISPUTE'),
                  outline: true),
              if (g!.data['source_type'] == 'RELEASE') ...[
                tradeButton(
                    '查看发行账单',
                    locked
                        ? null
                        : () => open(
                            '/finance/records?agreementId=${g!.id}&kind=STATEMENT'),
                    outline: true),
                tradeButton(
                    '查看实际收款记录',
                    locked
                        ? null
                        : () => open(
                            '/finance/records?agreementId=${g!.id}&kind=RECEIPT'),
                    outline: true)
              ],
              tradeButton(
                  '申请付款',
                  locked ||
                          mine == null ||
                          mine['available_minor'] <= 0 ||
                          mine['meaning'] == 'MERCHANT_RETAINED_NOT_TRANSFER'
                      ? null
                      : () => open('/finance/payout/new?agreementId=${g!.id}'))
            ]),
            if (readiness != null)
              supplyCard('付款方式', [appNotice('自动出款未启用。实际外部付款、私有凭据与独立核验另行办理。')])
          ],
          tradeButton('刷新本人结算', locked ? null : load, outline: true)
        ],
        locked: locked);
  }
}

class FinanceRecordsPage extends StatelessWidget {
  const FinanceRecordsPage(
      {super.key, required this.agreementId, required this.kind});
  final String agreementId, kind;
  @override
  Widget build(BuildContext context) => FinanceGate(
      returnRoute: '/finance/records?agreementId=$agreementId&kind=$kind',
      builder: (s) => _Records(session: s, id: agreementId, kind: kind));
}

class _Records extends StatefulWidget {
  const _Records({required this.session, required this.id, required this.kind});
  final AccountSession session;
  final String id, kind;
  @override
  State<_Records> createState() => _RecordsState();
}

class _RecordsState extends State<_Records> {
  late final api = FinanceApi(widget.session);
  List<FinanceRecord> rows = [];
  String? cursor, error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    setState(() {
      busy = true;
      error = null;
      if (!more) rows = [];
    });
    try {
      final d = await api.page(
          agreementId: widget.id,
          kind: widget.kind,
          cursor: more ? cursor : null);
      if (mounted) {
        setState(() {
          rows = {
            for (final r in [...(more ? rows : <FinanceRecord>[]), ...d.items])
              r.id: r
          }.values.toList();
          cursor = d.cursor;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = financeError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      financeKinds[widget.kind] ?? '结算记录',
      [
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!),
        for (final r in rows)
          supplyCard('${financeKinds[r.kind]!} · ${shortSupplyId(r.id)}', [
            tradeFact('状态', financeStatuses[r.status]),
            if (r.data['period_reference'] != null)
              tradeFact('结算期间', r.data['period_reference']),
            if (r.data['amount_minor'] != null)
              tradeFact('金额', financeMoneyText(r.data['amount_minor'])),
            tradeButton(
                '查看记录',
                busy || widget.session.financePending.isNotEmpty
                    ? null
                    : () => Navigator.pushNamed(
                                context, '/finance/record?recordId=${r.id}')
                            .then((_) {
                          if (mounted) load();
                        }))
          ]),
        if (rows.isEmpty && !busy && error == null) supplyNote('本页暂无获准查看的记录。'),
        if (cursor != null)
          tradeButton('继续读取下一页', busy ? null : () => load(more: true),
              outline: true),
        tradeButton('重新读取记录', busy ? null : load, outline: true)
      ],
      locked: busy || widget.session.financePending.isNotEmpty);
}

class FinanceRecordPage extends StatelessWidget {
  const FinanceRecordPage({super.key, required this.recordId});
  final String recordId;
  @override
  Widget build(BuildContext context) => FinanceGate(
      returnRoute: '/finance/record?recordId=$recordId',
      builder: (s) => _Record(session: s, id: recordId));
}

class _Record extends StatefulWidget {
  const _Record({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_Record> createState() => _RecordState();
}

class _RecordState extends State<_Record> {
  late final api = FinanceApi(widget.session),
      supply = SupplyApi(widget.session);
  FinanceRecord? r, g;
  List<Map<String, dynamic>> confirmations = [];
  List<FinanceRecord> related = [];
  String? error, notice;
  bool busy = false, read = false;
  List<String> assets = [];
  final reason = TextEditingController();
  bool get locked =>
      busy ||
      widget.session.financePending.isNotEmpty ||
      supply.pending('/api/v1/supply/assets') != null;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    reason.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      r = null;
      g = null;
      confirmations = [];
      related = [];
      read = false;
      assets = [];
      reason.clear();
      error = null;
      notice = null;
    });
    try {
      final v = await api.record(widget.id),
          agreement = v.kind == 'AGREEMENT'
              ? v
              : await api.record(v.agreementId!, kind: 'AGREEMENT');
      final c = ['AGREEMENT', 'SETTLEMENT'].contains(v.kind)
          ? await api.confirmations(v)
          : <Map<String, dynamic>>[];
      final children = v.kind == 'DISPUTE'
          ? (await api.all(agreement.id, 'RESPONSE'))
              .where((x) => x.data['dispute_id'] == v.id)
              .toList()
          : v.kind == 'PAYOUT'
              ? (await api.all(agreement.id, 'PAYOUT_EVIDENCE'))
                  .where((x) => x.data['payout_id'] == v.id)
                  .toList()
              : v.kind == 'STATEMENT'
                  ? (await api.all(agreement.id, 'RECEIPT'))
                      .where((x) => x.data['statement_id'] == v.id)
                      .toList()
                  : <FinanceRecord>[];
      if (mounted) {
        setState(() {
          r = v;
          g = agreement;
          confirmations = c;
          related = children;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = financeError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> perform(String title, Future<FinanceRecord> Function() action,
      {bool restoring = false}) async {
    if (!restoring &&
        !await tradeConfirm(context, title,
            [financeParagraph('按当前准确版本和页面原约定办理。确认不代替真实付款、签约或独立核验。')])) {
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      await action();
      if (!mounted) return;
      financeClearWarnings(context);
      await load();
      if (mounted) setState(() => notice = '本次操作已核对。');
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

  void open(String path) => Navigator.pushNamed(context, path).then((_) {
        if (mounted) load();
      });
  Widget link(FinanceRecord x) => tradeButton(
      '查看${financeKinds[x.kind]!} · ${shortSupplyId(x.id)}',
      locked ? null : () => open('/finance/record?recordId=${x.id}'),
      outline: true);
  List<Widget> rules() => [
        supplyCard('规则说明', [
          tradeFact('规则版本', g!.data['rules']['version']),
          tradeFact('约定结算时间', tradeDate(g!.data['rules']['settlement_at'])),
          tradeFact(
              '可结算条件',
              g!.data['rules']['release_condition'] == 'RECEIVED'
                  ? '核实收款后'
                  : '要求制作交付验收'),
          financeParagraph(g!.data['rules']['terms']),
          for (final line in g!.data['rules']['lines'])
            ExpansionTile(title: Text('分配明细 · ${line['line_id']}'), children: [
              for (final share in line['shares'])
                tradeFact(
                    '${financeRoles[share['role']]!} · ${shortSupplyId(share['party_id'])}',
                    percent(share['bps'])),
              for (final fee in line['deductions']) ...[
                tradeFact('费用承担主体', shortSupplyId(fee['party_id'])),
                tradeFact('费用金额', financeMoneyText(fee['amount_minor'])),
                financeParagraph(fee['basis']),
                tradeFact('退款时费用处理',
                    fee['refund_behavior'] == 'RETAIN' ? '费用保留' : '同比减少')
              ],
              if ((line['deductions'] as List).isEmpty)
                supplyNote('这条明细未列额外扣项。')
            ]),
          ExpansionTile(title: const Text('完整保存规则'), children: [
            Padding(
                padding: const EdgeInsets.all(16),
                child: ContractText(
                    value: g!.data['rule_snapshot'],
                    fieldLabels: financeLabels))
          ])
        ])
      ];
  String percent(int bps) =>
      '${bps ~/ 100}.${(bps % 100).toString().padLeft(2, '0')}%';
  List<Widget> confirming(FinanceRecord x) {
    final p = api.owner(),
        mine = confirmations
            .where((c) => c['party_id'] == p && c['content_sha256'] == x.hash)
            .firstOrNull;
    final eligible = x.status == 'APPROVED' &&
        (g!.data['parties'] as List).contains(p) &&
        mine == null;
    final snapshot = x.kind == 'SETTLEMENT'
        ? (x.data['balances'] as List)
            .where((b) => b['party_id'] == p)
            .firstOrNull
        : null;
    return [
      appNotice(x.kind == 'SETTLEMENT'
          ? '本次结算需审核与准确确认。这里只确认本人可见份额及原约定，实付另行核实。'
          : '审核通过后，由相关方确认本份准确约定。确认不替代签约或转账。'),
      supplyCard(x.kind == 'SETTLEMENT' ? '结算期间' : '本次约定', [
        if (x.kind == 'SETTLEMENT')
          tradeFact('结算期间', x.data['period_reference']),
        financeIdFact('来源', g!.data['source_id']),
        tradeFact('环境', g!.data['environment'] == 'SANDBOX' ? '测试数据' : '正式环境'),
        financeIdFact('准确版本', x.id),
        tradeFact('记录版本', '第 ${x.version} 版'),
        ExpansionTile(
            title: const Text('原始确认指纹'), children: [SelectableText(x.hash)]),
        if (x.kind == 'SETTLEMENT')
          supplyNote('指纹绑定原始不可变快照。本人投影不重新生成指纹，也不表示看过其他主体余额。')
      ]),
      if (x.kind == 'SETTLEMENT')
        supplyCard('本人份额', [
          if (snapshot != null) ...[
            tradeFact('本期应得', financeMoneyText(snapshot['accrued_minor'])),
            tradeFact('已核实调整', financeMoneyText(snapshot['adjustment_minor'])),
            tradeFact('已核实付款', financeMoneyText(snapshot['paid_minor'])),
            tradeFact('尚未付款', financeMoneyText(snapshot['balance_minor']),
                accent: true)
          ] else
            supplyNote('本版未返回本人份额，不能推算其他人的金额。'),
          financeParagraph(x.data['note']),
          ExpansionTile(title: const Text('查看本次来源'), children: [
            for (final source in x.data['source_references']) ...[
              financeIdFact('事实记录', source['record_id'] ?? source['id']),
              tradeFact('事实金额', financeMoneyText(source['amount_minor'])),
              tradeFact(
                  '事实类型',
                  source['direction'] == 'REFUND'
                      ? '已核实退款'
                      : source['direction'] == 'STATEMENT'
                          ? '发行账单'
                          : '已核实收款')
            ]
          ])
        ]),
      ...rules(),
      supplyCard('确认状态', [
        for (final party in g!.data['parties'])
          tradeFact(
              '主体 · ${shortSupplyId(party)}',
              confirmations.any((c) =>
                      c['party_id'] == party && c['content_sha256'] == x.hash)
                  ? confirmations.firstWhere((c) =>
                              c['party_id'] == party &&
                              c['content_sha256'] == x.hash)['decision'] ==
                          'APPROVED'
                      ? '同意本版'
                      : '不同意本版'
                  : '尚未确认'),
        if (mine != null) ...[
          appNotice(mine['decision'] == 'APPROVED' ? '本人已同意本版本。' : '本人不同意本版本。'),
          financeParagraph(mine['reason'])
        ]
      ]),
      if (eligible)
        supplyCard('意见', [
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: read,
              onChanged:
                  locked ? null : (v) => setState(() => read = v == true),
              title: const Text('已完整阅读本人份额与本版原约定')),
          projectField(reason, '确认意见',
              lines: 3,
              max: 2000,
              enabled: !locked,
              changed: (_) => setState(() {})),
          tradeButton(
              x.kind == 'SETTLEMENT' ? '确认本次结算' : '同意本约定',
              locked || !read || reason.text.trim().isEmpty
                  ? null
                  : () => perform('确认本次准确版本',
                      () => api.confirm(x, 'APPROVED', reason.text.trim()))),
          tradeButton(
              '不同意',
              locked || !read || reason.text.trim().isEmpty
                  ? null
                  : () => perform('不同意本次准确版本',
                      () => api.confirm(x, 'REJECTED', reason.text.trim())),
              outline: true)
        ]),
      if (!eligible && mine == null)
        supplyNote('当前版本尚未通过审核、已被替代，或本身份不能确认。请刷新记录核对。')
    ];
  }

  List<Widget> payout(FinanceRecord x) => [
        tradeBanner(
            x.status == 'APPROVED'
                ? '申请已获准，尚未核实付款'
                : financeStatuses[x.status]!,
            x.status == 'PAID'
                ? '已核实真实外部付款。'
                : x.status == 'RETURNED'
                    ? '原付款事实保留，退回款项另有追加记录。'
                    : '申请、审核与真实付款分别保存。'),
        supplyCard(
            '收款主体', [financeIdFact('收款主体', x.data['recipient_party_id'])]),
        supplyCard('申请金额', [
          tradeFact('申请金额', financeMoneyText(x.data['amount_minor']),
              accent: true)
        ]),
        supplyCard('备注', [
          financeParagraph(x.data['note']),
          if (x.data['cancel_reason'] != null)
            financeParagraph(x.data['cancel_reason'])
        ]),
        supplyCard('付款凭据', [
          if (related.isEmpty) supplyNote('暂无已核实结果。'),
          for (final e in related) ...[
            tradeFact('登记事实', financeStatuses[e.data['outcome']]),
            tradeFact('独立核验', financeStatuses[e.status]),
            link(e)
          ],
          appNotice('自动出款未启用。批准申请不代表到账，未经审核的凭据不计为实付。')
        ]),
        if (x.status == 'REQUESTED' &&
            [g!.owner, x.owner].contains(api.owner()))
          supplyCard('取消待审核申请', [
            projectField(reason, '取消原因',
                enabled: !locked, max: 2000, changed: (_) => setState(() {})),
            tradeButton(
                '取消付款申请',
                locked || reason.text.trim().isEmpty
                    ? null
                    : () => perform(
                        '取消待审核付款申请',
                        () => api.write(
                            '/api/v1/finance/payouts/${x.id}/cancellation',
                            {'reason': reason.text.trim()},
                            version: x.version,
                            kind: 'PAYOUT')),
                outline: true)
          ]),
        tradeButton(
            '返回结算',
            locked
                ? null
                : () => open('/finance/agreement?agreementId=${g!.id}'),
            outline: true)
      ];
  List<Widget> dispute(FinanceRecord x) => [
        tradeBanner(
            financeStatuses[x.status]!,
            x.status == 'RESOLVED'
                ? '${financeCategories[x.data['category']]!}异议处理已保存，不自动恢复权利或代替退款。'
                : '${financeCategories[x.data['category']]!}异议；当前未决异议会暂停新的付款申请与批准。'),
        supplyCard('原始理由', [
          financeIdFact('关联记录', x.data['about_record_id']),
          financeParagraph(x.data['reason'])
        ]),
        supplyCard('各方回复', [
          if (related.isEmpty) supplyNote('暂无回复。'),
          for (final response in related) ...[
            financeIdFact('回复主体', response.owner),
            financeParagraph(response.data['message']),
            link(response)
          ]
        ]),
        supplyCard('历次处理决定', [
          if ((x.data['decision_history'] as List).isEmpty)
            supplyNote('等待独立处理决定。'),
          for (final h in x.data['decision_history']) ...[
            tradeFact(
                '决定',
                h['decision'] == 'ACTION_REQUIRED'
                    ? '要求真实补救'
                    : h['decision'] == 'REMEDIED'
                        ? '补救依据已核实'
                        : '允许恢复办理'),
            financeParagraph(h['reason']),
            if (h['action_record_id'] != null)
              financeIdFact('已核实补救记录', h['action_record_id']),
            const Divider()
          ]
        ]),
        supplyCard('真实补救记录', [
          if (!(x.data['decision_history'] as List)
              .any((h) => h['decision'] == 'REMEDIED'))
            supplyNote('暂无已核实补救记录。'),
          supplyNote('已采取补救须由独立决定引用真实调整或成功退款。处理记录不自动恢复版权，也不代替原退款流程。')
        ]),
        if (['OPEN', 'ACTION_REQUIRED'].contains(x.status))
          supplyCard('提交回复', [
            projectField(reason, '回复',
                lines: 3,
                max: 8000,
                enabled: !locked,
                changed: (_) => setState(() {})),
            supplyNote('补充证据（选填）'),
            SupplyFiles(
                api: supply,
                purpose: 'REVIEW_EVIDENCE',
                ids: assets,
                enabled: !locked,
                onChanged: (v) => setState(() => assets = v)),
            tradeButton(
                '提交回复',
                locked || reason.text.trim().isEmpty
                    ? null
                    : () => perform(
                        '提交本次回复',
                        () => api.write(
                            '/api/v1/finance/disputes/${x.id}/responses',
                            {
                              'message': reason.text.trim(),
                              'evidence_asset_ids': assets
                            },
                            version: x.version,
                            kind: 'RESPONSE')))
          ])
        else
          appNotice('本次异议已解决，回复表单已关闭。历史决定与核实依据保留。')
      ];
  List<Widget> other(FinanceRecord x) {
    final d = x.data;
    return [
      supplyCard(financeKinds[x.kind]!, [
        tradeFact('状态', financeStatuses[x.status]),
        if (d['amount_minor'] != null)
          tradeFact('金额', financeMoneyText(d['amount_minor'])),
        if (d['outcome'] != null)
          tradeFact('登记真实结果', financeStatuses[d['outcome']]),
        if (d['external_reference'] != null)
          tradeFact('外部编号', d['external_reference']),
        if (d['occurred_at'] != null)
          tradeFact('发生时间', tradeDate(d['occurred_at'])),
        if (d['note'] != null) financeParagraph(d['note']),
        if (d['message'] != null) financeParagraph(d['message']),
        if (d['reason'] != null) financeParagraph(d['reason']),
        if (d['review'] != null) financeParagraph(d['review']['reason'])
      ]),
      if (x.kind == 'STATEMENT')
        supplyCard('账单收入', [
          tradeFact('账单期间',
              '${tradeDate(d['period_start'])} 至 ${tradeDate(d['period_end'])}'),
          tradeFact('毛收入', financeMoneyText(d['gross_minor'])),
          tradeFact('退款', financeMoneyText(d['refund_minor'])),
          tradeFact('渠道费', financeMoneyText(d['channel_fee_minor'])),
          tradeFact('税额', financeMoneyText(d['tax_minor'])),
          tradeFact('账单净额', financeMoneyText(d['net_minor']), accent: true),
          if (d['original_statement_id'] != null)
            financeIdFact('冲减原账单', d['original_statement_id']),
          appNotice('账单审核确认收入；实际到账还需独立收款凭据。'),
          for (final receipt in related) link(receipt)
        ]),
      if (x.kind == 'RECEIPT')
        appNotice(
            x.status == 'APPROVED' ? '实际收款凭据已独立核实。' : '实际收款凭据仍未核实，不计为已到账。'),
      if (x.kind == 'PAYOUT_EVIDENCE')
        appNotice(x.status == 'APPROVED'
            ? '真实结果凭据已独立核实，原付款申请保留相应状态。'
            : '仅保存结果登记，尚未核实实付。'),
      if (x.kind == 'ADJUSTMENT')
        supplyCard('差额明细', [
          for (final e in d['entries'])
            tradeFact('主体 · ${shortSupplyId(e['party_id'])}',
                financeMoneyText(e['amount_minor'])),
          appNotice('调整追加保存，不改旧规则或历史付款事实。')
        ]),
      if (x.kind == 'RECONCILIATION')
        supplyCard('渠道核对', [
          tradeFact('渠道', d['provider'] == 'APPLE' ? 'Apple' : '支付宝'),
          tradeFact('环境', d['environment'] == 'SANDBOX' ? '测试数据' : '正式环境'),
          for (final e in d['differences'])
            tradeFact(
                '记录 · ${shortSupplyId(e['record_id'])}',
                e['reason'] == 'FACT_MISMATCH'
                    ? '事实不一致'
                    : e['reason'] == 'UNKNOWN_PLATFORM_FACT'
                        ? '平台未找到该事实'
                        : '外部账单缺少该事实'),
          appNotice('仅比较已验证事实，不把导入账单变成新付款。')
        ])
    ];
  }

  List<Widget> evidence(FinanceRecord x) {
    final ids = {
      if (x.data['evidence_asset_id'] != null) x.data['evidence_asset_id'],
      if (x.data['destination_asset_id'] != null)
        x.data['destination_asset_id'],
      ...(x.data['evidence_asset_ids'] as List? ?? [])
    };
    if (ids.isEmpty) return [];
    return [
      supplyCard(x.kind == 'PAYOUT' ? '私有收款资料' : '私有证据', [
        for (final id in ids) ...[
          financeIdFact('材料', id),
          if ([g!.owner, x.owner].contains(api.owner()))
            tradeButton(
                '读取材料 · ${shortSupplyId(id)}',
                locked
                    ? null
                    : () async {
                        setState(() => busy = true);
                        try {
                          final bytes = await api.evidence(x, id);
                          if (!mounted) return;
                          await FilePicker.saveFile(
                              dialogTitle: '保存私有结算材料',
                              fileName: 'finance-evidence-$id.bin',
                              bytes: bytes);
                          if (mounted) setState(() => notice = '已按当前权限读取材料。');
                        } on AccountError catch (e) {
                          if (mounted) setState(() => error = financeError(e));
                        } finally {
                          if (mounted) setState(() => busy = false);
                        }
                      },
                outline: true)
        ],
        supplyNote('原材料仅向有权身份开放，每次读取重新核对权限与完整性。')
      ])
    ];
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      r?.kind == 'SETTLEMENT'
          ? '确认结算单'
          : r?.kind == 'PAYOUT'
              ? '付款申请详情'
              : r?.kind == 'DISPUTE'
                  ? '异议处理记录'
                  : r?.kind == 'AGREEMENT'
                      ? '结算约定与确认'
                      : r == null
                          ? '结算记录'
                          : financeKinds[r!.kind]!,
      [
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!, icon: Icons.error_outline),
        if (notice != null)
          appNotice(notice!, icon: Icons.check_circle_outline),
        for (final op in widget.session.financePending)
          supplyCard('原请求结果待核实', [
            supplyNote('原内容、版本和请求编号已保留，请先恢复核对。'),
            tradeButton(
                '恢复原请求核对',
                busy
                    ? null
                    : () => perform('恢复原请求', () => api.retry(op['path']),
                        restoring: true))
          ]),
        if (r != null) ...[
          if (['AGREEMENT', 'SETTLEMENT'].contains(r!.kind))
            ...confirming(r!)
          else if (r!.kind == 'PAYOUT')
            ...payout(r!)
          else if (r!.kind == 'DISPUTE')
            ...dispute(r!)
          else
            ...other(r!),
          ...evidence(r!),
          if (r!.kind != 'DISPUTE')
            tradeButton(
                '提出结算或权利异议',
                locked
                    ? null
                    : () => open('/finance/dispute/new?recordId=${r!.id}'),
                outline: true),
          if (g!.data['source_type'] == 'ORDER' && g!.owner == api.owner())
            tradeButton(
                '查看原订单与退款',
                locked
                    ? null
                    : () =>
                        open('/trade/record?recordId=${g!.data['source_id']}'),
                outline: true),
          if (g!.data['source_type'] == 'ORDER' && g!.owner != api.owner())
            tradeButton('查看本人订单与退款', locked ? null : () => open('/orders'),
                outline: true),
          ExpansionTile(title: const Text('完整保存记录'), children: [
            Padding(
                padding: const EdgeInsets.all(16),
                child: ContractText(value: r!.data, fieldLabels: financeLabels))
          ])
        ],
        tradeButton('刷新结果', locked ? null : load, outline: true)
      ],
      locked: locked);
}

class FinanceEntriesPage extends StatelessWidget {
  const FinanceEntriesPage({super.key, required this.agreementId});
  final String agreementId;
  @override
  Widget build(BuildContext context) => FinanceGate(
      returnRoute: '/finance/entries?agreementId=$agreementId',
      builder: (s) => _Entries(session: s, id: agreementId));
}

class FinanceNotificationsPage extends StatelessWidget {
  const FinanceNotificationsPage({super.key});
  @override
  Widget build(BuildContext context) => FinanceGate(
      returnRoute: '/finance/notifications',
      builder: (s) => _Notifications(session: s));
}

class _Notifications extends StatefulWidget {
  const _Notifications({required this.session});
  final AccountSession session;
  @override
  State<_Notifications> createState() => _NotificationsState();
}

class _NotificationsState extends State<_Notifications> {
  late final api = FinanceApi(widget.session);
  List<Map<String, dynamic>> rows = [];
  String? cursor, error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    setState(() {
      busy = true;
      error = null;
      if (!more) rows = [];
    });
    try {
      final d = await api.notifications(cursor: more ? cursor : null);
      if (mounted) {
        setState(() {
          rows = {
            for (final r in [
              ...(more ? rows : <Map<String, dynamic>>[]),
              ...(d['items'] as List).cast<Map<String, dynamic>>()
            ])
              r['id']: r
          }.values.toList();
          cursor = d['next_cursor'];
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = financeError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      '结算通知',
      [
        supplyNote('仅当前身份的结算业务通知。请进入约定查看获准事实，不提供全平台未读总数。'),
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!),
        for (final row in rows)
          supplyCard('本约定有新记录或处理结果', [
            financeIdFact('结算约定', row['agreement_id']),
            financeIdFact('关联记录', row['record_id']),
            tradeButton(
                '查看本约定',
                busy || widget.session.financePending.isNotEmpty
                    ? null
                    : () => Navigator.pushNamed(context,
                        '/finance/agreement?agreementId=${row['agreement_id']}'))
          ]),
        if (!busy && rows.isEmpty && error == null) supplyNote('本次暂无结算通知。'),
        if (cursor != null)
          tradeButton('继续读取下一页', busy ? null : () => load(more: true),
              outline: true),
        tradeButton('重新读取通知', busy ? null : load, outline: true)
      ],
      locked: busy || widget.session.financePending.isNotEmpty);
}

class _Entries extends StatefulWidget {
  const _Entries({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_Entries> createState() => _EntriesState();
}

class _EntriesState extends State<_Entries> {
  late final api = FinanceApi(widget.session);
  FinanceRecord? g;
  List<Map<String, dynamic>> rows = [];
  String? cursor, error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    setState(() {
      busy = true;
      error = null;
      if (!more) rows = [];
    });
    try {
      final agreement = await api.record(widget.id, kind: 'AGREEMENT'),
          d = await api.entries(agreement, cursor: more ? cursor : null);
      if (mounted) {
        setState(() {
          g = agreement;
          rows = [
            ...(more ? rows : <Map<String, dynamic>>[]),
            ...(d['items'] as List).cast<Map<String, dynamic>>()
          ];
          cursor = d['next_cursor'];
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = financeError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      '本约定流水',
      [
        supplyNote('追加保存的真实事实，按当前身份权限读取。此列表不是全平台收入或钱包。'),
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!),
        for (final e in rows)
          supplyCard(
              {
                'ACCRUAL': '应得计提',
                'ADJUSTMENT': '核实调整',
                'PAYOUT': '核实实付',
                'PAYOUT_RETURN': '核实款项退回'
              }[e['category']]!,
              [
                financeIdFact('主体', e['party_id']),
                tradeFact('变动金额', financeMoneyText(e['amount_minor'])),
                financeIdFact('事实记录', e['source_id']),
                if (e['data']['reason'] != null)
                  financeParagraph(e['data']['reason']),
                if (e['data']['external_reference'] != null)
                  tradeFact('真实外部编号', e['data']['external_reference'])
              ]),
        if (!busy && rows.isEmpty && error == null) supplyNote('本页暂无获准查看的流水。'),
        if (cursor != null)
          tradeButton('继续读取下一页', busy ? null : () => load(more: true),
              outline: true),
        tradeButton('重新读取流水', busy ? null : load, outline: true)
      ],
      locked: busy || widget.session.financePending.isNotEmpty);
}
