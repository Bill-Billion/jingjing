import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/read_failure_widgets.dart';
import '../account/app_visual.dart';
import '../contracts/contract_text.dart';
import '../supply/supply_widgets.dart' show shortSupplyId;
import '../trade/trade_widgets.dart';
import 'artists_api.dart';
import 'artists_files.dart';
import 'artists_models.dart';
import 'artists_widgets.dart';
import 'artists_public_media.dart';

class ArtistPeoplePage extends StatelessWidget {
  const ArtistPeoplePage({super.key});
  @override
  Widget build(BuildContext context) =>
      ArtistsGate(builder: (s) => _People(session: s));
}

class _People extends StatefulWidget {
  const _People({required this.session});
  final AccountSession session;
  @override
  State<_People> createState() => _PeopleState();
}

class _PeopleState extends State<_People> {
  late final api = ArtistsApi(widget.session);
  final rows = <ArtistPerson>[], seen = <String>{};
  String? cursor, error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        rows.clear();
        cursor = null;
        seen.clear();
      }
    });
    try {
      final page = await api.people(cursor: more ? cursor : null);
      if (!mounted) return;
      if (page.cursor != null) artistRequire(seen.add(page.cursor!));
      setState(() {
        rows.addAll(
            page.items.where((r) => !rows.any((old) => old.id == r.id)));
        cursor = page.cursor;
      });
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          error = artistError(e);
          if ([401, 403, 404].contains(e.status)) rows.clear();
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) {
    final personal = widget.session.party?['kind'] == 'PERSON';
    return tradeScaffold(c, '我的艺人', [
      tradeHeading(personal ? '我的艺人' : '获托艺人',
          eyebrow: personal ? '真人本人档案 / 本人所有' : '机构工作 / 仅有效委托'),
      artistPendingNotice(c, widget.session),
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!),
      for (final p in rows)
        artistIdentityCover(p.name,
            '实名：${artistStatus(p.raw['identity_status'])} · 归属本人 ${shortSupplyId(p.owner)}',
            onTap: busy
                ? null
                : () =>
                    Navigator.pushNamed(c, artistPersonRoute(p.id)).then((_) {
                      if (mounted) load();
                    }),
            key: ValueKey('artist-person-${p.id}')),
      tradeBanner(
          '让每一次出场有据可查',
          personal
              ? '资料、授权与商品，都在这里管理。形象、声音与数字人始终归本人所有。'
              : '仅管理本人已明确委托的事项，所有权和本人决定不因代办改变。',
          icon: Icons.badge_outlined),
      appNotice(personal
          ? '一个真人可拥有多个数字人。本人同意、私人档案与公开展示分别办理。'
          : '这里只显示本人已委托当前机构查看的艺人。机构代办不改变所有权，也不能替本人授权、签署或修改佣金。'),
      if (!busy && error == null && rows.isEmpty)
        Text(personal
            ? '还没有本人档案。可以先建立档案，核验和数字人分别进行。'
            : '当前没有获托艺人。需要本人接受合作关系，并另行明确委托事项与期限。'),
      if (personal)
        tradeButton(
            '建立本人真人档案',
            busy || widget.session.artistsPending.isNotEmpty || rows.isNotEmpty
                ? null
                : () =>
                    Navigator.pushNamed(c, artistFormRoute('PERSON')).then((_) {
                      if (mounted) load();
                    })),
      if (cursor != null)
        tradeButton('加载更多艺人', busy ? null : () => load(more: true),
            outline: true),
      tradeButton('重新读取艺人名单', busy ? null : load, outline: true),
      tradeButton('查看公开艺人目录', () => Navigator.pushNamed(c, '/artists/catalog'),
          outline: true),
    ]);
  }
}

class ArtistPersonPage extends StatelessWidget {
  const ArtistPersonPage({super.key, required this.personId});
  final String personId;
  @override
  Widget build(BuildContext c) =>
      ArtistsGate(builder: (s) => _Person(session: s, id: personId));
}

class _Person extends StatefulWidget {
  const _Person({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_Person> createState() => _PersonState();
}

class _PersonState extends State<_Person> {
  late final api = ArtistsApi(widget.session);
  ArtistDetail? detail;
  ArtistServices? services;
  Set<String> actions = {};
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
      error = null;
      detail = null;
      services = null;
      actions = {};
    });
    try {
      final d = await api.person(widget.id),
          a = await api.actions(d),
          s = await api.services();
      if (mounted) {
        setState(() {
          detail = d;
          actions = a;
          services = s;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = artistError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> form(String mode, {String? avatar}) async {
    await Navigator.pushNamed(
        context, artistFormRoute(mode, personId: widget.id, avatarId: avatar));
    if (mounted) await load();
  }

  Widget records(String kind) => artistRow(
      artistKinds[kind]!,
      kind == 'CONSENT' ? '逐项查看脸部、声音、用途和期限。' : '查看当前状态与原记录。',
      busy
          ? null
          : () => Navigator.pushNamed(context,
                      '/artists/records?personId=${widget.id}&kind=$kind')
                  .then((_) {
                if (mounted) load();
              }));
  @override
  Widget build(BuildContext c) {
    final d = detail,
        self = d?.person.owner == widget.session.partyId,
        can = d?.person.adultVerified == true &&
            widget.session.artistsPending.isEmpty;
    return tradeScaffold(c, '艺人档案', [
      tradeHeading(d?.person.name ?? '读取本人档案', eyebrow: '艺人 / 真人与数字人'),
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!),
      artistPendingNotice(c, widget.session),
      if (d != null) ...[
        tradeBanner(self ? '本人档案' : '当前为机构获托办理',
            self ? '你的形象、声音与数字人始终归你本人所有。' : '仅能办理下列有效委托事项，不能代签或替本人作出形象、声音同意。',
            icon: Icons.person_outline),
        tradeSection('本人核验与归属', [
          tradeFact('真人本人', d.person.name),
          tradeFact('所有权主体', shortSupplyId(d.person.owner)),
          tradeFact('当前办事身份', widget.session.party?['display_name']),
          tradeFact('实名核验', artistStatus(d.person.raw['identity_status'])),
          tradeFact('核验有效至', artistWhen(d.person.raw['identity_valid_until'])),
          tradeFact('当前认证', d.halo == 0 ? '暂无有效认证' : 'L${d.halo}'),
          if (d.person.raw['age_band'] == 'MINOR')
            appNotice('儿童实际处理暂未开放。不得上传儿童素材或创建数字人。'),
          if (self) ...[
            appNotice(
                services?.raw['identity']['current_status'] == 'SERVICE_READY'
                    ? '实名核验由服务方返回可信结果，不能自行标记通过。'
                    : '实名服务暂未启用。已建档不等于已实名。'),
            tradeButton(
                '核对实名服务结果',
                busy ||
                        services?.raw['identity']['current_status'] !=
                            'SERVICE_READY' ||
                        d.person.raw['age_band'] == 'MINOR'
                    ? null
                    : () => form('IDENTITY'),
                outline: true),
          ] else
            tradeFact(
                '有效受托事项', actions.map((a) => artistActions[a] ?? a).join('、')),
        ]),
        tradeSection('我的数字人', [
          if (d.avatars.isEmpty) const Text('尚无数字人档案。'),
          for (final avatar in d.avatars) ...[
            artistRow(
                avatar.name,
                '${avatar.raw['data']['archive_status'] == 'DELIVERED' ? '私人档案已交付' : '档案尚未交付'} · 长期模型未启用',
                null,
                key: ValueKey('artist-avatar-${avatar.id}')),
            tradeButton(
                '查看数字人档案',
                busy
                    ? null
                    : () async {
                        await Navigator.push<void>(
                            c,
                            MaterialPageRoute(
                                builder: (_) => ArtistsGate(
                                    builder: (session) => _AvatarDetails(
                                        session: session,
                                        personId: widget.id,
                                        avatarId: avatar.id))));
                        if (mounted) await load();
                      },
                outline: true),
            if (self)
              tradeButton(
                  '为${avatar.name}填写本人同意',
                  !can || busy
                      ? null
                      : () => form('CONSENT', avatar: avatar.id),
                  outline: true),
            if (actions.contains('MANAGE_AVATARS'))
              tradeButton(
                  '保存${avatar.name}的造型或声音版本',
                  !can || busy
                      ? null
                      : () => form('VARIANT', avatar: avatar.id),
                  outline: true),
            if (actions.contains('SUBMIT_LISTING'))
              tradeButton(
                  '申请公开展示${avatar.name}',
                  !can || busy
                      ? null
                      : () => form('LISTING', avatar: avatar.id),
                  outline: true),
          ],
          if (actions.contains('MANAGE_AVATARS'))
            tradeButton(
                '建立一个数字人档案', !can || busy ? null : () => form('AVATAR')),
          appNotice('数字人档案和已保存的造型、声音版本不表示长期模型已训练或可调用。'),
        ]),
        if (self) ...[
          records('IDENTITY'),
          records('CONSENT'),
          records('DELEGATION'),
          tradeButton(
              '本人确认机构代办范围', !can || busy ? null : () => form('DELEGATION'),
              outline: true),
          records('HALO'),
          records('APPEAL'),
          tradeButton('申请L1或L2认证', !can || busy ? null : () => form('HALO'),
              outline: true),
          records('SERVICE'),
          tradeButton(
              '查看已审创建与托管服务', !can || busy ? null : () => form('SERVICE'),
              outline: true),
          appNotice('L1免费；L2审核费用以已审商品和原订单为准。补件沿用原申请与费用。L3所需真实业务事实暂未具备。'),
        ] else
          records('DELEGATION'),
        records('LOOK'),
        records('VOICE'),
        records('LISTING'),
      ],
      tradeButton('重新读取本人档案', busy ? null : load, outline: true),
    ]);
  }
}

class ArtistRecordsPage extends StatelessWidget {
  const ArtistRecordsPage(
      {super.key, required this.personId, this.kind = 'CONSENT'});
  final String personId, kind;
  @override
  Widget build(BuildContext c) => ArtistsGate(
      builder: (s) => _Records(session: s, personId: personId, kind: kind));
}

class _Records extends StatefulWidget {
  const _Records(
      {required this.session, required this.personId, required this.kind});
  final AccountSession session;
  final String personId, kind;
  @override
  State<_Records> createState() => _RecordsState();
}

class _RecordsState extends State<_Records> {
  late final api = ArtistsApi(widget.session);
  final rows = <ArtistRecord>[], seen = <String>{};
  String? cursor, error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        rows.clear();
        cursor = null;
        seen.clear();
      }
    });
    try {
      final d = await api.records(widget.personId, widget.kind,
          cursor: more ? cursor : null);
      if (d.cursor != null) artistRequire(seen.add(d.cursor!));
      if (mounted) {
        setState(() {
          rows.addAll(d.items.where((r) => !rows.any((old) => old.id == r.id)));
          cursor = d.cursor;
        });
      }
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          error = artistError(e);
          if ([401, 403, 404].contains(e.status)) rows.clear();
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) =>
      tradeScaffold(c, artistKinds[widget.kind] ?? '艺人记录', [
        tradeHeading(artistKinds[widget.kind] ?? '艺人记录',
            eyebrow: '本人档案 / 逐版保留'),
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!),
        if (!busy && error == null && rows.isEmpty) const Text('尚无这类记录。'),
        for (final r in rows)
          artistRow(
              r.data['display_name'] is String
                  ? r.data['display_name']
                  : artistKinds[r.kind]!,
              '记录 ${shortSupplyId(r.id)} · 版本 ${r.version}',
              busy
                  ? null
                  : () => Navigator.pushNamed(
                              c, artistRecordRoute(widget.personId, r.id))
                          .then((_) {
                        if (mounted) load();
                      }),
              status: artistStatus(r.status),
              key: ValueKey('artist-record-${r.id}')),
        if (cursor != null)
          tradeButton('加载更多记录', busy ? null : () => load(more: true),
              outline: true),
        tradeButton('重新读取记录', busy ? null : load, outline: true),
      ]);
}

class ArtistRecordPage extends StatelessWidget {
  const ArtistRecordPage(
      {super.key, required this.personId, required this.recordId});
  final String personId, recordId;
  @override
  Widget build(BuildContext c) => ArtistsGate(
      builder: (s) => _Record(session: s, personId: personId, id: recordId));
}

class _Record extends StatefulWidget {
  const _Record(
      {required this.session, required this.personId, required this.id});
  final AccountSession session;
  final String personId, id;
  @override
  State<_Record> createState() => _RecordState();
}

class _RecordState extends State<_Record> {
  late final api = ArtistsApi(widget.session);
  ArtistRecord? record;
  ArtistDetail? detail;
  Set<String> actions = {};
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
      error = null;
      record = null;
      detail = null;
    });
    try {
      final p = await api.person(widget.personId), a = await api.actions(p);
      var r = await api.record(widget.personId, widget.id);
      if (r.kind == 'SERVICE') {
        r = await api.record(widget.personId, widget.id, service: true);
      }
      if (mounted) {
        setState(() {
          detail = p;
          record = r;
          actions = a;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = artistError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> form(String mode) async {
    await Navigator.pushNamed(
        context,
        artistFormRoute(mode,
            personId: widget.personId,
            recordId: widget.id,
            avatarId: record?.avatarId));
    if (mounted) await load();
  }

  List<Widget> facts(ArtistRecord r) {
    final d = r.data;
    return switch (r.kind) {
      'CONSENT' => [
          tradeFact('形象 / 声音', artistNames(d['features'], artistFeatures)),
          tradeFact('具体用途', artistNames(d['purposes'], artistPurposes)),
          tradeFact('使用方主体', shortSupplyId(d['grantee_party_id'])),
          tradeFact('地区', (d['territories'] as List).join('、')),
          tradeFact('生效至到期',
              '${artistWhen(d['valid_from'])}\n${artistWhen(d['valid_until'])}'),
          ContractText(value: d['terms'])
        ],
      'DELEGATION' => [
          tradeFact('获托机构', shortSupplyId(d['organization_party_id'])),
          tradeFact('已接受合作关系', shortSupplyId(d['relation_id'])),
          tradeFact('代办范围', artistNames(d['actions'], artistActions)),
          tradeFact('委托有效期',
              '${artistWhen(d['valid_from'])}\n${artistWhen(d['valid_until'])}'),
          appNotice('不包含代签、代替本人同意或修改佣金。'),
          ContractText(value: d['terms'])
        ],
      'LOOK' || 'VOICE' => [
          tradeFact('版本名称', d['display_name']),
          tradeFact('版本序号', d['revision']),
          tradeFact(
              '前一版本',
              d['previous_version_id'] == null
                  ? '首次记录'
                  : shortSupplyId(d['previous_version_id'])),
          tradeFact('关联本人同意', shortSupplyId(d['consent_id']))
        ],
      'HALO' => [
          tradeFact('申请等级', 'L${d['level']}'),
          tradeFact(
              '关联审核服务',
              d['service_id'] == null
                  ? 'L1免费申请'
                  : shortSupplyId(d['service_id'])),
          tradeFact('有效期',
              '${artistWhen(d['valid_from'])}\n${artistWhen(d['valid_until'])}'),
          appNotice('付款不代表认证通过。补件不重复购买，异议不会改写原拒绝结果。')
        ],
      'APPEAL' => [
          tradeFact('原申请', shortSupplyId(d['target_id'])),
          ContractText(value: d['reason']),
          appNotice('这是独立异议记录，原裁决仍按原状态保留。')
        ],
      'LISTING' => [
          tradeFact('公开名称', d['display_name']),
          tradeFact('城市', d['city']),
          tradeFact('标签', (d['tags'] as List).join('、')),
          ContractText(value: d['introduction']),
          tradeFact('试镜展示', d['audition_public'] ? '本申请允许试镜展示' : '未开放试镜展示'),
          appNotice('只公开本申请指定的预览。撤回或托管、同意到期后，服务端会重新限制预览。')
        ],
      'IDENTITY' => [
          tradeFact('核验状态', artistStatus(r.status)),
          appNotice('核验结果来自服务方，建档或付款不表示实名通过。')
        ],
      _ => serviceFacts(r),
    };
  }

  List<Widget> serviceFacts(ArtistRecord r) {
    final d = r.data, s = d['specification'], order = r.raw['order'];
    return [
      tradeFact('服务', artistServiceKinds[d['kind']]),
      tradeFact('服务请求编号', r.id),
      tradeFact('本人买方主体', detail?.person.owner),
      tradeFact('已审商品规格编号', d['spec_id']),
      tradeFact('原商品价格', artistMoney(d['price_minor'])),
      tradeFact('服务档位 / 版本', '${s['service_tier']} / ${s['version']}'),
      tradeFact('对应真人', detail?.person.name),
      tradeFact(
          '对应数字人',
          r.avatarId == null
              ? '认证审核，无数字人对象'
              : detail?.avatars
                      .where((a) => a.id == r.avatarId)
                      .map((a) => a.name)
                      .firstOrNull ??
                  shortSupplyId(r.avatarId!)),
      tradeFact('原商品重试次数', s['service']['retry_limit']),
      tradeFact('已记录尝试次数', d['attempts']),
      if (d['kind'] == 'AVATAR_HOSTING') ...[
        tradeFact('原商品托管月数', s['service']['hosting_months']),
        tradeFact(
            '本期实际有效期',
            d['hosting_period'] == null
                ? '尚未核实生效'
                : '${artistWhen(d['hosting_period']['valid_from'])}\n${artistWhen(d['hosting_period']['valid_until'])}'),
        tradeFact('续托管提醒', d['renewal_reminder'] ? '已开启' : '已关闭'),
      ],
      appNotice('续托管提醒不等于自动扣款授权。长期模型未启用，已有私人档案和历史许可分别保留。'),
      ContractText(value: s['terms']),
      tradeFact('原商品交付内容', (s['deliverables'] as List).join('、')),
      if (d['last_failure'] != null)
        tradeFact('服务失败原因', d['last_failure']['reason']),
      if (d['refund'] != null)
        tradeFact(
            '退款办理', r.status == 'REFUNDED' ? '已核实原交易退款' : '待沿原交易办理，尚未核实退款到账'),
      if (order != null) ...[
        tradeFact('原订单', shortSupplyId(order['id'])),
        tradeFact('实际收款', artistMoney(order['financial']['received_minor'])),
        tradeFact('已核实退款', artistMoney(order['financial']['refunded_minor'])),
        tradeButton(
            '查看服务原订单',
            busy
                ? null
                : () => Navigator.pushNamed(
                    context, '/trade/record?recordId=${order['id']}'))
      ] else ...[
        appNotice('服务请求已保存，尚未关联正式订单。报价由平台建立和独立复核，不能在这里假报付款。'),
        tradeButton(
            '查看本人收到的报价',
            busy
                ? null
                : () => Navigator.pushNamed(context, '/trade?kind=QUOTE'),
            outline: true),
      ],
      if (d['delivery'] != null)
        tradeFact(
            '已保存服务结果',
            {
              'DIGITAL_ARCHIVE': '私人档案交付',
              'HOSTING_ENTITLEMENT': '托管期已核实',
              'HALO_REVIEW': '审核结果已记录'
            }[d['delivery']['type']]),
    ];
  }

  @override
  Widget build(BuildContext c) {
    final r = record,
        p = detail?.person,
        self = p?.owner == widget.session.partyId,
        locked = busy || widget.session.artistsPending.isNotEmpty;
    return tradeScaffold(c, r == null ? '艺人记录' : artistKinds[r.kind]!, [
      tradeHeading(
          r == null
              ? '读取原记录'
              : r.kind == 'SERVICE'
                  ? '创建与托管'
                  : artistKinds[r.kind]!,
          eyebrow: r == null
              ? '本人档案 / 原记录'
              : '${artistKinds[r.kind]} / 版本 ${r.version}'),
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!),
      artistPendingNotice(c, widget.session),
      if (r != null && p != null) ...[
        tradeBanner(
            artistStatus(r.status), '${p.name} · 记录 ${shortSupplyId(r.id)}',
            icon: Icons.description_outlined),
        ...facts(r),
        if (r.data['review'] != null)
          tradeSection('独立审核意见', [
            ContractText(value: r.data['review']['reason']),
            tradeFact('审核时间', artistWhen(r.data['review']['reviewed_at']))
          ]),
        if (r.data['withdrawal'] != null)
          tradeSection('原撤回记录', [
            ContractText(value: r.data['withdrawal']['reason']),
            tradeFact('撤回时间', artistWhen(r.data['withdrawal']['at']))
          ]),
        if (r.data['evidence_asset_ids'] is List &&
            (r.data['evidence_asset_ids'] as List).isNotEmpty)
          tradeSection('本人证据材料', [
            ArtistFiles(
                api: api,
                person: p,
                purpose: r.kind == 'CONSENT' || r.kind == 'DELEGATION'
                    ? 'CONSENT_EVIDENCE'
                    : 'REVIEW_EVIDENCE',
                ids: artistStrings(r.data['evidence_asset_ids'], ids: true))
          ]),
        if ((self || actions.contains('MANAGE_MATERIALS')) &&
            r.data['material_asset_ids'] is List)
          tradeSection('本版私人材料', [
            ArtistFiles(
                api: api,
                person: p,
                purpose: 'AVATAR_MATERIAL',
                ids: artistStrings(r.data['material_asset_ids'], ids: true))
          ]),
        for (final supplement in (r.data['supplements'] as List? ?? []))
          tradeSection('补件历史', [
            ContractText(value: supplement['note']),
            tradeFact('提交时间', artistWhen(supplement['at'])),
            ArtistFiles(
                api: api,
                person: p,
                purpose: 'REVIEW_EVIDENCE',
                ids: artistStrings(supplement['evidence_asset_ids'], ids: true))
          ]),
        if (self) ...[
          if (r.canSupplement)
            tradeButton('补齐这次申请的材料', locked ? null : () => form('SUPPLEMENT')),
          if (r.canAppeal)
            tradeButton('对本次拒绝提交异议', locked ? null : () => form('APPEAL'),
                outline: true),
          if (r.canWithdraw)
            tradeButton('撤回这份同意或委托', locked ? null : () => form('WITHDRAW'),
                outline: true),
          if (r.kind == 'SERVICE') ...[
            tradeButton('核对服务与原订单状态', locked ? null : () => form('SYNC'),
                outline: true),
            if (r.data['kind'] == 'AVATAR_HOSTING')
              tradeButton('设置续托管提醒', locked ? null : () => form('REMINDER'),
                  outline: true),
            if (!['DELIVERED', 'REFUNDED', 'CANCELLED'].contains(r.status))
              tradeButton('申请取消本服务', locked ? null : () => form('CANCEL'),
                  outline: true),
          ],
        ],
        ExpansionTile(
            title: const Text('查看原记录的完整保存内容'),
            tilePadding: EdgeInsets.zero,
            children: [ContractText(value: r.raw)]),
      ],
      tradeButton('重新读取当前记录', busy ? null : load, outline: true),
    ]);
  }
}

class ArtistCataloguePage extends StatelessWidget {
  const ArtistCataloguePage(
      {super.key, this.initialCity = '', this.initialTag = ''});
  final String initialCity, initialTag;
  @override
  Widget build(BuildContext c) => ArtistsGate(
      accountOnly: true,
      showExpired: true,
      returnRoute: Uri(path: '/artists/catalog', queryParameters: {
        if (initialCity.isNotEmpty) 'city': initialCity,
        if (initialTag.isNotEmpty) 'tag': initialTag,
      }).toString(),
      builder: (s) => _Catalogue(
          session: s, initialCity: initialCity, initialTag: initialTag));
}

Future<void> openArtistPublicDetails(BuildContext context,
    {required AccountSession session,
    required Map<String, dynamic> listing}) async {
  final epoch = session.epoch;
  await Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
          builder: (pageContext) => ArtistsGate(
              accountOnly: true,
              returnRoute: Uri(path: '/artists/catalog', queryParameters: {
                if ((listing['city'] as String).isNotEmpty)
                  'city': listing['city'] as String,
              }).toString(),
              builder: (active) =>
                  identical(active, session) && active.epoch == epoch
                      ? _PublicArtistDetails(session: active, listing: listing)
                      : tradeScaffold(
                          pageContext,
                          '艺人详情',
                          [
                            const ReadFailureContent(
                                reason: '账号或身份已变化，请返回艺人目录重新读取。'),
                            tradeButton(
                                '返回艺人目录', () => Navigator.pop(pageContext),
                                outline: true),
                          ],
                          plaza: true))));
}

Future<({String city, String tag, bool audition})?> openArtistFilters(
        BuildContext context,
        {required String city,
        required String tag,
        required bool audition}) =>
    Navigator.push<({String city, String tag, bool audition})>(
        context,
        MaterialPageRoute(
            builder: (_) =>
                _ArtistFilters(city: city, tag: tag, audition: audition)));

class _Catalogue extends StatefulWidget {
  const _Catalogue(
      {required this.session,
      required this.initialCity,
      required this.initialTag});
  final AccountSession session;
  final String initialCity, initialTag;
  @override
  State<_Catalogue> createState() => _CatalogueState();
}

class _CatalogueState extends State<_Catalogue> {
  late final api = ArtistsApi(widget.session);
  final city = TextEditingController(),
      tag = TextEditingController(),
      rows = <Map<String, dynamic>>[],
      seen = <String>{};
  int mediaGeneration = 0;
  bool busy = false, audition = false, loadFailed = false, hasRead = false;
  String? cursor, error;
  @override
  void initState() {
    super.initState();
    city.text = widget.initialCity;
    tag.text = widget.initialTag;
    load();
  }

  @override
  void dispose() {
    city.dispose();
    tag.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      loadFailed = false;
      if (!more) {
        mediaGeneration++;
        rows.clear();
        cursor = null;
        seen.clear();
      }
    });
    try {
      final p = await api.catalog(
          cursor: more ? cursor : null,
          city: city.text,
          tag: tag.text,
          audition: audition);
      if (p.cursor != null) artistRequire(seen.add(p.cursor!));
      if (mounted) {
        setState(() {
          rows.addAll(p.items.where(
              (r) => !rows.any((old) => old['listing_id'] == r['listing_id'])));
          cursor = p.cursor;
          hasRead = true;
        });
      }
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          error = artistError(e);
          loadFailed = true;
          if ([401, 403, 404].contains(e.status)) {
            rows.clear();
          }
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> filter() async {
    final result = await openArtistFilters(context,
        city: city.text, tag: tag.text, audition: audition);
    if (!mounted || result == null) return;
    city.text = result.city;
    tag.text = result.tag;
    audition = result.audition;
    await load();
  }

  Widget cards() => LayoutBuilder(builder: (context, constraints) {
        final columns = MediaQuery.textScalerOf(context).scale(14) > 20 ? 2 : 3;
        final width = (constraints.maxWidth - (columns - 1) * 12) / columns;
        return Wrap(spacing: 12, runSpacing: 16, children: [
          for (final r in rows)
            SizedBox(
                key:
                    ValueKey('artist-card-$mediaGeneration-${r['listing_id']}'),
                width: width,
                child: Semantics(
                    button: true,
                    label: '查看艺人详情，${r['display_name']}，${r['city']}',
                    child: Material(
                        color: AccountTheme.canvas,
                        child: InkWell(
                            onTap: busy
                                ? null
                                : () async {
                                    await openArtistPublicDetails(context,
                                        session: widget.session, listing: r);
                                    if (mounted) await load();
                                  },
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  ArtistPublicPortrait(
                                      session: widget.session,
                                      listing: r,
                                      onUnavailable: () {
                                        if (!mounted) return;
                                        setState(() => rows.removeWhere((old) =>
                                            old['listing_id'] ==
                                            r['listing_id']));
                                      }),
                                  const SizedBox(height: 4),
                                  Text(r['display_name'],
                                      style: const TextStyle(
                                          fontFamily: AccountTheme.serif,
                                          fontSize: 14,
                                          fontWeight: FontWeight.w700,
                                          height: 1.4)),
                                  const SizedBox(height: 3),
                                  Text(
                                      '${r['city']} · ${(r['tags'] as List).take(2).join(' / ')}',
                                      style: const TextStyle(
                                          fontSize: 11,
                                          height: 1.5,
                                          color: AccountTheme.muted)),
                                ]))))),
        ]);
      });

  @override
  Widget build(BuildContext c) {
    if (busy &&
        !hasRead &&
        rows.isEmpty &&
        widget.session.artistsPending.isEmpty &&
        city.text.isEmpty &&
        tag.text.isEmpty &&
        !audition) {
      return tradeScaffold(c, '公开艺人', [const ReadLoadingContent(label: '公开艺人')],
          plaza: true);
    }
    if (loadFailed &&
        !busy &&
        error != null &&
        rows.isEmpty &&
        widget.session.artistsPending.isEmpty) {
      return tradeScaffold(c, '公开艺人', [ReadFailureContent(reason: error!)],
          plaza: true,
          footer: ReadFailureActions(
              onBack: () => setState(() => loadFailed = false), onRetry: load));
    }
    return tradeScaffold(
        c,
        '公开艺人',
        [
          const Padding(
              padding: EdgeInsets.only(bottom: 16),
              child: Text('公开艺人目录',
                  style: TextStyle(
                      fontFamily: AccountTheme.serif,
                      fontSize: 24,
                      fontWeight: FontWeight.w900))),
          Row(children: [
            Expanded(
                child: Text(
                    '${city.text.trim().isEmpty ? '全部城市' : city.text.trim()} · ${tag.text.trim().isEmpty ? '全部标签' : tag.text.trim()}',
                    style: const TextStyle(
                        fontSize: 12, color: AccountTheme.muted))),
            OutlinedButton.icon(
                key: const ValueKey('artist-catalog-filters'),
                onPressed: busy ? null : filter,
                icon: const Icon(Icons.tune_outlined, size: 18),
                label: const Text('筛选')),
          ]),
          if (audition)
            const Text('仅显示已开放试镜展示的艺人', style: TextStyle(fontSize: 12)),
          const SizedBox(height: 16),
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!),
          if (!busy && error == null && rows.isEmpty)
            Text(cursor == null ? '当前条件下没有已获准公开的艺人。' : '本页没有符合条件的艺人，可继续读取下一页。'),
          cards(),
          const SizedBox(height: 16),
          const Text('公开展示不授予形象或声音商用许可。',
              style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
          if (cursor != null)
            tradeButton('加载更多公开艺人', busy ? null : () => load(more: true),
                outline: true),
          tradeButton(
              '浏览剧本', () => Navigator.pushNamed(c, '/licensing/catalog'),
              outline: true),
          tradeButton('浏览商单', () => Navigator.pushNamed(c, '/gigs'),
              outline: true),
        ],
        plaza: true);
  }
}

class _ArtistFilters extends StatefulWidget {
  const _ArtistFilters(
      {required this.city, required this.tag, required this.audition});
  final String city, tag;
  final bool audition;
  @override
  State<_ArtistFilters> createState() => _ArtistFiltersState();
}

class _ArtistFiltersState extends State<_ArtistFilters> {
  late final city = TextEditingController(text: widget.city),
      tag = TextEditingController(text: widget.tag);
  late bool audition = widget.audition;
  @override
  void dispose() {
    city.dispose();
    tag.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      '艺人筛选',
      [
        const Text('找到合适的面孔',
            style: TextStyle(
                fontFamily: AccountTheme.serif,
                fontSize: 24,
                fontWeight: FontWeight.w900)),
        const SizedBox(height: 16),
        const Text('城市、标签与试镜展示状态分别筛选。', style: TextStyle(fontSize: 14)),
        const SizedBox(height: 32),
        TextField(
            controller: city,
            maxLength: 100,
            decoration: const InputDecoration(labelText: '城市')),
        const SizedBox(height: 16),
        TextField(
            controller: tag,
            maxLength: 40,
            decoration: const InputDecoration(labelText: '标签')),
        CheckboxListTile(
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            title: const Text('只看已开放试镜展示的艺人', style: TextStyle(fontSize: 14)),
            value: audition,
            onChanged: (value) => setState(() => audition = value == true)),
        const SizedBox(height: 16),
        const Text('公开展示不等于当前有档期。预约前仍需核对具体试镜方案与本单用途。',
            style: TextStyle(
                fontSize: 14, color: AccountTheme.muted, height: 1.6)),
        const SizedBox(height: 40),
        tradeButton(
            '按条件查看艺人',
            () => Navigator.pop(context, (
                  city: city.text.trim(),
                  tag: tag.text.trim(),
                  audition: audition
                ))),
        tradeButton('重置筛选条件', () {
          city.clear();
          tag.clear();
          setState(() => audition = false);
        }, outline: true),
      ],
      plaza: true);
}

/// Public presentation uses only this listing's approved data and fresh reads.
/// Design sample portraits never stand in for a real person's public assets.
class _PublicArtistDetails extends StatefulWidget {
  const _PublicArtistDetails({required this.session, required this.listing});
  final AccountSession session;
  final Map<String, dynamic> listing;
  @override
  State<_PublicArtistDetails> createState() => _PublicArtistDetailsState();
}

class _PublicArtistDetailsState extends State<_PublicArtistDetails> {
  late final api = ArtistsApi(widget.session);
  final previews = <String, Uint8List>{};
  bool busy = false, available = false;
  Map<String, dynamic>? current;
  String? error;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    setState(() {
      busy = true;
      available = false;
      error = null;
      current = null;
      previews.clear();
    });
    try {
      final d = await api.publicDetail(widget.listing['listing_id']);
      if (mounted) {
        setState(() {
          current = d;
          available = true;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = artistError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> preview(String id, {bool save = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      previews.remove(id);
    });
    final epoch = widget.session.epoch;
    try {
      final bytes = await api.publicPreview(widget.listing['listing_id'], id);
      if (!mounted) return;
      if (save) {
        await FilePicker.saveFile(fileName: 'preview-$id', bytes: bytes);
        api.check(epoch, null);
      } else {
        setState(() => previews[id] = bytes);
      }
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          error = artistError(e);
          previews.clear();
          if ([401, 403, 404, 409].contains(e.status)) available = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => error = '预览或保存未完成，请重新读取后再试。');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget portrait(Map<String, dynamic> listing, String? loaded) => SizedBox(
      key: const ValueKey('artist-public-portrait'),
      width: 180,
      height: 228,
      child: ClipRect(
          child: loaded == null
              ? ArtistPublicPortrait(
                  session: widget.session,
                  listing: listing,
                  aspectRatio: 180 / 228,
                  onUnavailable: () {
                    if (!mounted) return;
                    setState(() {
                      available = false;
                      previews.clear();
                    });
                  })
              : Image.memory(previews[loaded]!,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const ColoredBox(
                      color: Color(0xFFE5E1D7),
                      child: Center(
                          child: Padding(
                              padding: EdgeInsets.all(12),
                              child: Text('此预览不是可显示的图片，请保存后查看。')))))));

  Widget presentation(Map<String, dynamic> listing, String? loaded) =>
      LayoutBuilder(builder: (context, constraints) {
        final caption = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(listing['display_name'],
                  style: const TextStyle(
                      fontFamily: AccountTheme.serif,
                      fontSize: 32,
                      fontWeight: FontWeight.w900,
                      height: 1.2)),
              const SizedBox(height: 16),
              Text(
                  '${listing['city']} · ${(listing['tags'] as List).join(' · ')}',
                  style: const TextStyle(
                      fontSize: 14, height: 1.5, color: AccountTheme.muted)),
              const SizedBox(height: 20),
              Text('当前认证 L${listing['halo_level']}',
                  style:
                      const TextStyle(fontSize: 12, color: AccountTheme.muted)),
            ]);
        if (constraints.maxWidth < 280 ||
            MediaQuery.textScalerOf(context).scale(32) > 44) {
          return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                caption,
                const SizedBox(height: 16),
                portrait(listing, loaded)
              ]);
        }
        return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          Expanded(child: caption),
          const SizedBox(width: 12),
          SizedBox(
              width: constraints.maxWidth * .5085,
              child: portrait(listing, loaded)),
        ]);
      });

  @override
  Widget build(BuildContext context) {
    final r = current ?? widget.listing;
    final ids = artistStrings(r['preview_asset_ids'], ids: true);
    final loaded = ids.where(previews.containsKey).firstOrNull;
    return tradeScaffold(
        context,
        available ? '艺人详情' : '公开资料',
        [
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!),
          if (available) ...[
            presentation(r, loaded),
            const SizedBox(height: 32),
            tradeHeading('关于这位艺人', fontSize: 24),
            Text(r['introduction'],
                style: const TextStyle(fontSize: 14, height: 1.6)),
            const SizedBox(height: 32),
            tradeHeading('作品与声音', fontSize: 24),
            const Text('每份预览在读取时重新核对公开授权。公开展示不授予形象、声音或作品商用许可。',
                style: TextStyle(
                    fontSize: 14, height: 1.6, color: AccountTheme.muted)),
            const SizedBox(height: 20),
            if (ids.isEmpty) const Text('这份公开资料尚未提供可读预览。'),
            for (var i = 0; i < ids.length; i++) ...[
              if (loaded != ids[i] && previews[ids[i]] != null)
                Image.memory(previews[ids[i]]!,
                    height: 220,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Text('此预览请保存后查看。')),
              tradeButton(
                  '读取获准预览 ${i + 1}', busy ? null : () => preview(ids[i]),
                  outline: true),
              tradeButton('重新核权并保存预览 ${i + 1}',
                  busy ? null : () => preview(ids[i], save: true),
                  outline: true),
            ],
            tradeButton(
                '查看公开试镜方案',
                busy
                    ? null
                    : () => Navigator.pushNamed(
                        context,
                        Uri(path: '/auditions/catalog', queryParameters: {
                          if ((r['city'] as String).trim().isNotEmpty)
                            'city': (r['city'] as String).trim(),
                        }).toString())),
            appNotice('试镜方案按本人已审核并公开的目录展示；预约前请核对具体艺人与本单用途。'),
            tradeButton(
                '向这位艺人发起合作邀约',
                busy
                    ? null
                    : () => Navigator.pushNamed(context,
                        '/notices/submit?kind=INVITATION&listingId=${r['listing_id']}')),
            tradeButton('重新核对公开资料', busy ? null : reload, outline: true),
          ] else if (!busy) ...[
            Container(
                height: 170,
                color: const Color(0xFFE5E1D7),
                alignment: Alignment.center,
                child: const Icon(Icons.description_outlined,
                    size: 44, color: AccountTheme.muted)),
            const SizedBox(height: 40),
            tradeHeading('这份公开资料当前不可用', fontSize: 24),
            const Text('可以返回目录，查看其他当前可用内容。',
                style: TextStyle(fontSize: 14, height: 1.6)),
            const SizedBox(height: 32),
            tradeButton('重新核对公开资料', reload, outline: true),
            tradeButton('返回目录重新读取', () => Navigator.pop(context)),
          ],
        ],
        plaza: true);
  }
}

class _AvatarDetails extends StatefulWidget {
  const _AvatarDetails(
      {required this.session, required this.personId, required this.avatarId});
  final AccountSession session;
  final String personId, avatarId;
  @override
  State<_AvatarDetails> createState() => _AvatarDetailsState();
}

class _AvatarDetailsState extends State<_AvatarDetails> {
  late final api = ArtistsApi(widget.session);
  ArtistDetail? detail;
  Set<String> actions = {};
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
      detail = null;
      actions = {};
    });
    try {
      final current = await api.person(widget.personId);
      artistRequire(
          current.avatars.any((avatar) => avatar.id == widget.avatarId));
      final permitted = await api.actions(current);
      if (mounted) {
        setState(() {
          detail = current;
          actions = permitted;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = artistError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void records(String kind) => Navigator.pushNamed(context,
              '/artists/records?personId=${widget.personId}&kind=$kind')
          .then((_) {
        if (mounted) load();
      });

  @override
  Widget build(BuildContext context) {
    final d = detail;
    final avatar = d?.avatars.where((a) => a.id == widget.avatarId).firstOrNull;
    final self = d?.person.owner == widget.session.partyId;
    return tradeScaffold(context, '数字人详情', [
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!),
      if (d != null && avatar != null) ...[
        tradeHeading(avatar.name, eyebrow: '形象资产 / 本人所有'),
        artistIdentityCover(avatar.name, '形象与声音 · 数字人档案',
            imageLabel: '未提供数字人肖像封面'),
        tradeSection('资产所有人', [
          tradeFact('真人本人', d.person.name),
          tradeFact('所有权主体', shortSupplyId(d.person.owner)),
          tradeFact(
              '私人档案',
              avatar.raw['data']['archive_status'] == 'DELIVERED'
                  ? '已交付'
                  : '尚未交付'),
        ]),
        tradeSection('当前授权与委托', [
          if (self)
            tradeButton('查看本人同意与用途', busy ? null : () => records('CONSENT'),
                outline: true),
          tradeButton('查看当前委托范围', busy ? null : () => records('DELEGATION'),
              outline: true),
          appNotice('授权按具体用途、期限和作品逐份核对；已建档不代表允许公开、商用或重新生成。'),
        ]),
        tradeSection('试镜素材与造型版本', [
          tradeButton('查看造型版本', busy ? null : () => records('LOOK'),
              outline: true),
          tradeButton('查看声音版本', busy ? null : () => records('VOICE'),
              outline: true),
          if ((self || actions.contains('MANAGE_MATERIALS')) &&
              (avatar.raw['data']['material_asset_ids'] as List).isNotEmpty)
            ArtistFiles(
                api: api,
                person: d.person,
                purpose: 'AVATAR_MATERIAL',
                ids: artistStrings(avatar.raw['data']['material_asset_ids'],
                    ids: true)),
        ]),
        tradeBanner('长期模型未启用', '数字人档案与已保存的造型、声音版本不表示长期模型已训练或可调用。',
            icon: Icons.lock_outline),
        if (self)
          tradeButton('管理创建与托管服务', busy ? null : () => records('SERVICE'),
              outline: true),
        tradeButton('返回本人档案', () => Navigator.pop(context), outline: true),
      ],
      tradeButton('重新读取数字人档案', busy ? null : load, outline: true),
    ]);
  }
}
