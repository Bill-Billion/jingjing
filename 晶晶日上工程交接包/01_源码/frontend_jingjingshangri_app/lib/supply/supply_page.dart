import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import 'supply_api.dart';
import 'supply_models.dart';
import 'supply_widgets.dart';

class SupplyPage extends StatelessWidget {
  const SupplyPage({super.key});
  @override
  Widget build(BuildContext context) =>
      SupplyGate(builder: (s) => _SupplyHome(session: s));
}

class _SupplyHome extends StatefulWidget {
  const _SupplyHome({required this.session});
  final AccountSession session;
  @override
  State<_SupplyHome> createState() => _SupplyHomeState();
}

class _SupplyHomeState extends State<_SupplyHome> {
  late final api = SupplyApi(widget.session);
  List<Map<String, dynamic>>? profiles, works;
  String? cursor, error;
  bool busy = false;
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    final request = ++ticket;
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        profiles = null;
        works = null;
        cursor = null;
      }
    });
    try {
      final p = more ? profiles! : await api.all('PROFILE');
      final w = await api.page('WORK_VERSION', cursor: more ? cursor : null);
      if (!mounted || request != ticket) return;
      p.sort((a, b) => (b['revision'] as int).compareTo(a['revision'] as int));
      setState(() {
        profiles = p;
        works = {
          for (final r in [
            ...(more ? works! : <Map<String, dynamic>>[]),
            ...(w['items'] as List).cast<Map<String, dynamic>>()
          ])
            r['id']: r
        }.values.toList();
        cursor = w['next_cursor'] as String?;
      });
    } on AccountError catch (e) {
      if (mounted && request == ticket) {
        setState(() {
          profiles = null;
          works = null;
          cursor = null;
          error = supplyError(e);
        });
      }
    } finally {
      if (mounted && request == ticket) setState(() => busy = false);
    }
  }

  Future<void> open(String route) async {
    await Navigator.pushNamed(context, route);
    if (mounted) load();
  }

  @override
  Widget build(BuildContext context) {
    final latest = profiles?.firstOrNull,
        approved = latest?['current_status'] == 'APPROVED';
    return supplyScaffold(context, '作者与作品', [
      Text(widget.session.party?['display_name'] ?? '当前投稿身份',
          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      supplyNote('整理作者资料，保存每一版作品与权利证明。'),
      if (error != null) supplyNote(error!, error: true),
      if (busy) const LinearProgressIndicator(),
      Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
              onPressed: busy ? null : () => load(),
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('刷新资料'))),
      if (profiles != null)
        supplyCard('作者申请', [
          if (latest == null) ...[
            supplyNote('还没有提交过作者资料。申请通过后，即可保存作品草稿。'),
            FilledButton(
                onPressed: () => open('/supply/profile'),
                child: const Text('填写作者申请'))
          ] else ...[
            supplyStatus(latest['current_status'] as String),
            const SizedBox(height: 8),
            Text(latest['data']['display_name'],
                style: const TextStyle(fontWeight: FontWeight.w600)),
            supplyNote('申请第 ${latest['revision']} 版'),
            if (latest['data']['review'] != null)
              supplyFact('审核意见', latest['data']['review']['reason']),
            OutlinedButton(
                onPressed: () =>
                    open('/supply/record?recordId=${latest['id']}'),
                child: const Text('查看申请详情')),
            TextButton(
                onPressed: () =>
                    open('/supply/profile?previousId=${latest['id']}'),
                child: Text(['CHANGES_REQUESTED', 'REJECTED']
                        .contains(latest['current_status'])
                    ? '补正并提交新申请'
                    : '更新资料并提交新申请')),
            supplyNote('新申请会替代旧版的当前资格，需等待新一轮审核。'),
          ],
        ]),
      if (profiles != null && profiles!.length > 1)
        supplyCard('申请历史', [
          for (final p in profiles!.skip(1))
            ListTile(
                contentPadding: EdgeInsets.zero,
                title:
                    Text('第 ${p['revision']} 版 · ${p['data']['display_name']}'),
                subtitle: supplyStatus(p['current_status'] as String),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => open('/supply/record?recordId=${p['id']}')),
        ]),
      if (works != null) ...[
        const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: Text('我的作品版本',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700))),
        if (works!.isEmpty)
          supplyCard('还没有作品版本', [supplyNote('稿件与权利证明将随每一版保存。')]),
        for (final w in works!)
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(w['data']['version']['content']['title'],
                            style: const TextStyle(
                                fontSize: 24, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        Text('第 ${w['revision']} 版',
                            style: const TextStyle(fontSize: 14)),
                        const Divider(height: 28),
                        Row(children: [
                          const Text('状态', style: TextStyle(fontSize: 14)),
                          const SizedBox(width: 16),
                          supplyStatus(w['current_status'] as String)
                        ]),
                        const Divider(height: 28),
                        Row(children: [
                          const Text('版本编号', style: TextStyle(fontSize: 14)),
                          const SizedBox(width: 16),
                          Expanded(
                              child: Text(shortSupplyId(w['id'] as String),
                                  style: const TextStyle(fontSize: 14))),
                          IconButton(
                              tooltip: '复制版本编号',
                              onPressed: () => Clipboard.setData(
                                  ClipboardData(text: w['id'] as String)),
                              icon: const Icon(Icons.copy_outlined, size: 18))
                        ]),
                        const SizedBox(height: 16),
                        FilledButton(
                            onPressed: () =>
                                open('/supply/record?recordId=${w['id']}'),
                            child: const Text('查看版本')),
                      ]))),
        supplyCard('新增作品', [
          supplyNote('稿件和证明随作品版本保存。'),
          FilledButton.icon(
              onPressed: approved ? () => open('/supply/work/new') : null,
              icon: const Icon(Icons.add),
              label: const Text('投稿原作')),
          if (!approved) supplyNote('当前作者申请尚未通过，暂不能新增作品或提交草稿。'),
        ]),
        if (cursor != null)
          OutlinedButton(
              onPressed: busy ? null : () => load(more: true),
              child: const Text('加载更多版本')),
      ],
    ]);
  }
}
