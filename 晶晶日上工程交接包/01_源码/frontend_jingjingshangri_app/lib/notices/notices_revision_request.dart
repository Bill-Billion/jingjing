import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../stock/v5_support.dart';
import '../trade/trade_widgets.dart';
import 'notices_api.dart';
import 'notices_models.dart';

class NoticeRevisionRequestPage extends StatelessWidget {
  const NoticeRevisionRequestPage({super.key, required this.recordId});
  final String recordId;
  @override
  Widget build(BuildContext context) => V5Gate(
      domain: 'notices', showExpired: true, expiredLabel: '通告修改申请',
      route: Uri(path: '/notices/revision-request',
          queryParameters: {'recordId': recordId}).toString(),
      builder: (session) => _RevisionRequest(session: session, id: recordId));
}

class _RevisionApi extends NoticesApi {
  _RevisionApi(AccountSession session, this.id, this.onInvalid) : super(session);
  final String id;
  final void Function(AccountError) onInvalid;
  @override
  Future<T> post<T>(String suffix, Map<String, dynamic> body,
      T Function(Map<String, dynamic>) parse, {int? version}) async {
    try {
      return await super.post(suffix, body, (value) {
        if (suffix == '/announcements/$id/revisions') {
          v5Require(version != null);
          NoticeRevisionResponse(value, id, owner(), version: version!, body: body);
        }
        return parse(value);
      }, version: version);
    } on AccountError catch (e) {
      if (suffix == '/announcements/$id/revisions' &&
          (e.status == 412 || [401, 403, 404].contains(e.status) ||
           ['NOTICE_REVISION_SCOPE_INVALID', 'NOTICE_NOT_OPEN',
            'NOTICE_PERIOD_INVALID', 'NOTICE_PUBLISHER_NOT_ELIGIBLE'].contains(e.code))) {
        onInvalid(e);
      }
      rethrow;
    }
  }
}

class _RevisionRequest extends StatefulWidget {
  const _RevisionRequest({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_RevisionRequest> createState() => _RevisionRequestState();
}

class _RevisionRequestState extends State<_RevisionRequest> {
  late final api = _RevisionApi(widget.session, widget.id, invalidate);
  String get suffix => '/announcements/${widget.id}/revisions';
  GlobalKey<V5FormState> formKey = GlobalKey<V5FormState>();
  NoticeRecord? source;
  bool busy = false, stale = false;
  String? error;
  int ticket = 0;
  late (int, String?, bool) identity;
  (int, String?, bool) get currentIdentity =>
      (widget.session.epoch, widget.session.partyId, api.denied);

  @override
  void initState() {
    super.initState();
    identity = currentIdentity;
    widget.session.addListener(identityChanged);
    refresh(initial: true);
  }
  void identityChanged() {
    if (identity == currentIdentity) return;
    identity = currentIdentity;
    ticket++;
    if (mounted) setState(() {
      source = null; busy = false; stale = true;
      error = '身份或权限已变化，原私有内容已清空。';
    });
  }
  bool owns(NoticeRecord record) => record.kind == 'NOTICE' &&
      record.id == widget.id && record.raw['parent_id'] == null &&
      record.raw['owner_party_id'] == widget.session.partyId;

  Future<NoticeRecord> readSource(int request, int epoch, String? party) async {
    final value = await api.record(widget.id);
    if (!mounted || request != ticket) throw const AccountError(0, 'CONTEXT_CHANGED');
    api.check(epoch, party);
    v5Require(owns(value));
    return value;
  }

  void invalidate(AccountError failure) {
    if (!mounted) return;
    formKey.currentState?.change('reviewed_base', false);
    setState(() {
      stale = true;
      error = '原基线或资格已失效，确认已撤销，未自动更新版本。草稿保留在本页；请核对后选择放弃草稿并重读。';
      if ([401, 403, 404].contains(failure.status)) source = null;
    });
  }

  Future<void> refresh({bool initial = false}) async {
    if (busy || !initial && (api.pending(suffix) != null ||
        formKey.currentState?.busy == true)) return;
    if (!initial) {
      final request = ticket, epoch = widget.session.epoch, party = widget.session.partyId;
      if (!await (formKey.currentState?.confirmDiscardChanges() ?? Future.value(true))) return;
      if (!mounted || request != ticket) return;
      api.check(epoch, party);
    }
    final request = ++ticket, epoch = widget.session.epoch, party = widget.session.partyId;
    setState(() { busy = true; source = null; stale = true; error = null; });
    try {
      final value = await readSource(request, epoch, party);
      if (!mounted || request != ticket) return;
      api.check(epoch, party);
      setState(() { source = value; stale = false; formKey = GlobalKey<V5FormState>(); });
    } on AccountError catch (e) {
      if (mounted && request == ticket) setState(() { source = null; error = v5Error(e); });
    } catch (_) {
      if (mounted && request == ticket) setState(() { source = null; error = '未能核对原通告，私有内容已清空。'; });
    } finally {
      if (mounted && request == ticket) setState(() => busy = false);
    }
  }

  Future<int?> reloadForm() async {
    if (api.pending(suffix) != null) {
      // Access/ownership only: new-write status and date rules do not gate replay.
      await readSource(ticket, widget.session.epoch, widget.session.partyId);
      return null;
    }
    // Shared latest must not transplant the old draft onto a newer If-Match.
    invalidate(const AccountError(412, 'NOTICE_REVISION_SCOPE_INVALID'));
    return source?.version;
  }

  Future<void> verifyFrozen(NoticeRecord frozen) async {
    final value = await readSource(ticket, widget.session.epoch, widget.session.partyId);
    if (value.version != frozen.version || value.status != 'PUBLISHED') {
      const failure = AccountError(412, 'NOTICE_REVISION_SCOPE_INVALID');
      invalidate(failure);
      throw failure;
    }
  }

  String preservedDate(dynamic value, dynamic original) =>
      '$value' == v5LocalDate(original) ? original as String : v5InputDate(value);

  String get historyRoute => Uri(path: '/notices/history', queryParameters: {
    'noticeId': widget.id, 'sourceRecordId': widget.id,
  }).toString();

  @override
  void dispose() {
    ticket++;
    widget.session.removeListener(identityChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(animation: api,
      builder: (context, _) => content(context));

  Widget content(BuildContext context) {
    final frozen = source, pending = api.pending(suffix);
    final n = frozen == null ? null : v5Map(frozen.data['notice']);
    final type = n?['type'];
    final editable = frozen != null && frozen.status == 'PUBLISHED' &&
        type != 'OFFICIAL';
    return V5Frame(api: api, title: '已发布通告修改申请', children: [
      tradeHeading('提交修改申请', eyebrow: '原发布者 / 独立审核', fontSize: 24),
      appNotice('提交后生成独立待审修订，不直接更改公开通告。审核批准前继续使用原公开版本，不自动变更投稿依据或合同。'),
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!),
      if (frozen == null || type == 'OFFICIAL')
        V5RecoveryPanel(api: api,
            label: (path) => path == api.path(suffix) ? api.recoveryLabel(path) : null,
            restore: api.restoreOperation,
            onRestored: (_) => Navigator.pushReplacementNamed(context, historyRoute)),
      if (frozen != null && n != null && type != 'OFFICIAL') ...[
        tradeSection('冻结的原通告', [
          tradeFact('原通告编号', frozen.id),
          tradeFact('原通告版本', frozen.version),
          tradeFact('类型（不可修改）', noticeTypes[type]),
          tradeFact('关联项目（不可修改）', n['project_id'] ?? '未关联项目'),
          tradeFact('原标题', n['title']),
          tradeFact('原城市', n['city']),
          tradeFact('原开始时间', n['valid_from']),
          tradeFact('原截止时间', n['valid_until']),
          SelectableText(n['description']),
          for (final e in noticeDetailFields[type]!.entries)
            tradeFact(e.value, v5Map(n['details'])[e.key]),
          tradeFact('原接受投稿', n['accept_submissions'] == true ? '是' : '否'),
        ]),
        if (!editable) appNotice('当前状态不能新建修改申请。结果未知的原请求仍可按原版本恢复。'),
        if (pending != null) appNotice('本页仅恢复原请求的正文、原因、版本和请求标识，不采用当前输入或新版本。'),
        V5Form(key: formKey, api: api, title: '拟修改内容',
            action: '提交独立修改申请', suffix: suffix, version: frozen.version,
            canSubmit: !busy && !stale && editable && pending == null,
            initial: {...n, ...v5Map(n['details']), 'reviewed_base': false},
            restore: (body) => {...v5Map(body['notice']),
              ...v5Map(v5Map(body['notice'])['details']),
              'reason': body['reason'], 'reviewed_base': false},
            fields: [
              const V5Field('title', '通告标题'),
              const V5Field('city', '发生城市'),
              const V5Field('valid_from', '开始时间', type: 'datetime'),
              const V5Field('valid_until', '截止时间', type: 'datetime'),
              const V5Field('description', '通告内容与合作要求', type: 'multiline'),
              for (final e in noticeDetailFields[type]!.entries)
                V5Field(e.key, e.value, type: 'multiline'),
              if (['DRAMA', 'RECRUITMENT'].contains(type))
                const V5Field('accept_submissions', '接受单向投稿', type: 'bool', required: false),
              const V5Field('reason', '修改原因', type: 'multiline'),
              const V5Field('reviewed_base', '我已核对原版本与拟修改内容，理解需独立审核且不会立即改动公开内容', type: 'bool'),
            ],
            facts: [
              tradeFact('冻结原版本', frozen.version),
              tradeFact('锁定类型', noticeTypes[type]),
              tradeFact('锁定项目', n['project_id'] ?? '未关联项目'),
              const Text('日期未编辑时保留原始秒及毫秒；编辑后按本机本地时间转换UTC。'),
            ],
            buildBody: (values) {
              if (stale || values['reviewed_base'] != true) {
                throw const FormatException('请核对冻结基线并明确勾选。');
              }
              final start = preservedDate(values['valid_from'], n['valid_from']);
              final end = preservedDate(values['valid_until'], n['valid_until']);
              if (!DateTime.parse(start).isBefore(DateTime.parse(end))) {
                throw const FormatException('开始时间须早于截止时间。');
              }
              return {'notice': {
                'type': type, 'project_id': n['project_id'],
                'title': values['title'], 'city': values['city'],
                'description': values['description'],
                'valid_from': start, 'valid_until': end,
                'details': {for (final k in noticeDetailFields[type]!.keys) k: values[k]},
                'accept_submissions': ['DRAMA', 'RECRUITMENT'].contains(type) &&
                    values['accept_submissions'] == true,
              }, 'reason': values['reason']};
            },
            beforeSubmit: (_) => verifyFrozen(frozen),
            reload: reloadForm,
            // _RevisionApi validates against the exact body/version being sent,
            // including op.body/op.version when restoring an unknown request.
            parse: (_) {},
            onSuccess: (_) => Navigator.pushReplacementNamed(context, historyRoute)),
      ],
      if (type == 'OFFICIAL') appNotice('普通主体页面不办理官方通告修改。'),
      tradeButton('放弃本页草稿并重新读取原通告',
          busy || pending != null || formKey.currentState?.busy == true ? null : refresh,
          outline: true),
    ]);
  }
}
