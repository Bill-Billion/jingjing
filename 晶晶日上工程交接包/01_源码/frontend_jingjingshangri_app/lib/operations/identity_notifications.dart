import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../engagement/community_support.dart';
import '../trade/trade_widgets.dart';
import 'operation_api.dart';
import 'operation_models.dart';
import 'operation_widgets.dart';

const notificationChannels = {
  'ORDER_CONVERSATIONS': '订单会话',
  'SUBMISSION_INTENTS': '投稿意向',
  'ACTIVITY_VOTING': '活动投票',
  'SYSTEM': '系统通知'
};
Map<String, dynamic> notificationSnapshot(Map<String, dynamic> d) {
  final counts = communityMap(d['channels']);
  communityRequire(communityId(d['snapshot_id']) &&
      d['coverage'] == 'CURRENT_AUTHORIZED_NOTIFICATIONS' &&
      d['total'] is int &&
      d['total'] >= 0 &&
      notificationChannels.keys
          .every((k) => counts[k] is int && counts[k] >= 0) &&
      counts.values.fold<int>(0, (a, b) => a + (b as int)) == d['total'] &&
      DateTime.tryParse('${d['expires_at']}') != null);
  return d;
}

Map<String, dynamic> notificationFeedItem(Map<String, dynamic> d) {
  final target = communityMap(d['target']);
  communityRequire(d['id'] is int &&
      d['id'] > 0 &&
      d['read'] is bool &&
      d['event_code'] is String &&
      notificationChannels.containsKey(d['channel']) &&
      communityId(d['record_id']) &&
      communityId(target['record_id']) &&
      [
        ...operationDomains.keys,
        'NOTICES',
        'PRIVACY',
        'SUPPORT',
        'ENGAGEMENT',
        'AUDITIONS',
        'GIG_ORDER',
        'AUDITION_MESSAGE',
        'GIG_MESSAGE'
      ].contains(target['domain']));
  return d;
}

String? notificationTargetRoute(Map<String, dynamic> target) {
  final id = communityRequiredId('${target['record_id']}', '通知业务');
  return switch (target['domain']) {
    'SUPPORT' => '/support/ticket?ticketId=$id',
    'AUDITIONS' => '/auditions/messages?bookingId=$id',
    'GIG_ORDER' => '/gigs/conversation?orderId=$id',
    'ENGAGEMENT' => '/engagement/record?recordId=$id',
    'NOTICES' => '/notices/record?recordId=$id',
    'PRIVACY' => '/privacy/requests?view=request&recordId=$id',
    _ => null,
  };
}

class IdentityNotificationsPage extends StatelessWidget {
  const IdentityNotificationsPage({super.key, this.embedded = false});
  final bool embedded;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>();
    if (embedded &&
        (!s.isLoggedIn ||
            s.partyId == null ||
            s.operationsAccessDenied ||
            s.selected?['membership']?['current_status'] != 'ACTIVE' ||
            ['CLOSED', 'SUSPENDED'].contains(s.party?['current_status']))) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        tradeHeading('消息', eyebrow: '当前办事身份的通知'),
        const Text('请先登录并核对当前有效的办事身份，再查看本人获准的通知。'),
        tradeButton('核对账号与身份', () => Navigator.pushNamed(context, '/account')),
      ]);
    }
    return OperationsGate(
        returnRoute: '/operations/notifications',
        builder: (s) => _Notifications(session: s, embedded: embedded));
  }
}

class _Notifications extends StatefulWidget {
  const _Notifications({required this.session, required this.embedded});
  final AccountSession session;
  final bool embedded;
  @override
  State<_Notifications> createState() => _NotificationsState();
}

class _NotificationsState extends State<_Notifications> {
  late final api = OperationApi(widget.session);
  Map<String, dynamic>? snapshot;
  List<Map<String, dynamic>> rows = [];
  String? channel, error, countError;
  int? cursor;
  bool busy = false, unread = false;
  int ticket = 0;
  final seen = <int>{};
  List<Map<String, dynamic>> get pending => widget.session.operationsPending
      .where((op) => (op['path'] as String).contains('/notifications/'))
      .toList();
  bool get locked => busy || pending.isNotEmpty;
  bool? visible;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = TickerMode.valuesOf(context).enabled &&
        (ModalRoute.of(context)?.isCurrent ?? true);
    if (next == visible) return;
    visible = next;
    if (!next) {
      ticket++;
      rows = [];
      cursor = null;
      snapshot = null;
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && visible == true) load();
      });
    }
  }

  @override
  void dispose() {
    ticket++;
    super.dispose();
  }

  Future<Map<String, dynamic>> read(String suffix,
      {Map<String, dynamic>? query}) async {
    final p = api.party(), epoch = widget.session.epoch;
    final d = await widget.session.read(
        '/api/v1/operations/notifications/$suffix',
        actingParty: p,
        query: query);
    api.check(epoch, p);
    return d;
  }

  Future<void> load({bool more = false}) async {
    if (more && (busy || cursor == null)) return;
    final t = ++ticket, previous = more ? cursor : null;
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        rows = [];
        cursor = null;
        snapshot = null;
        countError = null;
        seen.clear();
      }
    });
    if (!more) {
      try {
        final d = notificationSnapshot(await read('unread'));
        if (mounted && t == ticket) setState(() => snapshot = d);
      } catch (e) {
        if (mounted && t == ticket) {
          setState(() => countError = '未读数量读取失败，请重试。${communityError(e)}');
        }
      }
    }
    if (!mounted || t != ticket) return;
    try {
      final d = await read('feed', query: {
        'limit': 20,
        'unread_only': unread.toString(),
        if (channel != null) 'channel': channel,
        if (previous != null) 'cursor': previous
      });
      if (!mounted || t != ticket) return;
      final items = communityItems(d).map(notificationFeedItem).toList();
      communityRequire(d['next_cursor'] == null ||
          d['next_cursor'] is int &&
              (previous == null || d['next_cursor'] < previous) &&
              seen.add(d['next_cursor']));
      if (mounted && t == ticket) {
        setState(() {
          rows = [...rows, ...items];
          cursor = d['next_cursor'];
        });
      }
    } catch (e) {
      if (mounted && t == ticket) setState(() => error = communityError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> write(String path, Map<String, dynamic> body,
      {bool recovery = false}) async {
    if (busy || !recovery && pending.isNotEmpty) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final p = api.party(), epoch = widget.session.epoch;
      await widget.session.write('POST', path, actingParty: p, body: body,
          validate: (d) {
        api.check(epoch, p);
        if (path.endsWith('/read-all')) {
          communityRequire(d['snapshot_id'] == body['snapshot_id'] &&
              d['marked_count'] is int &&
              d['marked_count'] >= 0 &&
              d['skipped_count'] is int &&
              d['skipped_count'] >= 0);
        } else {
          communityRequire(
              d['read'] == true && d['id'] == int.tryParse(path.split('/')[5]));
        }
      });
      if (mounted && visible == true) await load();
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e is AccountError && e.code == 'NOTIFICATION_SNAPSHOT_EXPIRED'
              ? '这次未读快照已过期。请刷新通知后，再决定是否全部已读。'
              : communityError(e);
          if (e is AccountError && e.status == 409) snapshot = null;
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> open(Map<String, dynamic> n) async {
    setState(() => busy = true);
    try {
      final target = communityMap(n['target']);
      final route = notificationTargetRoute(target) ??
          (await api.source(target['domain'], target['record_id'])).route;
      if (!mounted) return;
      await Navigator.pushNamed(context, route);
      if (mounted && visible == true) await load();
    } catch (e) {
      if (mounted) setState(() => error = communityError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final content = <Widget>[
      tradeHeading('消息', eyebrow: '按当前账号与办事身份查看'),
      tradeFact('当前身份', widget.session.party?['display_name']),
      Wrap(spacing: 8, runSpacing: 8, children: [
        ChoiceChip(
            label:
                Text('全部${snapshot == null ? '' : ' · ${snapshot!['total']}'}'),
            selected: channel == null,
            onSelected: locked
                ? null
                : (_) {
                    channel = null;
                    load();
                  }),
        for (final c in notificationChannels.entries)
          ChoiceChip(
              label: Text(
                  '${c.value}${snapshot == null ? '' : ' · ${communityMap(snapshot!['channels'])[c.key]}'}'),
              selected: channel == c.key,
              onSelected: locked
                  ? null
                  : (_) {
                      channel = c.key;
                      load();
                    }),
      ]),
      SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('只看未读'),
          value: unread,
          onChanged: locked
              ? null
              : (v) {
                  unread = v;
                  load();
                }),
      if (countError != null)
        Text(countError!, style: const TextStyle(color: AccountTheme.danger)),
      tradeButton(
          channel == null ? '全部标为已读' : '本频道全部已读',
          locked || snapshot == null
              ? null
              : () => write('/api/v1/operations/notifications/read-all', {
                    'snapshot_id': snapshot!['snapshot_id'],
                    'channel': channel
                  }),
          outline: true),
      const Text('只标记本次未读查询中的通知。新到消息保留未读；通知已读不代表已经阅读原会话。',
          style: TextStyle(color: AccountTheme.muted, height: 1.6)),
      if (busy) const LinearProgressIndicator(),
      if (error != null)
        Text(error!, style: const TextStyle(color: AccountTheme.danger)),
      for (final op in pending)
        tradeSection('上次已读操作待核对', [
          const Text('恢复原请求不会扩大到新到消息。'),
          tradeButton(
              '恢复原已读操作',
              busy
                  ? null
                  : () => write(op['path'], communityMap(op['body']),
                      recovery: true)),
        ]),
      for (final n in rows)
        tradeSection(notificationChannels[n['channel']]!, [
          Text(operationEvent(n['event_code']),
              style:
                  const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
          tradeFact('时间', communityDate(n['created_at'])),
          tradeFact('状态', n['read'] ? '已读' : '未读'),
          tradeButton('查看对应业务', locked ? null : () => open(n)),
          if (n['read'] == false)
            tradeButton(
                '标记这条已读',
                locked
                    ? null
                    : () => write(
                        '/api/v1/operations/notifications/${n['id']}/read', {}),
                outline: true),
        ]),
      if (!busy && error == null && rows.isEmpty)
        Text(cursor == null ? '当前没有获准查看的通知。' : '本页暂没有可显示的通知，可继续读取。'),
      if (cursor != null)
        tradeButton('继续读取通知', locked ? null : () => load(more: true),
            outline: true),
      tradeButton('刷新消息与未读', busy ? null : load, outline: true),
    ];
    return widget.embedded
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.stretch, children: content)
        : tradeScaffold(context, '消息', content, locked: locked);
  }
}

class NotificationActivityPage extends StatelessWidget {
  const NotificationActivityPage({super.key, required this.recordId});
  final String recordId;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'engagement',
      route: '/engagement/record?recordId=$recordId',
      title: '活动记录',
      builder: (s) => _ActivityRecord(session: s, id: recordId));
}

class _ActivityRecord extends StatefulWidget {
  const _ActivityRecord({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_ActivityRecord> createState() => _ActivityRecordState();
}

class _ActivityRecordState extends State<_ActivityRecord> {
  Map<String, dynamic>? record;
  String? error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      record = null;
      error = null;
    });
    try {
      final d = await CommunityApi(widget.session, 'engagement')
          .read('records/${communityRequiredId(widget.id, '活动记录')}');
      communityRecord(d, id: widget.id);
      if (mounted) setState(() => record = d);
    } catch (e) {
      if (mounted) setState(() => error = communityError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = record, d = communityMaybeMap(record?['data']);
    final eventId =
        r != null && r['kind'] == 'COMPETITION' ? r['id'] : d['event_id'];
    return tradeScaffold(context, '活动记录', [
      if (busy) const LinearProgressIndicator(),
      if (error != null) Text(error!),
      if (r != null) ...[
        tradeHeading('${d['title'] ?? const {
              'VOTE': '我的投票',
              'APPEAL': '我的活动异议',
              'REWARD': '我的活动奖励',
              'CANDIDATE': '参选记录',
              'COMPETITION': '活动进度'
            }[r['kind']] ?? '活动业务记录'}'),
        tradeFact('当前进度', communityState(r['current_status'])),
        if (d['reason'] is String) Text(d['reason']),
        if (d['body'] is String) Text(d['body']),
        if (communityId(eventId))
          tradeButton(
              '查看对应活动',
              () => Navigator.pushNamed(
                  context, '/engagement?view=competition&recordId=$eventId')),
        if (r['kind'] == 'REWARD')
          tradeButton('查看我的奖励与兑现',
              () => Navigator.pushNamed(context, '/engagement?view=exposures'),
              outline: true),
        communityRecordId(r),
      ],
      tradeButton('重新读取记录', busy ? null : load, outline: true),
    ]);
  }
}
