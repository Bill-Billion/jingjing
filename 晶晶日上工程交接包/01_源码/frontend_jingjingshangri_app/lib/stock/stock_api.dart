import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../operations/operation_api.dart';
import '../supply/supply_models.dart';
import '../trade/trade_models.dart';
import 'stock_models.dart';
import 'v5_support.dart';

class StockApi extends V5Api {
  StockApi(AccountSession session) : super(session, 'stock');
  String? recoveryLabel(String path) {
    final suffix = path.startsWith(base) ? path.substring(base.length) : '';
    if (suffix == '/checkout') return '购买';
    if (suffix == '/listings') return '上架';
    if (RegExp(r'^/listings/[0-9a-fA-F-]{36}/status$').hasMatch(suffix)) {
      return '下架';
    }
    if (RegExp(r'^/purchases/[0-9a-fA-F-]{36}/(receipt|acceptance|cases)$')
        .hasMatch(suffix)) {
      return '交付或售后';
    }
    return null;
  }

  Future<Map<String, dynamic>> restoreOperation(String path) async {
    if (recoveryLabel(path) == null) {
      throw const AccountError(400, 'INVALID_ACTION');
    }
    final suffix = path.substring(base.length), p = owner();
    if (suffix == '/checkout') {
      final r =
          await retry(suffix, (d) => TradeRecord.parse(d, p, kind: 'ORDER'),
              reread: () async {
        await purchases();
      });
      return r.raw;
    }
    if (suffix == '/listings' || suffix.startsWith('/listings/')) {
      final id = suffix == '/listings' ? null : suffix.split('/')[2];
      return (await retry(suffix, (d) => StockListing(d, p, id: id),
              reread: () async {
        if (id == null) {
          await listings();
        } else {
          await listing(id);
        }
      }))
          .raw;
    }
    final id = suffix.split('/')[2];
    return (await retry(suffix, (d) => StockPurchase(d, p, orderId: id),
            reread: () async {
      await purchase(id);
    }))
        .raw;
  }

  Future<V5Page<StockOffer>> catalog(
          {String? cursor, String? city, String? personId}) =>
      get('/catalog', (d) => V5Page.parse(d, StockOffer.new, previous: cursor),
          account: true,
          query: {
            'limit': 20,
            if (cursor != null) 'cursor': cursor,
            if (city != null && city.isNotEmpty) 'city': city,
            if (personId != null && personId.isNotEmpty)
              'person_id': key(personId)
          });
  Future<StockOffer> offer(String id) =>
      get('/catalog/${key(id)}', (d) => StockOffer(d, id: id), account: true);
  Future<V5Page<StockListing>> listings({String? cursor}) {
    final p = owner();
    return get('/listings',
        (d) => V5Page.parse(d, (r) => StockListing(r, p), previous: cursor),
        query: {'limit': 20, if (cursor != null) 'cursor': cursor});
  }

  Future<StockListing> listing(String id) {
    final p = owner();
    return get('/listings/${key(id)}', (d) => StockListing(d, p, id: id));
  }

  Future<V5Page<StockPurchase>> purchases({String? cursor}) {
    final p = owner(personal: true);
    return get('/purchases',
        (d) => V5Page.parse(d, (r) => StockPurchase(r, p), previous: cursor),
        query: {'limit': 20, if (cursor != null) 'cursor': cursor});
  }

  Future<StockPurchase> purchase(String id) {
    final p = owner(personal: true);
    return get(
        '/purchases/${key(id)}', (d) => StockPurchase(d, p, orderId: id));
  }

  Future<TradeRecord> checkout(StockOffer offer, String channel,
      {bool retry = false}) async {
    final p = owner(personal: true);
    TradeRecord parse(Map<String, dynamic> d) =>
        TradeRecord.parse(d, p, kind: 'ORDER');
    if (retry) {
      return this.retry('/checkout', parse, reread: () async {
        await this.offer(offer.id);
        await purchases();
      });
    }
    final current = await this.offer(offer.id);
    if (current.hash != offer.hash) {
      throw const AccountError(409, 'STOCK_OFFER_CHANGED');
    }
    if (!['ALIPAY', 'APPLE', 'CUSTODY'].contains(channel)) {
      throw const AccountError(400, 'INVALID_CHANNEL');
    }
    return post(
        '/checkout',
        {
          'listing_id': offer.id,
          'offer_sha256': offer.hash,
          'channel': channel
        },
        parse);
  }

  Future<StockPurchase> action(
      StockPurchase purchase, String action, Map<String, dynamic> body,
      {bool retry = false}) {
    if (!['receipt', 'acceptance', 'cases'].contains(action)) {
      throw const AccountError(400, 'INVALID_ACTION');
    }
    final p = owner(personal: true),
        suffix = '/purchases/${purchase.orderId}/$action';
    StockPurchase parse(Map<String, dynamic> d) =>
        StockPurchase(d, p, orderId: purchase.orderId);
    return retry
        ? this.retry(suffix, parse, reread: () async {
            await this.purchase(purchase.orderId);
          })
        : post(suffix, body, parse, version: purchase.version);
  }

  Future<StockPurchase> notification(StockPurchase purchase,
      {required bool opened,
      void Function(bool writing)? onMarkReadPhase}) async {
    final p = owner(personal: true), epoch = session.epoch;
    final current = await this.purchase(purchase.orderId),
        id = current.data['notification_event_id'];
    if (!opened ||
        !current.usable ||
        current.data['viewed_at'] == null ||
        !v5Int(id, min: 1)) {
      throw const AccountError(409, 'STOCK_RECEIPT_NOT_READY');
    }
    final ops = OperationApi(session), n = await ops.notice(id);
    check(epoch, p);
    v5Require(n != null &&
        n.domain == 'TRADE' &&
        n.recordId == current.orderId &&
        ['STOCK_DELIVERY_AVAILABLE', 'STOCK_DELIVERY_REISSUED']
            .contains(n.code));
    onMarkReadPhase?.call(true);
    await ops.markRead(id);
    onMarkReadPhase?.call(false);
    check(epoch, p);
    return this.purchase(current.orderId);
  }

  Future<Map<String, dynamic>> upload(Uint8List bytes,
      {bool retry = false}) async {
    final p = owner(), epoch = session.epoch, op = pending('/files');
    if (retry) {
      if (op == null || op['bytes'] is! Uint8List) {
        throw const AccountError(409, 'NO_PENDING_OPERATION');
      }
      bytes = op['bytes'];
    }
    if (bytes.isEmpty || bytes.length > 50 * 1024 * 1024) {
      throw const AccountError(413, 'FILE_TOO_LARGE');
    }
    writes++;
    notifyListeners();
    try {
      final d = await session.upload(path('/files'), bytes,
          actingParty: p, query: const {}, validate: (d) {
        SupplyDto.asset(d, p, purpose: 'WORK_CONTENT');
        v5Require(d['media_type'] == 'video/mp4' &&
            d['byte_size'] == bytes.length &&
            d['content_sha256'] == sha256.convert(bytes).toString());
      });
      check(epoch, p);
      return d;
    } finally {
      writes--;
      notifyListeners();
    }
  }
}
