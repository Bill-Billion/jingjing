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
      required this.targetId});
  final AccountSession session;
  final String kind, targetId;
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

  @override
  Widget build(BuildContext context) => tradeScaffold(context, '我的收藏与浏览记录', [
        tradeHeading('留住感兴趣的内容', eyebrow: '只属于当前登录账号'),
        const Text('同一账号的个人与机构身份共用这份私人清单，不属于机构资产。'),
        const SizedBox(height: 16),
        SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('我的收藏')),
              ButtonSegment(value: true, label: Text('浏览记录'))
            ],
            selected: {
              history
            },
            onSelectionChanged: locked
                ? null
                : (v) {
                    setState(() => history = v.single);
                    load();
                  }),
        const SizedBox(height: 16),
        communitySelect(
            '内容类型',
            kind ?? '',
            [
              ('', '全部'),
              ...collectionKinds.entries.map((e) => (e.key, e.value))
            ],
            locked
                ? null
                : (v) {
                    kind = v == '' ? null : v;
                    load();
                  }),
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
          tradeSection(
              r['availability'] == 'AVAILABLE' ? r['title'] : '内容已不可用', [
            tradeFact('类型', collectionKinds[r['kind']]),
            if (r['availability'] == 'AVAILABLE') tradeFact('城市', r['city']),
            tradeFact(
                history ? '浏览时间' : '收藏时间', communityDate(r['recorded_at'])),
            if (r['availability'] == 'AVAILABLE')
              tradeButton(
                  '重新查看当前内容',
                  locked
                      ? null
                      : () async {
                          await Navigator.pushNamed(context,
                              publicContentRoute(r['kind'], r['target_id']));
                          if (mounted) load();
                        }),
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
        tradeButton('刷新清单', busy ? null : load, outline: true),
      ]);
}
