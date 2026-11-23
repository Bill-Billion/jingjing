import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:video_player/video_player.dart';
import '../account/account_api.dart';
import '../operations/operation_widgets.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../account/read_failure_widgets.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_api.dart';
import '../trade/trade_models.dart';
import '../trade/trade_widgets.dart';
import 'private_video.dart';
import 'production_api.dart';
import 'production_models.dart';
import 'production_widgets.dart';
import 'fulfillment_models.dart';
import 'fulfillment_api.dart';
import 'fulfillment_pages.dart';

class ProductionProjectsPage extends StatelessWidget {
  const ProductionProjectsPage({super.key, this.orderId, this.works = false});
  final String? orderId;
  final bool works;
  @override
  Widget build(BuildContext context) => ProductionGate(
      showExpired: true,
      expiredLabel: works ? '我的交付作品' : '参与制作项目',
      returnRoute: works
          ? '/production/works'
          : '/production${orderId == null ? '' : '?orderId=$orderId'}',
      builder: (s) => _ProjectList(session: s, orderId: orderId, works: works));
}

class _ProjectList extends StatefulWidget {
  const _ProjectList(
      {required this.session, this.orderId, required this.works});
  final AccountSession session;
  final String? orderId;
  final bool works;
  @override
  State<_ProjectList> createState() => _ProjectListState();
}

class _ProjectListState extends State<_ProjectList> {
  late final api = ProductionApi(widget.session);
  List<ProductionRecord> rows = [];
  String? cursor, error;
  bool busy = false, loadFailed = false, hasRead = false;
  int ticket = 0;
  final orders = <String, TradeRecord>{};
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    final t = ++ticket, epoch = widget.session.epoch, p = api.participant();
    setState(() {
      busy = true;
      error = null;
      loadFailed = false;
      if (!more) {
        rows = [];
        orders.clear();
      }
    });
    try {
      final result = await api.page(cursor: more ? cursor : null);
      final loadedOrders = <String, TradeRecord>{};
      final eligible = result.items
          .where((r) =>
              (widget.orderId == null || r.orderId == widget.orderId) &&
              (!widget.works || r.data['current']['FINAL'] != null))
          .toList();
      if (widget.works && widget.session.isOwner) {
        for (final project in eligible) {
          if ([
            project.data['buyer_party_id'],
            project.data['merchant_party_id']
          ].contains(p)) {
            loadedOrders[project.orderId] =
                await TradeApi(widget.session).record(project.orderId);
          }
        }
      }
      api.check(epoch, p);
      if (!mounted || t != ticket) return;
      setState(() {
        orders.addAll(loadedOrders);
        rows = [...(more ? rows : <ProductionRecord>[]), ...eligible];
        cursor = result.nextCursor;
        hasRead = true;
      });
    } on AccountError catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          error = productionError(e);
          loadFailed = true;
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> open(ProductionRecord r) async {
    await Navigator.pushNamed(
        context,
        widget.works
            ? '/production/work?projectId=${r.id}'
            : '/production/project?projectId=${r.id}');
    if (mounted) await load();
  }

  Future<void> restore(String path) async {
    if (!await tradeConfirm(context, '恢复原版本意见',
        [const Text('将先核对目标版本与意见记录，再使用原内容、原版本和原请求编号核对。')])) {
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      loadFailed = false;
    });
    try {
      String projectId;
      if (path.startsWith('/api/v1/production/projects/')) {
        final original = await api.record(path.split('/')[5], kind: 'PROJECT');
        projectId = (await api.retryFulfillment(original, path)).projectId;
      } else {
        projectId = (await api.retry(path)).projectId!;
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..removeCurrentSnackBar();
      await Navigator.pushNamed(
          context, '/production/project?projectId=$projectId');
      if (mounted) await load();
    } on AccountError catch (e) {
      if (mounted) setState(() => error = productionError(e, writing: true));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (busy &&
        !hasRead &&
        rows.isEmpty &&
        widget.session.productionPending.isEmpty) {
      return tradeScaffold(context, widget.works ? '我的交付作品' : '参与制作项目',
          [ReadLoadingContent(label: widget.works ? '我的交付作品' : '参与制作项目')]);
    }
    if (loadFailed &&
        !busy &&
        error != null &&
        rows.isEmpty &&
        widget.session.productionPending.isEmpty) {
      return tradeScaffold(context, widget.works ? '我的交付作品' : '参与制作项目',
          [ReadFailureContent(reason: error!)],
          footer: ReadFailureActions(
              onBack: () => setState(() => loadFailed = false), onRetry: load));
    }
    return tradeScaffold(
        context,
        widget.works ? '我的交付作品' : '参与制作项目',
        [
          tradeHeading(widget.works ? '我的作品库' : '我参与的故事',
              eyebrow: '制作与交付 / 私人记录'),
          tradeBanner(
              widget.works ? '私人访问' : '按具体版本制作与验收',
              widget.works
                  ? '作品仅当前参与身份及获准人员可见。验收与付款分别核对，最终原片每次下载重新验证权限。'
                  : '买方负责人可确认本版或提出修改。商家开工、指派和上传，以及独立审片，请在网页工作台按真实角色办理。',
              icon: widget.works ? Icons.lock_outline : Icons.movie_outlined),
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!, icon: Icons.error_outline),
          for (final op in widget.session.productionPending)
            tradeSection('原制作办理结果待核实', [
              appNotice('原内容与版本已保留。核对前请不要重新提交另一份办理。'),
              tradeButton('恢复原请求核对', busy ? null : () => restore(op['path']))
            ]),
          if (!busy && error == null && rows.isEmpty)
            tradeSection(widget.works ? '暂时没有成片记录' : '暂时没有参与项目', [
              supplyNote(widget.works
                  ? '当前身份的项目尚无最终成片版本。'
                  : '仅展示真实参与或实际指派的项目。开工项目由商家负责人按原订单办理。')
            ]),
          for (final r in rows)
            if (!widget.works)
              tradeSection('制作项目 ${shortSupplyId(r.id)}', [
                LayoutBuilder(builder: (context, constraints) {
                  final summary = Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(productionStatuses[r.status] ?? r.status,
                            style: const TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        Text('当前版本已确认 ${productionConfirmedStages(r)}/4 个阶段',
                            style: const TextStyle(color: AccountTheme.muted)),
                      ]);
                  final action = tradeButton(
                      '查看项目', busy ? null : () => open(r));
                  if (constraints.maxWidth < 340 ||
                      MediaQuery.textScalerOf(context).scale(14) > 18) {
                    return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [summary, const SizedBox(height: 10), action]);
                  }
                  return Row(children: [
                    Expanded(child: summary),
                    const SizedBox(width: 12),
                    action,
                  ]);
                }),
                ExpansionTile(
                    key: PageStorageKey('production-summary-${r.id}'),
                    tilePadding: EdgeInsets.zero,
                    title: const Text('订单与阶段明细'),
                    children: [
                      tradeFact('原订单', shortSupplyId(r.orderId)),
                      tradeFact('服务档位', r.data['specification']['service_tier']),
                      tradeFact('修改次数',
                          '${r.data['change_requests']} / ${r.data['specification']['revision_limit']}'),
                      for (final stage in productionStages.keys)
                        tradeFact(
                            productionStages[stage]!,
                            r.data['current'][stage] == null
                                ? '未开始'
                                : r.data['current'][stage] == r.data['accepted'][stage]
                                    ? '当前版本已确认'
                                    : '当前版本待审阅')
                    ]),
              ])
            else
            tradeSection('制作项目 ${shortSupplyId(r.id)}', [
              tradeFact('当前状态', productionStatuses[r.status]),
              tradeFact('当前版本确认', '已确认 ${productionConfirmedStages(r)}/4 个阶段'),
              if (!widget.works) ...[
                tradeFact('原订单', shortSupplyId(r.orderId)),
                tradeFact('服务档位', r.data['specification']['service_tier']),
                tradeFact('修改次数',
                    '${r.data['change_requests']} / ${r.data['specification']['revision_limit']}'),
                for (final stage in productionStages.keys)
                  tradeFact(
                      productionStages[stage]!,
                      r.data['current'][stage] == null
                          ? '未开始'
                          : r.data['current'][stage] ==
                                  r.data['accepted'][stage]
                              ? '当前版本已确认'
                              : '当前版本待审阅')
              ] else ...[
                tradeFact('阶段', '当前最终成片'),
                tradeFact(
                    '验收',
                    r.data['current']['FINAL'] == r.data['accepted']['FINAL']
                        ? '最终版本已验收'
                        : '当前最终版本尚未验收'),
                tradeFact(
                    '付款',
                    orders[r.orderId]?.status == 'PAID'
                        ? '约定款项已付清'
                        : orders.containsKey(r.orderId)
                            ? '尚未付清或财务状态不满足交付'
                            : '请由买方负责人核对订单款项')
              ],
              tradeButton(
                  widget.works ? '查看成片' : '查看项目', busy ? null : () => open(r))
            ]),
          if (cursor != null)
            tradeButton('加载更多', busy ? null : () => load(more: true),
                outline: true),
          tradeButton('重新读取', busy ? null : load, outline: true),
          if (!widget.works)
            tradeButton(
                '我的交付作品',
                busy || widget.session.productionPending.isNotEmpty
                    ? null
                    : () => Navigator.pushNamed(context, '/production/works'),
                outline: true)
        ],
        locked: busy || widget.session.productionPending.isNotEmpty);
  }
}

class ProductionProjectPage extends StatelessWidget {
  const ProductionProjectPage({super.key, required this.projectId});
  final String projectId;
  @override
  Widget build(BuildContext context) => ProductionGate(
      returnRoute: '/production/project?projectId=$projectId',
      builder: (s) => _ProjectDetail(session: s, projectId: projectId));
}

class _ProjectDetail extends StatefulWidget {
  const _ProjectDetail({required this.session, required this.projectId});
  final AccountSession session;
  final String projectId;
  @override
  State<_ProjectDetail> createState() => _ProjectDetailState();
}

class _ProjectDetailState extends State<_ProjectDetail> {
  late final api = ProductionApi(widget.session);
  ProductionRecord? project;
  List<ProductionRecord> versions = [], feedback = [];
  Map<String, dynamic>? readiness;
  ProductionFulfillment? fulfillment;
  TradeRecord? order;
  String? error;
  bool busy = false;
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final t = ++ticket;
    setState(() {
      busy = true;
      error = null;
      project = null;
      versions = [];
      feedback = [];
      readiness = null;
      fulfillment = null;
      order = null;
    });
    try {
      final p = await api.record(widget.projectId, kind: 'PROJECT');
      final results = await Future.wait([
        api.all(projectId: p.id, kind: 'VERSION'),
        api.all(projectId: p.id, kind: 'FEEDBACK'),
        api.readiness(p.id)
      ]);
      final flow = fulfillmentProject(p) ? await api.fulfillment(p) : null;
      final o = flow != null &&
              widget.session.isOwner &&
              [p.data['buyer_party_id'], p.data['merchant_party_id']]
                  .contains(api.participant())
          ? await TradeApi(widget.session).record(p.orderId)
          : null;
      if (!mounted || t != ticket) return;
      setState(() {
        fulfillment = flow;
        order = o;
        project = p;
        versions = results[0] as List<ProductionRecord>;
        feedback = results[1] as List<ProductionRecord>;
        readiness = results[2] as Map<String, dynamic>;
      });
    } on AccountError catch (e) {
      if (mounted && t == ticket) setState(() => error = productionError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> openVersion(ProductionRecord v) async {
    await Navigator.pushNamed(context, '/production/version?versionId=${v.id}');
    if (mounted) await load();
  }

  @override
  Widget build(BuildContext context) {
    final p = project;
    final locked = busy || widget.session.productionPending.isNotEmpty;
    final currentVersion = p == null ? null : productionStages.keys
        .toList().reversed
        .map((stage) => versions.where(
            (v) => v.id == p.data['current'][stage]).firstOrNull)
        .whereType<ProductionRecord>().firstOrNull;
    return tradeScaffold(
        context,
        '制作任务详情',
        [
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!, icon: Icons.error_outline),
          if (p != null) ...[
            Padding(
                padding: const EdgeInsets.only(bottom: 24),
                child: LayoutBuilder(builder: (context, constraints) {
                  final heading = Column(
                      crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('平台制作任务 / ${productionStatuses[p.status]}',
                        style: const TextStyle(fontSize: 11, color: AccountTheme.accent)),
                    const SizedBox(height: 18),
                    Text(productionProjectTitle(p, order),
                        style: const TextStyle(fontSize: 28,
                            fontWeight: FontWeight.w700, height: 1.25)),
                    const SizedBox(height: 10),
                    Text('${p.data['specification']['final_seconds']}秒 · ${p.data['specification']['service_tier']}',
                        style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
                  ]);
                  final cover = Container(width: 108, height: 144,
                      decoration: BoxDecoration(color: AccountTheme.surface,
                          borderRadius: BorderRadius.circular(12)),
                      child: const Center(child: Text('当前未提供封面',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 11, color: AccountTheme.muted))));
                  if (constraints.maxWidth < 340 ||
                      MediaQuery.textScalerOf(context).scale(14) > 18) {
                    return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [heading, const SizedBox(height: 16), cover]);
                  }
                  return Row(crossAxisAlignment: CrossAxisAlignment.center,
                      children: [Expanded(child: heading),
                        const SizedBox(width: 16), cover]);
                })),
            Container(
                margin: const EdgeInsets.only(bottom: 20),
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(color: const Color(0xFF202320),
                    borderRadius: BorderRadius.circular(16)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(productionStatuses[p.status] ?? p.status,
                      style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 10),
                  const Text('当前进度以本项目记录为准。版本确认、合同许可、付款与正式交付分别核对。',
                      style: TextStyle(color: Color(0xFFDDDFDA), height: 1.6)),
                ])),
            productionCurrentTasks(p, versions,
                flow: fulfillment,
                order: order,
                buyerOwner:
                    p.buyer(api.participant()) && widget.session.isOwner),
            if (fulfillment != null)
              ...fulfillmentSections(context, widget.session, p, fulfillment!,
                  order: order, busy: busy, reload: load),
            tradeSection('制作项目 ${shortSupplyId(p.id)}', [
              tradeFact('当前状态', productionStatuses[p.status]),
              tradeFact('用途', p.data['purpose']),
              tradeFact('范围', p.data['territory']),
              tradeFact(
                  '办事角色',
                  p.buyer(api.participant())
                      ? widget.session.isOwner
                          ? '买方负责人'
                          : '买方成员（只读）'
                      : p.data['assignee_account_id'] ==
                              widget.session.account?['id']
                          ? '实际指派的制作人'
                          : '项目参与负责人'),
              if (p.data['review'] != null)
                tradeFact('开工依据审核理由', p.data['review']['reason'])
            ]),
            tradeSection('当前制作进度', [
              for (final stage in productionStages.keys) ...[
                productionProgressStep(p, stage),
                if (p.data['current'][stage] != null &&
                    versions.any((v) => v.id == p.data['current'][stage]))
                  tradeButton(
                      '查看当前${productionStages[stage]}',
                      busy
                          ? null
                          : () => openVersion(versions.firstWhere(
                              (v) => v.id == p.data['current'][stage])))
              ]
            ]),
            productionSpecification(p),
            tradeSection('付款与最终交付', [
              appNotice(
                  '确认版本不会自动表示付款成功。样片或最终成片已确认后，请回原订单办理对应付款节点；最终原片仍需当前最终版本已验收、约定款项已付清及有效权利。'),
              if (widget.session.isOwner &&
                  [p.data['buyer_party_id'], p.data['merchant_party_id']]
                      .contains(api.participant()))
                tradeButton(
                    '查看原订单与付款',
                    busy
                        ? null
                        : () => Navigator.pushNamed(
                            context, '/trade/record?recordId=${p.orderId}')),
              if (p.data['current']['FINAL'] != null)
                tradeButton(
                    '查看私人作品与下载条件',
                    busy
                        ? null
                        : () => Navigator.pushNamed(
                            context, '/production/work?projectId=${p.id}'),
                    outline: true)
            ]),
            tradeSection('版本记录与反馈历史', [
              if (versions.isEmpty) supplyNote('尚无已提交版本。'),
              for (final v in versions)
                ExpansionTile(
                    key: ValueKey('production-history-${v.id}'),
                    title: Text(productionVersionTitle(v),
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w600)),
                    subtitle: Text(productionVersionState(v, p)),
                    children: [
                      tradeFact('版本说明', v.data['note']),
                      tradeFact('该阶段已提交版本数', p.data['revisions'][v.stage]),
                      if (v.data['review'] != null)
                        tradeFact('独立审核理由', v.data['review']['reason']),
                      for (final f in feedback
                          .where((f) => f.data['version_id'] == v.id))
                        tradeSection(
                            f.data['acceptance_method'] == 'AGREED_TIMEOUT'
                                ? '按原约定期限处理'
                                : f.data['decision'] == 'ACCEPT'
                                    ? '本版确认意见'
                                    : '本版修改意见',
                            [
                              SelectableText(
                                  f.data['acceptance_method'] ==
                                          'AGREED_TIMEOUT'
                                      ? '服务器记录：正式版本可读取、买方收讫后，按原约定期限处理；不代表买方亲自点击确认。'
                                      : f.data['note'],
                                  style: const TextStyle(
                                      fontSize: 16, height: 1.6)),
                              if (f.data['checklist'] != null)
                                tradeFact(
                                    '已确认检查项',
                                    (f.data['checklist'] as Map)
                                        .keys
                                        .map((k) => productionChecks[k])
                                        .join('、'))
                            ]),
                      if (!feedback.any((f) => f.data['version_id'] == v.id))
                        supplyNote('本版尚无买方反馈。'),
                      tradeButton('查看此版本', busy ? null : () => openVersion(v),
                          outline: true)
                    ])
            ]),
            tradeSection('项目留言', [
              operationCommentLink(context, 'PRODUCTION', p.id, '项目留言',
                  enabled: !busy, returned: load)
            ]),
            tradeSection('生成服务', [
              appNotice(readiness?['current_status'] == 'SERVICE_READY'
                  ? '服务器已配置生成服务。外部生成需由实际指派制作人在网页工作台核对本人同意、用途和原约定后办理。'
                  : '生成服务尚未开通，不会创建演示任务或视频。'),
              supplyNote('服务任务完成仍需私有导入、独立审片与买方版本验收。')
            ])
          ],
          tradeButton('重新读取项目', busy ? null : load, outline: true)
        ],
        footer: p == null ? null : LayoutBuilder(
            builder: (context, constraints) {
              final comment = operationCommentLink(
                  context, 'PRODUCTION', p.id, '项目留言',
                  enabled: !locked, returned: load);
              final review = tradeButton(
                  currentVersion == null ? '暂无当前版本' :
                      '审阅当前${productionStages[currentVersion.stage]}',
                  locked || currentVersion == null ? null :
                      () => openVersion(currentVersion));
              if (constraints.maxWidth < 340 ||
                  MediaQuery.textScalerOf(context).scale(14) > 18) {
                return Column(mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [comment, const SizedBox(height: 10), review]);
              }
              return Row(children: [
                Expanded(child: comment),
                const SizedBox(width: 10),
                Expanded(child: review),
              ]);
            }),
        locked: locked);
  }
}

class ProductionVersionPage extends StatelessWidget {
  const ProductionVersionPage(
      {super.key,
      required this.versionId,
      this.feedback = false,
      this.evidence});
  final String versionId;
  final bool feedback;
  final Map<String, dynamic>? evidence;
  @override
  Widget build(BuildContext context) => ProductionGate(
      returnRoute:
          '/production/${feedback ? 'feedback' : 'version'}?versionId=$versionId',
      builder: (s) => _VersionReview(
          session: s,
          versionId: versionId,
          feedbackOnly: feedback,
          evidence: evidence));
}

class _VersionReview extends StatefulWidget {
  const _VersionReview(
      {required this.session,
      required this.versionId,
      required this.feedbackOnly,
      this.evidence});
  final AccountSession session;
  final String versionId;
  final bool feedbackOnly;
  final Map<String, dynamic>? evidence;
  @override
  State<_VersionReview> createState() => _VersionReviewState();
}

class _VersionReviewState extends State<_VersionReview> {
  late final api = ProductionApi(widget.session);
  ProductionRecord? version, project;
  ProductionFulfillment? fulfillment;
  bool notificationRead = false, conflictReviewed = false;
  String changeKind = 'PLATFORM_CORRECTION';
  List<ProductionRecord> history = [];
  String? error, text;
  PrivateVideo? video;
  final note = TextEditingController(), changeNote = TextEditingController();
  final checks = <String, bool>{};
  bool busy = false, reading = false, opened = false, stale = false;
  String decision = 'REQUEST_CHANGES';
  int ticket = 0;
  bool changesOnly = false;
  String recordPanel = 'CURRENT';
  List<ProductionRecord> versionRows = [];
  String? versionCursor, versionError;
  bool versionsBusy = false, versionsLoaded = false;
  int versionsTicket = 0;
  final seenVersionCursors = <String>{};

  Future<void> loadVersionHistory({bool more = false}) async {
    final p = project;
    if (p == null || locked || versionsBusy || more && versionCursor == null) return;
    final t = ++versionsTicket, parentTicket = ticket;
    final epoch = widget.session.epoch, party = widget.session.partyId;
    setState(() {
      versionsBusy = true;
      versionError = null;
      if (!more) { versionRows = []; versionCursor = null; versionsLoaded = false; seenVersionCursors.clear(); }
    });
    try {
      final page = await api.page(projectId: p.id, kind: 'VERSION',
          cursor: more ? versionCursor : null);
      if (!mounted || t != versionsTicket || parentTicket != ticket ||
          epoch != widget.session.epoch || party != widget.session.partyId) return;
      productionRequire(page.nextCursor == null || seenVersionCursors.add(page.nextCursor!));
      setState(() {
        final merged = <String, ProductionRecord>{};
        for (final row in [...versionRows, ...page.items]) {
          final previous = merged[row.id];
          if (previous == null || row.version > previous.version) merged[row.id] = row;
        }
        versionRows = merged.values.toList();
        versionCursor = page.nextCursor;
        versionsLoaded = true;
      });
    } on AccountError catch (e) {
      if (mounted && t == versionsTicket && parentTicket == ticket) {
        setState(() => versionError = productionError(e));
      }
    } finally {
      if (mounted && t == versionsTicket && parentTicket == ticket) {
        setState(() => versionsBusy = false);
      }
    }
  }

  String get path => '/api/v1/production/versions/${widget.versionId}/feedback';
  bool get locked =>
      busy ||
      api.pending(path) != null ||
      (project != null &&
          api.pending(api.fulfillmentPath(project!.id, 'delivery-receipt')) !=
              null);
  bool get canDecide =>
      version != null &&
      project != null &&
      widget.session.isOwner &&
      project!.buyer(api.participant()) &&
      version!.status == 'APPROVED' &&
      version!.current(project!) &&
      !version!.accepted(project!);
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    ticket++;
    versionsTicket++;
    video?.dispose();
    note.dispose();
    changeNote.dispose();
    super.dispose();
  }

  Future<void> load({bool reset = false, bool keepInput = false}) async {
    final t = ++ticket;
    if (reset) {
      await video?.dispose();
      video = null;
      opened = false;
      text = null;
      checks.clear();
      if (!keepInput) {
        note.clear();
        changeNote.clear();
      }
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
      version = null;
      project = null;
      fulfillment = null;
      notificationRead = false;
      history = [];
      versionsTicket++;
      versionRows = [];
      versionCursor = null;
      versionError = null;
      versionsBusy = false;
      versionsLoaded = false;
      seenVersionCursors.clear();
    });
    try {
      final v = await api.record(widget.versionId, kind: 'VERSION');
      final p = await api.record(v.projectId!, kind: 'PROJECT');
      final h = await api.all(projectId: p.id, kind: 'FEEDBACK');
      final flow = fulfillmentProject(p) ? await api.fulfillment(p) : null;
      if (!mounted || t != ticket) return;
      final e = widget.evidence;
      if (!reset &&
          e?['version_id'] == v.id &&
          e?['hash'] == v.hash &&
          e?['object_version'] == v.version &&
          e?['opened'] == true &&
          (flow == null ||
              flow.receipt?['delivery_id'] == e?['delivery_id'] &&
                  flow.receipt?['view_observed_at'] != null)) {
        opened = true;
        final carried = e?['checks'];
        if (carried is Map) {
          for (final k in productionCheckNames(v.stage)) {
            checks[k] = carried[k] == true;
          }
        }
      }
      final pending = api.pending(path);
      if (pending != null) {
        decision = pending['body']['decision'];
        note.text = pending['body']['note'];
        changeKind = pending['body']['change_kind'] ?? 'PLATFORM_CORRECTION';
      }
      setState(() {
        version = v;
        project = p;
        history = h;
        fulfillment = flow;
      });
    } on AccountError catch (e) {
      if (mounted && t == ticket) setState(() => error = productionError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> readContent({bool full = false}) async {
    final v = version;
    if (v == null || reading) return;
    final t = ticket, epoch = widget.session.epoch, p = api.participant();
    final previousVideo = video;
    setState(() {
      reading = true;
      error = null;
      video = null;
      text = null;
      opened = false;
    });
    try {
      // Every play/read starts with a fresh permission-checked content request.
      await previousVideo?.dispose();
      final content = await api.content(v);
      api.check(epoch, p);
      if (!mounted || t != ticket) return;
      if (v.stage == 'SCRIPT') {
        final body = utf8.decode(content.bytes);
        setState(() => text = body);
        if (full) {
          await showDialog<void>(
              context: context,
              builder: (c) => Dialog(
                  child: SafeArea(
                      child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(children: [
                            Text('完整剧本 · 第 ${v.data['revision']} 版',
                                style: const TextStyle(
                                    fontSize: 24, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 16),
                            Expanded(
                                child: Consumer<AccountSession>(
                                    builder: (context, session, _) =>
                                        session.epoch == epoch &&
                                                session.partyId == p &&
                                                !session.productionAccessDenied
                                            ? SingleChildScrollView(
                                                child: SelectableText(body,
                                                    style: const TextStyle(
                                                        fontSize: 16,
                                                        height: 1.8)))
                                            : const Center(
                                                child:
                                                    Text('当前身份已变化，私有内容已清空。')))),
                            const SizedBox(height: 12),
                            FilledButton(
                                onPressed: () => Navigator.pop(c),
                                child: const Text('返回审阅'))
                          ])))));
          api.check(epoch, p);
          if (!mounted || t != ticket) return;
          setState(() => opened = true);
        }
      } else {
        final local = await PrivateVideo.create(content.bytes);
        if (!mounted || t != ticket || epoch != widget.session.epoch) {
          await local.dispose();
          return;
        }
        video = local;
        local.controller.addListener(() {
          if (mounted &&
              t == ticket &&
              video == local &&
              local.controller.value.hasError &&
              opened) {
            setState(() {
              opened = false;
              notificationRead = false;
              checks.clear();
              error = '视频播放失败，不计为已查看，也不会开启收讫计时。';
            });
          }
        });
        await local.controller.initialize();
        api.check(epoch, p);
        if (!mounted || t != ticket || video != local) return;
        await local.controller.play();
        setState(() => opened = true);
      }
      if (opened && project != null && fulfillmentProject(project!)) {
        final current = await api.fulfillment(project!);
        api.check(epoch, p);
        if (!mounted || t != ticket) return;
        setState(() {
          fulfillment = current;
          notificationRead = false;
        });
      }
    } on AccountError catch (e) {
      await video?.dispose();
      video = null;
      if (mounted && t == ticket) {
        setState(() {
          opened = false;
          text = null;
          notificationRead = false;
          checks.clear();
          error = productionError(e);
        });
      }
    } catch (_) {
      await video?.dispose();
      video = null;
      if (mounted && t == ticket) {
        setState(() {
          opened = false;
          text = null;
          notificationRead = false;
          checks.clear();
          error = '私有内容暂不能播放或阅读，不计为已查看，也不会开启计时。请重新读取或报告文件问题。';
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => reading = false);
    }
  }

  Future<void> submit(String selected, String message) async {
    final pending = api.pending(path), v = version, p = project;
    if (v == null ||
        p == null ||
        busy ||
        pending == null && stale && !conflictReviewed) {
      return;
    }
    final epoch = widget.session.epoch, party = api.participant(),
        account = widget.session.account?['id'], beforeTicket = ticket,
        records = jsonEncode([v.raw, p.raw]),
        originalPending = jsonEncode(pending),
        frozenChecks = Map<String, bool>.from(checks),
        frozenChangeKind = changeKind,
        form = jsonEncode([note.text, changeNote.text, decision, checks, changeKind]);
    final input =
        pending == null ? message.trim() : '${pending['body']['note']}';
    final chosen =
        pending == null ? selected : '${pending['body']['decision']}';
    if (!await tradeConfirm(
        context,
        pending == null
            ? (chosen == 'ACCEPT' ? '确认当前具体版本' : '提交本版修改意见')
            : '恢复原版本意见',
        [
          tradeFact('绑定版本', productionVersionTitle(v)),
          tradeFact('决定', chosen == 'ACCEPT' ? '确认本版' : '请求修改'),
          tradeFact('说明', input),
          const Text('确认具体版本不会代替付款、合同签署与权利核验。')
        ])) {
      return;
    }
    if (!mounted) return;
    if (widget.session.epoch != epoch || widget.session.partyId != party ||
        widget.session.account?['id'] != account || ticket != beforeTicket ||
        version == null || project == null ||
        jsonEncode([version!.raw, project!.raw]) != records ||
        jsonEncode(api.pending(path)) != originalPending ||
        pending == null && jsonEncode([note.text, changeNote.text, decision, checks, changeKind]) != form) {
      setState(() { conflictReviewed = false; error = '确认期间身份、版本、原请求或填写内容已变化，请重新核对。'; });
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = pending == null
          ? await api.feedback(
              v,
              p,
              chosen,
              input,
              chosen == 'ACCEPT'
                  ? {
                      for (final name in productionCheckNames(v.stage))
                        name: frozenChecks[name] == true
                    }
                  : null,
              changeKind: frozenChangeKind)
          : await api.retry(path);
      api.check(epoch, party);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..removeCurrentSnackBar();
      await video?.dispose();
      video = null;
      if (!mounted) return;
      Navigator.pushReplacementNamed(
          context, '/production/project?projectId=${result.projectId}');
    } on AccountError catch (e) {
      if (!mounted) return;
      if (e.status == 412) {
        stale = true;
        conflictReviewed = false;
        await load(reset: true, keepInput: true);
        if (!mounted) return;
      }
      setState(() => error = productionError(e, writing: true));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> deliveryNotice() async {
    final v = version, p = project, f = fulfillment;
    if (v == null || p == null || f == null || !opened) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final current =
          await api.receiveDeliveryNotice(p, f, v, contentOpened: opened);
      if (mounted) {
        setState(() {
          fulfillment = current;
          notificationRead = true;
        });
      }
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          notificationRead = false;
          error = productionError(e, writing: true);
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> receipt() async {
    final v = version, p = project, f = fulfillment;
    if (v == null || p == null || f == null) return;
    final receiptPath = api.fulfillmentPath(p.id, 'delivery-receipt');
    final original = api.pending(receiptPath);
    if (original == null && (!opened || !notificationRead)) return;
    if (!await tradeConfirm(
        context, original == null ? '明确确认收到本次正式交付' : '恢复原收讫请求', [
      tradeFact('具体版本', productionVersionTitle(v)),
      tradeFact('原约定查看期限', customizationAcceptanceLabel(f.terms)),
      const Text('已成功打开当前文件并确认通知已读。最终成片按本单约定计时，其余阶段仍须明确确认；收到不表示已验收，也不表示已付款。'),
    ])) {
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      // Refresh the PROJECT version after the notification is read, then ask explicitly.
      final result = original == null
          ? await api.changeFulfillment(p, f, 'delivery-receipt', {})
          : await api.retryFulfillment(p, receiptPath);
      if (mounted) setState(() => fulfillment = result);
    } on AccountError catch (e) {
      if (mounted) {
        if (e.status == 412) {
          notificationRead = false;
          await load(reset: true, keepInput: true);
        }
        if (mounted) setState(() => error = productionError(e, writing: true));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget receiptCard(ProductionRecord v) {
    final f = fulfillment!, r = f.receipt;
    final original =
        api.pending(api.fulfillmentPath(f.projectId, 'delivery-receipt'));
    return tradeSection('先查看，再明确收讫', [
      if (r == null || r['version_id'] != v.id)
        appNotice('这不是当前待收讫的正式交付。历史版本或已结束的通知不启动新计时。')
      else ...[
        tradeFact(
            '服务器读取记录',
            r['view_observed_at'] == null
                ? '尚未记录本次成功读取'
                : tradeDate(r['view_observed_at'])),
        tradeFact('本次收讫',
            r['notified_at'] == null ? '尚待确认收到' : tradeDate(r['notified_at'])),
        tradeFact('服务器给出的截止时间', customizationDeadlineLabel(r)),
        appNotice('读取失败或视频无法播放不算已查看。通知已读与明确收讫分别办理；超期按原约定处理，不冒称本人确认。'),
        if (r['notified_at'] == null && canDecide) ...[
          tradeButton(
              notificationRead ? '本次交付通知已读' : '确认本次交付通知已读',
              locked || reading || !opened || notificationRead
                  ? null
                  : deliveryNotice,
              outline: true),
          tradeButton(
              original != null ? '恢复原收讫请求核对' : '明确确认本次交付已收到',
              busy ||
                      reading ||
                      original == null && (!opened || !notificationRead)
                  ? null
                  : receipt),
        ],
      ],
      tradeButton(
          '报告文件问题或申请延期',
          locked
              ? null
              : () => Navigator.pushNamed(context,
                          '/production/aftercare?projectId=${f.projectId}&kind=FILE_UNAVAILABLE')
                      .then((_) {
                    if (mounted) load(reset: true, keepInput: true);
                  }),
          outline: true),
    ]);
  }

  Widget changeKindInput() => DropdownButtonFormField<String>(
      initialValue: changeKind,
      decoration: const InputDecoration(labelText: '这次修改属于'),
      isExpanded: true,
      items: const [
        DropdownMenuItem(
            value: 'PLATFORM_CORRECTION', child: Text('纠正原约定错误（不扣创意次数）')),
        DropdownMenuItem(
            value: 'CREATIVE_CHANGE', child: Text('新增创作要求（按原约定计次）'))
      ],
      onChanged: locked ? null : (v) => setState(() => changeKind = v!));
  String mediaTime(Duration duration) =>
      '${duration.inMinutes.toString().padLeft(2, '0')}:${(duration.inSeconds % 60).toString().padLeft(2, '0')}';

  Widget contentCard(ProductionRecord v) {
    if (v.stage == 'SCRIPT') {
      return tradeSection('剧本节选', [
        if (text != null)
          SelectableText(
              text!.length > 260 ? '${text!.substring(0, 260)}…' : text!,
              style: const TextStyle(fontSize: 16, height: 1.8))
        else
          appNotice('点击完整阅读，按当前身份读取本版剧本。'),
        tradeButton(
            '完整阅读', locked || reading ? null : () => readContent(full: true)),
        if (reading) const LinearProgressIndicator(),
        if (opened) appNotice('本版内容已打开。请自行核对完整内容，再勾选验收项。'),
      ]);
    }
    final controller = video?.controller;
    final initialized = controller?.value.isInitialized == true;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
          color: AccountTheme.text,
          margin: const EdgeInsets.only(bottom: 16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            AspectRatio(
                aspectRatio:
                    initialized ? controller!.value.aspectRatio : 16 / 9,
                child: initialized
                    ? VideoPlayer(controller!)
                    : Center(
                        child: IconButton.filled(
                            style: IconButton.styleFrom(
                                backgroundColor: AccountTheme.canvas,
                                foregroundColor: AccountTheme.text,
                                shape: const RoundedRectangleBorder()),
                            iconSize: 30,
                            padding: const EdgeInsets.all(18),
                            tooltip: '重新核权并播放本版预览',
                            onPressed: locked || reading ? null : readContent,
                            icon: const Icon(Icons.play_arrow_outlined)))),
            Padding(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 18),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                          '${productionStages[v.stage]} · 第 ${v.data['revision']} 版 · 私有预览',
                          style: const TextStyle(
                              fontSize: 13,
                              height: 1.6,
                              color: AccountTheme.canvas)),
                      const SizedBox(height: 12),
                      if (initialized)
                        ValueListenableBuilder<VideoPlayerValue>(
                            valueListenable: controller!,
                            builder: (_, value, __) => Column(children: [
                                  VideoProgressIndicator(controller,
                                      allowScrubbing: false,
                                      colors: const VideoProgressColors(
                                          playedColor: AccountTheme.vermilion,
                                          bufferedColor: AccountTheme.muted,
                                          backgroundColor: Color(0xFF444444))),
                                  const SizedBox(height: 8),
                                  Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(mediaTime(value.position),
                                            style: const TextStyle(
                                                color: AccountTheme.canvas,
                                                fontSize: 12)),
                                        Text(mediaTime(value.duration),
                                            style: const TextStyle(
                                                color: AccountTheme.canvas,
                                                fontSize: 12)),
                                      ]),
                                ]))
                      else
                        const Text('读取后显示本版实际时长',
                            style: TextStyle(
                                color: AccountTheme.canvas, fontSize: 12)),
                    ])),
          ])),
      tradeButton('播放预览', locked || reading ? null : readContent),
      if (initialized)
        tradeButton('暂停预览', () => controller!.pause(), outline: true),
      if (reading) const LinearProgressIndicator(),
      appNotice('画面来自当前获准的私有文件；读取或播放失败不会视为已查看。'),
      if (opened) appNotice('本版内容已打开。请自行核对完整内容，再勾选验收项。'),
    ]);
  }

  Widget checkCard(ProductionRecord v) =>
      tradeSection(v.stage == 'SCRIPT' ? '确认阅读' : '验收检查清单', [
        for (final name in productionCheckNames(v.stage))
          CheckboxListTile(
              key: ValueKey('production-check-$name'),
              contentPadding: EdgeInsets.zero,
              title: Text(
                  v.stage == 'SCRIPT' ? '我已完整阅读本版剧本。' : productionChecks[name]!,
                  style: const TextStyle(fontSize: 16)),
              value: checks[name] == true,
              onChanged: locked || !canDecide
                  ? null
                  : (value) => setState(() => checks[name] = value == true)),
        if (!opened)
          appNotice(v.stage == 'SCRIPT' ? '请先完整阅读本版剧本。' : '请先播放本版预览并核对完整内容。')
      ]);
  bool acceptedEnabled(ProductionRecord v) =>
      opened &&
      productionCheckNames(v.stage).every((name) => checks[name] == true);
  List<Widget> feedbackForm(ProductionRecord v, ProductionRecord p) {
    final pending = api.pending(path);
    final limit = fulfillment == null
        ? p.data['change_requests'] >= p.data['specification']['revision_limit']
        : changeKind == 'CREATIVE_CHANGE' &&
            fulfillment!.creativeChanges >=
                p.data['specification']['revision_limit'] +
                    fulfillment!.additionalChanges;
    final needsRead = fulfillment != null && !opened;
    if (!widget.feedbackOnly && v.stage == 'SCRIPT') {
      return [
        if (canDecide)
          tradeSection('本版意见', [
            if (fulfillment != null) changeKindInput(),
            TextField(
                controller: changeNote,
                enabled: !locked,
                minLines: 3,
                maxLines: 6,
                maxLength: 4000,
                decoration: const InputDecoration(
                    labelText: '本版修改意见', hintText: '请输入你对本版剧本的修改意见…')),
            tradeButton(
                '提出修改',
                locked ||
                        needsRead ||
                        stale && !conflictReviewed ||
                        limit ||
                        changeNote.text.trim().isEmpty
                    ? null
                    : () => submit('REQUEST_CHANGES', changeNote.text)),
            if (limit) appNotice('本单约定修改次数已用完，请按原约定协商。')
          ]),
        if (canDecide)
          tradeSection('确认', [
            checkCard(v),
            TextField(
                controller: note,
                enabled: !locked,
                minLines: 2,
                maxLines: 5,
                maxLength: 4000,
                decoration: const InputDecoration(
                    labelText: '确认说明', hintText: '已阅读并确认本版剧本。')),
            tradeButton(
                '确认这版剧本',
                locked || !acceptedEnabled(v) || note.text.trim().isEmpty
                    ? null
                    : () => submit('ACCEPT', note.text))
          ])
      ];
    }
    if (!widget.feedbackOnly) {
      return [
        if (canDecide) checkCard(v),
        tradeButton(
            '本版确认与修改意见',
            locked || !canDecide
                ? null
                : () => Navigator.pushNamed(
                        context, '/production/feedback?versionId=${v.id}',
                        arguments: {
                          'version_id': v.id,
                          'hash': v.hash,
                          'object_version': v.version,
                          'opened': opened,
                          'delivery_id': fulfillment?.receipt?['delivery_id'],
                          'checks': checks
                        }).then((_) {
                      if (mounted) load(reset: true);
                    })),
        tradeButton(
            '版本记录',
            locked
                ? null
                : () => Navigator.pushNamed(
                    context, '/production/project?projectId=${p.id}'),
            outline: true)
      ];
    }
    return [
      if (fulfillment != null && decision == 'REQUEST_CHANGES')
        changeKindInput(),
      tradeSection('1 · 选择本版处理', [
        SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'ACCEPT', label: Text('确认本版')),
              ButtonSegment(value: 'REQUEST_CHANGES', label: Text('请求修改'))
            ],
            selected: {
              decision
            },
            onSelectionChanged: locked || !canDecide
                ? null
                : (values) => setState(() => decision = values.single))
      ]),
      tradeSection(decision == 'ACCEPT' ? '2 · 说明确认依据' : '2 · 写明修改要求', [
        TextField(
            controller: note,
            enabled: !locked && canDecide,
            minLines: 4,
            maxLines: 8,
            maxLength: 4000,
            decoration: InputDecoration(
                labelText: decision == 'ACCEPT' ? '确认说明' : '本版修改意见',
                hintText: '请注明本版时间点、画面或声音问题，以及希望如何调整。'))
      ]),
      tradeSection('3 · 核对本次影响', [
        tradeFact('按本单约定记录',
            '已提出 ${p.data['change_requests']} 次 / 约定 ${p.data['specification']['revision_limit']} 次'),
        appNotice(fulfillment == null
            ? '制作方内部补充版本不占买方修改次数。请求修改会按本单约定记一次。'
            : '纠正原约定错误不扣创意次数；只有新增创作要求按原约定计次，超限另开问题单报价。')
      ]),
      if (decision == 'ACCEPT')
        checkCard(v)
      else
        tradeSection('验收检查项', [appNotice('请求修改时无需勾选验收项。')]),
      tradeButton(
          decision == 'ACCEPT' ? '提交本版确认' : '提交修改意见',
          pending != null ||
                  locked ||
                  !canDecide ||
                  stale && !conflictReviewed ||
                  note.text.trim().isEmpty ||
                  needsRead ||
                  (decision == 'ACCEPT' ? !acceptedEnabled(v) : limit)
              ? null
              : () => submit(decision, note.text)),
      if (limit && decision == 'REQUEST_CHANGES')
        appNotice('本单约定修改次数已用完，请按原约定协商。')
    ];
  }

  @override
  Widget build(BuildContext context) {
    // Controllers trigger rebuilds without copying draft business data.
    return ListenableBuilder(
        listenable: Listenable.merge([note, changeNote]),
        builder: (context, _) {
          final v = version, p = project, pending = api.pending(path);
          return tradeScaffold(
              context,
              widget.feedbackOnly
                  ? '提交本版意见'
                  : v?.stage == 'SCRIPT'
                      ? '确认剧本'
                      : v?.stage == 'FINAL'
                          ? '最终成片验收'
                          : '审阅${productionStages[v?.data['stage']] ?? '版本'}',
              [
                if (!widget.feedbackOnly &&
                    v != null &&
                    p != null &&
                    v.stage != 'SCRIPT') ...[
                  contentCard(v),
                  Padding(
                      padding: const EdgeInsets.only(top: 8, bottom: 24),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(productionVersionTitle(v),
                                style: const TextStyle(
                                    fontSize: 12, color: AccountTheme.accent)),
                            const SizedBox(height: 20),
                            Text(v.stage == 'FINAL' ? '成片验收' : '样片审阅',
                                style: const TextStyle(
                                    fontFamily: AccountTheme.sans,
                                    fontSize: 24,
                                    height: 1.15,
                                    fontWeight: FontWeight.w900)),
                          ])),
                ] else
                  tradeHeading(widget.feedbackOnly ? '写下本版意见' : '确认这一版',
                      eyebrow: '正式版本 / 先查看，再确认', fontSize: 28),
                if (busy) const LinearProgressIndicator(),
                if (error != null) appNotice(error!, icon: Icons.error_outline),
                if (pending != null)
                  tradeSection('原意见结果待核实', [
                    tradeFact(
                        '原决定',
                        pending['body']['decision'] == 'ACCEPT'
                            ? '确认本版'
                            : '请求修改'),
                    tradeFact('原说明', pending['body']['note']),
                    tradeButton('恢复原请求核对',
                        busy ? null : () => submit(decision, note.text))
                  ]),
                if (v != null && p != null) ...[
                  if (!widget.feedbackOnly) ...[
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final panel in const [
                        ('CURRENT', '本页绑定版本'),
                        ('VERSIONS', '版本历史'),
                        ('FEEDBACK', '本版修改记录'),
                      ])
                        ChoiceChip(
                            label: Text(panel.$2),
                            selected: recordPanel == panel.$1,
                            onSelected: (_) => setState(() => recordPanel = panel.$1)),
                    ]),
                    const SizedBox(height: 12),
                    const Text('仅切换只读记录区。下方原验收表单始终保留，提交仍绑定本页版本。',
                        style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
                    if (recordPanel == 'CURRENT')
                      supplyNote('下方显示本页绑定版本；查看其他记录不会切换验收对象。'),
                    if (recordPanel == 'VERSIONS')
                      tradeSection('本项目版本历史', [
                      supplyNote('按需分页读取当前身份可查看的版本；不假定列表顺序或默认第一条为当前成片。'),
                      if (versionsBusy) const LinearProgressIndicator(),
                      if (versionError != null) appNotice(versionError!),
                      if (!versionsLoaded && !versionsBusy && versionError == null)
                        supplyNote('尚未读取版本历史，不代表没有版本。'),
                      for (final row in versionRows)
                        tradeSection(productionVersionTitle(row), [
                          tradeFact('状态', productionVersionState(row, p)),
                          tradeFact('记录编号', row.id),
                          tradeFact('版本说明', row.data['note']),
                          if (row.id == v.id) supplyNote('本页正在核对这一版本。'),
                        ]),
                      if (versionsLoaded && versionRows.isEmpty)
                        supplyNote(versionCursor == null ? '本次读取没有可见版本。' : '本页暂无可见版本，可继续读取。'),
                      tradeButton('重新读取版本历史',
                          locked || versionsBusy ? null : () => loadVersionHistory(), outline: true),
                      if (versionCursor != null)
                        tradeButton('继续读取版本历史',
                            locked || versionsBusy ? null : () => loadVersionHistory(more: true), outline: true),
                    ]),
                    if (recordPanel == 'FEEDBACK')
                      tradeSection('本版记录', [
                      Wrap(spacing: 8, children: [
                        ChoiceChip(label: const Text('本版全部反馈'),
                            selected: !changesOnly,
                            onSelected: locked ? null : (_) => setState(() => changesOnly = false)),
                        ChoiceChip(label: const Text('本版修改请求'),
                            selected: changesOnly,
                            onSelected: locked ? null : (_) => setState(() => changesOnly = true)),
                      ]),
                      const SizedBox(height: 12),
                      supplyNote('仅筛选已读取且绑定本版本的反馈；其他版本请进入项目版本历史。'),
                      if (!history.any((f) => f.data['version_id'] == v.id &&
                          (!changesOnly || f.data['decision'] == 'REQUEST_CHANGES')))
                        supplyNote(changesOnly ? '本版暂无已读取的修改请求。' : '本版暂无已读取的买方反馈。'),
                      for (final f in history
                          .where((f) => f.data['version_id'] == v.id &&
                              (!changesOnly || f.data['decision'] == 'REQUEST_CHANGES'))) ...[
                        tradeFact(
                            f.data['acceptance_method'] == 'AGREED_TIMEOUT'
                                ? '按原约定期限处理'
                                : f.data['decision'] == 'ACCEPT'
                                    ? '确认本版'
                                    : '请求修改',
                            f.data['acceptance_method'] == 'AGREED_TIMEOUT'
                                ? '服务器按收讫后的原约定期限处理，不是本人点击确认。'
                                : f.data['note']),
                        const Divider()
                      ]
                    ]),
                  ],
                  const SizedBox(height: 16),
                  Container(
                      margin: const EdgeInsets.only(bottom: 18),
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                          color: const Color(0xFF202320),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: AccountTheme.border)),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Icon(v.accepted(p) ? Icons.check_circle_outline : Icons.movie_outlined,
                            color: Colors.white, size: 28),
                        const SizedBox(width: 14),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(productionVersionTitle(v), style: const TextStyle(
                              color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 8),
                          Text(productionVersionState(v, p), style: const TextStyle(
                              color: Color(0xFFDDDFDA), height: 1.5)),
                          const SizedBox(height: 8),
                          const Text('本页只处理当前绑定版本，不代表付款或最终下载已完成。',
                              style: TextStyle(color: Color(0xFFDDDFDA), fontSize: 12, height: 1.5)),
                        ])),
                      ])),
                  tradeSection(widget.feedbackOnly ? '绑定版本' : '阶段与版本', [
                    tradeFact('版本', productionVersionTitle(v)),
                    tradeFact('当前状态', productionVersionState(v, p)),
                    tradeFact('版本说明', v.data['note']),
                    if (v.data['review'] != null)
                      tradeFact('独立审核理由', v.data['review']['reason'])
                  ]),
                  if (!canDecide)
                    appNotice(v.accepted(p)
                        ? '本版已确认。停止重复确认，请回订单查看原付款节点。'
                        : !v.current(p)
                            ? '这是历史版本。当前版本发生变化后，旧确认不再作为后续阶段或交付依据。'
                            : v.status != 'APPROVED'
                                ? '等待独立审片通过后，买方负责人才能确认本版。'
                                : '当前身份只读；意见由买方负责人提交。'),
                  if (stale) ...[
                    appNotice('已读取最新版本，说明已保留。请重新打开内容、核对本版，再明确确认沿用输入。'),
                    CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: conflictReviewed,
                        title: const Text('我已核对最新版本，沿用本页说明'),
                        onChanged: locked
                            ? null
                            : (v) =>
                                setState(() => conflictReviewed = v == true))
                  ],
                  if ((!widget.feedbackOnly && v.stage == 'SCRIPT') ||
                      (widget.feedbackOnly && decision == 'ACCEPT' && !opened))
                    contentCard(v),
                  if (fulfillment != null) receiptCard(v),
                  if (!widget.feedbackOnly)
                    Card(
                        child: ExpansionTile(
                            title: const Text('原约定'),
                            subtitle: const Text('查看本单规格与修改约定'),
                            children: [productionSpecification(p)])),
                  ...feedbackForm(v, p),
                  if (v.stage == 'FINAL')
                    tradeSection('验收后的下一步', [
                      appNotice('仅确认当前绑定的成片版本。尾款、正式交付、当前许可与下载条件仍分别核对；补片或中间版本不能冒充最终成片验收。'),
                    ]),
                  tradeSection('版本留言', [
                    operationCommentLink(context, 'PRODUCTION', v.id, '版本留言',
                        enabled: !locked, returned: () => load(reset: true))
                  ]),
                  tradeButton(
                      '查看原约定与付款',
                      locked
                          ? null
                          : () => Navigator.pushNamed(
                              context, '/production/project?projectId=${p.id}'),
                      outline: true)
                ],
                tradeButton('重新读取当前版本',
                    locked || reading ? null : () => load(reset: true),
                    outline: true)
              ],
              locked: locked);
        });
  }
}

class ProductionWorkPage extends StatelessWidget {
  const ProductionWorkPage({super.key, required this.projectId});
  final String projectId;
  @override
  Widget build(BuildContext context) => ProductionGate(
      returnRoute: '/production/work?projectId=$projectId',
      builder: (s) => _PrivateWork(session: s, projectId: projectId));
}

class _PrivateWork extends StatefulWidget {
  const _PrivateWork({required this.session, required this.projectId});
  final AccountSession session;
  final String projectId;
  @override
  State<_PrivateWork> createState() => _PrivateWorkState();
}

class _PrivateWorkState extends State<_PrivateWork> {
  late final api = ProductionApi(widget.session);
  ProductionRecord? project, version;
  TradeRecord? order;
  ProductionFulfillment? fulfillment;
  PrivateVideo? video;
  String? error, notice;
  bool busy = false;
  int ticket = 0;
  bool get deliverable =>
      version != null &&
      project != null &&
      version!.current(project!) &&
      version!.accepted(project!) &&
      version!.status == 'APPROVED' &&
      (order?.status == 'PAID' ||
          order?.status == 'REWARD_FUNDED' && order?.amount == 0) &&
      order!.data['financial']['refunded_minor'] == 0 &&
      (fulfillment == null ||
          ['STARTED', 'DELIVERED'].contains(fulfillment!.state));
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    ticket++;
    video?.dispose();
    super.dispose();
  }

  Future<void> load() async {
    if (!mounted) return;
    final t = ++ticket, epoch = widget.session.epoch, p = api.participant();
    bool currentRequest() => mounted && t == ticket &&
        epoch == widget.session.epoch && p == widget.session.partyId;
    final previousVideo = video;
    video = null;
    setState(() {
      busy = true;
      project = null;
      version = null;
      order = null;
      fulfillment = null;
      error = null;
      notice = null;
    });
    try {
      await previousVideo?.dispose();
      if (!currentRequest()) return;
      final pr = await api.record(widget.projectId, kind: 'PROJECT');
      final f = fulfillmentProject(pr) ? await api.fulfillment(pr) : null;
      final id = pr.data['current']['FINAL'];
      final v = id == null ? null : await api.record(id, kind: 'VERSION');
      TradeRecord? o;
      if (widget.session.isOwner &&
          [pr.data['buyer_party_id'], pr.data['merchant_party_id']]
              .contains(p)) {
        o = await TradeApi(widget.session).record(pr.orderId);
      }
      api.check(epoch, p);
      if (!currentRequest()) return;
      setState(() {
        project = pr;
        version = v;
        order = o;
        fulfillment = f;
      });
    } on AccountError catch (e) {
      if (currentRequest()) setState(() => error = productionError(e));
    } finally {
      if (currentRequest()) setState(() => busy = false);
    }
  }

  Future<void> media({bool download = false}) async {
    if (busy) return;
    final v = version;
    if (v == null) return;
    final t = ticket, epoch = widget.session.epoch, p = api.participant();
    bool currentRequest() => mounted && t == ticket &&
        epoch == widget.session.epoch && p == widget.session.partyId;
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      final previousVideo = video;
      video = null;
      await previousVideo?.dispose();
      if (!currentRequest()) return;
      // Re-read acceptance and finance immediately before requesting original bytes.
      if (download) {
        final pr = await api.record(widget.projectId, kind: 'PROJECT');
        final o = await TradeApi(widget.session).record(pr.orderId);
        final f = fulfillmentProject(pr) ? await api.fulfillment(pr) : null;
        if (!currentRequest()) return;
        setState(() {
          project = pr;
          order = o;
          fulfillment = f;
        });
        if (!deliverable) {
          throw const AccountError(409, 'FINAL_DELIVERY_NOT_READY');
        }
      }
      final content =
          await api.content(v, variant: download ? 'final' : 'preview');
      api.check(epoch, p);
      if (!currentRequest()) return;
      if (download) {
        final saved = await FilePicker.saveFile(
            fileName: '${v.id}.mp4', bytes: content.bytes);
        api.check(epoch, p);
        if (!currentRequest()) return;
        setState(() => notice = kIsWeb
            ? '原片已通过本次权限核验，已交给浏览器保存。'
            : saved == null
                ? '已取消保存。'
                : '当前原片已保存。');
        final pr = project;
        if (pr != null && fulfillmentProject(pr)) {
          try {
            final current = await api.fulfillment(pr);
            api.check(epoch, p);
            if (!currentRequest()) return;
            setState(() => fulfillment = current);
          } catch (_) {
            if (mounted &&
                t == ticket &&
                epoch == widget.session.epoch &&
                p == widget.session.partyId) {
              setState(() => error = '履约状态暂未刷新，请重新核对交付条件。');
            }
          }
        }
      } else {
        final local = await PrivateVideo.create(content.bytes);
        if (!currentRequest()) {
          await local.dispose();
          return;
        }
        video = local;
        await local.controller.initialize();
        api.check(epoch, p);
        if (!currentRequest() || video != local) return;
        await local.controller.play();
        if (!currentRequest() || video != local) return;
        setState(() {});
      }
    } on AccountError catch (e) {
      if (currentRequest()) setState(() => error = productionError(e));
    } catch (_) {
      if (currentRequest()) {
        setState(
            () => error = download ? '保存未完成，请重试本次受控下载。' : '私有成片暂不能播放，请重新读取。');
      }
    } finally {
      if (currentRequest()) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = project, v = version;
    return tradeScaffold(
        context,
        '私人作品',
        [
          tradeHeading('我的交付作品', eyebrow: '私人作品 / 原订单与许可'),
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!, icon: Icons.error_outline),
          if (notice != null) appNotice(notice!),
          if (p != null && v != null) ...[
            tradeSection('交付状态', [
              Wrap(spacing: 8, runSpacing: 8, children: [
                Chip(label: Text(v.accepted(p) ? '当前版已验收' : '当前版待核对')),
                Chip(label: Text(deliverable ? '满足下载条件' : '下载条件未满足')),
              ]),
              const SizedBox(height: 12),
              Text(deliverable
                  ? '可按本次原约定读取正式作品，公开分享或发行仍需另行办理授权。'
                  : '先核对当前最终版本、付款和有效权利；有预览不代表正式原片可下载。',
                  style: const TextStyle(fontSize: 14, height: 1.6, color: AccountTheme.muted)),
            ]),
            tradeSection('当前成片', [
              if (video?.controller.value.isInitialized == true)
                AspectRatio(
                    aspectRatio: video!.controller.value.aspectRatio,
                    child: VideoPlayer(video!.controller))
              else
                AspectRatio(
                    aspectRatio: 16 / 9,
                    child: Container(
                        decoration: BoxDecoration(
                            color: AccountTheme.text.withValues(alpha: .08),
                            borderRadius: BorderRadius.circular(18)),
                        child: const Center(
                            child: Icon(Icons.play_circle_outline,
                                size: 64, color: AccountTheme.accent)))),
              tradeFact('制作项目', shortSupplyId(p.id)),
              tradeFact('版本', productionVersionTitle(v)),
              tradeFact('版本说明', v.data['note']),
              tradeButton('播放成片预览',
                  busy || v.status != 'APPROVED' ? null : () => media()),
              if (video?.controller.value.isInitialized == true)
                tradeButton('暂停预览', () => video!.controller.pause(),
                    outline: true)
            ]),
            tradeSection('验收与付款', [
              if (fulfillment != null)
                tradeFact('实际履约进度', fulfillmentStates[fulfillment!.state]),
              tradeFact('验收', v.accepted(p) ? '已验收当前最终版本' : '当前最终版本尚未验收'),
              tradeFact(
                  '付款',
                  order?.status == 'PAID'
                      ? '约定款项已付清'
                      : order?.status == 'REWARD_FUNDED' && order?.amount == 0
                          ? '本单为零金额奖励订单，交付条件另行核对'
                      : order == null
                          ? '请由买方负责人核对订单款项'
                          : '尚未付清或财务状态不满足交付'),
              tradeFact('用途', p.data['purpose']),
              tradeFact('范围', p.data['territory']),
              appNotice('公开分享或发行需另行办理项目与授权，不能自动继承私人作品约定。')
            ]),
            if (!deliverable)
              tradeBanner('当前原片尚不可下载', '完成当前最终版本验收和约定付款后，再核对本人同意、许可和实际权限。'),
            tradeButton('下载当前原片',
                busy || !deliverable ? null : () => media(download: true)),
            tradeButton(
                '原约定与订单付款',
                busy
                    ? null
                    : () => Navigator.pushNamed(
                        context, '/production/project?projectId=${p.id}'),
                outline: true),
            tradeButton(
                '查看当前最终版本',
                busy
                    ? null
                    : () => Navigator.pushNamed(
                        context, '/production/version?versionId=${v.id}'),
                outline: true),
            tradeButton(
                '了解公开项目',
                busy
                    ? null
                    : () =>
                        Navigator.pushNamed(context, '/licensing?kind=PROJECT'),
                outline: true)
          ] else if (!busy && p != null)
            tradeSection('尚无当前成片', [
              supplyNote('本项目尚未提交最终成片版本。'),
              tradeButton(
                  '返回制作项目',
                  () => Navigator.pushNamed(
                      context, '/production/project?projectId=${p.id}'))
            ]),
          tradeButton('重新核对交付条件', busy ? null : load, outline: true)
        ],
        locked: busy || widget.session.productionPending.isNotEmpty);
  }
}
