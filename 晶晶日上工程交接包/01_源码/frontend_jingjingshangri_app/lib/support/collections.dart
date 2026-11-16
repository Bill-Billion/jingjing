import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../discovery/public_discovery.dart';
import '../engagement/community_support.dart';
import '../trade/trade_widgets.dart';

const collectionKinds = {'ARTIST': '艺人', 'STOCK': '作品', 'NOTICE': '通告'};
Map<String, dynamic> collectionPreferences(Map<String, dynamic> d) {
  communityRequire(d['history_enabled'] is bool &&
      d['object_version'] is int &&
      d['object_version'] > 0 &&
      d['history_days'] is int &&
      d['history_days'] > 0 &&
      d['history_max_entries'] is int &&
      d['history_max_entries'] > 0);
  return d;
}

class CollectionsApi extends CommunityApi {
  CollectionsApi(AccountSession s) : super(s, 'me/collections');
  Future<Map<String, dynamic>> preferences() async =>
      collectionPreferences(await read('preferences', account: true));
  Future<Map<String, dynamic>> target(String kind, String id) async {
    communityRequire(collectionKinds.containsKey(kind) && communityId(id));
    final d = await read('targets/$kind/$id', account: true);
    communityRequire(d['saved'] is bool && d['visited'] is bool);
    return d;
  }

  Future<void> favorite(String kind, String id, bool saved) async {
    await write('favorites', {'kind': kind, 'target_id': id, 'saved': saved},
        account: true, validate: (d) => communityRequire(d['applied'] == true));
  }

  Future<void> visit(String kind, String id) async {
    // A visit belongs only to this actual detail opening; never queue/replay it.
    final epoch = session.epoch;
    final p = await preferences();
    if (p['history_enabled'] != true) return;
    try {
      await write('history', {'kind': kind, 'target_id': id},
          account: true,
          version: p['object_version'],
          validate: (d) => communityRequire(d['applied'] == true));
    } finally {
      if (epoch == session.epoch) {
        session.discardPending('POST', '${prefix}history');
      }
    }
  }
}

class CollectionDetailActions extends StatefulWidget {
  const CollectionDetailActions(
      {super.key,
      required this.session,
      required this.kind,
      required this.targetId,
      this.purchaseAction});
  final AccountSession session;
  final String kind, targetId;
  final Widget? purchaseAction;
  @override
  State<CollectionDetailActions> createState() =>
      _CollectionDetailActionsState();
}

class _CollectionDetailActionsState extends State<CollectionDetailActions> {
  late final api = CollectionsApi(widget.session);
  bool? saved;
  bool busy = false;
  String? error;
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    load();
    recordVisit();
  }

  Future<void> recordVisit() async {
    try {
      await api.visit(widget.kind, widget.targetId);
    } catch (_) {
      /* History must never block the public detail or silently retry. */
    }
  }

  Future<void> load() async {
    final t = ++ticket;
    try {
      final d = await api.target(widget.kind, widget.targetId);
      if (mounted && t == ticket) {
        setState(() {
          saved = d['saved'];
          error = null;
        });
      }
    } catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          saved = null;
          error = communityError(e);
        });
      }
    }
  }

  Future<void> toggle({bool recover = false}) async {
    if (busy) return;
    final pending = api.pending('favorites', account: true);
    final body = pending == null ? null : communityMap(pending['body']);
    if (recover &&
        (body?['kind'] != widget.kind ||
            body?['target_id'] != widget.targetId)) {
      await Navigator.pushNamed(context, '/saved');
      if (mounted) await load();
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (recover) await api.target(widget.kind, widget.targetId);
      await api.favorite(widget.kind, widget.targetId,
          recover ? body!['saved'] : !(saved ?? false));
      if (mounted) await load();
    } catch (e) {
      if (mounted) setState(() => error = communityError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    ticket++;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pending = api.pending('favorites', account: true);
    if (widget.purchaseAction != null) {
      return Column(mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (error != null)
          Text(error!, style: const TextStyle(color: AccountTheme.danger)),
        LayoutBuilder(builder: (context, constraints) {
          final favorite = OutlinedButton(
              onPressed: busy || saved == null || pending != null ? null : toggle,
              child: Text(saved == true ? '已收藏' : '收藏'));
          if (constraints.maxWidth < 340 ||
              MediaQuery.textScalerOf(context).scale(14) > 20) {
            return Column(mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              favorite,
              const SizedBox(height: 8),
              widget.purchaseAction!,
            ]);
          }
          return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(flex: 4, child: favorite),
            const SizedBox(width: 10),
            Expanded(flex: 6, child: widget.purchaseAction!),
          ]);
        }),
        if (pending != null)
          tradeButton('核对并恢复原收藏操作',
              busy ? null : () => toggle(recover: true), outline: true),
        if (saved == null)
          TextButton(onPressed: busy ? null : load,
              child: const Text('重读收藏状态')),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (error != null)
        Text(error!, style: const TextStyle(color: AccountTheme.danger)),
      tradeButton(
          saved == true ? '取消收藏' : '收藏这份${collectionKinds[widget.kind]}',
          busy || saved == null || pending != null ? null : toggle,
          outline: true),
      if (pending != null)
        tradeButton('核对并恢复原收藏操作', busy ? null : () => toggle(recover: true),
            outline: true),
      if (saved == null)
        tradeButton('重读收藏状态', busy ? null : load, outline: true),
      tradeButton('我的收藏与浏览记录', () => Navigator.pushNamed(context, '/saved'),
          outline: true),
      tradeButton(
          '反馈或举报这份内容',
          () => Navigator.pushNamed(context,
              '/support/new?domain=${widget.kind}_PUBLIC&recordId=${widget.targetId}'),
          outline: true),
    ]);
  }
}

class PersonalCollectionsPage extends StatelessWidget {
  const PersonalCollectionsPage({super.key});
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'me/collections',
      partyRequired: false,
      route: '/saved',
      title: '我的收藏与浏览记录',
      builder: (s) => _Collections(session: s));
}

class _Collections extends StatefulWidget {
  const _Collections({required this.session});
  final AccountSession session;
  @override
  State<_Collections> createState() => _CollectionsState();
}

class _CollectionsState extends State<_Collections> {
  late final api = CollectionsApi(widget.session);
  Map<String, dynamic>? preferences;
  List<Map<String, dynamic>> rows = [];
  String? cursor, error, kind;
  bool history = false, busy = false;
  int ticket = 0;
  final seen = <String>{};
  List<Map<String, dynamic>> get pending =>
      widget.session.pendingForPrefix(api.prefix, personal: true);
  bool get locked => busy || pending.isNotEmpty;
  @override
  void initState() {
    super.initState();
    load();
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
        seen.clear();
      }
    });
    try {
      final p = await api.preferences();
      final d = await api
          .read(history ? 'history' : 'favorites', account: true, query: {
        'limit': 20,
        if (kind != null) 'kind': kind,
        if (previous != null) 'cursor': previous
      });
      final result = validatePublicPage(d, previous: previous);
      for (final r in result) {
        communityRequire(collectionKinds.containsKey(r['kind']) &&
            communityId(r['target_id']) &&
            ['AVAILABLE', 'UNAVAILABLE'].contains(r['availability']) &&
            (r['availability'] == 'UNAVAILABLE'
                ? r['title'] == null && r['city'] == null
                : r['title'] is String && r['city'] is String));
      }
      if (!mounted || t != ticket) return;
      communityRequire(d['next_cursor'] == null || seen.add(d['next_cursor']));
      setState(() {
        preferences = p;
        rows = [...rows, ...result];
        cursor = d['next_cursor'];
      });
    } catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          error = communityError(e);
          if (e is AccountError &&
              [400, 401, 403, 404, 409, 412].contains(e.status)) {
            rows = [];
            cursor = null;
          }
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<bool> confirm(String title, String text) async =>
      await showDialog<bool>(
          context: context,
          builder: (c) =>
              AlertDialog(title: Text(title), content: Text(text), actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c, false),
                    child: const Text('取消')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, true),
                    child: const Text('确认'))
              ])) ??
      false;
  Future<void> write(String method, String suffix, Map<String, dynamic> body,
      {int? version, bool recovery = false}) async {
    if (!mounted || busy || !recovery && pending.isNotEmpty) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (recovery) {
        await api.preferences();
        if (suffix == 'favorites') {
          await api.target(body['kind'], body['target_id']);
        } else {
          await api.read('history', account: true, query: {'limit': 20});
        }
      }
      await api.write(suffix, body,
          method: method, account: true, version: version, validate: (d) {
        if (suffix == 'favorites') {
          communityRequire(d['applied'] == true);
        } else {
          collectionPreferences(d);
        }
      });
      if (mounted) await load();
    } catch (e) {
      if (e is AccountError && e.status == 412) {
        try {
          preferences = await api.preferences();
        } catch (_) {
          preferences = null;
        }
      }
      if (mounted) setState(() => error = communityError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> toggleHistory(bool enabled) async {
    final p = preferences;
    final epoch = widget.session.epoch;
    if (p == null) return;
    if (!await confirm(enabled ? '开启浏览记录？' : '关闭并清空浏览记录？',
        enabled ? '开启后，仅在你实际打开艺人、作品或通告详情时保存记录。' : '将清空浏览记录，不影响收藏、订单和已购买许可。')) {
      return;
    }
    if (!mounted || epoch != widget.session.epoch) return;
    await write('POST', 'preferences', {'history_enabled': enabled},
        version: p['object_version']);
  }

  @override
  void dispose() {
    ticket++;
    super.dispose();
  }

  Widget savedRow(Map<String, dynamic> item, List<Widget> actions) =>
      Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: const BoxDecoration(border: Border(
              bottom: BorderSide(color: AccountTheme.border))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(width: 60, height: 80,
                  decoration: BoxDecoration(color: AccountTheme.surface,
                      borderRadius: BorderRadius.circular(10)),
                  child: Icon(item['kind'] == 'ARTIST'
                      ? Icons.person_outline
                      : item['kind'] == 'STOCK'
                          ? Icons.movie_outlined : Icons.description_outlined,
                      color: AccountTheme.muted)),
              const SizedBox(width: 12),
              Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(item['availability'] == 'AVAILABLE'
                    ? item['title'] : '内容已不可用',
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text(item['availability'] == 'AVAILABLE'
                    ? '${collectionKinds[item['kind']]} · ${item['city'] is String && (item['city'] as String).trim().isNotEmpty ? item['city'] : '城市未提供'}'
                    : '${collectionKinds[item['kind']]} · 当前不可用',
                    style: const TextStyle(fontSize: 12, color: AccountTheme.accent)),
                const SizedBox(height: 6),
                Text('${history ? "浏览" : "收藏"}于 ${communityDate(item['recorded_at'])}',
                    style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
              ])),
              if (item['availability'] == 'AVAILABLE') ...[
                const SizedBox(width: 8),
                SizedBox(width: 72, child: TextButton(
                    onPressed: locked ? null : () async {
                      await Navigator.pushNamed(context,
                          publicContentRoute(item['kind'], item['target_id']));
                      if (mounted) load();
                    },
                    child: Text(item['kind'] == 'ARTIST' ? '查看档案' : '查看',
                        textAlign: TextAlign.center))),
              ],
            ]),
            const SizedBox(height: 10),
            ...actions,
          ]));

  @override
  Widget build(BuildContext context) => tradeScaffold(context, '我的收藏与浏览记录', [
        tradeHeading('留住喜欢的', eyebrow: '留给下次相遇', fontSize: 28),
        Row(children: [
          for (final tab in const [(false, '我的收藏'), (true, '浏览足迹')])
            Expanded(child: DecoratedBox(
                decoration: BoxDecoration(border: Border(bottom: BorderSide(
                    color: history == tab.$1 ? AccountTheme.accent : AccountTheme.border,
                    width: history == tab.$1 ? 3 : 1))),
                child: TextButton(
                    onPressed: locked ? null : () {
                      setState(() => history = tab.$1);
                      load();
                    },
                    style: TextButton.styleFrom(
                        foregroundColor: history == tab.$1
                            ? AccountTheme.text : AccountTheme.muted),
                    child: Text(tab.$2)))),
        ]),
        const SizedBox(height: 16),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final option in [
            const MapEntry<String, String>('', '全部'),
            ...collectionKinds.entries
          ])
            ChoiceChip(
                label: Text(option.value),
                selected: (kind ?? '') == option.key,
                onSelected: locked ? null : (_) {
                  kind = option.key.isEmpty ? null : option.key;
                  load();
                }),
        ]),
        const SizedBox(height: 12),
        const Text('仅当前账号可见；收藏不锁定价格、授权或内容可用性。',
            style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
        if (preferences != null) ...[
          SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('保存浏览记录'),
              subtitle: Text(
                  '最近${preferences!['history_days']}天，最多${preferences!['history_max_entries']}条；关闭同时清空。'),
              value: preferences!['history_enabled'],
              onChanged: locked ? null : toggleHistory),
          if (history)
            tradeButton(
                '清空浏览记录',
                locked
                    ? null
                    : () async {
                        final epoch = widget.session.epoch;
                        if (await confirm(
                                '清空浏览记录？', '只清空已保存的浏览记录，保留当前开关，不删除订单或收藏。') &&
                            mounted &&
                            epoch == widget.session.epoch) {
                          await write('DELETE', 'history', {},
                              version: preferences!['object_version']);
                        }
                      },
                outline: true),
        ],
        if (busy) const LinearProgressIndicator(),
        if (error != null)
          Text(error!, style: const TextStyle(color: AccountTheme.danger)),
        for (final op in pending)
          tradeSection('上次操作结果待核对', [
            const Text('本次保留原内容和原请求，先读取当前记录再核对。'),
            tradeButton(
                '核对并恢复原操作',
                busy
                    ? null
                    : () => write(
                        (op['fingerprint'] as String).contains('"DELETE"')
                            ? 'DELETE'
                            : 'POST',
                        (op['path'] as String).substring(api.prefix.length),
                        communityMap(op['body']),
                        version: op['version'],
                        recovery: true)),
          ]),
        for (final r in rows)
          savedRow(r, [
            if (r['availability'] != 'AVAILABLE')
              const Text('原内容已不能打开。清单记录仍保留，可按需移除，不会删除原订单。',
                  style: TextStyle(color: AccountTheme.muted, height: 1.6)),
            tradeButton(
                history ? '删除这条浏览记录' : '取消收藏',
                locked
                    ? null
                    : () async {
                        if (history) {
                          await write('DELETE',
                              'history/${r['kind']}/${r['target_id']}', {},
                              version: preferences!['object_version']);
                        } else {
                          await write('POST', 'favorites', {
                            'kind': r['kind'],
                            'target_id': r['target_id'],
                            'saved': false
                          });
                        }
                      },
                outline: true),
          ]),
        if (!busy && error == null && rows.isEmpty)
          Text(history && preferences?['history_enabled'] == false
              ? '浏览记录当前已关闭。'
              : cursor == null
                  ? '当前清单为空。'
                  : '本页暂无记录，可以继续读取。'),
        if (cursor != null)
          tradeButton('继续读取', locked ? null : () => load(more: true),
              outline: true),
        tradeButton('刷新清单', locked ? null : load, outline: true),
        const SizedBox(height: 16),
        tradeSection('足迹只为你保留', [
          const Text('清空足迹只影响浏览记录，不删除原作品、收藏、订单或许可；不可用内容不显示旧标题或缩略图。'),
        ]),
      ]);
}
