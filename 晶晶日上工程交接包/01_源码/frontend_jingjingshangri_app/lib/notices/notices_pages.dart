import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../stock/v5_support.dart';
import '../stock/v5_media.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../trade/trade_widgets.dart';
import 'notices_api.dart';
import 'notices_models.dart';
import 'notices_submission.dart';

class NoticesPage extends StatelessWidget {
  const NoticesPage({super.key, this.mode = 'catalog', this.id, this.kind});
  final String mode;
  final String? id, kind;
  @override
  Widget build(BuildContext context) => V5Gate(
      domain: 'notices',
      route: '/notices/$mode',
      account: ['catalog', 'public'].contains(mode),
      builder: (s) => mode == 'submit'
          ? NoticesSubmission(session: s, noticeId: id, kind: kind ?? 'PROFILE')
          : _NoticeScreen(session: s, mode: mode, id: id, kind: kind));
}

class _NoticeScreen extends StatefulWidget {
  const _NoticeScreen(
      {required this.session, required this.mode, this.id, this.kind});
  final AccountSession session;
  final String mode;
  final String? id, kind;
  @override
  State<_NoticeScreen> createState() => _NoticeScreenState();
}

class _NoticeScreenState extends State<_NoticeScreen> {
  late final api = NoticesApi(widget.session);
  final city = TextEditingController(), at = TextEditingController();
  final publicRows = <NoticePublic>[],
      rows = <NoticeRecord>[],
      rules = <NoticeRule>[];
  NoticePublic? publicNotice;
  NoticeRecord? record;
  NoticeEligibility? eligibility;
  String? cursor, error, type, ruleId;
  String recordKind = 'SUBMISSION';
  bool busy = false;
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    recordKind = widget.kind ?? 'SUBMISSION';
    load();
  }

  @override
  void dispose() {
    ticket++;
    city.dispose();
    at.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    if (more && cursor == null) return;
    final t = ++ticket,
        epoch = widget.session.epoch,
        p = widget.session.partyId;
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        publicRows.clear();
        rows.clear();
        cursor = null;
      }
    });
    try {
      switch (widget.mode) {
        case 'catalog':
          final r = await api.catalog(
              cursor: more ? cursor : null,
              type: type,
              city: city.text.trim(),
              at: at.text.trim().isEmpty ? null : v5InputDate(at.text));
          publicRows.addAll(r.items);
          cursor = r.cursor;
        case 'public':
          publicNotice = await api.publicNotice(widget.id ?? '');
        case 'records':
          final r = await api.records(recordKind, cursor: more ? cursor : null);
          rows.addAll(r.items);
          cursor = r.cursor;
        case 'record':
          record = await api.record(widget.id ?? '');
        case 'new':
          rules.clear();
          String? next;
          final seen = <String>{};
          do {
            final r = await api.rules(cursor: next);
            rules.addAll(r.items);
            next = r.cursor;
            if (next != null) v5Require(seen.add(next));
          } while (next != null);
        case 'qualification':
          break;
        default:
          throw const AccountError(400, 'INVALID_PATH');
      }
      api.check(epoch, ['catalog', 'public'].contains(widget.mode) ? null : p);
      if (mounted && t == ticket) setState(() {});
    } on AccountError catch (e) {
      if (mounted && t == ticket) setState(() => error = v5Error(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> chooseRule(String id) async {
    setState(() {
      busy = true;
      error = null;
      ruleId = id;
      eligibility = null;
    });
    try {
      final e = await api.eligibility(id);
      if (mounted) setState(() => eligibility = e);
    } on AccountError catch (e) {
      if (mounted) setState(() => error = v5Error(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void go(String route) => Navigator.pushNamed(context, route);
  List<Widget> noticeFacts(Map<String, dynamic> n) => [
        tradeFact('类型', noticeTypes[n['type']]),
        tradeFact('城市', n['city']),
        tradeFact('说明', n['description']),
        for (final f in noticeDetailFields[n['type']]!.entries)
          tradeFact(f.value, n['details'][f.key]),
        tradeFact('开始', tradeDate(n['valid_from'])),
        tradeFact('截止', tradeDate(n['valid_until']))
      ];
  @override
  Widget build(BuildContext context) {
    final r = record, n = publicNotice;
    final title = switch (widget.mode) {
      'new' => '发布通告',
      'public' => '通告详情',
      'record' => '投稿与客服进度',
      'records' => '我的通告与投稿',
      'qualification' => '机构发布资格',
      _ => '通告现场'
    };
    return V5Frame(api: api, title: title, children: [
      tradeHeading(title, eyebrow: '单向意向 / 交给明确的人处理'),
      V5RecoveryPanel(
          api: api,
          label: api.recoveryLabel,
          restore: api.restoreOperation,
          onRestored: (r) => go('/notices/record?recordId=${r['id']}')),
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!, icon: Icons.error_outline),
      if (widget.mode == 'catalog') ...[
        DropdownButtonFormField<String>(
            initialValue: type,
            isExpanded: true,
            decoration: const InputDecoration(labelText: '六类通告'),
            items: [
              const DropdownMenuItem(value: '', child: Text('全部类型')),
              for (final e in noticeTypes.entries)
                DropdownMenuItem(value: e.key, child: Text(e.value))
            ],
            onChanged:
                busy ? null : (v) => setState(() => type = v == '' ? null : v)),
        TextField(
            controller: city,
            decoration: const InputDecoration(labelText: '城市（可留空）')),
        v5DateField(context,
            label: '指定有效时间（可留空）',
            value: at.text,
            controller: at,
            enabled: !busy,
            required: false,
            onChanged: (v) => setState(() => at.text = v)),
        tradeButton('筛选通告', busy ? null : () => load(), outline: true),
        for (final item in publicRows)
          tradeSection(item.notice['title'], [
            Text(
                '${noticeTypes[item.notice['type']]} · ${item.notice['city']}'),
            tradeFact('截止', tradeDate(item.notice['valid_until'])),
            tradeButton(
                '查看这份通告', () => go('/notices/public?noticeId=${item.id}'),
                outline: true)
          ]),
        if (!busy && publicRows.isEmpty) appNotice('当前筛选没有仍有效的已审公开通告。'),
        tradeButton('核对资格并发布通告', () => go('/notices/new')),
        tradeButton('我的投稿与接收箱', () => go('/notices/records?kind=SUBMISSION'),
            outline: true),
        tradeButton('我的已发通告', () => go('/notices/records?kind=NOTICE'),
            outline: true),
        tradeButton('合作客服处理', () => go('/notices/records?kind=CASE'),
            outline: true),
      ],
      if (n != null) ...[
        tradeSection(n.notice['title'], noticeFacts(n.notice)),
        appNotice(n.raw['official'] == true
            ? '此为平台官方发布；普通机构不能冒用官方身份。'
            : '通告经独立审核。投稿仅单向递交，不自动付款、签约或开放私聊。'),
        if (n.notice['accept_submissions'] == true)
          for (final k in ['PROFILE', 'ROLE', 'CREATE_DRAMA'])
            tradeButton(submissionKinds[k]!,
                () => go('/notices/submit?noticeId=${n.id}&kind=$k'),
                outline: k != 'PROFILE')
      ],
      if (widget.mode == 'new') ...[
        appNotice('发布资格由服务器按可信事实和当前规则计算；普通实名不能替代星探或机构资质。官方事项请由有权运营在网页办理。'),
        DropdownButtonFormField<String>(
            initialValue: ruleId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: '选择已生效发布规则'),
            items: rules
                .map((x) => DropdownMenuItem(
                    value: x.id,
                    child: Text(
                        '${x.rule['version']} · 投稿${x.rule['submission_days']}天')))
                .toList(),
            onChanged: busy ? null : (v) => chooseRule(v!)),
        if (ruleId != null) ...[
          tradeSection('本版规则', [
            SelectableText(
                rules.firstWhere((x) => x.id == ruleId).rule['terms']),
            if (eligibility != null) ...[
              tradeFact(
                  '可发布类型',
                  (eligibility!.raw['types'] as List)
                      .map((t) => noticeTypes[t])
                      .join('、')),
              tradeFact('实际资格等级', eligibility!.raw['level']),
              tradeFact('原因', eligibility!.raw['reason'] ?? '当前资格有效')
            ]
          ]),
          if (eligibility != null && eligibility!.raw['active'] != true)
            appNotice('当前没有正式发布资格。机构请独立提交资质；个人可在钱包查看会员年和消费成长依据。'),
          tradeButton('查看个人钱包与资格', () => go('/wallet'), outline: true),
          if (widget.session.party?['kind'] == 'ORGANIZATION')
            tradeButton('申请机构发布资格', () => go('/notices/qualification'),
                outline: true)
        ],
        if (eligibility != null) ...[
          DropdownButtonFormField<String>(
              initialValue: eligibility!.canPublish(type ?? '') ? type : null,
              isExpanded: true,
              decoration: const InputDecoration(labelText: '本次可发布类型'),
              items: (eligibility!.raw['types'] as List)
                  .where((x) => x != 'OFFICIAL')
                  .map((x) => DropdownMenuItem<String>(
                      value: x, child: Text(noticeTypes[x]!)))
                  .toList(),
              onChanged: busy ? null : (v) => setState(() => type = v)),
          if (type != null && eligibility!.canPublish(type!)) _noticeForm(type!)
        ],
      ],
      if (widget.mode == 'qualification') ...[
        if (widget.session.party?['kind'] != 'ORGANIZATION')
          appNotice('此项仅适用于机构负责人；个人资格从个人账本和会员事实核对。')
        else
          V5Form(
              api: api,
              title: '机构资质',
              action: '提交机构独立资质审核',
              suffix: '/qualifications',
              fields: [
                for (final e
                    in noticeTypes.entries.where((x) => x.key != 'OFFICIAL'))
                  V5Field('type_${e.key}', '申请发布${e.value}',
                      type: 'bool', required: false),
                const V5Field('valid_from', '资质生效时间', type: 'datetime'),
                const V5Field('valid_until', '资质截止时间', type: 'datetime'),
                const V5Field('terms', '资质与业务范围', type: 'multiline')
              ],
              restore: (b) => {
                    ...b,
                    for (final t in b['types']) 'type_$t': true,
                    'evidence_asset_ids':
                        (b['evidence_asset_ids'] as List).join(', ')
                  },
              buildBody: (v) {
                final types = noticeTypes.keys
                    .where((k) => k != 'OFFICIAL' && v['type_$k'] == true)
                    .toList();
                final ids = v5InputIds(v['evidence_asset_ids'] ?? '');
                if (types.isEmpty || ids.isEmpty) {
                  throw const AccountError(400, 'NOTICE_QUALIFICATION_INVALID');
                }
                return {
                  'types': types,
                  'valid_from': v5InputDate(v['valid_from']),
                  'valid_until': v5InputDate(v['valid_until']),
                  'terms': v['terms'],
                  'evidence_asset_ids': ids
                };
              },
              parse: api.validateRecord,
              onSuccess: (d) => go('/notices/record?recordId=${d['id']}'),
              extra: (v, set, enabled) => [
                    SupplyFiles(
                        api: SupplyApi(widget.session),
                        purpose: 'RIGHTS_EVIDENCE',
                        ids: v5InputIds(v['evidence_asset_ids'] ?? ''),
                        enabled: enabled,
                        onChanged: (ids) =>
                            set('evidence_asset_ids', ids.join(', ')))
                  ])
      ],
      if (widget.mode == 'records') ...[
        DropdownButtonFormField<String>(
            initialValue: recordKind,
            decoration: const InputDecoration(labelText: '查看本人记录'),
            items: const [
              DropdownMenuItem(value: 'SUBMISSION', child: Text('投稿与被投稿')),
              DropdownMenuItem(value: 'NOTICE', child: Text('我发布的通告')),
              DropdownMenuItem(value: 'CASE', child: Text('客服处理')),
              DropdownMenuItem(value: 'QUALIFICATION', child: Text('机构资质'))
            ],
            onChanged: busy
                ? null
                : (v) {
                    setState(() => recordKind = v!);
                    load();
                  }),
        for (final x in rows)
          tradeSection(x.title, [
            tradeFact('状态', noticeStates[x.status]),
            tradeFact(
                '方向',
                x.raw['owner_party_id'] == widget.session.partyId
                    ? '我发出'
                    : '我接收'),
            tradeButton('查看具体进度', () => go('/notices/record?recordId=${x.id}'),
                outline: true)
          ]),
        if (!busy && rows.isEmpty) appNotice('当前没有本类型的可读记录。'),
      ],
      if (r != null) ..._recordBody(r),
      if (cursor != null)
        tradeButton('继续读取下一页', busy ? null : () => load(more: true),
            outline: true),
      tradeButton('重新读取', busy ? null : () => load(), outline: true),
    ]);
  }

  Widget _noticeForm(String type) => V5Form(
      key: ValueKey('$ruleId:$type'),
      api: api,
      title: '按类型填写',
      action: '提交正式通告审核',
      suffix: '/announcements',
      initial: {'type': type},
      restore: (b) => {...v5Map(b['notice']), ...v5Map(b['notice']['details'])},
      fields: [
        const V5Field('title', '通告标题'),
        const V5Field('description', '通告说明', type: 'multiline'),
        const V5Field('city', '城市'),
        const V5Field('valid_from', '开始时间', type: 'datetime'),
        const V5Field('valid_until', '截止时间', type: 'datetime'),
        for (final e in noticeDetailFields[type]!.entries)
          V5Field(e.key, e.value, type: 'multiline'),
        if (['DRAMA', 'RECRUITMENT'].contains(type))
          const V5Field('accept_submissions', '接受单向投稿',
              type: 'bool', required: false)
      ],
      buildBody: (v) => {
            'rule_id': ruleId,
            'notice': {
              'type': type,
              'title': v['title'],
              'description': v['description'],
              'city': v['city'],
              'valid_from': v5InputDate(v['valid_from']),
              'valid_until': v5InputDate(v['valid_until']),
              'details': {
                for (final k in noticeDetailFields[type]!.keys) k: v[k]
              },
              'project_id': null,
              'accept_submissions': ['DRAMA', 'RECRUITMENT'].contains(type) &&
                  v['accept_submissions'] == true
            }
          },
      parse: api.validateRecord,
      onSuccess: (d) => Navigator.pushReplacementNamed(
          context, '/notices/record?recordId=${d['id']}'));
  List<Widget> _recordBody(NoticeRecord r) => [
        tradeSection(r.title, [
          tradeFact('当前状态', noticeStates[r.status]),
          if (r.raw['expired'] == true) appNotice('本投稿已经过期，不能继续撮合。'),
          if (r.data['review'] != null)
            tradeFact('独立审核说明', r.data['review']['reason'])
        ]),
        if (r.kind == 'NOTICE') ...noticeFacts(v5Map(r.data['notice'])),
        if (r.kind == 'SUBMISSION') ...[
          tradeSection('本次单向投稿', [
            tradeFact('具体真人', '本次指定真人'),
            tradeFact('具体数字人', '本次指定数字人'),
            tradeFact('用途', r.data['submission']['purpose']),
            tradeFact('内容', r.data['submission']['content']),
            if (r.data['submission']['role'] != null)
              tradeFact('角色', r.data['submission']['role']),
            tradeFact('截止', tradeDate(r.data['expires_at'])),
            ExpansionTile(
                tilePadding: EdgeInsets.zero,
                childrenPadding: const EdgeInsets.only(bottom: 12),
                title: const Text('记录依据'),
                children: [
                  for (final entry in const {
                    'person_id': '真人记录',
                    'avatar_id': '数字人记录'
                  }.entries)
                    tradeFact(entry.value,
                        '${(r.data['submission'][entry.key] as String).substring(0, 8)}…${(r.data['submission'][entry.key] as String).substring(30)}')
                ])
          ]),
          for (final id in r.data['submission']['material_asset_ids'])
            V5Media(
                api: api,
                type: 'file',
                fileName: '$id.bin',
                label: '读取本次私有附件',
                load: () => api.bytes('/records/${r.id}/materials/$id',
                    max: 8 * 1024 * 1024)),
          appNotice('感兴趣只生成一次平台客服待办。没有自由聊天、付款、签约或授角事实。'),
          if (r.status == 'SENT' &&
              r.raw['counterparty_id'] == widget.session.partyId &&
              r.raw['expired'] != true)
            V5Form(
                api: api,
                title: '本次意向回复',
                action: '确认本次回复',
                suffix: '/submissions/${r.id}/decision',
                version: r.version,
                fields: const [
                  V5Field('decision', '本次回复',
                      choices: {'INTERESTED': '感兴趣，交给客服', 'DECLINE': '婉拒并结束'})
                ],
                buildBody: (v) => {'decision': v['decision']},
                parse: api.validateRecord,
                reload: () async => (await api.record(r.id)).version,
                onSuccess: (_) => load()),
          if (r.data['case_id'] != null)
            tradeButton('查看同一客服工单',
                () => go('/notices/record?recordId=${r.data['case_id']}'),
                outline: true),
          if (r.status == 'INTERESTED' &&
              r.data['submission']['kind'] == 'INVITATION' &&
              r.raw['owner_party_id'] == widget.session.partyId)
            tradeButton('查看本邀约可匹配的试镜方案',
                () => go('/auditions/catalog?invitationId=${r.id}'),
                outline: true),
        ],
        if (r.kind == 'CASE') ...[
          appNotice(r.status == 'WAITING_SUPPORT'
              ? '等待有权客服核对双方、具体数字人和已审商单报价。'
              : '客服办理状态以本记录为准；报价另由买家确认。'),
          if (r.data['quote'] != null) ...[
            tradeFact('原报价指纹', r.data['quote']['content_sha256']),
            if (r.data['quote']['buyer_party_id'] == widget.session.partyId)
              tradeButton('查看并确认原已审报价',
                  () => go('/trade/record?recordId=${r.data['quote']['id']}'))
          ],
          if (r.raw['order_id'] != null)
            tradeButton('查看原订单',
                () => go('/trade/record?recordId=${r.raw['order_id']}'),
                outline: true),
          tradeButton('查看原投稿',
              () => go('/notices/record?recordId=${r.data['submission_id']}'),
              outline: true)
        ],
        if (r.kind == 'QUALIFICATION') ...[
          tradeFact('申请类型',
              (r.data['types'] as List).map((t) => noticeTypes[t]).join('、')),
          tradeFact('有效开始', tradeDate(r.data['valid_from'])),
          tradeFact('有效截止', tradeDate(r.data['valid_until'])),
          tradeFact('业务范围', r.data['terms'])
        ],
        if (r.raw['owner_party_id'] == widget.session.partyId &&
            ['NOTICE', 'SUBMISSION', 'QUALIFICATION'].contains(r.kind) &&
            !['WITHDRAWN', 'REJECTED'].contains(r.status))
          V5Form(
              api: api,
              title: '撤回本记录',
              action: '明确撤回本记录',
              suffix: '/records/${r.id}/close',
              version: r.version,
              fields: const [V5Field('reason', '撤回原因', type: 'multiline')],
              buildBody: (v) => {'reason': v['reason']},
              parse: api.validateRecord,
              reload: () async => (await api.record(r.id)).version,
              onSuccess: (_) => load()),
      ];
}
