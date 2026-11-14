import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../engagement/community_support.dart';
import 'privacy_copy_sources.dart';

class PrivacyCopyPanel extends StatefulWidget {
  const PrivacyCopyPanel(
      {super.key, required this.session, required this.request});
  final AccountSession session;
  final Map<String, dynamic> request;
  @override
  State<PrivacyCopyPanel> createState() => _PrivacyCopyPanelState();
}

class _PrivacyCopyPanelState extends State<PrivacyCopyPanel> {
  String? selected, target, error, notice;
  List<Map<String, dynamic>> pages = [], targets = [], options = [];
  String? targetCursor;
  final targetSeen = <String>{};
  bool busy = false, targetLoaded = false;
  int generation = 0, epoch = 0;
  CommunityApi get api => CommunityApi(widget.session, 'privacy');
  String get requestId => widget.request['id'] as String;
  List<PrivacyCopySource> get sources {
    final scopes = communityMap(widget.request['request'])['scopes'] as List;
    return privacyCopySources
        .where((s) => scopes.contains('ALL') || scopes.contains(s.scope))
        .toList();
  }

  PrivacyCopySource? get source {
    for (final s in sources) {
      if (s.key == selected) return s;
    }
    return null;
  }

  String? get next =>
      pages.isEmpty ? null : pages.last['next_cursor'] as String?;
  bool get enabled =>
      !busy &&
      widget.session.isLoggedIn &&
      !widget.session.isDomainDenied('/api/v1/privacy/');
  @override
  void initState() {
    super.initState();
    epoch = widget.session.epoch;
    widget.session.addListener(sessionChanged);
  }

  void reset() {
    generation++;
    selected = null;
    target = null;
    pages = [];
    targets = [];
    options = [];
    targetCursor = null;
    targetSeen.clear();
    targetLoaded = false;
    busy = false;
    error = null;
    notice = null;
  }

  void sessionChanged() {
    if (widget.session.epoch != epoch ||
        !widget.session.isLoggedIn ||
        widget.session.isDomainDenied('/api/v1/privacy/')) {
      epoch = widget.session.epoch;
      if (mounted) setState(reset);
    }
  }

  @override
  void didUpdateWidget(covariant PrivacyCopyPanel old) {
    super.didUpdateWidget(old);
    if (old.session != widget.session) {
      old.session.removeListener(sessionChanged);
      widget.session.addListener(sessionChanged);
      epoch = widget.session.epoch;
      reset();
    } else if (old.request['id'] != requestId ||
        old.request['object_version'] != widget.request['object_version']) {
      reset();
    }
  }

  @override
  void dispose() {
    generation++;
    widget.session.removeListener(sessionChanged);
    super.dispose();
  }

  Future<void> run(Future<void> Function(int) action) async {
    if (!enabled) return;
    final g = generation;
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      await action(g);
    } catch (e) {
      if (mounted && g == generation) {
        setState(() {
          if (e is AccountError &&
              ([401, 403, 404].contains(e.status) ||
                  e.code == 'CONTEXT_CHANGED')) {
            reset();
          }
          error = communityError(e);
        });
      }
    } finally {
      if (mounted && g == generation) setState(() => busy = false);
    }
  }

  bool current(int g) => mounted && g == generation;
  Future<Map<String, dynamic>> read(
      PrivacyCopySource s, String? id, String? cursor) async {
    communityRequire(
        communityId(requestId) && (s.target.isEmpty || communityId(id)));
    final path = s.target == 'story' ? 'stories/$id/data' : s.endpoint;
    final d = await api.read('requests/$requestId/$path', query: {
      s.endpoint == 'data' ? 'category' : 'section': s.selector,
      'limit': 20,
      if (s.target == 'order') 'order_id': id,
      if (cursor != null) 'cursor': cursor
    });
    final n = d['next_cursor'];
    communityRequire(d[s.endpoint == 'data' ? 'category' : 'section'] ==
            s.selector &&
        d['coverage'] is String &&
        (s.endpoint == 'data' || d['request_completion'] == 'NOT_CONFIRMED') &&
        (s.target != 'order' || d['order_id'] == id) &&
        (s.target != 'story' || d['story_id'] == id) &&
        (n == null ||
            n is String && n.isNotEmpty && n.length <= 128 && n != cursor));
    communityItems(d);
    return d;
  }

  Future<void> loadOptions() => run((g) async {
        final d = await api.read('requests/$requestId/copy-options');
        final rows = communityRows(d['categories']);
        communityRequire(d['request_completion'] == 'NOT_CONFIRMED');
        if (current(g)) setState(() => options = rows);
      });
  Future<void> loadTargets(bool more) => run((g) async {
        final s = source!;
        final index = privacyCopySources.firstWhere((x) =>
            x.key ==
            (s.target == 'order' ? 'trade:ORDERS' : 'data:PRIVATE_STORY'));
        final cursor = more ? targetCursor : null;
        final d = await read(index, null, cursor);
        final n = d['next_cursor'] as String?;
        communityRequire(!more || n == null || !targetSeen.contains(n));
        if (current(g)) {
          setState(() {
            if (!more) targetSeen.clear();
            if (n != null) targetSeen.add(n);
            targets =
                more ? [...targets, ...communityItems(d)] : communityItems(d);
            targetCursor = n;
            targetLoaded = true;
          });
        }
      });
  Future<void> loadPage(bool more) => run((g) async {
        final d = await read(source!, target, more ? next : null);
        communityRequire(!more ||
            d['next_cursor'] == null ||
            !pages.any((p) => p['next_cursor'] == d['next_cursor']));
        if (current(g)) setState(() => pages = more ? [...pages, d] : [d]);
      });
  Future<void> savePages() => run((g) async {
        // Recheck the same request's current permission before releasing cached records.
        await api.read('requests/$requestId/copy-options');
        if (!current(g)) return;
        final bytes = Uint8List.fromList(
            utf8.encode(const JsonEncoder.withIndent('  ').convert({
          'request_id': requestId,
          'source': source!.key,
          'source_label': source!.label,
          'target_id': target,
          'selected_source_complete': next == null,
          'request_completion': 'NOT_CONFIRMED',
          'remaining': '本文件仅为所选分类和已读取页。其他分类、原件、已删除资料及正式答复另行核对。',
          'pages': pages
        })));
        final saved = await FilePicker.saveFile(
            fileName: '本人资料-$requestId.json', bytes: bytes);
        if (current(g)) {
          setState(() => notice = kIsWeb
              ? '已交给浏览器，请核对下载记录。'
              : saved == null
                  ? '已取消保存。'
                  : '本次副本已保存，请核对文件。');
        }
      });
  Future<void> saveOriginal(Map<String, dynamic> row) => run((g) async {
        final s = source!;
        communityRequire(
            communityId(row['id']) && row['content_sha256'] is String);
        final bytes = await api.bytes(
            'requests/$requestId/copies/${row['id']}/content',
            query: {'category': s.scope},
            sha256Value: row['content_sha256'] as String);
        if (!current(g)) return;
        final saved = await FilePicker.saveFile(
            fileName: '本人原件-${row['id']}.bin', bytes: bytes);
        if (current(g)) {
          setState(() => notice = kIsWeb
              ? '原件已交给浏览器，请核对下载记录。'
              : saved == null
                  ? '已取消保存。'
                  : '已保存与目录校验值一致的本人原件。');
        }
      });
  bool canFile(Map<String, dynamic> row) =>
      source != null &&
      (['ARTIST_MATERIALS', 'CONTENT'].contains(source!.selector) &&
              source!.endpoint == 'data' ||
          source!.key == 'story:ATTACHMENTS') &&
      row['current_status'] == 'READY' &&
      communityId(row['id']) &&
      row['content_sha256'] is String;
  @override
  Widget build(BuildContext context) => ExpansionTile(
          title: const Text('账户、交易与故事历史副本'),
          subtitle: const Text('按本申请逐类读取，原件与目录分别核对'),
          children: [
            const Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                    '仅提供本申请获准范围。空页可能仍有下一页；时间为空表示尚未确认，已删除文件不会恢复。旧订单保留原约定。')),
            OutlinedButton(
                onPressed: enabled ? loadOptions : null,
                child: const Text('读取各类范围与未提供原因')),
            for (final o in options)
              ListTile(
                  title: Text(sources
                          .where((s) =>
                              s.endpoint == 'data' &&
                              s.selector == o['category'])
                          .map((s) => s.label)
                          .firstOrNull ??
                      '本类范围'),
                  subtitle: Text(communityText(o['remaining']))),
            DropdownButtonFormField<String>(
                key: ValueKey('source-$generation-$selected'),
                initialValue: selected,
                isExpanded: true,
                decoration: const InputDecoration(labelText: '选择资料分类'),
                items: [
                  for (final s in sources)
                    DropdownMenuItem(value: s.key, child: Text(s.label))
                ],
                onChanged: enabled
                    ? (v) => setState(() {
                          generation++;
                          selected = v;
                          target = null;
                          pages = [];
                          targets = [];
                          targetCursor = null;
                          targetSeen.clear();
                          targetLoaded = false;
                          error = null;
                        })
                    : null),
            if (source?.target.isNotEmpty == true) ...[
              OutlinedButton(
                  onPressed: enabled ? () => loadTargets(false) : null,
                  child: Text(
                      source!.target == 'order' ? '读取本申请可选订单' : '读取本申请可选故事')),
              DropdownButtonFormField<String>(
                  key: ValueKey('target-$generation-$target'),
                  initialValue: target,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: '选择已读取的具体记录'),
                  items: [
                    for (final t in targets)
                      DropdownMenuItem(
                          value: t['id'] as String,
                          child: Text(
                              '${t['title'] ?? t['category_title'] ?? '本人记录'} · ${communityShort(t['id'])}'))
                  ],
                  onChanged: enabled
                      ? (v) => setState(() {
                            generation++;
                            target = v;
                            pages = [];
                            error = null;
                          })
                      : null),
              if (targetLoaded && targets.isEmpty)
                Text(targetCursor == null ? '本页没有可选记录。' : '本页没有可选记录，可继续读取下一页。'),
              if (targetCursor != null)
                OutlinedButton(
                    onPressed: enabled ? () => loadTargets(true) : null,
                    child: const Text('继续读取可选记录')),
            ],
            OutlinedButton(
                onPressed: enabled &&
                        source != null &&
                        (source!.target.isEmpty || target != null)
                    ? () => loadPage(false)
                    : null,
                child: const Text('读取此类第一页')),
            if (busy) const Text('正在核对当前申请并读取……'),
            if (error != null) Text(error!, semanticsLabel: '读取失败：$error'),
            if (notice != null) Text(notice!),
            if (pages.isNotEmpty) ...[
              Text(next == null ? '本次选择的分页已读完，不代表整份申请完成。' : '尚有下一页，本类别未读完。'),
              for (var i = 0; i < pages.length; i++)
                ExpansionTile(
                    title: Text(
                        '第 ${i + 1} 页 · ${communityItems(pages[i]).length} 条'),
                    children: [
                      for (final row in communityItems(pages[i])) ...[
                        ListTile(
                            title: Text(communityText(row['display_name'] ??
                                row['title'] ??
                                row['category_title'] ??
                                source!.label)),
                            subtitle: Text(
                                '${communityState(row['current_status'])} · ${communityShort(row['id'])}')),
                        if (row.containsKey('created_at'))
                          Text('登记时间：${communityText(row['created_at'])}'),
                        ExpansionTile(
                            title: const Text('核对并复制本条原始字段'),
                            children: [
                              Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: SelectableText(
                                      const JsonEncoder.withIndent('  ')
                                          .convert(row)))
                            ]),
                        if (canFile(row))
                          OutlinedButton(
                              onPressed:
                                  enabled ? () => saveOriginal(row) : null,
                              child: const Text('核权后保存本人原文件')),
                        if (['ERASED', 'ERASURE_PENDING']
                            .contains(row['current_status']))
                          const Text('文件已删除或待清理，目录仅保留状态，不提供恢复下载。'),
                      ]
                    ]),
              if (next != null)
                OutlinedButton(
                    onPressed: enabled ? () => loadPage(true) : null,
                    child: const Text('继续读取此类下一页')),
              OutlinedButton(
                  onPressed: enabled ? savePages : null,
                  child: const Text('保存本次已读取页的副本')),
            ]
          ]);
}
