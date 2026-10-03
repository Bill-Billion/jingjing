import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../account/account_theme.dart';
import '../projects/project_widgets.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_widgets.dart';
import 'operation_api.dart';
import 'operation_models.dart';
import 'operation_widgets.dart';

class OperationsNotificationsPage extends StatelessWidget {
  const OperationsNotificationsPage({super.key, this.eventId});
  final int? eventId;
  @override
  Widget build(BuildContext context) => OperationsGate(
      returnRoute: eventId == null
          ? '/messages'
          : '/operations/notification?eventId=$eventId',
      builder: (s) => _Notifications(session: s, eventId: eventId));
}

class _Notifications extends StatefulWidget {
  const _Notifications({required this.session, this.eventId});
  final AccountSession session;
  final int? eventId;
  @override
  State<_Notifications> createState() => _NotificationsState();
}

class _NotificationsState extends State<_Notifications> {
  late final api = OperationApi(widget.session);
  List<OperationNotice> rows = [];
  OperationSource? source;
  int? cursor;
  bool busy = false, unread = true;
  String? error;
  bool get locked => busy || widget.session.operationsPending.isNotEmpty;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        rows = [];
        source = null;
        cursor = null;
      }
    });
    try {
      if (widget.eventId != null) {
        final n = await api.notice(widget.eventId!);
        if (n == null) {
          widget.session.denyOperations();
          throw const AccountError(404, 'NOTIFICATION_NOT_FOUND');
        }
        final s = await api.source(n.domain, n.recordId);
        if (mounted) {
          setState(() {
            rows = [n];
            source = s;
          });
        }
      } else {
        final d =
            await api.notices(unread: unread, cursor: more ? cursor : null);
        if (mounted) {
          setState(() {
            rows = {
              for (final n in [
                ...(more ? rows : <OperationNotice>[]),
                ...d.items
              ])
                n.id: n
            }.values.toList();
            cursor = d.cursor;
          });
        }
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = operationError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> mark(OperationNotice n) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await api.markRead(n.id);
      if (!mounted) return;
      operationClearWarnings(context);
      await load();
    } on AccountError catch (e) {
      if (mounted) setState(() => error = operationError(e, writing: true));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> restore(String path) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await api.retry(path);
      if (!mounted) return;
      operationClearWarnings(context);
      await load();
    } on AccountError catch (e) {
      if (mounted) setState(() => error = operationError(e, writing: true));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> open(OperationNotice n) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final s = await api.source(n.domain, n.recordId);
      if (!mounted) return;
      await Navigator.pushNamed(context, s.route);
      if (mounted) await load();
    } on AccountError catch (e) {
      if (mounted) setState(() => error = operationError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  List<Widget> pending() => [
        for (final op in widget.session.operationsPending)
          supplyCard('原请求结果待核实', [
            supplyNote('原请求、内容与版本已保留。核对完成前请留在本页。'),
            tradeButton('恢复原请求核对', busy ? null : () => restore(op['path']))
          ])
      ];
  Widget card(OperationNotice n) => supplyCard(operationDomains[n.domain]!, [
        Row(children: [
          Icon(n.read ? Icons.check_circle_outline : Icons.circle,
              size: 12,
              color: n.read ? AccountTheme.muted : AccountTheme.accent),
          const SizedBox(width: 12),
          Expanded(
              child: Text(operationEvent(n.code),
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w600)))
        ]),
        operationIdFact('关联对象', n.recordId),
        tradeFact('通知时间', tradeDate(n.createdAt)),
        tradeFact('已读状态', n.read ? '已读' : '未读', accent: !n.read),
        if (source != null) projectHeading(source!.title),
        if (widget.eventId == null)
          tradeButton(
              '查看通知详情',
              locked
                  ? null
                  : () => Navigator.pushNamed(
                      context, '/operations/notification?eventId=${n.id}'),
              outline: true),
        Wrap(spacing: 12, runSpacing: 12, children: [
          tradeButton('标记已读', locked || n.read ? null : () => mark(n),
              outline: true),
          tradeButton('查看对应业务', locked ? null : () => open(n))
        ]),
        if (source?.canComment == true)
          operationCommentLink(
              context, n.domain, n.recordId, source!.commentTitle,
              enabled: !locked, returned: load)
      ]);
  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      widget.eventId == null ? '业务通知' : '通知详情',
      [
        tradeFact('当前身份', widget.session.party?['display_name']),
        if (widget.eventId == null)
          Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: true, label: Text('未读')),
                    ButtonSegment(value: false, label: Text('全部'))
                  ],
                  selected: {
                    unread
                  },
                  onSelectionChanged: locked
                      ? null
                      : (v) {
                          setState(() => unread = v.single);
                          load();
                        })),
        supplyNote('通知记录发生过的变化，当前状态请进入业务查看。'),
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!, icon: Icons.error_outline),
        ...pending(),
        for (final n in rows) card(n),
        if (!busy && error == null && rows.isEmpty)
          supplyCard('本页暂无获准查看的通知', [
            supplyNote(cursor == null
                ? '本次没有更多记录。通知从本阶段真实业务变更开始保存。'
                : '本页经过权限或已读筛选后为空，可继续读取更早记录。')
          ]),
        if (cursor != null)
          tradeButton('加载更多', locked ? null : () => load(more: true),
              outline: true),
        if (widget.eventId == null)
          supplyCard('收到的机构邀请', [
            tradeButton('查看账号邀请',
                locked ? null : () => Navigator.pushNamed(context, '/account'),
                outline: true)
          ]),
        tradeButton('刷新通知', locked ? null : load, outline: true)
      ],
      locked: locked);
}

class OperationsCommentsEntryPage extends StatelessWidget {
  const OperationsCommentsEntryPage({super.key});
  @override
  Widget build(BuildContext context) => OperationsGate(
      returnRoute: '/chat',
      builder: (s) => tradeScaffold(context, '业务留言', [
            supplyCard('选择具体业务', [
              projectParagraph('留言围绕当前获准的订单、制作项目或具体版本、创作项目保存。请先打开对应业务，再进入留言。'),
              tradeButton(
                  '查看我的订单', () => Navigator.pushNamed(context, '/orders'),
                  outline: true),
              tradeButton(
                  '查看制作项目', () => Navigator.pushNamed(context, '/production'),
                  outline: true),
              tradeButton(
                  '查看我的项目', () => Navigator.pushNamed(context, '/my-projects'),
                  outline: true)
            ])
          ]));
}

class OperationsCommentsPage extends StatelessWidget {
  const OperationsCommentsPage(
      {super.key, required this.domain, required this.recordId});
  final String domain, recordId;
  @override
  Widget build(BuildContext context) => OperationsGate(
      returnRoute: '/operations/comments?domain=$domain&recordId=$recordId',
      builder: (s) => _Comments(session: s, domain: domain, id: recordId));
}

class _Comments extends StatefulWidget {
  const _Comments(
      {required this.session, required this.domain, required this.id});
  final AccountSession session;
  final String domain, id;
  @override
  State<_Comments> createState() => _CommentsState();
}

class _CommentsState extends State<_Comments> {
  late final api = OperationApi(widget.session);
  OperationSource? source;
  List<ObjectComment> rows = [];
  String? cursor, replyTo, withdrawId, error;
  bool busy = false;
  final body = TextEditingController(), reason = TextEditingController();
  String get path =>
      '/api/v1/operations/objects/${widget.domain}/${widget.id}/comments';
  bool get locked => busy || widget.session.operationsPending.isNotEmpty;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    body.dispose();
    reason.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        source = null;
        rows = [];
        cursor = null;
        replyTo = null;
        withdrawId = null;
        reason.clear();
      }
    });
    try {
      final s = await api.source(widget.domain, widget.id);
      if (!s.canComment) {
        throw const AccountError(400, 'COMMENT_TARGET_NOT_SUPPORTED');
      }
      final d = await api.comments(widget.domain, widget.id,
          cursor: more ? cursor : null);
      if (mounted) {
        setState(() {
          source = s;
          rows = {
            for (final r in [...(more ? rows : <ObjectComment>[]), ...d.items])
              r.id: r
          }.values.toList()
            ..sort((a, b) {
              final t = a.createdAt.compareTo(b.createdAt);
              return t == 0 ? a.id.compareTo(b.id) : t;
            });
          cursor = d.cursor;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = operationError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> send() async {
    if (locked || source == null || !operationText(body.text, 4000)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await api.add(widget.domain, widget.id, body.text, replyTo: replyTo);
      if (!mounted) return;
      body.clear();
      operationClearWarnings(context);
      await load();
    } on AccountError catch (e) {
      if (mounted) setState(() => error = operationError(e, writing: true));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> withdraw(ObjectComment c) async {
    if (locked || !operationText(reason.text, 1000)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await api.withdraw(c, reason.text);
      if (!mounted) return;
      operationClearWarnings(context);
      await load();
    } on AccountError catch (e) {
      if (!mounted) return;
      if (e.status == 412) {
        await load();
        if (mounted) setState(() => error = operationError(e, writing: true));
      } else {
        setState(() => error = operationError(e, writing: true));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> restore(String originalPath) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await api.retry(originalPath);
      if (!mounted) return;
      body.clear();
      operationClearWarnings(context);
      await load();
    } on AccountError catch (e) {
      if (!mounted) return;
      if (e.status == 412) {
        await load();
        if (mounted) setState(() => error = operationError(e, writing: true));
      } else {
        setState(() => error = operationError(e, writing: true));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget card(ObjectComment c) {
    final withdrawing = widget.session.operationsPending
        .any((o) => o['path'] == '/api/v1/operations/comments/${c.id}/actions');
    return supplyCard('账号 · ${shortSupplyId(c.author)}', [
      Text(tradeDate(c.createdAt),
          style: const TextStyle(fontSize: 16, color: AccountTheme.muted)),
      const SizedBox(height: 12),
      if (c.replyTo != null) operationIdFact('回复留言', c.replyTo!),
      if (withdrawing)
        appNotice('撤回结果待核实，原正文已暂时隐藏。')
      else if (c.status == 'VISIBLE')
        projectParagraph(c.body!)
      else
        supplyNote(c.status == 'WITHDRAWN' ? '这条留言已撤回。' : '这条留言已隐藏。'),
      if (c.status == 'VISIBLE')
        Wrap(spacing: 12, runSpacing: 12, children: [
          TextButton.icon(
              onPressed: locked ? null : () => setState(() => replyTo = c.id),
              icon: const Icon(Icons.chat_bubble_outline),
              label: const Text('回复这条')),
          if (c.author == widget.session.account?['id'] &&
              c.party == widget.session.partyId)
            TextButton.icon(
                onPressed: locked
                    ? null
                    : () => setState(() {
                          withdrawId = c.id;
                          reason.clear();
                        }),
                icon: const Icon(Icons.delete_outline),
                label: const Text('撤回我的留言'))
        ]),
      if (withdrawId == c.id && !withdrawing) ...[
        supplyNote('撤回后不再展示原正文，原记录与操作历史保留。'),
        projectField(reason, '撤回原因',
            max: 1000, enabled: !locked, changed: (_) => setState(() {})),
        tradeButton(
            '确认撤回',
            locked || !operationText(reason.text, 1000)
                ? null
                : () => withdraw(c)),
        tradeButton(
            '取消撤回',
            locked
                ? null
                : () => setState(() {
                      withdrawId = null;
                      reason.clear();
                    }),
            outline: true)
      ]
    ]);
  }

  Widget composer() => Column(mainAxisSize: MainAxisSize.min, children: [
        if (replyTo != null)
          Row(children: [
            Expanded(
                child: Text('回复留言 · ${shortSupplyId(replyTo!)}',
                    style: const TextStyle(fontSize: 16))),
            TextButton(
                onPressed: locked ? null : () => setState(() => replyTo = null),
                child: const Text('取消回复'))
          ]),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
              child: TextField(
                  controller: body,
                  enabled: source != null && !locked,
                  maxLines: 3,
                  minLines: 1,
                  maxLength: 4000,
                  decoration: const InputDecoration(
                      labelText: '留言说明', hintText: '输入与本对象有关的说明'),
                  onChanged: (_) => setState(() {}))),
          const SizedBox(width: 12),
          ConstrainedBox(
              constraints: const BoxConstraints(minWidth: 76),
              child: FilledButton(
                  style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 12)),
                  onPressed: source == null ||
                          locked ||
                          !operationText(body.text, 4000)
                      ? null
                      : send,
                  child: const Text('发送', maxLines: 1, softWrap: false)))
        ])
      ]);
  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      source?.commentTitle ?? '对象留言',
      [
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!, icon: Icons.error_outline),
        for (final op in widget.session.operationsPending)
          supplyCard('原请求结果待核实', [
            supplyNote('原内容、请求编号与版本已保留。请先恢复核对，避免重复留言或撤回。'),
            tradeButton('恢复原请求核对', busy ? null : () => restore(op['path']))
          ]),
        if (source != null)
          supplyCard(
              '关联${source!.domain == 'TRADE' ? '订单' : source!.kind == 'VERSION' ? '版本' : '项目'}',
              [
                projectHeading(source!.title),
                operationIdFact('业务对象', source!.id),
                tradeButton(
                    '查看对应业务',
                    locked
                        ? null
                        : () => Navigator.pushNamed(context, source!.route)
                                .then((_) {
                              if (mounted) load();
                            }),
                    outline: true)
              ]),
        for (final c in rows) card(c),
        if (!busy && source != null && rows.isEmpty && error == null)
          supplyNote('本页暂无留言。'),
        if (cursor != null)
          tradeButton('加载更多留言', locked ? null : () => load(more: true),
              outline: true),
        tradeButton('刷新留言', locked ? null : load, outline: true),
        supplyNote('留言为本业务内的纯文本说明，不能代替准确版本确认、付款、退款或权利授权。')
      ],
      locked: locked,
      footer: composer());
}
