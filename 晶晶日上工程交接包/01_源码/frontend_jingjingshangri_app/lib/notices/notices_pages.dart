import 'package:flutter/material.dart';
import '../support/collections.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../account/account_theme.dart';
import '../account/read_failure_widgets.dart';
import '../stock/v5_support.dart';
import '../stock/v5_media.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../trade/trade_widgets.dart';
import 'notices_api.dart';
import 'notices_models.dart';
import 'notices_submission.dart';

class NoticesPage extends StatelessWidget {
  const NoticesPage(
      {super.key,
      this.mode = 'catalog',
      this.id,
      this.kind,
      this.listingId,
      this.embedded = false,
      this.initialCity = ''});
  final String mode;
  final String? id, kind, listingId;
  final bool embedded;
  final String initialCity;
  @override
  Widget build(BuildContext context) => V5Gate(
      domain: 'notices',
      stateKey: mode == 'catalog' ? '/notices/catalog' : null,
      embedded: embedded,
      route: Uri(path: '/notices/$mode', queryParameters: {
        if (mode == 'records' && kind != null) 'kind': kind!,
        if (mode == 'catalog' && initialCity.isNotEmpty) 'city': initialCity,
        if (['public', 'submit'].contains(mode) && id != null) 'noticeId': id!,
        if (mode == 'record' && id != null) 'recordId': id!,
        if (mode == 'submit' && kind != null) 'kind': kind!,
        if (mode == 'submit' && listingId != null) 'listingId': listingId!,
      }).toString(),
      account: ['catalog', 'public'].contains(mode),
      showExpired: ['catalog', 'records'].contains(mode),
      expiredLabel: mode == 'records' ? '我的通告与投稿' : '通告现场',
      builder: (s) => mode == 'submit'
          ? NoticesSubmission(
              session: s,
              noticeId: id,
              listingId: listingId,
              kind: kind ?? 'PROFILE')
          : _NoticeScreen(
              session: s,
              mode: mode,
              id: id,
              kind: kind,
              embedded: embedded,
              initialCity: initialCity));
}

class _NoticeScreen extends StatefulWidget {
  const _NoticeScreen(
      {required this.session,
      required this.mode,
      this.id,
      this.kind,
      required this.embedded,
      required this.initialCity});
  final AccountSession session;
  final String mode;
  final String? id, kind;
  final bool embedded;
  final String initialCity;
  @override
  State<_NoticeScreen> createState() => _NoticeScreenState();
}

class _NoticeScreenState extends State<_NoticeScreen> {
  late final api = NoticesApi(widget.session);
  final city = TextEditingController(), at = TextEditingController();
  final publicRows = <NoticePublic>[],
      rows = <NoticeRecord>[],
      rules = <NoticeRule>[];
  NoticePublic? publicNotice;
  NoticeRecord? record;
  NoticeEligibility? eligibility;
  String? cursor, error, type, ruleId;
  String recordKind = 'SUBMISSION';
  bool busy = false, loadFailed = false, hasRead = false, changedKind = false;
  bool independentCity = false;
  String queryCity = '';
  String? queryType, queryAt;
  final ruleField = GlobalKey<FormFieldState<String>>(),
      typeField = GlobalKey<FormFieldState<String>>();
  var noticeForm = GlobalKey<V5FormState>();
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    city.text = widget.initialCity;
    recordKind = widget.kind ?? 'SUBMISSION';
    load();
  }

  @override
  void didUpdateWidget(covariant _NoticeScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.mode == 'catalog' &&
        !independentCity &&
        oldWidget.initialCity != widget.initialCity) {
      city.text = widget.initialCity.trim();
      load();
    }
  }

  Widget cityScope() =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        appNotice(
            '${independentCity ? "本页独立筛选" : "跟随广场城市"} · 当前结果：${queryCity.isEmpty ? "全部城市" : queryCity}'),
        if (independentCity)
          tradeButton('恢复跟随广场城市', () {
            setState(() {
              independentCity = false;
              city.text = widget.initialCity.trim();
            });
            load();
          }, outline: true),
      ]);

  @override
  void dispose() {
    ticket++;
    city.dispose();
    at.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    if (more && cursor == null) return;
    final t = ++ticket,
        epoch = widget.session.epoch,
        p = widget.session.partyId;
    setState(() {
      busy = true;
      error = null;
      loadFailed = false;
      if (!more) {
        queryCity = city.text.trim();
        publicRows.clear();
        rows.clear();
        publicNotice = null;
        record = null;
        cursor = null;
      }
    });
    try {
      switch (widget.mode) {
        case 'catalog':
          if (!more) {
            queryType = type;
            queryAt = at.text.trim().isEmpty ? null : v5InputDate(at.text);
          }
          final r = await api.catalog(
              cursor: more ? cursor : null,
              type: queryType,
              city: queryCity,
              at: queryAt);
          if (!mounted || t != ticket) return;
          api.check(epoch, null);
          publicRows.addAll(r.items);
          cursor = r.cursor;
        case 'public':
          final loadedNotice = await api.publicNotice(widget.id ?? '');
          if (!mounted || t != ticket) return;
          api.check(epoch, null);
          publicNotice = loadedNotice;
        case 'records':
          final r = await api.records(recordKind, cursor: more ? cursor : null);
          if (!mounted || t != ticket) return;
          api.check(epoch, p);
          rows.addAll(r.items);
          cursor = r.cursor;
        case 'record':
          final loadedRecord = await api.record(widget.id ?? '');
          if (!mounted || t != ticket) return;
          api.check(epoch, p);
          record = loadedRecord;
        case 'new':
          rules.clear();
          String? next;
          final seen = <String>{};
          do {
            final r = await api.rules(cursor: next);
            if (!mounted || t != ticket) return;
            api.check(epoch, p);
            rules.addAll(r.items);
            next = r.cursor;
            if (next != null) v5Require(seen.add(next));
          } while (next != null);
        case 'qualification':
          break;
        default:
          throw const AccountError(400, 'INVALID_PATH');
      }
      api.check(epoch, ['catalog', 'public'].contains(widget.mode) ? null : p);
      if (mounted && t == ticket) setState(() => hasRead = true);
    } on AccountError catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          error = v5Error(e);
          loadFailed = true;
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> chooseRule(String id) async {
    if (id == ruleId) return;
    if (!await canReplaceNoticeForm()) {
      ruleField.currentState?.didChange(ruleId);
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
      ruleId = id;
      eligibility = null;
      noticeForm = GlobalKey<V5FormState>();
    });
    try {
      final e = await api.eligibility(id);
      if (mounted) setState(() => eligibility = e);
    } on AccountError catch (e) {
      if (mounted) setState(() => error = v5Error(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<bool> canReplaceNoticeForm() async {
    if (api.writes > 0 || api.pending('/announcements') != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('操作结果尚未确认，请先恢复原请求核对。')));
      return false;
    }
    return await noticeForm.currentState?.confirmDiscardChanges() ?? true;
  }

  Future<void> chooseType(String? next) async {
    if (next == type) return;
    if (!await canReplaceNoticeForm()) {
      typeField.currentState?.didChange(type);
      return;
    }
    if (!mounted) return;
    setState(() {
      type = next;
      noticeForm = GlobalKey<V5FormState>();
    });
  }

  void go(String route) => Navigator.pushNamed(context, route);
  List<Widget> noticeFacts(Map<String, dynamic> n) => [
        tradeFact('类型', noticeTypes[n['type']]),
        tradeFact('城市', n['city']),
        tradeFact('说明', n['description']),
        for (final f in noticeDetailFields[n['type']]!.entries)
          tradeFact(f.value, n['details'][f.key]),
        tradeFact('开始', tradeDate(n['valid_from'])),
        tradeFact('截止', tradeDate(n['valid_until']))
      ];
  Widget _stageCard(String label, String title, String detail,
          {IconData icon = Icons.info_outline}) =>
      Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
              color: AccountTheme.surface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AccountTheme.border)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, color: AccountTheme.accent, size: 24),
            const SizedBox(width: 12),
            Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(
                      color: AccountTheme.accent, fontSize: 12,
                      fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Text(title, style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w700, height: 1.4)),
                  const SizedBox(height: 8),
                  Text(detail, style: const TextStyle(
                      color: AccountTheme.muted, fontSize: 13, height: 1.6)),
                ])),
          ]));

  String _nextStep(NoticeRecord r) {
    if (r.raw['expired'] == true) return '本记录已过期，请核对截止时间；不能继续撮合。';
    return switch (r.status) {
      'IN_REVIEW' => '申请已提交，等待有权人员独立审核。审核通过前不代表已公开发布或取得资质。',
      'PUBLISHED' => '通告已公开。可到“我的投稿与接收箱”查看实际收到的意向，后续合作仍需分别办理。',
      'SENT' => r.raw['counterparty_id'] == widget.session.partyId
          ? '请查看本次材料并回复意向。感兴趣会生成客服待办，不代表已经签约。'
          : '材料已单向送达，等待对方回复；可在本记录查看后续进度。',
      'INTERESTED' || 'WAITING_SUPPORT' => '等待有权客服接力核对合作内容；报价与付款需另行确认。',
      'LINKED' => '已关联原报价。由对应买家查看并确认，关联本身不代表付款成功。',
      'APPROVED' => '审核已通过，实际可办理范围仍以当前资格、有效期和服务器返回为准。',
      'REJECTED' => '请查看下方独立审核说明；如需再次办理，请按当前规则重新准备材料。',
      'DECLINED' || 'WITHDRAWN' || 'CLOSED' => '本次办理已结束，保留原记录供核对。',
      _ => '当前结果以本记录为准；重新读取可获取服务器最新进度。',
    };
  }

  Widget _noPoster({required double width, required double height}) => Container(
      width: width, height: height,
      decoration: BoxDecoration(color: AccountTheme.surface,
          borderRadius: BorderRadius.circular(12)),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(6),
      child: const Text('未提供\n海报', textAlign: TextAlign.center,
          style: TextStyle(color: AccountTheme.muted, fontSize: 11)));

  Future<void> _chooseSubmission(String noticeId) async {
    final epoch = widget.session.epoch, party = widget.session.partyId, t = ticket;
    final selected = await showModalBottomSheet<String>(
        context: context,
        builder: (sheetContext) => SafeArea(child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final kind in ['PROFILE', 'ROLE', 'CREATE_DRAMA'])
                ListTile(title: Text(submissionKinds[kind]!),
                    onTap: () => Navigator.pop(sheetContext, kind)),
            ])));
    if (!mounted || selected == null || busy || t != ticket ||
        epoch != widget.session.epoch || party != widget.session.partyId) return;
    go('/notices/submit?noticeId=$noticeId&kind=$selected');
  }

  Future<void> _chooseRecordKind() async {
    final epoch = widget.session.epoch, party = widget.session.partyId, t = ticket;
    final selected = await showModalBottomSheet<String>(
        context: context,
        builder: (sheetContext) => SafeArea(child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final item in const {
                'NOTICE': '我发布的通告', 'SUBMISSION': '投稿与被投稿',
                'CASE': '客服处理', 'QUALIFICATION': '机构资质',
              }.entries)
                ListTile(title: Text(item.value), selected: recordKind == item.key,
                    onTap: () => Navigator.pop(sheetContext, item.key)),
            ])));
    if (!mounted || selected == null || selected == recordKind || busy ||
        t != ticket || epoch != widget.session.epoch ||
        party != widget.session.partyId) return;
    setState(() { recordKind = selected; changedKind = true; });
    await load();
  }

  Widget _featuredNotice(NoticePublic item) => tradeSection('通告详情速览', [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 92, height: 116,
              decoration: BoxDecoration(color: AccountTheme.surface,
                  borderRadius: BorderRadius.circular(14)),
              alignment: Alignment.center,
              child: const Icon(Icons.campaign_outlined, color: AccountTheme.muted, size: 30)),
          const SizedBox(width: 16),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(item.notice['title'],
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, height: 1.4)),
            const SizedBox(height: 8),
            Text('${noticeTypes[item.notice['type']]} · ${item.notice['city']}',
                style: const TextStyle(color: AccountTheme.accent, fontSize: 12)),
            if (item.notice['details']['roles'] is String)
              Text(item.notice['details']['roles'],
                  maxLines: 3, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AccountTheme.muted, height: 1.5)),
            Text('开始 ${tradeDate(item.notice['valid_from'])}',
                style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
          ])),
        ]),
        const Divider(height: 24),
        Text(item.raw['official'] == true ? '平台官方发布' : '普通已审通告',
            style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
        tradeFact('实际截止', tradeDate(item.notice['valid_until'])),
        tradeButton('查看要求与投稿方式',
            busy || api.pendingOperations.isNotEmpty ? null
                : () => go('/notices/public?noticeId=${item.id}'), outline: true),
      ]);

  Widget _noticeDestinations() => LayoutBuilder(builder: (context, constraints) {
    final links = [
      for (final entry in [
        ('共创活动', '/cocreation'),
        ('晶钻权益', '/redemption?view=catalog'),
        ('月度评选', '/engagement?view=rankings'),
      ])
        OutlinedButton(
            onPressed: busy || api.pendingOperations.isNotEmpty ? null : () => go(entry.$2),
            child: Text(entry.$1, textAlign: TextAlign.center)),
    ];
    if (constraints.maxWidth < 340 || MediaQuery.textScalerOf(context).scale(14) > 20) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: links);
    }
    return Row(children: [
      for (var i = 0; i < links.length; i++) ...[
        if (i > 0) const SizedBox(width: 8),
        Expanded(child: links[i]),
      ],
    ]);
  });

  Widget _noticeRow(NoticePublic item) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
          color: AccountTheme.surface,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: const BorderSide(color: AccountTheme.border)),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
              key: ValueKey('notice-catalog-${item.id}'),
              onTap: busy ? null : () => go('/notices/public?noticeId=${item.id}'),
              child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Row(children: [
                    Expanded(child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(noticeTypes[item.notice['type']]!,
                              style: const TextStyle(fontSize: 12,
                                  color: AccountTheme.accent,
                                  fontWeight: FontWeight.w600)),
                          const SizedBox(height: 10),
                          Text(item.notice['title'],
                              style: const TextStyle(fontSize: 18,
                                  fontWeight: FontWeight.w700, height: 1.4)),
                          const SizedBox(height: 8),
                          Text('${item.notice['city']} · 截止 ${tradeDate(item.notice['valid_until'])}',
                              style: const TextStyle(fontSize: 12,
                                  color: AccountTheme.muted, height: 1.5)),
                          const SizedBox(height: 8),
                          Text(item.notice['description'], maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13,
                                  color: AccountTheme.muted, height: 1.6)),

                        ])),
                    const SizedBox(width: 12),
                    const Icon(Icons.arrow_forward_rounded,
                        color: AccountTheme.accent, size: 22),
                  ])))));

  @override
  Widget build(BuildContext context) {
    final r = record, n = publicNotice;
    final title = switch (widget.mode) {
      'new' => '发布一条通告',
      'public' => '通告详情',
      'record' => '投稿与客服进度',
      'records' => recordKind == 'NOTICE' ? '我的通告' : recordKind == 'SUBMISSION' ? '投稿与意向' : '我的通告与投稿',
      'qualification' => '机构发布资格',
      _ => '通告现场'
    };
    if (busy &&
        !hasRead &&
        ['catalog', 'records'].contains(widget.mode) &&
        publicRows.isEmpty &&
        rows.isEmpty &&
        api.pendingOperations.isEmpty &&
        city.text.isEmpty &&
        at.text.isEmpty &&
        type == null &&
        !changedKind) {
      return V5Frame(
          plaza: ['catalog', 'public', 'record'].contains(widget.mode),
          api: api,
          title: title,
          embedded: widget.embedded,
          children: [ReadLoadingContent(label: title)]);
    }
    if (loadFailed &&
        !busy &&
        error != null &&
        ['catalog', 'records'].contains(widget.mode) &&
        publicRows.isEmpty &&
        rows.isEmpty &&
        api.pendingOperations.isEmpty) {
      return V5Frame(
          plaza: ['catalog', 'public', 'record'].contains(widget.mode),
          api: api,
          title: title,
          embedded: widget.embedded,
          footer: ReadFailureActions(
              onBack: () => setState(() => loadFailed = false),
              onRetry: () => load()),
          children: [ReadFailureContent(reason: error!)]);
    }
    return V5Frame(
        plaza: ['catalog', 'public', 'record'].contains(widget.mode),
        api: api,
        title: title,
        embedded: widget.embedded,
        footer: n != null
            ? CollectionDetailActions(
                key: ValueKey('notice-save:${n.id}'),
                session: widget.session,
                kind: 'NOTICE',
                targetId: n.id,
                purchaseAction: FilledButton(
                    onPressed: busy || n.notice['accept_submissions'] != true
                        ? null : () => _chooseSubmission(n.id),
                    child: Text(n.notice['accept_submissions'] == true
                        ? '选择投稿方式' : '当前未开放投稿')))
            : widget.mode == 'records'
                ? LayoutBuilder(builder: (context, constraints) {
                    final filter = OutlinedButton(
                        onPressed: busy ? null : _chooseRecordKind,
                        child: const Text('筛选记录类型'));
                    final publish = FilledButton(
                        onPressed: busy ? null : () => go('/notices/new'),
                        child: const Text('发布通告'));
                    if (constraints.maxWidth < 340 ||
                        MediaQuery.textScalerOf(context).scale(14) > 20) {
                      return Column(mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [filter, const SizedBox(height: 8), publish]);
                    }
                    return Row(children: [Expanded(child: filter),
                      const SizedBox(width: 10), Expanded(child: publish)]);
                  })
                : null,
        children: [
          if (widget.mode == 'catalog') ...[
            Row(children: [
              Expanded(
                  child: Semantics(
                      header: true,
                      child: const Text('通告',
                          style: TextStyle(
                              fontFamily: AccountTheme.sans,
                              fontSize: 28,
                              height: 1.1,
                              fontWeight: FontWeight.w900)))),
              OutlinedButton(
                  onPressed: busy ? null : () => go('/notices/new'),
                  child: const Text('发布 ＋')),
            ]),
            const SizedBox(height: 16),
            const Text('六类公开通告，按城市与有效时间浏览。',
                style: TextStyle(fontSize: 14, color: AccountTheme.muted)),
            const SizedBox(height: 12),
            const SizedBox(height: 20),
          ] else if (n == null)
            tradeHeading(r == null ? title : noticeStates[r.status] ?? title,
                fontSize: 28,
                eyebrow: '通告与合作 · 每一步有据可查'),
          V5RecoveryPanel(
              api: api,
              label: api.recoveryLabel,
              restore: api.restoreOperation,
              onRestored: (r) => go('/notices/record?recordId=${r['id']}')),
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!, icon: Icons.error_outline),
          if (widget.mode == 'catalog') ...[
            SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final e in <String, String>{'': '全部', ...noticeTypes}.entries)
                    Container(
                        decoration: BoxDecoration(border: Border(bottom: BorderSide(
                            color: (type ?? '') == e.key ? AccountTheme.accent : Colors.transparent,
                            width: 2))),
                        child: TextButton(
                            onPressed: busy ? null : () {
                              setState(() => type = e.key.isEmpty ? null : e.key);
                              load();
                            },
                            child: Text(e.value, style: TextStyle(
                                color: (type ?? '') == e.key
                                    ? AccountTheme.accent : AccountTheme.text)))),
                ])),
            const SizedBox(height: 20),
            cityScope(),
            TextField(
                controller: city,
                onChanged: (_) => setState(() => independentCity = true),
                decoration: const InputDecoration(labelText: '城市（可留空）')),
            v5DateField(context,
                label: '指定有效时间（可留空）',
                value: at.text,
                controller: at,
                enabled: !busy,
                required: false,
                onChanged: (v) => setState(() => at.text = v)),
            tradeButton('筛选通告', busy ? null : () => load(), outline: true),
            if (publicRows.isNotEmpty) _featuredNotice(publicRows.first),
            const SizedBox(height: 16),
            _noticeDestinations(),
            tradeButton('我的演出与参演',
                busy || api.pendingOperations.isNotEmpty ? null : () => go('/projects/list'),
                outline: true),
            if (publicRows.length > 1) ...[
              const SizedBox(height: 20),
              const Text('其他公开通告',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              for (final item in publicRows.skip(1)) _noticeRow(item),
            ],
            if (!busy && error == null && publicRows.isEmpty)
              appNotice(cursor == null
                  ? '当前筛选没有仍有效的已审公开通告。'
                  : '本页没有符合条件的通告，可继续读取下一页。'),
            tradeButton('核对资格并发布通告', () => go('/notices/new')),
            tradeButton(
                '我的投稿与接收箱', () => go('/notices/records?kind=SUBMISSION'),
                outline: true),
            tradeButton('我的已发通告', () => go('/notices/records?kind=NOTICE'),
                outline: true),
            tradeButton('合作客服处理', () => go('/notices/records?kind=CASE'),
                outline: true),
          ],
          if (n != null) ...[
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${noticeTypes[n.notice['type']]} / ${n.notice['city']}',
                    style: const TextStyle(fontSize: 12, color: AccountTheme.accent)),
                const SizedBox(height: 12),
                Text(n.notice['title'], style: const TextStyle(
                    fontSize: 28, fontWeight: FontWeight.w900, height: 1.4)),
              ])),
              const SizedBox(width: 16),
              _noPoster(width: 78, height: 104),
            ]),
            const SizedBox(height: 24),
            tradeSection('通告要求', [
              Text(n.notice['description'],
                  style: const TextStyle(fontSize: 15, height: 1.7)),
              const Divider(height: 28),
              if (n.notice['type'] != 'DRAMA')
                for (final f in noticeDetailFields[n.notice['type']]!.entries)
                  tradeFact(f.value, n.notice['details'][f.key]),
              tradeFact('开始', tradeDate(n.notice['valid_from'])),
              tradeFact('截止', tradeDate(n.notice['valid_until'])),
            ]),
            if (n.notice['type'] == 'DRAMA')
              tradeSection('剧目介绍与角色需求', [
                Text(n.notice['details']['synopsis'],
                    style: const TextStyle(fontSize: 15, height: 1.7)),
                const Divider(height: 24),
                const Text('招募角色', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text(n.notice['details']['roles'],
                    style: const TextStyle(color: AccountTheme.muted, height: 1.6)),
                const SizedBox(height: 12),
                const Text('这是通告中的剧目介绍，不是已确认演员名录或制作进度。',
                    style: TextStyle(color: AccountTheme.muted, fontSize: 12, height: 1.6)),
              ]),
            tradeSection('发布方', [
              Text(n.raw['official'] == true ? '平台官方发布' : '已审通告发布方',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              const Text('发布方资料暂未提供。',
                  style: TextStyle(color: AccountTheme.muted, fontSize: 12, height: 1.6)),
            ]),
            tradeSection('招募与制作', [
              tradeFact('公开投稿', n.notice['accept_submissions'] == true
                  ? '接受投稿，提交时仍需核对原通告资格与有效期' : '未开放投稿'),
              const Text('暂未提供定角与拍摄进度。',
                  style: TextStyle(color: AccountTheme.muted, fontSize: 12, height: 1.6)),
              if (n.notice['project_id'] != null)
                const Text('关联剧目详情暂未开放。'),
            ]),
            appNotice(n.raw['official'] == true
                ? '此为平台官方发布；普通机构不能冒用官方身份。'
                : '通告经独立审核。投稿仅单向递交，不自动付款、签约或开放私聊。'),
            _stageCard('下一步',
                n.notice['accept_submissions'] == true ? '选择合适的投稿方式' : '查看公开信息',
                n.notice['accept_submissions'] == true
                    ? '投递前需确认本人与形象授权，提交后可在“我的投稿与接收箱”查看结果。'
                    : '本通告未开放投稿，仅展示发布方提供的信息。',
                icon: Icons.send_outlined),
            AnimatedBuilder(
                animation: api,
                builder: (context, _) {
                  final locked = busy || api.writes > 0 ||
                      api.pendingOperations.isNotEmpty;
                  return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        tradeButton('我的收藏与浏览记录',
                            locked ? null : () => go('/saved'), outline: true),
                        tradeButton('反馈或举报这份内容',
                            locked ? null : () => go(
                                '/support/new?domain=NOTICE_PUBLIC&recordId=${n.id}'),
                            outline: true),
                      ]);
                }),
          ],
          if (widget.mode == 'new') ...[
            _stageCard('发布权限', '成年实名可提交普通通告',
                '选择已生效规则后，由服务器核对成年实名、账号状态及可发布类型。普通实名发布不要求充值星探；机构资格和历史规则分别核验。',
                icon: Icons.campaign_outlined),
            appNotice('提交后仍需独立审核，不会立即公开。平台官方事项仅由有权运营在网页办理。'),
            DropdownButtonFormField<String>(
                key: ruleField,
                initialValue: ruleId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: '选择已生效发布规则'),
                items: rules
                    .map((x) => DropdownMenuItem(
                        value: x.id,
                        child: Text(
                            '${x.rule['version']} · 投稿${x.rule['submission_days']}天${x.ordinaryPublishing ? " · 普通实名发布" : ""}')))
                    .toList(),
                onChanged: busy ? null : (v) => chooseRule(v!)),
            if (ruleId != null) ...[
              tradeSection('本版规则', [
                SelectableText(
                    rules.firstWhere((x) => x.id == ruleId).rule['terms']),
                if (eligibility != null) ...[
                  tradeFact(
                      '可发布类型',
                      (eligibility!.raw['types'] as List)
                          .map((t) => noticeTypes[t])
                          .join('、')),
                  if (rules
                          .firstWhere((x) => x.id == ruleId)
                          .ordinaryPublishing &&
                      widget.session.party?['kind'] != 'ORGANIZATION')
                    appNotice('普通发布按成年实名、当前账号状态和可发布类型核验，无需充值星探。')
                  else
                    tradeFact('本版规则资格等级', eligibility!.raw['level']),
                  tradeFact('核验说明', eligibility!.raw['reason'] ??
                          (eligibility!.raw['active'] == true ? '当前资格有效' : '当前资格不可用，请核对所选规则'))
                ]
              ]),
              if (eligibility != null && eligibility!.raw['active'] != true)
                appNotice(widget.session.party?['kind'] == 'ORGANIZATION'
                    ? '当前机构未取得本类发布资格，请核对资质、授权与有效期。'
                    : rules.firstWhere((x) => x.id == ruleId).ordinaryPublishing
                        ? '当前未满足普通发布条件，请核对成年实名、身份有效期和账号状态。充值不能代替核验。'
                        : '当前选择的是历史星探规则。普通发布请选择标有“普通实名发布”的已生效规则；历史通告仍按原规则办理。'),
              if (!rules.firstWhere((x) => x.id == ruleId).ordinaryPublishing &&
                  widget.session.party?['kind'] != 'ORGANIZATION')
                tradeButton('查看历史会员资格', () => go('/wallet'), outline: true),
              if (widget.session.party?['kind'] == 'ORGANIZATION')
                tradeButton('申请机构发布资格', () => go('/notices/qualification'),
                    outline: true)
            ],
            if (eligibility != null) ...[
              const Text('本次可发布类型',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              for (final value in (eligibility!.raw['types'] as List)
                  .where((x) => x != 'OFFICIAL'))
                Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Material(
                        color: type == value ? AccountTheme.selectedSurface : AccountTheme.surface,
                        borderRadius: BorderRadius.circular(14),
                        child: ListTile(
                            title: Text(noticeTypes[value]!),
                            trailing: Icon(type == value
                                ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                                color: AccountTheme.accent),
                            onTap: busy || type == value ? null : () => chooseType(value)))),
              const SizedBox(height: 16),
              appNotice('提交后先进入审核，审核通过前不会公开。本页不提供独立草稿保存；离开时会核对未提交内容。'),
              if (type != null && eligibility!.canPublish(type!))
                _noticeForm(type!)
            ],
          ],
          if (widget.mode == 'qualification') ...[
            if (widget.session.party?['kind'] != 'ORGANIZATION')
              appNotice('此项仅适用于机构负责人；个人请返回发布页，选择适用的已生效规则核对资格。')
            else
              V5Form(
                  api: api,
                  title: '机构资质',
                  action: '提交机构独立资质审核',
                  suffix: '/qualifications',
                  fields: [
                    for (final e in noticeTypes.entries
                        .where((x) => x.key != 'OFFICIAL'))
                      V5Field('type_${e.key}', '申请发布${e.value}',
                          type: 'bool', required: false),
                    const V5Field('valid_from', '资质生效时间', type: 'datetime'),
                    const V5Field('valid_until', '资质截止时间', type: 'datetime'),
                    const V5Field('terms', '资质与业务范围', type: 'multiline')
                  ],
                  restore: (b) => {
                        ...b,
                        for (final t in b['types']) 'type_$t': true,
                        'evidence_asset_ids':
                            (b['evidence_asset_ids'] as List).join(', ')
                      },
                  buildBody: (v) {
                    final types = noticeTypes.keys
                        .where((k) => k != 'OFFICIAL' && v['type_$k'] == true)
                        .toList();
                    final ids = v5InputIds(v['evidence_asset_ids'] ?? '');
                    if (types.isEmpty || ids.isEmpty) {
                      throw const AccountError(
                          400, 'NOTICE_QUALIFICATION_INVALID');
                    }
                    return {
                      'types': types,
                      'valid_from': v5InputDate(v['valid_from']),
                      'valid_until': v5InputDate(v['valid_until']),
                      'terms': v['terms'],
                      'evidence_asset_ids': ids
                    };
                  },
                  parse: api.validateRecord,
                  onSuccess: (d) => go('/notices/record?recordId=${d['id']}'),
                  extra: (v, set, enabled) => [
                        SupplyFiles(
                            api: SupplyApi(widget.session),
                            purpose: 'RIGHTS_EVIDENCE',
                            ids: v5InputIds(v['evidence_asset_ids'] ?? ''),
                            enabled: enabled,
                            onChanged: (ids) =>
                                set('evidence_asset_ids', ids.join(', ')))
                      ])
          ],
          if (widget.mode == 'records') ...[
            _stageCard('我的办理记录', '查看结果，接续下一步',
                '按记录类型分页读取当前身份发出或收到的通告与意向。状态显示以每条真实记录为准，不将当前页当作全部记录。',
                icon: Icons.inbox_outlined),
            DropdownButtonFormField<String>(
                initialValue: recordKind,
                decoration: const InputDecoration(labelText: '查看本人记录'),
                items: const [
                  DropdownMenuItem(value: 'SUBMISSION', child: Text('投稿与被投稿')),
                  DropdownMenuItem(value: 'NOTICE', child: Text('我发布的通告')),
                  DropdownMenuItem(value: 'CASE', child: Text('客服处理')),
                  DropdownMenuItem(value: 'QUALIFICATION', child: Text('机构资质'))
                ],
                onChanged: busy
                    ? null
                    : (v) {
                        setState(() {
                          recordKind = v!;
                          changedKind = true;
                        });
                        load();
                      }),
            for (final x in rows)
              Container(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  decoration: const BoxDecoration(border: Border(
                      bottom: BorderSide(color: AccountTheme.border))),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    x.kind == 'NOTICE' ? _noPoster(width: 60, height: 80)
                        : Container(width: 60, height: 80,
                            decoration: BoxDecoration(color: AccountTheme.surface,
                                borderRadius: BorderRadius.circular(12)),
                            alignment: Alignment.center,
                            child: Icon(x.kind == 'SUBMISSION'
                                ? Icons.person_outline : Icons.description_outlined,
                                color: AccountTheme.muted)),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(x.title, style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      if (x.kind == 'NOTICE')
                        Text('${noticeTypes[x.data['notice']['type']]} · ${x.data['notice']['city']} · 截止 ${tradeDate(x.data['notice']['valid_until'])}',
                            style: const TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.5)),
                      if (x.kind != 'SUBMISSION')
                        Text(noticeStates[x.status] ?? x.status,
                            style: const TextStyle(fontSize: 12, color: AccountTheme.accent)),
                      Text(x.raw['owner_party_id'] == widget.session.partyId
                          ? '我发出' : '我接收',
                          style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
                      const SizedBox(height: 6),
                      Text(_nextStep(x), style: const TextStyle(
                          fontSize: 12, color: AccountTheme.muted, height: 1.6)),
                      TextButton(onPressed: busy ? null
                          : () => go('/notices/record?recordId=${x.id}'),
                          child: const Text('查看具体进度')),
                    ])),
                    if (x.kind == 'SUBMISSION') ...[
                      const SizedBox(width: 8),
                      Flexible(child: Text(noticeStates[x.status] ?? x.status,
                          textAlign: TextAlign.right,
                          style: const TextStyle(fontSize: 12, color: AccountTheme.accent))),
                    ],
                  ])),
            if (recordKind == 'NOTICE') ...[
              const SizedBox(height: 20),
              tradeSection('关联业务', [
                tradeButton('查看收到的投稿与意向',
                    busy ? null : () => go('/notices/records?kind=SUBMISSION'),
                    outline: true),
                tradeButton('发布新通告', busy ? null : () => go('/notices/new')),
              ]),
            ],
            if (!busy && error == null && rows.isEmpty)
              appNotice('当前没有本类型的可读记录。'),
          ],
          if (r != null) ..._recordBody(r),
          if (cursor != null)
            tradeButton('继续读取下一页', busy ? null : () => load(more: true),
                outline: true),
          tradeButton('重新读取', busy ? null : () => load(), outline: true),
        ]);
  }

  Widget _noticeForm(String type) => V5Form(
      key: noticeForm,
      api: api,
      title: '${noticeTypes[type]} · 通告内容',
      action: '提交正式通告审核',
      suffix: '/announcements',
      initial: {'type': type},
      restore: (b) => {...v5Map(b['notice']), ...v5Map(b['notice']['details'])},
      fields: [
        const V5Field('title', '通告标题'),
        const V5Field('city', '发生城市'),
        const V5Field('valid_from', '开始时间', type: 'datetime'),
        const V5Field('description', '通告内容与合作要求', type: 'multiline'),
        const V5Field('valid_until', '截止时间', type: 'datetime'),
        for (final e in noticeDetailFields[type]!.entries)
          V5Field(e.key, e.value, type: 'multiline'),
        if (['DRAMA', 'RECRUITMENT'].contains(type))
          const V5Field('accept_submissions', '接受单向投稿',
              type: 'bool', required: false)
      ],
      buildBody: (v) => {
            'rule_id': ruleId,
            'notice': {
              'type': type,
              'title': v['title'],
              'description': v['description'],
              'city': v['city'],
              'valid_from': v5InputDate(v['valid_from']),
              'valid_until': v5InputDate(v['valid_until']),
              'details': {
                for (final k in noticeDetailFields[type]!.keys) k: v[k]
              },
              'project_id': null,
              'accept_submissions': ['DRAMA', 'RECRUITMENT'].contains(type) &&
                  v['accept_submissions'] == true
            }
          },
      parse: api.validateRecord,
      onSuccess: (d) => Navigator.pushReplacementNamed(
          context, '/notices/record?recordId=${d['id']}'));
  List<Widget> _recordBody(NoticeRecord r) => [
        Text(noticeStates[r.status] ?? r.status,
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        tradeSection('当前办理进度', [
          Text(_nextStep(r), style: const TextStyle(fontSize: 15, height: 1.7)),
          const Divider(height: 24),
          tradeFact('本记录版本', r.version),
        ]),
        tradeSection(r.title, [
          tradeFact('当前状态', noticeStates[r.status]),
          if (r.raw['expired'] == true) appNotice('本投稿已经过期，不能继续撮合。'),
          if (r.data['review'] != null)
            tradeFact('独立审核说明', r.data['review']['reason'])
        ]),
        if (r.kind == 'NOTICE')
          tradeSection('本次通告内容', noticeFacts(v5Map(r.data['notice']))),
        if (r.raw['owner_party_id'] == widget.session.partyId &&
            (r.kind == 'NOTICE' || r.kind == 'SUBMISSION' &&
                v5Id(r.data['submission']['notice_id']) &&
                r.raw['parent_id'] == r.data['submission']['notice_id']))
          tradeButton('查看授权修订历史',
              busy || api.pendingOperations.isNotEmpty ? null : () => go(
                  Uri(path: '/notices/history', queryParameters: {
                    'noticeId': r.kind == 'NOTICE' ? r.id : r.data['submission']['notice_id'] as String,
                    'sourceRecordId': r.id,
                  }).toString()), outline: true),

        if (r.kind == 'SUBMISSION' &&
            r.raw['owner_party_id'] == widget.session.partyId &&
            v5Id(r.data['submission']['notice_id']) &&
            r.raw['parent_id'] == r.data['submission']['notice_id'])
          tradeButton('阅读通告新版并明确确认',
              busy || api.writes > 0 ? null : () => go(
                  '/notices/notice-confirmation?recordId=${r.id}'), outline: true),
        if (r.kind == 'SUBMISSION') ...[
          Text(r.status == 'SENT' ? '待回应投稿' : '本次投稿进度',
              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          if (r.data['submission']['notice_id'] != null)
            tradeButton('查看关联通告',
                () => go('/notices/public?noticeId=${r.data['submission']['notice_id']}'),
                outline: true),
          tradeSection('本次人物与数字人', [
            const Text('本次指定真人及获准数字人',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            const Text('人物名称与头像暂未提供，请核对本次记录及已递交材料。',
                style: TextStyle(color: AccountTheme.muted, height: 1.6)),
          ]),
          tradeSection('投稿用途与说明', [
            tradeFact('用途', r.data['submission']['purpose']),
            tradeFact('内容', r.data['submission']['content']),
            if (r.data['submission']['role'] != null)
              tradeFact('角色', r.data['submission']['role']),
            tradeFact('截止', tradeDate(r.data['expires_at'])),
            ExpansionTile(
                tilePadding: EdgeInsets.zero,
                childrenPadding: const EdgeInsets.only(bottom: 12),
                title: const Text('记录依据'),
                children: [
                  for (final entry in const {
                    'person_id': '真人记录',
                    'avatar_id': '数字人记录'
                  }.entries)
                    tradeFact(entry.value,
                        '${(r.data['submission'][entry.key] as String).substring(0, 8)}…${(r.data['submission'][entry.key] as String).substring(30)}')
                ])
          ]),
          for (final id in r.data['submission']['material_asset_ids'])
            V5Media(
                api: api,
                type: 'file',
                fileName: '$id.bin',
                label: '读取本次私有附件',
                load: () => api.bytes('/records/${r.id}/materials/$id',
                    max: 8 * 1024 * 1024)),
          tradeSection('审阅与回应', [
            const Text('先核对本次用途、角色及已递交材料，再明确回应意向。',
                style: TextStyle(fontSize: 15, height: 1.6)),
            const Divider(height: 24),
            const Text('感兴趣只生成一次平台客服待办；没有自由聊天、付款、签约或授角事实。',
                style: TextStyle(color: AccountTheme.muted, height: 1.6)),
          ]),
          if (r.status == 'SENT' &&
              r.raw['counterparty_id'] == widget.session.partyId &&
              r.raw['expired'] != true)
            V5Form(
                // A self-owned record can also expose the withdrawal form.
                // Keep both inline rather than selecting one primary action.
                actionInFooter: r.raw['owner_party_id'] != widget.session.partyId,
                canSubmit: !busy,
                api: api,
                title: '本次意向回复',
                action: '确认本次回复',
                suffix: '/submissions/${r.id}/decision',
                version: r.version,
                fields: const [
                  V5Field('decision', '本次回复',
                      choices: {'INTERESTED': '感兴趣，交给客服', 'DECLINE': '婉拒并结束'})
                ],
                buildBody: (v) => {'decision': v['decision']},
                parse: api.validateRecord,
                reload: () async => (await api.record(r.id)).version,
                onSuccess: (_) => load()),
          if (r.data['case_id'] != null)
            tradeButton('查看同一客服工单',
                () => go('/notices/record?recordId=${r.data['case_id']}'),
                outline: true),
          if (r.status == 'INTERESTED' &&
              r.data['submission']['kind'] == 'INVITATION' &&
              r.raw['owner_party_id'] == widget.session.partyId)
            tradeButton('查看本邀约可匹配的试镜方案',
                () => go('/auditions/catalog?invitationId=${r.id}'),
                outline: true),
        ],
        if (r.kind == 'CASE') ...[
          Text(r.status == 'WAITING_SUPPORT' ? '等待客服对接' : '客服处理记录',
              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          const Text('以下是本次客服记录的实际进展；关联报价或合同不代表已经签署，正式订单的沟通权限另行核对。',
              style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.6)),
          const SizedBox(height: 16),
          tradeSection('本次对接', [
            Text(r.status == 'WAITING_SUPPORT'
                ? '等待有权客服核对双方、具体数字人和已审商单报价。'
                : '客服办理状态以本记录为准；报价另由买家确认。',
                style: const TextStyle(fontSize: 15, height: 1.7)),
            const Divider(height: 24),
            const Text('暂不提供即时聊天或在本页补充材料；原投稿与已关联业务可继续核对。',
                style: TextStyle(color: AccountTheme.muted, height: 1.6)),
          ]),
          if (r.data['quote'] != null) ...[
            tradeFact('原报价指纹', r.data['quote']['content_sha256']),
            if (r.data['quote']['buyer_party_id'] == widget.session.partyId)
              tradeButton('查看并确认原已审报价',
                  () => go('/trade/record?recordId=${r.data['quote']['id']}'))
          ],
          if (r.raw['order_id'] != null)
            tradeButton('查看原订单',
                () => go('/trade/record?recordId=${r.raw['order_id']}'),
                outline: true),
          tradeButton('查看原投稿',
              () => go('/notices/record?recordId=${r.data['submission_id']}'),
              outline: true)
        ],
        if (r.kind == 'QUALIFICATION') ...[
          tradeFact('申请类型',
              (r.data['types'] as List).map((t) => noticeTypes[t]).join('、')),
          tradeFact('有效开始', tradeDate(r.data['valid_from'])),
          tradeFact('有效截止', tradeDate(r.data['valid_until'])),
          tradeFact('业务范围', r.data['terms'])
        ],
        if (r.raw['owner_party_id'] == widget.session.partyId &&
            ['NOTICE', 'SUBMISSION', 'QUALIFICATION'].contains(r.kind) &&
            !['WITHDRAWN', 'REJECTED'].contains(r.status))
          V5Form(
              api: api,
              title: '撤回本记录',
              action: '明确撤回本记录',
              suffix: '/records/${r.id}/close',
              version: r.version,
              fields: const [V5Field('reason', '撤回原因', type: 'multiline')],
              buildBody: (v) => {'reason': v['reason']},
              parse: api.validateRecord,
              reload: () async => (await api.record(r.id)).version,
              onSuccess: (_) => load()),
      ];
}
