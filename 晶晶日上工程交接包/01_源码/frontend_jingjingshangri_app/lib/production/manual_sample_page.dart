import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../contracts/contract_api.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_widgets.dart';
import 'production_api.dart';
import 'production_models.dart';
import 'production_widgets.dart';

class ManualSample {
  ManualSample(dynamic value, String requestId, String party)
      : raw = productionMap(value) {
    bool id(dynamic v) => v is String && isContractId(v);
    bool hash(dynamic v) =>
        v is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(v);
    productionRequire(raw['request_id'] == requestId &&
        raw['object_version'] is int &&
        raw['object_version'] >= 1 &&
        hash(raw['content_sha256']));
    final d = data;
    productionRequire([
          'request_id',
          'submission_id',
          'commissioner_party_id',
          'rights_owner_party_id',
          'merchant_party_id'
        ].every((k) => id(d[k])) &&
        d['request_id'] == requestId &&
        hash(d['submission_sha256']) &&
        [
          d['commissioner_party_id'],
          d['rights_owner_party_id'],
          d['merchant_party_id']
        ].contains(party) &&
        d['ownership'] == 'ARTIST_RETAINS_OWNERSHIP' &&
        d['territory'] is String &&
        d['terms'] is String);
    final c = productionMap(d['cast']);
    productionRequire(c['uses_identifiable_people'] == true &&
        c['cast'] is List &&
        c['cast'].length == 1);
    cast = productionMap(c['cast'][0]);
    productionRequire([
          'person_id',
          'avatar_id',
          'supply_consent_id',
          'look_version_id'
        ].every((k) => id(cast[k])) &&
        (cast['voice_version_id'] == null || id(cast['voice_version_id'])));
    productionRequire(d.containsKey('confirmation'));
    if (d['confirmation'] != null) {
      final r = productionMap(d['confirmation']);
      productionRequire(id(r['account_id']) &&
          hash(r['confirmed_sha256']) &&
          DateTime.tryParse('${r['confirmed_at']}') != null);
    }
    productionRequire(raw['projects'] == null ||
        raw['projects'] is List && raw['projects'].length <= 100);
    projects = [for (final p in raw['projects'] ?? []) productionMap(p)];
    productionRequire(projects.every((p) =>
            id(p['id']) &&
            (productionStatuses.containsKey(p['current_status']) ||
                p['current_status'] == 'CHANGES_REQUESTED')) &&
        projects.map((p) => p['id']).toSet().length == projects.length);
  }
  final Map<String, dynamic> raw;
  late final Map<String, dynamic> cast;
  late final List<Map<String, dynamic>> projects;
  Map<String, dynamic> get data => productionMap(raw['data']);
  int get version => raw['object_version'];
}

class ManualSampleApi {
  ManualSampleApi(this.session, this.requestId);
  final AccountSession session;
  final String requestId;
  ProductionApi get production => ProductionApi(session);
  String get path => '/api/v1/customization-requests/$requestId/manual-sample';
  Future<ManualSample> read() async {
    if (!isContractId(requestId)) throw const AccountError(400, 'INVALID_ID');
    final p = production.participant(), epoch = session.epoch;
    final raw = await session.read(path, actingParty: p);
    production.check(epoch, p);
    return ManualSample(raw, requestId, p);
  }

  Map<String, dynamic>? get pending =>
      session.pending('POST', '$path/confirmation',
          actingParty: production.participant());
  Future<ManualSample> confirm(ManualSample snapshot) async {
    final p = production.participant(),
        epoch = session.epoch,
        original = pending;
    if (!session.isOwner || snapshot.data['rights_owner_party_id'] != p) {
      throw const AccountError(403, 'ARTIST_SELF_REQUIRED');
    }
    final raw = await session.write('POST', '$path/confirmation',
        actingParty: p,
        body: original == null
            ? {'content_sha256': snapshot.raw['content_sha256']}
            : productionMap(original['body']),
        version: original?['version'] ?? snapshot.version, validate: (r) {
      ManualSample(r, requestId, p);
    });
    production.check(epoch, p);
    return ManualSample(raw, requestId, p);
  }

  Future<Uint8List> content(String projectId) async {
    final p = production.participant(), epoch = session.epoch;
    final current = await read();
    if (!session.isOwner ||
        current.data['rights_owner_party_id'] != p ||
        !current.projects.any((r) => r['id'] == projectId)) {
      throw const AccountError(403, 'ARTIST_SELF_REQUIRED');
    }
    // The dedicated endpoint validates this artist's own rights and actual final/paid state.
    // Never use a generic project GET or a final-content probe to establish access.
    final bytes = await session.readBytes(
        '/api/v1/production/projects/$projectId/manual-sample-content',
        actingParty: p);
    production.check(epoch, p);
    productionRequire(bytes.isNotEmpty && bytes.length <= 52428800);
    return bytes;
  }
}

class ManualSamplePage extends StatelessWidget {
  const ManualSamplePage({super.key, required this.requestId});
  final String requestId;
  @override
  Widget build(BuildContext context) => ProductionGate(
      returnRoute: '/production/manual-sample?requestId=$requestId',
      builder: (s) => _ManualSample(session: s, requestId: requestId));
}

class _ManualSample extends StatefulWidget {
  const _ManualSample({required this.session, required this.requestId});
  final AccountSession session;
  final String requestId;
  @override
  State<_ManualSample> createState() => _ManualSampleState();
}

class _ManualSampleState extends State<_ManualSample> {
  late final api = ManualSampleApi(widget.session, widget.requestId);
  ManualSample? snapshot;
  bool busy = false, reviewed = false, conflict = false;
  String? error, notice;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      snapshot = null;
      reviewed = false;
      error = null;
    });
    try {
      final result = await api.read();
      if (mounted) setState(() => snapshot = result);
    } on AccountError catch (e) {
      if (mounted) setState(() => error = productionError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> confirm() async {
    final s = snapshot;
    if (s == null || busy) return;
    if (!await tradeConfirm(
        context, api.pending == null ? '本人确认这版人工样片约定' : '恢复原本人确认', [
      tradeFact('具体真人', s.cast['person_id']),
      tradeFact('具体数字人', s.cast['avatar_id']),
      SelectableText(s.data['terms']),
      const Text('仅确认这版明确授权的人工样片委托，不开放长期模型或额外商业使用。')
    ])) {
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await api.confirm(s);
      if (mounted) await load();
    } on AccountError catch (e) {
      if (mounted) {
        if (e.status == 412) {
          conflict = true;
          await load();
        }
        if (mounted) setState(() => error = productionError(e, writing: true));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> download(String projectId) async {
    setState(() {
      busy = true;
      error = null;
    });
    final epoch = widget.session.epoch, party = api.production.participant();
    try {
      final bytes = await api.content(projectId);
      api.production.check(epoch, party);
      if (!mounted) return;
      final saved =
          await FilePicker.saveFile(fileName: '$projectId.mp4', bytes: bytes);
      api.production.check(epoch, party);
      if (mounted) {
        setState(() => notice = kIsWeb
            ? '本次获准的本人样片已交给浏览器保存。'
            : saved == null
                ? '已取消保存。'
                : '本人样片已保存。');
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = productionError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = snapshot, original = api.pending;
    final self = s != null &&
        s.data['rights_owner_party_id'] == widget.session.partyId &&
        widget.session.isOwner;
    return tradeScaffold(
        context,
        '人工样片本人约定',
        [
          tradeHeading('属于本人的样片', eyebrow: '已绑定委托 / 本人明确确认'),
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!, icon: Icons.error_outline),
          if (notice != null) appNotice(notice!),
          if (s != null) ...[
            tradeSection('具体权利与委托', [
              tradeFact('权利所属本人', s.data['rights_owner_party_id']),
              tradeFact('委托方', s.data['commissioner_party_id']),
              tradeFact('平台制作方', s.data['merchant_party_id']),
              tradeFact('具体真人', s.cast['person_id']),
              tradeFact('具体数字人', s.cast['avatar_id']),
              tradeFact('用途地区', s.data['territory']),
              SelectableText(s.data['terms'],
                  style: const TextStyle(height: 1.7)),
              appNotice('所有权仍归艺人本人。只有已绑定快照并经本人明确确认，才可形成此类样片订单；不通过普通私人定制表单补造。')
            ]),
            tradeSection('本人确认', [
              tradeFact('当前状态',
                  s.data['confirmation'] == null ? '本人尚未确认' : '本版本人确认已记录'),
              if (self && s.data['confirmation'] == null ||
                  original != null) ...[
                if (conflict) appNotice('快照已有更新。已重新读取，请核对当前约定后再确认。'),
                CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: reviewed,
                    title: const Text('我已核对本版具体真人、数字人和委托条款'),
                    onChanged: busy || original != null
                        ? null
                        : (v) => setState(() => reviewed = v == true)),
                tradeButton(original != null ? '恢复原本人确认核对' : '本人确认这版委托',
                    busy || original == null && !reviewed ? null : confirm),
              ],
            ]),
            tradeSection('已关联制作', [
              if (s.projects.isEmpty) appNotice('尚无已关联制作项目。本人确认不是已付款或已交付。'),
              for (final p in s.projects) ...[
                tradeFact('项目 ${shortSupplyId(p['id'])}',
                    productionStatuses[p['current_status']] ?? '待修改'),
                if (self)
                  tradeButton('核验并读取本人样片',
                      busy || original != null ? null : () => download(p['id']),
                      outline: true)
                else
                  tradeButton(
                      '查看原项目进度',
                      busy || original != null
                          ? null
                          : () => Navigator.pushNamed(context,
                              '/production/project?projectId=${p['id']}'),
                      outline: true),
              ],
              appNotice(
                  '50/50两期以原订单为准，无中间补款。本人样片仅在成片已确认且实际付清后开放；每次明确读取都会重新核验，付款和预加载都不冒充交付。'),
            ]),
          ],
          tradeButton('重新读取这版专用约定', busy || original != null ? null : load,
              outline: true),
        ],
        locked: busy || original != null);
  }
}
