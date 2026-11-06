import 'package:file_picker/file_picker.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../engagement/community_support.dart';
import '../supply/supply_models.dart';
import '../trade/trade_widgets.dart';

const supportStates = {
  'SUBMITTED': '已提交，等待受理',
  'PROCESSING': '正在处理',
  'NEEDS_INFO': '请补充材料',
  'ANSWERED': '已有答复',
  'CLOSED': '已关闭'
};
const supportActions = {
  'SUBMIT': '提交问题',
  'START': '开始处理',
  'REQUEST_INFO': '要求补充材料',
  'SUPPLEMENT': '补交说明与附件',
  'ANSWER': '给出答复',
  'CLOSE': '结束本次反馈',
  'REOPEN': '重新提出问题'
};
Map<String, dynamic> supportTicket(Map<String, dynamic> d, AccountSession s) {
  communityRequire(communityId(d['id']) &&
      d['party_id'] == s.partyId &&
      ['FEEDBACK', 'REPORT'].contains(d['kind']) &&
      d['title'] is String &&
      supportStates.containsKey(d['current_status']) &&
      d['object_version'] is int &&
      d['object_version'] > 0);
  return d;
}

List<String> applicantActions(String state) => switch (state) {
      'NEEDS_INFO' => ['SUPPLEMENT'],
      'ANSWERED' => ['CLOSE', 'REOPEN'],
      'CLOSED' => ['REOPEN'],
      _ => []
    };

class SupportPage extends StatelessWidget {
  const SupportPage(
      {super.key,
      this.ticketId,
      this.create = false,
      this.targetDomain,
      this.targetId});
  final String? ticketId, targetDomain, targetId;
  final bool create;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'support',
      route: ticketId != null
          ? '/support/ticket?ticketId=$ticketId'
          : create
              ? '/support/new'
              : '/support',
      title: '反馈与举报',
      builder: (s) => _Support(
          session: s,
          ticketId: ticketId,
          create: create,
          targetDomain: targetDomain,
          targetId: targetId));
}

class _Support extends StatefulWidget {
  const _Support(
      {required this.session,
      required this.create,
      this.ticketId,
      this.targetDomain,
      this.targetId});
  final AccountSession session;
  final bool create;
  final String? ticketId, targetDomain, targetId;
  @override
  State<_Support> createState() => _SupportState();
}

class _SupportState extends State<_Support> {
  late final api = CommunityApi(widget.session, 'support');
  final title = TextEditingController(), text = TextEditingController();
  String kind = 'FEEDBACK';
  String? filter, cursor, error, notice;
  List<Map<String, dynamic>> rows = [], events = [];
  Map<String, dynamic>? record;
  final attachments = <Map<String, dynamic>>[];
  final seen = <String>{};
  int? historyCursor;
  bool busy = false, uploading = false;
  int ticket = 0;
  double? progress;
  bool leaveConfirmed = false;
  bool get hasDraft =>
      title.text.trim().isNotEmpty ||
      text.text.trim().isNotEmpty ||
      attachments.isNotEmpty ||
      pending.isNotEmpty ||
      pendingUpload != null;
  void draftChanged() {
    if (mounted) setState(() {});
  }

  Future<void> leave({String? route}) async {
    if (busy || uploading) return;
    if (hasDraft) {
      final yes = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
                  title: const Text('离开当前填写？'),
                  content: const Text(
                      '尚未提交的文字和本次附件选择会离开此页。取消可继续填写；结果不确定的原请求仍可回到反馈页面核对。'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(c, false),
                        child: const Text('继续填写')),
                    FilledButton(
                        onPressed: () => Navigator.pop(c, true),
                        child: const Text('确认离开'))
                  ]));
      if (yes != true || !mounted) return;
    }
    setState(() => leaveConfirmed = true);
    if (route != null) {
      Navigator.pushReplacementNamed(context, route);
      return;
    }
    if (Navigator.canPop(context)) {
      Navigator.pop(context);
    } else {
      Navigator.pushReplacementNamed(context, '/my');
    }
  }

  List<Map<String, dynamic>> get pending =>
      widget.session.pendingForPrefix('/api/v1/support/');
  Map<String, dynamic>? get pendingUpload =>
      widget.session.pending('POST', '/api/v1/supply/assets',
          actingParty: widget.session.partyId);
  bool get locked =>
      busy || uploading || pending.isNotEmpty || pendingUpload != null;
  @override
  void initState() {
    super.initState();
    title.addListener(draftChanged);
    text.addListener(draftChanged);
    if (!widget.create) load();
  }

  @override
  void dispose() {
    ticket++;
    title.dispose();
    text.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    if (busy || more && cursor == null) return;
    final t = ++ticket;
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        rows = [];
        events = [];
        record = null;
        cursor = null;
        historyCursor = null;
        seen.clear();
      }
    });
    try {
      if (widget.ticketId != null) {
        final d = supportTicket(
            await api
                .read('tickets/${communityRequiredId(widget.ticketId!, '工单')}'),
            widget.session);
        final h = await api
            .read('tickets/${widget.ticketId}/history', query: {'limit': 20});
        final list = validateHistory(h);
        if (!mounted || t != ticket) return;
        setState(() {
          record = d;
          events = list;
          historyCursor = h['next_cursor'];
        });
      } else {
        final d = await api.read('tickets', query: {
          'limit': 20,
          if (filter != null) 'status': filter,
          if (more && cursor != null) 'cursor': cursor
        });
        final list = communityItems(d)
            .map((r) => supportTicket(r, widget.session))
            .toList();
        communityRequire(d['next_cursor'] == null ||
            d['next_cursor'] is String && seen.add(d['next_cursor']));
        if (!mounted || t != ticket) return;
        setState(() {
          rows = [...rows, ...list];
          cursor = d['next_cursor'];
        });
      }
    } catch (e) {
      if (mounted && t == ticket) setState(() => error = communityError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  List<Map<String, dynamic>> validateHistory(Map<String, dynamic> d) {
    final list = communityItems(d);
    communityRequire(d['next_cursor'] == null ||
        d['next_cursor'] is int && d['next_cursor'] > 0);
    for (final r in list) {
      communityRequire(r['object_version'] is int &&
          r['object_version'] > 0 &&
          ['APPLICANT', 'SUPPORT'].contains(r['actor_kind']) &&
          supportActions.containsKey(r['action']) &&
          r['text'] is String &&
          r['asset_ids'] is List &&
          (r['asset_ids'] as List).every(communityId));
    }
    return list;
  }

  Future<void> moreHistory() async {
    if (busy || historyCursor == null) return;
    final before = historyCursor;
    setState(() => busy = true);
    try {
      final d = await api.read('tickets/${widget.ticketId}/history',
          query: {'limit': 20, 'cursor': before});
      final list = validateHistory(d);
      communityRequire(d['next_cursor'] == null || d['next_cursor'] > before);
      if (mounted) {
        setState(() {
          events = [...events, ...list];
          historyCursor = d['next_cursor'];
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = communityError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> upload({bool restore = false}) async {
    if (busy || uploading || attachments.length >= 10) return;
    final started = widget.session.epoch, party = widget.session.partyId;
    setState(() {
      uploading = true;
      error = null;
      progress = null;
    });
    try {
      Uint8List bytes;
      String media, name;
      if (restore) {
        final p = pendingUpload;
        if (p == null) return;
        bytes = p['bytes'];
        media = communityMap(p['query'])['media_type'];
        name = '恢复的附件';
      } else {
        final picked = await FilePicker.pickFiles(
            withData: true,
            type: FileType.custom,
            allowedExtensions: supplyMedia.keys.toList());
        if (picked == null) return;
        final f = picked.files.single;
        bytes = f.bytes ?? Uint8List(0);
        media = supplyMedia[f.extension?.toLowerCase()] ?? '';
        name = f.name;
      }
      if (!mounted || started != widget.session.epoch || party == null) return;
      if (bytes.isEmpty || bytes.length > maxSupplyBytes || media.isEmpty) {
        throw const AccountError(400, '附件须为支持的文件，且不超过8MB');
      }
      final p = party;
      final d = await widget.session.upload('/api/v1/supply/assets', bytes,
          actingParty: p,
          query: {'purpose': 'RIGHTS_EVIDENCE', 'media_type': media},
          onSendProgress: (n, total) {
        if (mounted) setState(() => progress = total > 0 ? n / total : null);
      }, validate: (d) {
        SupplyDto.asset(d, p, purpose: 'RIGHTS_EVIDENCE');
        communityRequire(d['current_status'] == 'READY' &&
            d['byte_size'] == bytes.length &&
            d['media_type'] == media &&
            d['content_sha256'] == sha256.convert(bytes).toString());
      });
      if (mounted) {
        setState(() {
          if (!attachments.any((a) => a['id'] == d['id'])) {
            attachments.add({...d, 'name': name});
          }
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = communityError(e));
    } finally {
      if (mounted) setState(() => uploading = false);
    }
  }

  Future<void> submit({String? action, Map<String, dynamic>? recovery}) async {
    if (busy ||
        uploading ||
        recovery == null && (pending.isNotEmpty || pendingUpload != null)) {
      return;
    }
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      final path = recovery != null
          ? (recovery['path'] as String).substring(api.prefix.length)
          : widget.create
              ? 'tickets'
              : 'tickets/${widget.ticketId}/actions';
      final body = recovery != null
          ? communityMap(recovery['body'])
          : <String, dynamic>{
              if (widget.create) ...{
                'kind': kind,
                'title': communityRequired(title.text, '标题', max: 200),
                'target':
                    widget.targetDomain != null && communityId(widget.targetId)
                        ? {
                            'domain': widget.targetDomain,
                            'record_id': widget.targetId
                          }
                        : null
              } else
                'action': action,
              'text': communityRequired(text.text, '问题说明', max: 4000),
              'asset_ids': action != null && action != 'SUPPLEMENT'
                  ? <String>[]
                  : attachments.map((a) => a['id']).toList(),
            };
      if (recovery != null) {
        if (path == 'tickets') {
          await api.read('tickets', query: {'limit': 20});
        } else {
          await api.read('tickets/${path.split('/')[1]}');
        }
      }
      final d = await api.write(path, body,
          version: recovery != null
              ? recovery['version']
              : widget.create
                  ? null
                  : record!['object_version'],
          validate: (r) => supportTicket(r, widget.session));
      if (!mounted) return;
      if (widget.create || path == 'tickets') {
        await Navigator.pushReplacementNamed(
            context, '/support/ticket?ticketId=${d['id']}');
      } else {
        setState(() {
          busy = false;
          text.clear();
          attachments.clear();
          notice = '处理已保存，已重新读取当前进度。';
        });
        await load();
      }
    } catch (e) {
      if (e is AccountError && e.status == 412 && mounted) {
        setState(() => busy = false);
        await load();
      }
      if (mounted) setState(() => error = communityError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> download(String id) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final bytes =
          await api.bytes('tickets/${widget.ticketId}/assets/$id/content');
      if (!mounted) return;
      final saved =
          await FilePicker.saveFile(fileName: '反馈附件-$id', bytes: bytes);
      if (mounted) {
        setState(() => notice = kIsWeb
            ? '附件已交给浏览器，请查看下载记录。'
            : saved == null
                ? '已取消保存。'
                : '附件已保存。');
      }
    } catch (e) {
      if (mounted) setState(() => error = communityError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  List<Widget> attachmentFields() => [
        const Text('最多10份，每份不超过8MB。仅本人当前身份上传的就绪材料可提交。'),
        for (final a in attachments)
          ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(a['name']),
              subtitle: const Text('已上传，等待本次明确提交'),
              trailing: IconButton(
                  tooltip: '从本次提交移除',
                  onPressed: locked
                      ? null
                      : () => setState(() => attachments.remove(a)),
                  icon: const Icon(Icons.close))),
        if (uploading) LinearProgressIndicator(value: progress),
        if (pendingUpload != null)
          tradeButton(
              '恢复原附件上传', busy || uploading ? null : () => upload(restore: true),
              outline: true)
        else
          tradeButton(
              '选择并上传附件', locked || attachments.length >= 10 ? null : upload,
              outline: true),
      ];
  @override
  Widget build(BuildContext context) => PopScope(
      canPop: leaveConfirmed || !hasDraft,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop && !busy && !uploading) leave();
      },
      child: tradeScaffold(
          context,
          '反馈与举报',
          [
            tradeHeading(
                widget.create
                    ? '说说遇到的问题'
                    : widget.ticketId == null
                        ? '我的反馈'
                        : '查看处理进度',
                eyebrow: '本人反馈 / 当前办事身份'),
            tradeFact('办事身份', widget.session.party?['display_name']),
            if (busy) const LinearProgressIndicator(),
            if (error != null)
              Text(error!, style: const TextStyle(color: AccountTheme.danger)),
            if (notice != null) Text(notice!),
            for (final op in pending)
              tradeSection('原提交结果尚未确定', [
                Text('${communityMaybeMap(op['body'])['title'] ?? ''}'),
                Text('${communityMaybeMap(op['body'])['text'] ?? ''}'),
                tradeButton('核对并恢复原提交',
                    busy || uploading ? null : () => submit(recovery: op)),
              ]),
            if (widget.create) ...[
              communitySelect(
                  '问题类型',
                  kind,
                  [('FEEDBACK', '意见反馈'), ('REPORT', '内容举报')],
                  locked ? null : (v) => setState(() => kind = v!)),
              TextField(
                  controller: title,
                  enabled: !locked,
                  maxLength: 200,
                  decoration: const InputDecoration(labelText: '标题')),
              if (widget.targetDomain != null)
                const Text('已关联刚才打开的业务内容；权限将在提交时重新核对。'),
              TextField(
                  controller: text,
                  enabled: !locked,
                  maxLength: 4000,
                  maxLines: 5,
                  decoration: const InputDecoration(labelText: '具体情况')),
              ...attachmentFields(),
              const Text('举报作为待核查线索，不代表已认定违规。退款、争议和隐私请求仍在原业务办理。',
                  style: TextStyle(color: AccountTheme.muted, height: 1.6)),
              tradeButton('确认提交', locked ? null : submit),
            ] else if (widget.ticketId == null) ...[
              communitySelect(
                  '处理状态',
                  filter ?? '',
                  [
                    ('', '全部'),
                    ...supportStates.entries.map((e) => (e.key, e.value))
                  ],
                  locked
                      ? null
                      : (v) {
                          filter = v == '' ? null : v;
                          load();
                        }),
              tradeButton(
                  '提交新的反馈或举报',
                  locked
                      ? null
                      : () => Navigator.pushNamed(context, '/support/new')
                              .then((_) {
                            if (mounted) load();
                          })),
              for (final r in rows)
                tradeSection(r['title'], [
                  tradeFact('当前进度', supportStates[r['current_status']]),
                  tradeFact('更新时间', communityDate(r['updated_at'])),
                  tradeButton(
                      '查看处理记录',
                      () => Navigator.pushNamed(context,
                                  '/support/ticket?ticketId=${r['id']}')
                              .then((_) {
                            if (mounted) load();
                          }),
                      outline: true)
                ]),
              if (!busy && error == null && rows.isEmpty)
                Text(cursor == null ? '当前没有反馈记录。' : '本页暂无记录，可继续读取。'),
              if (cursor != null)
                tradeButton('继续读取', busy ? null : () => load(more: true),
                    outline: true),
            ] else if (record != null) ...[
              tradeSection(record!['title'], [
                tradeFact('当前进度', supportStates[record!['current_status']]),
                tradeFact('类型', record!['kind'] == 'REPORT' ? '内容举报' : '意见反馈'),
                tradeFact('更新时间', communityDate(record!['updated_at']))
              ]),
              for (final e in events)
                tradeSection(
                    '${e['actor_kind'] == 'APPLICANT' ? '本人' : '客服'} · ${supportActions[e['action']]}',
                    [
                      Text(e['text'], style: const TextStyle(height: 1.6)),
                      tradeFact('时间', communityDate(e['created_at'])),
                      for (final id in e['asset_ids'])
                        tradeButton('下载本次材料 ${communityShort(id)}',
                            busy ? null : () => download(id),
                            outline: true),
                    ]),
              if (historyCursor != null)
                tradeButton('继续读取处理历史', busy ? null : moreHistory,
                    outline: true),
              if (applicantActions(record!['current_status']).isNotEmpty) ...[
                TextField(
                    controller: text,
                    enabled: !locked,
                    maxLength: 4000,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: '本次说明')),
                if (record!['current_status'] == 'NEEDS_INFO')
                  ...attachmentFields(),
                for (final action
                    in applicantActions(record!['current_status']))
                  tradeButton(supportActions[action]!,
                      locked ? null : () => submit(action: action),
                      outline: action == 'CLOSE'),
              ],
              const Text('已经正式提交的历次附件随处理记录保留，补件不会替换旧材料。',
                  style: TextStyle(color: AccountTheme.muted, height: 1.6)),
              tradeButton('回到我的反馈',
                  busy || uploading ? null : () => leave(route: '/support'),
                  outline: true),
            ],
            if (!widget.create)
              tradeButton('重新读取进度', busy ? null : load, outline: true),
            tradeButton(
                '查看原订单与售后', () => Navigator.pushNamed(context, '/orders'),
                outline: true),
          ],
          locked: busy || uploading,
          onBack: leave));
}
