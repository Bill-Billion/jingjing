import '../account/account_api.dart';
import '../account/account_session.dart';
import '../contracts/contract_api.dart';
import 'trade_models.dart';

class TradePage {
  const TradePage(this.items, this.nextCursor);
  final List<TradeRecord> items;
  final String? nextCursor;
}

class TradeApi {
  TradeApi(this.session);
  final AccountSession session;
  String owner() {
    if (!session.isLoggedIn) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    if (session.partyId == null ||
        !session.isOwner ||
        session.selected?['membership']?['current_status'] != 'ACTIVE' ||
        session.tradeAccessDenied ||
        ['SUSPENDED', 'CLOSED'].contains(session.party?['current_status'])) {
      throw const AccountError(403, 'TRADE_PARTY_FORBIDDEN');
    }
    return session.partyId!;
  }

  void check(int epoch, String party) {
    if (epoch != session.epoch || party != owner()) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
  }

  Future<TradePage> page(String kind, {String? cursor}) async {
    if (!tradeKinds.containsKey(kind)) {
      throw const AccountError(400, 'INVALID_KIND');
    }
    final p = owner(), epoch = session.epoch;
    final raw = await session.read('/api/v1/trade/records',
        actingParty: p,
        query: {
          'kind': kind,
          'limit': 20,
          if (cursor != null) 'cursor': cursor
        });
    check(epoch, p);
    tradeRequire(raw.length == 2 &&
        raw['items'] is List &&
        raw['items'].length <= 100 &&
        (raw['next_cursor'] == null || isContractId('${raw['next_cursor']}')) &&
        (raw['next_cursor'] == null || raw['next_cursor'] != cursor));
    final items = (raw['items'] as List)
        .map((r) => TradeRecord.parse(r, p, kind: kind))
        .toList();
    tradeRequire(items.map((r) => r.id).toSet().length == items.length);
    return TradePage(items, raw['next_cursor']);
  }

  Future<List<TradeRecord>> all(String kind) async {
    final items = <TradeRecord>[], seen = <String>{};
    String? cursor;
    do {
      final r = await page(kind, cursor: cursor);
      items.addAll(r.items);
      cursor = r.nextCursor;
      if (cursor != null) tradeRequire(seen.add(cursor));
    } while (cursor != null);
    return {for (final r in items) r.id: r}.values.toList();
  }

  Future<TradeRecord> record(String id) async {
    if (!isContractId(id)) throw const AccountError(400, 'INVALID_ID');
    final p = owner(), epoch = session.epoch;
    final r = await session.read('/api/v1/trade/records/$id', actingParty: p);
    check(epoch, p);
    return TradeRecord.parse(r, p, id: id);
  }

  Map<String, dynamic>? pending(String path) =>
      session.pending('POST', path, actingParty: owner());
  Future<TradeRecord> write(String path, Map<String, dynamic> body,
      {int? version, String? kind}) async {
    final p = owner(), epoch = session.epoch;
    final r = await session.write('POST', path,
        actingParty: p,
        body: body,
        version: version,
        validate: (r) => TradeRecord.parse(r, p, kind: kind));
    check(epoch, p);
    return TradeRecord.parse(r, p, kind: kind);
  }

  Future<TradeRecord> retry(String path) async {
    final op = pending(path);
    if (op == null) throw const AccountError(409, 'NO_PENDING_OPERATION');
    final body = tradeMap(op['body']);
    // Read a known result or target first. Only the original idempotent POST
    // resolves this operation; a read never authorizes a fresh decision.
    if (op['resultId'] != null) {
      await record(op['resultId']);
    } else {
      final parts = path.split('/');
      if (parts.length == 7) {
        final target = await record(parts[5]);
        if (target.kind == 'QUOTE' && target.data['order_id'] != null) {
          await record(target.data['order_id']);
        }
      } else if (path.endsWith('/payments')) {
        await all('PAYMENT');
      } else if (path.endsWith('/refunds')) {
        await record(body['payment_id']);
        await all('REFUND');
      }
    }
    return write(path, body, version: op['version']);
  }

  Future<TradeRecord> accept(TradeRecord quote) {
    if (quote.kind != 'QUOTE' ||
        quote.status != 'APPROVED' ||
        !quote.isBuyer(owner())) {
      throw const AccountError(403, 'TRADE_BUYER_REQUIRED');
    }
    return write('/api/v1/trade/quotes/${quote.id}/acceptance',
        {'quote_sha256': quote.hash},
        version: quote.version, kind: 'ORDER');
  }

  Future<TradeRecord> cancel(TradeRecord order, String reason) =>
      write('/api/v1/trade/orders/${order.id}/cancellation', {'reason': reason},
          version: order.version, kind: 'ORDER');
  Future<TradeRecord> payment(TradeRecord order, String key) {
    final i = tradeRows(order.quote['installments'], max: 20)
        .where((i) => i['key'] == key);
    if (!order.isBuyer(owner()) ||
        !['OPEN', 'PARTIALLY_PAID'].contains(order.status) ||
        i.length != 1 ||
        i.single['trigger'] != 'ORDER_ACCEPTED') {
      throw const AccountError(422, 'INSTALLMENT_NOT_READY');
    }
    return write('/api/v1/trade/payments',
        {'order_id': order.id, 'installment_key': key},
        kind: 'PAYMENT');
  }

  Future<TradeRecord> reconcile(TradeRecord record, {String? transaction}) {
    if (record.kind == 'PAYMENT') {
      if (!record.isBuyer(owner())) {
        throw const AccountError(403, 'TRADE_BUYER_REQUIRED');
      }
      if (record.data['provider'] == 'APPLE' &&
          (transaction == null ||
              transaction.trim().isEmpty ||
              transaction.length > 128)) {
        throw const AccountError(400, 'INVALID_TRANSACTION_REFERENCE');
      }
      return write(
          '/api/v1/trade/payments/${record.id}/reconciliation',
          {
            'transaction_id':
                record.data['provider'] == 'ALIPAY' ? null : transaction
          },
          kind: 'PAYMENT');
    }
    if (record.kind != 'REFUND') throw const AccountError(400, 'INVALID_KIND');
    return write('/api/v1/trade/refunds/${record.id}/reconciliation', {},
        kind: 'REFUND');
  }

  Future<TradeRecord> refund(
      TradeRecord payment,
      List<Map<String, dynamic>> allocations,
      String reason,
      List<TradeRecord> existing) {
    final remaining = tradeRefundRemaining(payment, existing);
    if (!payment.refundable ||
        reason.trim().isEmpty ||
        reason.length > 2000 ||
        allocations.isEmpty ||
        allocations.length > 30 ||
        allocations.map((a) => a['line_id']).toSet().length !=
            allocations.length ||
        allocations.any((a) =>
            !tradeMinor(a['amount_minor']) ||
            (remaining[a['line_id']] ?? 0) < a['amount_minor'])) {
      throw const AccountError(400, 'INVALID_REFUND');
    }
    if (payment.data['provider'] == 'APPLE' &&
        (allocations.length != remaining.length ||
            allocations
                .any((a) => a['amount_minor'] != remaining[a['line_id']]) ||
            remaining.values.fold<int>(0, (a, b) => a + b) != payment.amount)) {
      throw const AccountError(400, 'APPLE_FULL_REFUND_REQUIRED');
    }
    return write(
        '/api/v1/trade/refunds',
        {
          'payment_id': payment.id,
          'allocations': allocations,
          'reason': reason.trim()
        },
        kind: 'REFUND');
  }
}
