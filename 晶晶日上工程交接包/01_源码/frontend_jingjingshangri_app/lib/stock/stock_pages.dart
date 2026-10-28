import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../account/account_theme.dart';
import '../account/read_failure_widgets.dart';
import '../trade/trade_widgets.dart';
import '../trade/trade_models.dart' show tradeStatuses;
import 'stock_api.dart';
import 'stock_models.dart';
import 'stock_listing_form.dart';
import 'stock_public_card.dart';
import 'v5_media.dart';
import 'v5_support.dart';

class StockPage extends StatelessWidget {
  const StockPage(
      {super.key, this.mode = 'catalog', this.id, this.action, this.city});
  final String mode;
  final String? id, action, city;
  @override
  Widget build(BuildContext context) => V5Gate(
      domain: 'stock',
      route: Uri(path: '/stock/$mode', queryParameters: {
        if (mode == 'catalog' && city?.trim().isNotEmpty == true)
          'city': city!.trim(),
        if (['video', 'listing'].contains(mode) && id != null) 'listingId': id!,
        if (mode == 'purchase' && id != null) 'orderId': id!,
        if (mode == 'listing' && action != null) 'action': action!,
      }).toString(),
      account: ['catalog', 'video'].contains(mode),
      personal: ['purchases', 'purchase'].contains(mode),
      showExpired: mode == 'catalog',
      expiredLabel: '现成视频',
      builder: (s) => mode == 'new' || mode == 'listing' && action == 'revise'
          ? StockListingForm(
              session: s, revisionId: mode == 'listing' ? id : null)
          : _StockScreen(
              session: s,
              mode: mode,
              id: id,
              action: action,
              initialCity: city));
}

List<Widget> stockLicenseFacts(StockLicense l) => [
      tradeFact('许可', '仅购买本人使用 · 非独家 · 全球 · 永久'),
      tradeFact('允许范围', '个人收藏及个人社交分享，非商业使用'),
      tradeFact('不包含', '广告、改编、发行、独立声音、重新生成、新数字人内容、源文件或模型、独家买断'),
      tradeFact('明确收件后的核对期限', '${l.hours} 小时；以本单服务器记录为准'),
      tradeFact('售后约定', l.data['aftercare_terms']),
    ];

class _StockScreen extends StatefulWidget {
  const _StockScreen(
      {required this.session,
      required this.mode,
      this.id,
      this.action,
      this.initialCity});
  final AccountSession session;
  final String mode;
  final String? id, action, initialCity;
  @override
  State<_StockScreen> createState() => _StockScreenState();
}

class _StockScreenState extends State<_StockScreen> {
  late final api = StockApi(widget.session);
  late final city = TextEditingController(text: widget.initialCity?.trim());
  final offers = <StockOffer>[],
      listings = <StockListing>[],
      purchases = <StockPurchase>[];
  StockOffer? offer;
  StockListing? listing;
  StockPurchase? purchase;
  String? cursor, error, notice;
  String channel = 'ALIPAY';
  bool busy = false,
      opened = false,
      notified = false,
      licenseRead = false,
      quoteChanged = false,
      loadFailed = false,
      hasRead = false;
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    ticket++;
    city.dispose();
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
        offers.clear();
        listings.clear();
        purchases.clear();
        cursor = null;
        offer = null;
        listing = null;
        purchase = null;
        opened = false;
        notified = false;
        licenseRead = false;
        quoteChanged = false;
      }
    });
    try {
      switch (widget.mode) {
        case 'catalog':
          final r = await api.catalog(
              cursor: more ? cursor : null, city: city.text.trim());
          offers.addAll(r.items);
          cursor = r.cursor;
        case 'video':
          offer = await api.offer(widget.id ?? '');
        case 'listings':
          final r = await api.listings(cursor: more ? cursor : null);
          listings.addAll(r.items);
          cursor = r.cursor;
        case 'listing':
          listing = await api.listing(widget.id ?? '');
        case 'purchases':
          final r = await api.purchases(cursor: more ? cursor : null);
          purchases.addAll(r.items);
          cursor = r.cursor;
        case 'purchase':
          purchase = await api.purchase(widget.id ?? '');
        default:
          throw const AccountError(400, 'INVALID_PATH');
      }
      api.check(epoch, ['catalog', 'video'].contains(widget.mode) ? null : p);
      if (!mounted || t != ticket) return;
      setState(() => hasRead = true);
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

  Future<void> checkout() async {
    final o = offer;
    if (o == null) return;
    final original = api.pending('/checkout');
    if (original == null && !licenseRead) return;
    final epoch = widget.session.epoch, party = widget.session.partyId;
    if (original == null &&
        !await v5Confirm(
            context,
            api,
            '按本版许可购买',
            [
              Text(o.title),
              tradeFact('价格', v5Money(o.price)),
              ...stockLicenseFacts(o.license)
            ],
            theme: AccountTheme.plazaData)) {
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      api.check(epoch, party);
      final order = await api.checkout(o, channel, retry: original != null);
      api.check(epoch, party);
      if (!mounted) return;
      Navigator.pushReplacementNamed(
          context, '/trade/record?recordId=${order.id}');
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          error = v5Error(e, writing: true);
          if (e.status == 412 || e.code == 'STOCK_OFFER_CHANGED') {
            offer = null;
            licenseRead = false;
            quoteChanged = true;
          }
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<Uint8List> readOfferPreview(StockOffer current) async {
    try {
      return await api.bytes('/catalog/${current.id}/preview', account: true);
    } on AccountError catch (e) {
      if (mounted &&
          offer?.id == current.id &&
          [401, 403, 404, 409].contains(e.status)) {
        setState(() {
          offer = null;
          licenseRead = false;
          error = v5Error(e);
        });
      }
      rethrow;
    }
  }

  Future<void> readNotice() async {
    final current = purchase;
    if (current == null) return;
    var markingRead = false;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final r = await api.notification(current,
          opened: opened, onMarkReadPhase: (writing) => markingRead = writing);
      if (!mounted) return;
      setState(() {
        purchase = r;
        notified = true;
        notice = '本次实际交付通知已标记本人已读；尚未开始收件计时。';
      });
    } on AccountError catch (e) {
      if (mounted) {
        setState(() => error = v5Error(e, writing: markingRead));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> purchaseAction(String action) async {
    final current = purchase;
    if (current == null) return;
    final epoch = widget.session.epoch, party = widget.session.partyId;
    final pending = api.pending('/purchases/${current.orderId}/$action');
    if (pending == null &&
        !await v5Confirm(
            context,
            api,
            action == 'receipt' ? '明确确认本次文件已收到' : '确认本次个人许可交付',
            [Text(current.title), ...stockLicenseFacts(current.license)])) {
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      api.check(epoch, party);
      final r = await api.action(current, action, {}, retry: pending != null);
      if (!mounted) return;
      setState(() {
        purchase = r;
        notice = action == 'receipt' ? '收件已记录，期限以服务器时间为准。' : '本次明确确认已由服务器记录。';
      });
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          error = v5Error(e, writing: true);
          if (e.status == 412) {
            purchase = null;
            opened = false;
            notified = false;
          }
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void go(String route) => Navigator.pushNamed(context, route);
  Widget row(String title, String subtitle, String route) =>
      tradeSection(title, [
        Text(subtitle),
        const SizedBox(height: 12),
        tradeButton('查看详情', () => go(route), outline: true)
      ]);
  Widget catalogueCards() => LayoutBuilder(builder: (context, constraints) {
        final columns = constraints.maxWidth < 280 ||
                MediaQuery.textScalerOf(context).scale(14) > 22
            ? 1
            : 2;
        final width = (constraints.maxWidth - (columns - 1) * 12) / columns;
        return Wrap(spacing: 12, runSpacing: 18, children: [
          for (final item in offers)
            SizedBox(
                key: ValueKey('stock-catalog-${item.id}'),
                width: width,
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      StockPublicCard(
                          offer: item,
                          onTap: () => go('/stock/video?listingId=${item.id}')),
                      const SizedBox(height: 4),
                      Text('${item.data['city']} · ${v5Money(item.price)}',
                          style: const TextStyle(
                              fontSize: 11,
                              color: AccountTheme.muted,
                              height: 1.5)),
                    ])),
        ]);
      });

  @override
  Widget build(BuildContext context) {
    final o = offer, l = listing, p = purchase;
    final title = switch (widget.mode) {
      'catalog' => '全部作品',
      'video' => '作品详情',
      'listings' => '我上架的作品',
      'listing' => '上架与双审核',
      'purchases' => '已购视频',
      _ => '我的个人许可'
    };
    if (busy &&
        !hasRead &&
        widget.mode == 'catalog' &&
        offers.isEmpty &&
        api.pendingOperations.isEmpty &&
        city.text.isEmpty) {
      return V5Frame(
          plaza: ['catalog', 'video'].contains(widget.mode),
          api: api,
          title: title,
          children: [ReadLoadingContent(label: title)]);
    }
    if (loadFailed &&
        !busy &&
        error != null &&
        widget.mode == 'catalog' &&
        offers.isEmpty &&
        api.pendingOperations.isEmpty) {
      return V5Frame(
          plaza: ['catalog', 'video'].contains(widget.mode),
          api: api,
          title: title,
          footer: ReadFailureActions(
              onBack: () => setState(() => loadFailed = false),
              onRetry: () => load()),
          children: [ReadFailureContent(reason: error!)]);
    }
    return V5Frame(
        plaza: ['catalog', 'video'].contains(widget.mode),
        api: api,
        title: title,
        children: [
          if (o != null) ...[
            V5Media(
                key: ValueKey('stock-preview-${o.id}'),
                api: api,
                account: true,
                label: '读取已审预览',
                outline: true,
                caption: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(o.title,
                              style: const TextStyle(
                                  fontFamily: AccountTheme.serif,
                                  fontSize: 24,
                                  fontWeight: FontWeight.w900,
                                  height: 1.45)),
                          const SizedBox(height: 12),
                          Text('${o.data['city']} · 已完成作品',
                              style: const TextStyle(
                                  fontSize: 12, color: AccountTheme.muted)),
                          const SizedBox(height: 20),
                          Text(o.data['description'],
                              style:
                                  const TextStyle(fontSize: 14, height: 1.6)),
                        ])),
                load: () => readOfferPreview(o)),
            const SizedBox(height: 20),
          ],
          if (widget.mode == 'catalog')
            Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(o?.title ?? title,
                    style: const TextStyle(
                        fontFamily: AccountTheme.serif,
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        height: 1.45)))
          else if (widget.mode != 'video')
            tradeHeading(p?.title ?? l?.data['title'] ?? title,
                eyebrow: '完成的作品 / 每份许可有来处'),
          V5RecoveryPanel(
              api: api,
              label: api.recoveryLabel,
              restore: api.restoreOperation,
              onRestored: (r) => go(r['kind'] == 'ORDER'
                  ? '/trade/record?recordId=${r['id']}'
                  : r['order_id'] != null
                      ? '/stock/purchase?orderId=${r['order_id']}'
                      : '/stock/listing?listingId=${r['id']}')),
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!, icon: Icons.error_outline),
          if (notice != null) appNotice(notice!),
          if (widget.mode == 'video' && quoteChanged && o == null) ...[
            tradeHeading('重新确认本版许可', fontSize: 24),
            const Text('原来的已读勾选已清除。重新读取后，再确认当前价格、许可和售后约定。',
                style: TextStyle(fontSize: 14, height: 1.6)),
            const SizedBox(height: 20),
            const CheckboxListTile(
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                title: Text('我已阅读本版价格、个人许可与售后约定'),
                value: false,
                onChanged: null),
            tradeButton('重新核对后才能确认购买', null),
          ],
          if (widget.mode == 'catalog') ...[
            appNotice('选择已完成的作品，按已审个人使用许可购买，无需先创建自己的数字人或填写故事。'),
            TextField(
                controller: city,
                decoration: const InputDecoration(labelText: '城市筛选（可留空）')),
            tradeButton('按城市读取', busy ? null : () => load(), outline: true),
            catalogueCards(),
            const SizedBox(height: 16),
            if (!busy && offers.isEmpty && error == null)
              appNotice(cursor == null
                  ? '当前筛选没有可公开销售的已审作品。'
                  : '本页没有符合条件的作品，可继续读取下一页。'),
            tradeButton('我的已购视频', () => go('/stock/purchases'), outline: true),
            tradeButton('我上架的作品', () => go('/stock/listings'), outline: true),
          ],
          if (o != null) ...[
            tradeSection('价格与本版许可', [
              tradeFact('价格', v5Money(o.price)),
              ...stockLicenseFacts(o.license)
            ]),
            CheckboxListTile(
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                title: const Text('我已阅读本版价格、个人许可与售后约定'),
                value: licenseRead,
                onChanged: busy || api.pending('/checkout') != null
                    ? null
                    : (v) => setState(() => licenseRead = v == true)),
            DropdownButtonFormField<String>(
                initialValue: channel,
                decoration: const InputDecoration(labelText: '订单约定支付渠道'),
                items: const [
                  DropdownMenuItem(value: 'ALIPAY', child: Text('支付宝')),
                  DropdownMenuItem(
                      value: 'APPLE', child: Text('Apple（须真实商店产品已审）')),
                  DropdownMenuItem(
                      value: 'CUSTODY', child: Text('消费者余额（资金服务未接通）'))
                ],
                onChanged: busy || api.pending('/checkout') != null
                    ? null
                    : (v) => setState(() => channel = v!)),
            const SizedBox(height: 16),
            appNotice('确认只建立原订单。是否付款及许可是否生效，以原订单实际核实结果为准；不开私人联系卡。'),
            tradeButton(
                api.pending('/checkout') == null ? '确认本版购买并查看原订单' : '恢复原购买请求核对',
                busy || !licenseRead && api.pending('/checkout') == null
                    ? null
                    : checkout),
          ],
          if (widget.mode == 'listings') ...[
            tradeButton('提交一部现成作品上架', busy ? null : () => go('/stock/new')),
            appNotice('App 可办理本人轻量上架；机构批量经营与独立审核请在网页工作区办理。L1 可售，不强制先购买 L2。'),
            for (final r in listings)
              row(r.data['title'], stockStatuses[r.status]!,
                  '/stock/listing?listingId=${r.id}'),
            if (!busy && listings.isEmpty && error == null)
              appNotice('本人当前没有上架材料。'),
          ],
          if (l != null) ...[
            if (['REJECTED', 'UNLISTED', 'LISTED'].contains(l.status) &&
                l.data['rights_hold'] != true &&
                l.data['revision_id'] == null &&
                l.data['replaced_by_listing_id'] == null)
              tradeButton(
                  '修改材料并重新提交审核',
                  busy
                      ? null
                      : () =>
                          go('/stock/listing?listingId=${l.id}&action=revise')),
            if (l.data['revision_id'] != null)
              tradeButton('查看已提交的新版本',
                  () => go('/stock/listing?listingId=${l.data['revision_id']}'),
                  outline: true),
            if (l.data['previous_listing_id'] != null)
              tradeButton(
                  '查看修改前版本',
                  () => go(
                      '/stock/listing?listingId=${l.data['previous_listing_id']}'),
                  outline: true),
            tradeSection('上架状态与审核', [
              tradeFact('状态', stockStatuses[l.status]),
              tradeFact('卖方具体真人', '本次已授权真人'),
              tradeFact('城市', l.data['city']),
              tradeFact('说明', l.data['description']),
              for (final kind in ['RIGHTS', 'CONTENT'])
                tradeFact(
                    kind == 'RIGHTS' ? '权利审核' : '内容审核',
                    l.data['reviews'][kind] == null
                        ? '等待独立审核'
                        : '${const {
                              'APPROVED': '已独立审核',
                              'APPROVE': '已独立审核',
                              'REJECTED': '独立审核未通过',
                              'REJECT': '独立审核未通过'
                            }[l.data['reviews'][kind]['decision']] ?? '请核对原审核记录'} · ${l.data['reviews'][kind]['reason']}'),
              ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: const EdgeInsets.only(bottom: 12),
                  title: const Text('记录依据'),
                  children: [
                    tradeFact('真人记录',
                        '${(l.data['seller_person_id'] as String).substring(0, 8)}…${(l.data['seller_person_id'] as String).substring(30)}')
                  ]),
              if (l.data['rights_hold'] == true)
                appNotice('权利暂停会限制已购下载；恢复须重新双审。'),
              if (l.status == 'UNLISTED') appNotice('普通下架停止新销售，已售许可仍按原约定核对。')
            ]),
            V5Media(
                api: api,
                label: '核对本人上架预览',
                load: () => api.bytes('/listings/${l.id}/files/preview')),
            if (!['UNLISTED', 'RIGHTS_HOLD'].contains(l.status))
              V5Form(
                  api: api,
                  title: '停止新销售',
                  action: '确认普通下架',
                  suffix: '/listings/${l.id}/status',
                  version: l.version,
                  fields: const [V5Field('reason', '下架原因', type: 'multiline')],
                  buildBody: (v) => {'action': 'UNLIST', 'reason': v['reason']},
                  parse: (d) {
                    StockListing(d, api.owner(), id: l.id);
                  },
                  reload: () async => (await api.listing(l.id)).version,
                  onSuccess: (_) => load()),
          ],
          if (widget.mode == 'purchases') ...[
            tradeSection('按作品来源查看', [
              const Text('当前为本人已购现货。定制制作和试镜交付在各自目录核对权限与状态。'),
              const SizedBox(height: 12),
              Wrap(spacing: 12, runSpacing: 8, children: [
                OutlinedButton(
                    onPressed: () => go('/production/works'),
                    child: const Text('定制交付作品')),
                OutlinedButton(
                    onPressed: () => go('/auditions/bookings'),
                    child: const Text('试镜交付记录')),
              ]),
            ]),
            for (final r in purchases)
              row(r.title, stockStatuses[r.status]!,
                  '/stock/purchase?orderId=${r.orderId}'),
            if (!busy && purchases.isEmpty && error == null)
              appNotice('本人当前没有现货订单。付款核实后才发放个人许可。'),
          ],
          if (p != null) ...[
            tradeSection('本次许可与交付', [
              if (p.data['current_case_id'] != null)
                appNotice('本单售后处理中，正式文件下载已暂停。原许可记录保留，等待独立客服核对。'),
              tradeFact('许可状态', stockStatuses[p.status]),
              tradeFact('原订单状态',
                  tradeStatuses[p.raw['order_status']] ?? '当前状态待核对，请查看原订单'),
              ...stockLicenseFacts(p.license),
              ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: const EdgeInsets.only(bottom: 12),
                  title: const Text('原合同依据'),
                  children: [tradeFact('原合同指纹', p.raw['contract_sha256'])])
            ]),
            if (p.usable)
              V5Media(
                  key: ValueKey('${p.orderId}:$ticket'),
                  api: api,
                  label: '受控播放已购作品',
                  onInvalid: () {
                    if (mounted) {
                      setState(() {
                        opened = false;
                        notified = false;
                      });
                    }
                  },
                  fileName: '${p.orderId}.mp4',
                  allowSave: true,
                  load: () => api.bytes('/purchases/${p.orderId}/content'),
                  onOpened: () async {
                    final current = await api.purchase(p.orderId);
                    if (mounted) {
                      setState(() {
                        purchase = current;
                        opened = true;
                      });
                    }
                  }),
            if (!p.usable) appNotice('当前不可读取正式文件。请核对原付款、本人许可或售后处理；不能回退为公开文件。'),
            if (p.data['accepted_at'] == null && p.usable) ...[
              tradeButton(
                  '确认本次交付通知已读', busy || !opened || notified ? null : readNotice,
                  outline: true),
              tradeButton(
                  api.pending('/purchases/${p.orderId}/receipt') != null
                      ? '恢复原收件请求核对'
                      : '明确确认本次文件已收到',
                  busy ||
                          api.pending('/purchases/${p.orderId}/receipt') ==
                                  null &&
                              (!opened ||
                                  !notified ||
                                  p.data['receipt_at'] != null)
                      ? null
                      : () => purchaseAction('receipt')),
              tradeButton(
                  api.pending('/purchases/${p.orderId}/acceptance') != null
                      ? '恢复原验收请求核对'
                      : '确认本次个人许可交付',
                  busy ||
                          api.pending('/purchases/${p.orderId}/acceptance') ==
                                  null &&
                              !opened
                      ? null
                      : () => purchaseAction('acceptance'),
                  outline: true),
            ],
            if (p.data['deadline_at'] != null)
              tradeFact('服务器记录的核对截止', tradeDate(p.data['deadline_at'])),
            if (p.data['accepted_at'] != null)
              appNotice(p.data['acceptance_method'] == 'AGREED_TIMEOUT'
                  ? '按原约定期限处理，未冒记本人主动确认。'
                  : '本人已明确确认本次交付。'),
            for (final c in p.cases)
              tradeSection(stockCases[c['kind']]!, [
                Text(c['reason']),
                tradeFact(
                    '处理',
                    c['resolution'] == null
                        ? '等待独立客服核对'
                        : '${c['resolution']['decision'] == 'REFUND' ? '已核定应退款，渠道结果另查' : '恢复核对；需重新读取与收件'} · ${c['resolution']['reason']}')
              ]),
            if (p.data['current_case_id'] == null &&
                !['AWAITING_PAYMENT', 'REVOKED', 'REFUND_REQUIRED']
                    .contains(p.status))
              V5Form(
                  api: api,
                  title: '原单售后',
                  action: '提交本单售后问题',
                  suffix: '/purchases/${p.orderId}/cases',
                  version: p.version,
                  fields: const [
                    V5Field('kind', '问题类型', choices: stockCases),
                    V5Field('reason', '问题说明', type: 'multiline')
                  ],
                  buildBody: (v) => {'kind': v['kind'], 'reason': v['reason']},
                  parse: (d) {
                    StockPurchase(d, api.owner(), orderId: p.orderId);
                  },
                  reload: () async => (await api.purchase(p.orderId)).version,
                  onSuccess: (_) => load()),
            tradeButton(
                '原订单、付款与退款记录', () => go('/trade/record?recordId=${p.orderId}'),
                outline: true),
            appNotice('实际退款核实后平台停止继续下载，不能远程抹去已经保存到本地的文件。售后独立处理不等于资金已经到账。'),
          ],
          if (cursor != null)
            tradeButton('继续读取下一页', busy ? null : () => load(more: true),
                outline: true),
          tradeButton('重新读取本页', busy ? null : () => load(), outline: true),
        ]);
  }
}
