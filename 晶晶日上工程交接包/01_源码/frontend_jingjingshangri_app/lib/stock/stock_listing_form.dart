import '../rights/rights_models.dart';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../artists/artists_api.dart';
import '../artists/artists_models.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../trade/trade_widgets.dart';
import 'stock_api.dart';
import 'stock_models.dart';
import 'v5_support.dart';

class StockListingForm extends StatefulWidget {
  const StockListingForm({super.key, required this.session, this.revisionId});
  final AccountSession session;
  final String? revisionId;
  @override
  State<StockListingForm> createState() => _StockListingFormState();
}

class _StockListingFormState extends State<StockListingForm> {
  late final api = StockApi(widget.session),
      artists = ArtistsApi(widget.session);
  final people = <ArtistPerson>[];
  GlobalKey<V5FormState> formKey = GlobalKey<V5FormState>();
  final personSelector = GlobalKey<FormFieldState<String>>();
  final countSelector = GlobalKey<FormFieldState<int>>();
  final publications = <String, Map<String, dynamic>>{};
  StockListing? previous;
  String get suffix => widget.revisionId == null
      ? '/listings'
      : '/listings/${widget.revisionId}/revisions';
  final rules = <String, String>{},
      participants = <String, Map<String, dynamic>>{},
      participantNames = <String, String>{};
  String? error, personId;
  int? count;
  bool busy = false, permitted = false;
  ArtistDetail? person;
  final eligibility = <String, StockEligibility>{};
  final eligibilityErrors = <String, String>{};
  int request = 0;
  late int epoch;
  bool current(int ticket, int captured) =>
      mounted && request == ticket && widget.session.epoch == captured;
  void identityChanged() {
    if (epoch == widget.session.epoch) return;
    epoch = widget.session.epoch;
    request++;
    setState(() {
      people.clear();
      publications.clear();
      participants.clear();
      participantNames.clear();
      rules.clear();
      eligibility.clear();
      eligibilityErrors.clear();
      person = null;
      personId = null;
      previous = null;
      count = null;
      permitted = false;
      busy = false;
      error = null;
      formKey = GlobalKey<V5FormState>();
    });
    load();
  }

  @override
  void dispose() {
    request++;
    widget.session.removeListener(identityChanged);
    api.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    epoch = widget.session.epoch;
    widget.session.addListener(identityChanged);
    load();
  }

  Future<void> load() async {
    final ticket = ++request, captured = widget.session.epoch;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      people.clear();
      publications.clear();
      participants.clear();
      participantNames.clear();
      rules.clear();
      String? cursor;
      final seen = <String>{};
      do {
        final r = await artists.people(cursor: cursor);
        if (!current(ticket, captured)) return;
        people.addAll(r.items);
        cursor = r.cursor;
        if (cursor != null) v5Require(seen.add(cursor));
      } while (cursor != null);
      for (final r in await api.salesPublications()) {
        if (!current(ticket, captured)) return;
        v5Require(v5Id(r['id']) &&
            v5Id(r['spec_id']) &&
            v5Id(r['rule_id']) &&
            r['terms'] is String);
        publications[r['id']] = r;
        rules[r['id']] =
            '${r['spec_title']} · ${v5Money(r['unit_minor'])} · ${r['title']}（${r['rule_version']}）';
      }
      if (widget.revisionId != null) {
        final record = await api.listing(widget.revisionId!);
        if (!current(ticket, captured)) return;
        previous = record;
        count = (previous!.data['participants'] as List).length;
        personId = previous!.data['seller_person_id'];
        await _person(personId!, ticket, captured);
      }
      final op = api.pending(suffix);
      if (op != null) {
        final b = v5Map(op['body']);
        count = (b['participants'] as List).length;
        personId = b['seller_person_id'];
        await _person(personId!, ticket, captured);
      }
      if (current(ticket, captured)) setState(() {});
    } on AccountError catch (e) {
      if (current(ticket, captured)) setState(() => error = v5Error(e));
    } finally {
      if (current(ticket, captured)) setState(() => busy = false);
    }
  }

  String _participantKey(Map<String, dynamic> p) =>
      '${p['person_id']}:${p['avatar_id']}:${p['consent_id']}';
  Future<void> _person(String id, int ticket, int captured) async {
    final d = await artists.person(id);
    final actions = await artists.actions(d);
    if (!current(ticket, captured)) return;
    person = d;
    permitted = actions.contains('SUBMIT_LISTING');
    eligibility.clear();
    eligibilityErrors.clear();
    participants.clear();
    participantNames.clear();
    // After a seller is selected, check each available person separately; no institution-wide approval.
    for (final p in people.toList()) {
      try {
        final status = await api.sellerEligibility(p.id);
        if (!current(ticket, captured)) return;
        eligibility[p.id] = status;
        if (!status.eligible) continue;
        final choices = await api.participantOptions(p.id);
        if (!current(ticket, captured)) return;
        for (final c in choices) {
          v5Require(
              c['person_id'] == p.id && c['seller_party_id'] == api.owner());
          final value = {
            'person_id': c['person_id'],
            'avatar_id': c['avatar_id'],
            'consent_id': c['consent_id']
          };
          v5Require(v5Id(value['avatar_id']) && v5Id(value['consent_id']));
          final key = _participantKey(value);
          participants[key] = value;
          participantNames[key] =
              '${c['person_name']} · ${c['avatar_name']} · ${(c['stock_commercial_uses'] as List? ?? []).map((v) => commercialUses[v] ?? v).join('、').isEmpty ? '未列明商用许可' : (c['stock_commercial_uses'] as List).map((v) => commercialUses[v] ?? v).join('、')} · ${(c['territories'] as List? ?? []).join('、')} · ${c['valid_from']} 至 ${c['valid_until']}';
        }
      } on AccountError catch (e) {
        if (!current(ticket, captured)) return;
        eligibility.remove(p.id);
        eligibilityErrors[p.id] = v5Error(e);
      }
    }
  }

  Future<void> refreshEligibility() async {
    final id = personId;
    if (busy || id == null) return;
    final ticket = ++request, captured = widget.session.epoch;
    setState(() {
      busy = true;
      eligibility.clear();
      eligibilityErrors.clear();
      error = null;
    });
    try {
      await _person(id, ticket, captured);
    } on AccountError catch (e) {
      if (current(ticket, captured)) setState(() => error = v5Error(e));
    } finally {
      if (current(ticket, captured)) setState(() => busy = false);
    }
  }

  Future<void> recheck(Map<String, dynamic> body) async {
    final captured = widget.session.epoch,
        party = api.owner(),
        ticket = request;
    final ids = {
      body['seller_person_id'] as String,
      for (final p in body['participants'] as List) p['person_id'] as String
    };
    for (final id in ids) {
      setState(() => eligibility.remove(id));
      final status = await api.sellerEligibility(id);
      api.check(captured, party);
      if (!current(ticket, captured)) {
        throw const AccountError(0, 'CONTEXT_CHANGED');
      }
      setState(() => eligibility[id] = status);
      if (!status.eligible) {
        throw AccountError(
            409, (status.data['blocking_reasons'] as List).first as String);
      }
    }
  }

  Future<void> choose(String id) async {
    if (id == personId) return;
    final discard = await (formKey.currentState?.confirmDiscardChanges() ??
        Future.value(true));
    if (!mounted) return;
    if (!discard) {
      personSelector.currentState?.didChange(personId);
      return;
    }
    final ticket = ++request, captured = widget.session.epoch;
    setState(() {
      busy = true;
      error = null;
      eligibility.clear();
      eligibilityErrors.clear();
      participants.clear();
      participantNames.clear();
      permitted = false;
      personId = id;
      person = null;
      count = null;
      formKey = GlobalKey<V5FormState>();
    });
    try {
      await _person(id, ticket, captured);
      if (current(ticket, captured)) setState(() {});
    } on AccountError catch (e) {
      if (current(ticket, captured)) setState(() => error = v5Error(e));
    } finally {
      if (current(ticket, captured)) setState(() => busy = false);
    }
  }

  Future<void> chooseCount(int? value) async {
    if (value == count) return;
    final discard = await (formKey.currentState?.confirmDiscardChanges() ??
        Future.value(true));
    if (!mounted) return;
    if (!discard) {
      countSelector.currentState?.didChange(count);
      return;
    }
    setState(() {
      count = value;
      formKey = GlobalKey<V5FormState>();
    });
  }

  Map<String, dynamic> restore(Map<String, dynamic> b) => {
        ...b,
        'publication_id': publications.entries
            .where((e) =>
                (b['sales_publication_id'] == null ||
                    e.key == b['sales_publication_id']) &&
                e.value['spec_id'] == b['spec_id'] &&
                e.value['rule_id'] == b['rule_id'])
            .map((e) => e.key)
            .firstOrNull,
        'rights_evidence_ids': (b['rights_evidence_ids'] as List).join(', '),
        for (var i = 0; i < (b['participants'] as List).length; i++)
          'participant_$i': _participantKey(v5Map(b['participants'][i]))
      };
  @override
  Widget build(BuildContext context) {
    final d = person;
    return V5Frame(api: api, title: '现成作品上架', children: [
      tradeHeading('让完成的作品被看见', eyebrow: '具体艺人 / 本版明确许可'),
      V5RecoveryPanel(
          api: api,
          label: api.recoveryLabel,
          restore: api.restoreOperation,
          onRestored: (r) => Navigator.pushReplacementNamed(
              context,
              r['kind'] == 'ORDER'
                  ? '/trade/record?recordId=${r['id']}'
                  : r['order_id'] != null
                      ? '/stock/purchase?orderId=${r['order_id']}'
                      : '/stock/listing?listingId=${r['id']}')),
      appNotice('先选商品与本版销售说明，再逐人选择当前身份获准使用的形象。提交时重新核对价格、资格与授权。'),
      if (previous != null) appNotice('本次另存新版本并重新双审；原订单的许可和已购文件保留。'),
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!),
      if (!busy && (error != null || people.isEmpty)) ...[
        if (error == null) appNotice('当前身份还没有可办理的真人档案。先完善本人资料，或切换到获准经营该人物的身份。'),
        tradeButton('重新读取本人资格与商品', load, outline: true),
        tradeButton('查看人物与授权', () => Navigator.pushNamed(context, '/artists'),
            outline: true),
      ],
      DropdownButtonFormField<String>(
          key: personSelector,
          initialValue: personId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: '卖方具体真人'),
          items: people
              .map((p) => DropdownMenuItem(value: p.id, child: Text(p.name)))
              .toList(),
          onChanged:
              busy || api.pending(suffix) != null ? null : (v) => choose(v!)),
      if (d != null) ...[
        appNotice('卖方和每位出镜人分别需要有效实名、L1及主角光环人工审核。缴费、待审或补件不等于通过；内容及授权另行审核。'),
        for (final p in people)
          tradeFact(
              p.id == personId ? '卖方：${p.name}' : '可选出镜人：${p.name}',
              eligibility[p.id]?.summary ??
                  eligibilityErrors[p.id] ??
                  '尚未核对当前资格'),
        if (!permitted) appNotice('当前身份尚无这位真人的明确上架委托。'),
        tradeButton('重新核对上架资格', busy ? null : refreshEligibility,
            outline: true),
        tradeButton('查看人物与认证', () => Navigator.pushNamed(context, '/artists'),
            outline: true),
        DropdownButtonFormField<int>(
            key: countSelector,
            initialValue: count,
            isExpanded: true,
            decoration: const InputDecoration(labelText: '本作品可识别出镜人数'),
            items: [
              for (var i = 0; i <= 20; i++)
                DropdownMenuItem(
                    value: i, child: Text(i == 0 ? '无可识别人物' : '$i 位（逐人选择已审授权）'))
            ],
            onChanged: api.pending(suffix) != null ? null : chooseCount),
        if (rules.isEmpty) appNotice('尚无已发布的商品与销售说明，请平台先完成规格绑定和独立审核，再返回刷新。'),
        if (count != null)
          V5Form(
              key: formKey,
              api: api,
              title: '本版上架材料',
              action: '提交内容与权利双审核',
              suffix: suffix,
              version: previous?.version,
              initial: previous == null ? const {} : restore(previous!.data),
              reload: previous == null
                  ? null
                  : () async {
                      previous = await api.listing(widget.revisionId!);
                      return previous!.version;
                    },
              beforeSubmit: recheck,
              canSubmit: !busy &&
                  permitted &&
                  eligibility[personId]?.eligible == true &&
                  rules.isNotEmpty &&
                  (count == 0 || participants.isNotEmpty),
              restore: restore,
              fields: [
                V5Field('publication_id', '商品价格与已审核销售说明', choices: rules),
                const V5Field('city', '城市'),
                const V5Field('description', '作品内容与范围', type: 'multiline'),
                for (var i = 0; i < count!; i++)
                  V5Field('participant_$i', '第 ${i + 1} 位出镜人的已审授权',
                      choices: participantNames),
                const V5Field('payment_window_minutes', '原约定付款窗口（分钟）',
                    type: 'int'),
                const V5Field('apple_product_id', '已审 Apple 产品编号',
                    required: false, hint: '未接通时留空。'),
              ],
              buildBody: (v) {
                final cast = [
                  for (var i = 0; i < count!; i++)
                    participants[v['participant_$i']]
                ];
                if (cast.any((p) => p == null) ||
                    cast.map((p) => p!['person_id']).toSet().length !=
                        cast.length) {
                  throw const AccountError(400, 'DUPLICATE_STOCK_PERSON');
                }
                if (eligibility[d.person.id]?.eligible != true ||
                    cast.any((p) =>
                        eligibility[p!['person_id']]?.eligible != true)) {
                  throw const AccountError(409, 'STOCK_HALO_REVIEW_REQUIRED');
                }
                final full = '${v['file_id'] ?? ''}',
                    preview = '${v['preview_file_id'] ?? ''}';
                api.key(full);
                api.key(preview);
                if (full == preview) {
                  throw const AccountError(
                      400, 'STOCK_SEPARATE_PREVIEW_REQUIRED');
                }
                final publication = publications[v['publication_id']];
                if (publication == null) {
                  throw const AccountError(
                      409, 'STOCK_SALES_RULE_NOT_PUBLISHED');
                }
                return {
                  'seller_person_id': d.person.id,
                  'sales_publication_id': publication['id'],
                  'spec_id': publication['spec_id'],
                  'rule_id': publication['rule_id'],
                  'city': v['city'],
                  'description': v['description'],
                  'file_id': full,
                  'preview_file_id': preview,
                  'participants': cast,
                  'rights_evidence_ids':
                      v5InputIds(v['rights_evidence_ids'] ?? ''),
                  'qualification': {
                    'minimum_halo_level': 2,
                    'source_ref': 'CONTRACT_20261029_19_ART5_23_SEC1'
                  },
                  'payment_window_minutes':
                      v5InputInt(v['payment_window_minutes'], max: 10080),
                  'apple_product_id':
                      '${v['apple_product_id'] ?? ''}'.trim().isEmpty
                          ? null
                          : v['apple_product_id']
                };
              },
              parse: (r) {
                StockListing(r, api.owner());
              },
              onSuccess: (r) => Navigator.pushReplacementNamed(
                  context, '/stock/listing?listingId=${r['id']}'),
              extra: (v, set, enabled) => [
                    if (publications[v['publication_id']] != null)
                      appNotice(publications[v['publication_id']]!['terms']),
                    tradeFact('已选正式文件',
                        v['file_id'] == null ? '尚未上传或选择' : '本次已上传的私有正式文件'),
                    tradeFact(
                        '已选独立预览',
                        v['preview_file_id'] == null
                            ? '尚未上传或选择'
                            : '本次已上传的独立预览'),
                    _StockUpload(
                        api: api,
                        enabled: enabled,
                        onUploaded: (id, role) => set(role, id)),
                    tradeSection('权利证据（私有）', [
                      SupplyFiles(
                          api: SupplyApi(widget.session),
                          purpose: 'RIGHTS_EVIDENCE',
                          acceptedPurposes: const {
                            'RIGHTS_EVIDENCE',
                            'CONSENT_EVIDENCE'
                          },
                          ids: v5InputIds(v['rights_evidence_ids'] ?? ''),
                          enabled: enabled,
                          onChanged: (ids) =>
                              set('rights_evidence_ids', ids.join(', ')))
                    ]),
                  ]),
      ],
    ]);
  }
}

class _StockUpload extends StatefulWidget {
  const _StockUpload(
      {required this.api, required this.onUploaded, required this.enabled});
  final StockApi api;
  final void Function(String, String) onUploaded;
  final bool enabled;
  @override
  State<_StockUpload> createState() => _StockUploadState();
}

class _StockUploadState extends State<_StockUpload> {
  Map<String, dynamic>? uploaded;
  String? error;
  bool busy = false;
  Future<void> upload() async {
    final epoch = widget.api.session.epoch, party = widget.api.owner();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final op = widget.api.pending('/files');
      Uint8List bytes;
      if (op != null) {
        bytes = op['bytes'] as Uint8List;
      } else {
        FocusManager.instance.primaryFocus?.unfocus();
        await WidgetsBinding.instance.endOfFrame;
        final chosen = await FilePicker.pickFiles(
            type: FileType.custom,
            allowedExtensions: const ['mp4'],
            withReadStream: true,
            withData: false);
        widget.api.check(epoch, party);
        if (chosen == null) return;
        final f = chosen.files.single;
        if (f.extension?.toLowerCase() != 'mp4' ||
            f.size < 1 ||
            f.size > 50 * 1024 * 1024) {
          throw const AccountError(413, 'FILE_TOO_LARGE');
        }
        final b = BytesBuilder(copy: false);
        if (f.readStream != null) {
          await for (final chunk in f.readStream!) {
            if (b.length + chunk.length > 50 * 1024 * 1024) {
              throw const AccountError(413, 'FILE_TOO_LARGE');
            }
            b.add(chunk);
          }
        } else if (f.bytes != null) {
          b.add(f.bytes!);
        }
        v5Require(b.length == f.size);
        bytes = b.takeBytes();
      }
      final r = await widget.api.upload(bytes, retry: op != null);
      widget.api.check(epoch, party);
      if (!mounted) return;
      setState(() => uploaded = r);
    } on AccountError catch (e) {
      if (mounted) {
        setState(() =>
            error = v5Error(e, writing: widget.api.pending('/files') != null));
      }
    } catch (_) {
      if (mounted) setState(() => error = '文件选择或上传未完成，请核对 MP4 文件后重试。');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => tradeSection('分别上传正式与预览视频', [
        appNotice('MP4 当前技术上限 50 MiB。这里不自动生成水印或 AI 标识，须提交实际已处理文件供审核。'),
        if (error != null) appNotice(error!),
        tradeButton(
            widget.api.pending('/files') == null ? '上传一个私有 MP4' : '恢复原视频上传核对',
            busy || !widget.enabled && widget.api.pending('/files') == null
                ? null
                : upload,
            outline: true),
        if (uploaded != null) ...[
          tradeFact('已上传文件', uploaded!['id']),
          tradeButton(
              '将此文件设为正式文件',
              widget.enabled
                  ? () => widget.onUploaded(uploaded!['id'], 'file_id')
                  : null,
              outline: true),
          tradeButton(
              '将此文件设为独立预览',
              widget.enabled
                  ? () => widget.onUploaded(uploaded!['id'], 'preview_file_id')
                  : null,
              outline: true)
        ],
      ]);
}
