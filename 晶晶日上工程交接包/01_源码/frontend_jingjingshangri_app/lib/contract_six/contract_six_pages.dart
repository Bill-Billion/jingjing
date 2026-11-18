import 'dart:convert';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../customization/private_draft_guard.dart';
import '../engagement/community_support.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../trade/trade_widgets.dart';
import 'contract_six_models.dart';

const _titles = {
  'guardians': '监护管理与未成年退款',
  'infringement': '侵权通知与反通知',
  'handover': '解除合作后的旧单交接',
  'closure': '核验后注销期限'
};

class ContractSixPage extends StatelessWidget {
  const ContractSixPage(
      {super.key, required this.kind, this.id, this.operations = false});
  final String kind;
  final String? id;
  final bool operations;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: kind == 'handover'
          ? 'gigs'
          : kind == 'closure'
              ? 'privacy'
              : kind,
      route:
          '/contract-six/$kind${id == null ? (operations ? '?operations=true' : '') : '?id=$id${operations ? '&operations=true' : ''}'}',
      title: _titles[kind]!,
      partyRequired: !operations && ['handover', 'infringement'].contains(kind),
      builder: (s) =>
          _Six(session: s, kind: kind, id: id, operations: operations));
}

class _Six extends StatefulWidget {
  const _Six(
      {required this.session,
      required this.kind,
      this.id,
      required this.operations});
  final AccountSession session;
  final String kind;
  final String? id;
  final bool operations;
  @override
  State<_Six> createState() => _SixState();
}

class _SixState extends CommunityPageState<_Six> {
  @override
  AccountSession get session => widget.session;
  @override
  String get domain => widget.kind == 'handover'
      ? 'gigs'
      : widget.kind == 'closure'
          ? 'privacy'
          : widget.kind;
  final guard = GlobalKey<PrivateDraftGuardState>();
  final inputs = <String, TextEditingController>{};
  final choices = <String, String>{};
  final checks = <String, bool>{};
  List<String> evidence = [], disclosed = [];
  final allocationInputs = <(TextEditingController, TextEditingController)>[];
  List<Map<String, dynamic>> rows = [], content = [], information = [];
  Map<String, dynamic>? record, usage;
  String? id,
      cursor,
      nextCursor,
      contentCursor,
      nextContentCursor,
      infoCursor,
      nextInfoCursor;
  String? action;
  bool linkedLoading = false;
  String get ops => widget.operations ? 'operations/' : '';
  bool get account =>
      widget.operations || ['guardians', 'closure'].contains(widget.kind);
  String get collection =>
      widget.kind == 'infringement' ? '${ops}cases' : '${ops}records';
  String get recordPath => switch (widget.kind) {
        'handover' =>
          'relations/${communityRequiredId(id ?? '', '直接合作')}/handover',
        'closure' =>
          '${ops}requests/${communityRequiredId(id ?? '', '注销申请')}/closure-clock',
        _ => '$collection/${communityRequiredId(id ?? '', '记录')}'
      };
  String? get linkId => record == null
      ? null
      : (record!['kind'] == 'LINK' ? record!['id'] : record!['parent_id'])
          as String?;
  TextEditingController input(String key) =>
      inputs.putIfAbsent(key, () => field());
  String required(String key, String label, {int max = 4000}) =>
      communityRequired(input(key).text, label, max: max);
  String requiredId(String key, String label) =>
      communityRequiredId(input(key).text, label);
  String chosen(String key, String label) =>
      communityRequired(choices[key] ?? '', label);
  String get why => required('reason', '本次明确理由', max: 2000);
  int integer(String key, String label) {
    final n = int.tryParse(input(key).text);
    if (n == null || n < 1) throw AccountError(400, '请填写有效的$label');
    return n;
  }

  @override
  bool get enabled => super.enabled && !checking && !linkedLoading;

  @override
  void initState() {
    super.initState();
    id = widget.id;
    if (widget.operations) {
      final pending = session.pendingForPrefix(api.prefix, personal: true);
      if (pending.isNotEmpty) {
        final op = pending.first;
        final fingerprint = jsonDecode(op['fingerprint'] as String) as List;
        recovery = Map<String, dynamic>.from(op);
        recoverySuffix = (op['path'] as String).substring(api.prefix.length);
        recoveryMethod = fingerprint[2] as String;
        recoveryAccount = true;
      }
    }
    load();
  }

  @override
  void clearPrivate() {
    record = null;
    rows = [];
    content = [];
    information = [];
    usage = null;
    evidence = [];
    disclosed = [];
    checks.clear();
    choices.clear();
    action = null;
  }

  @override
  void fail(Object e) {
    if (e is AccountError && sixBusinessErrors.containsKey(e.code)) {
      content = [];
      information = [];
      if (e.code == 'GUARDIAN_LINK_NOT_ACTIVE') {
        record = null;
        usage = null;
      }
      error = sixBusinessErrors[e.code];
      return;
    }
    super.fail(e);
  }

  @override
  void validateResult(Map<String, dynamic> value) {
    if (widget.kind == 'guardians' && value['slot_until'] != null) {
      communityRequire(DateTime.tryParse('${value['slot_until']}') != null &&
          value['seconds_reserved'] is int);
    } else {
      switch (widget.kind) {
        case 'guardians':
          guardianRecord(value);
        case 'infringement':
          infringementRecord(value);
        case 'handover':
          value['kind'] == 'RELATION'
              ? communityRecord(value)
              : handoverRecord(value);
        case 'closure':
          closureClock(value);
      }
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
      if (id != null) {
        final r = await api.read(recordPath,
            account: account,
            query: widget.kind == 'handover'
                ? {'limit': 20, if (cursor != null) 'cursor': cursor}
                : null);
        validateResult(r);
        if (!mounted || t != ticket) return;
        setState(() {
          record = r;
          nextCursor = r['next_cursor'] as String?;
        });
      } else if (['guardians', 'infringement'].contains(widget.kind)) {
        final page = await api.read(collection,
            account: account,
            query: {'limit': 20, if (cursor != null) 'cursor': cursor});
        final list = communityItems(page);
        if (!mounted || t != ticket) return;
        setState(() {
          rows = list;
          nextCursor = page['next_cursor'] as String?;
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
    final path = recoverySuffix ?? '';
    final match = RegExp(r'^(?:operations/)?(?:records|cases)/([0-9a-f-]{36})/')
        .firstMatch(path);
    final link = RegExp(r'^links/([0-9a-f-]{36})/').firstMatch(path);
    if (match != null) id = match[1];
    if (link != null) id = link[1];
    await load();
  }

  @override
  Future<void> recovered(Map<String, dynamic> value) async {
    if (value['id'] is String) id = value['id'];
    await load();
  }

  Future<void> open(String? target) async {
    if (!enabled || !(await guard.currentState!.confirmLeave()) || !mounted) {
      return;
    }
    setState(() {
      id = target;
      cursor = null;
      record = null;
      rows = [];
      action = null;
      content = [];
      usage = null;
      information = [];
    });
    await load();
  }

  Widget text(String key, String label, {int lines = 1}) =>
      communityField(input(key), label, lines: lines, enabled: enabled);
  Widget select(String key, String label, List<(String, String)> options) =>
      communitySelect(label, choices[key], options,
          enabled ? (v) => setState(() => choices[key] = v ?? '') : null);
  Widget check(String key, String label) => communityCheck(
      label,
      checks[key] ?? false,
      enabled ? (v) => setState(() => checks[key] = v == true) : null);
  Widget files() {
    final personal = !['guardians', 'closure'].contains(widget.kind) ||
        session.party?['kind'] == 'PERSON';
    return communitySection('仅供本次办理的私有依据', [
      if (!session.isOwner || !personal)
        appNotice('请先在账号页选择本人个人负责人身份，再上传本人核验材料。业务申请仍按账号办理。')
      else
        SupplyFiles(
            api: SupplyApi(session),
            purpose: 'REVIEW_EVIDENCE',
            acceptedPurposes: const {
              'REVIEW_EVIDENCE',
              'CONSENT_EVIDENCE',
              'RIGHTS_EVIDENCE'
            },
            ids: evidence,
            enabled: enabled,
            onChanged: (v) => setState(() => evidence = v)),
      text('evidence_ids', '已有本人私有材料编号（可选，逗号分隔）'),
    ]);
  }

  List<String> evidenceIds() {
    final ids = {
      ...evidence,
      ...communityIds(input('evidence_ids').text, '依据文件', required: false)
    }.toList();
    if (ids.isEmpty) throw const AccountError(400, '请上传或引用至少一份本人的依据文件');
    return ids;
  }

  Map<String, String> get actions {
    if (widget.kind == 'handover') return {'handover': '确认这笔旧订单的交接'};
    if (widget.kind == 'closure') return {};
    if (widget.kind == 'guardians') {
      if (widget.operations) return {'review': '独立核验关系或退款申请'};
      return {
        if (id == null) 'invite': '申请监护关联',
        if (record != null) ...{
          'accept': '孩子本人确认关系',
          'reject': '孩子本人拒绝关系',
          'dispute': '孩子提出异议并暂停',
          'revoke': '监护人撤销关系',
          'controls': '调整或一键关闭使用',
          'spend': '记录单笔消费同意',
          'privacy': '提出信息处理申请',
          'refund-request': '提出未成年退款申请',
          'refund': '继续已审核的原单退款'
        }
      };
    }
    if (widget.operations) {
      return {
        'REQUEST_INFO': '要求补充材料',
        'FREEZE': '冻结本案内容',
        'REJECT': '退回本次通知',
        'DELIVER_NOTICE': '送达必要通知材料',
        'DELIVER_COUNTER': '送达必要反通知材料',
        'PROPOSE': '提出处理结论',
        'REVIEW': '独立复核本案处理'
      };
    }
    return {
      if (id == null) 'create': '提出侵权通知',
      if (record != null) ...{
        'SUPPLEMENT': '按要求补件',
        'COUNTER': '提交反通知',
        'ACK_DELIVERY': '明确确认已读送达材料',
        'WITHDRAW': '申请撤回本通知'
      }
    };
  }

  String? actionReason(String? a) {
    if (a == null) return '请选择本次办理事项。';
    if (widget.kind == 'guardians') {
      return guardianActionReason(a, record, session.account?['id']);
    }
    if (a == 'create') return null;
    final r = record;
    if (r == null) return '请先读取原记录。';
    if (widget.kind == 'handover') {
      final row = communityRows(r['items'])
          .where((v) => v['order_id'] == choices['order'])
          .firstOrNull;
      if (row == null) return '请从待交接的旧订单中选择。';
      return communityMap(row['acknowledgements']).containsKey(session.partyId)
          ? '本身份已确认过本订单交接。'
          : null;
    }
    final state = r['current_status'],
        own = communityMaybeMap(r['notice'])['contact'] != null;
    final allowed = <String, List<String>>{
      'SUPPLEMENT': ['SUBMITTED', 'NEEDS_INFO'],
      'COUNTER': ['NOTICE_DELIVERED'],
      'REQUEST_INFO': ['SUBMITTED'],
      'FREEZE': ['SUBMITTED'],
      'REJECT': ['SUBMITTED', 'NEEDS_INFO'],
      'DELIVER_NOTICE': ['FROZEN'],
      'DELIVER_COUNTER': ['COUNTER_SUBMITTED'],
      'PROPOSE': ['NOTICE_DELIVERED', 'COUNTER_DELIVERED', 'WITHDRAWAL_REVIEW'],
      'REVIEW': ['REVIEW_PENDING']
    };
    if (allowed[a] != null && !allowed[a]!.contains(state)) {
      return '案件当前不在此办理阶段，请读取最新状态。';
    }
    if (['SUPPLEMENT', 'WITHDRAW'].contains(a) && !own) return '此项仅由通知发起方办理。';
    if (a == 'WITHDRAW' && ['RESOLVED', 'REJECTED'].contains(state)) {
      return '本案已有处理结论，不能直接撤回恢复。';
    }
    if (a == 'COUNTER' && r['next_action'] != 'SUBMIT_COUNTER') {
      return '待必要通知送达后，由被通知方提交。';
    }
    if (a == 'ACK_DELIVERY') {
      final delivery = communityMaybeMap(
          communityMaybeMap(r['deliveries'])[own ? 'counter' : 'notice']);
      if (delivery['at'] == null || delivery['read_at'] != null) {
        return '尚无待确认已读的对方送达材料。';
      }
    }
    if (a == 'REVIEW' &&
        communityMaybeMap(r['pending_review'])['by'] ==
            session.account?['id']) {
      return '提议人不能复核自己的结论。';
    }
    return null;
  }

  List<Widget> formFields() {
    final a = action;
    if (a == null) return [];
    if (widget.kind == 'handover') {
      return [
        communitySelect(
            '待交接原订单',
            choices['order'],
            [
              for (final r in communityRows(record?['items'] ?? []))
                (
                  r['order_id'],
                  '${communityShort(r['order_id'])} · ${sixState(r['status'])}'
                )
            ],
            enabled ? (v) => setState(() => choices['order'] = v ?? '') : null),
        text('note', '实际交接说明', lines: 3),
      ];
    }
    if (widget.kind == 'guardians') {
      return switch (a) {
        'invite' => [
            text('child_account_id', '孩子本人提供的账号编号'),
            text('relationship', '具体监护关系', lines: 3),
            text('rule_id', '已独立审核的监护保护规则编号'),
            communityDateField(context, input('valid_until'), '关系有效截止',
                enabled: enabled),
            files()
          ],
        'controls' => [
            check('enabled', '允许在已审限制内使用（取消即一键关闭）'),
            text('daily_minutes', '每日分钟上限'),
            text('single_minor', '单次消费同意上限（元）'),
            text('daily_minor', '每日消费同意上限（元）'),
            appNotice('不能超过本关系审核规则；孩子本人不能关闭限制。消费同意不解锁付款。')
          ],
        'spend' => [
            text('amount_minor', '本次同意金额（元）'),
            text('purpose', '具体用途', lines: 3)
          ],
        'privacy' => [
            select('type', '信息处理事项', [
              ('QUERY', '必要资料查询'),
              ('DELETE', '删除申请'),
              ('CLOSE_ACCOUNT', '注销申请')
            ]),
            text('details', '具体请求与范围', lines: 4)
          ],
        'refund-request' => [
            text('payment_id', '孩子原成功付款编号'),
            for (final pair in allocationInputs) ...[
              communityField(pair.$1, '原付款分项编号', enabled: enabled),
              communityField(pair.$2, '本项退款申请金额（元）', enabled: enabled)
            ],
            tradeButton(
                '增加一项原付款分项',
                enabled
                    ? () =>
                        setState(() => allocationInputs.add((field(), field())))
                    : null,
                outline: true),
            text('reason', '本次明确理由', lines: 3),
            files()
          ],
        'review' => [
            select('decision', '独立核验结论', [('APPROVE', '通过'), ('REJECT', '退回')]),
            if (record?['kind'] == 'LINK')
              select('age_band', '实际核验年龄范围',
                  [('UNDER_14', '未满14岁（实际处理关闭）'), ('AGE_14_17', '14—17岁')]),
            check('identity_checked', '已实际核对身份'),
            check('relationship_checked', '已实际核对监护关系和申请事实'),
            text('reason', '本次明确理由', lines: 3)
          ],
        'refund' => [appNotice('继续原支付的退款流程；提交成功不代表退款已到账。')],
        _ => [text('reason', '本次明确理由', lines: 3)],
      };
    }
    return [
      if (a == 'create') ...[
        select('target_kind', '具体涉案对象', [
          ('ASSET', '获准文件'),
          ('ARTIST_LISTING', '人物展示'),
          ('STOCK_LISTING', '现货影片'),
          ('NOTICE', '公开通告'),
          ('PRODUCTION_VERSION', '获准制作版本')
        ]),
        text('target_id', '原对象编号')
      ],
      if ([
        'create',
        'SUPPLEMENT',
        'COUNTER',
        'DELIVER_NOTICE',
        'DELIVER_COUNTER'
      ].contains(a))
        text('statement', a.startsWith('DELIVER') ? '已脱敏的必要送达正文' : '完整权利说明',
            lines: 5),
      if (['create', 'COUNTER'].contains(a))
        text('contact', '仅供运营联系，不自动转交对方', lines: 2),
      if (['create', 'SUPPLEMENT', 'COUNTER'].contains(a)) files(),
      if (a.startsWith('DELIVER')) ...[
        appNotice('只勾选本次确有必要送达的原依据，联系人与内部意见不自动转交。可以不送达附件。'),
        for (final asset in communityMaybeMap(
                    record?[a == 'DELIVER_NOTICE' ? 'notice' : 'counter'])[
                'evidence_asset_ids'] as List? ??
            [])
          communityCheck(
              '准许送达：${communityShort(asset)}',
              disclosed.contains(asset),
              enabled
                  ? (v) => setState(() => v == true
                      ? disclosed.add(asset as String)
                      : disclosed.remove(asset))
                  : null),
      ],
      if (a == 'PROPOSE')
        select('decision', '拟处理结论',
            [('RESTORE', '仅解除本案限制'), ('MAINTAIN', '维持本案限制')]),
      if (a == 'REVIEW')
        select(
            'decision', '独立复核结论', [('APPROVE', '通过本提议'), ('REJECT', '退回本提议')]),
      if (a != 'create') text('reason', '本次明确理由', lines: 3),
    ];
  }

  Future<void> submit() async {
    if (!enabled) return;
    try {
      final reason = actionReason(action);
      if (reason != null) throw AccountError(400, reason);
      final a = action!;
      Map<String, dynamic> body = {};
      String suffix = '', method = 'POST';
      int? version;
      if (widget.kind == 'handover') {
        suffix = recordPath;
        version = record!['object_version'];
        body = {
          'order_id': chosen('order', '原订单'),
          'note': required('note', '实际交接说明', max: 2000)
        };
      } else if (widget.kind == 'guardians') {
        final link = linkId;
        switch (a) {
          case 'invite':
            suffix = 'links';
            body = {
              'child_account_id': requiredId('child_account_id', '孩子账号'),
              'relationship': required('relationship', '监护关系', max: 1000),
              'rule_id': requiredId('rule_id', '已审规则'),
              'valid_until':
                  communityInstant(input('valid_until').text, '有效截止'),
              'evidence_asset_ids': evidenceIds()
            };
          case 'controls':
            suffix = 'links/$link/controls';
            method = 'PUT';
            version = record!['object_version'];
            final controls = {
              'enabled': checks['enabled'] ?? false,
              'daily_minutes': integer('daily_minutes', '每日分钟'),
              'single_minor': communityMinor(input('single_minor').text, '单次上限',
                  zero: true),
              'daily_minor':
                  communityMinor(input('daily_minor').text, '每日上限', zero: true)
            };
            validateGuardianControls(controls, record!);
            body = {'controls': controls};
          case 'spend':
            suffix = 'links/$link/spending-consents';
            body = {
              'amount_minor':
                  communityMinor(input('amount_minor').text, '本次金额'),
              'purpose': required('purpose', '用途', max: 1000)
            };
          case 'privacy':
            suffix = 'links/$link/privacy-requests';
            body = {
              'type': chosen('type', '处理事项'),
              'details': required('details', '具体请求')
            };
          case 'refund-request':
            if (allocationInputs.isEmpty) {
              throw const AccountError(400, '请至少列出一项原付款分项');
            }
            suffix = 'links/$link/refund-requests';
            body = {
              'payment_id': requiredId('payment_id', '原付款'),
              'allocations': [
                for (final p in allocationInputs)
                  {
                    'line_id': communityRequired(p.$1.text, '分项编号', max: 128),
                    'amount_minor': communityMinor(p.$2.text, '本项退款')
                  }
              ],
              'reason': why,
              'evidence_asset_ids': evidenceIds()
            };
          case 'refund':
            suffix = 'records/$id/refund';
            version = record!['object_version'];
          case 'review':
            suffix = 'operations/records/$id/decisions';
            version = record!['object_version'];
            body = {
              'decision': chosen('decision', '核验结论'),
              'reason': why,
              'identity_checked': checks['identity_checked'] == true,
              'relationship_checked': checks['relationship_checked'] == true,
              if (record!['kind'] == 'LINK')
                'age_band': chosen('age_band', '年龄范围')
            };
          default:
            suffix = 'records/$id/decisions';
            version = record!['object_version'];
            body = {'decision': a.toUpperCase(), 'reason': why};
        }
      } else {
        suffix = a == 'create' ? 'cases' : '${ops}cases/$id/actions';
        version = a == 'create' ? null : record!['object_version'];
        body = {
          if (a != 'create') 'action': a,
          if (a != 'create') 'reason': why,
          if (a == 'create') 'target_kind': chosen('target_kind', '对象类别'),
          if (a == 'create') 'target_id': requiredId('target_id', '原对象'),
          if ([
            'create',
            'SUPPLEMENT',
            'COUNTER',
            'DELIVER_NOTICE',
            'DELIVER_COUNTER'
          ].contains(a))
            'statement': required('statement', '权利或必要送达正文', max: 8000),
          if (['create', 'COUNTER'].contains(a))
            'contact': required('contact', '联系方法', max: 500),
          if (['create', 'SUPPLEMENT', 'COUNTER'].contains(a))
            'evidence_asset_ids': evidenceIds(),
          if (a.startsWith('DELIVER'))
            'disclosed_asset_ids': disclosed.toSet().toList(),
          if (['PROPOSE', 'REVIEW'].contains(a))
            'decision': chosen('decision', '处理结论')
        };
      }
      final r = await act(suffix, body,
          method: method, version: version, account: account, reload: false);
      if (r != null && mounted) {
        setState(() {
          if (r['id'] is String) id = r['id'];
          action = null;
          evidence = [];
          disclosed = [];
          choices.clear();
          checks.clear();
          for (final c in controllers) {
            c.clear();
          }
          allocationInputs.clear();
        });
        guard.currentState?.markSaved();
        await load();
      }
    } catch (e) {
      if (mounted) setState(() => fail(e));
    }
  }

  Future<void> linked(String view, {bool next = false}) async {
    if (!enabled || linkId == null) return;
    final t = ++ticket, link = linkId!;
    setState(() {
      linkedLoading = true;
      error = null;
    });
    try {
      final r = await api.read('links/$link/$view',
          account: true,
          query: view == 'usage'
              ? null
              : {
                  'limit': 20,
                  if (view == 'content' && next && nextContentCursor != null)
                    'cursor': nextContentCursor,
                  if (view == 'information')
                    'category': choices['category'] ?? 'PROFILE',
                  if (view == 'information' && next && nextInfoCursor != null)
                    'cursor': nextInfoCursor
                });
      if (!mounted || ticket != t) return;
      setState(() {
        if (view == 'usage') {
          usage = r;
        } else if (view == 'content') {
          content = communityItems(r);
          nextContentCursor = r['next_cursor'];
        } else {
          information = communityItems(r);
          nextInfoCursor = r['next_cursor'];
        }
      });
    } catch (e) {
      if (mounted && ticket == t) setState(() => fail(e));
    } finally {
      if (mounted && ticket == t) setState(() => linkedLoading = false);
    }
  }

  Future<void> useMinute() async {
    if (!enabled) return;
    final reason =
        guardianActionReason('session', record, session.account?['id']);
    if (reason != null) {
      setState(() => error = reason);
      return;
    }
    final r =
        await act('links/$linkId/sessions', {}, account: true, reload: false);
    if (r != null && mounted) {
      setState(() => usage = r);
      await linked('usage');
    }
  }

  List<Widget> facts() {
    final r = record;
    if (r == null) return [];
    if (widget.kind == 'closure') {
      return [
        communityFact('原申请答复期限', r['response_due_on']),
        communityFact('执行状态', sixState(r['status'])),
        if (r['verified_at'] == null)
          appNotice('核验尚未独立通过，不以申请时间伪造15个工作日执行倒计时。')
        else ...[
          communityFact('实际核验起点', communityDate(r['verified_at'])),
          communityFact('原执行期限', r['original_due_on']),
          communityFact('当前执行期限', r['due_on']),
          communityFact('冻结工作日历', r['calendar_version']),
          communityFact(
              '日历依据',
              r['deadline_basis'] == 'REVIEWED_CALENDAR'
                  ? '已审核并冻结的工作日历'
                  : '普通工作日估算，尚待人工核对'),
          if (r['deadline_basis'] != 'REVIEWED_CALENDAR')
            appNotice('普通工作日估算，实际工作日仍需人工核对。')
        ],
        ...sixFacts(r['extensions'], '已记录延期'),
        if (r['completed_at'] != null)
          communityFact('实际结案时间', communityDate(r['completed_at'])),
        appNotice('收到申请、已有答复和已提交执行不表示完成。实际账号关闭、资料执行与必要留存核对后，才由另一岗位复核结案。'),
        tradeButton(
            '查看原申请与实际执行',
            enabled
                ? () => Navigator.pushNamed(
                    context, '/privacy/requests?view=request&recordId=$id')
                : null,
            outline: true),
      ];
    }
    if (widget.kind == 'handover') {
      return [
        ...sixFacts({
          for (final k in [
            'policy',
            'started_at',
            'deadline_at',
            'order_count',
            'new_business_allowed'
          ])
            k: r[k]
        }, '七日交接范围'),
        communityFact('交接期状态', sixState(r['period_status'])),
        appNotice('解除后立即停止新业务。旧单沟通仅限未交接、仍有效授权且在交接期内的记录；补记不恢复到期权限，旧账和合同不改写。'),
        for (final row in communityRows(r['items']))
          communitySection('原订单 ${communityShort(row['order_id'])}', [
            communityFact('交接状态', sixState(row['status'])),
            communityFact('原订单状态', sixState(row['order_status'])),
            ...sixFacts(row['acknowledgements'], '双方各自确认'),
            ...sixFacts(row['notes'], '交接说明'),
            tradeButton(
                '查看原订单与旧账',
                enabled
                    ? () => Navigator.pushNamed(
                        context, '/trade/record?recordId=${row['order_id']}')
                    : null,
                outline: true)
          ]),
      ];
    }
    if (widget.kind == 'guardians') {
      final d = communityMap(r['data']);
      return [
        communityFact('关系或申请状态', sixState(r['current_status'])),
        communityFact('记录编号', r['id']),
        if (r['parent_id'] != null)
          tradeButton('打开本申请监护关系',
              enabled ? () => open(r['parent_id'] as String) : null,
              outline: true),
        ...sixFacts(d, '本记录核对依据'),
        appNotice('消费同意不解锁真实付款。退款、删除或注销以原业务的实际结果为准；申请已提交不显示已到账或已删除。'),
        if (r['kind'] == 'LINK' && !widget.operations) ...[
          tradeButton('读取使用量与休息提醒', enabled ? () => linked('usage') : null,
              outline: true),
          if (usage != null) ...sixFacts(usage, '当前实际使用量'),
          if (r['child_account_id'] == session.account?['id'])
            tradeButton('明确申请本次一分钟使用', enabled ? useMinute : null),
          tradeButton('读取已审核适龄预览', enabled ? () => linked('content') : null,
              outline: true),
          for (final item in content)
            communitySection('${item['title']}', [
              const Text('仅限适龄预览，每次访问重新检查权限和时段，不提供付费完整片。'),
              tradeButton(
                  '保存本项适龄预览',
                  enabled
                      ? () => savePrivate(
                          'links/$linkId/content/${item['listing_id']}/preview',
                          '适龄预览.mp4',
                          account: true)
                      : null,
                  outline: true)
            ]),
          if (nextContentCursor != null)
            tradeButton(
                '下一页适龄预览', enabled ? () => linked('content', next: true) : null,
                outline: true),
          if (r['guardian_account_id'] == session.account?['id']) ...[
            select('category', '必要资料查询类别', [
              ('PROFILE', '账号展示资料'),
              ('ARTIST_MATERIALS', '素材目录'),
              ('CONTENT', '内容目录'),
              ('TRANSACTIONS', '原订单索引')
            ]),
            tradeButton(
                '查询获准必要资料', enabled ? () => linked('information') : null,
                outline: true),
            ...sixFacts(information, '本次获准目录'),
            if (nextInfoCursor != null)
              tradeButton('下一页必要资料',
                  enabled ? () => linked('information', next: true) : null,
                  outline: true),
          ],
        ],
      ];
    }
    final deliveries = communityMap(r['deliveries']);
    return [
      communityFact('案件状态', sixState(r['current_status'])),
      communityFact('本案限制',
          r['restriction_active'] == true ? '仍有效' : '本案未限制或已解除，其他限制仍独立核验'),
      communityFact('运营首次响应目标', communityDate(r['initial_response_due_at'])),
      appNotice('这是运营响应目标，不是法律自动裁决期限。撤回通知不直接恢复内容；解除本案也不解除其他冻结依据。'),
      for (final key in ['notice', 'counter'])
        communitySection(key == 'notice' ? '获准通知材料' : '获准反通知材料', [
          ...sixFacts(r[key]),
          communityFact(
              '站内送达', communityMaybeMap(deliveries[key])['at'] ?? '尚未送达'),
          communityFact('对方明确已读',
              communityMaybeMap(deliveries[key])['read_at'] ?? '尚无已读回执'),
          for (final asset
              in communityMaybeMap(r[key])['evidence_asset_ids'] as List? ?? [])
            tradeButton(
                '读取获准依据 ${communityShort(asset)}',
                enabled
                    ? () => savePrivate(
                        '${ops}cases/$id/files/$asset', '案件依据-$asset',
                        account: account)
                    : null,
                outline: true),
        ]),
      ...sixFacts(r['information_request'], '补件要求'),
      ...sixFacts(r['pending_review'], '待独立复核'),
      ...sixFacts(r['resolution'], '本案处理结论'),
      ...sixFacts(r['history'], '获准办理记录'),
    ];
  }

  @override
  Widget build(BuildContext context) => PrivateDraftGuard(
      key: guard,
      session: session,
      controllers: controllers,
      value: () => {
            'action': action,
            'choices': choices,
            'checks': checks,
            'evidence': evidence,
            'disclosed': disclosed
          },
      locked: busy || checking || recovery != null,
      child: tradeScaffold(context, _titles[widget.kind]!, [
        communityHeading(
            _titles[widget.kind]!,
            widget.operations
                ? '按账号核验独立权限，切换机构不授予运营权限。'
                : '按当前获准记录办理，保留原规则、原版本与原请求。'),
        ...feedback,
        tradeButton('刷新当前记录', busy || checking ? null : load, outline: true),
        if (['guardians', 'infringement'].contains(widget.kind))
          tradeButton('返回我的记录列表', enabled ? () => open(null) : null,
              outline: true),
        if (id == null) ...[
          text('open_id', widget.kind == 'handover' ? '原直接合作编号' : '已知记录编号'),
          tradeButton(
              '打开获准记录',
              enabled
                  ? () {
                      try {
                        open(requiredId('open_id', '记录'));
                      } catch (e) {
                        setState(() => fail(e));
                      }
                    }
                  : null,
              outline: true),
          for (final row in rows)
            communitySection(
                '${sixState(row['current_status'])} · ${communityShort(row['id'])}',
                [
                  if (row['kind'] != null)
                    communityFact(
                        '记录类型',
                        const {
                              'LINK': '监护关系',
                              'REFUND': '未成年退款申请',
                              'INFORMATION': '信息处理申请',
                              'SPEND': '消费同意'
                            }[row['kind']] ??
                            row['kind']),
                  tradeButton('读取这份记录',
                      enabled ? () => open(row['id'] as String) : null,
                      outline: true),
                ]),
        ],
        ...facts(),
        if (nextCursor != null)
          tradeButton(
              '下一页记录',
              enabled
                  ? () {
                      setState(() => cursor = nextCursor);
                      load();
                    }
                  : null,
              outline: true),
        if (actions.isNotEmpty)
          communitySection('明确本次办理', [
            communitySelect(
                '本次办理事项',
                action,
                [for (final e in actions.entries) (e.key, e.value)],
                enabled
                    ? (v) => setState(() {
                          action = v;
                          disclosed = [];
                          choices.remove('decision');
                          if (v == 'controls' && record != null) {
                            final c = communityMaybeMap(
                                communityMaybeMap(record!['data'])['controls']);
                            checks['enabled'] = c['enabled'] == true;
                            input('daily_minutes').text =
                                '${c['daily_minutes'] ?? ''}';
                            for (final key in ['single_minor', 'daily_minor']) {
                              input(key).text = c[key] is int
                                  ? (c[key] / 100).toStringAsFixed(2)
                                  : '';
                            }
                          }
                          if (v == 'refund-request' &&
                              allocationInputs.isEmpty) {
                            allocationInputs.add((field(), field()));
                          }
                        })
                    : null),
            ...formFields(),
            if (actionReason(action) != null) appNotice(actionReason(action)!),
            tradeButton('提交本次明确办理',
                enabled && actionReason(action) == null ? submit : null),
          ]),
      ]));
}

const _labels = <String, String>{
  'referral_contract_policy': '原直推合同版本',
  'referral_bps': '四类直接推荐基点',
  'rate_bps': '本单冻结比例（100基点=1%）',
  'status': '原归因状态',
  'referrer_party_id': '直接推荐主体',
  'rule_snapshot': '原规则快照（历史比例不重算）',
  'category': '原业务类别',
  'STOCK': '现货',
  'AUDITION': '试镜',
  'CUSTOMIZATION': '定制',
  'COMMERCIAL': '商单',
  'reason': '实际原因',
  'at': '记录时间',
  'account_id': '办理账号',
  'guardian_account_id': '监护账号',
  'child_account_id': '孩子账号',
  'relationship': '关系说明',
  'valid_until': '有效截止',
  'rule': '冻结审核规则',
  'rule_id': '原规则编号',
  'version': '规则版本',
  'daily_minutes': '每日分钟上限',
  'single_minor': '单次消费同意上限（分）',
  'daily_minor': '每日消费同意上限（分）',
  'rest_minutes': '连续使用休息提醒（分钟）',
  'rest_reminder_minutes': '休息提醒分钟',
  'night_start': '夜间限制起点（北京时间）',
  'night_end': '夜间限制终点（北京时间）',
  'terms': '原审核条款',
  'controls': '当前使用限制',
  'enabled': '允许限制内使用',
  'age_band': '已核验年龄范围',
  'child_accepted': '孩子本人已确认',
  'review': '独立核验记录',
  'decision': '明确结论',
  'identity_checked': '身份实际核验',
  'relationship_checked': '关系实际核验',
  'evidence_asset_ids': '获准原依据编号',
  'payment_id': '原成功付款',
  'allocations': '原付款分项',
  'line_id': '原分项编号',
  'amount_minor': '金额（分）',
  'refund_id': '原退款记录',
  'actual_refund_status': '原退款实际结果',
  'privacy_request_id': '信息处理原申请',
  'actual_privacy_status': '信息处理实际进展',
  'response_due_on': '原申请答复期限',
  'purpose': '本次同意用途',
  'real_payment_allowed': '实际付款获准',
  'seconds_reserved': '今日已预留使用秒数',
  'spend_reserved_minor': '今日已记录消费同意（分）',
  'local_date': '北京时间使用日期',
  'slot_until': '本次使用时段截止',
  'real_minor_transactions_enabled': '真实未成年人交易启用',
  'policy': '原规则版本',
  'started_at': '交接起点',
  'deadline_at': '原截止时间',
  'new_business_allowed': '允许新业务',
  'order_count': '原待交接旧单数',
  'last_acknowledged_order_id': '最近交接订单',
  'note': '实际交接说明',
  'statement': '获准正文',
  'contact': '本人联系资料（不自动送达）',
  'proposer_account_id': '结论提议人',
  'reviewer_account_id': '独立复核人',
  'action': '本次办理',
  'due_on': '延期后执行期限',
  'previous_due_on': '延期前执行期限',
  'original_due_on': '原执行期限'
};
List<Widget> sixFacts(Object? value, [String? title]) {
  if (value == null) return [];
  List<Widget> children;
  if (value is Map) {
    children = [
      for (final e in value.entries)
        if (e.value is Map || e.value is List)
          ...sixFacts(e.value, _labels[e.key] ?? '${e.key}')
        else
          communityFact(
              _labels[e.key] ?? '${e.key}',
              e.value is bool
                  ? e.value == true
                      ? '是'
                      : '否'
                  : sixState(e.value))
    ];
  } else if (value is List) {
    children = [for (final x in value) ...sixFacts(x)];
  } else {
    children = [communityFact('记录', sixState(value))];
  }
  return title == null ? children : [communitySection(title, children)];
}
