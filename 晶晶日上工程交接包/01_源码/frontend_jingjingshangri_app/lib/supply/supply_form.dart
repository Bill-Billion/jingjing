import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import 'supply_api.dart';
import 'supply_files.dart';
import 'supply_models.dart';
import 'supply_widgets.dart';

class SupplyForm extends StatelessWidget {
  const SupplyForm({super.key, required this.work, this.previousId});
  final bool work;
  final String? previousId;
  @override
  Widget build(BuildContext context) => SupplyGate(
      returnRoute:
          '${work ? '/supply/work/new' : '/supply/profile'}${previousId == null ? '' : '?previousId=$previousId'}',
      builder: (s) =>
          _SupplyFormBody(session: s, work: work, previousId: previousId));
}

class _Credit {
  _Credit(this.role, {String? party, List<String>? evidence})
      : party = TextEditingController(text: party),
        evidence = evidence ?? [];
  final String role;
  final TextEditingController party;
  List<String> evidence;
  void dispose() => party.dispose();
}

class _SupplyFormBody extends StatefulWidget {
  const _SupplyFormBody(
      {required this.session, required this.work, this.previousId});
  final AccountSession session;
  final bool work;
  final String? previousId;
  @override
  State<_SupplyFormBody> createState() => _SupplyFormBodyState();
}

class _SupplyFormBodyState extends State<_SupplyFormBody> {
  late final api = SupplyApi(widget.session);
  final title = TextEditingController(), description = TextEditingController();
  final form = GlobalKey<FormState>();
  List<String> evidence = [], manuscript = [];
  final credits = <_Credit>[];
  Map<String, dynamic>? previous;
  String? error, receiptId;
  bool loaded = false;
  bool loading = true, busy = false, approved = false;
  int generation = 0;
  String get path =>
      widget.work ? '/api/v1/supply/work-versions' : '/api/v1/supply/profiles';
  Map<String, dynamic>? get pending => api.pending(path);
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    title.dispose();
    description.dispose();
    for (final c in credits) {
      c.dispose();
    }
    super.dispose();
  }

  void populate(Map<String, dynamic> body) {
    title.text =
        (body[widget.work ? 'title' : 'display_name'] as String?) ?? '';
    description.text = body['description'] as String? ?? '';
    evidence =
        (body[widget.work ? 'evidence_ids' : 'evidence_asset_ids'] as List? ??
                [])
            .cast<String>()
            .toList();
    manuscript = body['content_asset_id'] == null
        ? []
        : [body['content_asset_id'] as String];
    for (final c in credits) {
      c.dispose();
    }
    credits.clear();
    for (final c in body['credits'] as List? ?? []) {
      credits.add(_Credit(c['role'] as String,
          party: c['party_id'] as String,
          evidence: (c['evidence_asset_ids'] as List).cast<String>().toList()));
    }
  }

  Future<void> load() async {
    final ticket = ++generation;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final profile = await api.latestProfile();
      Map<String, dynamic>? source;
      if (widget.previousId != null) {
        source = await api.record(widget.previousId!);
        if (source['kind'] != (widget.work ? 'WORK_VERSION' : 'PROFILE')) {
          throw const AccountError(404, 'SUPPLY_NOT_FOUND');
        }
        source = widget.work ? await api.latestWork(source) : profile;
        if (source == null) throw const AccountError(404, 'SUPPLY_NOT_FOUND');
      } else if (!widget.work && profile != null) {
        source = profile;
      }
      if (!mounted || ticket != generation) return;
      if (widget.work &&
          source != null &&
          source['data']['version']['content']['kind'] != 'ORIGINAL') {
        throw const AccountError(409, 'PROJECT_LICENSE_NOT_READY');
      }
      previous = source;
      approved = profile?['current_status'] == 'APPROVED';
      final saved = pending?['body'];
      if (saved is Map) {
        populate(Map<String, dynamic>.from(saved));
      } else if (source != null) {
        final data = source['data'];
        populate(widget.work
            ? {
                ...Map<String, dynamic>.from(data['version']['content'] as Map),
                'credits': data['credits']
              }
            : Map<String, dynamic>.from(data as Map));
      } else if (widget.work && credits.isEmpty) {
        // Make the required relationship visible without assigning its owner.
        credits.add(_Credit('RIGHTS_HOLDER'));
      }
      setState(() {
        loading = false;
        loaded = true;
      });
    } on AccountError catch (e) {
      if (mounted && ticket == generation) {
        setState(() {
          previous = null;
          loading = false;
          error = supplyError(e);
        });
      }
    }
  }

  String? requiredText(String? text, int max) =>
      text == null || text.trim().isEmpty
          ? '请填写此项'
          : text.trim().length > max
              ? '最多 $max 个字'
              : null;
  String? get missingRequired {
    if (requiredText(title.text, widget.work ? 200 : 120) != null) {
      return widget.work ? '请填写作品标题。' : '请填写作者展示名称。';
    }
    if (!widget.work && requiredText(description.text, 2000) != null) {
      return '请填写作者介绍。';
    }
    if (widget.work && manuscript.length != 1) return '请上传一份私有稿件。';
    if (evidence.isEmpty) {
      return widget.work ? '请上传作品权利证明。' : '请上传申请证明材料。';
    }
    if (widget.work) {
      if (!credits.any((c) => c.role == 'RIGHTS_HOLDER')) {
        return '请填写至少一位权利人。';
      }
      final seen = <String>{};
      for (final c in credits) {
        if (!supplyId(c.party.text.trim()) || c.evidence.isEmpty) {
          return '请补齐每位关系主体的编号与证明。';
        }
        if (!seen.add('${c.party.text.trim()}:${c.role}')) {
          return '同一主体的同一角色只需填写一行。';
        }
      }
    }
    return null;
  }

  Map<String, dynamic> payload() {
    if (evidence.isEmpty) throw const AccountError(400, 'PROOF_REQUIRED');
    if (!widget.work) {
      return {
        'display_name': title.text.trim(),
        'description': description.text.trim(),
        'evidence_asset_ids': evidence,
        'previous_profile_id': previous?['id']
      };
    }
    if (manuscript.length != 1) {
      throw const AccountError(400, 'MANUSCRIPT_REQUIRED');
    }
    if (credits.isEmpty || !credits.any((c) => c.role == 'RIGHTS_HOLDER')) {
      throw const AccountError(400, 'RIGHTS_HOLDER_REQUIRED');
    }
    final seen = <String>{};
    for (final c in credits) {
      if (!supplyId(c.party.text.trim()) || c.evidence.isEmpty) {
        throw const AccountError(400, 'CREDIT_INCOMPLETE');
      }
      if (!seen.add('${c.party.text.trim()}:${c.role}')) {
        throw const AccountError(400, 'DUPLICATE_CREDIT');
      }
    }
    return {
      'work_id': previous?['stream_ref'],
      'previous_version_id': previous?['id'],
      'title': title.text.trim(),
      'kind': 'ORIGINAL',
      'source_version_id': null,
      'project_id': null,
      'content_asset_id': manuscript.single,
      'evidence_ids': evidence,
      'credits': [
        for (final c in credits)
          {
            'party_id': c.party.text.trim(),
            'role': c.role,
            'evidence_asset_ids': c.evidence
          }
      ]
    };
  }

  Future<void> save() async {
    if (pending == null && !(form.currentState?.validate() ?? false)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final body = pending?['body'] is Map
          ? Map<String, dynamic>.from(pending!['body'] as Map)
          : payload();
      final receipt = await api.write(path, body,
          kind: widget.work ? 'WORK_VERSION' : 'PROFILE');
      receiptId = receipt['id'] as String;
      await openReceipt();
    } on AccountError catch (e) {
      if (mounted) setState(() => error = supplyError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> openReceipt() async {
    if (receiptId == null) return;
    await api.record(
        receiptId!); // A replay response may be older than the current record.
    if (mounted) {
      await Navigator.pushReplacementNamed(
          context, '/supply/record?recordId=$receiptId');
    }
  }

  Widget files(List<String> ids, ValueChanged<List<String>> changed,
          {bool single = false}) =>
      SupplyFiles(
          api: api,
          purpose: single ? 'WORK_CONTENT' : 'RIGHTS_EVIDENCE',
          ids: ids,
          single: single,
          enabled: !busy && pending == null,
          onChanged: (v) => setState(() => changed(v)));
  @override
  Widget build(BuildContext context) {
    final locked = busy || pending != null || receiptId != null;
    final missing = missingRequired;
    final identityKind = switch (widget.session.party?['kind']) {
      'PERSON' => '个人',
      'ORGANIZATION' => '机构',
      _ => '当前身份',
    };
    return supplyScaffold(
        context,
        widget.work
            ? (previous == null ? '投稿原作' : '保存作品新修订')
            : (previous == null ? '作者申请' : '补正与更新资料'),
        [
          Card(
              key: const Key('supply-current-identity'),
              child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('当前提交身份 · $identityKind',
                            style: TextStyle(
                                fontSize: 12,
                                color: Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant)),
                        const SizedBox(height: 4),
                        SelectableText(
                            widget.session.party?['display_name'] as String? ??
                                '—',
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w600)),
                      ]))),
          if (loading) const LinearProgressIndicator(),
          if (error != null) supplyNote(error!, error: true),
          if (!loading && !loaded)
            OutlinedButton(onPressed: load, child: const Text('重新读取原记录')),
          if (!loading && loaded)
            Form(
                key: form,
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (pending != null)
                        supplyCard('上次提交结果未确认', [
                          supplyNote('已锁定原内容。核对时沿用原操作，避免重复创建。'),
                          FilledButton(
                              onPressed: busy ? null : save,
                              child: const Text('核对原提交结果'))
                        ]),
                      if (receiptId != null)
                        supplyCard('已收到提交回执', [
                          supplyNote('正在核对最新记录。请只重新读取，不要再次创建。'),
                          OutlinedButton(
                              onPressed: busy
                                  ? null
                                  : () async {
                                      try {
                                        await openReceipt();
                                      } on AccountError catch (e) {
                                        if (mounted) {
                                          setState(
                                              () => error = supplyError(e));
                                        }
                                      }
                                    },
                              child: const Text('读取最新结果'))
                        ]),
                      if (previous != null)
                        supplyCard('接续已保存版本', [
                          supplyFact('关联版本',
                              '第 ${previous!['revision']} 版 · ${shortSupplyId(previous!['id'] as String)}'),
                          supplyNote('本次保存为新的版本，旧版资料保留。')
                        ]),
                      supplyCard(widget.work ? '作品资料' : '申请资料', [
                        TextFormField(
                            key: const Key('supply-title'),
                            controller: title,
                            onChanged: (_) => setState(() {}),
                            enabled: !locked,
                            maxLength: widget.work ? 200 : 120,
                            validator: (v) =>
                                requiredText(v, widget.work ? 200 : 120),
                            decoration: InputDecoration(
                                labelText:
                                    widget.work ? '作品标题 *' : '作者展示名称 *')),
                        const SizedBox(height: 14),
                        if (!widget.work)
                          TextFormField(
                              key: const Key('supply-description'),
                              controller: description,
                              onChanged: (_) => setState(() {}),
                              enabled: !locked,
                              maxLength: 2000,
                              minLines: 4,
                              maxLines: 8,
                              validator: (v) => requiredText(v, 2000),
                              decoration:
                                  const InputDecoration(labelText: '作者介绍 *')),
                        if (widget.work) ...[
                          supplyFact('作品类型', '原作'),
                          supplyNote('当前支持原作投稿。项目改编需接入项目许可后开放。')
                        ],
                      ]),
                      if (widget.work)
                        supplyCard('私有稿件 *', [
                          files(manuscript, (v) => manuscript = v, single: true)
                        ]),
                      supplyCard(widget.work ? '作品权利证明 *' : '申请证明材料 *',
                          [files(evidence, (v) => evidence = v)]),
                      if (widget.work)
                        supplyCard('作者、权利人与代理', [
                          supplyNote(
                              '每个主体按实际关系分别填写并举证。作者不自动视为权利人；至少明确一位权利人。主体编号由对方准确提供。'),
                          for (final c in credits)
                            Container(
                                key: ObjectKey(c),
                                margin: const EdgeInsets.only(bottom: 20),
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                    border: Border.all(
                                        color: const Color(0xFFE2E3DB)),
                                    borderRadius: BorderRadius.circular(10)),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      Row(children: [
                                        Expanded(
                                            child: Text(creditRoles[c.role]!,
                                                style: const TextStyle(
                                                    fontWeight:
                                                        FontWeight.w700))),
                                        IconButton(
                                            tooltip: '移除这一行',
                                            onPressed: locked
                                                ? null
                                                : () => setState(() {
                                                      credits.remove(c);
                                                      c.dispose();
                                                    }),
                                            icon: const Icon(Icons.close,
                                                size: 20))
                                      ]),
                                      TextFormField(
                                          controller: c.party,
                                          onChanged: (_) => setState(() {}),
                                          enabled: !locked,
                                          autocorrect: false,
                                          enableSuggestions: false,
                                          validator: (v) => supplyId(v?.trim())
                                              ? null
                                              : '请填完整的小写主体编号',
                                          decoration: const InputDecoration(
                                              labelText: '主体编号 *')),
                                      Align(
                                          alignment: Alignment.centerLeft,
                                          child: TextButton(
                                              onPressed: locked
                                                  ? null
                                                  : () => setState(() => c.party
                                                      .text = api.owner()),
                                              child: const Text('使用当前身份'))),
                                      const Text('此主体此角色的证明 *'),
                                      const SizedBox(height: 8),
                                      files(c.evidence, (v) => c.evidence = v),
                                    ])),
                          Wrap(spacing: 8, runSpacing: 8, children: [
                            for (final role in creditRoles.keys)
                              OutlinedButton.icon(
                                  onPressed: locked || credits.length >= 30
                                      ? null
                                      : () => setState(
                                          () => credits.add(_Credit(role))),
                                  icon: const Icon(Icons.add, size: 18),
                                  label: Text('添加${creditRoles[role]}'))
                          ]),
                        ]),
                      if (widget.work && !approved)
                        supplyNote('当前作者申请尚未通过，暂不能保存作品。', error: true),
                      if (widget.work)
                        supplyNote('先保存草稿。保存后在版本详情核对资料，再单独提交审核。'),
                      if (!widget.work)
                        supplyNote('提交后进入作者资格审核。新申请会替代旧版的当前资格，请确认材料齐全。'),
                      if (!locked && missing != null) supplyNote(missing),
                      FilledButton(
                          key: const Key('supply-save'),
                          onPressed: locked ||
                                  missing != null ||
                                  (widget.work && !approved)
                              ? null
                              : save,
                          child: Text(busy
                              ? '正在提交…'
                              : widget.work
                                  ? '保存草稿'
                                  : '提交作者申请')),
                    ])),
        ]);
  }
}
