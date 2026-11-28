import 'auditions_visual.dart';
import '../contract_six/contract_six_models.dart';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../account/account_theme.dart';
import '../stock/v5_support.dart';
import '../stock/v5_media.dart';
import '../trade/trade_widgets.dart';
import 'auditions_api.dart';
import 'auditions_models.dart';
import 'auditions_actions.dart';
import 'auditions_offer_form.dart';

class AuditionsPage extends StatelessWidget {
  const AuditionsPage(
      {super.key,
      this.mode = 'catalog',
      this.id,
      this.action,
      this.invitationId,
      this.embedded = false,
      this.initialCity = ''});
  final String mode;
  final String? id, action, invitationId;
  final bool embedded;
  final String initialCity;

  String get returnRoute {
    final query = {
      if (['book', 'offer'].contains(mode) && v5Id(id)) 'offerId': id!,
      if (['booking', 'messages', 'action'].contains(mode) && v5Id(id))
        'bookingId': id!,
      if (['catalog', 'book'].contains(mode) && v5Id(invitationId))
        'invitationId': invitationId!,
      if (mode == 'catalog' && initialCity.trim().isNotEmpty)
        'city': initialCity.trim(),
      if (mode == 'action' &&
          const [
            'decision',
            'travel',
            'delivery',
            'cancel',
            'dispute-evidence',
            'reschedule',
            'reschedule-response',
            'contact',
            'support',
            'supplements',
            'baseplate'
          ].contains(action))
        'action': action!,
    };
    return Uri(
            path: '/auditions/$mode',
            queryParameters: query.isEmpty ? null : query)
        .toString();
  }

  @override
  Widget build(BuildContext context) => V5Gate(
      domain: 'auditions',
      embedded: embedded,
      route: returnRoute,
      stateKey:
          mode == 'catalog' ? '/auditions/catalog:${invitationId ?? ''}' : null,
      account: mode == 'catalog',
      builder: (s) => mode == 'action'
          ? AuditionActionPage(session: s, id: id ?? '', action: action ?? '')
          : mode == 'new'
              ? AuditionOfferForm(session: s)
              : _AuditionsScreen(
                  session: s,
                  mode: mode,
                  id: id,
                  invitationId: invitationId,
                  embedded: embedded,
                  initialCity: initialCity));
}

List<Widget> auditionAppointmentFacts(Map<String, dynamic> d) => [
      tradeFact('形式', d['mode'] == 'OFFLINE' ? '线下正规场地试镜' : '线上材料试镜'),
      tradeFact('城市', d['city']),
      tradeFact('场地', d['venue']),
      tradeFact('地址', d['address']),
      tradeFact('开始', tradeDate(d['starts_at'])),
      tradeFact('结束', tradeDate(d['ends_at'])),
      tradeFact('实际用途', d['purpose'])
    ];

class _AuditionsScreen extends StatefulWidget {
  const _AuditionsScreen(
      {required this.session,
      required this.mode,
      this.id,
      this.invitationId,
      required this.embedded,
      required this.initialCity});
  final AccountSession session;
  final String mode;
  final String? id, invitationId;
  final bool embedded;
  final String initialCity;
  @override
  State<_AuditionsScreen> createState() => _AuditionsScreenState();
}

class _AuditionsScreenState extends State<_AuditionsScreen> {
  late final api = AuditionsApi(widget.session);
  final city = TextEditingController(),
      offers = <AuditionOffer>[],
      records = <AuditionRecord>[],
      messages = <AuditionRecord>[],
      supplements = <AuditionRecord>[],
      opened = <String>{};
  AuditionOffer? offer;
  AuditionRecord? record;
  Map<String, dynamic>? contacts, itinerary;
  String? cursor, messageCursor, error, notice;
  bool busy = false;
  bool independentCity = false;
  String queryCity = '';
  int ticket = 0, messageForm = 0;
  @override
  void initState() {
    super.initState();
    city.text = widget.initialCity;
    load();
  }

  @override
  void didUpdateWidget(covariant _AuditionsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.mode == 'catalog' &&
        widget.invitationId == null &&
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
    opened.clear();
    contacts = null;
    itinerary = null;
    super.dispose();
  }

  void setRecord(AuditionRecord r) {
    if (record?.id == r.id && record!.version > r.version) return;
    if (record == null ||
        jsonEncode(record!.data['delivery']) !=
            jsonEncode(r.data['delivery'])) {
      opened.clear();
    }
    if (record?.conversation != r.conversation) {
      contacts = null;
      itinerary = null;
    }
    record = r;
  }

  Future<int?> latest() async {
    final t = ticket, epoch = widget.session.epoch, p = widget.session.partyId;
    final id = widget.id ?? '';
    final r = await api.record(id);
    api.check(epoch, p);
    if (!mounted || t != ticket || widget.id != id) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
    setState(() => setRecord(r));
    return record!.version;
  }

  void mergeMessages(List<AuditionRecord> incoming) {
    final merged = {for (final row in messages) row.id: row};
    for (final row in incoming) {
      final old = merged[row.id];
      if (old == null || row.version >= old.version) merged[row.id] = row;
    }
    messages..clear()..addAll(merged.values);
  }

  Future<void> load({bool more = false}) async {
    if (more && cursor == null) return;
    final t = ++ticket,
        epoch = widget.session.epoch,
        p = widget.session.partyId;
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        queryCity = city.text.trim();
        offers.clear();
        records.clear();
        cursor = null;
        contacts = null;
        itinerary = null;
        if (widget.mode == 'booking') supplements.clear();
        if (widget.mode == 'messages') {
          messages.clear();
          messageCursor = null;
        }
      }
    });
    try {
      switch (widget.mode) {
        case 'catalog':
          final r = await api.catalog(
              cursor: more ? cursor : null,
              city: queryCity,
              invitationId: widget.invitationId);
          if (!mounted || t != ticket) return;
          api.check(epoch, null);
          offers.addAll(r.items);
          cursor = r.cursor;
        case 'book':
          final loadedOffer = await api.offer(widget.id ?? '',
              invitationId: widget.invitationId);
          if (!mounted || t != ticket) return;
          api.check(epoch, p);
          offer = loadedOffer;
        case 'bookings':
        case 'offers':
          final r = await api.records(
              widget.mode == 'offers' ? 'OFFER' : 'BOOKING',
              cursor: more ? cursor : null);
          if (!mounted || t != ticket) return;
          api.check(epoch, p);
          final merged = {for (final row in records) row.id: row};
          for (final row in r.items) {
            final old = merged[row.id];
            if (old == null || row.version >= old.version) merged[row.id] = row;
          }
          records..clear()..addAll(merged.values);
          cursor = r.cursor;
        case 'offer':
          final loaded = await api.record(widget.id ?? '');
          if (!mounted || t != ticket) return;
          api.check(epoch, p);
          setRecord(loaded);
        case 'booking':
        case 'messages':
          final loaded = await api.record(widget.id ?? '');
          if (!mounted || t != ticket) return;
          api.check(epoch, p);
          if (loaded.kind != 'BOOKING') {
            throw const AccountError(400, 'INVALID_ACTION');
          }
          setRecord(loaded);
          final booking = record!;
          if (widget.mode == 'booking') {
            final loadedSupplements = await api.supplements(booking.id);
            if (!mounted || t != ticket) return;
            api.check(epoch, p);
            if (record?.id != booking.id || record?.version != booking.version) return;
            supplements..clear()..addAll(loadedSupplements);
          } else if (['OPEN', 'FROZEN', 'ARCHIVED'].contains(booking.conversation)) {
            final page = await api.messages(booking.id);
            if (!mounted || t != ticket) return;
            api.check(epoch, p);
            if (record?.id != booking.id || record?.version != booking.version) return;
            messages.clear();
            mergeMessages(page.items);
            messageCursor = page.cursor;
          }
        default:
          throw const AccountError(400, 'INVALID_PATH');
      }
      api.check(epoch,
          widget.mode == 'catalog' && widget.invitationId == null ? null : p);
      if (mounted && t == ticket) setState(() {});
    } on AccountError catch (e) {
      if (mounted && t == ticket && widget.session.epoch == epoch &&
          widget.session.partyId == p) {
        setState(() => error = v5Error(e));
      }
    } finally {
      if (mounted && t == ticket && widget.session.epoch == epoch &&
          widget.session.partyId == p) {
        setState(() => busy = false);
      }
    }
  }

  Future<void> moreMessages() async {
    if (busy || messageCursor == null || record == null) return;
    final booking = record!, before = messageCursor!;
    final t = ++ticket, epoch = widget.session.epoch, p = widget.session.partyId;
    setState(() { busy = true; error = null; });
    bool sameRequest() => mounted && t == ticket &&
        widget.session.epoch == epoch && widget.session.partyId == p;
    bool current() => sameRequest() &&
        record?.id == booking.id && record?.version == booking.version &&
        messageCursor == before;
    try {
      final page = await api.messages(booking.id, cursor: before);
      if (!current()) return;
      api.check(epoch, p);
      setState(() {
        mergeMessages(page.items);
        messageCursor = page.cursor;
      });
    } on AccountError catch (e) {
      if (current()) setState(() => error = v5Error(e));
    } finally {
      if (sameRequest()) setState(() => busy = false);
    }
  }

  Future<void> contextRead(String kind) async {
    final r = record;
    if (r == null) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final d = kind == 'contacts'
          ? await api.contacts(r.id)
          : await api.itinerary(r.id);
      if (mounted) {
        setState(() {
          if (kind == 'contacts') {
            contacts = d;
          } else {
            itinerary = d;
          }
        });
      }
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          contacts = null;
          itinerary = null;
          error = v5Error(e);
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> go(String path) async {
    await Navigator.pushNamed(context, path);
    // Actions and original-order payment run on child routes. Re-read on
    // return instead of leaving the parent at its pre-action status.
    if (mounted && !busy && api.pendingOperations.isEmpty &&
        !['book', 'messages'].contains(widget.mode)) {
      await load();
    }
  }
  void action(AuditionRecord r, String action) =>
      go('/auditions/action?bookingId=${r.id}&action=$action');
  @override
  Widget build(BuildContext context) {
    final r = record, o = offer;
    final title = switch (widget.mode) {
      'catalog' => '可约艺人',
      'book' => '约一次试镜',
      'offers' => '我的试镜方案',
      'offer' => '试镜设置',
      'bookings' => '我的试镜',
      'messages' => '本单会话',
      _ => '试镜进度与取样'
    };
    return V5Frame(
        api: api,
        title: title,
        embedded: widget.embedded,
        children: [
          if (widget.mode == 'catalog') ...[
            Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
              Expanded(
                  child: Semantics(
                      header: true,
                      child: const Text('试镜',
                          style: TextStyle(
                              fontFamily: AccountTheme.sans,
                              fontSize: 28,
                              height: 1.1,
                              fontWeight: FontWeight.w900)))),
              TextButton(
                  onPressed: busy ? null : () => go('/auditions/bookings'),
                  child: const Text('我的试镜 ↗')),
            ]),
            const SizedBox(height: 18),
            const Text('公开可约的艺人，一口价含交通。',
                style: TextStyle(
                    fontSize: 12, height: 1.6, color: AccountTheme.muted)),
            const SizedBox(height: 22),
          ] else if (widget.mode == 'messages')
            tradeHeading('试镜订单会话',
                eyebrow: '订单会话 / ${r == null ? '读取中' : auditionConversations[r.conversation]}',
                fontSize: 24)
          else
            tradeHeading(title, eyebrow: '真实用途 / 正规场地 / 一口价含交通', fontSize: 28),
          V5RecoveryPanel(
              api: api,
              label: api.recoveryLabel,
              restore: api.restoreOperation,
              onRestored: (r) => go(r['kind'] == 'ORDER'
                  ? '/trade/record?recordId=${r['id']}'
                  : r['kind'] == 'OFFER'
                      ? '/auditions/offer?offerId=${r['id']}'
                      : '/auditions/booking?bookingId=${r['kind'] == 'MESSAGE' || r['kind'] == 'SUPPLEMENT' ? r['parent_id'] : r['booking_id'] ?? r['id']}')),
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!, icon: Icons.error_outline),
          if (notice != null) appNotice(notice!),
          if (widget.mode == 'catalog') ...[
            appNotice(widget.invitationId == null
                ? '只展示当前可公开预约的已审方案；价格可由艺人选择不公开。'
                : '这里只读取本次已接受定向邀约匹配的真实方案。'),
            if (widget.invitationId == null) ...[
              cityScope(),
              LayoutBuilder(builder: (context, constraints) {
                final input = TextField(
                    controller: city,
                    enabled: !busy,
                    onChanged: (_) => setState(() => independentCity = true),
                    decoration: const InputDecoration(labelText: '城市筛选'));
                final search = OutlinedButton(
                    onPressed: busy ? null : () => load(),
                    child: const Text('按城市查找'));
                if (constraints.maxWidth < 320 ||
                    MediaQuery.textScalerOf(context).scale(14) > 20) {
                  return Column(crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [input, const SizedBox(height: 10), search]);
                }
                return Row(children: [Expanded(child: input),
                    const SizedBox(width: 12), search]);
              }),
            ],
            for (final x in offers) _catalogOffer(x),
            if (!busy && error == null && offers.isEmpty) appNotice('当前筛选没有仍可约的有效方案。'),
            tradeButton('我的试镜进度', () => go('/auditions/bookings'),
                outline: true),
            tradeButton('本人发布与接单方案', () => go('/auditions/offers'),
                outline: true),
          ],
          if (o != null) _bookingForm(o),
          if (['offers', 'bookings'].contains(widget.mode)) ...[
            auditionGuide(widget.mode == 'offers' ? '我的发布方案' : '接续本次试镜',
                widget.mode == 'offers'
                    ? '核对方案审核和公开设置；发布方案不等于收到预约。'
                    : '在同一记录内核对付款、接单、取样与售后。身份改变后可办理动作仍由服务器核验。'),
            if (widget.mode == 'offers')
              tradeButton('提交本人试镜方案审核', () => go('/auditions/new')),
            for (final x in records)
              tradeSection(x.title, [
                tradeFact('状态', auditionStates[x.status]),
                Text(auditionNextStep(x), style: const TextStyle(
                    color: AccountTheme.muted, height: 1.6)),
                if (x.kind == 'BOOKING')
                  ...auditionAppointmentFacts(v5Map(x.data['appointment'])),
                tradeButton(
                    '查看本次记录',
                    () => go(
                        '/auditions/${x.kind == 'OFFER' ? 'offer' : 'booking'}?${x.kind == 'OFFER' ? 'offerId' : 'bookingId'}=${x.id}'),
                    outline: true)
              ]),
            if (!busy && records.isEmpty) appNotice('本人当前没有可读的本类试镜记录。'),
          ],
          if (r != null && r.kind == 'OFFER') ...[
            auditionGuide(auditionStates[r.status]!, auditionNextStep(r), label: '方案进度'),
            tradeSection(r.title, [
              tradeFact('状态', auditionStates[r.status]),
              tradeFact('价格', v5Money(r.data['offer']['unit_minor'])),
              tradeFact('交通', '已含在该一口价内'),
              tradeFact('原规则', r.data['rules']['terms']),
              tradeFact('取样约定',
                  '${r.data['rules']['photo_count']}照 / ${r.data['rules']['video_count']}视频'),
              tradeFact(
                  acceptanceOrigin(v5Map(r.data['rules']), audition: true),
                  '${r.data['rules']['acceptance_hours']} 小时')
            ]),
            if (r.status == 'PUBLISHED')
              V5Form(
                  actionInFooter: true,
                  api: api,
                  title: '公开选择',
                  action: '保存试镜公开设置',
                  suffix: '/offers/${r.id}/visibility',
                  version: r.version,
                  initial: {
                    'public_booking': r.data['offer']['public_booking'],
                    'public_price': r.data['offer']['public_price']
                  },
                  fields: const [],
                  factsBuilder: (v) => [
                    tradeFact('公开接试镜', v['public_booking'] == true ? '开启' : '关闭'),
                    tradeFact('公开一口价', v['public_price'] == true ? '开启' : '关闭'),
                  ],
                  extra: (v, set, enabled) => [
                    for (final setting in [
                      ('public_booking', '公开接试镜'),
                      ('public_price', '公开一口价')
                    ])
                      SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(setting.$2),
                          value: v[setting.$1] == true,
                          onChanged: enabled ? (value) => set(setting.$1, value) : null),
                    const Text('这里只调整本版公开选择，不改原订单价格、规则或独立授权。',
                        style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
                  ],
                  buildBody: (v) => {
                        'public_booking': v['public_booking'] == true,
                        'public_price': v['public_price'] == true
                      },
                  parse: (d) {
                    AuditionRecord(d, id: r.id, kind: 'OFFER');
                  },
                  reload: latest,
                  onSuccess: (_) => load()),
          ],
          if (r != null && r.kind == 'BOOKING' && widget.mode == 'booking')
            ..._bookingBody(r),
          if (r != null && r.kind == 'BOOKING' && widget.mode == 'messages')
            ..._messageBody(r),
          if (cursor != null)
            tradeButton('继续读取下一页', busy ? null : () => load(more: true),
                outline: true),
          tradeButton('重新读取本页', busy ? null : () => load(), outline: true),
        ]);
  }

  Widget _catalogOffer(AuditionOffer offer) {
    final location = [offer.raw['city'], offer.raw['service_area']]
        .whereType<String>().map((value) => value.trim())
        .where((value) => value.isNotEmpty).join(' · ');
    return Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: AccountTheme.border))),
        child: LayoutBuilder(builder: (context, constraints) {
          final compact = constraints.maxWidth < 320 ||
              MediaQuery.textScalerOf(context).scale(14) > 20;
          final portrait = Container(
              width: 120, height: 180,
              decoration: BoxDecoration(color: AccountTheme.selectedSurface,
                  borderRadius: BorderRadius.circular(14)),
              alignment: Alignment.center,
              child: const Padding(padding: EdgeInsets.all(12),
                  child: Text('未提供公开肖像', textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: AccountTheme.muted))));
          final summary = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('已审试镜方案', style: TextStyle(fontSize: 11, color: AccountTheme.accent)),
            const SizedBox(height: 8),
            Text(offer.title, style: const TextStyle(fontSize: 24,
                height: 1.25, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Text(location, style: const TextStyle(fontSize: 12, height: 1.6)),
            const SizedBox(height: 10),
            Text(offer.raw['mode'] == 'OFFLINE' ? '线下正规场地试镜' : '线上材料试镜',
                style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
            const SizedBox(height: 8),
            Text(offer.slots.isEmpty ? '本方案未返回公开时段'
                : '已公开时段：${offer.slots.length} 个',
                style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
            const Text('公开时段不代表实时剩余可约量，预约前请重新核对。',
                style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
          ]);
          final price = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(offer.raw['unit_minor'] == null ? '价格未公开' : v5Money(offer.raw['unit_minor']),
                style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
            const Text('一口价 · 含交通', style: TextStyle(fontSize: 11, color: AccountTheme.muted)),
          ]);
          final book = FilledButton(
              onPressed: busy ? null : () => go(
                  '/auditions/book?offerId=${offer.id}${widget.invitationId == null ? '' : '&invitationId=${widget.invitationId}'}'),
              child: const Text('约试镜 ↗'));
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (compact) ...[Align(alignment: Alignment.centerLeft, child: portrait),
              const SizedBox(height: 14), summary]
            else Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              portrait, const SizedBox(width: 16), Expanded(child: summary)]),
            const SizedBox(height: 18),
            if (compact) ...[price, const SizedBox(height: 12), book]
            else Row(children: [Expanded(child: price), const SizedBox(width: 12), book]),
          ]);
        }));
  }

  Widget _bookingForm(AuditionOffer o) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
            margin: const EdgeInsets.only(bottom: 20),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AccountTheme.surface,
                borderRadius: BorderRadius.circular(16)),
            child: Row(children: [
              Container(width: 64, height: 80,
                  decoration: BoxDecoration(color: AccountTheme.selectedSurface,
                      borderRadius: BorderRadius.circular(10)),
                  child: const Icon(Icons.person_outline, color: AccountTheme.muted)),
              const SizedBox(width: 16),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(o.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text([o.raw['city'], o.raw['service_area']]
                        .whereType<String>().map((value) => value.trim())
                        .where((value) => value.isNotEmpty).join(' · '),
                    style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
              ])),
            ])),
        auditionGuide('先说明用途，再确认约定',
            '填写真实场地、时间与用途，提交安全核查。通过后再确认订单和付款，之后等待艺人接单。', label: '预约准备'),
        if (!widget.session.isOwner)
          appNotice('当前机构成员可办理获授权的试镜预约，发起新的买方预约须由有效负责人确认。'),
        V5Form(
            actionInFooter: true,
            api: api,
            canSubmit: widget.session.isOwner,
            title: '真实预约用途',
            action: '提交本次预约安全核查',
            suffix: '/bookings',
            initial: {'city': o.raw['city']},
            fields: [
              V5Field('slot', '选择真实可约时段', choices: {
                for (var i = 0; i < o.slots.length; i++)
                  'slot_$i':
                      '${tradeDate(o.slots[i]['starts_at'])} 至 ${tradeDate(o.slots[i]['ends_at'])}'
              }),
              const V5Field('starts_at', '本次开始时间', type: 'datetime'),
              const V5Field('ends_at', '本次结束时间', type: 'datetime'),
              const V5Field('city', '本次城市'),
              const V5Field('venue', '正规拍摄或试镜场地'),
              const V5Field('address', '明确场地地址'),
              const V5Field('purpose', '本次真实用途', type: 'multiline'),
              const V5Field(
                  'adult_confirmed', '我确认按本人已核实的成年身份办理，理解试镜不等于取得出演或发行权',
                  type: 'bool')
            ],
            beforeField: (field, values, change, enabled) =>
                field.keyName == 'adult_confirmed' ? [
                  const Text('试镜一口价', style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
                  const SizedBox(height: 6),
                  Text(o.raw['unit_minor'] == null ? '价格未公开' : v5Money(o.raw['unit_minor']),
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  const Text('含交通；以本次完整约定为准，不在站外追加现金收取。',
                      style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.6)),
                  const SizedBox(height: 20),
                ] : const <Widget>[],
            restore: (b) {
              final a = v5Map(b['appointment']);
              return {
                ...a,
                'slot':
                    'slot_${o.slots.indexWhere((s) => !DateTime.parse(a['starts_at']).isBefore(DateTime.parse(s['starts_at'])) && !DateTime.parse(a['ends_at']).isAfter(DateTime.parse(s['ends_at'])))}',
                'adult_confirmed': true
              };
            },
            buildBody: (v) {
              if (v['adult_confirmed'] != true) {
                throw const AccountError(400, 'VERIFIED_ADULT_REQUIRED');
              }
              final index =
                  int.tryParse('${v['slot']}'.replaceFirst('slot_', ''));
              if (index == null || index < 0 || index >= o.slots.length) {
                throw const AccountError(400, 'AUDITION_TIME_NOT_AVAILABLE');
              }
              final times = auditionSelectedTimes(
                  o.slots[index], v['starts_at'], v['ends_at']);
              return {
                'offer_id': o.id,
                'offer_sha256': o.hash,
                'invitation_id': widget.invitationId,
                'appointment': {
                  'mode': o.raw['mode'],
                  'city': v['city'],
                  'venue': v['venue'],
                  'address': v['address'],
                  'purpose': v['purpose'],
                  ...times
                }
              };
            },
            parse: (d) {
              AuditionRecord(d, kind: 'BOOKING');
            },
            reload: () async {
              final fresh =
                  await api.offer(o.id, invitationId: widget.invitationId);
              if (mounted) setState(() => offer = fresh);
              return null;
            },
            onSuccess: (d) => Navigator.pushReplacementNamed(
                context, '/auditions/booking?bookingId=${d['id']}')),
      ]);
  List<Widget> _bookingBody(AuditionRecord r) {
    final isBuyer = r.buyer(api.owner()),
        allOpened = r.mediaIds.isNotEmpty && r.mediaIds.every(opened.contains),
        d = r.data;
    return [
      auditionGuide(auditionStates[r.status]!, auditionNextStep(r), label: '本单当前进度'),
      if (['REFUND_REQUIRED', 'REFUNDED'].contains(r.status)) ...[
        tradeBanner(
            r.status == 'REFUNDED' && r.raw['refund_is_verified'] == true
                ? '全额退款已核实' : '退款处理中 · 等待核验',
            r.status == 'REFUNDED' && r.raw['refund_is_verified'] == true
                ? '本次原单退款已由渠道核实。退款详情与凭证请查看原退款记录，本次未约成的试镜不因此重新开放。'
                : '原单退款要求已记录，尚不能称为款项已退回。实际到账以原渠道核实为准，不承诺固定退款周期。',
            icon: Icons.receipt_long_outlined),
        tradeFact(r.status == 'REFUNDED' && r.raw['refund_is_verified'] == true
                ? '本次核实退款金额' : '本次应退金额',
            v5Money(d['refund_minor'])),
        const Text('未约成不开放双方自由会话。其他预约需另行确认，不沿用本单沟通权限。',
            style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.6)),
        tradeButton('看看其他可约艺人',
            busy ? null : () => go('/auditions/catalog'), outline: true),
      ],

      if (r.status == 'DELIVERED') ...[
        const Text('试镜交付待确认',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text('原记录版本 ${r.version} · ${d['rules']['photo_count']} 照 / ${d['rules']['video_count']} 视频',
            style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
        const SizedBox(height: 12),
        const Text('确认只针对本次试镜履约，不代表最终录用或后续参演授权。对现场或素材有异议，请使用本单争议入口。',
            style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.6)),
        const SizedBox(height: 16),
      ],

      tradeSection(r.title, [
        tradeFact('实际状态', auditionStates[r.status]),
        ...auditionAppointmentFacts(v5Map(d['appointment'])),
        tradeFact('本单含交通一口价', v5Money(d['offer']['unit_minor'])),
        tradeFact('取样约定',
            '${d['rules']['photo_count']} 照 / ${d['rules']['video_count']} 视频'),
        tradeFact(acceptanceOrigin(v5Map(d['rules']), audition: true),
            '${d['rules']['acceptance_hours']} 小时'),
        SelectableText(d['rules']['terms'])
      ]),
      appNotice('试镜完成不授予买家出演、发行或重新生成权。付款、接受、联系方式与取样许可分别核对。评价不能代替取样验收、实际付款或争议处理。'),
      if (d['order_id'] != null)
        tradeButton(
            '原订单、真实付款与退款', () => go('/trade/record?recordId=${d['order_id']}'),
            outline: true),
      if (r.status == 'READY_TO_PAY')
        V5Form(
            api: api,
            title: '固定本次原约定',
            action: '确认本版并建立未付款订单',
            suffix: '/checkout',
            fields: const [
              V5Field('channel', '本订单支付渠道',
                  choices: {'ALIPAY': '支付宝', 'CUSTODY': '消费者余额（服务未接通）'})
            ],
            buildBody: (v) => {
                  'booking_id': r.id,
                  'booking_sha256': r.hash,
                  'channel': v['channel']
                },
            parse: (d) {
              api.order(d);
            },
            reload: latest,
            onSuccess: (d) => go('/trade/record?recordId=${d['id']}')),
      if (r.status == 'AWAITING_ACCEPTANCE' && !isBuyer)
        tradeButton('接受或拒绝本次已付款邀约', () => action(r, 'decision')),
      if (r.status == 'AWAITING_ACCEPTANCE')
        tradeFact('服务器给出的接单截止', tradeDate(d['accept_by'])),
      if (!isBuyer &&
          ['ACCEPTED', 'DEPARTED'].contains(r.status) &&
          d['dispute'] == null &&
          d['reschedule'] == null)
        tradeButton('记录出发或到场', () => action(r, 'travel'), outline: true),
      if (!isBuyer &&
          d['fulfilled_at'] == null &&
          (r.status == 'ARRIVED' ||
              r.status == 'DELIVERED' ||
              d['appointment']['mode'] == 'ONLINE_MATERIALS' &&
                  r.status == 'ACCEPTED'))
        tradeButton('提交本次约定取样', () => action(r, 'delivery')),
      if (d['delivery_review'] != null)
        tradeFact('取样独立审核说明', d['delivery_review']['reason']),
      if (d['delivery'] != null &&
          d['delivery_review']?['decision'] == 'APPROVE' &&
          !['REFUND_REQUIRED', 'REFUNDED', 'CANCELLED'].contains(r.status)) ...[
        for (final id in r.mediaIds)
          V5Media(
              key: ValueKey('$id:${d['delivery']['hashes'][id]}'),
              api: api,
              onInvalid: () {
                if (mounted) setState(() => opened.remove(id));
              },
              type: (d['delivery']['photos'] as List).contains(id)
                  ? 'image'
                  : 'video',
              label: (d['delivery']['photos'] as List).contains(id)
                  ? '实际读取第${(d['delivery']['photos'] as List).indexOf(id) + 1}张取样照片'
                  : '实际播放本段取样视频',
              allowSave: true,
              fileName:
                  '$id.${(d['delivery']['photos'] as List).contains(id) ? 'jpg' : 'mp4'}',
              load: () => api.material(r, id),
              onOpened: () async {
                final epoch = widget.session.epoch,
                    party = widget.session.partyId;
                final fresh = await api.record(r.id);
                if (!mounted ||
                    widget.session.epoch != epoch ||
                    widget.session.partyId != party ||
                    record?.id != r.id) {
                  return;
                }
                setState(() {
                  // Concurrent media reads may finish out of order. Never replace
                  // a newer record with an older response.
                  if (fresh.version >= record!.version) setRecord(fresh);
                  final current = record!;
                  if (current.status == 'DELIVERED' &&
                      current.data['delivery_review']?['decision'] ==
                          'APPROVE' &&
                      jsonEncode(current.data['delivery']) ==
                          jsonEncode(d['delivery']) &&
                      current.mediaIds.contains(id)) {
                    opened.add(id);
                  }
                });
              }),
        if (isBuyer && r.status == 'DELIVERED') ...[
          appNotice(d['rules']['acceptance_policy'] == 'CONTRACT_20261029'
              ? '本单从交付审核通过起，按原规则${d['rules']['acceptance_hours']}小时核对；实际截止以服务器记录为准。文件不可用或争议时不能自动完成。本人收讫仍须实际取得全部取样，不会重置服务器期限。'
              : '须逐项成功查看或保存本次全部取样，再明确收讫；上传或付款时间不能启动验收计时。'),
          _receiptForm(r, 'receipt', allOpened, '明确确认本次全部取样已收到'),
          _receiptForm(r, 'confirm', allOpened, '明确确认本次试镜履约完成'),
        ],
      ],
      if (d['acceptance_started_at'] != null)
        tradeFact('服务器记录的实际起点', tradeDate(d['acceptance_started_at'])),
      if (d['deadline_at'] != null)
        tradeFact('服务器记录的截止时间', tradeDate(d['deadline_at'])),
      if (d['acceptance_method'] == 'AGREED_TIMEOUT')
        appNotice('本单按原约定期限处理，未记录为本人主动确认。'),
      if (['OPEN', 'FROZEN', 'ARCHIVED'].contains(r.conversation))
        tradeButton(
            '查看本单会话与客服', () => go('/auditions/messages?bookingId=${r.id}'),
            outline: true)
      else
        appNotice(auditionConversations[r.conversation]!),
      if (r.conversation == 'OPEN') ...[
        tradeButton('读取当前可分享行程', busy ? null : () => contextRead('itinerary'),
            outline: true),
        if (itinerary != null)
          tradeSection('由我主动选择分享的行程', [
            SelectableText(itinerary!['share']['text']),
            Text(itinerary!['safety']['notice']),
            tradeButton(
                '复制本次行程文字',
                () => Clipboard.setData(
                    ClipboardData(text: itinerary!['share']['text'])),
                outline: true)
          ]),
      ],
      if (r.status == 'ACCEPTED' &&
          d['departed_at'] == null &&
          d['reschedule'] == null)
        tradeButton('按本单发起改期申请', () => action(r, 'reschedule'), outline: true),
      if (d['reschedule'] != null) ...[
        tradeSection('改期处理中', [
          ...auditionAppointmentFacts(v5Map(d['reschedule']['appointment'])),
          tradeFact('原因', d['reschedule']['reason']),
          appNotice(d['reschedule']['other_confirmed'] == true
              ? '另一方已确认，等待独立安全复核；原行程尚未改写。'
              : '等待另一方明确接受或拒绝。')
        ]),
        if (d['reschedule']['proposed_by'] != widget.session.partyId &&
            d['reschedule']['other_confirmed'] != true)
          tradeButton('回复本次改期', () => action(r, 'reschedule-response'))
      ],
      if (d['dispute'] == null && ![
            'CANCELLED',
            'REJECTED',
            'REFUND_REQUIRED',
            'REFUNDED',
            'PARTIAL_REFUND_SETTLED'
          ].contains(r.status) &&
          (d['order_id'] == null || d['paid_at'] != null))
        tradeButton('取消、争议或安全离场', () => action(r, 'cancel'), outline: true),
      if (d['dispute'] != null)
        tradeSection('争议待独立处理', [
          Text(d['dispute']['reason']),
          appNotice('已暂停会话与约定计时。客服独立核定退付，安全离场不自动处罚。'),
          if ([r.raw['owner_party_id'], r.raw['counterparty_id'], d['dispute']['owner_party_id']].contains(widget.session.partyId))
            tradeButton('为本次争议补交私有依据', () => action(r, 'dispute-evidence'), outline: true)
        ]),
      for (final c in v5Rows(d['cases']))
        tradeSection('原单处理记录', [
          Text(c['reason']),
          if (c['resolution'] != null) ...[
            tradeFact('独立处理说明', c['resolution']['reason']),
            tradeFact('核定应退款', v5Money(c['resolution']['refund_minor']))
          ]
        ]),
      if (d['refund_id'] != null) ...[
        tradeFact('核定应退款', v5Money(d['refund_minor'])),
        appNotice(r.raw['refund_is_verified'] == true
            ? '渠道退款已核实，以原退款记录为准。'
            : '退款申请或决定已记录，尚不代表渠道已退款到账。'),
        tradeButton(
            '查看原渠道退款记录', () => go('/trade/record?recordId=${d['refund_id']}'),
            outline: true)
      ],
      if (!isBuyer &&
          r.status == 'ACCEPTED' &&
          d['departed_at'] == null &&
          d['reschedule'] == null)
        tradeButton('提交已付试镜的独立补差约定', () => action(r, 'supplements'),
            outline: true),
      for (final s in supplements) ...[
        tradeSection(s.title, [
          tradeFact('补差状态', auditionStates[s.status]),
          tradeFact('金额', v5Money(s.data['amount_minor'])),
          tradeFact('具体补充约定', s.data['terms']),
          tradeFact('原单与合同', '沿用原已付试镜，保留原合同指纹'),
          tradeFact('截止', tradeDate(s.data['expires_at'])),
          ..._supplementRefundFacts(s),
        ]),
        if (s.data['order_id'] != null)
          tradeButton('查看此笔独立补差订单',
              () => go('/trade/record?recordId=${s.data['order_id']}'),
              outline: true)
        else if (isBuyer && s.status == 'APPROVED')
          V5Form(
              key: ValueKey(s.id),
              api: api,
              title: '确认已审补差',
              action: '确认本版独立补差订单',
              suffix: '/supplements/checkout',
              fields: const [
                V5Field('channel', '独立补差支付渠道',
                    choices: {'ALIPAY': '支付宝', 'CUSTODY': '消费者余额（服务未接通）'})
              ],
              buildBody: (v) => {
                    'supplement_id': s.id,
                    'supplement_sha256': s.hash,
                    'channel': v['channel']
                  },
              parse: (d) {
                api.order(d);
              },
              reload: () async {
                final fresh = await api.supplements(r.id);
                if (mounted) {
                  setState(() {
                    supplements.clear();
                    supplements.addAll(fresh);
                  });
                }
                return null;
              },
              onSuccess: (d) => go('/trade/record?recordId=${d['id']}'))
      ],
      if (!isBuyer &&
          widget.session.party?['kind'] == 'PERSON' &&
          d['delivery'] != null &&
          d['baseplate_id'] == null)
        tradeButton('另给私人归档授权后保存造型', () => action(r, 'baseplate'),
            outline: true),
    ];
  }

  List<Widget> _supplementRefundFacts(AuditionRecord supplement) {
    final data = supplement.data;
    final limit = data['refund_limit_minor'];
    final reason = data['refund_reason'];
    final refundStage = const {
      'REFUND_REQUIRED', 'PARTIALLY_REFUNDED', 'REFUNDED'
    }.contains(supplement.status);
    final validDecision = data['order_id'] != null &&
        limit is int && limit > 0 && limit <= data['amount_minor'] &&
        reason is String && reason.trim().isNotEmpty && reason.length <= 2000;
    if (!refundStage && !validDecision &&
        !const {'PAID', 'PAYMENT_REVIEW_REQUIRED'}.contains(supplement.status)) {
      return [];
    }
    return [
      const Divider(),
      if (validDecision) ...[
        tradeFact('已记录的累计退款核定上限', v5Money(limit)),
        tradeFact('退款核定理由', reason),
        appNotice('核定上限包含此前已退金额，不是本次退款金额，也不是当前剩余可退额。实际申请与到账请进入此笔独立补差订单核对。'),
      ] else if (refundStage)
        appNotice('本条记录未提供可确认的退款核定明细，请进入此笔独立补差订单核对。'),
      appNotice('追加单退款须先由独立客服核定，再按原付款办理。退款核定与渠道到账分别记录；本卡不依据核定上限认定已退款。'),
    ];
  }

  Widget _receiptForm(
          AuditionRecord r, String action, bool canSubmit, String title) =>
      V5Form(
          key: ValueKey('$action:${r.id}:${r.version}'),
          api: api,
          title: title,
          action: title,
          suffix: '/bookings/${r.id}/$action',
          canSubmit: canSubmit,
          version: r.version,
          fields: [
            V5Field(
                'confirmed',
                action == 'receipt'
                    ? '我已成功取得本次全部照片和视频，明确确认收讫'
                    : '我已核对本次全部取样和原约定，明确确认完成',
                type: 'bool')
          ],
          buildBody: (v) {
            if (v['confirmed'] != true || !canSubmit) {
              throw const AccountError(409, 'AUDITION_RECEIPT_NOT_READY');
            }
            return {};
          },
          parse: (d) => api.validateBooking(d, r.id),
          reload: latest,
          onSuccess: (d) => setState(
              () => setRecord(AuditionRecord(d, id: r.id, kind: 'BOOKING'))));
  List<Widget> _messageBody(AuditionRecord r) => [
        if (r.conversation == 'ARCHIVED')
          tradeBanner('会话已归档 · 只读',
              '按当前权限保留历史消息。本页不再发送消息、附件或改价申请；售后请回到原订单处理，不重开双方聊天。'),

        tradeSection('本单会话开通与边界', [
          tradeFact('当前状态', auditionConversations[r.conversation]),
          const Text('会话只服务这一笔原订单；联系方式另行同意，争议或改期时冻结，完成后归档。',
              style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.6)),
          if (['FROZEN', 'ARCHIVED'].contains(r.conversation))
            const Text('当前为只读状态，不能发送新消息或取样引用。',
                style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
          if (!['OPEN', 'FROZEN', 'ARCHIVED'].contains(r.conversation))
            const Text('本单会话尚未开放，本页未读取消息；请先核对上方真实订单状态。',
                style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
        ]),
        if (['OPEN', 'FROZEN', 'ARCHIVED'].contains(r.conversation) &&
            messages.isEmpty && !busy && error == null)
          const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Text('当前已读取的会话暂无消息。',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AccountTheme.muted))),
        for (final m in messages)
          Align(
              alignment: m.data['account_id'] == widget.session.account?['id']
                  ? Alignment.centerRight : Alignment.centerLeft,
              child: Container(
                  constraints: const BoxConstraints(maxWidth: 320),
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                      color: m.data['account_id'] == widget.session.account?['id']
                          ? AccountTheme.selectedSurface : AccountTheme.surface,
                      borderRadius: BorderRadius.circular(14)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(m.data['account_id'] == widget.session.account?['id']
                        ? '我' : '本单参与方',
                        style: const TextStyle(fontSize: 11, color: AccountTheme.muted)),
                    const SizedBox(height: 8),
                    if (m.data['kind'] == 'TEXT')
                      Text(m.data['body'])
                    else if (m.data['kind'] == 'ORDER_CARD')
                      tradeButton('查看本单订单卡',
                          () => go('/trade/record?recordId=${m.data['order_id']}'),
                          outline: true)
                    else
                      const Text('引用本单已交取样；回试镜进度按权限读取。'),
                    const SizedBox(height: 8),
                    Text('${tradeDate(m.data['at'])} · ${m.raw['is_read'] == true ? '我已读' : '我尚未标记已读'}',
                        style: const TextStyle(fontSize: 10, color: AccountTheme.muted)),
                  ]))),
        if (messageCursor != null)
          tradeButton('继续读取后续消息', busy ? null : moreMessages, outline: true),
        if (['OPEN', 'FROZEN', 'ARCHIVED'].contains(r.conversation) &&
            messages.any((m) => m.raw['is_read'] != true))
          V5Form(
              api: api,
              title: '仅记本人已读',
              action: '将本页消息标记为本人已读',
              suffix: '/bookings/${r.id}/messages/read',
              fields: const [],
              buildBody: (_) => {
                    'message_ids': messages
                        .where((m) => m.raw['is_read'] != true)
                        .map((m) => m.id)
                        .toList()
                  },
              parse: (d) => api.validateRead(d, r.id),
              reload: () async {
                await api.messages(r.id);
                return null;
              },
              onSuccess: (_) => load()),
        LayoutBuilder(builder: (context, constraints) {
          final actions = [
            OutlinedButton(
                onPressed: busy || api.pendingOperations.isNotEmpty ? null
                    : () => go('/auditions/booking?bookingId=${r.id}'),
                child: const Text('查看试镜档案')),
            if (r.data['order_id'] != null)
              OutlinedButton(
                  onPressed: busy || api.pendingOperations.isNotEmpty ? null
                      : () => go('/trade/record?recordId=${r.data['order_id']}'),
                  child: const Text('查看原订单约定')),
          ];
          if (constraints.maxWidth < 320 ||
              MediaQuery.textScalerOf(context).scale(14) > 20) {
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: actions);
          }
          return Row(children: [
            for (var i = 0; i < actions.length; i++) ...[
              if (i > 0) const SizedBox(width: 10),
              Expanded(child: actions[i]),
            ],
          ]);
        }),
        const Divider(height: 32, color: AccountTheme.border),
        if (r.conversation != 'ARCHIVED')
          tradeButton('找客服 · 请求加入本单',
              busy || api.pendingOperations.isNotEmpty ? null
                  : () => action(r, 'support'), outline: true),
        if (r.conversation == 'OPEN') ...[
          tradeSection('发送本单内容', [
          V5Form(
              actionInFooter: true,
              canSubmit: !busy,
              key: ValueKey(messageForm),
              api: api,
              title: '只发送本单内容',
              action: '发送消息',
              suffix: '/bookings/${r.id}/messages',
              fields: [
                const V5Field('kind', '内容类型', choices: {
                  'TEXT': '订单内文字',
                  'ORDER_CARD': '本单订单卡',
                  'DELIVERY_MEDIA': '本单取样引用'
                }, wrapChoices: true),
                const V5Field('body', '本单文字内容（非文字卡可留空）',
                    type: 'multiline', required: false),
                V5Field('asset_id', '仅选本单取样（文字或订单卡可留空）',
                    required: false,
                    choices: {
                      for (final id in r.mediaIds)
                        id: (r.data['delivery']['photos'] as List).contains(id)
                            ? '本单取样照片 ${r.mediaIds.indexOf(id) + 1}'
                            : '本单取样视频'
                    })
              ],
              buildBody: (v) {
                if (v['kind'] == 'TEXT' &&
                    '${v['body'] ?? ''}'.trim().isEmpty) {
                  throw const AccountError(400, 'INVALID_MESSAGE');
                }
                if (v['kind'] == 'DELIVERY_MEDIA' &&
                    !r.mediaIds.contains(v['asset_id'])) {
                  throw const AccountError(400, 'INVALID_MESSAGE');
                }
                return {
                  'kind': v['kind'],
                  'body': v['kind'] == 'TEXT' ? v['body'] : null,
                  'asset_id':
                      v['kind'] == 'DELIVERY_MEDIA' ? v['asset_id'] : null
                };
              },
              parse: (d) {
                AuditionRecord(d, kind: 'MESSAGE', parentId: r.id);
              },
              reload: () async {
                await api.messages(r.id);
                return null;
              },
              onSuccess: (_) async {
                await load();
                if (mounted) setState(() => messageForm++);
              }),
          const Text('照片和视频仅引用本单已交取样；这里不新增上传，也不自动取得后续使用授权。',
              style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
          ]),
          tradeButton('填写或撤回本次联系卡同意', () => action(r, 'contact'),
              outline: true),
          tradeButton(
              '明确读取当前获准联系卡', busy ? null : () => contextRead('contacts'),
              outline: true),
          if (contacts != null)
            tradeSection('本次明确获准的联系卡', [
              for (final e in v5Map(contacts!['contacts']).entries) ...[
                tradeFact(
                    e.key == 'BUYER' ? '买方联系人' : '艺人方联系人', e.value['name']),
                tradeFact('获准联系电话', e.value['phone'])
              ],
              if (v5Map(contacts!['contacts']).isEmpty)
                appNotice('双方当前均未开放联系卡。')
            ]),
        ],
      ];
}
