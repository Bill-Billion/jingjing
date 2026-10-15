import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../operations/operation_widgets.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../contracts/contract_text.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_models.dart';
import '../trade/trade_widgets.dart';
import 'project_api.dart';
import 'project_models.dart';
import 'project_widgets.dart';

class ProjectsCataloguePage extends StatelessWidget {
  const ProjectsCataloguePage({super.key, this.embedded = false, this.roleId});
  final bool embedded;
  final String? roleId;
  @override
  Widget build(BuildContext context) => ProjectsGate(
      owner: false,
      embedded: embedded,
      returnRoute:
          roleId == null ? '/projects' : '/projects/role?roleId=$roleId',
      builder: (s) =>
          _Catalogue(session: s, embedded: embedded, roleId: roleId));
}

class _Catalogue extends StatefulWidget {
  const _Catalogue(
      {required this.session, required this.embedded, this.roleId});
  final AccountSession session;
  final bool embedded;
  final String? roleId;
  @override
  State<_Catalogue> createState() => _CatalogueState();
}

class _CatalogueState extends State<_Catalogue> {
  late final api = ProjectsApi(widget.session);
  ProjectCatalogue? catalogue;
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
      catalogue = null;
    });
    try {
      final d = await api.catalogue();
      if (mounted) setState(() => catalogue = d);
    } on AccountError catch (e) {
      if (mounted) setState(() => error = projectError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  List<Widget> get content => [
        if (widget.roleId == null) ...[
          projectHeading('让好角色找到合适的你'),
          projectParagraph('在这里发现公开创作项目，了解项目范围与角色需求，选择适合自己的机会。报名、筛选后仍需本人最终确认。')
        ],
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!, icon: Icons.error_outline),
        if (catalogue != null) ...[
          for (final p in catalogue!.items.where((v) => v['kind'] == 'PROJECT'))
            for (final role in (p['roles'] as List).where(
                (v) => widget.roleId == null || v['id'] == widget.roleId))
              supplyCard(widget.roleId == null ? p['title'] : '项目与角色', [
                if (widget.roleId != null) projectHeading(p['title']),
                projectScopeFacts(projectMap(p['scope'])),
                tradeFact('角色名称', role['title']),
                tradeFact('角色总名额', '${role['capacity']} 个名额'),
                tradeFact(
                    '费用方式',
                    role['pricing'] == 'FIXED'
                        ? '固定价 ${tradeMoney(role['amount_minor'])}'
                        : '需报价'),
                supplyNote('实际可报名情况以提交时为准。'),
                if (widget.roleId != null)
                  ExpansionTile(
                      initiallyExpanded: true,
                      title: const Text('角色条款'),
                      children: [
                        Padding(
                            padding: const EdgeInsets.all(16),
                            child: projectParagraph(role['terms']))
                      ]),
                tradeButton(
                    widget.roleId == null ? '查看项目' : '申请这个角色',
                    () => Navigator.pushNamed(
                        context,
                        widget.roleId == null
                            ? '/projects/role?roleId=${role['id']}'
                            : '/projects/apply?roleId=${role['id']}'))
              ]),
          if (!catalogue!.items.any((p) =>
              p['kind'] == 'PROJECT' &&
              (p['roles'] as List).any(
                  (r) => widget.roleId == null || r['id'] == widget.roleId)))
            supplyCard(widget.roleId == null ? '暂时没有公开招募项目' : '角色当前未开放',
                [supplyNote('仅显示实际可公开展示的招募摘要。请重新读取当前目录。')])
        ],
        tradeButton('重新读取目录', busy ? null : load, outline: true),
        if (widget.roleId == null)
          supplyCard('我的项目', [
            supplyNote('查看我参与的项目与进展。'),
            tradeButton(
                '我的项目', () => Navigator.pushNamed(context, '/my-projects'))
          ])
      ];
  @override
  Widget build(BuildContext context) => widget.embedded
      ? Column(
          crossAxisAlignment: CrossAxisAlignment.stretch, children: content)
      : tradeScaffold(context, widget.roleId == null ? '成角' : '项目与角色', content);
}

class ProjectsListPage extends StatelessWidget {
  const ProjectsListPage({super.key});
  @override
  Widget build(BuildContext context) => ProjectsGate(
      returnRoute: '/my-projects', builder: (s) => _ProjectsList(session: s));
}

class _ProjectsList extends StatefulWidget {
  const _ProjectsList({required this.session});
  final AccountSession session;
  @override
  State<_ProjectsList> createState() => _ProjectsListState();
}

class _ProjectsListState extends State<_ProjectsList> {
  late final api = ProjectsApi(widget.session);
  List<ProjectRecord> rows = [];
  String? cursor, error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    setState(() {
      busy = true;
      error = null;
      if (!more) rows = [];
    });
    try {
      final d = await api.page(cursor: more ? cursor : null);
      if (mounted) {
        setState(() {
          rows = {
            for (final r in [...(more ? rows : <ProjectRecord>[]), ...d.items])
              r.id: r
          }.values.toList();
          cursor = d.cursor;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = projectError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> open(ProjectRecord r) async {
    await Navigator.pushNamed(context, '/projects/project?projectId=${r.id}');
    if (mounted) load();
  }

  Future<void> restore(String path) async {
    setState(() => busy = true);
    try {
      final r = await api.retry(path);
      if (!mounted) return;
      projectClearWarnings(context);
      await Navigator.pushNamed(context, '/projects/record?recordId=${r.id}');
      if (mounted) await load();
    } on AccountError catch (e) {
      if (mounted) setState(() => error = projectError(e, writing: true));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      '我的项目',
      [
        projectParagraph(
            '当前主体：${widget.session.party?['display_name'] ?? shortSupplyId(api.owner())}'),
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!, icon: Icons.error_outline),
        for (final op in widget.session.projectsPending)
          supplyCard('原操作结果待核实', [
            supplyNote('原内容、版本和请求编号已保留。核对前不要重新办理。'),
            tradeButton('恢复原请求核对', busy ? null : () => restore(op['path']))
          ]),
        for (final r in rows)
          supplyCard(r.data['title'], [
            tradeFact('状态', projectStatuses[r.status]),
            projectScopeFacts(projectMap(r.data['scope'])),
            tradeFact(
                '当前方案', r.data['current_plan_id'] == null ? '尚未建立' : '方案已关联'),
            tradeButton(
                '进入项目',
                busy || widget.session.projectsPending.isNotEmpty
                    ? null
                    : () => open(r))
          ]),
        if (!busy && rows.isEmpty)
          supplyCard('暂时没有参与项目', [supplyNote('只展示当前主体获准参与的项目。')]),
        if (cursor != null)
          tradeButton('加载更多', busy ? null : () => load(more: true),
              outline: true),
        tradeButton('重新读取', busy ? null : load, outline: true)
      ],
      locked: busy || widget.session.projectsPending.isNotEmpty);
}

class ProjectRecordPage extends StatelessWidget {
  const ProjectRecordPage({super.key, required this.recordId});
  final String recordId;
  @override
  Widget build(BuildContext context) => ProjectsGate(
      returnRoute: '/projects/record?recordId=$recordId',
      builder: (s) => _Record(session: s, id: recordId));
}

class _Record extends StatefulWidget {
  const _Record({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_Record> createState() => _RecordState();
}

class _RecordState extends State<_Record> {
  late final api = ProjectsApi(widget.session);
  ProjectRecord? record, project;
  final kinds = <String, List<ProjectRecord>>{};
  List<Map<String, dynamic>> confirmations = [];
  Map<String, dynamic>? readiness;
  final reason = TextEditingController();
  bool busy = false, read = false;
  String? error, notice;
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    reason.dispose();
    super.dispose();
  }

  bool get locked => busy || widget.session.projectsPending.isNotEmpty;
  Future<void> load() async {
    final t = ++ticket;
    setState(() {
      busy = true;
      error = null;
      record = null;
      project = null;
      kinds.clear();
      confirmations = [];
      readiness = null;
      read = false;
      reason.clear();
    });
    try {
      final r = await api.record(widget.id);
      final terminalCandidate = r.kind == 'CANDIDATE' &&
          ['DECLINED', 'REJECTED', 'WITHDRAWN'].contains(r.status);
      final p = r.kind == 'PROJECT'
          ? r
          : terminalCandidate
              ? null
              : await api.record(r.projectId!, kind: 'PROJECT');
      final next = <String, List<ProjectRecord>>{};
      List<Map<String, dynamic>> cs = [];
      Map<String, dynamic>? rd;
      if (r.kind == 'PROJECT') {
        for (final k in [
          'CANDIDATE',
          'PLAN',
          'EDITION',
          if (p!.owner == api.owner()) 'RELEASE'
        ]) {
          next[k] = await api.all(p.id, k);
        }
        rd = await api.readiness(p.id);
      }
      if (['PLAN', 'EDITION'].contains(r.kind)) cs = await api.confirmations(r);
      if (r.kind == 'RELEASE') {
        next['EXTERNAL_EVENT'] = (await api.all(p!.id, 'EXTERNAL_EVENT'))
            .where((v) => v.data['release_id'] == r.id)
            .toList();
      }
      if (!mounted || t != ticket) return;
      setState(() {
        record = r;
        project = p;
        kinds.addAll(next);
        confirmations = cs;
        readiness = rd;
      });
    } on AccountError catch (e) {
      if (mounted && t == ticket) setState(() => error = projectError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> perform(String title, Future<ProjectRecord> Function() operation,
      {bool restoring = false}) async {
    if (!restoring &&
        !await tradeConfirm(context, title,
            [projectParagraph('按页面当前版本与完整原约定办理。确认结果以服务器核对为准。')])) {
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      await operation();
      if (!mounted) return;
      projectClearWarnings(context);
      await load();
      if (mounted) setState(() => notice = '本次操作已核对。');
    } on AccountError catch (e) {
      if (!mounted) return;
      if (e.status == 412) {
        await load();
        if (mounted) setState(() => error = projectError(e, writing: true));
      } else {
        setState(() => error = projectError(e, writing: true));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> open(String path) async {
    await Navigator.pushNamed(context, path);
    if (mounted) await load();
  }

  List<Widget> pending() => [
        for (final op in widget.session.projectsPending)
          supplyCard('原操作结果待核实', [
            supplyNote('原请求内容、版本和编号已保留，请先恢复核对。'),
            tradeButton(
                '恢复原请求核对',
                busy
                    ? null
                    : () => perform('恢复原请求', () => api.retry(op['path']),
                        restoring: true))
          ])
      ];
  Widget link(String title, ProjectRecord r) => tradeButton(
      '$title · ${shortSupplyId(r.id)}',
      locked ? null : () => open('/projects/record?recordId=${r.id}'),
      outline: true);
  List<Widget> workspace(ProjectRecord p) => [
        supplyCard(p.data['title'], [
          tradeFact('当前状态', projectStatuses[p.status]),
          projectScopeFacts(projectMap(p.data['scope']))
        ]),
        supplyCard('当前方案', [
          if (p.data['current_plan_id'] == null)
            supplyNote('当前方案尚未建立，由项目发起方在网页工作台办理。')
          else if ((kinds['PLAN'] ?? [])
              .any((r) => r.id == p.data['current_plan_id']))
            link(
                '查看当前方案',
                (kinds['PLAN'] ?? [])
                    .firstWhere((r) => r.id == p.data['current_plan_id']))
          else
            supplyNote('当前身份未获准读取该方案。项目可读不表示所有子记录可读。')
        ]),
        supplyCard('本人记录', [
          for (final r in kinds['CANDIDATE'] ?? []) ...[
            tradeFact('参与状态', projectStatuses[r.status]),
            tradeFact(
                '本次报价',
                r.data['amount_minor'] == null
                    ? '尚未填写'
                    : tradeMoney(r.data['amount_minor'])),
            link(r.owner == api.owner() ? '查看本人参与记录' : '查看参与记录', r)
          ],
          if ((kinds['CANDIDATE'] ?? []).isEmpty) supplyNote('当前没有获准查看的候选记录。')
        ]),
        if (readiness != null) projectReadiness(readiness!),
        tradeButton('刷新条件', locked ? null : load, outline: true),
        for (final kind in ['PLAN', 'EDITION'])
          if ((kinds[kind] ?? []).isNotEmpty)
            supplyCard(kind == 'PLAN' ? '方案版本记录' : '成片材料版本', [
              for (final r in kinds[kind]!) ...[
                tradeFact('状态', projectStatuses[r.status]),
                link(
                    r.id ==
                            p.data[kind == 'PLAN'
                                ? 'current_plan_id'
                                : 'current_edition_id']
                        ? '查看当前版本'
                        : '查看历史版本',
                    r)
              ]
            ]),
        if (p.owner == api.owner()) ...[
          supplyCard('发行办理', [
            for (final r in kinds['RELEASE'] ?? []) ...[
              tradeFact('申请状态', projectStatuses[r.status]),
              link('查看发行进度', r)
            ],
            tradeButton(
                '提交发行材料',
                locked ||
                        p.status != 'STARTED' ||
                        p.data['current_edition_id'] == null
                    ? null
                    : () => open('/projects/release/new?projectId=${p.id}')),
            supplyNote('需当前成片材料已审核、各方确认，且最终制作验收付款与权利有效。')
          ]),
          supplyCard('项目管理', [
            supplyNote('角色邀请、筛选、六层方案、开工与成片材料在网页工作台由发起方办理。取消不等于退款或外部撤下。'),
            projectField(reason, '取消原因',
                enabled: !locked, changed: (_) => setState(() {})),
            tradeButton(
                '取消项目',
                locked || p.status == 'CANCELLED' || reason.text.trim().isEmpty
                    ? null
                    : () => perform(
                        '取消项目',
                        () => api.write(
                            '/api/v1/projects/projects/${p.id}/cancellation',
                            {'reason': reason.text.trim()},
                            version: p.version,
                            kind: 'PROJECT')),
                outline: true)
          ])
        ],
        supplyCard('项目留言', [
          operationCommentLink(context, 'PROJECTS', p.id, '项目留言',
              enabled: !locked, returned: load)
        ])
      ];
  List<Widget> candidate(ProjectRecord r) => [
        tradeBanner(
            projectStatuses[r.status]!,
            r.status == 'SELECTED'
                ? '请仔细核对，获选后仍需本人最终确认。'
                : '邀请接受仅为报名；筛选与本人入组确认分别办理。'),
        supplyCard('项目与角色', [
          tradeFact('项目名称',
              project?.data['title'] ?? '项目 · ${shortSupplyId(r.projectId!)}'),
          tradeFact('角色编号', shortSupplyId(r.data['role_id'])),
          tradeFact('本次准确版本', '第 ${r.version} 版'),
          tradeFact(
              '本人资料',
              r.data['avatar_id'] == null
                  ? '尚未选择'
                  : shortSupplyId(r.data['avatar_id'])),
          tradeFact(
              '授权记录',
              r.data['consent_id'] == null
                  ? '尚未选择'
                  : shortSupplyId(r.data['consent_id'])),
          tradeFact(
              '本次报价',
              r.data['amount_minor'] == null
                  ? '尚未报价'
                  : tradeMoney(r.data['amount_minor']))
        ]),
        supplyCard('角色约定', [
          projectParagraph(r.data['terms']),
          if (r.data['note'] != null) projectParagraph(r.data['note'])
        ]),
        if (r.owner == api.owner()) ...[
          if (r.status == 'INVITED')
            tradeButton(
                '回应邀请',
                locked
                    ? null
                    : () => open('/projects/invitation?candidateId=${r.id}')),
          if (['INVITED', 'APPLIED', 'SELECTED', 'CONFIRMED']
              .contains(r.status))
            supplyCard('本人确认', [
              if (r.status == 'SELECTED')
                CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: read,
                    onChanged:
                        locked ? null : (v) => setState(() => read = v == true),
                    title: const Text('已完整阅读本次角色约定与报价')),
              projectField(reason, '确认说明',
                  enabled: !locked, lines: 3, changed: (_) => setState(() {})),
              if (r.status == 'SELECTED')
                tradeButton(
                    '确认入组',
                    locked || !read || reason.text.trim().isEmpty
                        ? null
                        : () => perform(
                            '确认入组',
                            () => api.candidateDecision(
                                r, 'CONFIRM', reason.text.trim()))),
              tradeButton(
                  '退出本次申请',
                  locked || reason.text.trim().isEmpty
                      ? null
                      : () => perform(
                          '退出本次申请',
                          () => api.candidateDecision(
                              r, 'WITHDRAW', reason.text.trim())),
                  outline: true)
            ])
        ]
      ];
  List<Widget> version(ProjectRecord r) {
    final own = api.owner(),
        signers = projectConfirmers(r.data['confirmers']),
        mine = confirmations
            .where((c) => c['party_id'] == own && c['content_sha256'] == r.hash)
            .firstOrNull;
    final eligible = projectCanConfirm(r, project!, own, confirmations);
    return [
      tradeBanner(
          projectStatuses[r.status]!,
          project!.data[r.kind == 'PLAN'
                      ? 'current_plan_id'
                      : 'current_edition_id'] ==
                  r.id
              ? '确认绑定本次准确内容。换版后需要重新阅读与确认。'
              : '历史版本，当前确认已失效。'),
      supplyCard(r.kind == 'PLAN' ? '当前方案' : '当前成片材料', [
        tradeFact('准确版本', '第 ${r.version} 版 · ${shortSupplyId(r.id)}'),
        tradeFact('内容摘要', r.hash),
        if (r.kind == 'EDITION') ...[
          tradeFact('最终制作版本', shortSupplyId(r.data['final_version_id'])),
          tradeFact('最终版本摘要', r.data['final_content_sha256']),
          projectParagraph(r.data['note'])
        ]
      ]),
      if (r.kind == 'PLAN') ...[
        supplyCard('方案条款', [projectParagraph(r.data['terms'])]),
        supplyCard('权利摘要', [
          for (final x in r.data['rights'])
            ExpansionTile(
                title: Text(projectLayers[x['layer']]!),
                subtitle: Text('持有人 · ${shortSupplyId(x['holder_party_id'])}'),
                children: [
                  Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            tradeFact('用途',
                                x['purpose'] == 'RELEASE' ? '公开发行' : '公开分享'),
                            tradeFact('地域', x['territory']),
                            tradeFact('有效截止', tradeDate(x['valid_until'])),
                            tradeFact(
                                '证明编号', shortSupplyId(x['evidence_asset_id'])),
                            projectParagraph(x['terms'])
                          ]))
                ])
        ]),
        supplyCard('角色费用依据', [
          for (final f in r.data['funding']) ...[
            tradeFact('候选记录', shortSupplyId(f['candidate_id'])),
            tradeFact('已付订单', shortSupplyId(f['order_id'])),
            tradeFact('独立明细', f['line_id'])
          ],
          if ((r.data['funding'] as List).isEmpty)
            supplyNote('本方案未列正价角色资金明细。以实际角色与明确约定为准。')
        ])
      ],
      supplyCard('确认顺序', [
        for (final s in signers) ...[
          tradeFact('确认主体',
              '${s['party_id'] == own ? '本人 · ' : ''}${shortSupplyId(s['party_id'])}'),
          projectParagraph(s['responsibility']),
          tradeFact(
              '前置确认',
              (s['after_party_ids'] as List).isEmpty
                  ? '无前置方'
                  : (s['after_party_ids'] as List)
                      .map((id) => shortSupplyId(id))
                      .join('、')),
          tradeFact(
              '本版结果',
              confirmations.any((c) =>
                      c['party_id'] == s['party_id'] &&
                      c['content_sha256'] == r.hash)
                  ? confirmations.firstWhere((c) =>
                              c['party_id'] == s['party_id'] &&
                              c['content_sha256'] == r.hash)['decision'] ==
                          'APPROVED'
                      ? '同意本版'
                      : '不同意本版'
                  : '尚未确认')
        ]
      ]),
      supplyCard('已有结果', [
        projectParagraph(mine == null
            ? '本人尚未确认本版本。'
            : mine['decision'] == 'APPROVED'
                ? '本人已同意本版本。'
                : '本人不同意本版本。'),
        if (mine != null) projectParagraph(mine['reason']),
        if (!eligible && mine == null)
          supplyNote('请核对本人是否被指定、当前版本是否已审核，以及前置方是否已确认。')
      ]),
      if (eligible)
        supplyCard('意见', [
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: read,
              onChanged:
                  locked ? null : (v) => setState(() => read = v == true),
              title: const Text('已完整阅读本版本条款、权利、费用与确认职责')),
          projectField(reason, '确认意见',
              lines: 3, enabled: !locked, changed: (_) => setState(() {})),
          tradeButton(
              '同意本版本',
              locked || !read || reason.text.trim().isEmpty
                  ? null
                  : () => perform(
                      '同意本版本',
                      () => api.confirm(r, project!, confirmations, 'APPROVED',
                          reason.text.trim()))),
          tradeButton(
              '不同意',
              locked || !read || reason.text.trim().isEmpty
                  ? null
                  : () => perform(
                      '不同意本版本',
                      () => api.confirm(r, project!, confirmations, 'REJECTED',
                          reason.text.trim())),
              outline: true)
        ])
    ];
  }

  List<Widget> release(ProjectRecord r) => [
        supplyCard('项目与成片版本', [
          tradeFact('项目名称', project!.data['title']),
          tradeFact('关联版本', shortSupplyId(r.data['edition_id'])),
          tradeFact('渠道', shortSupplyId(r.data['channel_id']))
        ]),
        supplyCard('内部审核', [
          tradeFact('当前状态', projectStatuses[r.status]),
          if (r.data['review'] != null)
            projectParagraph(r.data['review']['reason']),
          supplyNote('内部通过仅表示可送出，实际外部提交与发行须凭据独立核实。')
        ]),
        supplyCard('本次材料', [
          projectParagraph(r.data['note']),
          if (r.data['prior_release_id'] != null)
            tradeButton(
                '查看上一申请',
                locked
                    ? null
                    : () => open(
                        '/projects/record?recordId=${r.data['prior_release_id']}'),
                outline: true)
        ]),
        supplyCard('外部渠道', [
          tradeFact(
              '已核实结果',
              r.data['last_external_event_id'] == null
                  ? '尚无已核实结果'
                  : projectStatuses[r.status]),
          for (final e in kinds['EXTERNAL_EVENT'] ?? []) ...[
            tradeFact('登记事实', projectOutcomes[e.data['outcome']]),
            tradeFact('核验状态', projectStatuses[e.status]),
            link('查看凭据登记记录', e)
          ],
          if ((project?.owner ?? r.owner) == api.owner())
            tradeButton(
                '登记外部结果',
                locked
                    ? null
                    : () => open('/projects/external/new?releaseId=${r.id}'))
        ]),
        if ((project?.owner ?? r.owner) == api.owner() &&
            [
              'CHANGES_REQUESTED',
              'REJECTED',
              'EXTERNAL_CHANGES_REQUESTED',
              'EXTERNAL_REJECTED',
              'EXTERNAL_WITHDRAWN'
            ].contains(r.status))
          tradeButton(
              '补件重新申请',
              locked
                  ? null
                  : () => open(
                      '/projects/release/new?projectId=${project!.id}&priorId=${r.id}')),
        appNotice('补件建立新申请并关联上一记录，不覆盖历史意见；发行不新增一轮会签。')
      ];
  List<Widget> external(ProjectRecord r) => [
        supplyCard('外部结果登记', [
          tradeFact('核验状态', projectStatuses[r.status]),
          tradeFact('真实结果', projectOutcomes[r.data['outcome']]),
          tradeFact('外部编号', r.data['external_reference']),
          tradeFact('发生时间', tradeDate(r.data['occurred_at'])),
          projectParagraph(r.data['note']),
          if (r.data['review'] != null)
            projectParagraph(r.data['review']['reason']),
          supplyNote('凭据独立核验后，发行进度才会更新。')
        ])
      ];
  List<Widget> attachments(ProjectRecord r) {
    final ids = {
      if (r.data['evidence_asset_id'] != null) r.data['evidence_asset_id'],
      ...(r.data['material_asset_ids'] as List? ?? []),
      ...(r.data['rights'] as List? ?? []).map((v) => v['evidence_asset_id'])
    };
    if (ids.isEmpty) return [];
    return [
      supplyCard('私有材料', [
        for (final id in ids) ...[
          tradeFact('材料编号', shortSupplyId(id)),
          if ((project?.owner ?? r.owner) == api.owner())
            tradeButton(
                '读取材料 · ${shortSupplyId(id)}',
                locked
                    ? null
                    : () async {
                        final epoch = widget.session.epoch;
                        setState(() {
                          busy = true;
                          error = null;
                          notice = null;
                        });
                        try {
                          final bytes = await api.evidence(r, id);
                          if (!mounted) return;
                          await FilePicker.saveFile(
                              dialogTitle: '保存私有项目材料',
                              fileName: 'project-evidence-$id.bin',
                              bytes: bytes);
                          api.check(epoch, api.owner());
                          if (mounted) setState(() => notice = '已按当前权限读取材料。');
                        } on AccountError catch (e) {
                          if (mounted) setState(() => error = projectError(e));
                        } catch (_) {
                          if (mounted) {
                            setState(() => error = '文件保存未完成，请检查设备后重试。');
                          }
                        } finally {
                          if (mounted) setState(() => busy = false);
                        }
                      },
                outline: true)
        ],
        supplyNote((project?.owner ?? r.owner) == api.owner()
            ? '每次读取重新核对权限、材料归属和内容摘要。'
            : '本身份仅可查看材料摘要，未获准读取项目原证据。')
      ])
    ];
  }

  @override
  Widget build(BuildContext context) {
    final r = record;
    final title = r == null
        ? '项目记录'
        : {
              'PROJECT': '项目工作区',
              'CANDIDATE': '确认入组',
              'PLAN': '确认当前方案',
              'EDITION': '确认成片版本',
              'RELEASE': '发行进度',
              'EXTERNAL_EVENT': '外部结果记录'
            }[r.kind] ??
            '项目记录';
    return tradeScaffold(
        context,
        title,
        [
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!, icon: Icons.error_outline),
          if (notice != null) appNotice(notice!),
          ...pending(),
          if (r != null) ...[
            if (r.kind == 'PROJECT')
              ...workspace(r)
            else if (r.kind == 'CANDIDATE')
              ...candidate(r)
            else if (['PLAN', 'EDITION'].contains(r.kind))
              ...version(r)
            else if (r.kind == 'RELEASE')
              ...release(r)
            else if (r.kind == 'EXTERNAL_EVENT')
              ...external(r),
            if (r.data['review'] != null &&
                r.kind != 'RELEASE' &&
                r.kind != 'EXTERNAL_EVENT')
              supplyCard(
                  '独立审核意见', [projectParagraph(r.data['review']['reason'])]),
            ...attachments(r),
            ExpansionTile(title: const Text('完整保存记录'), children: [
              Padding(
                  padding: const EdgeInsets.all(16),
                  child: ContractText(value: r.data, fieldLabels: const {
                    'title': '名称',
                    'scope': '用途范围',
                    'purpose': '用途',
                    'territory': '地域',
                    'language': '语言',
                    'valid_until': '有效截止',
                    'terms': '完整条款',
                    'rights': '六层权利',
                    'layer': '权利类别',
                    'holder_party_id': '持有人编号',
                    'evidence_asset_id': '证明材料编号',
                    'confirmers': '确认职责',
                    'party_id': '主体编号',
                    'responsibility': '职责',
                    'after_party_ids': '前置确认人',
                    'funding': '资金明细',
                    'candidate_id': '候选记录',
                    'order_id': '订单编号',
                    'line_id': '明细编号',
                    'review': '人工审核',
                    'decision': '决定',
                    'reason': '意见',
                    'verification': '核验事项',
                    'reviewer_account_id': '审核账号',
                    'method': '核验方式',
                    'production_project_id': '原制作项目',
                    'roster_sha256': '阵容摘要',
                    'plan_id': '方案编号',
                    'final_version_id': '最终制作版本',
                    'final_content_sha256': '最终版本摘要',
                    'material_asset_ids': '材料编号',
                    'note': '说明',
                    'edition_id': '成片材料版本',
                    'channel_id': '渠道编号',
                    'prior_release_id': '上一申请',
                    'last_external_event_id': '最后已核实外部记录',
                    'release_id': '发行申请',
                    'outcome': '外部事实',
                    'external_reference': '外部编号',
                    'occurred_at': '发生时间',
                    'provenance': '凭据来源',
                    'role_id': '角色编号',
                    'avatar_id': '数字人资料',
                    'consent_id': '本人同意',
                    'amount_minor': '报价（分）',
                    'final_confirmed_by': '本人确认账号',
                    'current_plan_id': '当前方案',
                    'current_edition_id': '当前成片材料',
                    'cancel_reason': '取消原因'
                  }))
            ])
          ],
          tradeButton('重新读取', busy ? null : load, outline: true)
        ],
        locked: locked);
  }
}
