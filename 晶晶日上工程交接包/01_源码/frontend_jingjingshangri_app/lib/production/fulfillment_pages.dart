import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../supply/supply_models.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_models.dart';
import '../trade/trade_widgets.dart';
import 'production_api.dart';
import 'production_models.dart';
import 'production_widgets.dart';
import 'fulfillment_api.dart';
import 'fulfillment_models.dart';

List<Widget> fulfillmentSections(BuildContext context, AccountSession session,
    ProductionRecord project, ProductionFulfillment flow,
    {TradeRecord? order, bool busy = false, required VoidCallback reload}) {
  Future<void> open(String route) async {
    await Navigator.pushNamed(context, route);
    if (context.mounted) reload();
  }

  final r = flow.receipt, cancel = flow.cancellation;
  final buyer = project.buyer(session.partyId!) && session.isOwner;
  final phase = flow.state == 'PLANNED'
      ? project.status == 'IN_REVIEW'
          ? '开工依据待独立审核'
          : project.status == 'REJECTED'
              ? '开工依据未通过审核'
              : order != null && order.data['financial']['received_minor'] == 0
                  ? '首款尚未核实'
                  : '待受派制作人核对首款与权利后开工'
      : fulfillmentStates[flow.state]!;
  return [
    tradeHeading('这次制作', eyebrow: '原故事 / 原订单 / 具体版本'),
    tradeBanner(
        phase,
        flow.raw['started_at'] == null
            ? '尚未开工。付款、项目审核与授权分别核对。'
            : '实际开工：${tradeDate(flow.raw['started_at'])}',
        icon: Icons.movie_outlined),
    tradeSection('给谁制作，使用谁的形象', [
      tradeFact('买方主体', shortSupplyId(project.data['buyer_party_id'])),
      tradeFact('平台制作主体', shortSupplyId(project.data['producer_party_id'])),
      tradeFact('实际受派人', shortSupplyId(project.data['assignee_account_id'])),
      if (!flow.raw['uses_identifiable_people'])
        appNotice('这笔制作不使用可识别人物，普通买家无需先建立或购买自己的数字人。'),
      for (final c
          in (flow.raw['cast'] as List).cast<Map<String, dynamic>>()) ...[
        tradeFact('具体真人', c['person_id']),
        tradeFact('具体数字人', c['avatar_id']),
        tradeFact('使用方式',
            c['usage'] == 'EXISTING_MATERIAL' ? '人工使用已获准素材' : '新生成，另核授权与托管'),
        tradeFact('造型版本', c['look_version_id']),
        if (c['voice_version_id'] != null)
          tradeFact('声音版本', c['voice_version_id']),
        tradeFact('本人同意', (c['artist_consent_ids'] as List).join('\n')),
        const Divider(),
      ],
      tradeButton('查看订单固定的原故事',
          busy ? null : () => open('/production/story?projectId=${project.id}'),
          outline: true),
      appNotice('后续改故事不会覆盖这笔订单、合同或已确认版本。'),
    ]),
    tradeSection('按原订单付款与验收', [
      if (flow.manualSample)
        appNotice('本单为人工样片服务。付款节点按原订单显示，不套用私人定制三期。')
      else
        appNotice(
            flow.terms['preview_payment_order'] == 'PREVIEW_BEFORE_INTERIM'
                ? '先提供正式带水印预览，当前样片确认后再办理中间补款；成片确认后办理尾款，付清再下载正式文件。'
                : '这是保留原顺序的历史约定，按本单实际付款与预览条件办理。'),
      if (order != null) ...[
        for (final i in tradeRows(order.quote['installments'], max: 20))
          tradeFact(
              tradeTriggers[i['trigger']]!,
              tradeMoney(tradeRows(i['allocations'])
                  .fold<int>(0, (n, a) => n + (a['amount_minor'] as int)))),
        tradeFact(
            '已核实收款', tradeMoney(order.data['financial']['received_minor'])),
        tradeFact(
            '已核实退款', tradeMoney(order.data['financial']['refunded_minor'])),
      ] else
        supplyNote('请由买方或商户负责人从原订单核对具体金额与实收。'),
      if (flow.manualSample)
        tradeButton(
            '查看人工样片本人专用约定',
            busy
                ? null
                : () => open(
                    '/production/manual-sample?requestId=${flow.source['request_id']}'),
            outline: true),
      tradeFact('每次正式交付的原约定期限', '${flow.terms['acceptance_hours']} 小时'),
      tradeFact('创意修改次数',
          '已用 ${flow.creativeChanges} / 原约定 ${project.data['specification']['revision_limit']} + 追加 ${flow.additionalChanges}'),
      appNotice('纠正原约定错误不扣创意修改次数；新增创作要求超出原范围时另报价、确认并付款。'),
      if (order != null)
        tradeButton(
            '核对原订单付款节点',
            busy
                ? null
                : () => open('/trade/record?recordId=${project.orderId}')),
    ]),
    if (r != null)
      tradeSection('本次正式交付与收讫', [
        tradeFact('具体版本', shortSupplyId(r['version_id'])),
        tradeFact(
            '文件实际读取',
            r['view_observed_at'] == null
                ? '尚无本次成功读取记录'
                : tradeDate(r['view_observed_at'])),
        tradeFact('明确收讫',
            r['started_at'] == null ? '尚未开始计时' : tradeDate(r['started_at'])),
        if (r['deadline_at'] != null)
          tradeFact('服务器记录的截止时间', tradeDate(r['deadline_at'])),
        appNotice(
            '须真实打开文件、确认交付通知已读，再明确收讫才开始计时。读取或播放失败请报文件问题。超过期限的处理会注明按原约定进行。'),
        tradeButton(
            '查看本次正式版本',
            busy
                ? null
                : () =>
                    open('/production/version?versionId=${r['version_id']}')),
      ]),
    tradeSection('售后与争议', [
      for (final c in flow.cases) ...[
        tradeFact(fulfillmentCaseKinds[c.data['kind']]!,
            c.status == 'OPEN' ? '处理中，制作暂停' : '已记录独立处理决定'),
        if (c.changeOrderId != null && buyer)
          tradeButton(
              '查看这次追加要求的独立订单',
              busy
                  ? null
                  : () => open('/trade/record?recordId=${c.changeOrderId}'),
              outline: true),
      ],
      if (flow.cases.isEmpty) supplyNote('原项目尚无问题记录。'),
      if (cancel != null) ...[
        tradeFact('独立核定保留费用', tradeMoney(cancel['retained_minor'])),
        tradeFact('应退款', tradeMoney(cancel['refund_minor'])),
        tradeFact('已核实实际退款', tradeMoney(cancel['actual_refunded_minor'])),
        appNotice('应退金额和渠道处理中都不等于钱已退回。原单与追加订单分别核对，迟到收款仍需重新核对。'),
      ],
      tradeButton(
          '查看处理记录与补充问题',
          busy
              ? null
              : () => open('/production/aftercare?projectId=${project.id}'),
          outline: true),
      ExpansionTile(title: const Text('原订单取消约定'), children: [
        SelectableText(flow.terms['cancellation_terms'],
            style: const TextStyle(height: 1.7))
      ]),
      if (!buyer)
        appNotice('开工、重发正式通知、追加订单恢复及独立处理请由对应受派人或审核人在网页工作台办理。这里显示实际项目状态。'),
    ]),
  ];
}

class ProductionStoryPage extends StatelessWidget {
  const ProductionStoryPage({super.key, required this.projectId});
  final String projectId;
  @override
  Widget build(BuildContext context) => ProductionGate(
      returnRoute: '/production/story?projectId=$projectId',
      builder: (s) => _Story(session: s, projectId: projectId));
}

class _Story extends StatefulWidget {
  const _Story({required this.session, required this.projectId});
  final AccountSession session;
  final String projectId;
  @override
  State<_Story> createState() => _StoryState();
}

class _StoryState extends State<_Story> {
  ProductionStory? story;
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
      story = null;
      error = null;
    });
    try {
      final api = ProductionApi(widget.session),
          p = await api.record(widget.projectId, kind: 'PROJECT');
      final f = await api.fulfillment(p), result = await api.story(p, f);
      if (mounted && t == ticket) setState(() => story = result);
    } on AccountError catch (e) {
      if (mounted && t == ticket) setState(() => error = productionError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(context, '订单固定的原故事', [
        tradeHeading('故事的原稿', eyebrow: '本单正式提交 / 私人资料'),
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!, icon: Icons.error_outline),
        if (story != null) ...[
          appNotice('只读保存本单采用的正式故事。重新修改需求不会覆盖这里的原约定。'),
          tradeFact('正式提交', shortSupplyId(story!.raw['submission_id'])),
          for (final field in story!.template.fields)
            tradeSection(field.label, [
              SelectableText(
                  story!.answers[field.key]?.isNotEmpty == true
                      ? story!.answers[field.key]!
                      : '（本版未填写）',
                  style: const TextStyle(fontSize: 16, height: 1.8))
            ]),
        ],
        tradeButton('重新核对原故事', busy ? null : load, outline: true),
      ]);
}

class ProductionAftercarePage extends StatelessWidget {
  const ProductionAftercarePage(
      {super.key, required this.projectId, this.kind});
  final String projectId;
  final String? kind;
  @override
  Widget build(BuildContext context) => ProductionGate(
      returnRoute: '/production/aftercare?projectId=$projectId',
      builder: (s) => _Aftercare(session: s, projectId: projectId, kind: kind));
}

class _Aftercare extends StatefulWidget {
  const _Aftercare({required this.session, required this.projectId, this.kind});
  final AccountSession session;
  final String projectId;
  final String? kind;
  @override
  State<_Aftercare> createState() => _AftercareState();
}

class _AftercareState extends State<_Aftercare> {
  late final api = ProductionApi(widget.session),
      supply = SupplyApi(widget.session);
  ProductionRecord? project;
  ProductionFulfillment? flow;
  final reason = TextEditingController();
  List<String> files = [];
  late String kind = fulfillmentCaseKinds.containsKey(widget.kind)
      ? widget.kind!
      : 'PLATFORM_CORRECTION';
  bool busy = false,
      fileBusy = false,
      conflict = false,
      adopt = false,
      reread = false,
      dirty = false;
  String? error, notice;
  int ticket = 0;
  String get path => api.fulfillmentPath(widget.projectId, 'cases');
  Map<String, dynamic>? get pending => api.pending(path);
  Map<String, dynamic>? get uploadPending =>
      supply.pending('/api/v1/supply/assets');
  bool get locked =>
      busy || fileBusy || pending != null || uploadPending != null;
  bool get owner =>
      project != null &&
      widget.session.isOwner &&
      [project!.data['buyer_party_id'], project!.data['merchant_party_id']]
          .contains(widget.session.partyId);
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    ticket++;
    reason.dispose();
    super.dispose();
  }

  Future<void> load() async {
    final t = ++ticket;
    setState(() {
      busy = true;
      error = null;
      project = null;
      flow = null;
    });
    try {
      final p = await api.record(widget.projectId, kind: 'PROJECT'),
          f = await api.fulfillment(p);
      if (!mounted || t != ticket) return;
      final original = pending;
      if (original != null) {
        reason.text = original['body']['reason'];
        kind = original['body']['kind'];
        files = List<String>.from(original['body']['evidence_asset_ids']);
      }
      setState(() {
        project = p;
        flow = f;
      });
    } on AccountError catch (e) {
      if (mounted && t == ticket) setState(() => error = productionError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> upload() async {
    final epoch = widget.session.epoch, party = api.participant();
    setState(() {
      fileBusy = true;
      error = null;
    });
    try {
      final original = uploadPending;
      if (original != null &&
          (original['query']['purpose'] != 'REVIEW_EVIDENCE' ||
              [
                'UPLOAD_RECONCILIATION_REQUIRED',
                'ASSET_UPLOAD_RECONCILIATION_REQUIRED'
              ].contains(original['code']))) {
        throw const AccountError(409, 'UPLOAD_RECONCILIATION_REQUIRED');
      }
      Uint8List bytes;
      String media;
      if (original != null) {
        bytes = original['bytes'];
        media = original['query']['media_type'];
      } else {
        FocusManager.instance.primaryFocus?.unfocus();
        await WidgetsBinding.instance.endOfFrame;
        api.check(epoch, party);
        if (!mounted) return;
        final selected = await FilePicker.pickFiles(
            type: FileType.custom,
            allowedExtensions: supplyMedia.keys.toList(),
            allowMultiple: false,
            withReadStream: true,
            withData: false);
        if (selected == null) return;
        api.check(epoch, party);
        if (!mounted) return;
        media =
            supplyMedia[selected.files.single.extension?.toLowerCase()] ?? '';
        if (media.isEmpty) {
          throw const AccountError(400, 'FILE_TYPE_UNSUPPORTED');
        }
        bytes = await supplyPickedBytes(selected.files.single);
      }
      api.check(epoch, party);
      if (!mounted) return;
      final asset = await supply.upload(bytes, 'REVIEW_EVIDENCE', media);
      api.check(epoch, party);
      if (mounted) {
        setState(() {
          files = {...files, asset['id'] as String}.toList();
          dirty = true;
          notice = '私人问题证据已保存，尚未提交问题。';
        });
      }
    } on AccountError catch (e) {
      if (mounted) {
        setState(() => error = e.code == 'UPLOAD_RECONCILIATION_REQUIRED'
            ? '上次材料上传结果需平台核实，请先恢复原材料或联系平台；不能换文件重传。'
            : productionError(e, writing: true));
      }
    } catch (_) {
      if (mounted) setState(() => error = '文件选择未完成，请重新核对。');
    } finally {
      if (mounted) setState(() => fileBusy = false);
    }
  }

  Future<void> submit() async {
    final p = project, f = flow;
    if (p == null || f == null || busy) return;
    if (!await tradeConfirm(context, pending == null ? '提交原项目问题' : '恢复原问题请求', [
      tradeFact('原项目', shortSupplyId(p.id)),
      tradeFact('问题类型', fulfillmentCaseKinds[kind]),
      tradeFact('说明', reason.text.trim()),
      const Text('问题会留在原项目并暂停制作；取消、保留费用和应退金额由独立岗位核定，不直接操作退款渠道。')
    ])) {
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (pending != null) {
        await api.retryFulfillment(p, path);
      } else {
        await api.changeFulfillment(p, f, 'cases', {
          'kind': kind,
          'reason': reason.text.trim(),
          'evidence_asset_ids': files
        });
      }
      if (!mounted) return;
      dirty = false;
      conflict = false;
      adopt = false;
      reason.clear();
      files = [];
      await load();
      if (mounted) setState(() => notice = '问题已提交，请按原项目核对独立处理进度。');
    } on AccountError catch (e) {
      if (!mounted) return;
      if (e.status == 412) {
        conflict = true;
        adopt = false;
        reread = false;
      }
      setState(() => error = productionError(e, writing: true));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> syncRefund() async {
    final p = project, f = flow;
    if (p == null || f == null || busy) return;
    final syncPath = api.fulfillmentPath(p.id, 'refund-sync');
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (api.pending(syncPath) != null) {
        await api.retryFulfillment(p, syncPath);
      } else {
        await api.changeFulfillment(p, f, 'refund-sync', {});
      }
      if (mounted) await load();
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          conflict = e.status == 412;
          error = productionError(e, writing: true);
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> download(FulfillmentCase issue, String id) async {
    final p = project;
    if (p == null) return;
    setState(() {
      fileBusy = true;
      error = null;
    });
    final epoch = widget.session.epoch, party = api.participant();
    try {
      final bytes = await api.caseEvidence(p, issue, id);
      api.check(epoch, party);
      if (!mounted) return;
      final saved =
          await FilePicker.saveFile(fileName: '$id.bin', bytes: bytes);
      api.check(epoch, party);
      if (mounted) {
        setState(() => notice = kIsWeb
            ? '本次获准证据已交给浏览器保存。'
            : saved == null
                ? '已取消保存。'
                : '证据已保存。');
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = productionError(e));
    } finally {
      if (mounted) setState(() => fileBusy = false);
    }
  }

  Future<void> back() async {
    if (locked || widget.session.productionPending.isNotEmpty) {
      setState(() => error = '办理结果尚未确认，请先恢复原请求核对。');
      return;
    }
    if (dirty &&
        !await tradeConfirm(context, '离开尚未提交的问题',
            [const Text('问题说明尚未提交。已上传的私有证据不因此公开。确认后离开此页。')])) {
      return;
    }
    if (!mounted) return;
    setState(() => dirty = false);
    if (Navigator.canPop(context)) {
      Navigator.pop(context);
    } else {
      Navigator.pushReplacementNamed(
          context, '/production/project?projectId=${widget.projectId}');
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
      listenable: reason,
      builder: (context, _) {
        final f = flow, cancel = f?.cancellation;
        final allow = owner &&
            f != null &&
            f.cancellation == null &&
            !f.cases.any((c) => c.status == 'OPEN');
        return PopScope(
            canPop: !dirty && !locked,
            onPopInvokedWithResult: (didPop, _) {
              if (!didPop) back();
            },
            child: tradeScaffold(
                context,
                '售后与争议',
                [
                  tradeHeading('售后与争议', eyebrow: '原项目 / 独立处理'),
                  if (busy || fileBusy) const LinearProgressIndicator(),
                  if (error != null)
                    appNotice(error!, icon: Icons.error_outline),
                  if (notice != null) appNotice(notice!),
                  if (f != null) ...[
                    tradeBanner(fulfillmentStates[f.state]!,
                        '取消审核、应退款、渠道处理中与已核实退款分别记录。',
                        icon: Icons.support_agent),
                    for (final issue in f.cases)
                      tradeSection(fulfillmentCaseKinds[issue.data['kind']]!, [
                        tradeFact('当前进度',
                            issue.status == 'OPEN' ? '平台正在核对材料' : '独立决定已记录'),
                        SelectableText(issue.data['reason'],
                            style: const TextStyle(height: 1.7)),
                        tradeFact('提交时间', tradeDate(issue.data['opened_at'])),
                        if (issue.data['resolution'] != null) ...[
                          tradeFact(
                              '独立处理决定',
                              {
                                'RESUME': '恢复原制作',
                                'CANCEL': '取消委托并核对退款',
                                'CHANGE_ORDER': '依已付款的追加订单恢复'
                              }[issue.data['resolution']['decision']]),
                          SelectableText(issue.data['resolution']['reason'],
                              style: const TextStyle(height: 1.7)),
                        ],
                        if (issue.changeOrderId != null && owner)
                          tradeButton(
                              '查看独立追加订单',
                              locked
                                  ? null
                                  : () => Navigator.pushNamed(context,
                                      '/trade/record?recordId=${issue.changeOrderId}'),
                              outline: true),
                        if (issue.data['opened_by_party_id'] ==
                            widget.session.partyId)
                          for (final id in issue.data['evidence_asset_ids'])
                            tradeButton('读取本人提交的证据 ${shortSupplyId(id)}',
                                locked ? null : () => download(issue, id),
                                outline: true),
                        if (issue.data['opened_by_party_id'] !=
                                widget.session.partyId &&
                            issue.data['evidence_asset_ids'].isNotEmpty)
                          appNotice('对方私人证据由提交方与独立审核岗位读取，项目可见不等于证据可见。'),
                      ]),
                    if (cancel != null)
                      tradeSection('取消与实际退款', [
                        tradeFact(
                            '当时核实收款', tradeMoney(cancel['received_minor'])),
                        tradeFact(
                            '独立核定保留', tradeMoney(cancel['retained_minor'])),
                        tradeFact('应退款', tradeMoney(cancel['refund_minor'])),
                        tradeFact('已核实实际退款',
                            tradeMoney(cancel['actual_refunded_minor'])),
                        appNotice(
                            '这里只核对原项目收退款账，不执行退款。追加订单另行核对，迟到收款也可能增加应核对金额。'),
                        tradeButton('核对原项目实际收退款', busy ? null : syncRefund,
                            outline: true),
                        if (owner)
                          tradeButton(
                              '查看原订单与退款记录',
                              locked
                                  ? null
                                  : () => Navigator.pushNamed(context,
                                      '/trade/record?recordId=${f.orderId}')),
                      ]),
                    if (f.cases.isEmpty) appNotice('暂无已提交问题。说明和证据会留在这笔原项目。'),
                    if (allow || pending != null)
                      tradeSection('提交问题与材料', [
                        DropdownButtonFormField<String>(
                            initialValue: kind,
                            isExpanded: true,
                            decoration:
                                const InputDecoration(labelText: '问题类型'),
                            items: [
                              for (final e in fulfillmentCaseKinds.entries)
                                DropdownMenuItem(
                                    value: e.key, child: Text(e.value))
                            ],
                            onChanged: locked
                                ? null
                                : (v) => setState(() {
                                      kind = v!;
                                      dirty = true;
                                    })),
                        const SizedBox(height: 18),
                        TextField(
                            controller: reason,
                            enabled: !locked,
                            minLines: 4,
                            maxLines: 8,
                            maxLength: 4000,
                            onChanged: (_) => dirty = true,
                            decoration: const InputDecoration(
                                labelText: '问题说明 · 必填',
                                hintText: '说明具体版本、原约定与实际问题。')),
                        for (final id in files)
                          Row(children: [
                            Expanded(child: Text('私有证据 ${shortSupplyId(id)}')),
                            TextButton(
                                onPressed: locked
                                    ? null
                                    : () => setState(() {
                                          files.remove(id);
                                          dirty = true;
                                        }),
                                child: const Text('移除引用'))
                          ]),
                        tradeButton(
                            uploadPending == null ? '上传本人问题证据' : '恢复原文件并核对',
                            busy ||
                                    fileBusy ||
                                    pending != null ||
                                    files.length >= 20
                                ? null
                                : upload,
                            outline: true),
                        appNotice(
                            'PDF、TXT、图片、音视频等私有证据每份不超过8 MiB。纠错不扣创意次数；新增创作要求另报价，原价格与合同不会改写。'),
                        if (conflict) ...[
                          appNotice('项目有更新，说明和材料仍保留。先读取当前状态，再明确采用最新版本提交。'),
                          tradeButton(
                              '读取最新状态并保留输入',
                              busy
                                  ? null
                                  : () async {
                                      await load();
                                      if (mounted) {
                                        setState(() {
                                          adopt = false;
                                          reread = flow != null;
                                        });
                                      }
                                    },
                              outline: true),
                          CheckboxListTile(
                              contentPadding: EdgeInsets.zero,
                              value: adopt,
                              title: const Text('我已核对最新项目，沿用本页说明办理'),
                              onChanged: busy || !reread
                                  ? null
                                  : (v) => setState(() => adopt = v == true)),
                        ],
                        if (pending != null)
                          appNotice('上次问题结果未知。只能以原说明、原材料、原版本与原请求编号恢复核对。'),
                      ])
                    else
                      appNotice('已有未解决问题或取消决定。新的问题请先由平台核对原记录；受派和独审操作在网页工作台办理。'),
                  ],
                  tradeButton('重新读取处理记录', locked ? null : load, outline: true),
                ],
                locked: locked,
                onBack: back,
                footer: pending != null
                    ? tradeButton('恢复原问题请求核对', busy ? null : submit)
                    : allow
                        ? tradeButton(
                            '提交原项目问题',
                            locked ||
                                    reason.text.trim().isEmpty ||
                                    conflict && !adopt
                                ? null
                                : submit)
                        : null));
      });
}
