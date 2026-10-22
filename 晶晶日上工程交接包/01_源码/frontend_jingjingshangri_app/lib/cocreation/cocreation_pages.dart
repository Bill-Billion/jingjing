import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../trade/trade_widgets.dart';
import '../artists/artists_api.dart';
import '../artists/artists_models.dart';
import '../customization/customization_api.dart';
import '../customization/customization_models.dart';
import '../engagement/community_support.dart';
import 'cocreation_cast.dart';

class CocreationPage extends StatelessWidget {
  const CocreationPage({super.key, this.view = 'rooms', this.recordId});
  final String view;
  final String? recordId;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'cocreation',
      route:
          '/cocreation?view=$view${recordId == null ? '' : '&recordId=$recordId'}',
      title: '多人共创',
      builder: (s) => _Cocreation(session: s, view: view, id: recordId));
}

class _Cocreation extends StatefulWidget {
  const _Cocreation({required this.session, required this.view, this.id});
  final AccountSession session;
  final String view;
  final String? id;
  @override
  State<_Cocreation> createState() => _CocreationState();
}

class _CocreationState extends CommunityPageState<_Cocreation> {
  @override
  AccountSession get session => widget.session;
  @override
  String get domain => 'cocreation';
  late final title = field(),
      request = field(),
      producer = field(),
      deadline = field(),
      purpose = field(),
      territory = field(),
      invitePerson = field(),
      story = field(),
      why = field(),
      newDeadline = field();
  final casts = <CocreationCastInput>[];
  List<String> materials = [];
  List<ArtistPerson> people = [];
  List<StorySummary> stories = [];
  String? selectedRule, cursor, nextCursor;
  String caseKind = 'CANCEL';
  bool agreed = false, sharing = false, withdrawAgreed = false;
  Map<String, dynamic>? room, member;
  List<Map<String, dynamic>> rules = [], rows = [], cases = [], ownMembers = [];
  @override
  void initState() {
    super.initState();
    casts.add(CocreationCastInput(field));
    load();
  }

  @override
  void clearPrivate() {
    room = null;
    member = null;
    rules = [];
    rows = [];
    cases = [];
    ownMembers = [];
    materials = [];
    people = [];
    stories = [];
    agreed = false;
    sharing = false;
    withdrawAgreed = false;
  }

  @override
  void fail(Object e) {
    super.fail(e);
    if (e is AccountError && e.status == 412) {
      agreed = false;
      withdrawAgreed = false;
    }
  }

  @override
  Future<void> load() async {
    final t = ++ticket;
    setState(() {
      checking = true;
      error = null;
    });
    try {
      Map<String, dynamic>? d, m;
      List<Map<String, dynamic>> r = [], rs = [], cs = [], ms = [];
      String? next;
      if (widget.view == 'new') {
        rs = communityItems(await api.read('rules', account: true));
        final list = <StorySummary>[], seen = <String>{};
        String? c;
        do {
          final page = await CustomizationApi(session).page(cursor: c);
          list.addAll(page.items);
          c = page.cursor;
          communityRequire(c == null || seen.add(c));
        } while (c != null);
        if (mounted && t == ticket) stories = list;
      } else if (widget.view == 'room' ||
          widget.view == 'join' ||
          widget.view == 'member') {
        if (widget.view == 'member') {
          m = communityRecord(
              await api.read(
                  'members/${communityRequiredId(widget.id ?? '', '本人参加记录')}'),
              id: widget.id,
              kind: 'MEMBER');
          d = communityRecord(await api.read('rooms/${m['parent_id']}'),
              id: m['parent_id']);
          if (member == null) {
            story.text = communityText(communityMap(m['data'])['private_story'],
                empty: '');
            sharing = communityMap(m['data'])['sharing_allowed'] == true;
            materials = List<String>.from(
                communityMap(m['data'])['material_asset_ids']);
            casts.clear();
            for (final c in communityRows(m['cast'])) {
              casts.add(CocreationCastInput(field, initial: c));
            }
          }
        } else {
          d = communityRecord(
              await api.read(
                  'rooms/${communityRequiredId(widget.id ?? '', '共创房间')}'),
              id: widget.id);
        }
        communityRequire(d['counts'] is Map &&
            d['rule_snapshot'] is Map &&
            d['allowed_actions'] is List &&
            d['participation_sha256'] is String);
        final acts = List<String>.from(d['allowed_actions']);
        if (acts.contains('INVITE')) {
          final list = <ArtistPerson>[], seen = <String>{};
          String? c;
          do {
            final page = await ArtistsApi(session).people(cursor: c);
            list.addAll(page.items);
            c = page.cursor;
            communityRequire(c == null || seen.add(c));
          } while (c != null);
          if (mounted && t == ticket) people = list;
        }

        if (acts.contains('REQUEST_CANCEL')) {
          cs = communityItems(await api.read('rooms/${d['id']}/cases'));
        }
        ms = communityItems(await api.read('members'));
      } else if (widget.view == 'invitations') {
        r = communityItems(await api.read('invitations'));
      } else if (widget.view == 'members') {
        r = communityItems(await api.read('members'));
      } else if (widget.view == 'snippets') {
        r = communityItems(await api.read('snippets'));
      } else if (widget.view == 'benefits') {
        r = communityItems(await api.read('benefits'));
      } else {
        final page = await api.read('rooms',
            query: {'limit': 20, if (cursor != null) 'cursor': cursor});
        r = communityItems(page);
        next = page['next_cursor'];
        communityRequire(next == null || communityId(next) && next != cursor);
      }
      for (final row in [...r, ...cs, ...ms]) {
        communityRecord(row);
      }
      if (mounted && t == ticket) {
        setState(() {
          room = d;
          member = m;
          rules = rs;
          rows = r;
          cases = cs;
          ownMembers = ms;
          nextCursor = next;
        });
      }
    } catch (e) {
      if (mounted && t == ticket) setState(() => fail(e));
    } finally {
      if (mounted && t == ticket) setState(() => checking = false);
    }
  }

  @override
  Future<void> reconcilePending() async {
    final p = recoverySuffix!.split('/');
    if (p.first == 'rooms' && p.length > 1) {
      await api.read('rooms/${p[1]}');
    } else if (p.first == 'members' && p.length > 1) {
      await api.read('members/${p[1]}');
    } else {
      await api.read('rooms', query: {'limit': 20});
    }
  }

  Future<void> submit(Future<void> Function() work) async {
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => fail(e));
    }
  }

  void open(String view, [Object? id]) => Navigator.pushNamed(
      context, '/cocreation?view=$view${id == null ? '' : '&recordId=$id'}');
  Widget menu() => Wrap(spacing: 8, runSpacing: 8, children: [
        for (final x in [
          ('rooms', '我的共创'),
          ('invitations', '收到邀请'),
          ('members', '我的参加资料'),
          ('snippets', '我的片段'),
          ('benefits', '服务额度')
        ])
          OutlinedButton(onPressed: () => open(x.$1), child: Text(x.$2))
      ]);
  List<Widget> listView() {
    final kind = widget.view;
    return [
      communityHeading(
          switch (kind) {
            'invitations' => '收到的共创邀请',
            'members' => '我的参加资料',
            'snippets' => '我的专属片段',
            'benefits' => '共创服务额度',
            _ => '一起，把故事拍成电影'
          },
          '每人独立提供资料和授权，只查看属于自己的内容。'),
      menu(),
      const SizedBox(height: 20),
      if (kind == 'rooms') tradeButton('发起新的共创', () => open('new')),
      if (rows.isEmpty && !checking) appNotice('当前身份暂无相关记录。'),
      for (final r in rows)
        communitySection(
            kind == 'rooms'
                ? communityText(r['title'])
                : kind == 'benefits'
                    ? communityText(communityMap(r['data'])['description'])
                    : kind == 'snippets'
                        ? '本人片段'
                        : '共创记录 ${communityShort(r['id'])}',
            [
              communityFact('进展', communityState(r['current_status'])),
              if (kind == 'rooms') ...[
                communityFact('招募截止', communityDate(r['deadline'])),
                tradeButton('查看房间进度', () => open('room', r['id']),
                    outline: true)
              ],
              if (kind == 'invitations') ...[
                communityFact('受邀本人',
                    communityShort(communityMap(r['data'])['person_id'])),
                tradeButton('查看房间与参与条款', () => open('room', r['parent_id']),
                    outline: true)
              ],
              if (kind == 'members') ...[
                communityFact('本人资料',
                    communityShort(communityMap(r['data'])['person_id'])),
                tradeButton('查看或修订自己的资料', () => open('member', r['id']),
                    outline: true)
              ],
              if (kind == 'snippets') ...[
                communityFact('片段说明', communityMap(r['data'])['note']),
                appNotice('每次领取都会重新核对本人、授权、退款和当前成片。'),
                tradeButton(
                    '明确领取本人片段',
                    enabled && r['current_status'] == 'APPROVED'
                        ? () => savePrivate('snippets/${r['id']}/file',
                            'my-snippet-${r['id']}.mp4',
                            hash: communityMap(r['data'])['file_sha256'])
                        : null,
                    outline: true)
              ],
              if (kind == 'benefits') ...[
                communityFact('额度金额',
                    communityMoney(communityMap(r['data'])['credit_minor'])),
                communityFact('可用截止',
                    communityDate(communityMap(r['data'])['expires_at'])),
                appNotice('这是不可提现的服务权益。20人权益是一份服务额度，不能当整单免费。'),
                tradeButton(
                    '查看适用兑换与权益',
                    () => Navigator.pushNamed(context,
                        '/redemption?view=catalog&benefitId=${r['id']}'),
                    outline: true)
              ],
              communityRecordId(r)
            ]),
      if (nextCursor != null && kind == 'rooms')
        tradeButton(
            '读取下一页共创',
            enabled
                ? () {
                    setState(() => cursor = nextCursor);
                    load();
                  }
                : null,
            outline: true)
    ];
  }

  List<Widget> createView() => [
        communityHeading('发起多人共创', '先有自己的故事和明确活动规则，再邀请每位参与者。'),
        communityField(title, '共创名称'),
        communitySelect(
            '本人已提交故事',
            request.text,
            [
              for (final r in stories.where((r) => r.status != 'DRAFT'))
                (r.id, '${r.title} · 版本${r.version}')
            ],
            enabled ? (v) => setState(() => request.text = v ?? '') : null),
        appNotice(
            '发起新房间需要选择已提交故事和平台当前承制方。服务器尚未提供可安全选择的承制方目录，暂请平台协助建立；收到邀请、本人参加及已有房间办理可继续。'),
        communitySelect(
            '已发布共创规则',
            selectedRule,
            [
              for (final r in rules)
                (
                  r['id'] as String,
                  communityText(communityMap(r['rule'])['version'])
                )
            ],
            enabled ? (v) => setState(() => selectedRule = v) : null),
        if (selectedRule != null)
          communitySection('本次参与条款', [
            SelectableText(communityText(communityMap(
                    rules.firstWhere((r) => r['id'] == selectedRule)['rule'])[
                'participation_terms'])),
            appNotice('房间必须先于正式报价建立，后加房间不能沿用旧报价。')
          ]),
        communityDateField(context, deadline, '招募截止', enabled: enabled),
        communityField(purpose, '拍摄用途'),
        communityField(territory, '使用地域'),
        tradeButton('保存共创房间', null)
      ];
  List<Widget> roomView() {
    final r = room;
    if (r == null) return [];
    final count = communityMap(r['counts']),
        actions = List<String>.from(r['allowed_actions']),
        snapshot = communityMap(r['rule_snapshot']);
    return [
      communityHeading(communityText(r['title']), '参加人数、有效人数和已核定成团依据分别展示。'),
      communityFact('房间进展', communityState(r['current_status'])),
      communityFact('招募截止', communityDate(r['deadline'])),
      communitySection('当前条件', [
        communityFact('已参加人数', count['joined_count']),
        communityFact('资料授权及付款齐备', count['eligible_count']),
        communityFact('距成团还差', count['people_remaining']),
        communityFact('距服务额度还差', count['benefit_remaining']),
        communityFact(
            '原订单首款', count['payment_confirmed'] == true ? '已核实' : '尚未核实'),
        if (r['cutoff'] != null) ...[
          communityFact('已锁定有效人数', communityMap(r['cutoff'])['eligible_count']),
          communityFact(
              '核定依据时间', communityDate(communityMap(r['cutoff'])['at']))
        ],
        appNotice('达到人数不代表自动开工；仍需原订单付款、有效授权及制作审核。')
      ]),
      communitySection('每人独立确认的条款', [
        SelectableText(communityText(snapshot['participation_terms'])),
        communityFact('用途 / 地域', '${r['purpose']} / ${r['territory']}'),
        if (snapshot['benefit'] is Map)
          communityFact(
              '20人服务权益', communityMap(snapshot['benefit'])['description'])
      ]),
      if (actions.contains('INVITE'))
        communitySection('邀请具体真人参加', [
          communitySelect(
              '已关联的受邀真人',
              invitePerson.text,
              [for (final p in people) (p.id, '${p.name} · 版本${p.version}')],
              enabled
                  ? (v) => setState(() => invitePerson.text = v ?? '')
                  : null),
          if (people.isEmpty)
            appNotice('尚无可选择的已关联真人。邀请其他参与者还需平台提供安全的查找或邀请入口，不通过手填编号查人。'),
          tradeButton(
              '发送本人的共创邀请',
              enabled &&
                      r['current_status'] == 'OPEN' &&
                      people.any((p) => p.id == invitePerson.text)
                  ? () => submit(() async {
                        await act(
                            'rooms/${r['id']}/invitations',
                            {
                              'person_id':
                                  communityRequiredId(invitePerson.text, '受邀真人')
                            },
                            version: r['object_version']);
                      })
                  : null,
              outline: true)
        ]),
      if (r['current_status'] == 'OPEN')
        tradeButton('填写我本人的参加资料', () => open('join', r['id'])),
      for (final m in ownMembers.where((m) => m['parent_id'] == r['id']))
        tradeButton('查看我的参加资料', () => open('member', m['id']), outline: true),
      if (actions.contains('CLOSE'))
        tradeButton(
            '按截止条件核定人数',
            enabled
                ? () => submit(() async {
                      await act('rooms/${r['id']}/close', {},
                          version: r['object_version']);
                    })
                : null,
            outline: true),
      if (r['order_id'] != null)
        tradeButton(
            '查看原主订单与付款',
            () => Navigator.pushNamed(
                context, '/trade/record?recordId=${r['order_id']}'),
            outline: true),
      if (r['project_id'] != null)
        tradeButton(
            '查看主片制作与交付',
            () => Navigator.pushNamed(
                context, '/production/project?projectId=${r['project_id']}'),
            outline: true),
      if (actions.contains('REQUEST_CANCEL')) ...[
        communitySection('延期、取消或恢复申请', [
          communitySelect(
              '本次申请',
              caseKind,
              [
                ('CANCEL', '取消并按原约定处理退款'),
                ('EXTEND', '延期招募'),
                ('RESUME', '核对退出后恢复制作')
              ],
              enabled ? (v) => setState(() => caseKind = v!) : null),
          communityField(why, '申请原因', lines: 3),
          if (caseKind == 'EXTEND')
            communityDateField(context, newDeadline, '申请新的招募截止',
                enabled: enabled),
          tradeButton(
              '提交独立处理申请',
              enabled
                  ? () => submit(() async {
                        await act(
                            'rooms/${r['id']}/cases',
                            {
                              'kind': caseKind,
                              'reason': communityRequired(why.text, '申请原因'),
                              'new_deadline': caseKind == 'EXTEND'
                                  ? communityInstant(newDeadline.text, '新的截止时间')
                                  : null
                            },
                            version: r['object_version']);
                      })
                  : null,
              outline: true),
          tradeButton(
              '核对原退款与申请进展',
              enabled
                  ? () => act('rooms/${r['id']}/sync', {},
                      version: r['object_version'])
                  : null,
              outline: true),
          appNotice('取消批准不等于资金已退。恢复需要独立复核，退出后旧验收不会继续作为新交付依据。')
        ]),
        for (final c in cases)
          communitySection(
              '房间申请 · ${communityText(communityMap(c['data'])['kind'])}', [
            communityFact('进展', communityState(c['current_status'])),
            communityFact('申请原因', communityMap(c['data'])['reason']),
            if (communityMap(c['data'])['resolution'] != null)
              communityFact('处理结果',
                  communityMap(communityMap(c['data'])['resolution'])['reason'])
          ])
      ],
      for (final m in communityRows(r['members']))
        communityFact(
            '参与者 ${communityShort(m['person_id'])}',
            m['valid'] == true
                ? '本次条件齐备'
                : m['active'] == false
                    ? '已退出'
                    : '有条件待核对'),
      communityRecordId(r)
    ];
  }

  List<Widget> participationView() {
    final r = room;
    if (r == null) return [];
    final editing = widget.view == 'member';
    return [
      communityHeading(
          editing ? '我的参加资料' : '本人参加与授权', '只提交本人的资料。其他人的故事、素材和授权不会在此开放。'),
      communityFact('共创名称', r['title']),
      communityFact('截止时间', communityDate(r['deadline'])),
      if (member != null)
        communityFact('本人参加状态', communityState(member!['current_status'])),
      for (final (i, c) in casts.indexed)
        communitySection('本人形象 ${i + 1}', [
          c.chooser(session,
              enabled: enabled && r['current_status'] == 'OPEN',
              changed: () => setState(() {})),
          if (casts.length > 1)
            TextButton(
                onPressed:
                    enabled ? () => setState(() => casts.removeAt(i)) : null,
                child: const Text('移除此处的形象引用'))
        ]),
      if (casts.length < 4)
        tradeButton(
            '增加本人另一形象',
            enabled
                ? () => setState(() => casts.add(CocreationCastInput(field)))
                : null,
            outline: true),
      communityField(story, '我本人的私人故事', lines: 5),
      communitySection('我本人的私有素材', [
        SupplyFiles(
            api: SupplyApi(session),
            purpose: 'AVATAR_MATERIAL',
            ids: materials,
            enabled: enabled,
            onChanged: enabled ? (v) => setState(() => materials = v) : null)
      ]),
      communitySection('核对本次参与条款', [
        SelectableText(communityText(
            communityMap(r['rule_snapshot'])['participation_terms'])),
        communityCheck('允许我本人片段按本次约定分享', sharing,
            enabled ? (v) => setState(() => sharing = v == true) : null),
        communityCheck('我已核对本人、形象、资料与本次参与条款，并明确同意', agreed,
            enabled ? (v) => setState(() => agreed = v == true) : null),
        tradeButton(
            editing ? '确认修订自己的参加资料' : '确认本人参加',
            enabled && agreed && r['current_status'] == 'OPEN'
                ? () => submit(() async {
                      final cast = casts.map((c) => c.value()).toList();
                      if (cast.map((c) => c['person_id']).toSet().length != 1) {
                        throw const AccountError(400, '同一参加人只能填写本人的形象');
                      }
                      if (materials.isEmpty) {
                        throw const AccountError(400, '请先上传本人的素材');
                      }
                      final body = {
                        'cast': cast,
                        'private_story': story.text,
                        'material_asset_ids': materials,
                        'sharing_allowed': sharing,
                        'participation_sha256': r['participation_sha256'],
                        'agreed': true,
                        if (!editing) 'person_id': cast.first['person_id']
                      };
                      final out = await act(
                          editing
                              ? 'members/${member!['id']}'
                              : 'rooms/${r['id']}/members',
                          body,
                          version: editing ? member!['object_version'] : null,
                          reload: false,
                          validate: (v) => communityRecord(v, kind: 'MEMBER'));
                      if (out != null && mounted) {
                        setState(() => agreed = false);
                        open('member', out['id']);
                      }
                    })
                : null)
      ]),
      if (editing && member!['current_status'] == 'ACTIVE')
        communitySection('退出本次共创', [
          communityField(why, '退出原因', lines: 3),
          communityCheck(
              '我知道退出会停止自己的资料和旧片段继续使用，退款另按原约定处理',
              withdrawAgreed,
              enabled
                  ? (v) => setState(() => withdrawAgreed = v == true)
                  : null),
          tradeButton(
              '确认本人退出',
              enabled && withdrawAgreed
                  ? () => submit(() async {
                        await act('members/${member!['id']}/withdraw',
                            {'reason': communityRequired(why.text, '退出原因')},
                            version: member!['object_version']);
                        setState(() => withdrawAgreed = false);
                      })
                  : null,
              outline: true)
        ]),
      if (editing) communityRecordId(member!)
    ];
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      '多人共创',
      [
        ...feedback,
        ...switch (widget.view) {
          'new' => createView(),
          'room' => roomView(),
          'join' || 'member' => participationView(),
          _ => listView()
        },
        tradeButton('重新读取当前记录', busy ? null : load, outline: true)
      ],
      locked: recovery != null);
}
