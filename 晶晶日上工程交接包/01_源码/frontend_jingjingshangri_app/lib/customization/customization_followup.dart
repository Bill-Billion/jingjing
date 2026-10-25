import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../trade/trade_models.dart';
import '../trade/trade_pages.dart';
import '../trade/trade_widgets.dart';
import 'customization_api.dart';
import 'customization_models.dart';

// History and quote states extend the original film-editorial story pages.
class CustomizationFollowupPage extends StatelessWidget {
  const CustomizationFollowupPage(
      {super.key, required this.requestId, this.history = false});
  final String requestId;
  final bool history;
  @override
  Widget build(BuildContext context) {
    final session = context.watch<AccountSession>();
    final valid = session.isLoggedIn &&
        session.partyId != null &&
        session.selected?['membership']?['current_status'] == 'ACTIVE' &&
        !['SUSPENDED', 'CLOSED'].contains(session.party?['current_status']);
    return valid
        ? KeyedSubtree(
            key: ValueKey(
                '${session.epoch}:${session.account?['id']}:${session.partyId}'),
            child: _FollowupList(
                session: session, id: requestId, history: history))
        : tradeScaffold(context, '需求记录', [
            appNotice('当前身份已变更或无权访问，私有内容已清空。'),
          ]);
  }
}

class _FollowupList extends StatefulWidget {
  const _FollowupList(
      {required this.session, required this.id, required this.history});
  final AccountSession session;
  final String id;
  final bool history;
  @override
  State<_FollowupList> createState() => _FollowupListState();
}

class _FollowupListState extends State<_FollowupList> {
  late final api = CustomizationApi(widget.session);
  final histories = <StorySubmissionSummary>[];
  final quotes = <StoryQuoteSummary>[];
  final seen = <String>{};
  StorySubmissionVersion? selected;
  String? cursor, error;
  bool busy = false, denied = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  void fail(AccountError e) {
    error = storyError(e);
    if ([401, 403, 404].contains(e.status)) {
      histories.clear();
      quotes.clear();
      selected = null;
      cursor = null;
      denied = true;
    }
  }

  Future<void> load({bool more = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        histories.clear();
        quotes.clear();
        selected = null;
        cursor = null;
        seen.clear();
      }
    });
    try {
      if (widget.history) {
        final result =
            await api.history(widget.id, cursor: more ? cursor : null);
        if (!mounted) return;
        if (result.cursor != null) storyRequire(seen.add(result.cursor!));
        setState(() {
          histories.addAll(result.items
              .where((r) => !histories.any((old) => old.id == r.id)));
          cursor = result.cursor;
          denied = false;
        });
      } else {
        final result =
            await api.quotes(widget.id, cursor: more ? cursor : null);
        if (!mounted) return;
        if (result.cursor != null) storyRequire(seen.add(result.cursor!));
        setState(() {
          quotes.addAll(
              result.items.where((r) => !quotes.any((old) => old.id == r.id)));
          cursor = result.cursor;
          denied = false;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => fail(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> detail(StorySubmissionSummary summary) async {
    setState(() {
      busy = true;
      error = null;
      selected = null;
    });
    try {
      final result = await api.submission(widget.id, summary.id);
      storyRequire(result.data['submission_number'] == summary.number &&
          result.data['submission']['content_sha256'] ==
              summary.data['content_sha256']);
      if (mounted) setState(() => selected = result);
    } on AccountError catch (e) {
      if (mounted) setState(() => fail(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> openQuote(StoryQuoteSummary summary,
      {bool order = false}) async {
    await Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => TradeRecordPage(
                recordId: order ? summary.data['order_id'] : summary.id,
                customizationSourceCurrent:
                    summary.data['source_is_current'])));
    if (mounted) await load();
  }

  @override
  Widget build(BuildContext context) =>
      tradeScaffold(context, widget.history ? '正式提交历史' : '需求报价与订单', [
        tradeHeading(widget.history ? '每一次正式提交' : '这份故事的报价',
            eyebrow: widget.history ? '故事档案 / 正式版本' : '平台报价 / 待你核对'),
        appNotice(widget.history
            ? '这里只保留正式提交的故事、当时补充要求和回复；尚未送交的私有草稿不在历史中。'
            : '报价详情包含规格、价格和固定条款。确认后是一笔未付款、未签署订单。'),
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!, icon: Icons.error_outline),
        if (!widget.history && !widget.session.isOwner)
          appNotice('当前成员可以提交制作意向及查看需求报价摘要。报价详情和机构订单确认须由有权负责人办理。'),
        if (!busy &&
            !denied &&
            error == null &&
            histories.isEmpty &&
            quotes.isEmpty)
          Text(widget.history ? '暂无正式提交记录。' : '平台尚未给这份需求报价。'),
        for (final r in histories)
          Container(
              decoration: const BoxDecoration(
                  border:
                      Border(bottom: BorderSide(color: AccountTheme.border))),
              child: ListTile(
                key: ValueKey('story-history-${r.id}'),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 0, vertical: 12),
                title: Text('第 ${r.number} 次正式提交',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(tradeDate(r.data['submitted_at']),
                    style: const TextStyle(
                        fontSize: 12, color: AccountTheme.muted, height: 1.6)),
                trailing: const Icon(Icons.north_east, size: 18),
                onTap: busy ? null : () => detail(r),
              )),
        if (selected != null) ...[
          const Divider(height: 32),
          Text('第 ${selected!.data['submission_number']} 次正式提交 · 原内容',
              style:
                  const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          for (final f in selected!.template.fields)
            tradeFact(
                f.label,
                selected!.answers[f.key]?.isNotEmpty == true
                    ? selected!.answers[f.key]
                    : '（未填写）'),
          for (final item in selected!.items)
            tradeSection(
                '当时要求 · ${selected!.template.fields.firstWhere((f) => f.key == item.key).label}',
                [
                  tradeFact('原因', item.data['reason']),
                  tradeFact('请补充', item.data['instruction']),
                  tradeFact('当时正式回复', selected!.responses[item.key]),
                ]),
        ],
        for (final r in quotes)
          tradeSection('报价 ${r.id.substring(0, 8)}', [
            tradeFact('办理状态', tradeStatuses[r.data['current_status']]),
            Text(r.data['source_is_current']
                ? '对应当前正式故事版本；可否确认仍以报价审核、有效期及权限为准。'
                : '对应历史故事版本，不能据此确认新订单。'),
            OutlinedButton(
                key: ValueKey('story-quote-${r.id}'),
                onPressed: busy ||
                        !widget.session.isOwner ||
                        widget.session.tradeAccessDenied
                    ? null
                    : () => openQuote(r),
                child: const Text('查看规格、价格与条款')),
            if (r.data['order_id'] != null)
              FilledButton(
                  key: ValueKey('story-order-${r.data['order_id']}'),
                  onPressed: busy ||
                          !widget.session.isOwner ||
                          widget.session.tradeAccessDenied
                      ? null
                      : () => openQuote(r, order: true),
                  child: const Text('查看已形成的原订单')),
          ]),
        if (cursor != null)
          OutlinedButton(
              key: const ValueKey('story-related-more'),
              onPressed: busy ? null : () => load(more: true),
              child: const Text('加载更多')),
        TextButton(onPressed: busy ? null : load, child: const Text('重新读取')),
      ]);
}
