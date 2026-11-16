import '../rights/rights_widgets.dart';
import '../rights/rights_models.dart' show commercialUses;
import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../support/collections.dart';
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
import 'stock_purchase_summary.dart';
import 'stock_public_media.dart';
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
      stateKey: mode == 'catalog' ? '/stock/catalog' : null,
      route: Uri(path: '/stock/$mode', queryParameters: {
        if (mode == 'catalog' && city?.trim().isNotEmpty == true)
          'city': city!.trim(),
        if (['video', 'listing'].contains(mode) && id != null) 'listingId': id!,
        if (mode == 'purchase' && id != null) 'orderId': id!,
        if (mode == 'listing' && action != null) 'action': action!,
      }).toString(),
      account: ['catalog', 'video'].contains(mode),
      personal: false,
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

List<Widget> stockLicenseFacts(StockLicense l) => stockRightsFacts(l.data);

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
  bool independentCity = false;
  String queryCity = '';
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void didUpdateWidget(covariant _StockScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.mode == 'catalog' &&
        !independentCity &&
        oldWidget.initialCity != widget.initialCity) {
      city.text = (widget.initialCity ?? '').trim();
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
              city.text = (widget.initialCity ?? '').trim();
            });
            load();
          }, outline: true),
      ]);

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
        queryCity = city.text.trim();
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
          final r =
              await api.catalog(cursor: more ? cursor : null, city: queryCity);
          if (!mounted || t != ticket) return;
          api.check(epoch, null);
          offers.addAll(r.items);
          cursor = r.cursor;
        case 'video':
          final r = await api.offer(widget.id ?? '');
          if (!mounted || t != ticket) return;
          api.check(epoch, null);
          offer = r;
        case 'listings':
          final r = await api.listings(cursor: more ? cursor : null);
          if (!mounted || t != ticket) return;
          api.check(epoch, p);
          listings.addAll(r.items);
          cursor = r.cursor;
        case 'listing':
          final r = await api.listing(widget.id ?? '');
          if (!mounted || t != ticket) return;
          api.check(epoch, p);
          listing = r;
        case 'purchases':
          final r = await api.purchases(cursor: more ? cursor : null);
          if (!mounted || t != ticket) return;
          api.check(epoch, p);
          purchases.addAll(r.items);
          cursor = r.cursor;
        case 'purchase':
          final r = await api.purchase(widget.id ?? '');
          if (!mounted || t != ticket) return;
          api.check(epoch, p);
          purchase = r;
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
    if (original == null && (!licenseRead || channel == 'CUSTODY')) return;
    final epoch = widget.session.epoch, party = widget.session.partyId;
    if (original == null &&
        !await v5Confirm(
            context,
            api,
            '按本版许可购买',
            [
              Text(o.title),
              Text(v5Money(o.price), style: const TextStyle(
                  color: AccountTheme.accent, fontSize: 32,
                  fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
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
            action == 'receipt' ? '明确确认本次文件已收到' : '确认本次原单许可交付',
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
                          session: widget.session,
                          offer: item,
                          onRefreshOffer: () => load(),
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
      'video' => '视频商品详情',
      'listings' => '视频商品',
      'listing' => '上架与双审核',
      'purchases' => '已购作品与下载',
      _ => '我的购买许可'
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
        footer: widget.mode == 'listings'
            ? FilledButton(
                onPressed: busy || api.writes > 0 || api.pendingOperations.isNotEmpty
                    ? null : () => go('/stock/new'),
                child: const Text('上传视频商品'))
            : o == null ? null : Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              CollectionDetailActions(
                  key: ValueKey('stock-save:${o.id}'),
                  session: widget.session, kind: 'STOCK', targetId: o.id,
                  purchaseAction: FilledButton(
                      onPressed: busy || (!licenseRead || channel == 'CUSTODY') && api.pending('/checkout') == null
                          ? null : checkout,
                      child: Text(api.pending('/checkout') == null
                          ? '立即购买' : '恢复原购买请求'))),
              const SizedBox(height: 6),
              const Text('建立订单不等于付款成功',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11, color: AccountTheme.muted)),
            ]),
        children: [
          if (o != null) ...[
            tradeHeading(o.title,
                eyebrow: o.license.data['scope'] == 'COMMERCIAL_LIMITED'
                    ? '现成成片 / 本单独立商用许可 · 非独家'
                    : '现成成片 / 个人非商用许可 · 非独家',
                fontSize: 28),
            Container(
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(color: AccountTheme.surface,
                  borderRadius: BorderRadius.circular(16)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            StockPublicMediaView(
                session: widget.session,
                offer: o,
                onRefreshOffer: () => load()),
            const SizedBox(height: 16),
            V5Media(
                key: ValueKey('stock-preview-${o.id}-${o.version}-${o.hash}'),
                api: api,
                account: true,
                label: '读取已审预览',
                outline: true,
                caption: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${o.data['city']} · 购买前预览 · 非正式交付',
                              style: const TextStyle(
                                  fontSize: 12, color: AccountTheme.muted)),
                          const SizedBox(height: 20),
                          Text(o.data['description'],
                              style:
                                  const TextStyle(fontSize: 14, height: 1.6)),
                        ])),
                load: () => readOfferPreview(o)),
              ])),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: AccountTheme.selectedSurface,
                  borderRadius: BorderRadius.circular(16)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('购买前请确认',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              Text(o.license.data['acceptance_policy'] == 'CONTRACT_20261029'
                  ? '本版按原下单起点核对，约定期限为${o.license.hours}小时；未付款、未交付或存在争议时不得自动结算。'
                  : '本版在明确收讫后按${o.license.hours}小时核对验收；以该版完整许可与售后约定为准。'),
              const SizedBox(height: 8),
              const Text('当前仅为预览。下单、付款、许可生效和正式文件可用分别核实。',
                  style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
            ])),
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
          else if (widget.mode != 'video' && widget.mode != 'listings')
            tradeHeading(widget.mode == 'purchases'
                    ? '我的作品库' : p?.title ?? l?.data['title'] ?? title,
                eyebrow: widget.mode == 'purchases'
                    ? '本人现货购买记录 / 每份作品保留使用范围'
                    : '完成的作品 / 每份许可有来处',
                fontSize: 28),
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
                title: Text('我已阅读本版价格、许可用途、地域、期间与售后约定'),
                value: false,
                onChanged: null),
            tradeButton('重新核对后才能确认购买', null),
          ],
          if (widget.mode == 'catalog') ...[
            appNotice('选择已完成的作品，按该商品已审的个人或商用许可购买，无需先创建自己的数字人或填写故事。'),
            cityScope(),
            TextField(
                controller: city,
                onChanged: (_) => setState(() => independentCity = true),
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
            const Text('本版许可价格',
                style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
            const SizedBox(height: 8),
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(v5Money(o.price), style: const TextStyle(
                  color: AccountTheme.accent, fontSize: 28,
                  fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Text(o.license.data['scope'] == 'COMMERCIAL_LIMITED'
                  ? '一次购买 · 本单明确列出的有限商用用途'
                  : '一次购买 · 本人收藏与个人社交分享'),
              const SizedBox(height: 12),
              if (o.license.data['scope'] == 'COMMERCIAL_LIMITED') ...[
                tradeFact('本版许可地域', o.license.data['territory']),
                tradeFact('本版许可期间',
                    '${o.license.data['valid_from']} 至 ${o.license.data['valid_until']}（UTC）'),
              ],
              const Divider(height: 32),
              const Text('包含的许可',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text(o.license.data['scope'] == 'COMMERCIAL_LIMITED'
                  ? (o.license.data['commercial_uses'] as List)
                      .map((use) => commercialUses[use] ?? use).join('、')
                  : '本人收藏与个人社交分享',
                  style: const TextStyle(fontSize: 14, height: 1.6)),
              const SizedBox(height: 20),
              const Text('不包含',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text((o.license.data['excluded'] as List).map((item) => const {
                    'COMMERCIAL_ADVERTISING': '商业广告',
                    'ADAPTATION': '改编',
                    'DISTRIBUTION': '发行',
                    'VOICE_SEPARATELY': '声音单独使用',
                    'AI_REGENERATION': 'AI 再生成',
                    'SOURCE_OR_MODEL_FILES': '源文件或模型文件',
                    'NEW_AVATAR_CONTENT': '新数字人内容生成',
                    'EXCLUSIVE_BUYOUT': '独家买断',
                  }[item] ?? item).join('、'),
                  style: const TextStyle(fontSize: 14, height: 1.6,
                      color: AccountTheme.muted)),
              const SizedBox(height: 20),
              Container(
                decoration: BoxDecoration(
                    border: Border.all(color: AccountTheme.border),
                    borderRadius: BorderRadius.circular(12)),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: const EdgeInsets.only(bottom: 12),
                  title: const Text('查看完整许可说明'),
                  subtitle: const Text('包含与不包含的用途、地域、期间及售后'),
                  children: stockLicenseFacts(o.license))),
            ]),
            CheckboxListTile(
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                title: const Text('我已阅读本版价格、许可用途、地域、期间与售后约定'),
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
                      value: 'CUSTODY', enabled: false, child: Text('消费者余额（资金服务未接通）'))
                ],
                onChanged: busy || api.pending('/checkout') != null
                    ? null
                    : (v) {
                      if (v != null && v != 'CUSTODY') setState(() => channel = v);
                    }),
            const SizedBox(height: 16),
            appNotice('确认只建立原订单。是否付款及许可是否生效，以原订单实际核实结果为准；不开私人联系卡。'),
            tradeButton('我的收藏与浏览记录', () => go('/saved'), outline: true),
            tradeButton('反馈或举报这份作品',
                () => go('/support/new?domain=STOCK_PUBLIC&recordId=${o.id}'),
                outline: true),
            tradeSection('作品客服暂未开放', [
              const Text('购买咨询入口仅为预留，不提供私人联系方式。点击购买、收藏或打开详情不会开放沟通；正式订单沟通仍需核对本次付款与订单权限。'),
            ]),


          ],
          if (widget.mode == 'listings') ...[
            tradeHeading('视频商品', eyebrow: '本人上架 / 内容与授权分别核验', fontSize: 28),
            const Text('全部已读取商品',
                style: TextStyle(color: AccountTheme.accent, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            appNotice('按服务器分页展示，不以当前页统计或筛选冒充全部商品。'),
            for (final r in listings)
              Container(
                  decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: AccountTheme.border))),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Container(width: 60, height: 80,
                        decoration: BoxDecoration(color: AccountTheme.surface,
                            borderRadius: BorderRadius.circular(10)),
                        child: const Icon(Icons.movie_outlined, color: AccountTheme.muted)),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(r.data['title'], style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 8),
                      Text('${r.data['city']} · 第 ${r.version} 版',
                          style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
                      const SizedBox(height: 6),
                      Text(stockStatuses[r.status] ?? r.status,
                          style: TextStyle(fontSize: 12, height: 1.5,
                              color: r.status == 'LISTED' ? AccountTheme.accent
                                  : r.status == 'IN_REVIEW' ? const Color(0xFFE5C66B)
                                  : r.status == 'REJECTED' || r.status == 'RIGHTS_HOLD'
                                      ? AccountTheme.danger : AccountTheme.muted)),
                    ])),
                    const SizedBox(width: 8),
                    SizedBox(width: 76, child: TextButton(
                        onPressed: busy || api.writes > 0 || api.pendingOperations.isNotEmpty
                            ? null : () => go('/stock/listing?listingId=${r.id}'),
                        child: Text(r.status == 'IN_REVIEW' ? '查看进度'
                            : r.status == 'REJECTED' ? '核对退回' : '查看商品',
                            textAlign: TextAlign.center))),
                  ])),
            if (!busy && listings.isEmpty && error == null)
              appNotice('本人当前没有上架材料。'),
            tradeSection('上架前请确认', [
              const Text('自制作品与平台代做作品均需核验内容和相关授权。下架不删除原合同、历史订单与已购许可。',
                  style: TextStyle(color: AccountTheme.muted, height: 1.6)),
              appNotice('App 可办理本人轻量上架；机构批量经营与独立审核请在网页工作区办理。L1 可售，不强制先购买 L2。'),
            ]),
          ],
          if (l != null) ...[
            if (l.status == 'REJECTED')
              Container(
                  margin: const EdgeInsets.only(bottom: 20),
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(color: AccountTheme.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AccountTheme.danger)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('这份商品审核已退回',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600,
                            color: AccountTheme.danger)),
                    const SizedBox(height: 8),
                    Text('对应原记录版本 ${l.version}，请核对下方权利与内容审核意见。',
                        style: const TextStyle(fontSize: 12, height: 1.6)),
                    const SizedBox(height: 8),
                    const Text('补齐真实授权后重新提交；申请人不能代替另一权利人作出本人同意。重提保留原版本和已售许可历史。',
                        style: TextStyle(fontSize: 12, height: 1.6, color: AccountTheme.muted)),
                  ])),
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
              if (l.status == 'REJECTED')
                appNotice('请按权利审核和内容审核的退回原因修改材料，再提交新版本重新审核；原记录和已售许可继续保留。'),
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
            SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  const Chip(label: Text('现成视频')),
                  const SizedBox(width: 8),
                  TextButton(onPressed: busy ? null : () => go('/production/works'),
                      child: const Text('制作成片 ↗')),
                  TextButton(onPressed: busy ? null : () => go('/auditions/bookings'),
                      child: const Text('试镜素材 ↗')),
                ])),
            const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text('本页只列现货原单；制作和试镜分别进入真实来源记录，不合并成未经核实的“全部作品”。',
                    style: TextStyle(fontSize: 12, color: AccountTheme.muted))),
            for (final r in purchases)
              Container(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  decoration: const BoxDecoration(border: Border(
                      bottom: BorderSide(color: AccountTheme.border))),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Container(width: 60, height: 80,
                        decoration: BoxDecoration(color: AccountTheme.surface,
                            borderRadius: BorderRadius.circular(10)),
                        child: const Icon(Icons.movie_outlined,
                            color: AccountTheme.muted)),
                    const SizedBox(width: 12),
                    Expanded(child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(r.title, style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      Text(stockStatuses[r.status] ?? r.status,
                          style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
                      const SizedBox(height: 4),
                      Text(r.license.data['scope'] == 'COMMERCIAL_LIMITED'
                          ? '本单有限商用许可 · 非独家'
                          : '本单个人非商用许可 · 非独家',
                          style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
                      const SizedBox(height: 6),
                      Text(r.usable ? '当前许可可读取 · 打开后重新核对'
                          : '尚不可读取正式文件 · 核对原单',
                          style: TextStyle(fontSize: 11,
                              color: r.usable ? AccountTheme.accent : AccountTheme.muted)),
                    ])),
                    const SizedBox(width: 8),
                    SizedBox(width: 82, child: TextButton(
                        onPressed: busy ? null : () => go('/stock/purchase?orderId=${r.orderId}'),
                        child: Text(r.usable ? '播放 / 下载' : '核对原单',
                            textAlign: TextAlign.center))),
                  ])),
            tradeSection('每份作品保留使用范围', [
              const Text('播放、保存和后续使用都以原单有效许可为准。下载不自动授予商用、改编或再分发权限。'),
              tradeButton('查看合同与许可', busy ? null : () => go('/library?section=contracts'),
                  outline: true),
            ]),
            if (!busy && purchases.isEmpty && error == null)
              appNotice('当前身份没有现货订单。付款及资格核实后按原单发放许可。'),
          ],
          if (p != null) ...[
            tradeHeading('已购作品阅览', eyebrow: '原现货订单 / 受控媒体', fontSize: 24),
            StockPurchaseSummary(purchase: p),
            Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(p.usable ? '当前许可可读取作品' : '作品权限待核对',
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
            const Text('原付款成功不等于永久可用。播放与保存以当前许可、有效期及售后结果为准；本页不是制作验收。',
                style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.6)),

            if (p.usable) ...[
              const Text('有权查看的媒体',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              const Text('播放与保存均须核对当前权限。文件保存到本机后仍受许可约束。',
                  style: TextStyle(color: AccountTheme.muted, fontSize: 13, height: 1.5)),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: AccountTheme.surface,
                    borderRadius: BorderRadius.circular(16)),
                child: V5Media(
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
              ),
            ],
            tradeSection('媒体使用边界', [
              const Text('作品仅按本订单当前有效许可读取与保存。页面未提供独立分享授权，不应转发受控文件或临时访问地址。',
                  style: TextStyle(fontSize: 14, height: 1.7)),
              const Text('本页没有单独声音试听或声音单用授权；播放不代表确认交付。',
                  style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.6)),
            ]),
            tradeSection('本次许可与交付', [
              if (p.data['current_case_id'] != null)
                appNotice('本单售后处理中，正式文件下载已暂停。原许可记录保留，等待独立客服核对。'),
              tradeFact('许可状态', stockStatuses[p.status]),
              tradeFact('原订单状态',
                  tradeStatuses[p.raw['order_status']] ?? '当前状态待核对，请查看原订单'),
              ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: const EdgeInsets.only(bottom: 12),
                  title: const Text('查看当前许可范围'),
                  children: stockLicenseFacts(p.license)),
              ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: const EdgeInsets.only(bottom: 12),
                  title: const Text('原合同依据'),
                  children: [tradeFact('原合同指纹', p.raw['contract_sha256'])])
            ]),
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
                      : '确认本次原单许可交付',
                  busy ||
                          api.pending('/purchases/${p.orderId}/acceptance') ==
                                  null &&
                              !opened
                      ? null
                      : () => purchaseAction('acceptance'),
                  outline: true),
            ],
            if (p.data['acceptance_started_at'] != null)
              tradeFact(
                  '服务器记录的原下单起点', tradeDate(p.data['acceptance_started_at'])),
            if (p.data['deadline_at'] != null)
              tradeFact('服务器记录的核对截止', tradeDate(p.data['deadline_at'])),
            if (p.data['accepted_at'] != null)
              appNotice(p.data['acceptance_method'] == 'AGREED_TIMEOUT'
                  ? '按原约定期限处理，未冒记本人主动确认。'
                  : '本人已明确确认本次交付。'),
            if (p.data['refund_plan'] != null) tradeSection('退款与许可决定', [
              tradeFact('本案核定退款', v5Money(p.data['refund_plan']['amount_minor'])),
              tradeFact('退款到账后原许可', p.data['refund_plan']['license_action'] == 'KEEP' ? '保留原许可，仍须满足当前授权' : '撤销原许可'),
              const Text('这是已核定的处理方案，实际到账请查看原订单渠道记录。',
                  style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.5)),
            ]),
            for (final c in p.cases)
              tradeSection(stockCases[c['kind']]!, [
                Text(c['reason']),
                tradeFact('提交时间', tradeDate(c['opened_at'])),
                if (c['resolution'] != null)
                  tradeFact('处理时间', tradeDate(c['resolution']['at'])),
                tradeFact(
                    '处理',
                    c['resolution'] == null
                        ? '等待独立客服核对'
                        : '${c['resolution']['decision'] == 'REFUND' ? '已核定应退款，渠道结果另查' : '恢复核对；需重新读取与收件'} · ${c['resolution']['reason']}')
              ]),
            if (p.data['current_case_id'] == null && p.raw['order_status'] != 'REFUNDED' &&
                !['AWAITING_PAYMENT', 'REFUND_REQUIRED']
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
            appNotice('退款金额和许可处理分别由独立审核员决定。到账前暂停使用；到账后按已审决定保留或撤销原许可，权属和本人授权仍另行核验。不能远程抹去本地文件，售后决定也不表示资金已到账。'),
          ],
          if (cursor != null)
            tradeButton('继续读取下一页', busy ? null : () => load(more: true),
                outline: true),
          tradeButton('重新读取本页', busy ? null : () => load(), outline: true),
        ]);
  }
}
