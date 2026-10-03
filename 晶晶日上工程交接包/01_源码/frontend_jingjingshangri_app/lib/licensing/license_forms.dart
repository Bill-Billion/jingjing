import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../supply/supply_models.dart';
import '../supply/supply_widgets.dart';
import 'license_api.dart';
import 'license_models.dart';
import 'license_widgets.dart';

class LicenseEvidenceForm extends StatelessWidget {
  const LicenseEvidenceForm({super.key, required this.reservationId});
  final String reservationId;
  @override
  Widget build(BuildContext context) => LicenseGate(
      returnRoute: '/licensing/evidence?reservationId=$reservationId',
      builder: (s) => _EvidenceForm(session: s, id: reservationId));
}

class _EvidenceForm extends StatefulWidget {
  const _EvidenceForm({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_EvidenceForm> createState() => _EvidenceFormState();
}

class _EvidenceFormState extends State<_EvidenceForm> {
  late final _api = LicenseApi(widget.session);
  late final _supply = SupplyApi(widget.session);
  LicenseRecord? _reservation;
  bool _busy = false;
  String? _error;
  final _ref = TextEditingController();
  final _ids = {
    for (final k in [
      'seller_signature_asset_id',
      'buyer_signature_asset_id',
      'identity_asset_id',
      'payment_asset_id'
    ])
      k: TextEditingController()
  };
  static const _path = '/api/v1/licensing/evidence';
  @override
  void initState() {
    super.initState();
    for (final c in [_ref, ..._ids.values]) {
      c.addListener(_changed);
    }
    _load();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _ref.dispose();
    for (final c in _ids.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _busy = true);
    try {
      final r = await _api.record(widget.id);
      if (r.kind != 'RESERVATION') {
        throw const AccountError(400, 'INVALID_RESERVATION');
      }
      if (!mounted) return;
      setState(() => _reservation = r);
      final pending = _api.pending(_path);
      if (pending != null) {
        final body = pending['body'];
        _ref.text = body['external_reference'];
        for (final entry in _ids.entries) {
          entry.value.text = body[entry.key] ?? '';
        }
      }
    } catch (e) {
      if (mounted) setState(() => _error = licenseError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool get _valid =>
      _reservation != null &&
      _ref.text.trim().isNotEmpty &&
      _ref.text.trim().length <= 128 &&
      _ids.entries.every((e) =>
          e.key == 'payment_asset_id' &&
              _reservation!.data['payment_due_minor'] == 0 &&
              e.value.text.trim().isEmpty ||
          supplyId(e.value.text.trim()));
  Future<void> _submit() async {
    final r = _reservation!, epoch = widget.session.epoch, party = _api.owner();
    final pending = _api.pending(_path);
    if (pending != null && pending['body']['reservation_id'] != r.id) {
      setState(() => _error = '还有另一份预留的材料结果尚未确认，请先回到对应预留恢复原操作。');
      return;
    }
    if (!await licenseConfirm(context, '提交外部核验材料', [
      supplyFact('许可', r.title),
      supplyFact('合同内容摘要', r.data['contract']['content_sha256']),
      supplyNote('请确认材料对应这份合同。提交不会直接发放许可；真实签署、身份与付款事实由独立人员核验。')
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
      final result = pending != null
          ? await _api.retry(_path, kind: 'EVIDENCE')
          : await _api.write(
              _path,
              {
                'reservation_id': r.id,
                'contract_sha256': r.data['contract']['content_sha256'],
                for (final e in _ids.entries)
                  e.key:
                      e.value.text.trim().isEmpty ? null : e.value.text.trim(),
                'external_reference': _ref.text.trim()
              },
              kind: 'EVIDENCE');
      if (mounted) {
        Navigator.pushReplacementNamed(
            context, '/licensing/record?recordId=${result.id}');
      }
    } catch (e) {
      if (mounted) setState(() => _error = licenseError(e, writing: true));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = _api.pending(_path), locked = pending != null || _busy;
    return licenseScaffold(context, '提交外部核验材料', [
      if (_error != null) supplyNote(_error!, error: true),
      if (_busy && _reservation == null)
        const Center(child: CircularProgressIndicator()),
      if (_reservation != null) ...[
        appNotice('提交后由独立人员核验，不代表已签署或已到账。'),
        supplyCard('对应的许可合同', [
          supplyFact('许可', _reservation!.title),
          supplyFact('预留截止', licenseDate(_reservation!.data['expires_at'])),
          supplyFact(
              '合同内容摘要', _reservation!.data['contract']['content_sha256']),
          supplyNote('请提供真实外部签署、身份与付款材料。当前没有平台自动付款或自动签约服务。')
        ]),
        if (pending != null)
          supplyNote('上次结果未确认，表单已保留原内容。恢复时沿用原操作。', error: true),
        for (final entry in _ids.entries)
          supplyCard(
              {
                'seller_signature_asset_id': '卖方签署材料',
                'buyer_signature_asset_id': '买方签署材料',
                'identity_asset_id': '身份核验依据',
                'payment_asset_id': '付款材料'
              }[entry.key]!,
              [
                if (entry.key == 'payment_asset_id' &&
                    _reservation!.data['payment_due_minor'] == 0)
                  supplyNote('本合同生效前应付为零，付款材料可以留空；双方签署及身份依据仍需提交。'),
                _LicenseMaterial(
                    api: _supply, controller: entry.value, enabled: !locked),
              ]),
        supplyCard('外部材料引用（必填）', [
          Semantics(
              label: '外部材料引用（必填）',
              child: TextField(
                  controller: _ref,
                  enabled: !locked,
                  maxLength: 128,
                  decoration: const InputDecoration(
                      helperText: '填写可核对的合同或材料引用，不填写密码或供应商密钥。')))
        ]),
        const SizedBox(height: 20),
        FilledButton(
            onPressed: _busy || (!_valid && pending == null) ? null : _submit,
            child: Text(pending != null ? '恢复原材料提交' : '提交并等待独立核验')),
      ],
    ]);
  }
}

class _LicenseMaterial extends StatefulWidget {
  const _LicenseMaterial(
      {required this.api, required this.controller, required this.enabled});
  final SupplyApi api;
  final TextEditingController controller;
  final bool enabled;
  @override
  State<_LicenseMaterial> createState() => _LicenseMaterialState();
}

class _LicenseMaterialState extends State<_LicenseMaterial> {
  List<String> _uploaded = [];
  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        appField(
            '材料编号（必填）',
            TextField(
                controller: widget.controller,
                enabled: widget.enabled,
                decoration: const InputDecoration(
                    helperText: '可引用买卖双方提供的私有文件编号，或上传本身份的真实材料。'),
                onChanged: (v) {
                  if (!_uploaded.contains(v)) setState(() => _uploaded = []);
                })),
        const SizedBox(height: 12),
        if (widget.api.session.supplyAccessDenied) ...[
          supplyNote('私有材料权限已失效，已清空文件信息。请重新核对权限后再上传。', error: true),
          OutlinedButton(
              onPressed: () async {
                try {
                  await widget.api.session.retrySupplyAccess();
                } catch (_) {}
              },
              child: const Text('重新核对材料权限'))
        ] else
          SupplyFiles(
              api: widget.api,
              purpose: 'RIGHTS_EVIDENCE',
              ids: _uploaded,
              single: true,
              enabled: widget.enabled,
              onChanged: (ids) {
                setState(() => _uploaded = ids);
                widget.controller.text = ids.isEmpty ? '' : ids.single;
              }),
      ]);
}

class LicenseProjectForm extends StatelessWidget {
  const LicenseProjectForm({super.key});
  @override
  Widget build(BuildContext context) => LicenseGate(
      returnRoute: '/licensing/project/new',
      builder: (s) => _ProjectForm(session: s));
}

class _ProjectForm extends StatefulWidget {
  const _ProjectForm({required this.session});
  final AccountSession session;
  @override
  State<_ProjectForm> createState() => _ProjectFormState();
}

class _ProjectFormState extends State<_ProjectForm> {
  late final _api = LicenseApi(widget.session);
  final _title = TextEditingController(),
      _episodes = TextEditingController(),
      _territory = TextEditingController(),
      _language = TextEditingController();
  String? _purpose, _error;
  bool _busy = false;
  static const _path = '/api/v1/licensing/projects';
  @override
  void initState() {
    super.initState();
    final pending = _api.pending(_path);
    if (pending != null) {
      final d = pending['body']['project'];
      _title.text = d['title'];
      _purpose = d['purpose'];
      _territory.text = d['territory'];
      _language.text = d['language'];
      _episodes.text = '${d['episodes']}';
    }
    for (final c in [_title, _episodes, _territory, _language]) {
      c.addListener(_changed);
    }
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    for (final c in [_title, _episodes, _territory, _language]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _valid =>
      _title.text.trim().isNotEmpty &&
      _purpose != null &&
      RegExp(r'^[A-Z]{2}$').hasMatch(_territory.text.trim()) &&
      RegExp(r'^[a-z]{2}$').hasMatch(_language.text.trim()) &&
      (int.tryParse(_episodes.text) ?? 0) > 0 &&
      (int.tryParse(_episodes.text) ?? 100001) <= 100000;
  Future<void> _submit() async {
    final epoch = widget.session.epoch, party = _api.owner();
    if (!await licenseConfirm(context, '保存项目用途', [
      supplyFact('名称', _title.text.trim()),
      supplyFact('用途', licensePurposes[_purpose]),
      supplyFact('地区 / 语言',
          '${licenseCountries[_territory.text.trim()] ?? _territory.text.trim()} / ${licenseLanguages[_language.text.trim()] ?? _language.text.trim()}'),
      supplyFact('集数', _episodes.text),
      supplyNote('项目用途保存后不能原地改变。这份记录用于许可核对，不表示制作已开工。')
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
      final result = _api.pending(_path) != null
          ? await _api.retry(_path, kind: 'PROJECT')
          : await _api.write(
              _path,
              {
                'project': {
                  'title': _title.text.trim(),
                  'purpose': _purpose,
                  'territory': _territory.text.trim(),
                  'language': _language.text.trim(),
                  'episodes': int.parse(_episodes.text)
                }
              },
              kind: 'PROJECT');
      if (mounted) {
        Navigator.pushReplacementNamed(
            context, '/licensing/record?recordId=${result.id}');
      }
    } catch (e) {
      if (mounted) setState(() => _error = licenseError(e, writing: true));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = _api.pending(_path), enabled = !_busy && pending == null;
    return licenseScaffold(context, '登记许可用途项目', [
      appNotice('填写项目实际用途与范围，保存后再选择许可绑定。集数必须与许可相符。'),
      if (pending != null) supplyNote('上次保存结果未确认，请恢复原内容。', error: true),
      if (_error != null) supplyNote(_error!, error: true),
      appField(
          '项目名称（必填）',
          TextField(
              controller: _title,
              enabled: enabled,
              maxLength: 200,
              decoration: const InputDecoration(hintText: '填写项目名称'))),
      const SizedBox(height: 16),
      appField(
          '用途（必选）',
          DropdownButtonFormField<String>(
              isExpanded: true,
              itemHeight: null,
              initialValue: _purpose,
              decoration: const InputDecoration(),
              items: licensePurposes.entries
                  .map((e) =>
                      DropdownMenuItem(value: e.key, child: Text(e.value)))
                  .toList(),
              onChanged: enabled ? (v) => setState(() => _purpose = v) : null)),
      const SizedBox(height: 24),
      _ScopeChoice(
          controller: _territory,
          choices: Map.fromEntries(
              licenseCountries.entries.where((e) => e.key != 'WORLD')),
          label: '国家或地区（必选）',
          codeLabel: '其他地区：两位大写国家代码',
          enabled: enabled),
      const SizedBox(height: 24),
      _ScopeChoice(
          controller: _language,
          choices: Map.fromEntries(
              licenseLanguages.entries.where((e) => e.key != 'ALL')),
          label: '语言（必选）',
          codeLabel: '其他语言：两位小写语言代码',
          enabled: enabled),
      const SizedBox(height: 16),
      appField(
          '集数（必填）',
          TextField(
              controller: _episodes,
              enabled: enabled,
              keyboardType: TextInputType.number,
              decoration:
                  const InputDecoration(helperText: '填写 1 至 100000 之间的整数。'))),
      const SizedBox(height: 24),
      FilledButton(
          onPressed: _busy || (!_valid && pending == null) ? null : _submit,
          child: Text(pending != null ? '恢复原项目保存' : '保存用途项目')),
    ]);
  }
}

class _ScopeChoice extends StatefulWidget {
  const _ScopeChoice(
      {required this.controller,
      required this.choices,
      required this.label,
      required this.codeLabel,
      required this.enabled});
  final TextEditingController controller;
  final Map<String, String> choices;
  final String label, codeLabel;
  final bool enabled;
  @override
  State<_ScopeChoice> createState() => _ScopeChoiceState();
}

class _ScopeChoiceState extends State<_ScopeChoice> {
  late String? _selected = widget.controller.text.isEmpty
      ? null
      : widget.choices.containsKey(widget.controller.text)
          ? widget.controller.text
          : 'OTHER';
  @override
  Widget build(BuildContext context) => Column(children: [
        appField(
            widget.label,
            DropdownButtonFormField<String>(
                isExpanded: true,
                itemHeight: null,
                initialValue: _selected,
                decoration: const InputDecoration(),
                items: [
                  for (final e in widget.choices.entries)
                    DropdownMenuItem(value: e.key, child: Text(e.value)),
                  const DropdownMenuItem(
                      value: 'OTHER', child: Text('其他（填写标准代码）'))
                ],
                onChanged: widget.enabled
                    ? (v) {
                        setState(() => _selected = v);
                        widget.controller.text = v == 'OTHER' ? '' : v ?? '';
                      }
                    : null)),
        if (_selected == 'OTHER')
          Padding(
              padding: const EdgeInsets.only(top: 12),
              child: appField(
                  widget.codeLabel,
                  TextField(
                      controller: widget.controller,
                      enabled: widget.enabled,
                      maxLength: 2,
                      decoration: const InputDecoration()))),
      ]);
}

class LicenseBindingForm extends StatelessWidget {
  const LicenseBindingForm({super.key, required this.grantId});
  final String grantId;
  @override
  Widget build(BuildContext context) => LicenseGate(
      returnRoute: '/licensing/bind?grantId=$grantId',
      builder: (s) => _BindingForm(session: s, id: grantId));
}

class _BindingForm extends StatefulWidget {
  const _BindingForm({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_BindingForm> createState() => _BindingFormState();
}

class _BindingFormState extends State<_BindingForm> {
  late final _api = LicenseApi(widget.session);
  LicenseRecord? _grant;
  List<LicenseRecord> _projects = [];
  String? _selected, _error;
  bool _busy = false;
  bool _needsReconfirm = false;
  String get _path => '/api/v1/licensing/grants/${widget.id}/bindings';
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _busy = true);
    try {
      final grant = await _api.record(widget.id),
          projects = await _api.all('PROJECT');
      if (grant.kind != 'GRANT' || grant.owner != widget.session.partyId) {
        throw const AccountError(403, 'LICENSE_PARTY_FORBIDDEN');
      }
      if (!mounted) return;
      setState(() {
        _grant = grant;
        _projects =
            projects.where((p) => p.owner == widget.session.partyId).toList();
        _selected = _api.pending(_path)?['body']['project_id'];
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _grant = null;
          _projects = [];
          _selected = null;
          _error = licenseError(e);
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    final pending = _api.pending(_path),
        grant = _grant!,
        project = _projects.where((v) => v.id == _selected).firstOrNull;
    if (project == null) {
      setState(() => _error = '请先选择本人用途项目。');
      return;
    }
    final epoch = widget.session.epoch, party = _api.owner();
    if (!await licenseConfirm(
        context, _needsReconfirm ? '记录已更新，请重新确认绑定' : '确认将许可用于项目', [
      supplyFact('许可', grant.id),
      supplyFact('项目', project.title),
      supplyFact('用途', licensePurposes[project.data['purpose']]),
      supplyFact('地域 / 语言',
          '${licenseCountries[project.data['territory']] ?? project.data['territory']} / ${licenseLanguages[project.data['language']] ?? project.data['language']}'),
      supplyFact('集数', project.data['episodes']),
      supplyNote('绑定会占用一个项目额度，本阶段不返还额度。确认时服务器再次核对实际范围、期限及可用额度。')
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
      final result = pending != null
          ? await _api.retry(_path, kind: 'BINDING')
          : await _api.write(_path, {'project_id': project.id},
              version: grant.version, kind: 'BINDING');
      if (mounted) {
        Navigator.pushReplacementNamed(
            context, '/licensing/record?recordId=${result.id}');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = licenseError(e, writing: true));
        if (e is AccountError && e.status == 412) {
          _needsReconfirm = true;
          await _load();
        }
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = _api.pending(_path), grant = _grant;
    final project = _projects.where((p) => p.id == _selected).firstOrNull;
    final usable = grant != null &&
        grant.status == 'ACTIVE' &&
        !grant.expired &&
        project != null &&
        grant.terms!.matches(project);
    return licenseScaffold(context, '将许可用于项目', [
      if (_error != null) supplyNote(_error!, error: true),
      if (_busy && grant == null)
        const Center(child: CircularProgressIndicator()),
      if (grant != null) ...[
        supplyFact('许可编号', grant.id),
        Text(grant.statusText),
        const SizedBox(height: 16),
        licenseTermsView(grant.terms!),
        if (pending != null)
          supplyNote('上次绑定结果未确认，将恢复原项目、原版本及原操作。', error: true),
        if (_projects.isEmpty) supplyNote('当前身份还没有用途项目，请先新建。'),
        appField(
            '选择本人用途项目（必选）',
            DropdownButtonFormField<String>(
                isExpanded: true,
                itemHeight: null,
                key: ValueKey(_selected),
                initialValue:
                    _projects.any((v) => v.id == _selected) ? _selected : null,
                decoration: const InputDecoration(),
                items: _projects
                    .map((p) => DropdownMenuItem(
                        value: p.id,
                        child: Text(p.title, overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: _busy || pending != null
                    ? null
                    : (v) => setState(() => _selected = v))),
        const SizedBox(height: 16),
        if (project != null)
          supplyCard('项目用途对照', [
            supplyFact('用途', licensePurposes[project.data['purpose']]),
            supplyFact(
                '地域',
                licenseCountries[project.data['territory']] ??
                    project.data['territory']),
            supplyFact(
                '语言',
                licenseLanguages[project.data['language']] ??
                    project.data['language']),
            supplyFact('集数', project.data['episodes'])
          ]),
        if (project != null && !usable)
          supplyNote('当前范围、状态或期限不符合绑定条件，请更换项目或核对许可。'),
        OutlinedButton(
            onPressed: _busy || pending != null
                ? null
                : () async {
                    await Navigator.pushNamed(
                        context, '/licensing/project/new');
                    if (mounted) _load();
                  },
            child: const Text('新建用途项目')),
        const SizedBox(height: 12),
        supplyNote('最终条件与剩余额度以确认时服务器核验为准。绑定后本阶段不返还使用额度。'),
        FilledButton(
            onPressed: _busy || (!usable && pending == null) ? null : _submit,
            child: Text(pending != null ? '恢复原绑定' : '确认绑定')),
      ],
      const SizedBox(height: 12),
      TextButton(
          onPressed: _busy ? null : _load, child: const Text('重新读取许可和项目')),
    ]);
  }
}
