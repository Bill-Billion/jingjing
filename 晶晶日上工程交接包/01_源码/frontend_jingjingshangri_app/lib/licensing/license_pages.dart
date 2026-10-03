import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../contracts/contract_text.dart';
import '../supply/supply_widgets.dart';
import 'license_api.dart';
import 'license_models.dart';
import 'license_widgets.dart';
import 'license_forms.dart';

class LicenseCatalog extends StatelessWidget {
  const LicenseCatalog({super.key, this.embedded = false});
  final bool embedded;
  @override
  Widget build(BuildContext context) => LicenseGate(
      embedded: embedded,
      returnRoute: '/enter',
      builder: (s) => _LicenseList(
          session: s, kind: 'PRODUCT', catalog: true, embedded: embedded));
}

class LicenseRecordsPage extends StatelessWidget {
  const LicenseRecordsPage({super.key, this.kind = 'RESERVATION'});
  final String kind;
  @override
  Widget build(BuildContext context) => LicenseGate(
      returnRoute: '/licensing?kind=$kind',
      builder: (s) => _LicenseList(
          session: s,
          kind: licenseKinds.containsKey(kind) ? kind : 'RESERVATION'));
}

class _LicenseList extends StatefulWidget {
  const _LicenseList(
      {required this.session,
      required this.kind,
      this.catalog = false,
      this.embedded = false});
  final AccountSession session;
  final String kind;
  final bool catalog, embedded;
  @override
  State<_LicenseList> createState() => _LicenseListState();
}

class _LicenseListState extends State<_LicenseList> {
  late String _kind = widget.kind;
  late final _api = LicenseApi(widget.session);
  final _items = <LicenseRecord>[];
  String? _cursor, _error;
  bool _busy = false;
  int _ticket = 0;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool more = false}) async {
    final ticket = ++_ticket;
    setState(() {
      _busy = true;
      _error = null;
      if (!more) {
        _items.clear();
        _cursor = null;
      }
    });
    try {
      final value = await _api.page(_kind,
          catalog: widget.catalog, cursor: more ? _cursor : null);
      if (!mounted || ticket != _ticket) return;
      setState(() {
        _items.addAll(
            value.items.where((v) => !_items.any((old) => old.id == v.id)));
        _cursor = value.nextCursor;
      });
    } catch (e) {
      if (mounted && ticket == _ticket) {
        setState(() {
          _items.clear();
          _cursor = null;
          _error = licenseError(e);
        });
      }
    } finally {
      if (mounted && ticket == _ticket) setState(() => _busy = false);
    }
  }

  Future<void> _open(LicenseRecord r) async {
    await Navigator.pushNamed(context, '/licensing/record?recordId=${r.id}');
    // Opening a public catalog item does not edit the catalog. Keep its loaded
    // pages and scroll position; users can explicitly reload the catalog.
    if (mounted && !widget.catalog) _load();
  }

  Widget _recordCard(LicenseRecord r) => r.kind == 'GRANT'
      ? _grantCard(r)
      : Card(
          child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (widget.catalog) ...[
                            const Padding(
                                padding: EdgeInsets.only(top: 20),
                                child: Icon(Icons.description_outlined,
                                    size: 44, color: AccountTheme.accent)),
                            const SizedBox(width: 16),
                            Container(
                                width: 1,
                                height: 136,
                                color: AccountTheme.border),
                            const SizedBox(width: 16),
                          ],
                          Expanded(
                              child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                Text(r.title,
                                    style: const TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w700,
                                        height: 1.4)),
                                if (r.data['preview_text'] != null) ...[
                                  const SizedBox(height: 8),
                                  Text(r.data['preview_text'],
                                      style: const TextStyle(
                                          fontSize: 14,
                                          color: AccountTheme.muted,
                                          height: 1.5)),
                                ],
                                const Divider(height: 24),
                                if (r.terms != null)
                                  Text(r.terms!.summary,
                                      style: const TextStyle(
                                          fontSize: 14,
                                          color: AccountTheme.muted)),
                                if (r.data['price'] != null) ...[
                                  const SizedBox(height: 8),
                                  Wrap(
                                      spacing: 12,
                                      crossAxisAlignment:
                                          WrapCrossAlignment.center,
                                      children: [
                                        const Text('许可价格',
                                            style: TextStyle(
                                                fontSize: 14,
                                                color: AccountTheme.muted)),
                                        Text(
                                            licenseMoney(
                                                Map<String, dynamic>.from(
                                                    r.data['price'])),
                                            style: const TextStyle(
                                                fontSize: 20,
                                                fontWeight: FontWeight.w700,
                                                color: AccountTheme.accent)),
                                      ]),
                                ],
                                const SizedBox(height: 8),
                                Text(r.statusText,
                                    style: const TextStyle(
                                        fontSize: 12,
                                        color: AccountTheme.accent)),
                                if (widget.catalog)
                                  const Padding(
                                      padding: EdgeInsets.only(top: 8),
                                      child: Text('许可费用不等于整片制作费用。',
                                          style: TextStyle(
                                              fontSize: 12,
                                              color: AccountTheme.muted))),
                                if (r.data['expires_at'] != null)
                                  supplyFact('预留截止',
                                      licenseDate(r.data['expires_at'])),
                                if (r.data['valid_until'] != null)
                                  supplyFact('截止时间',
                                      licenseDate(r.data['valid_until'])),
                                if (r.kind == 'PROJECT')
                                  supplyFact(
                                      '用途', licensePurposes[r.data['purpose']]),
                              ])),
                        ]),
                    const SizedBox(height: 16),
                    FilledButton(
                        onPressed: () => _open(r),
                        child: Text(widget.catalog ? '查看剧本' : '查看记录')),
                  ])));

  Widget _grantCard(LicenseRecord r) => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              const CircleAvatar(
                  radius: 30,
                  backgroundColor: Color(0xFFF0E8DE),
                  child: Icon(Icons.workspace_premium_outlined,
                      size: 36, color: AccountTheme.accent)),
              const SizedBox(width: 16),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(
                        r.status == 'ACTIVE' && !r.expired
                            ? '许可已生效'
                            : r.statusText,
                        style: const TextStyle(
                            fontSize: 24, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    Text('有效至 ${licenseDate(r.terms!.data['valid_until'])}',
                        style: const TextStyle(
                            fontSize: 14, color: AccountTheme.muted)),
                  ])),
            ]),
            const Divider(height: 28),
            supplyFact('许可编号', shortSupplyId(r.id)),
            supplyFact('作品版本', shortSupplyId(r.data['work_version_id'])),
            supplyFact('许可摘要', r.terms!.summary),
            supplyFact('状态', r.statusText),
            const SizedBox(height: 8),
            FilledButton(onPressed: () => _open(r), child: const Text('查看记录')),
          ])));

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[
      if (widget.catalog) ...[
        supplyNote('从一个故事开始'),
        const ManuscriptHero(title: '发现好剧本', subtitle: '每一个好故事，\n都有被看见的可能。'),
        const SizedBox(height: 24),
        const Text('已上架的剧本',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        supplyNote('选择感兴趣的剧本，了解许可范围并申请使用。'),
      ] else ...[
        supplyNote(_kind == 'PROJECT'
            ? '登记明确的用途，绑定许可后才能按范围使用。这里不代表制作项目已开工。'
            : _kind == 'READING'
                ? '只展示当前身份的阅稿记录。指定账号获批且未到期后可受控阅读。'
                : '这里保存剧本许可办理与历史记录。报价、付款和退款请前往订单与付款。'),
        const Text('查看记录',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
            isExpanded: true,
            itemHeight: null,
            initialValue: _kind,
            decoration: const InputDecoration(),
            items: licenseKinds.entries
                .map(
                    (e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                .toList(),
            onChanged: _busy
                ? null
                : (v) {
                    if (v != null) {
                      setState(() => _kind = v);
                      _load();
                    }
                  }),
        const SizedBox(height: 20),
        if (_kind == 'PROJECT')
          OutlinedButton.icon(
              onPressed: () =>
                  Navigator.pushNamed(context, '/licensing/project/new')
                      .then((_) {
                    if (mounted) _load();
                  }),
              icon: const Icon(Icons.add),
              label: const Text('新建用途项目')),
      ],
      if (_error != null) supplyNote(_error!, error: true),
      if (_busy && _items.isEmpty)
        const Center(
            child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator())),
      if (!_busy && _error == null && _items.isEmpty)
        supplyCard(widget.catalog ? '暂时没有已上架剧本' : '暂时没有这类记录', [
          supplyNote(widget.catalog
              ? '作品审核完成后还需商品核验上架，请稍后重新查看。'
              : '请从选剧本、登记项目或已有办理记录开始。')
        ]),
      for (final r in _items) _recordCard(r),
      if (_cursor != null)
        OutlinedButton(
            onPressed: _busy ? null : () => _load(more: true),
            child: Text(_busy ? '正在读取…' : '加载更多')),
      TextButton(
          onPressed: _busy ? null : () => _load(), child: const Text('重新读取')),
      if (widget.catalog) ...[
        OutlinedButton.icon(
            onPressed: () => Navigator.pushNamed(context, '/licensing'),
            icon: const Icon(Icons.receipt_long_outlined),
            label: const Text('我的预留与许可')),
        const SizedBox(height: 12),
        OutlinedButton.icon(
            onPressed: () =>
                Navigator.pushNamed(context, '/licensing?kind=READING'),
            icon: const Icon(Icons.menu_book_outlined),
            label: const Text('我的阅稿授权')),
        const SizedBox(height: 12),
        supplyNote(
            '办理顺序：了解许可 → 预留与保存合同 → 外部签署及付款材料核验 → 发放许可 → 绑定用途项目。制作与自动支付服务将在后续开放。'),
      ],
    ];
    return widget.embedded
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.stretch, children: children)
        : licenseScaffold(
            context, widget.catalog ? '选剧本' : '我的许可与项目', children);
  }
}

class LicenseRecordPage extends StatelessWidget {
  const LicenseRecordPage({super.key, required this.recordId});
  final String recordId;
  @override
  Widget build(BuildContext context) => LicenseGate(
      returnRoute: '/licensing/record?recordId=$recordId',
      builder: (s) => _LicenseDetail(session: s, id: recordId));
}

class _LicenseDetail extends StatefulWidget {
  const _LicenseDetail({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_LicenseDetail> createState() => _LicenseDetailState();
}

class _LicenseDetailState extends State<_LicenseDetail> {
  late final _api = LicenseApi(widget.session);
  LicenseRecord? _record, _bindingGrant, _bindingProject;
  final _related = <LicenseRecord>[];
  String? _error;
  bool _busy = false;
  int _ticket = 0;
  @override
  void initState() {
    super.initState();
    _read();
  }

  Future<void> _read() async {
    final ticket = ++_ticket;
    setState(() {
      _busy = true;
      _error = null;
      _record = null;
      _bindingGrant = null;
      _bindingProject = null;
      _related.clear();
    });
    try {
      final r = await _api.record(widget.id);
      final related = <LicenseRecord>[];
      LicenseRecord? bindingGrant, bindingProject;
      if (r.kind == 'BINDING') {
        bindingGrant = await _api.record(r.parent!);
        bindingProject = await _api.record(r.data['project_id']);
      }
      if (r.kind == 'RESERVATION') {
        related.addAll(
            (await _api.all('EVIDENCE')).where((v) => v.parent == r.id));
        related
            .addAll((await _api.all('GRANT')).where((v) => v.parent == r.id));
      }
      if (['GRANT', 'PROJECT'].contains(r.kind)) {
        related.addAll((await _api.all('BINDING')).where((v) =>
            r.kind == 'GRANT'
                ? v.parent == r.id
                : v.data['project_id'] == r.id));
      }
      if (!mounted || ticket != _ticket) return;
      setState(() {
        _record = r;
        _bindingGrant = bindingGrant;
        _bindingProject = bindingProject;
        _related.addAll(related);
      });
    } catch (e) {
      if (mounted && ticket == _ticket) {
        setState(() => _error = licenseError(e));
      }
    } finally {
      if (mounted && ticket == _ticket) setState(() => _busy = false);
    }
  }

  Future<void> _operate(String path, Map<String, dynamic> body,
      {int? version, String? kind}) async {
    final pending = _api.pending(path);
    final actual =
        pending == null ? body : Map<String, dynamic>.from(pending['body']);
    if (path.endsWith('/reservations') && actual['product_id'] != widget.id) {
      setState(() => _error = '还有另一份许可预留的结果尚未确认，请先打开对应剧本恢复原操作。');
      return;
    }
    final epoch = widget.session.epoch, party = _api.owner();
    if (!await licenseConfirm(context, pending == null ? '确认这次办理' : '恢复原操作', [
      supplyNote(
          pending == null ? '请核对当前记录与条款。' : '结果尚未确认；将恢复原内容及版本，不会另开一笔办理。'),
      if (path.endsWith('/reservations') && _record != null) ...[
        supplyFact('许可', _record!.title),
        supplyFact('价格',
            licenseMoney(Map<String, dynamic>.from(_record!.data['price']))),
        supplyFact('权利范围', _record!.terms!.summary),
        supplyNote('预留截止由服务器按商品约定计算；预留不等于取得许可。')
      ] else
        supplyFact('取消原因', actual['reason'])
    ])) {
      return;
    }
    if (!mounted ||
        epoch != widget.session.epoch ||
        party != widget.session.partyId) {
      return;
    }
    setState(() => _busy = true);
    try {
      final result = pending == null
          ? await _api.write(path, body, version: version, kind: kind)
          : await _api.retry(path, kind: kind);
      if (!mounted) return;
      if (result.id != widget.id) {
        await Navigator.pushNamed(
            context, '/licensing/record?recordId=${result.id}');
      }
      if (mounted) await _read();
    } catch (e) {
      if (mounted) {
        setState(() => _error = licenseError(e, writing: true));
        if (e is AccountError && [403, 404, 412].contains(e.status)) {
          setState(() => _record = null);
          if (e.status == 412) {
            await _read();
            if (mounted) setState(() => _error = '记录已更新，已重新读取。请核对新内容，再确认办理。');
          }
        }
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _close(LicenseRecord r) async {
    final path = '/api/v1/licensing/records/${r.id}/closures';
    if (_api.pending(path) != null) {
      await _operate(path, {}, kind: r.kind);
      return;
    }
    final controller = TextEditingController();
    final reason = await showDialog<String>(
        context: context,
        builder: (c) => AlertDialog(
                title: const Text('取消预留'),
                content: appField(
                    '取消原因（必填）',
                    TextField(
                        controller: controller,
                        maxLength: 2000,
                        maxLines: 3,
                        decoration:
                            const InputDecoration(hintText: '填写取消这份预留的原因'))),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c),
                      child: const Text('返回')),
                  FilledButton(
                      onPressed: () {
                        if (controller.text.trim().isNotEmpty) {
                          Navigator.pop(c, controller.text.trim());
                        }
                      },
                      child: const Text('继续核对'))
                ]));
    controller.dispose();
    if (reason != null && mounted) {
      await _operate(path, {'reason': reason},
          version: r.version, kind: r.kind);
    }
  }

  Widget _statusPanel(LicenseRecord r) => Card(
      color: r.kind == 'RESERVATION' ? const Color(0xFFFAF4ED) : Colors.white,
      child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              CircleAvatar(
                  radius: 28,
                  backgroundColor: const Color(0xFFF0E8DE),
                  child: Icon(
                      r.kind == 'RESERVATION'
                          ? Icons.schedule_outlined
                          : Icons.workspace_premium_outlined,
                      size: 32,
                      color: AccountTheme.accent)),
              const SizedBox(width: 16),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(
                        r.kind == 'GRANT' && r.status == 'ACTIVE' && !r.expired
                            ? '当前许可已生效'
                            : r.statusText,
                        style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    Text(
                        r.kind == 'RESERVATION'
                            ? '预留不代表已获准制作。请按要求提交材料，经独立核验后办理许可。'
                            : '许可范围与期限明确，每次使用仍须核对。',
                        style: const TextStyle(
                            fontSize: 14,
                            color: AccountTheme.muted,
                            height: 1.5)),
                  ])),
            ]),
            const Divider(height: 28),
            if (r.kind == 'RESERVATION')
              supplyFact('截止时间', licenseDate(r.data['expires_at']))
            else
              supplyFact('有效至', licenseDate(r.terms!.data['valid_until'])),
            Row(children: [
              Expanded(
                  child: Text(
                      '${r.kind == 'GRANT' ? '许可' : '预留'} ${shortSupplyId(r.id)}',
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w600))),
              IconButton(
                  tooltip: '复制记录编号',
                  onPressed: () => Clipboard.setData(ClipboardData(text: r.id)),
                  icon: const Icon(Icons.copy_outlined, size: 18)),
            ]),
          ])));

  Widget _contract(Map<String, dynamic> c) => Card(
          child: ExpansionTile(
              title: const Text('阅读当时的合同与规则',
                  style: TextStyle(fontWeight: FontWeight.w600)),
              childrenPadding: const EdgeInsets.all(18),
              children: [
            supplyNote(
                '这里保存的是当时合同文本、价格和规则；实际外部签署核验结果请查看办理材料和发放记录。后来改价不会改写此合同。'),
            supplyFact('合同编号', c['id']),
            supplyFact('内容校验摘要', c['content_sha256']),
            supplyFact('保存时间', licenseDate(c['created_at'])),
            ContractText(value: c['commitments']),
            const Divider(),
            const Text('当时的规则'),
            const SizedBox(height: 12),
            for (final rule in c['rule_contents']) ...[
              supplyFact('规则版本', '${rule['rule_key']} · ${rule['version']}'),
              ContractText(value: rule['terms'])
            ]
          ]));
  @override
  Widget build(BuildContext context) {
    final r = _record, d = r?.data;
    return licenseScaffold(
        context,
        r == null
            ? '许可记录'
            : r.kind == 'PRODUCT'
                ? '剧本与许可'
                : r.kind == 'RESERVATION'
                    ? '许可预留与合同'
                    : r.kind == 'GRANT'
                        ? '许可凭证'
                        : licenseKinds[r.kind]!,
        [
          if (_busy && r == null)
            const Center(child: CircularProgressIndicator()),
          if (_error != null) supplyNote(_error!, error: true),
          if (r != null) ...[
            if (r.kind == 'RESERVATION' || r.kind == 'GRANT')
              _statusPanel(r)
            else if (r.kind == 'READING') ...[
              const ManuscriptHero(
                  title: '指定账号受控阅稿', subtitle: '获批且未到期后，\n仅作评估阅读。'),
              const SizedBox(height: 16),
              Text(r.statusText,
                  style: const TextStyle(
                      fontSize: 14, color: AccountTheme.accent)),
              const SizedBox(height: 16),
            ] else ...[
              if (r.kind == 'PRODUCT')
                const Padding(
                    padding: EdgeInsets.only(bottom: 20),
                    child: Align(
                        alignment: Alignment.centerLeft,
                        child: Icon(Icons.description_outlined,
                            size: 48, color: AccountTheme.accent))),
              Text(r.title,
                  style: const TextStyle(
                      fontSize: 24, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Text(r.statusText,
                  style: const TextStyle(
                      fontSize: 12, color: AccountTheme.accent)),
              const SizedBox(height: 16),
            ],
            if (d!['preview_text'] != null)
              Padding(
                  padding: const EdgeInsets.only(bottom: 20),
                  child: SelectableText(d['preview_text'],
                      style: const TextStyle(
                          fontSize: 14,
                          color: AccountTheme.muted,
                          height: 1.7))),
            if (d['expires_at'] != null)
              supplyCard('预留截止', [
                supplyFact('截止时间', licenseDate(d['expires_at'])),
                supplyNote('预留不等于取得许可。到期后不再占用范围，迟到的条件处理需人工补救。')
              ]),
            if (d['price'] != null)
              licenseAmount(Map<String, dynamic>.from(d['price']),
                  due: d['payment_due_minor']),
            if (r.kind == 'RESERVATION' || r.kind == 'GRANT')
              supplyCard('订单与财务条件', [
                appNotice('许可按原条款约定的生效付款金额核对。付款不代替签署、身份与权属核验；退款核实后，后续使用可能受限。'),
                OutlinedButton(
                    onPressed: _busy
                        ? null
                        : () => Navigator.pushNamed(context, '/orders'),
                    child: const Text('查看订单与付款')),
              ]),
            if (r.terms != null)
              r.kind == 'GRANT'
                  ? licenseGrantTerms(r.terms!)
                  : licenseTermsView(r.terms!),
            if (d['contract'] != null)
              _contract(Map<String, dynamic>.from(d['contract'])),
            if (r.kind == 'PRODUCT') ...[
              if (r.owner == widget.session.partyId)
                supplyNote('这份商品属于当前身份，不能向自己预留。'),
              if (!DateTime.now().toUtc().isBefore(
                      DateTime.parse(d['terms']['development_until'])) ||
                  !DateTime.now()
                      .toUtc()
                      .isBefore(DateTime.parse(d['terms']['valid_until'])))
                supplyNote('商品已过可开发期限，当前不能预留。'),
              if (r.status != 'LISTED') supplyNote('商品当前未上架，不能预留。'),
              if (_api.pending('/api/v1/licensing/reservations') != null &&
                  _api.pending('/api/v1/licensing/reservations')!['body']
                          ['product_id'] !=
                      r.id) ...[
                supplyNote('还有另一份剧本的预留结果尚未确认，先恢复原办理。', error: true),
                OutlinedButton(
                    onPressed: () => Navigator.pushNamed(context,
                        '/licensing/record?recordId=${_api.pending('/api/v1/licensing/reservations')!['body']['product_id']}'),
                    child: const Text('前往原办理剧本'))
              ],
              FilledButton(
                  onPressed: _busy ||
                          (_api.pending('/api/v1/licensing/reservations') != null &&
                              _api.pending('/api/v1/licensing/reservations')!['body']
                                      ['product_id'] !=
                                  r.id) ||
                          r.owner == widget.session.partyId ||
                          r.status != 'LISTED' ||
                          !DateTime.now().toUtc().isBefore(DateTime.parse(
                              d['terms']['development_until'])) ||
                          !DateTime.now().toUtc().isBefore(
                              DateTime.parse(d['terms']['valid_until']))
                      ? null
                      : () => _operate(
                          '/api/v1/licensing/reservations', {'product_id': r.id},
                          kind: 'RESERVATION'),
                  child: Text(
                      _api.pending('/api/v1/licensing/reservations') == null
                          ? '预留这份许可'
                          : '恢复原预留')),
            ],
            if (r.kind == 'RESERVATION') ...[
              if (r.status == 'REVIEW_REQUIRED')
                supplyNote('该预留已转人工补救，尚未取得许可。请联系平台核对重签、付款或后续处理。'),
              if (r.status == 'HELD')
                FilledButton(
                    onPressed: _busy
                        ? null
                        : () async {
                            await Navigator.push(
                                context,
                                MaterialPageRoute(
                                    builder: (_) => LicenseEvidenceForm(
                                        reservationId: r.id)));
                            if (mounted) _read();
                          },
                    child: const Text('提交核验材料')),
              if (r.status == 'HELD' && r.owner == widget.session.partyId)
                TextButton(
                    onPressed: _busy ? null : () => _close(r),
                    child: const Text('取消预留')),
              supplyNote('签署、身份及付款材料通过独立核验后，由核验人员发放许可。页面不替代真实付款或外部签署。'),
            ],
            if (r.kind == 'EVIDENCE')
              supplyCard('外部事实核验', [
                supplyFact('对应预留', r.parent),
                supplyFact('外部材料引用', d['external_reference']),
                supplyFact('对应合同摘要', d['contract_sha256']),
                supplyNote('人工核验外部材料；没有平台自动支付或电子签成功记录。'),
                if (d['review'] != null)
                  supplyFact('核验意见', d['review']['reason'])
              ]),
            if (r.kind == 'GRANT') ...[
              supplyFact('发放时间', licenseDate(d['activated_at'])),
              supplyFact('发放依据', d['reason']),
              if (d['suspension_reason'] != null)
                supplyNote('暂停原因：${d['suspension_reason']}'),
              if (r.owner == widget.session.partyId)
                FilledButton(
                    onPressed: _busy || r.status != 'ACTIVE' || r.expired
                        ? null
                        : () async {
                            await Navigator.push(
                                context,
                                MaterialPageRoute(
                                    builder: (_) =>
                                        LicenseBindingForm(grantId: r.id)));
                            if (mounted) _read();
                          },
                    child: const Text('将许可用于项目')),
              supplyNote('许可状态不能覆盖实际期限。每次使用还会核对用途、地区、语言及额度；数字人的脸声同意另行办理。'),
            ],
            if (r.kind == 'PROJECT') ...[
              supplyFact('用途', licensePurposes[d['purpose']]),
              supplyFact(
                  '地域', licenseCountries[d['territory']] ?? d['territory']),
              supplyFact(
                  '语言', licenseLanguages[d['language']] ?? d['language']),
              supplyFact('集数', d['episodes']),
              supplyNote('用途记录保存后不能原地改变。请从“已获许可”选择符合范围的许可进行绑定。')
            ],
            if (r.kind == 'BINDING') ...[
              supplyFact('对应许可', r.parent),
              supplyFact('项目编号', d['project_id']),
              supplyFact('条款校验摘要', d['terms_sha256']),
              supplyNote('绑定已占用许可的项目额度，本阶段不提供解绑后再次使用。'),
              OutlinedButton(
                  onPressed: _bindingGrant?.status == 'ACTIVE' &&
                          _bindingProject != null &&
                          _bindingGrant!.terms!.matches(_bindingProject!) &&
                          (_bindingGrant!.terms!.data['rights'] as List)
                              .contains('ADAPT') &&
                          _bindingGrant!.data['work_version_id'] ==
                              d['work_version_id']
                      ? () => Navigator.pushNamed(
                          context, '/supply/work/new?bindingId=${r.id}')
                      : null,
                  child: const Text('根据绑定许可投稿项目改稿')),
              supplyNote('项目改稿还需许可包含改稿权利、项目范围相符且处在开发期限内。'),
              OutlinedButton(
                  onPressed: () => Navigator.pushNamed(
                      context, '/licensing/record?recordId=${d['project_id']}'),
                  child: const Text('查看用途项目')),
              OutlinedButton(
                  onPressed: () => Navigator.pushNamed(
                      context, '/licensing/record?recordId=${r.parent}'),
                  child: const Text('查看绑定许可'))
            ],
            if (r.kind == 'READING') ...[
              supplyFact('指定读者账号', d['reader_account_id']),
              supplyFact('阅稿依据', d['basis_type'] == 'NDA' ? '保密协议' : '评估授权'),
              supplyFact('截止时间', licenseDate(d['valid_until'])),
              supplyNote('仅限受控阅读，不包含改稿、生成、训练或发行许可。'),
              if (d['review'] != null)
                supplyFact('核验意见', d['review']['reason']),
              FilledButton(
                  onPressed: _busy ||
                          r.status != 'APPROVED' ||
                          r.expired ||
                          r.counterparty != widget.session.partyId ||
                          d['reader_account_id'] !=
                              widget.session.account?['id']
                      ? null
                      : () => Navigator.pushNamed(
                          context, '/licensing/reading?recordId=${r.id}'),
                  child: const Text('开始阅读'))
            ],
            Card(
                child: ExpansionTile(
                    title: const Text('记录信息'),
                    childrenPadding: const EdgeInsets.all(16),
                    children: [
                  supplyFact('记录编号', r.id),
                  supplyFact(
                      r.kind == 'RESERVATION' ? '买方身份' : '所属身份', r.owner),
                  if (r.counterparty != null)
                    supplyFact(r.kind == 'RESERVATION' ? '卖方身份' : '对方身份',
                        r.counterparty),
                  if (d['work_version_id'] != null)
                    supplyFact('作品版本', d['work_version_id']),
                  supplyFact('当前版本', r.version)
                ])),
            if (d['close_reason'] != null)
              supplyFact('关闭原因', d['close_reason']),
            if (d['late_reason'] != null) supplyFact('补救原因', d['late_reason']),
            if (_related.isNotEmpty)
              supplyCard('相关办理记录', [
                for (final related in _related)
                  ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(licenseKinds[related.kind]!),
                      subtitle: Text(
                          '${related.statusText} · ${shortSupplyId(related.id)}'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.pushNamed(context,
                                  '/licensing/record?recordId=${related.id}')
                              .then((_) {
                            if (mounted) _read();
                          }))
              ]),
          ],
          const SizedBox(height: 12),
          OutlinedButton(
              onPressed: _busy ? null : _read, child: const Text('重新读取当前记录')),
        ]);
  }
}

class LicenseReaderPage extends StatelessWidget {
  const LicenseReaderPage({super.key, required this.recordId});
  final String recordId;
  @override
  Widget build(BuildContext context) => LicenseGate(
      returnRoute: '/licensing/reading?recordId=$recordId',
      builder: (s) => _ControlledReader(session: s, id: recordId));
}

class _ControlledReader extends StatefulWidget {
  const _ControlledReader({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_ControlledReader> createState() => _ControlledReaderState();
}

class _ControlledReaderState extends State<_ControlledReader>
    with WidgetsBindingObserver {
  late final _api = LicenseApi(widget.session);
  String? _text, _error;
  LicenseRecord? _record;
  bool _busy = false;
  int _ticket = 0;
  Timer? _expiry, _recheck;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _read();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _expiry?.cancel();
    _recheck?.cancel();
    _text = null;
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      _ticket++;
      _expiry?.cancel();
      _recheck?.cancel();
      if (mounted) {
        setState(() {
          _text = null;
          _record = null;
          _busy = false;
        });
      }
    } else {
      _read();
    }
  }

  Future<void> _read() async {
    final ticket = ++_ticket;
    _expiry?.cancel();
    _recheck?.cancel();
    setState(() {
      _text = null;
      _record = null;
      _error = null;
      _busy = true;
    });
    try {
      final record = await _api.record(widget.id);
      final text = await _api.reading(record);
      if (!mounted || ticket != _ticket) return;
      final duration = DateTime.parse(record.data['valid_until'])
          .difference(DateTime.now().toUtc());
      if (duration <= Duration.zero) {
        throw const AccountError(403, 'READING_FORBIDDEN');
      }
      setState(() {
        _record = record;
        _text = text;
      });
      _expiry = Timer(duration, () {
        if (mounted) {
          setState(() {
            _ticket++;
            _text = null;
            _record = null;
            _error = '阅稿授权已到期，正文已清空。';
          });
        }
      });
      _recheck = Timer(const Duration(seconds: 30), _revalidate);
    } catch (e) {
      if (mounted && ticket == _ticket) {
        setState(() => _error = licenseError(e));
      }
    } finally {
      if (mounted && ticket == _ticket) setState(() => _busy = false);
    }
  }

  Future<void> _revalidate() async {
    final ticket = _ticket;
    try {
      final record = await _api.record(widget.id);
      if (!mounted || ticket != _ticket) return;
      if (record.kind != 'READING' ||
          record.status != 'APPROVED' ||
          record.expired ||
          record.counterparty != widget.session.partyId ||
          record.data['reader_account_id'] != widget.session.account?['id']) {
        throw const AccountError(403, 'READING_FORBIDDEN');
      }
      _recheck = Timer(const Duration(seconds: 30), _revalidate);
    } catch (e) {
      if (mounted && ticket == _ticket) {
        _expiry?.cancel();
        setState(() {
          _text = null;
          _record = null;
          _error = licenseError(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => licenseScaffold(context, '受控阅读', [
        appNotice('有效期内的指定账号可阅读此文本。此授权仅限评估阅读，正文包含读者、授权编号和读取时间水印，不授予生成或训练。',
            icon: Icons.description_outlined),
        if (_record != null)
          supplyFact('授权截止', licenseDate(_record!.data['valid_until'])),
        if (_error != null) supplyNote(_error!, error: true),
        if (_busy) const Center(child: CircularProgressIndicator()),
        if (_text != null)
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: SelectableText(_text!,
                      style: const TextStyle(fontSize: 16, height: 1.9)))),
        const SizedBox(height: 20),
        FilledButton(
            onPressed: _busy ? null : _read, child: const Text('重新核对授权并读取')),
      ]);
}
