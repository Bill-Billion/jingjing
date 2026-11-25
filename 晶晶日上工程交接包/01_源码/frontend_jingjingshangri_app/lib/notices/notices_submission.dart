import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../account/account_theme.dart';
import '../artists/artists_api.dart';
import '../artists/artists_models.dart';
import '../stock/v5_support.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../trade/trade_widgets.dart';
import 'notices_api.dart';
import 'notices_models.dart';

class NoticesSubmission extends StatefulWidget {
  const NoticesSubmission(
      {super.key,
      required this.session,
      required this.kind,
      this.noticeId,
      this.listingId});
  final AccountSession session;
  final String kind;
  final String? noticeId, listingId;
  @override
  State<NoticesSubmission> createState() => _NoticesSubmissionState();
}

class _NoticesSubmissionState extends State<NoticesSubmission> {
  late final api = NoticesApi(widget.session),
      artists = ArtistsApi(widget.session);
  final people = <ArtistPerson>[],
      rules = <NoticeRule>[],
      consents = <ArtistRecord>[];
  final delegatedRefs = <String, Map<String, dynamic>>{};
  var submissionFormKey = GlobalKey<V5FormState>();
  ArtistDetail? detail;
  NoticePublic? notice;
  NoticeRecord? source;
  Map<String, dynamic>? invitation;
  String? invitationRule;
  String? personId, error;
  bool busy = false, delegated = false, permitted = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (!submissionKinds.containsKey(widget.kind)) {
        throw const AccountError(400, 'NOTICE_SUBMISSION_INVALID');
      }
      if (widget.kind == 'INVITATION') {
        if (widget.listingId != null) {
          String? cursor;
          final seen = <String>{};
          do {
            final page = await api.rules(cursor: cursor);
            rules.addAll(page.items);
            cursor = page.cursor;
            if (cursor != null) v5Require(seen.add(cursor));
          } while (cursor != null);
        }
        if (widget.noticeId != null) {
          final r = await api.record(widget.noticeId!);
          if (r.kind != 'SUBMISSION' ||
              r.data['submission']['kind'] != 'INVITATION' ||
              r.raw['owner_party_id'] != api.owner()) {
            throw const AccountError(403, 'NOTICE_TARGET_MISMATCH');
          }
          source = r;
        }
      } else {
        if (widget.noticeId != null) {
          notice = await api.publicNotice(widget.noticeId!);
        }
        String? cursor;
        final seen = <String>{};
        do {
          final r = await artists.people(cursor: cursor);
          people.addAll(r.items);
          cursor = r.cursor;
          if (cursor != null) v5Require(seen.add(cursor));
        } while (cursor != null);
        cursor = null;
        seen.clear();
        do {
          final r = await api.rules(cursor: cursor);
          rules.addAll(r.items);
          cursor = r.cursor;
          if (cursor != null) v5Require(seen.add(cursor));
        } while (cursor != null);
      }
      if (mounted) setState(() {});
    } on AccountError catch (e) {
      if (mounted) setState(() => error = v5Error(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> choose(String id) async {
    setState(() {
      busy = true;
      error = null;
      personId = id;
      submissionFormKey = GlobalKey<V5FormState>();
      detail = null;
      consents.clear();
      delegatedRefs.clear();
      permitted = false;
    });
    try {
      final d = await artists.person(id);
      final actions = await artists.actions(d);
      delegated = d.person.owner != api.owner();
      if (!delegated) {
        consents.addAll((await artists.allRecords(id, 'CONSENT')).where((c) =>
            c.status == 'APPROVED' &&
            (c.data['purposes'] as List).contains('COOPERATION_SUBMISSION') &&
            DateTime.parse(c.data['valid_from']).isBefore(DateTime.now()) &&
            DateTime.parse(c.data['valid_until']).isAfter(DateTime.now()) &&
            (notice == null ||
                c.data['grantee_party_id'] == notice!.raw['owner_party_id'])));
      } else if (notice != null) {
        for (final option in await api.submissionOptions(id, notice!.id)) {
          delegatedRefs[option['consent_id']] = option;
        }
      }
      if (mounted) {
        setState(() {
          detail = d;
          permitted = actions.contains('SUBMIT_COOPERATION');
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = v5Error(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> chooseInvitationRule(String rule) async {
    setState(() {
      busy = true;
      error = null;
      invitation = null;
      invitationRule = rule;
    });
    try {
      final c = await api.invitationContext(widget.listingId!, rule);
      if (mounted) {
        setState(() => invitation = {
              'rule_id': rule,
              'submission': {...c, 'source_listing_id': c['listing_id']}
            });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = v5Error(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> selectSubmissionKind(String next) async {
    if (busy || next == widget.kind || api.writes > 0 ||
        api.pendingOperations.isNotEmpty) {
      return;
    }
    final epoch = widget.session.epoch, party = widget.session.partyId;
    if (!(await submissionFormKey.currentState?.confirmDiscardChanges() ?? true)) return;
    if (!mounted || busy || epoch != widget.session.epoch ||
        party != widget.session.partyId || api.pendingOperations.isNotEmpty) {
      return;
    }
    Navigator.pushReplacementNamed(context, Uri(
        path: '/notices/submit',
        queryParameters: {
          'kind': next,
          if (widget.noticeId != null) 'noticeId': widget.noticeId!,
        }).toString());
  }

  @override
  Widget build(BuildContext context) {
    final d = detail;
    final invitation = widget.kind == 'INVITATION';
    return V5Frame(
        plaza: true,
        api: api,
        title: submissionKinds[widget.kind] ?? '单向投稿',
        children: [
          tradeHeading(invitation ? '说说这次邀约' : '递上你的角色',
              fontSize: 28, eyebrow: '本人授权 / 单向递交 / 平台客服跟进'),
          V5RecoveryPanel(
              api: api,
              label: api.recoveryLabel,
              restore: api.restoreOperation,
              onRestored: (r) => Navigator.pushReplacementNamed(
                  context, '/notices/record?recordId=${r['id']}')),
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!, icon: Icons.error_outline),
          appNotice('投稿或邀约经过独立审核后单向送达。感兴趣只进入客服处理，不自动成交、付款、授角或开放自由聊天。'),
          if (invitation &&
              source == null &&
              widget.listingId == null &&
              !busy) ...[
            appNotice('暂不能从公开艺人主页发起新的邀约。你可以继续查看已有邀约的客服处理记录，或浏览公开通告。'),
            tradeButton(
                '查看已有客服处理记录',
                () =>
                    Navigator.pushNamed(context, '/notices/records?kind=CASE'),
                outline: true),
            tradeButton('浏览公开通告',
                () => Navigator.pushNamed(context, '/notices/catalog'),
                outline: true),
          ],
          if (invitation && widget.listingId != null) ...[
            if (rules.isEmpty && !busy) appNotice('当前没有已生效的邀约规则，请稍后再试。'),
            if (rules.isNotEmpty)
              DropdownButtonFormField<String>(
                  initialValue: invitationRule,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: '本次邀约适用规则'),
                  items: rules
                      .map((r) => DropdownMenuItem(
                          value: r.id, child: Text(r.rule['version'])))
                      .toList(),
                  onChanged: busy || api.pending('/submissions') != null
                      ? null
                      : (v) => chooseInvitationRule(v!)),
            if (this.invitation != null) _invitationForm(this.invitation!),
          ],
          if (invitation && source != null) _invitationForm(source!.data),
          if (!invitation) ...[
            const Text('选择投稿方式',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            for (final option in ['PROFILE', 'ROLE', 'CREATE_DRAMA'])
              Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Material(
                      color: option == widget.kind
                          ? AccountTheme.selectedSurface : AccountTheme.surface,
                      borderRadius: BorderRadius.circular(14),
                      child: Material(type: MaterialType.transparency, child: ListTile(
                          title: Text(submissionKinds[option]!),
                          trailing: Icon(option == widget.kind
                              ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                              color: AccountTheme.accent),
                          onTap: busy || api.pendingOperations.isNotEmpty
                              ? null : () => selectSubmissionKind(option))))),
            const SizedBox(height: 16),
            if (notice != null)
              tradeSection('明确接收的通告', [
                Text(notice!.notice['title']),
                tradeFact('类型', noticeTypes[notice!.notice['type']]),
                tradeFact('截止', tradeDate(notice!.notice['valid_until']))
              ]),
            DropdownButtonFormField<String>(
                initialValue: personId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: '选择本次具体真人'),
                items: people
                    .map((p) =>
                        DropdownMenuItem(value: p.id, child: Text(p.name)))
                    .toList(),
                onChanged: busy || api.pending('/submissions') != null
                    ? null
                    : (v) => choose(v!)),
            if (d != null) ...[
              tradeSection('本次选择的真人档案', [
                Text(d.person.name, style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                const Text('投稿仅包含本次选择并取得授权的数字人与材料。',
                    style: TextStyle(color: AccountTheme.muted, height: 1.6)),
              ]),
              if (!permitted) appNotice('当前机构未取得本人的合作投稿委托。请先由本人明确授权。'),
              if (permitted && delegated && notice == null)
                appNotice('机构代艺人投稿，请先打开具体通告，再选择本次投稿的艺人。'),
              if (permitted &&
                  delegated &&
                  notice != null &&
                  delegatedRefs.isEmpty)
                appNotice(
                    '还没有覆盖该艺人、数字人和本次接收方的有效授权。请由艺人本人确认用途与期限并通过审核后，再回到这里投稿。'),
              if (permitted && !delegated && consents.isEmpty) ...[
                appNotice('还没有覆盖本次接收方的已审合作投稿同意。请先在我的艺人中明确接收方、用途和有效期限。'),
                tradeButton(
                    '办理本人同意',
                    () => Navigator.pushNamed(
                        context, '/artists/person?personId=${d.person.id}'),
                    outline: true)
              ],
              if (permitted &&
                  (!delegated && consents.isNotEmpty ||
                      delegated && notice != null && delegatedRefs.isNotEmpty))
                _submissionForm(d),
            ],
          ],
        ]);
  }

  Widget _invitationForm(Map<String, dynamic> original) {
    final s = v5Map(original['submission']);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      tradeSection('确认本次邀约对象', [
        Row(children: [
          const Icon(Icons.person_outline, color: AccountTheme.accent, size: 32),
          const SizedBox(width: 12),
          Expanded(child: Text(s['display_name'] ?? '已选择公开艺人',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
        ]),
        const SizedBox(height: 12),
        ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: const Text('核对本次公开资料引用'),
            children: [
              tradeFact('具体真人', s['person_id']),
              tradeFact('具体数字人', s['avatar_id']),
              tradeFact('接收方原引用', s['target_party_id']),
            ]),
        appNotice('仅向当前获准公开的艺人发送本次合作意向；提交、审核与回应时重新核对有效范围，不直接取得出演权。')
      ]),
      V5Form(
          actionInFooter: true,
          canSubmit: !busy,
          api: api,
          title: '这次拍摄的目的与说明',
          action: '提交本次邀约审核',
          suffix: '/submissions',
          fields: const [
            V5Field('purpose', '拍摄目的与本次用途', hint: '最多200字'),
            V5Field('content', '意向内容说明', type: 'multiline', hint: '最多4000字')
          ],
          restore: (b) => v5Map(b['submission']),
          buildBody: (v) => {
                'rule_id': original['rule_id'],
                'submission': {
                  'kind': 'INVITATION',
                  if (s['source_listing_id'] != null)
                    'source_listing_id': s['source_listing_id'],
                  'target_party_id': s['target_party_id'],
                  'notice_id': null,
                  'person_id': s['person_id'],
                  'avatar_id': s['avatar_id'],
                  'consent_id': s['consent_id'],
                  'purpose': v['purpose'],
                  'content': v['content'],
                  'role': null,
                  'material_asset_ids': v5InputIds(v['material_asset_ids'] ?? '')
                }
              },
          parse: api.validateRecord,
          beforeSubmit: (body) async {
            final submission = v5Map(body['submission']);
            if ('${submission['purpose']}'.trim().length > 200 ||
                '${submission['content']}'.trim().length > 4000 ||
                (submission['material_asset_ids'] as List).length > 6) {
              throw const AccountError(400, 'NOTICE_SUBMISSION_INVALID');
            }
          },
          extra: (v, set, enabled) => [
            tradeSection('本次参考材料（可选）', [
              const Text('最多6份，只提交本次选取且有权使用的材料，不开放完整私有素材库。',
                  style: TextStyle(color: AccountTheme.muted, height: 1.6)),
              const SizedBox(height: 12),
              SupplyFiles(
                  api: SupplyApi(widget.session),
                  purpose: 'AVATAR_MATERIAL',
                  maxFiles: 6,
                  ids: v5InputIds(v['material_asset_ids'] ?? ''),
                  enabled: enabled,
                  onChanged: (ids) => set('material_asset_ids', ids.join(', '))),
            ]),
            tradeSection('提交后的联系与处理', [
              const Text('对方可表示感兴趣或婉拒；感兴趣后由客服对接。',
                  style: TextStyle(fontSize: 15, height: 1.6)),
              const Divider(height: 24),
              const Text('提交意向不等于授权、签约或开放双向聊天。',
                  style: TextStyle(color: AccountTheme.muted, height: 1.6)),
            ]),
            appNotice('当前仅保护本页未提交内容，离开时会提示确认；尚无邀约草稿保存接口，不会把提交审核冒充保存个人草稿。'),
          ],
          onSuccess: (r) => Navigator.pushReplacementNamed(
              context, '/notices/record?recordId=${r['id']}'))
    ]);
  }

  Widget _submissionForm(ArtistDetail d) => V5Form(
      actionInFooter: true,
      canSubmit: !busy,
      key: submissionFormKey,
      api: api,
      title: '本次具体投稿',
      action: '提交本次单向投稿审核',
      suffix: '/submissions',
      restore: (b) => {
            ...v5Map(b['submission']),
            'rule_id': b['rule_id'],
            'material_asset_ids':
                (b['submission']['material_asset_ids'] as List).join(', ')
          },
      initial: notice == null ? {} : {'rule_id': notice!.raw['rule_id']},
      fields: [
        if (notice == null)
          V5Field('rule_id', '本次已生效投稿规则',
              choices: {for (final r in rules) r.id: r.rule['version']}),
        if (delegated)
          V5Field('consent_id', '选择本人已提供的本次接收方授权', wrapChoices: true, choices: {
            for (final c in delegatedRefs.entries)
              c.key:
                  '${d.avatars.where((a) => a.id == c.value['avatar_id']).map((a) => a.name).firstOrNull ?? '原数字人'} · 本人已审合作授权（提交时重核）'
          })
        else
          V5Field('consent_id', '选择本人对明确接收方的已审授权', wrapChoices: true, choices: {
            for (final c in consents)
              c.id:
                  '${d.avatars.where((a) => a.id == c.avatarId).map((a) => a.name).firstOrNull ?? '原数字人'} · ${c.data['terms']}\n用途：合作投稿\n有效期：${artistWhen(c.data['valid_from'])} 至 ${artistWhen(c.data['valid_until'])}\n接收通告：${notice?.notice['title'] ?? '以本次已审授权为准'}'
          }),
        const V5Field('purpose', '本次投稿用途'),
        const V5Field('content', '给接收方的投稿内容', type: 'multiline'),
        if (widget.kind == 'ROLE') const V5Field('role', '想演的明确角色'),
      ],
      buildBody: (v) {
        final consent = delegated
            ? null
            : consents.where((c) => c.id == v['consent_id']).firstOrNull;
        if (!delegated && consent == null) {
          throw const AccountError(400, 'NOTICE_SUBMISSION_CONSENT_REQUIRED');
        }
        final target =
            notice?.raw['owner_party_id'] ?? consent?.data['grantee_party_id'];
        api.key('$target');
        return {
          'rule_id': notice?.raw['rule_id'] ?? api.key('${v['rule_id']}'),
          'submission': {
            'kind': widget.kind,
            'target_party_id': target,
            'notice_id': notice?.id,
            'person_id': d.person.id,
            'avatar_id': delegated
                ? delegatedRefs[v['consent_id']]!['avatar_id']
                : consent!.avatarId,
            'consent_id': api.key('${v['consent_id']}'),
            'purpose': v['purpose'],
            'content': v['content'],
            'role': widget.kind == 'ROLE' ? v['role'] : null,
            'material_asset_ids': v5InputIds(v['material_asset_ids'] ?? '')
          }
        };
      },
      parse: api.validateRecord,
      onSuccess: (r) => Navigator.pushReplacementNamed(
          context, '/notices/record?recordId=${r['id']}'),
      extra: (v, set, enabled) => [
            tradeSection('本次私有模卡或材料', [
              const Text('仅递交本次明确选择的材料，不授予训练、商用或后续参演权。'),
              const SizedBox(height: 12),
              SupplyFiles(
                  api: SupplyApi(widget.session),
                  purpose: 'AVATAR_MATERIAL',
                  ids: v5InputIds(v['material_asset_ids'] ?? ''),
                  enabled: enabled,
                  onChanged: (ids) => set('material_asset_ids', ids.join(', ')))
            ]),
            tradeSection('单向投稿说明', [
              const Text('本次材料经独立审核后单向递交；接收方表示感兴趣仅生成客服待办。',
                  style: TextStyle(fontSize: 14, height: 1.6)),
              const Divider(height: 24),
              const Text('没有自动付款、签约、授角或自由聊天。未提交内容只保留在本页，暂不提供独立草稿保存。',
                  style: TextStyle(color: AccountTheme.muted, height: 1.6)),
            ]),
          ]);
}
