import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../supply/supply_widgets.dart';
import 'license_api.dart';
import 'license_models.dart';
import 'license_widgets.dart';
import 'procurement_models.dart';

class ProcurementForm extends StatelessWidget {
  const ProcurementForm({super.key, required this.grantId});
  final String grantId;
  @override
  Widget build(BuildContext context) => LicenseGate(
      returnRoute: '/licensing/record?recordId=$grantId',
      builder: (s) => _Form(session: s, id: grantId));
}

class _Form extends StatefulWidget {
  const _Form({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_Form> createState() => _FormState();
}

class _FormState extends State<_Form> {
  late final api = LicenseApi(widget.session),
      supply = SupplyApi(widget.session);
  LicenseRecord? grant;
  List<LicenseRecord> bindings = [];
  List<String> assets = [];
  final fields = {
    for (final k in [
      'at',
      'from',
      'until',
      'income',
      'platform',
      'tax',
      'distribution',
      'production',
      'external',
      'note'
    ])
      k: TextEditingController()
  };
  String kind = '', project = '';
  String? error;
  bool busy = false, confirmed = false;
  String get eventPath =>
      '/api/v1/licensing/grants/${widget.id}/procurement-events';
  String get royaltyPath =>
      '/api/v1/licensing/grants/${widget.id}/royalty-statements';
  String? get pendingPath => api.pending(eventPath) != null
      ? eventPath
      : api.pending(royaltyPath) != null
          ? royaltyPath
          : null;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    for (final c in fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    setState(() => busy = true);
    try {
      final r = await api.record(widget.id), b = await api.all('BINDING');
      if (r.kind != 'GRANT' || r.data['procurement'] == null) {
        throw const AccountError(403, 'IP_PROCUREMENT_REQUIRED');
      }
      if (mounted) {
        setState(() {
          grant = r;
          bindings = b.where((x) => x.parent == r.id).toList();
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = licenseError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String iso(String key) {
    final v = DateTime.tryParse(fields[key]!.text.trim());
    if (v == null) {
      throw const FormatException('请填写带时区的准确时间，例如 2026-11-02T10:00:00+08:00。');
    }
    return v.toUtc().toIso8601String();
  }

  Map<String, dynamic> payload() {
    if (!confirmed ||
        kind.isEmpty ||
        assets.isEmpty ||
        fields['external']!.text.trim().isEmpty ||
        fields['note']!.text.trim().isEmpty) {
      throw const FormatException('请补齐事项、依据、外部编号和说明，并明确核对。');
    }
    if (kind != 'WITHDRAWAL_REQUEST' &&
        !bindings.any((r) => r.data['project_id'] == project)) {
      throw const FormatException('请选择本许可已绑定项目。');
    }
    final common = {
      'evidence_asset_ids': assets,
      'external_reference': fields['external']!.text.trim(),
      'note': fields['note']!.text.trim()
    };
    if (kind == 'ROYALTY_STATEMENT') {
      final s = {
        ...common,
        'period_from': iso('from'),
        'period_until': iso('until'),
        for (final k in [
          'income',
          'platform',
          'tax',
          'distribution',
          'production'
        ])
          '${k}_minor': signedMinorInput(fields[k]!.text.trim())
      };
      if (!isRoyaltyInput(s) ||
          DateTime.parse(s['period_until'] as String)
              .isAfter(DateTime.now().toUtc())) {
        throw const FormatException('核对已结束账期及整数分金额；更正可为有依据的负数。');
      }
      return {'project_id': project, 'statement': s};
    }
    final at = iso('at');
    if (DateTime.parse(at).isAfter(DateTime.now().toUtc())) {
      throw const FormatException('事实时间不能晚于当前时间。');
    }
    return {
      ...common,
      'project_id': kind == 'WITHDRAWAL_REQUEST' ? null : project,
      'event': kind,
      'occurred_at': at
    };
  }

  Future<void> submit() async {
    if (busy || grant == null) return;
    final old = pendingPath,
        path = old ?? (kind == 'ROYALTY_STATEMENT' ? royaltyPath : eventPath),
        resultKind =
            path == royaltyPath ? 'ROYALTY_STATEMENT' : 'PROCUREMENT_EVENT';
    Map<String, dynamic>? body;
    try {
      if (old == null) body = payload();
    } on FormatException catch (e) {
      setState(() => error = e.message);
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final r = old != null
          ? await api.retry(path, kind: resultKind, expectedParent: widget.id)
          : await api.write(path, body!,
              kind: resultKind,
              version: grant!.version,
              expectedParent: widget.id);
      if (mounted) Navigator.pop(context, r);
    } catch (e) {
      if (mounted) setState(() => error = licenseError(e, writing: true));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget input(String key, String label,
          {bool number = false, int lines = 1}) =>
      appField(
          label,
          TextField(
              key: ValueKey('ip-field-$key'),
              controller: fields[key],
              enabled: !busy && pendingPath == null,
              keyboardType: number
                  ? const TextInputType.numberWithOptions(signed: true)
                  : TextInputType.text,
              maxLines: lines,
              onChanged: (_) => setState(() => confirmed = false)));
  @override
  Widget build(BuildContext context) {
    final g = grant,
        p = g?.data['procurement'],
        locked = busy || pendingPath != null;
    final withdraw = g != null &&
        g.counterparty == widget.session.partyId &&
        p['mode'] == 'REVENUE_SHARE' &&
        !beforeLicenseEnd(g.terms!.data['development_until']);
    return licenseScaffold(context, 'IP采购事实与分红账单', [
      const Text('仅在本许可内提交实际记录。开发、上线、撤回均等待独立核验；账面应计及更正均未转账，不自动扣款。'),
      if (error != null) supplyNote(error!, error: true),
      if (g == null)
        OutlinedButton(
            onPressed: busy ? null : load,
            child: Text(busy ? '正在读取…' : '重新读取原许可')),
      if (pendingPath != null) ...[
        supplyNote('原请求结果尚待确认，先使用原请求恢复，不能另建账单。'),
        FilledButton(
            onPressed: busy ? null : submit, child: const Text('恢复原请求并核对'))
      ],
      if (g != null) ...[
        DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: kind.isEmpty ? null : kind,
            decoration: const InputDecoration(labelText: '本次事项'),
            items: [
              const DropdownMenuItem(
                  value: 'DEVELOPMENT', child: Text('实际开发依据')),
              const DropdownMenuItem(
                  value: 'PUBLICATION', child: Text('实际上线依据')),
              if (p['mode'] == 'REVENUE_SHARE')
                const DropdownMenuItem(
                    value: 'ROYALTY_STATEMENT', child: Text('分红账单（未转账）')),
              if (withdraw)
                const DropdownMenuItem(
                    value: 'WITHDRAWAL_REQUEST', child: Text('作者申请核验两年未开发并撤回'))
            ],
            onChanged: locked
                ? null
                : (v) => setState(() {
                      kind = v ?? '';
                      confirmed = false;
                    })),
        if (kind != 'WITHDRAWAL_REQUEST')
          DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: project.isEmpty ? null : project,
              decoration: const InputDecoration(labelText: '原许可已绑定项目'),
              items: [
                for (final r in bindings)
                  DropdownMenuItem(
                      value: r.data['project_id'] as String,
                      child: Text(r.data['project_id'],
                          overflow: TextOverflow.ellipsis))
              ],
              onChanged:
                  locked ? null : (v) => setState(() => project = v ?? '')),
        if (kind == 'ROYALTY_STATEMENT') ...[
          input('from', '账期开始（ISO时间，含时区）'),
          input('until', '账期结束（ISO时间，含时区）'),
          input('income', '发行与衍生收入（整数分）', number: true),
          input('platform', '平台佣金（整数分）', number: true),
          input('tax', '税费（整数分）', number: true),
          input('distribution', '发行成本（整数分）', number: true),
          input('production', '制作成本（整数分）', number: true),
          const Text('负数仅用于有依据的更正。重复或重叠账期不能提交为新收入。')
        ] else
          input('at', '事实时间（ISO时间，含时区）'),
        input('external', '外部凭证或账单编号'),
        input('note', '说明及核验依据', lines: 3),
        SupplyFiles(
            api: supply,
            purpose: 'RIGHTS_EVIDENCE',
            ids: assets,
            enabled: !locked,
            onChanged: (v) => setState(() {
                  assets = v;
                  confirmed = false;
                })),
        CheckboxListTile(
            value: confirmed,
            title: const Text('已核对本次记录、原许可和实际依据；尚待独立审核'),
            onChanged:
                locked ? null : (v) => setState(() => confirmed = v == true)),
        FilledButton(
            onPressed:
                locked || !confirmed || g.status != 'ACTIVE' ? null : submit,
            child: const Text('提交独立核验')),
      ]
    ]);
  }
}
