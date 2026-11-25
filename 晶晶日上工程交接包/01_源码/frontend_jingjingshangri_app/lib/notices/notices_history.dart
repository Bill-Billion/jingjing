import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/app_visual.dart';
import '../account/account_session.dart';
import '../stock/v5_support.dart';
import '../trade/trade_widgets.dart';
import 'notices_api.dart';
import 'notices_models.dart';

class NoticeHistoryPageView extends StatelessWidget {
  const NoticeHistoryPageView({super.key, required this.noticeId, required this.sourceRecordId});
  final String noticeId, sourceRecordId;
  @override
  Widget build(BuildContext context) => V5Gate(
      domain: 'notices',
      route: Uri(path: '/notices/history', queryParameters: {
        'noticeId': noticeId, 'sourceRecordId': sourceRecordId,
      }).toString(),
      showExpired: true,
      expiredLabel: '通告修订历史',
      builder: (session) => _NoticeHistory(
          session: session, noticeId: noticeId, sourceRecordId: sourceRecordId));
}

class _NoticeHistory extends StatefulWidget {
  const _NoticeHistory({required this.session, required this.noticeId, required this.sourceRecordId});
  final AccountSession session;
  final String noticeId, sourceRecordId;
  @override
  State<_NoticeHistory> createState() => _NoticeHistoryState();
}

class _NoticeHistoryState extends State<_NoticeHistory> {
  late final api = NoticesApi(widget.session);
  late (int, String?, bool) identity;
  (int, String?, bool) get currentIdentity =>
      (widget.session.epoch, widget.session.partyId, api.denied);
  int ticket = 0;
  bool busy = false, hasRead = false, publisher = false;
  String? error, cursor;
  NoticeHistorySnapshot? current;
  final items = <NoticeRevisionItem>[];
  final seenCursors = <String>{};

  @override
  void initState() {
    super.initState();
    identity = currentIdentity;
    widget.session.addListener(identityChanged);
    load();
  }

  void clearData() {
    current = null;
    items.clear();
    seenCursors.clear();
    cursor = null;
    hasRead = false;
    publisher = false;
  }

  void identityChanged() {
    if (identity == currentIdentity) return;
    identity = currentIdentity;
    ticket++;
    if (!mounted) return;
    setState(() {
      clearData();
      busy = false;
      error = '身份或权限已变化，原私有历史已清空，请重新核对。';
    });
  }

  @override
  void dispose() {
    ticket++;
    widget.session.removeListener(identityChanged);
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    if (busy || more && cursor == null) return;
    final request = ++ticket;
    final epoch = widget.session.epoch, party = widget.session.partyId;
    final after = more ? cursor : null;
    bool active() => mounted && request == ticket;
    setState(() {
      busy = true;
      error = null;
      if (!more) clearData();
    });
    try {
      final source = await api.record(widget.sourceRecordId);
      if (!active()) return;
      api.check(epoch, party);
      final ownerView = source.kind == 'NOTICE';
      final page = await api.history(widget.noticeId, source: source, cursor: after);
      if (!active()) return;
      api.check(epoch, party);
      if (more && (current == null || !current!.sameAs(page.current) ||
          publisher != ownerView)) {
        setState(() {
          clearData();
          error = '读取期间通告版本或可见范围发生变化。已清空旧历史，请重新读取。';
        });
        return;
      }
      v5Require(!page.items.any((row) => items.any((old) => old.id == row.id)));
      if (page.cursor != null) v5Require(!seenCursors.contains(page.cursor));
      setState(() {
        current = page.current;
        publisher = ownerView;
        items.addAll(page.items);
        cursor = page.cursor;
        if (page.cursor != null) seenCursors.add(page.cursor!);
        hasRead = true;
      });
    } on AccountError catch (e) {
      if (active()) {
        setState(() {
        clearData();
        error = v5Error(e);
      });
      }
    } catch (_) {
      if (active()) {
        setState(() {
        clearData();
        error = '历史记录格式未能核对，已清空本次结果，请重新读取。';
      });
      }
    } finally {
      if (active()) setState(() => busy = false);
    }
  }

  List<Widget> noticeBody(Map<String, dynamic> notice) => [
    tradeFact('类型', noticeTypes[notice['type']]),
    tradeFact('城市', notice['city']),
    tradeFact('开始', tradeDate(notice['valid_from'])),
    tradeFact('截止', tradeDate(notice['valid_until'])),
    SelectableText(notice['description']),
    for (final entry in noticeDetailFields[notice['type']]!.entries)
      tradeFact(entry.value, v5Map(notice['details'])[entry.key]),
    tradeFact('接受投稿', notice['accept_submissions'] == true ? '是' : '否'),
  ];

  @override
  Widget build(BuildContext context) => V5Frame(
      api: api, title: '通告修订历史', children: [
        tradeHeading('通告修订历史', eyebrow: '授权记录 / 只读核对', fontSize: 24),
        const Text('这里仅阅读服务器授权的历史；查看不表示接受新版，不提交修改或确认。'),
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!),
        if (hasRead && current != null) ...[
          appNotice(publisher
              ? '当前发布主体可查看修订审核记录。'
              : '当前投稿主体仅可查看获准的已通过内容，不含作者及审核人员资料。'),
          tradeSection('当前通告 · ${current!.notice['title']}', [
            tradeFact('通告对象版本', current!.raw['object_version']),
            tradeFact('当前修订记录', current!.raw['revision_id'] ?? '未关联修订记录'),
            ...noticeBody(current!.notice),
            ExpansionTile(title: const Text('当前记录依据'), children: [
              tradeFact('通告编号', current!.raw['notice_id']),
              tradeFact('内容校验', current!.raw['notice_sha256']),
            ]),
          ]),
          const Text('以下按服务器记录编号顺序分页，不代表修订发生时间顺序。'),
          if (items.isEmpty && !busy)
            appNotice('本次授权范围内尚无可读取的修订记录。'),
          for (final item in items)
            tradeSection(item.notice['title'], [
              tradeFact('审核状态', item.status == 'APPROVED' ? '修订审核通过'
                  : item.status == 'REJECTED' ? '修订未通过' : '修订待审核'),
              if (item.recordVersion != null)
                tradeFact('修订对象版本', item.recordVersion),
              if (item.reason != null) tradeFact('修订说明', item.reason),
              if (item.reviewReason != null) tradeFact('审核意见', item.reviewReason),
              ...noticeBody(item.notice),
              ExpansionTile(title: const Text('修订前快照与记录依据'), children: [
                tradeFact('修订编号', item.id),
                tradeFact('修订前对象版本', item.base.raw['object_version']),
                tradeFact('修订前关联修订', item.base.raw['revision_id']),
                tradeFact('修订前内容校验', item.base.raw['notice_sha256']),
                tradeFact('修订前标题', item.base.notice['title']),
                ...noticeBody(item.base.notice),
              ]),
            ]),
        ],
        if (!busy && !hasRead && error == null)
          const Text('尚未读取修订历史。'),
        if (cursor != null)
          tradeButton('继续读取历史', busy ? null : () => load(more: true), outline: true),
        tradeButton('重新核对并读取', busy ? null : load, outline: true),
      ]);
}
