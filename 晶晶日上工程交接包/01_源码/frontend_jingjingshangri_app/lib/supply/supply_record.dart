import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import 'supply_api.dart';
import 'supply_files.dart';
import 'supply_models.dart';
import 'supply_widgets.dart';

class SupplyRecordPage extends StatelessWidget {
  const SupplyRecordPage({super.key, required this.recordId});
  final String recordId;
  @override
  Widget build(BuildContext context) => SupplyGate(
      returnRoute: '/supply/record?recordId=$recordId',
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
  late final api = SupplyApi(widget.session);
  Map<String, dynamic>? record;
  bool busy = false, approved = false;
  String? error, notice;
  int ticket = 0;
  String get path => '/api/v1/supply/work-versions/${widget.id}/actions';
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final request = ++ticket;
    setState(() {
      busy = true;
      record = null;
      error = null;
    });
    try {
      final data = await api.record(widget.id);
      final profile =
          data['kind'] == 'WORK_VERSION' ? await api.latestProfile() : null;
      if (mounted && request == ticket) {
        setState(() {
          record = data;
          approved = profile?['current_status'] == 'APPROVED';
        });
      }
    } on AccountError catch (e) {
      if (mounted && request == ticket) setState(() => error = supplyError(e));
    } finally {
      if (mounted && request == ticket) setState(() => busy = false);
    }
  }

  Future<void> act(String action, {bool retry = false}) async {
    final original = record;
    Map<String, dynamic> body;
    int version;
    if (retry) {
      final pending = api.pending(path)!;
      body = Map<String, dynamic>.from(pending['body'] as Map);
      version = pending['version'] as int;
    } else {
      if (original == null) return;
      final reason = TextEditingController();
      String? validation;
      final dialog = DialogRoute<bool>(
          context: context,
          builder: (context) => StatefulBuilder(
              builder: (context, setDialog) => AlertDialog(
                      title: Text(action == 'SUBMIT' ? '提交此版审核？' : '撤回此版？'),
                      content: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(action == 'SUBMIT'
                                ? '提交后不能直接修改这一版。修改需要保存为新修订。'
                                : '撤回记录将保留。后续修改需另存新修订。'),
                            if (action == 'WITHDRAW') ...[
                              const SizedBox(height: 12),
                              appField(
                                  '撤回理由 *',
                                  TextField(
                                      key: const Key('withdraw-reason'),
                                      controller: reason,
                                      maxLength: 1000,
                                      minLines: 2,
                                      maxLines: 4,
                                      decoration: InputDecoration(
                                          errorText: validation)))
                            ]
                          ]),
                      actions: [
                        TextButton(
                            onPressed: () => Navigator.pop(context, false),
                            child: const Text('取消')),
                        FilledButton(
                            onPressed: () {
                              if (action == 'WITHDRAW' &&
                                  reason.text.trim().isEmpty) {
                                setDialog(() => validation = '请填写撤回理由');
                                return;
                              }
                              Navigator.pop(context, true);
                            },
                            child: Text(action == 'SUBMIT' ? '确认提交审核' : '确认撤回'))
                      ])));
      final confirmed = await Navigator.of(context).push(dialog);
      final text = reason.text.trim();
      await dialog.completed;
      reason.dispose();
      if (confirmed != true || !mounted) return;
      body = {'action': action, 'reason': action == 'WITHDRAW' ? text : null};
      version = original['object_version'] as int;
    }
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      await api.write(path, body, version: version, kind: 'WORK_VERSION');
      if (!mounted) return;
      await load();
      if (mounted) {
        setState(() => notice =
            record == null ? '操作已记录，最新详情尚未读到，请重新读取。' : '操作已记录，已重新读取当前版本。');
      }
    } on AccountError catch (e) {
      if (!mounted) return;
      if (e.status == 412) {
        await load();
        if (mounted) {
          setState(() => error = record == null
              ? '版本已变化，最新详情尚未读到。请重新读取后再确认操作。'
              : '版本已变化，已重新读取。请核对后重新确认操作。');
        }
      } else {
        setState(() => error = supplyError(e));
        if ([401, 403, 404].contains(e.status)) setState(() => record = null);
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget files(List<dynamic> ids, String purpose) =>
      SupplyFiles(api: api, purpose: purpose, ids: ids.cast<String>());
  @override
  Widget build(BuildContext context) {
    final r = record,
        data = r?['data'],
        work = r?['kind'] == 'WORK_VERSION',
        version = work ? data['version'] : null,
        content = version?['content'],
        pending = api.pending(path);
    return supplyScaffold(context, work ? '作品版本详情' : '资料详情', [
      if (busy) const LinearProgressIndicator(),
      if (error != null) supplyNote(error!, error: true),
      if (notice != null) supplyNote(notice!),
      Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
              onPressed: busy ? null : load,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('重新读取'))),
      if (pending != null)
        supplyCard('上次操作结果未确认', [
          supplyNote('请先核对原操作，不能改动动作、理由或记录版本。'),
          FilledButton(
              onPressed: busy ? null : () => act('', retry: true),
              child: const Text('核对原操作结果'))
        ]),
      if (r != null) ...[
        Card(
            child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                          work
                              ? content['title'] as String
                              : data['display_name'] as String,
                          style: const TextStyle(
                              fontSize: 24, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 12),
                      Wrap(
                          spacing: 12,
                          runSpacing: 8,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 5),
                                decoration: BoxDecoration(
                                    color: AccountTheme.canvas,
                                    borderRadius: BorderRadius.circular(6)),
                                child: Text('修订 ${r['revision']}',
                                    style: const TextStyle(fontSize: 14))),
                            supplyStatus(r['current_status'] as String),
                          ]),
                      const SizedBox(height: 16),
                      if (work)
                        supplyNote(version['current_status'] == 'DRAFT'
                            ? '当前为草稿，尚未提交审核。可以完善后提交，或基于本稿新增修订。'
                            : '此版本已经保存；更新内容需要新增修订。'),
                      if (!work) supplyFact('作者介绍', data['description']),
                    ]))),
        if (!work) ...[
          supplyCard('申请证明',
              [files(data['evidence_asset_ids'] as List, 'RIGHTS_EVIDENCE')]),
          supplyCard('资格审核事实', [
            if (data['review'] == null)
              supplyNote('尚未记录审核结果。')
            else ...[
              supplyStatus(data['review']['decision'] as String),
              const SizedBox(height: 12),
              supplyFact('审核意见', data['review']['reason']),
              supplyFact('审核时间', data['review']['recorded_at'])
            ]
          ]),
          OutlinedButton(
              onPressed: busy || pending != null
                  ? null
                  : () => Navigator.pushNamed(
                      context, '/supply/profile?previousId=${r['id']}'),
              child: const Text('接续最新申请，填写新版本')),
        ] else ...[
          supplyCard('私有稿件', [
            files([content['content_asset_id']], 'WORK_CONTENT')
          ]),
          supplyCard('作品权利证明',
              [files(content['evidence_ids'] as List, 'RIGHTS_EVIDENCE')]),
          supplyCard('权利链', [
            for (final c in data['credits'] as List) ...[
              supplyFact(creditRoles[c['role']] ?? '关系主体', c['party_id']),
              files(c['evidence_asset_ids'] as List, 'RIGHTS_EVIDENCE'),
              const Divider()
            ]
          ]),
          supplyCard('审核状态', [
            for (final channel in ['RIGHTS', 'CONTENT']) ...[
              Row(children: [
                CircleAvatar(
                    radius: 20,
                    backgroundColor: AccountTheme.canvas,
                    child: Icon(
                        channel == 'RIGHTS'
                            ? Icons.verified_user_outlined
                            : Icons.description_outlined,
                        color: AccountTheme.muted)),
                const SizedBox(width: 12),
                Expanded(
                    child: Text(channel == 'RIGHTS' ? '权利审核' : '内容审核',
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700))),
              ]),
              const SizedBox(height: 8),
              if (!(version['reviews'] as List)
                  .any((v) => v['channel'] == channel))
                supplyNote('尚未记录审核结果。')
              else
                for (final review in (version['reviews'] as List)
                    .where((v) => v['channel'] == channel)) ...[
                  supplyStatus(review['decision'] as String),
                  const SizedBox(height: 10),
                  supplyFact('审核意见', review['reason']),
                  supplyFact('审核依据编号', review['evidence_ref']),
                  supplyFact('审核时间', review['recorded_at']),
                  supplyFact('审核账号', review['reviewer_account_id']),
                ],
              const Divider(),
            ],
            supplyNote('两项审核分别记录；每个新修订都需重新审核。通过不等于已上架或取得项目改编许可。'),
          ]),
          if (version['withdrawal'] != null)
            supplyCard('撤回事实', [
              supplyFact('理由', version['withdrawal']['reason']),
              supplyFact('时间', version['withdrawal']['recorded_at'])
            ]),
          if (version['current_status'] == 'DRAFT') ...[
            if (!approved) supplyNote('当前作者申请尚未通过，暂不能提交审核。'),
            FilledButton(
                key: const Key('submit-work-review'),
                onPressed: busy || pending != null || !approved
                    ? null
                    : () => act('SUBMIT'),
                child: const Text('提交此版审核')),
            const SizedBox(height: 10),
          ],
          OutlinedButton(
              onPressed: busy ||
                      pending != null ||
                      !approved ||
                      content['kind'] != 'ORIGINAL'
                  ? null
                  : () => Navigator.pushNamed(
                      context, '/supply/work/new?previousId=${r['id']}'),
              child: const Text('接续最新版本，保存新修订')),
          if (version['current_status'] != 'WITHDRAWN')
            TextButton(
                onPressed:
                    busy || pending != null ? null : () => act('WITHDRAW'),
                child: const Text('撤回此版')),
        ],
        Card(
            child: ExpansionTile(
                title: const Text('版本资料'),
                childrenPadding: const EdgeInsets.all(16),
                children: [
              supplyFact('资料版本', '第 ${r['revision']} 版'),
              supplyFact('记录编号', r['id']),
              supplyFact('当前所属身份',
                  widget.session.party?['display_name'] ?? r['owner_party_id']),
              if (work) ...[
                supplyFact('作品编号', r['stream_ref']),
                supplyFact(
                    '作品类型', content['kind'] == 'ORIGINAL' ? '原作' : '项目改编'),
                supplyFact('提交审核时间', version['submitted_at']),
              ],
            ])),
      ],
    ]);
  }
}
