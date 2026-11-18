import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../stock/v5_support.dart';
import '../trade/trade_widgets.dart';
import 'notices_api.dart';
import 'notices_models.dart';

class NoticeConfirmationPage extends StatelessWidget {
  const NoticeConfirmationPage({super.key, required this.recordId});
  final String recordId;
  @override
  Widget build(BuildContext context) => V5Gate(
      domain: 'notices',
      route: Uri(path: '/notices/notice-confirmation',
          queryParameters: {'recordId': recordId}).toString(),
      showExpired: true, expiredLabel: '本人投稿新版确认',
      builder: (session) => _Confirmation(session: session, id: recordId));
}

// Only this panel observes definitive confirmation errors. Shared write/key
// machinery remains in V5Api and AccountApi, including uncertain retries.
class _ConfirmationApi extends NoticesApi {
  _ConfirmationApi(AccountSession session, this.target, this.onInvalid) : super(session);
  final String target;
  final void Function(AccountError) onInvalid;
  @override
  Future<T> post<T>(String suffix, Map<String, dynamic> body,
      T Function(Map<String, dynamic>) parse, {int? version}) async {
    try {
      return await super.post(suffix, body, parse, version: version);
    } on AccountError catch (e) {
      if (suffix == target && (e.status == 412 ||
          [401, 403, 404].contains(e.status) ||
          ['NOTICE_CONTENT_MISMATCH', 'NOTICE_CANNOT_CONFIRM',
           'NOTICE_SUBMISSION_EXPIRED', 'NOTICE_NOT_OPEN'].contains(e.code))) {
        onInvalid(e);
      }
      rethrow;
    }
  }
}

class _Confirmation extends StatefulWidget {
  const _Confirmation({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_Confirmation> createState() => _ConfirmationState();
}

class _ConfirmationState extends State<_Confirmation> {
  late final api = _ConfirmationApi(widget.session, suffix, invalidate);
  String get suffix => '/submissions/${widget.id}/notice-confirmation';
  GlobalKey<V5FormState> formKey = GlobalKey<V5FormState>();
  late (int, String?, bool) identity;
  (int, String?, bool) get currentIdentity =>
      (widget.session.epoch, widget.session.partyId, api.denied);
  NoticeRecord? source;
  NoticeHistorySnapshot? current;
  bool busy = false, stale = false;
  String? error, notice;
  int ticket = 0;

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
    if (!mounted) return;
    setState(() {
      source = null; current = null; busy = false; stale = true;
      error = '身份或权限已变化，原私有内容已清空。';
      notice = null;
    });
  }

  void invalidate(AccountError failure) {
    if (!mounted) return;
    formKey.currentState?.change('read', false);
    setState(() {
      stale = true;
      error = '当前确认上下文已失效，阅读勾选已撤销。请重新读取后再明确确认。';
      if ([401, 403, 404].contains(failure.status)) {
        source = null; current = null;
      }
    });
  }

  bool owns(NoticeRecord record) => record.kind == 'SUBMISSION' &&
      record.id == widget.id &&
      record.raw['owner_party_id'] == widget.session.partyId &&
      v5Id(record.data['submission']['notice_id']) &&
      record.raw['parent_id'] == record.data['submission']['notice_id'];

  Future<(NoticeRecord, NoticeHistorySnapshot)> readContext(
      int request, int epoch, String? party) async {
    final record = await api.record(widget.id);
    if (!mounted || request != ticket) throw const AccountError(0, 'CONTEXT_CHANGED');
    api.check(epoch, party);
    v5Require(owns(record));
    final page = await api.history(record.data['submission']['notice_id'],
        source: record);
    if (!mounted || request != ticket) throw const AccountError(0, 'CONTEXT_CHANGED');
    api.check(epoch, party);
    return (record, page.current);
  }

  Future<void> refresh({bool initial = false, bool afterSuccess = false}) async {
    // An existing unknown request owns its original context until restored.
    if (busy || !initial && api.pending(suffix) != null ||
        !afterSuccess && formKey.currentState?.busy == true) return;
    final request = ++ticket, epoch = widget.session.epoch,
        party = widget.session.partyId;
    setState(() {
      busy = true; error = null; stale = true;
      source = null; current = null;
    });
    try {
      final pair = await readContext(request, epoch, party);
      if (!mounted || request != ticket) return;
      api.check(epoch, party);
      setState(() {
        source = pair.$1; current = pair.$2; stale = false;
        formKey = GlobalKey<V5FormState>();
      });
    } on AccountError catch (e) {
      if (mounted && request == ticket) setState(() {
        source = null; current = null; stale = true; error = v5Error(e);
      });
    } catch (_) {
      if (mounted && request == ticket) setState(() {
        source = null; current = null; stale = true;
        error = '未能核对本人投稿与通告快照，内容已清空。';
      });
    } finally {
      if (mounted && request == ticket) setState(() => busy = false);
    }
  }

  Future<int?> reloadForm() async {
    if (api.pending(suffix) != null) {
      // Recovery checks access only. Never replace the pending body/version/key,
      // or require a new acknowledgement/current writable status.
      final request = ticket, epoch = widget.session.epoch,
          party = widget.session.partyId;
      final record = await api.record(widget.id);
      if (!mounted || request != ticket) throw const AccountError(0, 'CONTEXT_CHANGED');
      api.check(epoch, party);
      v5Require(owns(record));
      return null;
    }
    // V5Form.latest may be busy: replace BOTH objects, never just If-Match.
    await refresh(afterSuccess: true);
    return null;
  }

  Future<void> verifyFrozen(NoticeRecord frozen,
      NoticeHistorySnapshot snapshot) async {
    final request = ticket, epoch = widget.session.epoch,
        party = widget.session.partyId;
    final pair = await readContext(request, epoch, party);
    if (pair.$1.version != frozen.version || !pair.$2.sameAs(snapshot)) {
      const failure = AccountError(409, 'NOTICE_CONTENT_MISMATCH');
      invalidate(failure);
      throw failure;
    }
  }

  @override
  void dispose() {
    ticket++;
    widget.session.removeListener(identityChanged);
    super.dispose();
  }

  List<Widget> snapshotBody(NoticeHistorySnapshot snapshot) => [
    tradeFact('标题', snapshot.notice['title']),
    tradeFact('通告对象版本', snapshot.raw['object_version']),
    tradeFact('关联修订', snapshot.raw['revision_id'] ?? '未关联修订记录'),
    tradeFact('类型', noticeTypes[snapshot.notice['type']]),
    tradeFact('城市', snapshot.notice['city']),
    tradeFact('开始', tradeDate(snapshot.notice['valid_from'])),
    tradeFact('截止', tradeDate(snapshot.notice['valid_until'])),
    SelectableText(snapshot.notice['description']),
    for (final field in noticeDetailFields[snapshot.notice['type']]!.entries)
      tradeFact(field.value, v5Map(snapshot.notice['details'])[field.key]),
    tradeFact('接受投稿', snapshot.notice['accept_submissions'] == true ? '是' : '否'),
    tradeFact('通告编号', snapshot.raw['notice_id']),
    tradeFact('正文校验', snapshot.raw['notice_sha256']),
  ];

  bool matches(NoticeHistorySnapshot? snapshot, NoticeHistorySnapshot target) =>
      snapshot != null &&
      snapshot.raw['notice_id'] == target.raw['notice_id'] &&
      snapshot.raw['revision_id'] == target.raw['revision_id'] &&
      snapshot.raw['notice_sha256'] == target.raw['notice_sha256'];

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: api, builder: (context, _) => content(context));

  Widget content(BuildContext context) {
    final frozen = source, snapshot = current, pending = api.pending(suffix);
    final original = frozen?.originalNoticeSnapshot;
    final acknowledged = frozen?.acknowledgedNoticeSnapshot;
    final eligible = frozen != null &&
        ['IN_REVIEW', 'SENT', 'INTERESTED'].contains(frozen.status) &&
        DateTime.tryParse(frozen.data['expires_at'])?.isAfter(DateTime.now()) == true;
    final requestedBody = pending == null ? null : v5Map(pending['body']);
    return V5Frame(api: api, title: '本人投稿新版确认', children: [
      tradeHeading('阅读通告变化', eyebrow: '本人投稿 / 明确确认', fontSize: 24),
      appNotice('本次确认仅表示投稿继续依据所展示通告版本办理，不等于签约、录用、付款或新增肖像、声音、训练及商用权限。'),
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!),
      if (notice != null) appNotice(notice!),
      if (frozen == null || snapshot == null)
        V5RecoveryPanel(api: api,
            label: (path) => path == api.path(suffix) ? api.recoveryLabel(path) : null,
            restore: api.restoreOperation,
            onRestored: (_) async {
              notice = '原请求结果已核对，正在重新读取当前状态。';
              await refresh(afterSuccess: true);
            }),
      if (frozen != null && snapshot != null) ...[
        tradeFact('本人投稿版本', frozen.version),
        if (original == null)
          appNotice('旧记录未保存原投稿通告快照，不能用当前内容回填。')
        else tradeSection('原投稿依据', snapshotBody(original)),
        if (acknowledged != null)
          tradeSection('上次明确确认', snapshotBody(acknowledged))
        else appNotice('本投稿尚未保存明确确认的新版本记录。'),
        tradeSection('本次读取的当前通告', snapshotBody(snapshot)),
        appNotice(matches(acknowledged ?? original, snapshot)
            ? '已保存依据与当前正文/修订一致；仅对象版本变化不代表正文变化。'
            : '当前通告与已保存依据不同或旧依据缺失，请逐项阅读。'),
        if (!eligible)
          appNotice('当前投稿状态或有效期不允许发起新确认。原结果未知的请求仍可按原内容恢复。'),
        if (pending != null) tradeSection('仅恢复原请求', [
          tradeFact('原请求投稿版本', pending['version']),
          tradeFact('原请求通告版本', requestedBody!['notice_version']),
          tradeFact('原请求正文校验', requestedBody['notice_sha256']),
          const Text('恢复不改为当前最新版本，也不要求重新同意其他内容。'),
        ]),
        V5Form(key: formKey, api: api,
            title: '明确阅读后确认',
            action: '确认本次投稿依据此版本继续',
            suffix: suffix, version: frozen.version,
            canSubmit: !busy && !stale && eligible && pending == null,
            fields: const [
              V5Field('read', '我已阅读当前通告变化，确认本次投稿继续依据此版本办理', type: 'bool')
            ],
            initial: const {'read': false},
            restore: (_) => {'read': false},
            facts: [
              tradeFact('被冻结投稿版本', frozen.version),
              ...snapshotBody(snapshot),
              const Text('此动作不形成合同、录用、付款或新增授权。'),
            ],
            buildBody: (values) {
              if (values['read'] != true || stale) {
                throw const FormatException('请重新阅读并明确勾选本次版本。');
              }
              return {
                'notice_version': snapshot.raw['object_version'],
                'notice_sha256': snapshot.raw['notice_sha256'],
              };
            },
            beforeSubmit: (_) => verifyFrozen(frozen, snapshot),
            reload: reloadForm,
            parse: (value) => api.validateConfirmation(value, widget.id,
                submissionVersion: pending == null ? frozen.version : pending['version'],
                noticeVersion: requestedBody?['notice_version'] ?? snapshot.raw['object_version'],
                noticeSha256: requestedBody?['notice_sha256'] ?? snapshot.raw['notice_sha256']),
            onSuccess: (_) async {
              notice = '确认请求已记录，正在重新读取当前投稿和通告；不以缓存响应推定最新状态。';
              await refresh(afterSuccess: true);
            }),
      ],
      tradeButton('重新读取并撤销本页勾选',
          busy || pending != null || formKey.currentState?.busy == true
              ? null : refresh, outline: true),
    ]);
  }
}
