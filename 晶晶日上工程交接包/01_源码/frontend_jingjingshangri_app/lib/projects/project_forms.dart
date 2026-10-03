import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_models.dart';
import '../trade/trade_widgets.dart';
import 'project_api.dart';
import 'project_models.dart';
import 'project_widgets.dart';

class ProjectFormPage extends StatelessWidget {
  const ProjectFormPage(
      {super.key, required this.mode, required this.id, this.priorId});
  final String mode, id;
  final String? priorId;
  @override
  Widget build(BuildContext context) => ProjectsGate(
      returnRoute: mode == 'APPLY'
          ? '/projects/apply?roleId=$id'
          : mode == 'INVITATION'
              ? '/projects/invitation?candidateId=$id'
              : mode == 'RELEASE'
                  ? '/projects/release/new?projectId=$id${priorId == null ? '' : '&priorId=$priorId'}'
                  : '/projects/external/new?releaseId=$id',
      builder: (s) =>
          _ProjectForm(session: s, mode: mode, id: id, priorId: priorId));
}

class _ProjectForm extends StatefulWidget {
  const _ProjectForm(
      {required this.session,
      required this.mode,
      required this.id,
      this.priorId});
  final AccountSession session;
  final String mode, id;
  final String? priorId;
  @override
  State<_ProjectForm> createState() => _ProjectFormState();
}

class _ProjectFormState extends State<_ProjectForm> {
  late final api = ProjectsApi(widget.session);
  late final supply = SupplyApi(widget.session);
  ProjectRecord? target, project, prior;
  Map<String, dynamic>? publicProject, role;
  List<Map<String, dynamic>> avatars = [], consents = [], channels = [];
  List<String> assets = [];
  String? avatar, consent, channel, outcome, error;
  DateTime? occurred;
  bool busy = false;
  final amount = TextEditingController(),
      note = TextEditingController(),
      reference = TextEditingController();
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    amount.dispose();
    note.dispose();
    reference.dispose();
    super.dispose();
  }

  String? get path => widget.mode == 'APPLY'
      ? '/api/v1/projects/roles/${widget.id}/applications'
      : widget.mode == 'INVITATION'
          ? '/api/v1/projects/candidates/${widget.id}/responses'
          : widget.mode == 'RELEASE'
              ? '/api/v1/projects/projects/${widget.id}/releases'
              : '/api/v1/projects/releases/${widget.id}/external-events';
  bool get locked =>
      busy ||
      widget.session.projectsPending.isNotEmpty ||
      supply.pending('/api/v1/supply/assets') != null;
  Map<String, dynamic>? get scope =>
      publicProject?['scope'] ?? project?.data['scope'];
  List<Map<String, dynamic>> get eligibleConsents => scope == null ||
          avatar == null
      ? []
      : consents
          .where((c) => projectConsentEligible(c, avatar!, scope!))
          .toList();
  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
      target = null;
      project = null;
      publicProject = null;
      role = null;
      prior = null;
      avatars = [];
      consents = [];
      channels = [];
      avatar = null;
      consent = null;
      channel = null;
      outcome = null;
      occurred = null;
      assets = [];
      amount.clear();
      note.clear();
      reference.clear();
    });
    try {
      if (widget.mode == 'APPLY') {
        final c = await api.catalogue();
        for (final p in c.items.where((p) => p['kind'] == 'PROJECT')) {
          for (final r in p['roles']) {
            if (r['id'] == widget.id) {
              publicProject = p;
              role = projectMap(r);
            }
          }
        }
        if (role == null) throw const AccountError(409, 'ROLE_NOT_OPEN');
      } else {
        target = await api.record(widget.id,
            kind: widget.mode == 'INVITATION'
                ? 'CANDIDATE'
                : widget.mode == 'RELEASE'
                    ? 'PROJECT'
                    : 'RELEASE');
        project = target!.kind == 'PROJECT'
            ? target
            : await api.record(target!.projectId!, kind: 'PROJECT');
        if (widget.mode == 'INVITATION') {
          if (target!.owner != api.owner() || target!.status != 'INVITED') {
            throw const AccountError(409, 'INVITATION_NOT_PENDING');
          }
          final r = await api.record(target!.data['role_id'], kind: 'ROLE');
          role = {'id': r.id, 'object_version': r.version, ...r.data};
        } else if (project!.owner != api.owner()) {
          throw const AccountError(403, 'PROJECT_PARTY_FORBIDDEN');
        }
      }
      if (['APPLY', 'INVITATION'].contains(widget.mode)) {
        avatars = await api.supplyChoices('AVATAR');
        consents = await api.supplyChoices('CONSENT');
        if (role!['pricing'] == 'FIXED') {
          amount.text = tradeMoney(role!['amount_minor'])
              .replaceFirst('¥', '')
              .replaceAll(',', '');
        }
      }
      if (widget.mode == 'RELEASE') {
        channels = (await api.catalogue())
            .items
            .where((v) => v['kind'] == 'CHANNEL')
            .toList();
        if (widget.priorId != null) {
          prior = await api.record(widget.priorId!, kind: 'RELEASE');
          if (prior!.projectId != project!.id ||
              ![
                'CHANGES_REQUESTED',
                'REJECTED',
                'EXTERNAL_CHANGES_REQUESTED',
                'EXTERNAL_REJECTED',
                'EXTERNAL_WITHDRAWN'
              ].contains(prior!.status)) {
            throw const AccountError(409, 'INVALID_RELEASE_PREDECESSOR');
          }
          channel = prior!.data['channel_id'];
        }
      }
      if (!mounted) return;
      setState(() {});
    } on AccountError catch (e) {
      if (mounted) setState(() => error = projectError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  int? get money => projectParseYuan(amount.text);
  bool get canSubmit =>
      !locked &&
      note.text.trim().isNotEmpty &&
      (['APPLY', 'INVITATION'].contains(widget.mode)
          ? role != null &&
              avatar != null &&
              consent != null &&
              eligibleConsents.any((c) => c['id'] == consent) &&
              money != null &&
              (role!['pricing'] != 'FIXED' || money == role!['amount_minor'])
          : widget.mode == 'RELEASE'
              ? project?.status == 'STARTED' &&
                  project?.data['current_edition_id'] != null &&
                  channel != null &&
                  channels.any((c) => c['id'] == channel) &&
                  assets.isNotEmpty
              : target != null &&
                  outcome != null &&
                  reference.text.trim().isNotEmpty &&
                  occurred != null &&
                  !occurred!.isAfter(DateTime.now()) &&
                  assets.length == 1);
  Future<void> submit({bool decline = false, bool retry = false}) async {
    if (!retry && (decline ? locked || note.text.trim().isEmpty : !canSubmit)) {
      return;
    }
    if (!retry &&
        !await tradeConfirm(
            context,
            decline
                ? '谢绝本次邀请'
                : widget.mode == 'APPLY'
                    ? '提交角色报名'
                    : widget.mode == 'INVITATION'
                        ? '接受邀请并报名'
                        : widget.mode == 'RELEASE'
                            ? '提交内部审核'
                            : '提交外部结果核验',
            [
              if (['APPLY', 'INVITATION'].contains(widget.mode) && !decline)
                tradeFact('本次明确报价', tradeMoney(money!)),
              projectParagraph(widget.mode == 'RELEASE'
                  ? '提交只进入内部审核，不能直接标记外部发行。'
                  : widget.mode == 'EXTERNAL'
                      ? '只登记实际发生的事实。凭据独立核验后发行进度才会更新。'
                      : '报名与本人最终入组确认分别办理。')
            ])) {
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final ProjectRecord r;
      if (retry) {
        r = await api.retry(path!);
      } else if (widget.mode == 'APPLY') {
        r = await api.apply(role!, {
          'avatar_id': avatar,
          'consent_id': consent,
          'amount_minor': money,
          'note': note.text.trim()
        });
      } else if (widget.mode == 'INVITATION') {
        r = await api.respond(target!, {
          'decision': decline ? 'DECLINE' : 'ACCEPT',
          'avatar_id': decline ? null : avatar,
          'consent_id': decline ? null : consent,
          'amount_minor': decline ? null : money,
          'note': note.text.trim()
        });
      } else if (widget.mode == 'RELEASE') {
        r = await api.write(
            path!,
            {
              'channel_id': channel,
              'prior_release_id': prior?.id,
              'material_asset_ids': List<String>.from(assets),
              'note': note.text.trim()
            },
            version: target!.version,
            kind: 'RELEASE');
      } else {
        r = await api.write(
            path!,
            {
              'outcome': outcome,
              'external_reference': reference.text.trim(),
              'occurred_at': occurred!.toUtc().toIso8601String(),
              'evidence_asset_id': assets.single,
              'note': note.text.trim()
            },
            version: target!.version,
            kind: 'EXTERNAL_EVENT');
      }
      if (!mounted) return;
      projectClearWarnings(context);
      Navigator.pushReplacementNamed(
          context, '/projects/record?recordId=${r.id}');
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

  List<Widget> casting() => [
        if (role != null)
          supplyCard('项目与角色', [
            projectHeading(publicProject?['title'] ?? project!.data['title']),
            projectScopeFacts(scope!),
            tradeFact('角色', role!['title']),
            projectParagraph(role!['terms']),
            if (widget.mode == 'INVITATION')
              appNotice('接受邀请仅进入报名状态；获选后仍需你最终确认入组。')
          ]),
        supplyCard('本人主体', [
          tradeFact('演员主体', shortSupplyId(api.owner())),
          supplyNote('数字人资料与同意须来自当前身份，并覆盖该项目的公开用途、地区及完整期间。私人同意不能替代。')
        ]),
        supplyCard('数字人资料', [
          projectSelect(
              '数字人资料',
              avatar,
              [
                for (final a in avatars)
                  (a['id'] as String, a['data']['display_name'] as String)
              ],
              locked
                  ? null
                  : (v) => setState(() {
                        avatar = v;
                        consent = null;
                      })),
          if (avatars.isEmpty) supplyNote('当前身份没有可选的已登记资料。请先在资料工作台办理真实记录。')
        ]),
        supplyCard('本人同意', [
          projectSelect(
              '本人同意',
              consent,
              [
                for (final c in eligibleConsents)
                  (
                    c['id'] as String,
                    '同意 · ${shortSupplyId(c['id'])} · ${(c['data']['consent']['features'] as List).map((f) => f == 'FACE' ? '脸部' : '声音').join('、')}'
                  )
              ],
              locked ? null : (v) => setState(() => consent = v)),
          if (eligibleConsents.isEmpty)
            supplyNote('请选择资料，并准备已审核、未到期且完整覆盖项目公开用途的本人同意。')
        ]),
        supplyCard('本次报价', [
          if (role?['pricing'] == 'FIXED')
            tradeFact('固定价', tradeMoney(role!['amount_minor'])),
          projectField(amount, '本次报价（元）',
              enabled: !locked && role?['pricing'] != 'FIXED',
              keyboard: const TextInputType.numberWithOptions(decimal: true),
              max: 16,
              changed: (_) => setState(() {})),
          supplyNote('金额精确到分。0 元也须有明确约定，未知报价不默认填写。')
        ]),
        supplyCard('申请说明', [
          projectField(note, '申请说明',
              lines: 3, enabled: !locked, changed: (_) => setState(() {}))
        ]),
        tradeButton(widget.mode == 'INVITATION' ? '接受邀请并报名' : '提交报名',
            canSubmit ? submit : null),
        if (widget.mode == 'INVITATION')
          tradeButton(
              '谢绝邀请',
              locked || note.text.trim().isEmpty
                  ? null
                  : () => submit(decline: true),
              outline: true)
      ];
  List<Widget> releasing() => [
        if (project != null)
          supplyCard('最终成片', [
            tradeFact('项目名称', project!.data['title']),
            tradeFact(
                '当前成片材料',
                project!.data['current_edition_id'] == null
                    ? '尚未建立'
                    : shortSupplyId(project!.data['current_edition_id'])),
            supplyNote('使用当前已审核且各方确认的成片材料版本。最终制作需已验收、付清且权利有效，提交时由服务器再次核对。')
          ]),
        supplyCard('发行渠道', [
          projectSelect(
              '发行渠道',
              channel,
              [
                for (final c in channels)
                  (c['id'] as String, c['title'] as String)
              ],
              locked || prior != null
                  ? null
                  : (v) => setState(() => channel = v)),
          if (channels.isEmpty) supplyNote('当前没有公开的已核验渠道摘要。'),
          if (channel != null && channels.any((c) => c['id'] == channel))
            tradeFact(
                '渠道参考',
                channels.firstWhere(
                    (c) => c['id'] == channel)['channel_reference']),
          supplyNote('目录只提供渠道摘要。请按实际获知的渠道要求准备材料，平台没有自动提交接入。')
        ]),
        supplyCard('上一申请', [
          tradeFact(
              '申请关联', prior == null ? '首次申请无上一记录' : shortSupplyId(prior!.id)),
          if (prior != null && prior!.data['review'] != null)
            projectParagraph(prior!.data['review']['reason']),
          supplyNote('补件与重提建立新记录，保留旧申请与意见。')
        ]),
        supplyCard('材料', [
          SupplyFiles(
              api: supply,
              purpose: 'REVIEW_EVIDENCE',
              ids: assets,
              enabled: !locked,
              onChanged: (ids) => setState(() => assets = ids))
        ]),
        supplyCard('说明', [
          projectField(note, '发行申请说明',
              lines: 3, enabled: !locked, changed: (_) => setState(() {}))
        ]),
        tradeButton('提交内部审核', canSubmit ? submit : null)
      ];
  Future<void> selectTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
        context: context,
        initialDate: occurred ?? now,
        firstDate: DateTime(2000),
        lastDate: now);
    if (date == null || !mounted) return;
    final time = await showTimePicker(
        context: context, initialTime: TimeOfDay.fromDateTime(occurred ?? now));
    if (time == null || !mounted) return;
    setState(() => occurred =
        DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  List<Widget> external() => [
        if (target != null)
          supplyCard('本次发行申请', [
            tradeFact('项目名称', project!.data['title']),
            tradeFact('发行申请', shortSupplyId(target!.id)),
            tradeFact('当前渠道进度', projectStatuses[target!.status])
          ]),
        projectParagraph('登记实际发生的事实，提交后将进入独立核验流程。'),
        supplyCard('真实结果', [
          projectSelect(
              '真实结果',
              outcome,
              [for (final e in projectOutcomes.entries) (e.key, e.value)],
              locked ? null : (v) => setState(() => outcome = v))
        ]),
        supplyCard('外部编号', [
          projectField(reference, '外部编号',
              max: 1000, enabled: !locked, changed: (_) => setState(() {}))
        ]),
        supplyCard('发生时间', [
          tradeButton(
              occurred == null
                  ? '选择实际发生时间'
                  : '发生时间：${occurred!.toLocal().toString().substring(0, 16)}',
              locked ? null : selectTime,
              outline: true),
          supplyNote('请填写真实发生的日期和时间，不可填写未来时间。')
        ]),
        supplyCard('凭据', [
          SupplyFiles(
              api: supply,
              purpose: 'REVIEW_EVIDENCE',
              ids: assets,
              single: true,
              enabled: !locked,
              onChanged: (ids) => setState(() => assets = ids))
        ]),
        supplyCard('说明', [
          projectField(note, '外部结果说明',
              lines: 3,
              max: 4000,
              enabled: !locked,
              changed: (_) => setState(() {}))
        ]),
        appNotice('审核人员核实凭据后，发行进度才会更新。登记“已发行”不表示现在已经通过核实。'),
        tradeButton('提交结果核验', canSubmit ? submit : null)
      ];
  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      {
        'APPLY': '申请角色',
        'INVITATION': '回应角色邀请',
        'RELEASE': '提交发行材料',
        'EXTERNAL': '登记外部结果'
      }[widget.mode]!,
      [
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!, icon: Icons.error_outline),
        if (path != null && api.pending(path!) != null)
          supplyCard('原请求结果待核实', [
            supplyNote('原内容、版本及请求编号已保留，请先恢复核对。'),
            tradeButton('恢复原请求核对', busy ? null : () => submit(retry: true))
          ]),
        if (!busy)
          ...(['APPLY', 'INVITATION'].contains(widget.mode)
              ? casting()
              : widget.mode == 'RELEASE'
                  ? releasing()
                  : external()),
        if (error != null)
          tradeButton('重新读取', locked ? null : load, outline: true)
      ],
      locked: locked);
}
