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
      stateKey: embedded && mode == 'catalog'
          ? '/auditions/catalog:${invitationId ?? ''}'
          : null,
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
  bool busy = false, followsGlobalCity = true;
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
        oldWidget.initialCity != widget.initialCity &&
        followsGlobalCity) {
      city.text = widget.initialCity;
      load();
    }
  }

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
    final r = await api.record(widget.id ?? '');
    if (mounted) setState(() => setRecord(r));
    return r.version;
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
        offers.clear();
        records.clear();
        cursor = null;
        contacts = null;
        itinerary = null;
      }
    });
    try {
      switch (widget.mode) {
        case 'catalog':
          final r = await api.catalog(
              cursor: more ? cursor : null,
              city: city.text.trim(),
              invitationId: widget.invitationId);
          if (!mounted || t != ticket) return;
          offers.addAll(r.items);
          cursor = r.cursor;
        case 'book':
          offer = await api.offer(widget.id ?? '',
              invitationId: widget.invitationId);
        case 'bookings':
        case 'offers':
          final r = await api.records(
              widget.mode == 'offers' ? 'OFFER' : 'BOOKING',
              cursor: more ? cursor : null);
          records.addAll(r.items);
          cursor = r.cursor;
        case 'offer':
          setRecord(await api.record(widget.id ?? ''));
        case 'booking':
        case 'messages':
          setRecord(await api.record(widget.id ?? ''));
          if (record!.kind != 'BOOKING') {
            throw const AccountError(400, 'INVALID_ACTION');
          }
          if (widget.mode == 'booking') {
            supplements.clear();
            supplements.addAll(await api.supplements(record!.id));
          } else if (['OPEN', 'FROZEN', 'ARCHIVED']
              .contains(record!.conversation)) {
            final r = await api.messages(record!.id);
            messages.clear();
            messages.addAll(r.items);
            messageCursor = r.cursor;
          }
        default:
          throw const AccountError(400, 'INVALID_PATH');
      }
      api.check(epoch,
          widget.mode == 'catalog' && widget.invitationId == null ? null : p);
      if (mounted && t == ticket) setState(() {});
    } on AccountError catch (e) {
      if (mounted && t == ticket) setState(() => error = v5Error(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> moreMessages() async {
    if (messageCursor == null || record == null) return;
    setState(() => busy = true);
    try {
      final r = await api.messages(record!.id, cursor: messageCursor);
      if (mounted) {
        setState(() {
          messages.addAll(r.items);
          messageCursor = r.cursor;
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => error = v5Error(e));
    } finally {
      if (mounted) setState(() => busy = false);
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

  void go(String path) => Navigator.pushNamed(context, path);
  void action(AuditionRecord r, String action) =>
      go('/auditions/action?bookingId=${r.id}&action=$action');
  @override
  Widget build(BuildContext context) {
    final r = record, o = offer;
    final title = switch (widget.mode) {
      'catalog' => '可约艺人',
      'book' => '约一次试镜',
      'offers' => '我的试镜方案',
      'offer' => '试镜方案与开关',
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
                              fontFamily: AccountTheme.serif,
                              fontSize: 56,
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
          ] else
            tradeHeading(title, eyebrow: '真实用途 / 正规场地 / 一口价含交通'),
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
              TextField(
                  controller: city,
                  onChanged: (_) => setState(() => followsGlobalCity = false),
                  decoration: const InputDecoration(labelText: '城市筛选')),
              tradeButton('按城市查找', busy ? null : () => load(), outline: true),
              if (widget.embedded) ...[
                Text(
                    followsGlobalCity
                        ? '城市随广场更新；在这里修改仅筛选试镜。'
                        : '当前使用本页城市，广场换城不会覆盖。',
                    style: const TextStyle(
                        fontSize: 12, color: AccountTheme.muted)),
                if (!followsGlobalCity)
                  tradeButton(
                      '使用广场城市${widget.initialCity.isEmpty ? '（全部）' : '：${widget.initialCity}'}',
                      busy
                          ? null
                          : () {
                              followsGlobalCity = true;
                              city.text = widget.initialCity;
                              load();
                            },
                      outline: true),
              ],
            ],
            for (final x in offers)
              Container(
                padding: const EdgeInsets.symmetric(vertical: 18),
                decoration: const BoxDecoration(
                    border:
                        Border(bottom: BorderSide(color: AccountTheme.border))),
                child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                          width: 104,
                          height: 170,
                          color: const Color(0xFFE7E4DA),
                          alignment: Alignment.center,
                          child: const Padding(
                              padding: EdgeInsets.all(10),
                              child: Text('未提供公开肖像',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                      fontSize: 12,
                                      height: 1.5,
                                      color: AccountTheme.muted)))),
                      const SizedBox(width: 16),
                      Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                            Text(x.title,
                                style: const TextStyle(
                                    fontFamily: AccountTheme.serif,
                                    fontSize: 24,
                                    height: 1.25,
                                    fontWeight: FontWeight.w700)),
                            const SizedBox(height: 10),
                            Text('${x.raw['city']} · ${x.raw['service_area']}',
                                style:
                                    const TextStyle(fontSize: 12, height: 1.6)),
                            const SizedBox(height: 12),
                            Text(
                                x.raw['unit_minor'] == null
                                    ? '价格未公开'
                                    : v5Money(x.raw['unit_minor']),
                                style: const TextStyle(
                                    fontSize: 24, fontWeight: FontWeight.w700)),
                            const Text('一口价 · 含交通',
                                style: TextStyle(
                                    fontSize: 11, color: AccountTheme.muted)),
                            const SizedBox(height: 12),
                            tradeButton(
                                '约试镜 ↗',
                                busy
                                    ? null
                                    : () => go(
                                        '/auditions/book?offerId=${x.id}${widget.invitationId == null ? '' : '&invitationId=${widget.invitationId}'}')),
                          ])),
                    ]),
              ),
            if (!busy && offers.isEmpty) appNotice('当前筛选没有仍可约的有效方案。'),
            tradeButton('我的试镜进度', () => go('/auditions/bookings'),
                outline: true),
            tradeButton('本人发布与接单方案', () => go('/auditions/offers'),
                outline: true),
          ],
          if (o != null) _bookingForm(o),
          if (['offers', 'bookings'].contains(widget.mode)) ...[
            if (widget.mode == 'offers')
              tradeButton('提交本人试镜方案审核', () => go('/auditions/new')),
            for (final x in records)
              tradeSection(x.title, [
                tradeFact('状态', auditionStates[x.status]),
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
            tradeSection(r.title, [
              tradeFact('状态', auditionStates[r.status]),
              tradeFact('价格', v5Money(r.data['offer']['unit_minor'])),
              tradeFact('交通', '已含在该一口价内'),
              tradeFact('原规则', r.data['rules']['terms']),
              tradeFact('取样约定',
                  '${r.data['rules']['photo_count']}照 / ${r.data['rules']['video_count']}视频'),
              tradeFact('明确收讫后的期限', '${r.data['rules']['acceptance_hours']} 小时')
            ]),
            if (r.status == 'PUBLISHED')
              V5Form(
                  api: api,
                  title: '分别控制公开预约与公开价格',
                  action: '保存本方案公开选择',
                  suffix: '/offers/${r.id}/visibility',
                  version: r.version,
                  initial: {
                    'public_booking': r.data['offer']['public_booking'],
                    'public_price': r.data['offer']['public_price']
                  },
                  fields: const [
                    V5Field('public_booking', '允许公开预约',
                        type: 'bool', required: false),
                    V5Field('public_price', '公开本方案价格',
                        type: 'bool', required: false)
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

  Widget _bookingForm(AuditionOffer o) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        tradeSection(o.title, [
          tradeFact(
              '价格',
              o.raw['unit_minor'] == null
                  ? '此方案未公开价格，安全核查后核对本次完整约定'
                  : v5Money(o.raw['unit_minor'])),
          tradeFact('交通', '含在一口价内；不在站外追加现金收取'),
          tradeFact('服务范围', o.raw['service_area'])
        ]),
        if (!widget.session.isOwner)
          appNotice('当前机构成员可办理获授权的试镜预约，发起新的买方预约须由有效负责人确认。'),
        V5Form(
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
      tradeSection(r.title, [
        tradeFact('实际状态', auditionStates[r.status]),
        ...auditionAppointmentFacts(v5Map(d['appointment'])),
        tradeFact('本单含交通一口价', v5Money(d['offer']['unit_minor'])),
        tradeFact('取样约定',
            '${d['rules']['photo_count']} 照 / ${d['rules']['video_count']} 视频'),
        tradeFact('收讫后期限', '${d['rules']['acceptance_hours']} 小时'),
        SelectableText(d['rules']['terms'])
      ]),
      appNotice('试镜完成不授予买家出演、发行或重新生成权。付款、接受、联系方式与取样许可分别核对。'),
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
                final fresh = await api.record(r.id);
                if (mounted) {
                  setState(() {
                    setRecord(fresh);
                    if (fresh.mediaIds.contains(id)) opened.add(id);
                  });
                }
              }),
        if (isBuyer && r.status == 'DELIVERED') ...[
          appNotice('须逐项成功查看或保存本次全部取样，再明确收讫；上传或付款时间不能启动验收计时。'),
          _receiptForm(r, 'receipt', allOpened, '明确确认本次全部取样已收到'),
          _receiptForm(r, 'confirm', allOpened, '明确确认本次试镜履约完成'),
        ],
      ],
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
      if (![
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
          appNotice('已暂停会话与约定计时。客服独立核定退付，安全离场不自动处罚。')
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
          tradeFact('截止', tradeDate(s.data['expires_at']))
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

  Widget _receiptForm(
          AuditionRecord r, String action, bool canSubmit, String title) =>
      V5Form(
          key: ValueKey('$action:${r.id}'),
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
        tradeBanner(auditionConversations[r.conversation]!,
            '会话只服务这一笔原订单；联系方式另行同意，争议或改期时冻结，完成后归档。'),
        for (final m in messages)
          tradeSection(
              m.data['account_id'] == widget.session.account?['id']
                  ? '我发出的消息'
                  : '本单参与方消息',
              [
                if (m.data['kind'] == 'TEXT')
                  Text(m.data['body'])
                else if (m.data['kind'] == 'ORDER_CARD')
                  tradeButton('查看本单订单卡',
                      () => go('/trade/record?recordId=${m.data['order_id']}'),
                      outline: true)
                else
                  Text('引用本单已交取样；可回试镜进度按权限读取。'),
                tradeFact('时间', tradeDate(m.data['at'])),
                tradeFact(
                    '本人阅读状态', m.raw['is_read'] == true ? '我已读' : '我尚未标记已读')
              ]),
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
        if (r.conversation == 'OPEN') ...[
          V5Form(
              key: ValueKey(messageForm),
              api: api,
              title: '只发送本单内容',
              action: '发送本单消息',
              suffix: '/bookings/${r.id}/messages',
              fields: [
                const V5Field('kind', '内容类型', choices: {
                  'TEXT': '订单内文字',
                  'ORDER_CARD': '本单订单卡',
                  'DELIVERY_MEDIA': '本单取样引用'
                }),
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
        tradeButton('请求平台客服加入本单', () => action(r, 'support'), outline: true),
        tradeButton(
            '返回本次试镜与取样', () => go('/auditions/booking?bookingId=${r.id}'),
            outline: true),
      ];
}
