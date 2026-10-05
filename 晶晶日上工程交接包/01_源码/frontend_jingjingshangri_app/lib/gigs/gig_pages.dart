import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_api.dart';
import '../trade/trade_models.dart';
import '../trade/trade_widgets.dart';
import 'gig_api.dart';
import 'gig_models.dart';
import 'gig_widgets.dart';

// Gallery APP-19-01-v2; the photograph is decorative, with no artist claims.
class GigCataloguePage extends StatelessWidget {
  const GigCataloguePage({super.key, this.embedded = false});
  final bool embedded;
  @override
  Widget build(BuildContext context) => GigGate(
      owner: false,
      embedded: embedded,
      builder: (s) => _Catalogue(session: s, embedded: embedded));
}

class _Catalogue extends StatefulWidget {
  const _Catalogue({required this.session, required this.embedded});
  final AccountSession session;
  final bool embedded;
  @override
  State<_Catalogue> createState() => _CatalogueState();
}

class _CatalogueState extends State<_Catalogue> {
  GigCatalogue? data;
  String? error;
  bool busy = false;
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final t = ++ticket;
    setState(() {
      busy = true;
      data = null;
      error = null;
    });
    try {
      final r = await GigApi(widget.session).catalogue();
      if (mounted && t == ticket) setState(() => data = r);
    } catch (e) {
      if (mounted && t == ticket) setState(() => error = gigError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[
      gigHeading('让创作连接真实需求'),
      ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
              height: 210,
              child: Stack(fit: StackFit.expand, children: [
                Image.asset('assets/images/pr17-commercial-studio.png',
                    fit: BoxFit.cover),
                Container(
                    decoration: const BoxDecoration(
                        gradient: LinearGradient(
                            colors: [Color(0xCB211A15), Color(0x00211A15)]))),
                const Padding(
                    padding: EdgeInsets.all(20),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text('好创意\n从真实需求开始',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 24,
                                  fontWeight: FontWeight.w700,
                                  height: 1.4)),
                          SizedBox(height: 12),
                          Text('明确用途与约定\n让每一次合作都有依据',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  height: 1.5))
                        ]))
              ]))),
      const SizedBox(height: 16),
      supplyCard('我的商单', [
        tradeButton('查看我的商单',
            () => Navigator.pushNamed(context, '/gigs/records?kind=GIG')),
        tradeButton('我的接单约定',
            () => Navigator.pushNamed(context, '/gigs/records?kind=OFFER'),
            outline: true)
      ]),
      tradeButton(
          '发布商单', () => Navigator.pushNamed(context, '/gigs/requests/new'),
          outline: true),
      Wrap(spacing: 12, children: [
        TextButton(
            onPressed: () =>
                Navigator.pushNamed(context, '/gigs/records?kind=RELATION'),
            child: const Text('MCN 合作')),
        TextButton(
            onPressed: () =>
                Navigator.pushNamed(context, '/gigs/records?kind=COMMISSION'),
            child: const Text('佣金核算')),
        TextButton(
            onPressed: () => Navigator.pushNamed(context, '/gigs/ranking'),
            child: const Text('片场榜单'))
      ]),
      gigHeading('公开商单'),
      supplyNote('仅展示已发布且未过期的需求摘要，私有证明材料不公开。'),
      if (busy) const LinearProgressIndicator(),
      if (error != null) supplyNote(error!, error: true),
      if (data != null && data!.items.isEmpty) appNotice('暂时没有可读取的已发布商单。'),
      for (final d in data?.items ?? <Map<String, dynamic>>[])
        supplyCard(d['title'], [
          gigParagraph(d['brief']),
          tradeFact('类别', d['category']),
          gigScopeFacts(gigMap(d['scope'])),
          tradeButton(
              '查看商单需求',
              () => Navigator.pushNamed(
                  context, '/gigs/request?gigId=${d['id']}'),
              outline: true)
        ]),
      for (final r in data?.rules ?? <Map<String, dynamic>>[])
        supplyCard('当前商单规则 · ${r['rule']['version']}', [
          ExpansionTile(
              title: const Text('查看类别与完整规则'),
              childrenPadding: const EdgeInsets.all(16),
              children: [
                for (final c in r['rule']['categories'])
                  tradeFact(
                      c['code'],
                      c['allowed']
                          ? '可提交 · 证明：${(c['required_proofs'] as List).join('、')}'
                          : '不接收'),
                gigParagraph(r['rule']['terms'])
              ])
        ]),
      tradeButton('重新读取商单', busy ? null : load, outline: true),
    ];
    return widget.embedded
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.stretch, children: children)
        : tradeScaffold(context, '培育', children);
  }
}

class GigPublicRequestPage extends StatelessWidget {
  const GigPublicRequestPage({super.key, required this.gigId});
  final String gigId;
  @override
  Widget build(BuildContext c) => GigGate(
      owner: false,
      returnRoute: '/gigs/request?gigId=$gigId',
      builder: (s) => _PublicRequest(session: s, gigId: gigId));
}

class _PublicRequest extends StatefulWidget {
  const _PublicRequest({required this.session, required this.gigId});
  final AccountSession session;
  final String gigId;
  @override
  State<_PublicRequest> createState() => _PublicRequestState();
}

class _PublicRequestState extends State<_PublicRequest> {
  Map<String, dynamic>? data;
  String? error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      data = null;
      error = null;
    });
    try {
      if (!gigId(widget.gigId)) throw const AccountError(400, 'INVALID_ID');
      final cat = await GigApi(widget.session).catalogue();
      final r = cat.items.where((r) => r['id'] == widget.gigId).firstOrNull;
      if (r == null) throw const AccountError(404, 'GIG_NOT_PUBLISHED');
      if (mounted) setState(() => data = r);
    } catch (e) {
      if (mounted) setState(() => error = gigError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) => tradeScaffold(
      c,
      '商单需求',
      [
        if (busy) const LinearProgressIndicator(),
        if (error != null) supplyNote(error!, error: true),
        if (data != null) ...[
          gigHeading(data!['title']),
          appNotice('商业用途 · 已发布摘要'),
          supplyCard('需求简述', [gigParagraph(data!['brief'])]),
          supplyCard('用途与期限', [
            tradeFact('类别', data!['category']),
            gigScopeFacts(gigMap(data!['scope']))
          ]),
          supplyCard('需求方', [
            tradeFact('主体编号', data!['buyer_party_id']),
            TextButton.icon(
                onPressed: () => Clipboard.setData(
                    ClipboardData(text: data!['buyer_party_id'])),
                icon: const Icon(Icons.copy),
                label: const Text('复制需求方编号'))
          ]),
          supplyNote('提交接单约定前，请准备服务规格、数字人、覆盖用途的本人同意及私有证明。')
        ],
        tradeButton('重新读取', busy ? null : load, outline: true)
      ],
      footer: data == null
          ? null
          : tradeButton(
              '提出接单约定',
              data!['buyer_party_id'] == widget.session.partyId
                  ? null
                  : () => Navigator.pushNamed(
                      c, '/gigs/offers/new?gigId=${widget.gigId}')));
}

class GigRecordsPage extends StatelessWidget {
  const GigRecordsPage({super.key, this.kind = 'GIG', this.gigId});
  final String kind;
  final String? gigId;
  @override
  Widget build(BuildContext c) => GigGate(
      returnRoute: '/gigs/records?kind=$kind',
      builder: (s) => _Records(
          session: s,
          kind: ['GIG', 'OFFER', 'RELATION', 'COMMISSION'].contains(kind)
              ? kind
              : 'GIG',
          gigId: gigId));
}

class _Records extends StatefulWidget {
  const _Records({required this.session, required this.kind, this.gigId});
  final AccountSession session;
  final String kind;
  final String? gigId;
  @override
  State<_Records> createState() => _RecordsState();
}

class _RecordsState extends State<_Records> {
  late final api = GigApi(widget.session);
  List<GigRecord> data = [];
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
        data = [];
        cursor = null;
      }
    });
    try {
      final r = await api.page(widget.kind, cursor: more ? cursor : null);
      if (mounted && t == ticket) {
        setState(() {
          data = [
            ...data,
            ...r.items.where((r) =>
                (widget.gigId == null || r.parent == widget.gigId) &&
                !data.any((old) => old.id == r.id))
          ];
          cursor = r.cursor;
        });
      }
    } catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          data = [];
          cursor = null;
          error = gigError(e);
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
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
      await Navigator.pushNamed(context, '/gigs/record?recordId=${r.id}');
      await load();
    } catch (e) {
      if (mounted) setState(() => error = gigError(e, writing: true));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) => tradeScaffold(
      c,
      gigKinds[widget.kind]!,
      [
        gigHeading(gigKinds[widget.kind]!),
        tradeFact('当前身份', widget.session.party?['display_name'] ?? api.owner()),
        if (widget.kind == 'RELATION') ...[
          appNotice('只办理直接合作，不设置上下级或多级分佣。'),
          tradeButton(
              '发起直接合作',
              busy || widget.session.gigsPending.isNotEmpty
                  ? null
                  : () => Navigator.pushNamed(c, '/gigs/relations/new'),
              outline: true)
        ],
        if (widget.kind == 'GIG')
          tradeButton(
              '发布商单',
              busy || widget.session.gigsPending.isNotEmpty
                  ? null
                  : () => Navigator.pushNamed(c, '/gigs/requests/new'),
              outline: true),
        if (widget.kind == 'COMMISSION')
          supplyNote('佣金按订单原约定与实际收款、退款事实计提。没有提现、税务或出款接口，核算不代表已到账。'),
        for (final p in widget.session.gigsPending)
          supplyCard('有操作结果待核实', [
            supplyNote('原请求已保留，请先恢复核对。', error: true),
            if (p['resultId'] != null) tradeFact('已知结果编号', p['resultId']),
            tradeButton('恢复原请求核对', busy ? null : () => restore(p['path']))
          ]),
        if (busy) const LinearProgressIndicator(),
        if (error != null) supplyNote(error!, error: true),
        if (!busy && data.isEmpty && error == null) appNotice('当前身份没有这类记录。'),
        for (final r in data)
          supplyCard(r.title, [
            tradeFact('记录编号', r.id),
            tradeFact('当前状态', gigStatuses[r.status]),
            if (r.kind == 'GIG') gigParagraph(r.data['brief']),
            if (r.kind == 'COMMISSION')
              tradeFact('核实净额', tradeMoney(r.data['facts']['net_minor']),
                  accent: true),
            tradeButton(
                '查看详情',
                busy || widget.session.gigsPending.isNotEmpty
                    ? null
                    : () async {
                        await Navigator.pushNamed(
                            c, '/gigs/record?recordId=${r.id}');
                        load();
                      },
                outline: true)
          ]),
        tradeButton('重新读取', busy ? null : () => load(), outline: true),
        if (cursor != null)
          tradeButton('加载更多', busy ? null : () => load(more: true),
              outline: true)
      ],
      locked: busy || widget.session.gigsPending.isNotEmpty);
}

class GigRecordPage extends StatelessWidget {
  const GigRecordPage({super.key, required this.recordId});
  final String recordId;
  @override
  Widget build(BuildContext c) => GigGate(
      returnRoute: '/gigs/record?recordId=$recordId',
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
  late final api = GigApi(widget.session);
  GigRecord? data;
  String? error;
  bool busy = false;
  int ticket = 0;
  List<Map<String, dynamic>> entries = [];
  List<TradeRecord> linked = [];
  Map<String, String?> relationNames = {};
  final reason = TextEditingController();
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
    final t = ++ticket;
    setState(() {
      busy = true;
      data = null;
      linked = [];
      relationNames = {};
      entries = [];
      error = null;
    });
    try {
      final r = await api.record(widget.id);
      final names = r.kind == 'RELATION'
          ? await api.relationNames(r)
          : <String, String?>{};
      var links = <TradeRecord>[], changes = <Map<String, dynamic>>[];
      if (r.kind == 'OFFER' && r.status == 'ACCEPTED') {
        final trade = TradeApi(widget.session);
        links = [...await trade.all('QUOTE'), ...await trade.all('ORDER')]
            .where((q) => q.quote['commercial']?['offer_id'] == r.id)
            .toList();
      }
      if (r.kind == 'COMMISSION') changes = await api.entries(r.id);
      if (mounted && t == ticket) {
        setState(() {
          data = r;
          relationNames = names;
          linked = links;
          entries = changes;
        });
      }
    } catch (e) {
      if (mounted && t == ticket) setState(() => error = gigError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> perform(Future<GigRecord> Function() action) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..removeCurrentSnackBar();
      await load();
    } catch (e) {
      if (!mounted) return;
      setState(() => error = gigError(e, writing: true));
      if (e is AccountError && e.status == 412) {
        await load();
        if (mounted) setState(() => error = '记录已更新，旧决定未重放。请核对新版本与完整内容，再重新确认。');
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> accept() async {
    final r = data!;
    if (await tradeConfirm(context, '确认这份接单约定', [
          gigParagraph(r.data['terms']),
          gigCommissionFacts(gigMap(r.data['commission'])),
          tradeFact('公开入榜', r.data['ranking_opt_in'] ? '明确选择参与' : '不参与'),
          supplyNote('确认将绑定本次读取的完整约定；这一步不会付款，也不会立即生成订单。')
        ]) &&
        mounted) {
      await perform(() => api.accept(r));
    }
  }

  Future<void> decide(String value) async {
    final r = data!,
        labels = {'ACCEPT': '接受直接合作', 'REJECT': '拒绝直接合作', 'END': '结束直接合作'};
    final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
                title: Text(labels[value]!),
                content: Column(mainAxisSize: MainAxisSize.min, children: [
                  gigParagraph(r.data['terms']),
                  gigTextField(reason, '办理原因', lines: 3, max: 2000)
                ]),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: const Text('返回核对')),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: const Text('确认办理'))
                ]));
    if (ok == true && mounted) {
      if (!gigText(reason.text, 2000)) {
        setState(() => error = '请填写办理原因。');
        return;
      }
      await perform(() => api.relationDecision(r, value, reason.text.trim()));
    }
  }

  Future<void> download(String id) async {
    final r = data!, epoch = widget.session.epoch;
    setState(() => busy = true);
    try {
      final bytes = await api.evidence(r, id);
      if (!mounted) return;
      api.check(epoch, api.owner());
      await FilePicker.saveFile(fileName: '$id.bin', bytes: bytes);
      api.check(epoch, api.owner());
      if (mounted) setState(() => error = kIsWeb ? '文件已交给浏览器保存。' : '文件已准备保存。');
    } catch (e) {
      if (mounted) setState(() => error = gigError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  List<Widget> detail(GigRecord r) {
    final d = r.data;
    return switch (r.kind) {
      'GIG' => [
          gigHeading(d['title']),
          supplyCard('需求简述', [gigParagraph(d['brief'])]),
          supplyCard('用途与期限', [
            tradeFact('类别', d['category']),
            gigScopeFacts(gigMap(d['scope'])),
            tradeFact('需求方编号', r.owner),
            tradeFact('采用商单规则', d['rule_id'])
          ]),
          if (d['suspension'] != null)
            supplyNote('暂停原因：${d['suspension']['reason']}', error: true),
          tradeButton(
              '查看关联接单约定',
              busy || widget.session.gigsPending.isNotEmpty
                  ? null
                  : () => Navigator.pushNamed(
                      context, '/gigs/records?kind=OFFER&gigId=${r.id}'),
              outline: true)
        ],
      'OFFER' => [
          supplyCard('约定双方', [
            tradeFact('需求方编号', r.counterparty),
            tradeFact('服务提供方编号', r.owner),
            tradeFact('关联需求编号', r.parent)
          ]),
          supplyCard('服务与本人同意', [
            tradeFact('服务规格编号', d['spec_id']),
            tradeFact('数字人编号', d['avatar_id']),
            tradeFact('本人同意编号', d['consent_id']),
            supplyNote('独立审核核对商业用途与授权覆盖。本人同意不等于实名核验或生成工具已开通。')
          ]),
          supplyCard('完整接单约定', [gigParagraph(d['terms'])]),
          supplyCard('佣金与公开榜单', [
            gigCommissionFacts(gigMap(d['commission'])),
            tradeFact('公开入榜', d['ranking_opt_in'] ? '明确选择参与' : '不参与'),
            if (d['relation'] != null) ...[
              tradeFact('直接合作编号', d['relation']['id']),
              tradeFact('MCN 主体编号', d['relation']['mcn_party_id']),
              gigParagraph(d['relation']['terms'])
            ]
          ]),
          if (r.status == 'ACCEPTED')
            supplyCard('后续报价与订单', [
              if (linked.isEmpty)
                supplyNote('当前约定尚无对应报价或订单。仍需服务提供方在网页建立带本约定的正式报价，经审核后由买方确认。'),
              for (final q in linked) ...[
                tradeFact('${tradeKinds[q.kind]}金额', tradeMoney(q.amount)),
                tradeButton(
                    '查看对应${tradeKinds[q.kind]}',
                    busy || widget.session.gigsPending.isNotEmpty
                        ? null
                        : () => Navigator.pushNamed(
                            context, '/trade/record?recordId=${q.id}'),
                    outline: true)
              ]
            ]),
          if (r.status == 'APPROVED' && r.counterparty == api.owner())
            tradeButton('确认接单约定',
                busy || widget.session.gigsPending.isNotEmpty ? null : accept)
        ],
      'RELATION' => [
          supplyCard('合作双方', [
            tradeFact('MCN 显示名称', relationNames[r.owner] ?? '名称暂未提供，请结合编号核对'),
            tradeFact(
                '合作本人显示名称', relationNames[r.counterparty] ?? '名称暂未提供，请结合编号核对'),
            supplyNote('显示名称可能变更，不代表已核实的法定名称；请结合编号核对。'),
            tradeFact('MCN 主体编号', r.owner),
            tradeFact('合作本人主体编号', r.counterparty)
          ]),
          supplyCard('合作范围与期间', [
            tradeFact('范围', '商业用途'),
            tradeFact('开始时间', tradeDate(d['valid_from'])),
            tradeFact('结束时间', tradeDate(d['valid_until'])),
            tradeFact('排他约定', d['exclusive'] ? '排他' : '不排他')
          ]),
          supplyCard('原合作条款', [
            gigParagraph(d['terms']),
            gigCommissionFacts(gigMap(d['commission']))
          ]),
          if (d['ended_reason'] != null) tradeFact('结束原因', d['ended_reason']),
          if (r.status == 'INVITED' && r.counterparty == api.owner()) ...[
            tradeButton(
                '接受合作',
                busy || widget.session.gigsPending.isNotEmpty
                    ? null
                    : () => decide('ACCEPT')),
            tradeButton(
                '拒绝合作',
                busy || widget.session.gigsPending.isNotEmpty
                    ? null
                    : () => decide('REJECT'),
                outline: true)
          ],
          if (['ACTIVE', 'INVITED'].contains(r.status))
            tradeButton(
                '结束合作',
                busy || widget.session.gigsPending.isNotEmpty
                    ? null
                    : () => decide('END'),
                outline: true)
        ],
      'COMMISSION' => [
          supplyCard('核算依据', [
            tradeFact('订单编号', d['order_id']),
            tradeFact('约定编号', d['agreement']['offer_id']),
            tradeFact(
                '付款环境',
                d['facts']['environment'] == 'SANDBOX'
                    ? '沙盒测试'
                    : d['facts']['environment'] == 'PRODUCTION'
                        ? '正式渠道'
                        : '尚无实际收款'),
            tradeFact('已核实收款', tradeMoney(d['facts']['received_minor'])),
            tradeFact('已核实退款', tradeMoney(d['facts']['refunded_minor'])),
            tradeFact('核实净额', tradeMoney(d['facts']['net_minor']), accent: true)
          ]),
          supplyCard('按原约定计提', [
            gigCommissionFacts(gigMap(d['agreement']['commission'])),
            tradeFact('服务提供方', tradeMoney(d['amounts']['supplier_minor'])),
            tradeFact('平台计提', tradeMoney(d['amounts']['platform_minor'])),
            tradeFact('MCN 计提', tradeMoney(d['amounts']['mcn_minor'])),
            tradeFact('已出款', tradeMoney(d['paid_out_minor'])),
            supplyNote('没有出款接口。核算与待记账金额不代表已支付、到账、可提现或税务已处理。')
          ]),
          supplyCard('逐次变动记录', [
            for (final e in entries) ...[
              tradeFact('核算版本', e['object_version']),
              tradeFact('服务提供方变动',
                  gigSignedMoney(e['data']['delta']['supplier_minor'])),
              tradeFact(
                  '平台变动', gigSignedMoney(e['data']['delta']['platform_minor'])),
              tradeFact(
                  'MCN 变动', gigSignedMoney(e['data']['delta']['mcn_minor'])),
              const Divider()
            ]
          ]),
          tradeButton(
              '按实际付款重新核算',
              busy || widget.session.gigsPending.isNotEmpty
                  ? null
                  : () async {
                      if (await tradeConfirm(context, '重新核算佣金', [
                            supplyNote('按原订单商业约定与服务器核实的收款、退款事实计提，不发起转账。')
                          ]) &&
                          mounted) {
                        perform(() => api.calculate(d['order_id']));
                      }
                    },
              outline: true)
        ],
      _ => [supplyNote('此类独立运营记录请在具备相应授权的网页工作台办理。')]
    };
  }

  @override
  Widget build(BuildContext c) => tradeScaffold(
      c,
      data?.kind == 'RELATION'
          ? 'MCN 合作'
          : data?.kind == 'OFFER'
              ? '接单约定确认'
              : '商单记录',
      [
        if (busy) const LinearProgressIndicator(),
        if (error != null) supplyNote(error!, error: true),
        for (final p in widget.session.gigsPending)
          supplyCard('有操作结果待核实', [
            supplyNote('请恢复原请求核对结果，原内容与版本已保留。', error: true),
            tradeButton('恢复原请求核对',
                busy ? null : () => perform(() => api.retry(p['path'])))
          ]),
        if (data != null) ...[
          gigStatus(data!),
          const SizedBox(height: 16),
          ...detail(data!),
          if (data!.data['review'] != null)
            supplyCard('独立审核结论', [
              tradeFact(
                  '结论',
                  data!.data['review']['decision'] == 'APPROVED'
                      ? '已通过'
                      : '未通过'),
              gigParagraph(data!.data['review']['reason'])
            ]),
          if (['GIG', 'OFFER', 'RELATION'].contains(data!.kind))
            supplyCard('受控证明材料', [
              supplyNote('文件仅经本记录权限核验后提供，材料不会公开。'),
              for (final id in data!.kind == 'GIG'
                  ? gigList(data!.data['proofs'], max: 30)
                      .map((v) => v['asset_id'])
                  : gigIds(data!.data['evidence_asset_ids']))
                tradeButton(
                    '下载证明 $id',
                    busy || widget.session.gigsPending.isNotEmpty
                        ? null
                        : () => download(id),
                    outline: true)
            ]),
          ExpansionTile(title: const Text('记录编号与内容指纹'), children: [
            tradeFact('记录编号', data!.id),
            tradeFact('记录版本', data!.version),
            tradeFact('内容指纹', data!.hash)
          ])
        ],
        tradeButton('重新读取', busy ? null : load, outline: true)
      ],
      locked: busy || widget.session.gigsPending.isNotEmpty);
}

class GigNotificationsPage extends StatelessWidget {
  const GigNotificationsPage({super.key});
  @override
  Widget build(BuildContext c) => GigGate(
      returnRoute: '/messages', builder: (s) => _Notifications(session: s));
}

class _Notifications extends StatefulWidget {
  const _Notifications({required this.session});
  final AccountSession session;
  @override
  State<_Notifications> createState() => _NotificationsState();
}

class _NotificationsState extends State<_Notifications> {
  List<Map<String, dynamic>> rows = [];
  String? error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      rows = [];
      error = null;
    });
    try {
      final r = await GigApi(widget.session).notifications();
      if (mounted) setState(() => rows = r);
    } catch (e) {
      if (mounted) setState(() => error = gigError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) => tradeScaffold(c, '商单通知', [
        gigHeading('商单通知'),
        supplyNote('仅显示当前身份的商单暂停与直接合作结束通知。这不是全平台通知中心，不提供通用私信。'),
        if (busy) const LinearProgressIndicator(),
        if (error != null) supplyNote(error!, error: true),
        if (!busy && rows.isEmpty && error == null) appNotice('当前身份暂无商单域通知。'),
        for (final r in rows)
          supplyCard(gigEvents[r['event_code']] ?? '商单业务动态', [
            tradeFact('关联记录', r['record_id']),
            if (!gigEvents.containsKey(r['event_code']))
              tradeFact('事件代码', r['event_code']),
            tradeButton(
                '查看相关记录',
                () => Navigator.pushNamed(
                    c, '/gigs/record?recordId=${r['record_id']}'),
                outline: true)
          ]),
        tradeButton('重新读取通知', busy ? null : load, outline: true)
      ]);
}

class GigRankingPage extends StatelessWidget {
  const GigRankingPage({super.key, this.recordId});
  final String? recordId;
  @override
  Widget build(BuildContext c) => GigGate(
      owner: false,
      returnRoute:
          '/gigs/ranking${recordId == null ? '' : '?recordId=$recordId'}',
      builder: (s) => _Ranking(session: s, id: recordId));
}

class _Ranking extends StatefulWidget {
  const _Ranking({required this.session, this.id});
  final AccountSession session;
  final String? id;
  @override
  State<_Ranking> createState() => _RankingState();
}

class _RankingState extends State<_Ranking> {
  late final identifier = TextEditingController(text: widget.id);
  Map<String, dynamic>? data;
  String? error;
  bool busy = false;
  String board = 'hot';
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    if (widget.id != null) load();
  }

  @override
  void dispose() {
    identifier.dispose();
    super.dispose();
  }

  Future<void> load() async {
    final t = ++ticket;
    setState(() {
      busy = true;
      data = null;
      error = null;
    });
    try {
      final r = await GigApi(widget.session).ranking(identifier.text.trim());
      if (mounted && t == ticket) setState(() => data = r);
    } catch (e) {
      if (mounted && t == ticket) setState(() => error = gigError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) => tradeScaffold(c, '片场榜单', [
        gigHeading('片场榜单'),
        supplyCard('读取已发布快照', [
          gigTextField(identifier, '已发布榜单编号', max: 36, enabled: !busy),
          supplyNote('请使用实际已发布快照编号。当前没有公开快照索引接口，不能自动列出最新榜单。'),
          tradeButton('读取榜单', busy ? null : load)
        ]),
        if (busy) const LinearProgressIndicator(),
        if (error != null) supplyNote(error!, error: true),
        if (data != null) ...[
          supplyCard('本次榜单依据', [
            tradeFact('统计截点', tradeDate(data!['as_of'])),
            tradeFact('统计窗口', '${data!['rule']['window_days']} 天'),
            tradeFact(
                '数据来源',
                data!['source'] == 'VERIFIED_PRODUCTION_COMMERCIAL_RECEIPTS'
                    ? '经核实的正式商业收款'
                    : data!['source']),
            supplyNote('仅纳入明确选择公开入榜的正式渠道有效净额。沙盒付款不作为正式榜单依据。')
          ]),
          SegmentedButton<String>(segments: const [
            ButtonSegment(value: 'hot', label: Text('热度榜')),
            ButtonSegment(value: 'emerging', label: Text('新兴榜')),
            ButtonSegment(value: 'regional', label: Text('地区榜'))
          ], selected: {
            board
          }, onSelectionChanged: (v) => setState(() => board = v.first)),
          const SizedBox(height: 16),
          if (data!['data_status'] == 'INSUFFICIENT_DATA')
            tradeBanner('暂未形成榜单', '目前尚未满足计算条件，没有可展示的排名。请待真实数据达到条件后查看新的已发布快照。',
                icon: Icons.bar_chart),
          for (final row in data!['boards'][board])
            supplyCard('主体 ${row['party_id']}', [
              tradeFact('地区', row['territory']),
              tradeFact('有效订单数', row['orders']),
              tradeFact(board == 'emerging' ? '新兴分值' : '热度分值',
                  row[board == 'emerging' ? 'emerging' : 'heat'])
            ]),
          ExpansionTile(title: const Text('完整计算规则'), children: [
            tradeFact('最少订单数', data!['rule']['minimum_orders']),
            tradeFact('订单权重', data!['rule']['order_weight']),
            tradeFact('净额权重', data!['rule']['net_minor_weight']),
            tradeFact('新人期间（天）', data!['rule']['newcomer_days']),
            tradeFact('新人加分', data!['rule']['newcomer_bonus'])
          ]),
          tradeButton('重新读取榜单', busy ? null : load, outline: true)
        ]
      ]);
}

class GigDiscoveryPage extends StatelessWidget {
  const GigDiscoveryPage({super.key});
  @override
  Widget build(BuildContext c) => tradeScaffold(c, '发现', [
        gigHeading('更多发现正在准备'),
        appNotice('公开人物目录暂未开放。当前没有可查询的艺人资料、昵称或头像，不会把私有作者及授权资料当作公开推荐。',
            icon: Icons.people_outline),
        const SizedBox(height: 24),
        tradeButton('浏览剧本', () => Navigator.pushNamed(c, '/licensing/catalog')),
        tradeButton('浏览商单', () => Navigator.pushNamed(c, '/gigs'),
            outline: true),
        tradeButton('片场榜单', () => Navigator.pushNamed(c, '/gigs/ranking'),
            outline: true),
        supplyNote('榜单按已发布快照的实际来源、规则与数据状态展示。')
      ]);
}
