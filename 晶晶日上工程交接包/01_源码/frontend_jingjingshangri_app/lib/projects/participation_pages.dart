import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../artists/artists_api.dart';
import '../artists/artists_models.dart';
import '../engagement/community_support.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../trade/trade_widgets.dart';
import 'project_models.dart' show projectDigest;

const participationModes = {
  'FIXED_FEE': '固定片酬',
  'REVENUE_SHARE': '发行收入分成',
  'MIXED': '片酬与发行收入分成'
};
const participationRoles = {
  'PRODUCER': '出品方',
  'PARTICIPANT': '参演方',
  'RIGHTSHOLDER': '权利人',
  'SUPPLIER': '服务方',
  'PLATFORM': '平台',
  'MCN': '经纪机构'
};

Map<String, dynamic> participationRecord(Object? raw,
    {String? id, String? kind}) {
  final r = communityRecord(raw, id: id, kind: kind),
      d = communityMap(r['data']);
  communityRequire(projectDigest(d) == r['content_sha256'] &&
      communityId(r['owner_party_id']) &&
      (r['kind'] == 'PROJECT'
          ? r['project_id'] == null
          : communityId(r['project_id'])));
  if (r['kind'] == 'PARTICIPATION') {
    final t = communityMap(d['terms']);
    communityRequire(communityId(d['candidate_id']) &&
        communityId(d['role_id']) &&
        communityId(d['avatar_id']) &&
        d['fee_minor'] is int &&
        d['fee_minor'] >= 0 &&
        participationModes.containsKey(t['mode']) &&
        t['exclusive'] is bool &&
        t['installments'] is List &&
        t['start_payment_keys'] is List &&
        d['confirmers'] is List &&
        d['cast'] is Map &&
        communityId(d['evidence_asset_id']));
    participationTermsValid(t, d['fee_minor']);
  }
  if (r['kind'] == 'INCOME_AGREEMENT') {
    participationRevenue(communityMap(d['revenue']));
    communityRequire(
        d['confirmers'] is List && communityId(d['evidence_asset_id']));
  }
  return r;
}

void participationRevenue(Map<String, dynamic> revenue) {
  communityRequire(revenue['basis'] == 'VERIFIED_CHANNEL_NET_RECEIPTS' &&
      revenue['terms'] is String &&
      revenue['terms'].trim().isNotEmpty);
  final rows = communityRows(revenue['shares']);
  communityRequire(rows.isNotEmpty &&
      rows.length <= 30 &&
      rows.map((r) => r['party_id']).toSet().length == rows.length &&
      rows.every((r) =>
          communityId(r['party_id']) &&
          r['bps'] is int &&
          r['bps'] >= 0 &&
          r['bps'] <= 10000 &&
          participationRoles.containsKey(r['role'])) &&
      rows.fold<int>(0, (s, r) => s + (r['bps'] as int)) == 10000);
}

void participationTermsValid(Map<String, dynamic> t, int fee) {
  communityRequire(participationModes.containsKey(t['mode']) &&
      ['EXISTING_MATERIAL', 'NEW_GENERATION'].contains(t['usage']) &&
      t['exclusive'] is bool &&
      (t['mode'] == 'REVENUE_SHARE') == (fee == 0));
  for (final key in [
    'territory',
    'language',
    'permitted_uses',
    'prohibited_uses',
    'cancellation_terms'
  ]) {
    communityRequire(t[key] is String && t[key].trim().isNotEmpty);
  }
  communityRequire(DateTime.tryParse('${t['valid_until']}') != null);
  final steps = communityRows(t['installments']);
  communityRequire(steps.length <= 20 &&
      steps.map((x) => x['key']).toSet().length == steps.length &&
      steps.every((x) =>
          x['key'] is String &&
          x['amount_minor'] is int &&
          x['amount_minor'] > 0 &&
          x['milestone'] is String &&
          x['milestone'].trim().isNotEmpty) &&
      steps.fold<int>(0, (n, s) => n + (s['amount_minor'] as int)) == fee &&
      t['start_payment_keys'] is List &&
      (t['start_payment_keys'] as List).toSet().length ==
          t['start_payment_keys'].length &&
      (t['start_payment_keys'] as List)
          .every((x) => steps.any((s) => s['key'] == x)));
  if (t['mode'] == 'FIXED_FEE') {
    communityRequire(t['revenue'] == null);
  } else {
    participationRevenue(communityMap(t['revenue']));
  }
}

class ProjectParticipationPage extends StatelessWidget {
  const ProjectParticipationPage(
      {super.key, this.view = 'agreements', this.recordId, this.projectId});
  final String view;
  final String? recordId, projectId;
  @override
  Widget build(BuildContext context) => _ProjectAgreementGate(
      view: view, recordId: recordId, projectId: projectId, income: false);
}

class ProjectIncomePage extends StatelessWidget {
  const ProjectIncomePage(
      {super.key, this.view = 'agreements', this.recordId, this.projectId});
  final String view;
  final String? recordId, projectId;
  @override
  Widget build(BuildContext context) => _ProjectAgreementGate(
      view: view, recordId: recordId, projectId: projectId, income: true);
}

class _ProjectAgreementGate extends StatelessWidget {
  const _ProjectAgreementGate(
      {required this.view,
      required this.income,
      this.recordId,
      this.projectId});
  final String view;
  final bool income;
  final String? recordId, projectId;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'projects',
      route:
          '/projects/${income ? 'income' : 'participation'}?view=$view${recordId == null ? '' : '&recordId=$recordId'}${projectId == null ? '' : '&projectId=$projectId'}',
      title: income ? '发行收入约定' : '参演约定',
      builder: (s) => _ProjectAgreement(
          session: s,
          view: view,
          income: income,
          id: recordId,
          projectId: projectId));
}

class _ShareInput {
  _ShareInput(this.percent);
  final TextEditingController percent;
  String? party;
  String role = 'PARTICIPANT';
}

class _StageInput {
  _StageInput(this.amount, this.milestone, {this.key});
  final TextEditingController amount, milestone;
  final String? key;
  bool start = false;
}

class _ProjectAgreement extends StatefulWidget {
  const _ProjectAgreement(
      {required this.session,
      required this.view,
      required this.income,
      this.id,
      this.projectId});
  final AccountSession session;
  final String view;
  final bool income;
  final String? id, projectId;
  @override
  State<_ProjectAgreement> createState() => _ProjectAgreementState();
}

class _ProjectAgreementState extends CommunityPageState<_ProjectAgreement> {
  @override
  AccountSession get session => widget.session;
  @override
  String get domain => 'projects';
  late final why = field(),
      territory = field(),
      language = field(),
      until = field(),
      allowed = field(),
      prohibited = field(),
      cancellation = field(),
      revenueTerms = field(),
      fee = field(),
      retained = field(),
      person = field(),
      look = field(),
      voice = field();
  String mode = 'FIXED_FEE', usage = 'EXISTING_MATERIAL';
  bool exclusive = false, agreed = false, initialized = false;
  String? selectedCandidate, milestoneKey, cursor, nextCursor, projectNotice;
  List<Map<String, dynamic>> rows = [],
      candidates = [],
      confirmations = [],
      roles = [];
  List<ArtistPerson> people = [];
  List<ArtistRecord> variants = [];
  List<String> evidence = [];
  final shares = <_ShareInput>[], stages = <_StageInput>[];
  Map<String, dynamic>? record, project, progress;
  String get base => '/projects/${widget.income ? 'income' : 'participation'}';
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void clearPrivate() {
    rows = [];
    candidates = [];
    roles = [];
    confirmations = [];
    people = [];
    variants = [];
    evidence = [];
    record = null;
    project = null;
    projectNotice = null;
    progress = null;
    agreed = false;
    shares.clear();
    stages.clear();
  }

  @override
  void fail(Object e) {
    super.fail(e);
    if (e is AccountError && e.status == 412) agreed = false;
  }

  Future<List<Map<String, dynamic>>> all(String projectId, String kind) async {
    final list = <Map<String, dynamic>>[], seen = <String>{};
    String? cursor;
    do {
      final d = await api.read('projects/$projectId/records', query: {
        'kind': kind,
        'limit': 100,
        if (cursor != null) 'cursor': cursor
      });
      list.addAll(
          communityItems(d).map((r) => participationRecord(r, kind: kind)));
      cursor = d['next_cursor'];
      communityRequire(
          cursor == null || communityId(cursor) && seen.add(cursor));
    } while (cursor != null);
    return list;
  }

  @override
  Future<void> load() async {
    final t = ++ticket;
    setState(() {
      checking = true;
      error = null;
    });
    try {
      Map<String, dynamic>? r, p, pr;
      List<Map<String, dynamic>> list = [], cs = [], cast = [];
      String? next;
      if (widget.id != null) {
        r = participationRecord(
            await api.read('records/${communityRequiredId(widget.id!, '原记录')}'),
            id: widget.id);
        if (r['kind'] == 'PROJECT') {
          p = r;
        } else if (widget.view != 'agreement' || widget.projectId != null) {
          communityRequire(
              widget.projectId == null || widget.projectId == r['project_id']);
          p = participationRecord(await api.read('records/${r['project_id']}'),
              kind: 'PROJECT');
        }
      } else if (widget.projectId != null) {
        p = participationRecord(
            await api.read(
                'records/${communityRequiredId(widget.projectId!, '项目')}'),
            kind: 'PROJECT');
      }
      if (p != null) {
        if (['agreements', 'new', 'amend'].contains(widget.view)) {
          cast = await all(p['id'], 'CANDIDATE');
          final currentRoles = await all(p['id'], 'ROLE');
          if (mounted && t == ticket) roles = currentRoles;
        }
        if (['agreements', 'new'].contains(widget.view)) {
          list = await all(
              p['id'], widget.income ? 'INCOME_AGREEMENT' : 'PARTICIPATION');
        }
      } else if (r == null) {
        final d = await api.read('projects',
            query: {'limit': 20, if (cursor != null) 'cursor': cursor});
        list = communityItems(d)
            .map((r) => participationRecord(r, kind: 'PROJECT'))
            .toList();
        next = d['next_cursor'];
        communityRequire(next == null || communityId(next) && next != cursor);
      }
      if (r != null &&
          ['PARTICIPATION', 'INCOME_AGREEMENT'].contains(r['kind'])) {
        cs = communityItems(await api.read('records/${r['id']}/confirmations'));
        if (r['kind'] == 'PARTICIPATION') {
          pr = await api.read('participations/${r['id']}/progress');
          communityRequire(pr['agreement_id'] == r['id'] &&
              (pr['order_id'] == null || communityId(pr['order_id'])) &&
              pr['milestones'] is List);
        }
      }
      if (['new', 'amend'].contains(widget.view) && !widget.income) {
        final list = <ArtistPerson>[], seen = <String>{};
        String? c;
        do {
          final page = await ArtistsApi(session).people(cursor: c);
          list.addAll(page.items
              .where((p) => p.owner == session.partyId && p.adultVerified));
          c = page.cursor;
          communityRequire(c == null || seen.add(c));
        } while (c != null);
        if (mounted && t == ticket) people = list;
      }
      if (!mounted || t != ticket) return;
      setState(() {
        record = r;
        project = p;
        progress = pr;
        rows = list;
        candidates = cast;
        confirmations = cs;
        nextCursor = next;
      });
      if (!initialized && ['new', 'amend'].contains(widget.view)) {
        initializeForm();
        initialized = true;
      }
    } catch (e) {
      if (mounted && t == ticket) setState(() => fail(e));
    } finally {
      if (mounted && t == ticket) setState(() => checking = false);
    }
  }

  Future<void> loadOwnedProject() async {
    final r = record;
    if (r == null) return;
    final e = session.epoch, p = session.partyId;
    setState(() {
      checking = true;
      projectNotice = null;
    });
    try {
      Map<String, dynamic>? owned;
      final seen = <String>{};
      String? next;
      do {
        api.check(e, p);
        final page = await api.read('projects', query: {
          'limit': 100,
          if (next != null) 'cursor': next,
        });
        for (final row in communityItems(page)) {
          final candidate = participationRecord(row, kind: 'PROJECT');
          if (candidate['id'] == r['project_id'] &&
              candidate['owner_party_id'] == p) {
            owned = candidate;
          }
        }
        next = page['next_cursor'];
        communityRequire(next == null || communityId(next) && seen.add(next));
      } while (owned == null && next != null);
      api.check(e, p);
      Map<String, dynamic>? current;
      if (owned != null) {
        current = participationRecord(await api.read('records/${owned['id']}'),
            id: owned['id'], kind: 'PROJECT');
        communityRequire(current['owner_party_id'] == p);
      }
      api.check(e, p);
      if (mounted) {
        setState(() {
          project = current;
          projectNotice =
              current == null ? '当前身份的项目目录中没有这项出品方记录。仍可按本约定的原文与会签权限办理。' : null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => fail(e));
    } finally {
      if (mounted) setState(() => checking = false);
    }
  }

  @override
  Future<void> validateResult(Map<String, dynamic> r) async {
    participationRecord(r);
    if (recoverySuffix != null && recovery != null) {
      await proof(recoverySuffix!, communityMap(recovery!['body']), r);
    }
  }

  Future<void> proof(
      String suffix, Map<String, dynamic> body, Map<String, dynamic> r) async {
    if (suffix.endsWith('/confirmation')) {
      final rows =
          communityItems(await api.read('records/${r['id']}/confirmations'));
      if (!rows.any((x) =>
          x['party_id'] == session.partyId &&
          x['content_sha256'] == body['content_sha256'] &&
          x['decision'] == body['decision'] &&
          x['reason'] == body['reason'])) {
        throw const AccountError(503, 'CONFIRMATION_RESULT_UNKNOWN',
            uncertain: true);
      }
    } else if (suffix.endsWith('/milestones')) {
      final p = await api.read('participations/${r['id']}/progress');
      if (!communityRows(p['milestones']).any((x) =>
          x['installment_key'] == body['installment_key'] &&
          x['evidence_asset_id'] == body['evidence_asset_id'] &&
          x['reason'] == body['reason'])) {
        throw const AccountError(503, 'CONFIRMATION_RESULT_UNKNOWN',
            uncertain: true);
      }
    } else if (suffix.endsWith('/activation')) {
      final a = communityMap(communityMap(r['data'])['amendment']);
      final old = participationRecord(
          await api.read('records/${a['previous_agreement_id']}'),
          kind: 'PARTICIPATION');
      communityRequire(old['current_status'] == 'SUPERSEDED' &&
          old['content_sha256'] == a['previous_sha256']);
    }
  }

  @override
  Future<void> reconcilePending() async {
    final p = recoverySuffix!.split('/');
    if (p.length > 1) {
      await api.read('records/${p[1]}');
    } else {
      await api.read('projects', query: {'limit': 20});
    }
  }

  Future<void> submit(Future<void> Function() work) async {
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => fail(e));
    }
  }

  Future<bool> confirm(String title, String body) async =>
      await showDialog<bool>(
          context: context,
          builder: (c) =>
              AlertDialog(title: Text(title), content: Text(body), actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c, false),
                    child: const Text('返回')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, true),
                    child: const Text('确认按本次约定办理'))
              ])) ==
      true;
  void open(String view, {String? id, String? projectId}) => Navigator.pushNamed(
      context,
      '$base?view=$view${id == null ? '' : '&recordId=$id'}${projectId == null ? '' : '&projectId=$projectId'}');
  String roleTitle(Map<String, dynamic>? candidate) {
    final roleId = communityMaybeMap(candidate?['data'])['role_id'];
    for (final r in roles) {
      if (r['id'] == roleId) {
        return communityText(communityMap(r['data'])['title']);
      }
    }
    return '本项目已确认角色';
  }

  Map<String, dynamic>? get candidate {
    if (record?['kind'] == 'CANDIDATE') return record;
    for (final r in candidates) {
      if (r['id'] == selectedCandidate) return r;
    }
    return null;
  }

  void initializeForm() {
    final p = communityMap(project!['data']),
        old = record?['kind'] == 'PARTICIPATION'
            ? communityMap(record!['data'])
            : null,
        t = old == null ? <String, dynamic>{} : communityMap(old['terms']);
    selectedCandidate = old?['candidate_id'] ?? candidate?['id'];
    final c = candidate;
    mode =
        '${t['mode'] ?? ((c == null ? 0 : communityMap(c['data'])['amount_minor']) == 0 ? 'REVENUE_SHARE' : 'FIXED_FEE')}';
    fee.text = old == null
        ? ((c == null ? 0 : communityMap(c['data'])['amount_minor']) / 100)
            .toStringAsFixed(2)
        : ((old['fee_minor'] as int) / 100).toStringAsFixed(2);
    usage = '${t['usage'] ?? 'EXISTING_MATERIAL'}';
    exclusive = t['exclusive'] == true;
    territory.text =
        '${t['territory'] ?? communityMap(p['scope'])['territory']}';
    language.text = '${t['language'] ?? communityMap(p['scope'])['language']}';
    until.text =
        '${t['valid_until'] ?? communityMap(p['scope'])['valid_until']}';
    allowed.text = '${t['permitted_uses'] ?? ''}';
    prohibited.text = '${t['prohibited_uses'] ?? ''}';
    cancellation.text = '${t['cancellation_terms'] ?? ''}';
    if (old != null) {
      final cast = communityMap(old['cast']);
      person.text = cast['person_id'];
      look.text = cast['look_version_id'];
      voice.text = cast['voice_version_id'] ?? '';
    }
    for (final s in communityRows(t['installments'] ?? [])) {
      stages.add(_StageInput(
          field(((s['amount_minor'] as int) / 100).toStringAsFixed(2)),
          field(s['milestone']),
          key: s['key'])
        ..start = (t['start_payment_keys'] as List).contains(s['key']));
    }
    final revenue = communityMaybeMap(t['revenue']);
    revenueTerms.text = '${revenue['terms'] ?? ''}';
    for (final s in communityRows(revenue['shares'] ?? [])) {
      shares
          .add(_ShareInput(field(((s['bps'] as int) / 100).toStringAsFixed(2)))
            ..party = s['party_id']
            ..role = s['role']);
    }
    if (shares.isEmpty) shares.add(_ShareInput(field()));
    if (stages.isEmpty && mode != 'REVENUE_SHARE') {
      stages.add(_StageInput(field(fee.text), field())..start = true);
    }
    if (person.text.isNotEmpty) selectPerson(person.text);
  }

  Future<void> selectPerson(String? id) async {
    if (id == null) return;
    final e = session.epoch, p = session.partyId;
    setState(() {
      person.text = id;
      variants = [];
      checking = true;
      error = null;
    });
    try {
      final list = <ArtistRecord>[];
      for (final k in ['LOOK', 'VOICE']) {
        list.addAll(await ArtistsApi(session).allRecords(id, k));
      }
      if (mounted && e == session.epoch && p == session.partyId) {
        setState(() => variants = list);
      }
    } catch (e) {
      if (mounted) setState(() => fail(e));
    } finally {
      if (mounted) setState(() => checking = false);
    }
  }

  List<(String, String)> get parties {
    final ids = <String>{
      if (project != null) project!['owner_party_id'],
      for (final c in candidates) c['owner_party_id'],
      if (record != null) record!['owner_party_id'],
      for (final x in communityRows(
          communityMaybeMap(record?['data'])['confirmers'] ?? []))
        x['party_id']
    };
    return [
      for (final id in ids)
        (
          id,
          id == session.partyId
              ? '当前本人身份'
              : project?['owner_party_id'] == id
                  ? '本项目出品方'
                  : '本项目参与方 ${communityShort(id)}'
        )
    ];
  }

  Map<String, dynamic> revenueValue() {
    final v = {
      'basis': 'VERIFIED_CHANNEL_NET_RECEIPTS',
      'shares': [
        for (final s in shares)
          {
            'party_id': communityRequiredId(s.party ?? '', '本项目收益方'),
            'bps': communityMinor(s.percent.text, '分成比例', zero: true),
            'role': s.role
          }
      ],
      'terms': communityRequired(revenueTerms.text, '发行收入分成约定', max: 8000)
    };
    if (shares.map((s) => s.party).toSet().length != shares.length ||
        shares.fold<int>(
                0,
                (sum, s) =>
                    sum + communityMinor(s.percent.text, '分成比例', zero: true)) !=
            10000) {
      throw const AccountError(400, '分成比例须合计100%，同一收益方不能重复');
    }
    participationRevenue(v);
    return v;
  }

  Map<String, dynamic> termsValue(int amount) {
    final installments = <Map<String, dynamic>>[];
    if (mode != 'REVENUE_SHARE') {
      for (final (i, s) in stages.indexed) {
        installments.add({
          'key': s.key ?? 'stage_${i + 1}',
          'amount_minor': communityMinor(s.amount.text, '本期片酬'),
          'milestone': communityRequired(s.milestone.text, '本期达成条件', max: 2000)
        });
      }
    }
    final v = {
      'mode': mode,
      'usage': usage,
      'exclusive': exclusive,
      'territory': communityRequired(territory.text, '使用地域', max: 100),
      'language': communityRequired(language.text, '使用语言', max: 100),
      'valid_until': communityInstant(until.text, '使用截止时间'),
      'permitted_uses': communityRequired(allowed.text, '允许用途', max: 8000),
      'prohibited_uses': communityRequired(prohibited.text, '禁止用途', max: 8000),
      'installments': installments,
      'start_payment_keys': [
        for (final (i, s) in stages.indexed)
          if (mode != 'REVENUE_SHARE' && s.start) s.key ?? 'stage_${i + 1}'
      ],
      'revenue': mode == 'FIXED_FEE' ? null : revenueValue(),
      'cancellation_terms':
          communityRequired(cancellation.text, '取消与退出约定', max: 8000)
    };
    if ((mode == 'REVENUE_SHARE') != (amount == 0)) {
      throw const AccountError(400, '纯分成方式的片酬须为0；固定片酬或混合方式的片酬须大于0');
    }
    if (installments.fold<int>(
            0, (sum, s) => sum + (s['amount_minor'] as int)) !=
        amount) {
      throw const AccountError(400, '各期片酬合计须等于本次片酬总额');
    }
    participationTermsValid(v, amount);
    return v;
  }

  List<Widget> revenueFields() => [
        communityFact('收入依据', '经核实的渠道净收入；尚未核实发行事实或入账时不计成已到账收益'),
        const Text('各方合计100%，最多两位小数。'),
        for (final (i, s) in shares.indexed)
          communitySection('分成约定 ${i + 1}', [
            communitySelect('本项目实际收益方', s.party, parties,
                enabled ? (v) => setState(() => s.party = v) : null),
            communitySelect(
                '该方角色',
                s.role,
                [for (final r in participationRoles.entries) (r.key, r.value)],
                enabled ? (v) => setState(() => s.role = v!) : null),
            communityField(s.percent, '分成比例（%）',
                keyboard: TextInputType.number),
            if (shares.length > 1)
              TextButton(
                  onPressed:
                      enabled ? () => setState(() => shares.removeAt(i)) : null,
                  child: const Text('移除这一方分成'))
          ]),
        if (shares.length < 30)
          tradeButton(
              '增加本项目收益方',
              enabled
                  ? () => setState(() => shares.add(_ShareInput(field())))
                  : null,
              outline: true),
        communityField(revenueTerms, '具体分成范围、结算条件与约定', lines: 4),
        appNotice('可选择本项目已关联的主体。新增外部权利人或复杂机构方案请在网页工作台办理，不通过手填编号扩大授权。')
      ];
  List<Widget> listView() => [
        communityHeading(widget.income ? '发行收入，先约定再核实' : '参演约定，把每一项讲清楚',
            '片酬、发行分成、会签和实际付款各自保留原始依据。'),
        if (project != null) ...[
          communityFact('项目', communityMap(project!['data'])['title']),
          if (widget.income && project!['owner_party_id'] == session.partyId)
            tradeButton(
                '提出新的发行收入约定', () => open('new', projectId: project!['id'])),
          if (!widget.income)
            for (final c in candidates.where((c) =>
                c['owner_party_id'] == session.partyId &&
                c['current_status'] == 'CONFIRMED'))
              tradeButton(
                  '为「${roleTitle(c)}」提出本人参演约定', () => open('new', id: c['id']),
                  outline: true),
          tradeButton(
              '查看项目方案和发行事实',
              () => Navigator.pushNamed(
                  context, '/projects/record?recordId=${project!['id']}'),
              outline: true)
        ],
        if (rows.isEmpty && !checking) appNotice('暂无当前身份获准读取的约定。'),
        for (final r in rows)
          communitySection(
              r['kind'] == 'PROJECT'
                  ? communityText(communityMap(r['data'])['title'])
                  : widget.income
                      ? '发行收入约定'
                      : '参演约定',
              [
                communityFact('进展', communityState(r['current_status'])),
                communityFact('版本', r['object_version']),
                tradeButton(
                    r['kind'] == 'PROJECT' ? '查看该项目相关约定' : '查看完整原条款和会签',
                    () => open(
                        r['kind'] == 'PROJECT' ? 'agreements' : 'agreement',
                        id: r['kind'] == 'PROJECT' ? null : r['id'],
                        projectId: r['kind'] == 'PROJECT'
                            ? r['id']
                            : project?['owner_party_id'] == session.partyId
                                ? project!['id']
                                : null),
                    outline: true)
              ]),
        if (nextCursor != null)
          tradeButton(
              '读取下一页项目',
              enabled
                  ? () {
                      setState(() => cursor = nextCursor);
                      load();
                    }
                  : null,
              outline: true)
      ];
  List<Widget> revenueFacts(Map<String, dynamic> r) => [
        communityFact('收入依据', '经核实的渠道净收入'),
        SelectableText(communityText(r['terms'])),
        for (final s in communityRows(r['shares']))
          communityFact(
              '${participationRoles[s['role']]} · ${parties.where((x) => x.$1 == s['party_id']).firstOrNull?.$2 ?? communityShort(s['party_id'])}',
              '${((s['bps'] as int) / 100).toStringAsFixed(2)}%')
      ];
  List<Widget> agreementView() {
    final r = record;
    if (r == null) return [];
    final d = communityMap(r['data']),
        income = r['kind'] == 'INCOME_AGREEMENT',
        terms = income ? null : communityMap(d['terms']),
        amendment = communityMaybeMap(d['amendment']);
    final ownSigner = communityRows(d['confirmers'])
            .any((s) => s['party_id'] == session.partyId),
        ownDecision = confirmations
            .where((s) =>
                s['party_id'] == session.partyId &&
                s['content_sha256'] == r['content_sha256'])
            .firstOrNull;
    final producer = project?['owner_party_id'] == session.partyId;
    return [
      communityHeading(income ? '本次发行收入约定' : '本次参演约定', '阅读完整原条款后，会签这一份内容与版本。'),
      communityFact(
          '项目',
          project == null
              ? '关联项目 ${communityShort(r['project_id'])}'
              : communityMap(project!['data'])['title']),
      communityFact('进展', communityState(r['current_status'])),
      communityFact('版本', r['object_version']),
      if (income)
        ...revenueFacts(communityMap(d['revenue']))
      else ...[
        communityFact('方式', participationModes[terms!['mode']]),
        communityFact('片酬原额', communityMoney(d['fee_minor'])),
        communityFact(
            '形象用途', terms['usage'] == 'NEW_GENERATION' ? '生成新的表演' : '使用已有素材'),
        communityFact('排他约定', terms['exclusive'] == true ? '本次有排他约定' : '本次非排他'),
        for (final x in [
          ('territory', '地域'),
          ('language', '语言'),
          ('valid_until', '使用截止'),
          ('permitted_uses', '允许用途'),
          ('prohibited_uses', '禁止用途'),
          ('cancellation_terms', '取消和退出约定')
        ])
          communityFact(x.$2,
              x.$1 == 'valid_until' ? communityDate(terms[x.$1]) : terms[x.$1]),
        for (final (i, s) in communityRows(terms['installments']).indexed)
          communitySection('原分期 · 第 ${i + 1} 期', [
            communityFact('金额', communityMoney(s['amount_minor'])),
            communityFact('达成条件', s['milestone']),
            communityFact(
                '开工前须支付',
                (terms['start_payment_keys'] as List).contains(s['key'])
                    ? '是'
                    : '按本期条件办理'),
            ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: const Text('原分期依据'),
                children: [communityFact('原分期标识', s['key'])])
          ]),
        if (terms['revenue'] != null)
          ...revenueFacts(communityMap(terms['revenue'])),
        if (amendment.isNotEmpty)
          communitySection(
              amendment['kind'] == 'RECAST' ? '换角后的独立金额' : '改价与条款变更', [
            communityFact('变更原因', amendment['reason']),
            communityFact(
                '新约需补现金', communityMoney(amendment['cash_required_minor'])),
            for (final s in communityRows(amendment['settlements']))
              communitySection('原付款处理依据', [
                communityFact('原资金净额', communityMoney(s['net_minor'])),
                communityFact('旧约保留金额', communityMoney(s['retained_minor'])),
                communityFact(
                    '待原单退款预算',
                    communityMoney((s['net_minor'] as int) -
                        (s['retained_minor'] as int))),
                tradeButton(
                    '核对这笔原订单退款和款项',
                    () => Navigator.pushNamed(
                        context, '/trade/record?recordId=${s['order_id']}'),
                    outline: true)
              ]),
            appNotice('旧约保留、原单退款、新约补款分别核实。确认新约不代表退款或补款已经成功。')
          ]),
        if (progress?['order_id'] != null)
          tradeButton(
              '查看本约定实际付款订单',
              () => Navigator.pushNamed(
                  context, '/trade/record?recordId=${progress!['order_id']}'),
              outline: true),
        if (progress != null)
          for (final (i, s) in communityRows(progress!['milestones']).indexed)
            communitySection('已确认履约节点 · 第 ${i + 1} 项', [
              communityFact('达成说明', s['reason']),
              ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: const Text('原节点依据'),
                  children: [communityFact('原分期标识', s['installment_key'])])
            ])
      ],
      if (d['review'] is Map)
        communitySection('独立审核意见', [
          communityFact(
              '审核结论', communityState(communityMap(d['review'])['decision'])),
          communityFact('说明', communityMap(d['review'])['reason'])
        ]),
      communitySection('各方会签进度', [
        for (final s in communityRows(d['confirmers']))
          communityFact(
              s['party_id'] == session.partyId
                  ? '当前本人身份'
                  : '本次相关方 ${communityShort(s['party_id'])}',
              confirmations
                      .where((c) =>
                          c['party_id'] == s['party_id'] &&
                          c['content_sha256'] == r['content_sha256'])
                      .map((c) =>
                          c['decision'] == 'APPROVED' ? '已同意本次原文' : '已拒绝本次原文')
                      .firstOrNull ??
                  '尚未会签'),
        if (ownDecision != null)
          communityFact('我的原会签说明', ownDecision['reason']),
        if (ownSigner &&
            ownDecision == null &&
            r['current_status'] == 'APPROVED') ...[
          communityField(why, '本人会签意见', lines: 3),
          communityCheck('我已阅读全部原条款、金额、分成及变更影响，确认这一份版本', agreed,
              enabled ? (v) => setState(() => agreed = v == true) : null),
          for (final decision in ['APPROVED', 'REJECTED'])
            tradeButton(
                decision == 'APPROVED' ? '本人同意本次约定' : '本人拒绝本次约定',
                enabled && agreed
                    ? () => submit(() async {
                          final opinion = communityRequired(why.text, '本人意见');
                          final out = await act(
                              '${income ? 'income-agreements' : 'participations'}/${r['id']}/confirmation',
                              {
                                'content_sha256': r['content_sha256'],
                                'decision': decision,
                                'reason': opinion
                              },
                              version: r['object_version'],
                              validate: (v) async {
                            participationRecord(v, id: r['id']);
                            await proof(
                                '${income ? 'income-agreements' : 'participations'}/${r['id']}/confirmation',
                                {
                                  'content_sha256': r['content_sha256'],
                                  'decision': decision,
                                  'reason': opinion
                                },
                                v);
                          });
                          if (out != null) setState(() => agreed = false);
                        })
                    : null,
                outline: decision == 'REJECTED')
        ]
      ]),
      if (!income && producer && r['current_status'] == 'APPROVED')
        communitySection('出品方后续办理', [
          if (amendment.isNotEmpty)
            tradeButton(
                '会签齐备后启用这份新约',
                enabled
                    ? () => submit(() async {
                          if (await confirm('核对启用新约',
                              '服务器将重新核对各方会签、旧约资金和当前角色；旧约保留历史，新约正式替代后才继续履约。')) {
                            await act('participations/${r['id']}/activation',
                                {'content_sha256': r['content_sha256']},
                                version: r['object_version'],
                                validate: (v) => proof(
                                    'participations/${r['id']}/activation',
                                    {},
                                    v));
                          }
                        })
                    : null,
                outline: true),
          if (progress?['order_id'] == null &&
              (amendment.isEmpty
                      ? d['fee_minor']
                      : amendment['cash_required_minor']) >
                  0)
            tradeButton(
                '按已会签参演约定建立付款订单',
                enabled
                    ? () => Navigator.pushNamed(context,
                        '/trade/participation-checkout?agreementId=${r['id']}&agreementSha256=${r['content_sha256']}')
                    : null),
          communitySelect(
              '已达到的原约履约节点',
              milestoneKey,
              [
                for (final s in (amendment.isNotEmpty
                    ? (amendment['cash_required_minor'] > 0
                        ? [
                            {'key': 'adjustment', 'milestone': '已确认的参演差额'}
                          ]
                        : <Map<String, dynamic>>[])
                    : communityRows(terms!['installments'])))
                  (s['key'] as String, communityText(s['milestone']))
              ],
              enabled ? (v) => setState(() => milestoneKey = v) : null),
          ...evidenceFields(),
          communityField(why, '节点实际达成说明', lines: 3),
          tradeButton(
              '确认本节点实际达成',
              enabled &&
                      milestoneKey != null &&
                      evidence.length == 1 &&
                      progress?['order_id'] != null
                  ? () => submit(() async {
                        final opinion = communityRequired(why.text, '实际达成说明');
                        await act(
                            'participations/${r['id']}/milestones',
                            {
                              'installment_key': milestoneKey,
                              'evidence_asset_id': evidence.single,
                              'reason': opinion
                            },
                            version: r['object_version'],
                            validate: (v) => proof(
                                'participations/${r['id']}/milestones',
                                {
                                  'installment_key': milestoneKey,
                                  'evidence_asset_id': evidence.single,
                                  'reason': opinion
                                },
                                v));
                      })
                  : null,
              outline: true)
        ]),
      if (!income &&
          r['owner_party_id'] == session.partyId &&
          r['current_status'] == 'APPROVED')
        tradeButton(
            '提出已付款改价或换角新约', enabled ? () => open('amend', id: r['id']) : null,
            outline: true),
      if (!income &&
          [r['owner_party_id'], project?['owner_party_id']]
              .contains(session.partyId) &&
          ['APPROVED', 'IN_REVIEW'].contains(r['current_status']))
        communitySection('退出约定', [
          communityField(why, '退出原因', lines: 3),
          tradeButton(
              '申请退出本次约定',
              enabled
                  ? () => submit(() async {
                        if (await confirm('核对退出边界',
                            '已有付款或现行方案时须先处理原订单或新约；退出不会自动退款，也不会自动覆盖历史条款。')) {
                          await act('participations/${r['id']}/withdrawal',
                              {'reason': communityRequired(why.text, '退出原因')},
                              version: r['object_version']);
                        }
                      })
                  : null,
              outline: true)
        ]),
      if (producer)
        tradeButton('需要换角时先申请项目重新会签',
            enabled ? () => open('revision', projectId: project!['id']) : null,
            outline: true),
      if (project == null) ...[
        if (projectNotice != null) appNotice(projectNotice!),
        tradeButton(
            '读取本人项目后续事项', enabled && session.isOwner ? loadOwnedProject : null,
            outline: true),
      ] else
        tradeButton(
            '查看原项目方案、成片和发行事实',
            () => Navigator.pushNamed(
                context, '/projects/record?recordId=${project!['id']}'),
            outline: true),
      communityRecordId(r)
    ];
  }

  List<Widget> evidenceFields() => [
        communitySection('本人权利或履约证明', [
          SupplyFiles(
              api: SupplyApi(session),
              purpose: 'RIGHTS_EVIDENCE',
              ids: evidence,
              single: true,
              enabled: enabled,
              onChanged: enabled ? (v) => setState(() => evidence = v) : null)
        ])
      ];
  List<Widget> formView() {
    if (project == null) return [];
    final old = record?['kind'] == 'PARTICIPATION'
            ? communityMap(record!['data'])
            : null,
        amending = widget.view == 'amend';
    final amount = communityMinorOrNull(fee.text),
        canRule = widget.income || amount == 0;
    return [
      communityHeading(
          widget.income
              ? '提出发行收入约定'
              : amending
                  ? '提出改价或换角新约'
                  : '提出本人的参演约定',
          '填写具体用途、金额和退出安排；审核与各方会签随后独立办理。'),
      communityFact('项目', communityMap(project!['data'])['title']),
      if (!widget.income) ...[
        communityFact('当前角色', roleTitle(candidate)),
        if (amending)
          communitySelect(
              '同一角色中已确认的本人候选记录',
              selectedCandidate,
              [
                for (final c in candidates.where((c) =>
                    c['owner_party_id'] == session.partyId &&
                    c['current_status'] == 'CONFIRMED' &&
                    communityMap(c['data'])['role_id'] == old?['role_id']))
                  (
                    c['id'] as String,
                    '${roleTitle(c)} · 原议价${communityMoney(communityMap(c['data'])['amount_minor'])} · 版本${c['object_version']}'
                  )
              ],
              enabled ? (v) => setState(() => selectedCandidate = v) : null),
        communityFact(
            '原候选片酬',
            candidate == null
                ? '请选择本人已确认的角色'
                : communityMoney(
                    communityMap(candidate!['data'])['amount_minor'])),
        communitySelect(
            '本人真人',
            person.text,
            [for (final p in people) (p.id, '${p.name} · 版本${p.version}')],
            enabled ? selectPerson : null),
        for (final kind in ['LOOK', 'VOICE'])
          communitySelect(
              kind == 'LOOK' ? '本角色数字人的造型版本' : '本角色声音版本（可不使用）',
              kind == 'LOOK' ? look.text : voice.text,
              [
                if (kind == 'VOICE') ('', '不使用声音'),
                for (final v in variants.where((v) =>
                    v.kind == kind &&
                    v.avatarId ==
                        communityMaybeMap(candidate?['data'])['avatar_id']))
                  (v.id, '${v.data['display_name']} · 第${v.data['revision']}版')
              ],
              enabled
                  ? (v) => setState(
                      () => (kind == 'LOOK' ? look : voice).text = v ?? '')
                  : null),
        communitySelect(
            '参演报酬方式',
            mode,
            [for (final m in participationModes.entries) (m.key, m.value)],
            enabled ? (v) => setState(() => mode = v!) : null),
        communityField(fee, amending ? '新约片酬总额（元）' : '原候选片酬总额（元）',
            keyboard: TextInputType.number, enabled: amending),
        communitySelect(
            '本次形象使用',
            usage,
            [('EXISTING_MATERIAL', '使用已有素材'), ('NEW_GENERATION', '生成新的表演')],
            enabled ? (v) => setState(() => usage = v!) : null),
        communityCheck('本次参演有排他约定', exclusive,
            enabled ? (v) => setState(() => exclusive = v == true) : null),
        communityField(territory, '使用地域'),
        communityField(language, '使用语言'),
        communityDateField(context, until, '使用截止',
            enabled: enabled, onChanged: () => setState(() => agreed = false)),
        communityField(allowed, '允许用途和授权范围', lines: 4),
        communityField(prohibited, '明确禁止的用途', lines: 3),
        communityField(cancellation, '取消、退出及退款安排', lines: 4),
        if (mode != 'REVENUE_SHARE')
          communitySection('协商片酬分期', [
            for (final (i, s) in stages.indexed)
              communitySection('第${i + 1}期', [
                communityField(s.amount, '本期片酬（元）',
                    keyboard: TextInputType.number),
                communityField(s.milestone, '本期实际达成条件', lines: 2),
                communityCheck(
                    '本期须在开工前付清',
                    s.start,
                    enabled
                        ? (v) => setState(() => s.start = v == true)
                        : null),
                if (stages.length > 1)
                  TextButton(
                      onPressed: enabled
                          ? () => setState(() => stages.removeAt(i))
                          : null,
                      child: const Text('移除此分期'))
              ]),
            if (stages.length < 20)
              tradeButton(
                  '增加协商分期',
                  enabled
                      ? () => setState(
                          () => stages.add(_StageInput(field(), field())))
                      : null,
                  outline: true)
          ]),
        if (mode != 'FIXED_FEE') ...revenueFields(),
        if (amending) ...[
          Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: TextField(
                  controller: retained,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                      labelText: '旧参演方保留金额',
                      helperText: '仅换角时填写；同一参演方改价时留空。',
                      helperMaxLines: 3))),
          communityField(why, '改价或换角的具体原因', lines: 3),
          appNotice('同一参演方按原净付款抵扣新片酬；换角则单列旧方保留和新方全额。最终差额由服务器核实，不能按填写内容显示退款成功。')
        ],
        if (!canRule)
          appNotice(
              '付费参演需要当前已生效的商业分佣规则。当前接口未提供普通人可选择的规则目录，暂请平台协助提交；这里保留已填写条款，不接受手输规则编号。')
      ] else
        ...revenueFields(),
      ...evidenceFields(),
      communityCheck('我已核对本次所有金额、用途、分成和证明，提交独立审核', agreed,
          enabled ? (v) => setState(() => agreed = v == true) : null),
      tradeButton(
          '保存本次约定并提交独立审核',
          enabled && agreed && canRule && evidence.length == 1
              ? () => submit(() async {
                    String suffix;
                    Map<String, dynamic> body;
                    int version;
                    if (widget.income) {
                      suffix = 'projects/${project!['id']}/income-agreements';
                      version = project!['object_version'];
                      body = {
                        'revenue': revenueValue(),
                        'evidence_asset_id': evidence.single
                      };
                    } else {
                      final c = candidate;
                      if (c == null) {
                        throw const AccountError(400, '请先选定本人的已确认角色');
                      }
                      final n = communityMinor(fee.text, '片酬总额', zero: true),
                          terms = termsValue(n);
                      final cast = {
                        'person_id': communityRequiredId(person.text, '本人真人'),
                        'look_version_id':
                            communityRequiredId(look.text, '本角色造型'),
                        'voice_version_id': voice.text.isEmpty
                            ? null
                            : communityRequiredId(voice.text, '本角色声音')
                      };
                      communityRequire(variants.any((v) =>
                          v.id == look.text &&
                          v.kind == 'LOOK' &&
                          v.avatarId == communityMap(c['data'])['avatar_id']));
                      suffix = amending
                          ? 'participations/${record!['id']}/amendments'
                          : 'candidates/${c['id']}/participations';
                      version = amending
                          ? record!['object_version']
                          : c['object_version'];
                      body = {
                        'cast': cast,
                        'terms': terms,
                        'rule_id': null,
                        'evidence_asset_id': evidence.single,
                        if (amending) ...{
                          'candidate_id': c['id'],
                          'fee_minor': n,
                          'old_retained_minor':
                              record!['owner_party_id'] == c['owner_party_id']
                                  ? null
                                  : communityMinor(retained.text, '旧方保留金额',
                                      zero: true),
                          'reason': communityRequired(why.text, '变更原因')
                        }
                      };
                    }
                    final out = await act(suffix, body,
                        version: version,
                        reload: false,
                        validate: (v) => participationRecord(v,
                            kind: widget.income
                                ? 'INCOME_AGREEMENT'
                                : 'PARTICIPATION'));
                    if (out != null && mounted) {
                      setState(() => agreed = false);
                      open('agreement', id: out['id']);
                    }
                  })
              : null)
    ];
  }

  List<Widget> revisionView() => project == null
      ? []
      : [
          communityHeading('重新组织本项目会签', '改价或换角前，重新核对方案、成片和发行中的申请。'),
          communityFact('项目', communityMap(project!['data'])['title']),
          communityField(why, '调整原因', lines: 4),
          ...evidenceFields(),
          appNotice('已对外提交且结果未回的发行申请须先核实。新方案和成片重新会签，旧材料、旧约和原款保留历史。'),
          communityCheck('我已核对调整影响，申请按新方案重新办理', agreed,
              enabled ? (v) => setState(() => agreed = v == true) : null),
          tradeButton(
              '出品方申请重新会签',
              enabled &&
                      agreed &&
                      evidence.length == 1 &&
                      project!['owner_party_id'] == session.partyId
                  ? () => submit(() async {
                        await act(
                            'projects/${project!['id']}/revision',
                            {
                              'reason': communityRequired(why.text, '调整原因'),
                              'evidence_asset_id': evidence.single
                            },
                            version: project!['object_version']);
                        setState(() => agreed = false);
                      })
                  : null)
        ];
  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      widget.income ? '发行收入约定' : '参演与会签',
      [
        ...feedback,
        ...switch (widget.view) {
          'agreement' => agreementView(),
          'new' || 'amend' => formView(),
          'revision' => revisionView(),
          _ => listView()
        },
        tradeButton('重新核对当前版本', busy ? null : load, outline: true)
      ],
      locked: recovery != null);
}

int? communityMinorOrNull(String text) {
  try {
    return communityMinor(text, '金额', zero: true);
  } catch (_) {
    return null;
  }
}
