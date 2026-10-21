import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../contracts/contract_text.dart';
import '../gigs/gig_api.dart';
import '../gigs/gig_models.dart';
import '../supply/supply_widgets.dart' show shortSupplyId;
import '../trade/trade_widgets.dart';
import 'artists_api.dart';
import 'artists_files.dart';
import 'artists_models.dart';
import 'artists_widgets.dart';

const _titles = {
  'PERSON': '建立本人真人档案',
  'AVATAR': '建立数字人档案',
  'IDENTITY': '核对实名服务结果',
  'CONSENT': '明确这次本人同意',
  'DELEGATION': '本人确认机构委托',
  'VARIANT': '保存造型与声音版本',
  'HALO': '申请认证',
  'LISTING': '申请公开展示',
  'SERVICE': '选择创建与托管服务',
  'SUPPLEMENT': '补齐原申请材料',
  'APPEAL': '对原裁决提交异议',
  'WITHDRAW': '撤回本份同意或委托',
  'CANCEL': '取消本服务请求',
  'REMINDER': '设置续托管提醒',
  'SYNC': '核对服务与原订单',
};

class ArtistFormPage extends StatelessWidget {
  const ArtistFormPage(
      {super.key,
      required this.mode,
      this.personId,
      this.avatarId,
      this.recordId});
  final String mode;
  final String? personId, avatarId, recordId;
  @override
  Widget build(BuildContext c) => ArtistsGate(
      builder: (s) => _ArtistForm(
          session: s,
          mode: mode,
          personId: personId,
          avatarId: avatarId,
          recordId: recordId));
}

class _ArtistForm extends StatefulWidget {
  const _ArtistForm(
      {required this.session,
      required this.mode,
      this.personId,
      this.avatarId,
      this.recordId});
  final AccountSession session;
  final String mode;
  final String? personId, avatarId, recordId;
  @override
  State<_ArtistForm> createState() => _ArtistFormState();
}

class _ArtistFormState extends State<_ArtistForm> {
  late final api = ArtistsApi(widget.session);
  final fields = <String, TextEditingController>{};
  ArtistDetail? detail;
  ArtistRecord? record, latest;
  ArtistServices? services;
  Set<String> actions = {};
  final consents = <ArtistRecord>[],
      looks = <ArtistRecord>[],
      voices = <ArtistRecord>[],
      serviceRecords = <ArtistRecord>[],
      relations = <GigRecord>[];
  final features = <String>{}, purposes = <String>{}, delegated = <String>{};
  List<String> files = [];
  String? avatar,
      consent,
      previous,
      look,
      voice,
      offer,
      relation,
      serviceId,
      error,
      notice;
  String variantKind = 'LOOK';
  int halo = 1;
  bool busy = true,
      fileBusy = false,
      dirty = false,
      promise = false,
      reminder = false,
      audition = false,
      conflict = false;
  String get mode => widget.mode;
  bool get self => detail?.person.owner == widget.session.partyId;
  bool get personal => widget.session.party?['kind'] == 'PERSON';
  bool get operational => [
        'SUPPLEMENT',
        'APPEAL',
        'WITHDRAW',
        'CANCEL',
        'REMINDER',
        'SYNC'
      ].contains(mode);
  bool get versioned =>
      ['SUPPLEMENT', 'WITHDRAW', 'CANCEL', 'REMINDER'].contains(mode);
  String get path {
    if (mode == 'PERSON') return '${ArtistsApi.base}/people';
    final p = api.personPath(widget.personId ?? '');
    if (operational) {
      final type = ['CANCEL', 'REMINDER', 'SYNC'].contains(mode)
          ? 'services'
          : 'records';
      final suffix = {
        'SUPPLEMENT': 'supplements',
        'APPEAL': 'appeals',
        'WITHDRAW': 'withdrawals',
        'CANCEL': 'cancel',
        'REMINDER': 'reminder',
        'SYNC': 'sync'
      }[mode];
      return '$p/$type/${widget.recordId}/$suffix';
    }
    return '$p/${{
      'AVATAR': 'avatars',
      'IDENTITY': 'identity',
      'CONSENT': 'consents',
      'DELEGATION': 'delegations',
      'VARIANT': 'variants',
      'HALO': 'halos',
      'LISTING': 'listings',
      'SERVICE': 'services'
    }[mode]}';
  }

  String get purpose => ['VARIANT', 'LISTING'].contains(mode)
      ? 'AVATAR_MATERIAL'
      : ['CONSENT', 'DELEGATION'].contains(mode)
          ? 'CONSENT_EVIDENCE'
          : 'REVIEW_EVIDENCE';
  Map<String, dynamic>? get pending =>
      _titles.containsKey(mode) ? api.pending(path) : null;
  bool get unresolvedFile =>
      detail != null &&
      api.pending('${api.personPath(detail!.person.id)}/assets') != null;
  bool get locked => busy || fileBusy || pending != null || unresolvedFile;
  bool get enabled => !locked && !conflict && allowed;
  bool get allowed {
    if (!_titles.containsKey(mode)) return false;
    if (mode == 'PERSON') return personal;
    if (detail == null) return false;
    if ([
          'IDENTITY',
          'CONSENT',
          'DELEGATION',
          'HALO',
          'SERVICE',
          ...['SUPPLEMENT', 'APPEAL', 'WITHDRAW', 'CANCEL', 'REMINDER', 'SYNC']
        ].contains(mode) &&
        !self) {
      return false;
    }
    if (['AVATAR', 'VARIANT'].contains(mode) &&
        !actions.contains('MANAGE_AVATARS')) {
      return false;
    }
    if (mode == 'LISTING' && !actions.contains('SUBMIT_LISTING')) return false;
    if ([
          'AVATAR',
          'CONSENT',
          'DELEGATION',
          'VARIANT',
          'HALO',
          'LISTING',
          'SERVICE',
          'SUPPLEMENT'
        ].contains(mode) &&
        !detail!.person.adultVerified) {
      return false;
    }
    if (mode == 'IDENTITY' &&
        (services?.raw['identity']['current_status'] != 'SERVICE_READY' ||
            detail!.person.raw['age_band'] == 'MINOR')) {
      return false;
    }
    if (mode == 'SUPPLEMENT' && record?.canSupplement != true) return false;
    if (mode == 'APPEAL' && record?.canAppeal != true) return false;
    if (mode == 'WITHDRAW' && record?.canWithdraw != true) return false;
    if (mode == 'REMINDER' && record?.data['kind'] != 'AVATAR_HOSTING') {
      return false;
    }
    if (mode == 'CANCEL' &&
        (record == null ||
            ['DELIVERED', 'REFUNDED', 'CANCELLED'].contains(record!.status))) {
      return false;
    }
    return true;
  }

  TextEditingController controller(String key) =>
      fields.putIfAbsent(key, () => TextEditingController());
  @override
  void initState() {
    super.initState();
    avatar = widget.avatarId;
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
    try {
      if (!_titles.containsKey(mode)) {
        throw const AccountError(400, 'INVALID_KIND');
      }
      if (mode != 'PERSON') {
        final d = await api.person(widget.personId ?? ''),
            a = await api.actions(d);
        detail = d;
        actions = a;
        if (widget.avatarId != null) {
          artistRequire(d.avatars.any((v) => v.id == widget.avatarId));
        }
        if (operational) {
          record = await api.record(d.person.id, widget.recordId ?? '',
              service: ['CANCEL', 'REMINDER', 'SYNC'].contains(mode));
          reminder = record!.data['renewal_reminder'] == true;
        }
        if (['IDENTITY', 'SERVICE'].contains(mode)) {
          services = await api.services();
        }
        if (['VARIANT', 'LISTING'].contains(mode)) {
          looks.addAll(await api.allRecords(d.person.id, 'LOOK'));
          voices.addAll(await api.allRecords(d.person.id, 'VOICE'));
          if (self) {
            consents.addAll(await api.allRecords(d.person.id, 'CONSENT'));
          }
        }
        if (mode == 'HALO') {
          serviceRecords.addAll(await api.allRecords(d.person.id, 'SERVICE'));
        }
        if (mode == 'DELEGATION') {
          final now = DateTime.now();
          relations.addAll((await GigApi(widget.session).all('RELATION')).where(
              (r) =>
                  r.status == 'ACTIVE' &&
                  r.counterparty == d.person.owner &&
                  DateTime.tryParse(r.data['valid_from'] ?? '')?.isAfter(now) ==
                      false &&
                  DateTime.tryParse(r.data['valid_until'] ?? '')
                          ?.isAfter(now) ==
                      true));
        }
        if (mounted) {
          controller('grantee').text = d.person.owner;
        }
      }
    } on AccountError catch (e) {
      error = artistError(e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void change(VoidCallback fn) => setState(() {
        fn();
        dirty = true;
        notice = null;
      });
  String input(String key, String label, {bool required = true}) {
    final v = controller(key).text.trim();
    if (required && v.isEmpty) throw FormatException('请填写$label。');
    return v;
  }

  String idInput(String key, String label) {
    final v = input(key, label);
    if (!artistId(v)) throw FormatException('请核对$label的有效编号。');
    return v;
  }

  String instant(String key, String label) {
    final d = DateTime.tryParse(input(key, label));
    if (d == null) throw FormatException('请填写有效的$label，格式如2026-10-21 09:00。');
    return d.toUtc().toIso8601String();
  }

  List<String> parts(String key, String label, {bool ids = false}) {
    final v = input(key, label)
        .split(RegExp(r'[,，\n]'))
        .map((x) => x.trim())
        .where((x) => x.isNotEmpty)
        .toSet()
        .toList();
    if (v.isEmpty || ids && v.any((x) => !artistId(x))) {
      throw FormatException('请核对$label。');
    }
    return v;
  }

  String chosen(String? v, String label) {
    if (v == null || v.isEmpty) throw FormatException('请选择$label。');
    return v;
  }

  List<String> get materialFiles => actions.contains('MANAGE_MATERIALS') || self
      ? files
      : parts('existingMaterials', '本人已提供的材料编号', ids: true);
  Map<String, dynamic> period() {
    final from = instant('from', '开始时间'), until = instant('until', '截止时间');
    if (from.compareTo(until) >= 0) {
      throw const FormatException('截止时间必须晚于开始时间。');
    }
    return {'valid_from': from, 'valid_until': until};
  }

  Map<String, dynamic> body() {
    final a = avatar;
    Map<String, dynamic> value;
    switch (mode) {
      case 'PERSON':
      case 'AVATAR':
        value = {'display_name': input('name', '名称')};
        break;
      case 'IDENTITY':
        value = {'session_ref': input('session', '实名服务会话引用')};
        break;
      case 'CONSENT':
        if (features.isEmpty ||
            purposes.isEmpty ||
            purposes.length > 4 ||
            files.isEmpty ||
            purposes.contains('LONG_LIVED_MODEL')) {
          throw const FormatException('请明确形象或声音、最多四项用途，并上传本人同意证据。');
        }
        value = {
          'avatar_id': chosen(a, '具体数字人'),
          'consent': {
            'features': features.toList(),
            'purposes': purposes.toList(),
            'grantee_party_id': idInput('grantee', '使用方主体'),
            'territories': parts('territories', '适用地区'),
            ...period(),
            'terms': input('terms', '本人同意条款'),
            'evidence_asset_ids': files
          }
        };
        break;
      case 'DELEGATION':
        final r = relations.where((r) => r.id == relation).firstOrNull;
        if (r == null || delegated.isEmpty || files.isEmpty) {
          throw const FormatException('请选择已接受的合作关系、委托事项，并上传委托证据。');
        }
        value = {
          'delegation': {
            'organization_party_id': r.owner,
            'relation_id': r.id,
            'actions': delegated.toList(),
            ...period(),
            'evidence_asset_ids': files,
            'terms': input('terms', '委托约定')
          }
        };
        break;
      case 'VARIANT':
        final materials = materialFiles;
        if (materials.isEmpty) throw const FormatException('请提供本版的私人材料。');
        value = {
          'avatar_id': chosen(a, '具体数字人'),
          'kind': variantKind,
          'variant': {
            'previous_version_id': previous,
            'display_name': input('name', '版本名称'),
            'material_asset_ids': materials,
            'consent_id': self
                ? chosen(consent, '有效本人同意')
                : idInput('consent', '本人提供的同意记录')
          }
        };
        break;
      case 'HALO':
        if (!promise || files.isEmpty) {
          throw const FormatException('请确认本人权属承诺，并上传认证材料。');
        }
        value = {
          'level': halo,
          'ownership_promise': true,
          'evidence_asset_ids': files,
          if (halo == 2) 'service_id': chosen(serviceId, '同一笔L2审核服务')
        };
        break;
      case 'LISTING':
        final materials = materialFiles;
        if (materials.isEmpty) throw const FormatException('请选择最多六份指定公开预览。');
        if (materials.length > 6) throw const FormatException('公开预览最多六份。');
        value = {
          'avatar_id': chosen(a, '具体数字人'),
          'listing': {
            'display_name': input('name', '公开名称'),
            'city': input('city', '城市'),
            'introduction': input('intro', '公开介绍'),
            'tags': parts('tags', '标签'),
            'consent_id': self
                ? chosen(consent, '有效公开展示同意')
                : idInput('consent', '本人提供的公开展示同意'),
            'look_version_id': chosen(look, '造型版本'),
            'voice_version_id': voice,
            'audition_public': audition,
            'preview_asset_ids': materials
          }
        };
        break;
      case 'SERVICE':
        final o =
            services?.offers.where((r) => r['spec_id'] == offer).firstOrNull;
        if (o == null || o['specification']['service']['halo_level'] == 3) {
          throw const FormatException('请选择一项当前可用的已审服务。');
        }
        final kind = o['specification']['service']['kind'];
        value = {
          'avatar_id': kind == 'HALO_REVIEW' ? null : chosen(a, '具体数字人'),
          'spec_id': o['spec_id'],
          'renewal_reminder': kind == 'AVATAR_HOSTING' && reminder
        };
        break;
      case 'SUPPLEMENT':
        if (files.isEmpty) throw const FormatException('请上传补充材料。');
        value = {'evidence_asset_ids': files, 'note': input('reason', '补充说明')};
        break;
      case 'APPEAL':
        if (files.isEmpty) throw const FormatException('请上传异议证据。');
        value = {
          'evidence_asset_ids': files,
          'reason': input('reason', '异议原因')
        };
        break;
      case 'WITHDRAW':
      case 'CANCEL':
        value = {'reason': input('reason', '办理原因')};
        break;
      case 'REMINDER':
        value = {'enabled': reminder};
        break;
      case 'SYNC':
        value = {};
        break;
      default:
        throw const FormatException('这个办理入口不存在。');
    }
    return value;
  }

  bool get ready {
    try {
      body();
      return true;
    } on FormatException {
      return false;
    }
  }

  Future<void> submit({bool retry = false}) async {
    Map<String, dynamic> data;
    try {
      data = retry ? Map<String, dynamic>.from(pending!['body']) : body();
    } on FormatException catch (e) {
      setState(() => error = e.message);
      return;
    }
    final accepted =
        await tradeConfirm(context, retry ? '恢复上次艺人操作' : '确认这次办理内容', [
      if (detail != null) tradeFact('真人本人', detail!.person.name),
      tradeFact('办事身份', widget.session.party?['display_name']),
      const Text('本次仅提交所列事项，付款、审核批准、公开展示和长期模型分别核对。'),
      ExpansionTile(
          title: const Text('核对本次完整提交内容'),
          children: [ContractText(value: data)]),
    ]);
    if (!accepted || !mounted) return;
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      final result = retry
          ? await api.retry(path, person: detail?.person)
          : await api.post(path, data,
              version: versioned ? record?.version : null,
              person: detail?.person);
      if (!mounted) return;
      dirty = false;
      conflict = false;
      final route = mode == 'PERSON'
          ? artistPersonRoute(result['id'])
          : mode == 'AVATAR'
              ? artistPersonRoute(widget.personId!)
              : artistRecordRoute(widget.personId!, result['id']);
      Navigator.pushReplacementNamed(context, route);
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          error = artistError(e);
          if (e.status == 412) {
            conflict = true;
            latest = null;
          }
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> readCurrent() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final r = await api.record(widget.personId!, widget.recordId!,
          service: ['CANCEL', 'REMINDER', 'SYNC'].contains(mode));
      if (mounted) setState(() => latest = r);
    } on AccountError catch (e) {
      if (mounted) setState(() => error = artistError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<bool> leave() async {
    if (locked) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('操作或文件结果尚未确认，请先恢复原请求核对。')));
      return false;
    }
    return !dirty ||
        await tradeConfirm(context, '离开当前表单？',
            [const Text('尚未提交的输入与材料引用不会保存在这份申请中。返回后可以继续填写。')]);
  }

  Widget text(String key, String label,
          {int lines = 1, int max = 120, String? hint, bool required = true}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: TextField(
              key: ValueKey('artist-field-$key'),
              controller: controller(key),
              enabled: enabled,
              maxLength: max,
              minLines: lines,
              maxLines: lines + 3,
              decoration: InputDecoration(
                  labelText: '$label${required ? ' · 必填' : ''}',
                  hintText: hint),
              onChanged: (_) => change(() {})));
  Widget select(String label, String? value, List<(String, String)> options,
          ValueChanged<String?> update, {String? key}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: DropdownButtonFormField<String>(
              key: ValueKey(key ?? 'artist-select-$label-$value'),
              initialValue: options.any((o) => o.$1 == value) ? value : null,
              isExpanded: true,
              decoration: InputDecoration(labelText: label),
              items: options
                  .map((o) => DropdownMenuItem(
                      value: o.$1,
                      child: Text(o.$2, overflow: TextOverflow.ellipsis)))
                  .toList(),
              onChanged: enabled ? (v) => change(() => update(v)) : null));
  Widget choices(Map<String, String> names, Set<String> picked,
          {bool purpose = false}) =>
      Column(children: [
        for (final entry in names.entries)
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              title: Text(entry.value, style: const TextStyle(fontSize: 14)),
              value: picked.contains(entry.key),
              onChanged: !enabled ||
                      purpose && entry.key == 'LONG_LIVED_MODEL' ||
                      purpose &&
                          !picked.contains(entry.key) &&
                          picked.length >= 4
                  ? null
                  : (v) => change(() {
                        v == true
                            ? picked.add(entry.key)
                            : picked.remove(entry.key);
                      }))
      ]);
  Widget fileInput() => detail == null
      ? const SizedBox.shrink()
      : ArtistFiles(
          api: api,
          person: detail!.person,
          purpose: purpose,
          ids: files,
          enabled: !busy && pending == null && !conflict && allowed,
          onBusy: (b) {
            if (mounted) setState(() => fileBusy = b);
          },
          onChanged: (ids) => change(() => files = ids));
  Widget avatarInput() => select('具体数字人', avatar, [
        for (final a in detail?.avatars ?? <ArtistAvatar>[]) (a.id, a.name)
      ], (v) {
        avatar = v;
        previous = null;
        consent = null;
        look = null;
        voice = null;
      });
  List<ArtistRecord> get consentOptions => consents
      .where((r) =>
          r.status == 'APPROVED' &&
          r.avatarId == avatar &&
          (r.data['features'] as List).contains(
              mode == 'VARIANT' && variantKind == 'VOICE' ? 'VOICE' : 'FACE') &&
          (mode != 'LISTING' ||
              voice == null ||
              (r.data['features'] as List).contains('VOICE')) &&
          (r.data['purposes'] as List).contains(
              mode == 'LISTING' ? 'PUBLIC_DISPLAY' : 'PRIVATE_ARCHIVE') &&
          r.data['grantee_party_id'] == detail?.person.owner &&
          DateTime.parse(r.data['valid_from']).isBefore(DateTime.now()) &&
          DateTime.parse(r.data['valid_until']).isAfter(DateTime.now()))
      .toList();
  Widget consentInput() => self
      ? select(
          '本人已批准且有效的同意',
          consent,
          [
            for (final r in consentOptions)
              (
                r.id,
                '${shortSupplyId(r.id)} · ${artistNames(r.data['features'], artistFeatures)}'
              )
          ],
          (v) => consent = v)
      : text('consent', '本人提供的有效同意记录编号', max: 36);
  List<Widget> inputs() {
    switch (mode) {
      case 'PERSON':
        return [
          text('name', '本人档案显示名称'),
          appNotice('只能为当前账号本人建立真人档案。建档后仍需服务方核验，不能自行提交已实名结果。')
        ];
      case 'AVATAR':
        return [
          text('name', '数字人名称'),
          appNotice('这里只建立属于这位真人的数字人档案，不扣款，也不表示长期模型可用。')
        ];
      case 'IDENTITY':
        return [
          appNotice('请提供实名服务方当前会话引用。仅接收受信结果，不能自行选择“已实名”。'),
          text('session', '实名服务会话引用', max: 128)
        ];
      case 'CONSENT':
        return [
          avatarInput(),
          tradeSection('本次允许使用什么', [
            choices(artistFeatures, features),
            choices(artistPurposes, purposes, purpose: true)
          ]),
          text('grantee', '使用方主体编号', max: 36),
          text('territories', '适用地区', hint: '多个地区以逗号分隔', max: 2000),
          text('from', '开始时间', hint: '年-月-日 时:分', max: 30),
          text('until', '截止时间', hint: '年-月-日 时:分', max: 30),
          text('terms', '本人同意条款', lines: 3, max: 8000),
          tradeSection('本人同意证据', [fileInput()])
        ];
      case 'DELEGATION':
        return [
          appNotice('先接受MCN合作关系，再单独明确委托。本人同意、签署和佣金调整不属于代办事项。'),
          if (relations.isEmpty)
            appNotice('暂无已接受且有效的MCN合作关系，可先在“MCN直接合作”查看或办理。'),
          select(
              '已接受的机构合作关系',
              relation,
              [
                for (final r in relations)
                  (
                    r.id,
                    '机构 ${shortSupplyId(r.owner!)} · 关系 ${shortSupplyId(r.id)}'
                  )
              ],
              (v) => relation = v),
          tradeSection('逐项确认代办范围', [
            choices(artistActions, delegated),
            const Text('机构名单可见需要单独允许“查看艺人资料”。',
                style: TextStyle(fontSize: 12, color: AccountTheme.muted))
          ]),
          text('from', '委托开始时间', hint: '年-月-日 时:分', max: 30),
          text('until', '委托截止时间', hint: '不得超出已接受合作关系的期限', max: 30),
          text('terms', '委托约定', lines: 3, max: 8000),
          fileInput(),
        ];
      case 'VARIANT':
        return [
          avatarInput(),
          select(
              '版本类型', variantKind, const [('LOOK', '造型版本'), ('VOICE', '声音版本')],
              (v) {
            variantKind = v!;
            previous = null;
            consent = null;
          }),
          text('name', '版本名称'),
          select(
              '承接哪一版',
              previous ?? '',
              [
                ('', '首次记录，不承接旧版'),
                for (final r in (variantKind == 'LOOK' ? looks : voices)
                    .where((r) => r.avatarId == avatar))
                  (r.id, '${r.data['display_name']} · 第${r.data['revision']}版')
              ],
              (v) => previous = v == '' ? null : v),
          consentInput(),
          tradeSection('这一版私人材料', [
            if (self || actions.contains('MANAGE_MATERIALS'))
              fileInput()
            else
              text('existingMaterials', '本人已提供的材料编号',
                  lines: 2, max: 1500, hint: '多个材料编号以逗号分隔。当前委托未允许代传材料。')
          ]),
          appNotice('新版本保留前一版引用，不覆盖旧版本。档案记录不表示模型训练成功。')
        ];
      case 'HALO':
        return [
          select('申请认证等级', '$halo', const [('1', 'L1免费认证'), ('2', 'L2认证审核')],
              (v) => halo = int.parse(v!)),
          if (halo == 2)
            select(
                '沿用同一笔L2审核服务',
                serviceId,
                [
                  for (final r in serviceRecords.where((r) =>
                      r.data['kind'] == 'HALO_REVIEW' &&
                      r.data['specification']['service']['halo_level'] == 2 &&
                      r.status == 'READY'))
                    (
                      r.id,
                      '审核服务 ${shortSupplyId(r.id)} · ${artistMoney(r.data['price_minor'])}'
                    )
                ],
                (v) => serviceId = v),
          appNotice('L1免费。L2先核对已付款的同一笔审核服务；补件沿用原申请。L3尚不开放。'),
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: promise,
              onChanged:
                  enabled ? (v) => change(() => promise = v == true) : null,
              title: const Text('本人确认所交形象、声音与证据的权属，并接受人工审核')),
          fileInput(),
        ];
      case 'LISTING':
        return [
          avatarInput(),
          text('name', '公开名称'),
          text('city', '公开城市', max: 100),
          text('intro', '公开介绍', lines: 3, max: 2000),
          text('tags', '公开标签', hint: '多个标签以逗号分隔', max: 600),
          consentInput(),
          select(
              '已记录造型版本',
              look,
              [
                for (final r in looks.where((r) => r.avatarId == avatar))
                  (r.id, r.data['display_name'])
              ],
              (v) => look = v),
          select(
              '声音版本（可不选）',
              voice ?? '',
              const [('', '不展示声音')] +
                  [
                    for (final r in voices.where((r) => r.avatarId == avatar))
                      (r.id, r.data['display_name'] as String)
                  ], (v) {
            voice = v == '' ? null : v;
            consent = null;
          }),
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: audition,
              onChanged:
                  enabled ? (v) => change(() => audition = v == true) : null,
              title: const Text('这份申请同时允许公开试镜展示')),
          tradeSection('只公开指定预览，最多六份', [
            if (self || actions.contains('MANAGE_MATERIALS'))
              fileInput()
            else
              text('existingMaterials', '本人指定公开预览的材料编号', lines: 2, max: 300)
          ]),
          appNotice(
              '需要独立公开同意、有效托管与审核。关闭试镜展示可提交新公开申请并取消勾选；仍需独立复核，原申请在新申请获批前保持原状态。本人也可撤回原公开申请。')
        ];
      case 'SERVICE':
        final o = services?.offers
                .where((r) => r['spec_id'] == offer)
                .firstOrNull,
            s = o?['specification'];
        return [
          select('选择当前已审服务商品', offer, [
            for (final r in services?.offers ?? <Map<String, dynamic>>[])
              if (r['specification']['service']['halo_level'] != 3)
                (
                  r['spec_id'] as String,
                  '${r['title']} · ${artistMoney(r['price_minor'])}'
                )
          ], (v) {
            offer = v;
            reminder = false;
          }),
          if (o != null) ...[
            tradeFact('服务种类', artistServiceKinds[s['service']['kind']]),
            tradeFact('商品价格', artistMoney(o['price_minor'])),
            tradeFact('交付内容', (s['deliverables'] as List).join('、')),
            tradeFact('原商品重试次数', s['service']['retry_limit']),
            if (s['service']['kind'] == 'AVATAR_HOSTING')
              tradeFact('托管月数', s['service']['hosting_months']),
            ContractText(value: s['terms']),
            if (s['service']['kind'] != 'HALO_REVIEW') avatarInput(),
            if (s['service']['kind'] == 'AVATAR_HOSTING')
              CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('开启续托管提醒（不自动扣款）'),
                  value: reminder,
                  onChanged: enabled
                      ? (v) => change(() => reminder = v == true)
                      : null)
          ],
          if (services?.offers.isEmpty == true)
            appNotice('当前没有可订的已审服务商品，不能填写默认价格创建订单。'),
          appNotice('此步保存服务请求。平台报价、本人确认订单、实际付款和服务结果分别核对。'),
        ];
      case 'SUPPLEMENT':
      case 'APPEAL':
        return [
          text('reason', mode == 'SUPPLEMENT' ? '补充说明' : '异议原因',
              lines: 3, max: 2000),
          fileInput(),
          appNotice(
              mode == 'SUPPLEMENT' ? '补充回到原申请，不再购买一笔审核服务。' : '提交独立异议，原拒绝结果仍保留。')
        ];
      case 'WITHDRAW':
      case 'CANCEL':
        return [
          text('reason', '办理原因', lines: 3, max: 2000),
          appNotice(mode == 'WITHDRAW'
              ? '撤回后新使用须重新核对；旧订单与已有合法许可另行处理。'
              : '如果已存在订单，需要先按原订单取消或退款，不能仅取消服务就表示退款到账。')
        ];
      case 'REMINDER':
        return [
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('开启续托管提醒'),
              value: reminder,
              onChanged:
                  enabled ? (v) => change(() => reminder = v == true) : null),
          appNotice('提醒开关不授予扣款。续期仍需明确的新订单和实际支付。')
        ];
      case 'SYNC':
        return [appNotice('按同一笔原订单核对实际收款、托管有效期、服务与退款状态。不会新建付款或延长已生效的托管时间。')];
      default:
        return [];
    }
  }

  @override
  Widget build(BuildContext c) {
    final original = pending;
    Future<void> goBack() async {
      if (!await leave() || !c.mounted) return;
      if (Navigator.canPop(c)) {
        Navigator.pop(c);
      } else {
        Navigator.pushReplacementNamed(c, '/my-humans');
      }
    }

    return PopScope(
        canPop: !dirty && !locked,
        onPopInvokedWithResult: (didPop, _) async {
          if (!didPop) await goBack();
        },
        child: artistEditorScaffold(
            _titles[mode] ?? '艺人办理',
            [
              tradeHeading(_titles[mode] ?? '这个入口不存在', eyebrow: '本人档案 / 明确用途'),
              if (detail != null)
                tradeSection('这次为谁办理', [
                  tradeFact('真人本人', detail!.person.name),
                  tradeFact('所有权主体', shortSupplyId(detail!.person.owner)),
                  tradeFact('当前办事身份', widget.session.party?['display_name'])
                ]),
              if (record != null)
                tradeSection('原记录', [
                  tradeFact('记录编号', shortSupplyId(record!.id)),
                  tradeFact('当前状态', artistStatus(record!.status)),
                  tradeFact('当前版本', record!.version),
                  if (record!.data['review'] != null)
                    ContractText(value: record!.data['review']['reason'])
                ]),
              if (busy) const LinearProgressIndicator(),
              if (error != null) appNotice(error!, icon: Icons.error_outline),
              if (notice != null) appNotice(notice!),
              if (!busy && !allowed)
                appNotice(
                    '当前本人核验、办事身份、委托范围或记录状态不满足这一步。实名服务、儿童处理、L3和长期模型未具备条件时不会开放。'),
              if (original != null) ...[
                appNotice('上次操作结果尚未确认。本页暂时锁定，请恢复原内容、原版本和原请求编号核对。'),
                ExpansionTile(
                    title: const Text('查看上次待核对的提交内容'),
                    children: [ContractText(value: original['body'])]),
                tradeButton('恢复原艺人操作', busy ? null : () => submit(retry: true))
              ],
              ...inputs(),
              if (conflict) ...[
                appNotice('记录已有更新，本页填写与材料引用均已保留。请先核对当前版本，再决定是否继续。'),
                tradeButton('读取当前艺人记录核对', busy ? null : readCurrent,
                    outline: true),
                if (latest != null)
                  tradeSection('服务器当前记录', [
                    tradeFact('当前状态', artistStatus(latest!.status)),
                    tradeFact('当前版本', latest!.version),
                    if (latest!.data['review'] != null)
                      ContractText(value: latest!.data['review']['reason']),
                    tradeButton(
                        '保留本页输入，按当前版本继续',
                        busy
                            ? null
                            : () => setState(() {
                                  record = latest;
                                  latest = null;
                                  conflict = false;
                                  error = null;
                                }),
                        outline: true)
                  ]),
              ],
            ],
            onBack: goBack,
            footer: FilledButton(
                key: const ValueKey('artist-submit'),
                onPressed: enabled && ready ? submit : null,
                child: Text(mode == 'SYNC' ? '核对原订单与服务状态' : '提交本次办理'))));
  }
}
