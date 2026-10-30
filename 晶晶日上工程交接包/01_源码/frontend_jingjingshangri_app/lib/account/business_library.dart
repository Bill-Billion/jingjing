import 'package:flutter/material.dart';
import '../engagement/community_support.dart';
import '../trade/trade_widgets.dart';
import 'account_api.dart';
import 'account_session.dart';
import 'account_theme.dart';
import 'personal_business.dart';

class BusinessLibraryPage extends StatefulWidget {
  const BusinessLibraryPage({super.key, this.section = 'contracts'});
  final String section;
  @override
  State<BusinessLibraryPage> createState() => _BusinessLibraryPageState();
}

class _BusinessLibraryPageState extends State<BusinessLibraryPage> {
  late String category = businessCategories.containsKey(widget.section)
      ? widget.section
      : 'contracts';
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'me/business',
      route: '/library?section=$category',
      title: '我的业务目录',
      builder: (s) => _BusinessLibrary(
          session: s,
          category: category,
          select: (value) => setState(() => category = value)));
}

class _SourceState {
  List<Map<String, dynamic>> items = [];
  String? cursor, error, failedCursor;
  bool busy = false, loaded = false, failedMore = false, emptyPage = false;
  int ticket = 0;
  final seen = <String>{};
}

class _BusinessLibrary extends StatefulWidget {
  const _BusinessLibrary(
      {required this.session, required this.category, required this.select});
  final AccountSession session;
  final String category;
  final ValueChanged<String> select;
  @override
  State<_BusinessLibrary> createState() => _BusinessLibraryState();
}

class _BusinessLibraryState extends State<_BusinessLibrary> {
  late final api = CommunityApi(widget.session, 'me/business');
  late final sources = {
    for (final e in businessSources.entries)
      if (e.value.category == widget.category) e.key: _SourceState()
  };
  bool initialBusy = false;
  int generation = 0;
  @override
  void initState() {
    super.initState();
    loadAll();
  }

  @override
  void dispose() {
    generation++;
    super.dispose();
  }

  String failure(Object error) =>
      error is AccountError && error.code == 'INVALID_CURSOR'
          ? '这次翻页条件已失效，请重新读取该来源。'
          : '这部分暂时未能加载，请重试。${communityError(error)}';

  void apply(String source, Map<String, dynamic> raw,
      {required bool more, String? requestedCursor}) {
    final state = sources[source]!;
    final page = PersonalBusinessSourcePage(raw, source);
    if (!page.available) {
      state.error = '这部分暂时未能加载，请重试。';
      state.failedCursor = requestedCursor;
      state.failedMore = more;
      return;
    }
    communityRequire(page.cursor == null ||
        page.cursor != requestedCursor &&
            (!more || !state.seen.contains(page.cursor)));
    if (!more) state.seen.clear();
    if (page.cursor != null) state.seen.add(page.cursor!);
    state.items = {
      if (more)
        for (final item in state.items) item['key'] as String: item,
      for (final item in page.items) item['key'] as String: item,
    }.values.toList();
    state.cursor = page.cursor;
    state.emptyPage = page.items.isEmpty && page.cursor != null;
    state.loaded = true;
    state.error = null;
    state.failedCursor = null;
    state.failedMore = false;
  }

  Future<void> loadAll() async {
    final epoch = ++generation, party = widget.session.partyId!;
    setState(() {
      initialBusy = true;
      for (final name in sources.keys.toList()) {
        sources[name] = _SourceState()..busy = true;
      }
    });
    try {
      final d = await api.read(widget.category, query: {'limit': 20});
      if (!mounted || epoch != generation) return;
      final sections = personalBusinessSections(d, widget.category, party);
      setState(() {
        for (final source in sources.keys) {
          try {
            apply(source, sections[source]!, more: false);
          } catch (e) {
            sources[source]!.error = failure(e);
          }
        }
      });
    } catch (e) {
      if (mounted && epoch == generation) {
        setState(() {
          for (final state in sources.values) {
            state.error = failure(e);
          }
        });
      }
    } finally {
      if (mounted && epoch == generation) {
        setState(() {
          initialBusy = false;
          for (final state in sources.values) {
            state.busy = false;
          }
        });
      }
    }
  }

  Future<void> loadSource(String source,
      {bool more = false, bool retry = false}) async {
    final state = sources[source]!;
    if (initialBusy || state.busy) return;
    final append = retry ? state.failedMore : more;
    final cursor = retry
        ? state.failedCursor
        : more
            ? state.cursor
            : null;
    if (append && cursor == null) return;
    final epoch = generation,
        ticket = ++state.ticket,
        party = widget.session.partyId!;
    bool current() =>
        mounted && epoch == generation && ticket == sources[source]?.ticket;
    setState(() {
      state.busy = true;
      state.error = null;
    });
    try {
      final d = await api.read(widget.category, query: {
        'limit': 20,
        'source': source,
        if (cursor != null) 'cursor': cursor
      });
      if (!current()) return;
      final sections =
          personalBusinessSections(d, widget.category, party, source: source);
      setState(() => apply(source, sections[source]!,
          more: append, requestedCursor: cursor));
    } catch (e) {
      if (current()) {
        setState(() {
          state.error = failure(e);
          state.failedCursor = cursor;
          state.failedMore = append;
        });
      }
    } finally {
      if (current()) setState(() => state.busy = false);
    }
  }

  Future<void> open(String source, String route) async {
    await Navigator.pushNamed(context, route);
    if (!mounted) return;
    if (initialBusy) {
      await loadAll();
    } else {
      final state = sources[source]!;
      state.ticket++;
      state.busy = false;
      await loadSource(source);
    }
  }

  Widget record(String source, Map<String, dynamic> item) => Padding(
      key: ValueKey(item['key']),
      padding: const EdgeInsets.only(top: 16, bottom: 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(item['title'],
            style: const TextStyle(
                fontFamily: AccountTheme.serif,
                fontSize: 20,
                fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        tradeFact('原业务状态', personalBusinessStatus(item)),
        tradeFact('记录版本', '${item['object_version']}'),
        tradeFact('创建时间', communityDate(item['created_at'])),
        if (source == 'FINANCE') ...[
          tradeFact('币种', item['income']['currency']),
          tradeFact('核算环境',
              item['income']['environment'] == 'SANDBOX' ? '测试环境' : '正式环境'),
          Text(item['income']['meaning'] == 'MERCHANT_RETAINED_NOT_TRANSFER'
              ? '商家留存，不是应向商家转账的待付款。'
              : '账面待付不代表已满足付款条件，也不是银行余额。'),
          for (final field in businessIncomeFields.entries)
            tradeFact(field.value,
                personalIncomeMoney(field.key, item['income'][field.key])),
          const Text('仅含已登记台账。净支付已扣除支付退回；本汇总不作银行到账核验。'),
        ],
        Text(item['notice'],
            style: const TextStyle(color: AccountTheme.muted, height: 1.6)),
        tradeButton('回到原业务',
            () => open(source, personalBusinessRoute(item, source: source)),
            outline: true),
        const Divider(),
      ]));

  Widget sourceCard(String source, _SourceState state) {
    final definition = businessSources[source]!;
    return KeyedSubtree(
        key: ValueKey('business-source:$source'),
        child: tradeSection(definition.label, [
          if (state.busy) const LinearProgressIndicator(),
          for (final item in state.items) record(source, item),
          if (state.error != null) ...[
            Text(state.error!,
                style: const TextStyle(color: AccountTheme.danger)),
            tradeButton('重试这部分',
                state.busy ? null : () => loadSource(source, retry: true)),
            if (state.failedMore)
              tradeButton(
                  '重新读取该来源', state.busy ? null : () => loadSource(source),
                  outline: true),
          ] else if (state.loaded &&
              !state.busy &&
              state.items.isEmpty &&
              !state.emptyPage)
            Text(source == 'FINANCE' ? '暂无已登记的收入核算。' : '当前来源暂无可读取的记录。'),
          if (state.error == null && state.emptyPage)
            const Text('本页暂无可见记录，可以继续读取下一页。'),
          if (state.cursor != null && state.error == null)
            tradeButton('继续读取本来源',
                state.busy ? null : () => loadSource(source, more: true),
                outline: true),
          tradeButton('打开原业务入口', () => open(source, definition.listRoute),
              outline: true),
        ]));
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(context, '我的业务目录', [
        tradeHeading('约定、作品与收入', eyebrow: '从原业务继续办理'),
        tradeFact('当前办事身份', widget.session.party?['display_name']),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final category in businessCategories.entries)
            ChoiceChip(
                label: Text(category.value),
                selected: widget.category == category.key,
                onSelected: (_) => widget.select(category.key)),
        ]),
        const SizedBox(height: 24),
        Text(
            widget.category == 'income'
                ? '逐笔核对当前身份已登记的收入。币种、环境和金额含义分别显示，佣金来源不重复计入结算。'
                : '按来源分别查看，来源内按创建时间倒序。进入原业务核对当前状态、历史约定与办理条件。',
            style: const TextStyle(color: AccountTheme.muted, height: 1.6)),
        const SizedBox(height: 20),
        for (final entry in sources.entries) sourceCard(entry.key, entry.value),
        tradeButton('刷新当前分类', initialBusy ? null : loadAll, outline: true),
        if (widget.category == 'income')
          tradeButton('消费者钱包', () => Navigator.pushNamed(context, '/wallet'),
              outline: true),
      ]);
}
