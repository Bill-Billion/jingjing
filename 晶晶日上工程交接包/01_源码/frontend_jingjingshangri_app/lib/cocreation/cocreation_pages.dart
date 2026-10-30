import 'dart:async';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_theme.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../trade/trade_widgets.dart';
import '../artists/artists_api.dart';
import '../artists/artists_models.dart';
import '../customization/customization_api.dart';
import '../customization/customization_models.dart';
import '../customization/private_draft_guard.dart';
import '../engagement/community_support.dart';
import 'cocreation_cast.dart';
import 'creation_options.dart';

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
  final draftGuard = GlobalKey<PrivateDraftGuardState>();
  bool initializedDraft = false;
  final previousCursors = <String?>[];
  @override
  AccountSession get session => widget.session;
  @override
  String get domain => 'cocreation';
  @override
  bool get enabled => super.enabled && !checking;
  bool get personalCreator => session.party?['kind'] == 'PERSON';
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
  String? selectedRule, cursor, nextCursor, creationStory, creationIssue;
  int creationTicket = 0;
  bool readingCreation = false;
  List<Map<String, dynamic>> producers = [];
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
    creationTicket++;
    readingCreation = false;
    creationStory = null;
    creationIssue = null;
    selectedRule = null;
    producers = [];
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
    if (widget.view == 'new' &&
        e is AccountError &&
        cocreationCreationMessages.containsKey(e.code)) {
      creationIssue = e.code == 'COCREATION_DEADLINE_PASSED' ? null : e.code;
      error = cocreationCreationMessages[e.code];
      agreed = false;
      if (e.code != 'COCREATION_DEADLINE_PASSED') clearCreation();
      return;
    }
    super.fail(e);
    if (e is AccountError && e.status == 412) {
      agreed = false;
      withdrawAgreed = false;
    }
  }

  @override
  Future<void> load() async {
    final t = ++ticket;
    final hadDraft = draftGuard.currentState?.dirty ?? false;
    setState(() {
      checking = true;
      error = null;
    });
    try {
      if (widget.view == 'new' && !personalCreator) return;
      Map<String, dynamic>? d, m;
      List<Map<String, dynamic>> r = [], rs = [], cs = [], ms = [];
      String? next;
      if (widget.view == 'new') {
        final list = <StorySummary>[], seen = <String>{};
        String? c;
        do {
          final page = await CustomizationApi(session).page(cursor: c);
          list.addAll(page.items);
          c = page.cursor;
          communityRequire(c == null || seen.add(c));
        } while (c != null);
        if (mounted && t == ticket) {
          stories = list;
          if (!initializedDraft &&
              widget.id != null &&
              list.any((s) =>
                  s.id == widget.id &&
                  ['SUBMITTED', 'INTAKE'].contains(s.status))) {
            request.text = widget.id!;
          }
        }
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
          if (widget.view != 'new') rules = rs;
          rows = r;
          cases = cs;
          ownMembers = ms;
          nextCursor = next;
        });
        if (!initializedDraft) {
          initializedDraft = true;
          if (!hadDraft) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              draftGuard.currentState?.markSaved();
            });
          }
        }
      }
    } catch (e) {
      if (mounted && t == ticket) setState(() => fail(e));
    } finally {
      if (mounted && t == ticket) setState(() => checking = false);
    }
    if (mounted &&
        t == ticket &&
        widget.view == 'new' &&
        recovery == null &&
        communityId(request.text)) {
      await readCreation();
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

  @override
  Future<void> recovered(Map<String, dynamic> value) async {
    if (widget.view == 'new') {
      enterCreatedRoom(value);
    } else {
      await super.recovered(value);
      if (mounted) draftGuard.currentState?.markSaved();
    }
  }

  Future<void> submit(Future<void> Function() work) async {
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => fail(e));
    }
  }

  @override
  Future<Map<String, dynamic>?> act(String suffix, Map<String, dynamic> body,
      {int? version,
      bool account = false,
      String method = 'POST',
      bool reload = true,
      FutureOr<void> Function(Map<String, dynamic>)? validate}) async {
    final out = await super.act(suffix, body,
        version: version,
        account: account,
        method: method,
        reload: reload,
        validate: validate);
    if (out != null && mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        draftGuard.currentState?.markSaved();
      });
    }
    return out;
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
      if (rows.isEmpty && !checking && error == null) appNotice('当前身份暂无相关记录。'),
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
      if (previousCursors.isNotEmpty && kind == 'rooms')
        tradeButton(
            '返回上一页共创',
            enabled && !checking
                ? () {
                    setState(() => cursor = previousCursors.removeLast());
                    load();
                  }
                : null,
            outline: true),
      if (nextCursor != null && kind == 'rooms')
        tradeButton(
            '读取下一页共创',
            enabled && !checking
                ? () {
                    setState(() {
                      previousCursors.add(cursor);
                      cursor = nextCursor;
                    });
                    load();
                  }
                : null,
            outline: true)
    ];
  }

  void clearCreation() {
    creationTicket++;
    readingCreation = false;
    creationStory = null;
    producers = [];
    rules = [];
    producer.clear();
    selectedRule = null;
    agreed = false;
  }

  Future<void> readCreation() async {
    if (!communityId(request.text) || !enabled) return;
    final storyId = request.text;
    setState(() {
      clearCreation();
      creationIssue = null;
      error = null;
      readingCreation = true;
    });
    final serial = creationTicket;
    try {
      final options = await CocreationCreationOptions.load(api, storyId);
      if (!mounted || serial != creationTicket || request.text != storyId) {
        return;
      }
      setState(() {
        producers = options.producers;
        rules = options.rules;
        creationStory = storyId;
        creationIssue = options.reason;
      });
    } catch (e) {
      if (mounted && serial == creationTicket && request.text == storyId) {
        setState(() => fail(e));
      }
    } finally {
      if (mounted && serial == creationTicket) {
        setState(() => readingCreation = false);
      }
    }
  }

  bool get creationReady =>
      enabled &&
      !readingCreation &&
      creationIssue == null &&
      creationStory == request.text &&
      producers.any((p) => p['id'] == producer.text) &&
      rules.any((r) => r['id'] == selectedRule);

  @override
  FutureOr<void> validateResult(Map<String, dynamic> value) {
    super.validateResult(value);
    if (widget.view == 'new') {
      final body = recovery == null
          ? {
              'producer_party_id': producer.text,
              'title': title.text.trim(),
              'purpose': purpose.text.trim(),
              'territory': territory.text.trim(),
              'deadline': communityInstant(deadline.text, '招募截止时间'),
            }
          : communityMap(recovery!['body']);
      communityRequire(value['current_status'] == 'OPEN' &&
          value['rule_snapshot'] is Map &&
          value['counts'] is Map &&
          value['participation_sha256'] is String &&
          RegExp(r'^[a-f0-9]{64}$').hasMatch(value['participation_sha256']) &&
          value['allowed_actions'] is List &&
          (value['allowed_actions'] as List).contains('INVITE') &&
          ['producer_party_id', 'title', 'purpose', 'territory']
              .every((k) => value[k] == body[k]) &&
          DateTime.tryParse('${value['deadline']}') ==
              DateTime.tryParse('${body['deadline']}'));
    }
  }

  void enterCreatedRoom(Map<String, dynamic> value) {
    if (!mounted) return;
    draftGuard.currentState?.markSaved();
    Navigator.pushReplacementNamed(
        context, '/cocreation?view=room&recordId=${value['id']}');
  }

  Future<void> createRoom() => submit(() async {
        if (!creationReady || !agreed) return;
        final until = communityInstant(deadline.text, '招募截止时间');
        if (!DateTime.parse(until).isAfter(DateTime.now())) {
          throw const AccountError(400, 'COCREATION_DEADLINE_PASSED');
        }
        final r = await act(
            'rooms',
            {
              'request_id': communityRequiredId(request.text, '本人已提交故事'),
              'rule_id': communityRequiredId(selectedRule ?? '', '共创规则'),
              'producer_party_id': communityRequiredId(producer.text, '本次承制方'),
              'title': communityRequired(title.text, '共创名称', max: 200),
              'deadline': until,
              'purpose': communityRequired(purpose.text, '拍摄用途', max: 100),
              'territory': communityRequired(territory.text, '使用地域', max: 100),
            },
            reload: false);
        if (r != null) enterCreatedRoom(r);
      });

  List<Widget> createView() => !personalCreator
      ? [
          communityHeading('发起多人共创', '共创由本人个人身份发起。'),
          appNotice('当前是机构身份，请先切换到本人个人身份，再选择自己已提交的故事。'),
          tradeButton('核对账号与身份', () => Navigator.pushNamed(context, '/account'))
        ]
      : [
          communityHeading('发起多人共创', '选择自己的已提交故事，确认本次承制方与规则。建房后再逐人邀请。'),
          communitySelect(
              '本人已提交故事',
              request.text,
              [
                for (final r in stories
                    .where((r) => ['SUBMITTED', 'INTAKE'].contains(r.status)))
                  (r.id, '${r.title} · 版本${r.version}')
              ],
              enabled
                  ? (v) {
                      setState(() {
                        request.text = v ?? '';
                        clearCreation();
                        creationIssue = null;
                      });
                      readCreation();
                    }
                  : null),
          if (!checking &&
              stories.every((r) => !['SUBMITTED', 'INTAKE'].contains(r.status)))
            appNotice('请先正式提交一份自己的故事，再回来建立共创房间。'),
          tradeButton('查看或继续填写我的故事',
              () => Navigator.pushNamed(context, '/customization'),
              outline: true),
          if (readingCreation) const LinearProgressIndicator(),
          if (creationIssue != null) ...[
            appNotice(cocreationCreationMessages[creationIssue] ??
                '当前暂不能建立共创房间，请重新核对原故事。'),
            if (creationIssue == 'COCREATION_ROOM_EXISTS')
              tradeButton('前往我的共创', () => open('rooms'), outline: true),
            if ([
              'COCREATION_BEFORE_QUOTE_REQUIRED',
              'CUSTOMIZATION_ORDER_EXISTS'
            ].contains(creationIssue))
              tradeButton(
                  '查看我的报价与订单', () => Navigator.pushNamed(context, '/trade'),
                  outline: true),
          ],
          tradeButton(
              '重新读取本故事的承制方与规则',
              enabled && !readingCreation && communityId(request.text)
                  ? readCreation
                  : null,
              outline: true),
          communityField(title, '共创名称', enabled: enabled),
          communitySelect(
              '本次获准承制方',
              producer.text,
              [
                for (final p in producers)
                  (p['id'] as String, p['display_name'] as String)
              ],
              enabled && !readingCreation
                  ? (v) => setState(() {
                        producer.text = v ?? '';
                        agreed = false;
                      })
                  : null),
          if (creationStory != null &&
              producers.isEmpty &&
              creationIssue == null)
            appNotice('当前没有可供本故事选择的承制方，请稍后重新读取。'),
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
              enabled && !readingCreation
                  ? (v) => setState(() {
                        selectedRule = v;
                        agreed = false;
                      })
                  : null),
          if (creationStory != null && rules.isEmpty)
            appNotice('当前暂无生效共创规则，请稍后重新读取。'),
          if (selectedRule != null && rules.any((r) => r['id'] == selectedRule))
            communitySection('本次参与条款', [
              SelectableText(communityText(communityMap(
                      rules.firstWhere((r) => r['id'] == selectedRule)['rule'])[
                  'participation_terms'])),
              communityFact(
                  '人数上限',
                  communityMap(rules.firstWhere(
                      (r) => r['id'] == selectedRule)['rule'])['max_people']),
              appNotice('房间须先于正式报价建立。每位参与者仍须独立确认自己的资料和授权。')
            ]),
          communityDateField(context, deadline, '招募截止', enabled: enabled),
          communityField(purpose, '拍摄用途', enabled: enabled),
          communityField(territory, '使用地域', enabled: enabled),
          appNotice('保存后进入本房间的邀请与进度页。建房本身不发出邀请，也不产生费用。'),
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: agreed,
              onChanged: creationReady
                  ? (v) => setState(() => agreed = v == true)
                  : null,
              title: const Text('已核对本故事、承制方与参与条款，确认建立共创房间')),
          tradeButton('保存共创房间', creationReady && agreed ? createRoom : null)
        ];
  List<Widget> roomView() {
    final r = room;
    if (r == null) return [];
    final count = communityMap(r['counts']),
        actions = List<String>.from(r['allowed_actions']),
        snapshot = communityMap(r['rule_snapshot']);
    final joined = count['joined_count'],
        eligible = count['eligible_count'],
        benefitRemaining = count['benefit_remaining'];
    return [
      communityHeading('一起完成这部戏', '参加人数、有效人数和已核定成团依据分别展示。',
          eyebrow: '共创计划 / 每人独立确认'),
      tradeBanner(
          communityText(r['title']), communityState(r['current_status'])),
      const Text('已参加人数',
          style: TextStyle(color: AccountTheme.muted, fontSize: 13)),
      const SizedBox(height: 8),
      Text('${count['joined_count']}人',
          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
      const SizedBox(height: 16),
      communityFact('招募截止', communityDate(r['deadline'])),
      if (eligible is int &&
          joined is int &&
          joined > 0 &&
          eligible >= 0 &&
          eligible <= joined)
        roomProgress('资料授权及付款齐备', eligible, joined),
      communitySection('当前条件', [
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
      if (eligible is int &&
          benefitRemaining is int &&
          eligible >= 0 &&
          benefitRemaining >= 0 &&
          eligible + benefitRemaining > 0)
        roomProgress('服务额度人数进度', eligible, eligible + benefitRemaining),
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
          communityField(why, '申请原因', lines: 3, enabled: enabled),
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

  Widget roomProgress(String label, int current, int total) =>
      communitySection(label, [
        LinearProgressIndicator(
            value: current / total,
            minHeight: 3,
            color: AccountTheme.vermilion,
            backgroundColor: AccountTheme.border),
        const SizedBox(height: 10),
        Text('$current / $total 人',
            style: const TextStyle(color: AccountTheme.muted)),
      ]);

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
      communityField(story, '我本人的私人故事', lines: 5, enabled: enabled),
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
          communityField(why, '退出原因', lines: 3, enabled: enabled),
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
  Widget build(BuildContext context) => PrivateDraftGuard(
      key: draftGuard,
      session: session,
      controllers: controllers,
      value: () => [
            selectedRule,
            materials,
            agreed,
            sharing,
            withdrawAgreed,
            caseKind,
            casts.length
          ],
      locked: busy || recovery != null,
      child: tradeScaffold(
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
            tradeButton('重新读取当前记录', busy || checking ? null : load,
                outline: true)
          ],
          onBack: () => draftGuard.currentState?.back()));
}
