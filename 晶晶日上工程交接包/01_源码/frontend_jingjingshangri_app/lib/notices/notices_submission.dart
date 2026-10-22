import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
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
      {super.key, required this.session, required this.kind, this.noticeId});
  final AccountSession session;
  final String kind;
  final String? noticeId;
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
  ArtistDetail? detail;
  NoticePublic? notice;
  NoticeRecord? source;
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
        String? cursor;
        final seen = <String>{};
        do {
          final page = await api.records('SUBMISSION', cursor: cursor);
          for (final r in page.items.where((r) =>
              r.raw['owner_party_id'] == api.owner() &&
              !['WITHDRAWN', 'REJECTED'].contains(r.status))) {
            final s = v5Map(r.data['submission']);
            if (s['person_id'] == id &&
                s['target_party_id'] == notice!.raw['owner_party_id'] &&
                s['kind'] != 'INVITATION') {
              delegatedRefs[s['consent_id']] = s;
            }
          }
          cursor = page.cursor;
          if (cursor != null) v5Require(seen.add(cursor));
        } while (cursor != null);
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

  @override
  Widget build(BuildContext context) {
    final d = detail;
    final invitation = widget.kind == 'INVITATION';
    return V5Frame(
        api: api,
        title: submissionKinds[widget.kind] ?? '单向投稿',
        children: [
          tradeHeading(invitation ? '把意向交给对方' : '投递这一次可能',
              eyebrow: '本人授权 / 单向递交 / 平台客服跟进'),
          V5RecoveryPanel(
              api: api,
              label: api.recoveryLabel,
              restore: api.restoreOperation,
              onRestored: (r) => Navigator.pushReplacementNamed(
                  context, '/notices/record?recordId=${r['id']}')),
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!, icon: Icons.error_outline),
          appNotice('投稿或邀约经过独立审核后单向送达。感兴趣只进入客服处理，不自动成交、付款、授角或开放自由聊天。'),
          if (invitation && source == null && !busy) ...[
            appNotice(
                '暂不能从公开艺人发起邀约，需要平台补齐引用信息。当前公开目录未提供合法接收方与公开同意引用，不能用私人资料兜底。'),
            tradeButton(
                '查看已有客服处理记录',
                () =>
                    Navigator.pushNamed(context, '/notices/records?kind=CASE'),
                outline: true),
            tradeButton('浏览公开通告',
                () => Navigator.pushNamed(context, '/notices/catalog'),
                outline: true),
          ],
          if (invitation && source != null) _invitationForm(source!),
          if (!invitation) ...[
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
              tradeFact('本人档案', d.person.name),
              if (!permitted) appNotice('当前机构未取得本人的合作投稿委托。请先由本人明确授权。'),
              if (permitted && delegated && notice == null)
                appNotice('机构直接投递需要平台提供明确接收方上下文。请从具体公开通告进入，不能猜测接收主体。'),
              if (permitted &&
                  delegated &&
                  notice != null &&
                  delegatedRefs.isEmpty)
                appNotice(
                    '平台尚未提供首次受托投稿所需的可选择授权引用。机构不能读取本人私有同意，也不要求手填技术编号；请平台补齐安全授权上下文。'),
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

  Widget _invitationForm(NoticeRecord original) {
    final s = v5Map(original.data['submission']);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      tradeSection('沿原合法上下文填写新意向', [
        tradeFact('具体真人', s['person_id']),
        tradeFact('具体数字人', s['avatar_id']),
        tradeFact('接收方原引用', s['target_party_id']),
        appNotice('仅使用本人原可读邀约里的公开展示引用。服务器提交时重新核对，原引用失效仍会拒绝。')
      ]),
      V5Form(
          api: api,
          title: '结构化邀约意向',
          action: '提交本次邀约审核',
          suffix: '/submissions',
          fields: const [
            V5Field('purpose', '本次真实用途'),
            V5Field('content', '本次意向内容', type: 'multiline')
          ],
          restore: (b) => v5Map(b['submission']),
          buildBody: (v) => {
                'rule_id': original.data['rule_id'],
                'submission': {
                  'kind': 'INVITATION',
                  'target_party_id': s['target_party_id'],
                  'notice_id': null,
                  'person_id': s['person_id'],
                  'avatar_id': s['avatar_id'],
                  'consent_id': s['consent_id'],
                  'purpose': v['purpose'],
                  'content': v['content'],
                  'role': null,
                  'material_asset_ids': []
                }
              },
          parse: api.validateRecord,
          onSuccess: (r) => Navigator.pushReplacementNamed(
              context, '/notices/record?recordId=${r['id']}'))
    ]);
  }

  Widget _submissionForm(ArtistDetail d) => V5Form(
      key: ValueKey(d.person.id),
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
          V5Field('consent_id', '选择本人已提供的本次接收方授权', choices: {
            for (final c in delegatedRefs.entries)
              c.key:
                  '${d.avatars.where((a) => a.id == c.value['avatar_id']).map((a) => a.name).firstOrNull ?? '原数字人'} · 原投稿授权（提交时重核）'
          })
        else
          V5Field('consent_id', '选择本人对明确接收方的已审授权', choices: {
            for (final c in consents)
              c.id:
                  '${d.avatars.where((a) => a.id == c.avatarId).map((a) => a.name).firstOrNull ?? '原数字人'} · ${c.data['terms']}'
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
              SupplyFiles(
                  api: SupplyApi(widget.session),
                  purpose: 'AVATAR_MATERIAL',
                  ids: v5InputIds(v['material_asset_ids'] ?? ''),
                  enabled: enabled,
                  onChanged: (ids) => set('material_asset_ids', ids.join(', ')))
            ])
          ]);
}
