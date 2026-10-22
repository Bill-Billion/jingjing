import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../stock/v5_support.dart';
import '../trade/trade_models.dart';
import 'auditions_models.dart';

class AuditionsApi extends V5Api {
  AuditionsApi(AccountSession s) : super(s, 'auditions');
  String? recoveryLabel(String path) {
    final s = path.startsWith(base) ? path.substring(base.length) : '';
    if (s == '/offers') return '试镜方案';
    if (s == '/bookings') return '预约';
    if (['/checkout', '/supplements/checkout'].contains(s)) return '原订单确认';
    if (RegExp(r'^/offers/[0-9a-fA-F-]{36}/visibility$').hasMatch(s)) {
      return '公开选择';
    }
    if (RegExp(
            r'^/bookings/[0-9a-fA-F-]{36}/(decision|travel|delivery|receipt|confirm|cancel|contact|support|reschedule|reschedule-response|baseplate|supplements|messages|messages/read)$')
        .hasMatch(s)) {
      return '本单办理';
    }
    return null;
  }

  Future<Map<String, dynamic>> restoreOperation(String path) async {
    if (recoveryLabel(path) == null) {
      throw const AccountError(400, 'INVALID_ACTION');
    }
    final s = path.substring(base.length),
        parts = path.substring(base.length).split('/');
    final r = await retry(s, (d) {
      if (['/checkout', '/supplements/checkout'].contains(s)) {
        order(d);
      } else if (s.endsWith('/messages/read')) {
        validateRead(d, parts[2]);
      } else {
        AuditionRecord(d,
            kind: s.endsWith('/messages')
                ? 'MESSAGE'
                : s.endsWith('/supplements')
                    ? 'SUPPLEMENT'
                    : s == '/offers' || s.startsWith('/offers/')
                        ? 'OFFER'
                        : 'BOOKING',
            id: parts.length == 4 &&
                    !s.endsWith('/messages') &&
                    !s.endsWith('/supplements')
                ? parts[2]
                : null,
            parentId: s.endsWith('/messages') || s.endsWith('/supplements')
                ? parts[2]
                : null);
      }
      return d;
    }, reread: () async {
      if (parts.length >= 4) {
        await record(parts[2]);
      } else {
        await records(s == '/offers' ? 'OFFER' : 'BOOKING');
      }
    });
    return r;
  }

  Future<V5Page<AuditionOffer>> catalog(
          {String? cursor, String? city, String? invitationId}) =>
      get(invitationId == null ? '/catalog' : '/invitation-offers',
          (d) => V5Page.parse(d, AuditionOffer.new, previous: cursor),
          account: invitationId == null,
          query: {
            'limit': 20,
            if (cursor != null) 'cursor': cursor,
            if (invitationId == null && city?.isNotEmpty == true) 'city': city,
            if (invitationId != null) 'invitation_id': key(invitationId)
          });
  Future<AuditionOffer> offer(String id, {String? invitationId}) async {
    key(id);
    String? cursor;
    final seen = <String>{};
    do {
      final r = await catalog(cursor: cursor, invitationId: invitationId);
      for (final o in r.items) {
        if (o.id == id) return o;
      }
      cursor = r.cursor;
      if (cursor != null) v5Require(seen.add(cursor));
    } while (cursor != null);
    throw const AccountError(409, 'AUDITION_OFFER_NOT_OPEN');
  }

  Future<V5Page<AuditionRecord>> records(String kind, {String? cursor}) => get(
      '/records',
      (d) => V5Page.parse(d, (r) => AuditionRecord(r, kind: kind),
          previous: cursor),
      query: {'kind': kind, 'limit': 20, if (cursor != null) 'cursor': cursor});
  Future<AuditionRecord> record(String id) =>
      get('/records/${key(id)}', (d) => AuditionRecord(d, id: id));
  Future<List<AuditionRecord>> supplements(String id) =>
      get('/bookings/${key(id)}/supplements', (d) {
        v5Require(d['booking_id'] == id);
        return v5Rows(d['items'])
            .map((r) => AuditionRecord(r, kind: 'SUPPLEMENT', parentId: id))
            .toList();
      });
  Future<V5Page<AuditionRecord>> messages(String id, {String? cursor}) =>
      get('/bookings/${key(id)}/messages', (d) {
        v5Require(
            ['OPEN', 'FROZEN', 'ARCHIVED'].contains(d['conversation_status']));
        final page = V5Page.parse(d, (r) {
          final record = AuditionRecord(r, kind: 'MESSAGE', parentId: id);
          v5Require(record.raw['is_read'] is bool);
          return record;
        }, previous: cursor);
        return page;
      }, query: {'limit': 20, if (cursor != null) 'cursor': cursor});
  Future<Uint8List> material(AuditionRecord booking, String id) async {
    if (booking.kind != 'BOOKING' ||
        !booking.mediaIds.contains(id) ||
        booking.data['delivery_review']?['decision'] != 'APPROVE' ||
        ['REFUND_REQUIRED', 'REFUNDED', 'CANCELLED'].contains(booking.status)) {
      throw const AccountError(409, 'AUDITION_SAMPLES_NOT_AVAILABLE');
    }
    final b = await bytes('/bookings/${booking.id}/materials/${key(id)}',
        max: 8 * 1024 * 1024);
    if (sha256.convert(b).toString() !=
        booking.data['delivery']['hashes'][id]) {
      throw const AccountError(503, 'PRIVATE_CONTENT_MISMATCH');
    }
    return b;
  }

  Future<Map<String, dynamic>> contacts(String id) =>
      get('/bookings/${key(id)}/contacts', (d) {
        v5Require(d['booking_id'] == id);
        final contacts = v5Map(d['contacts']);
        v5Require(contacts.keys.every((k) => ['BUYER', 'SELLER'].contains(k)));
        for (final raw in contacts.values) {
          final c = v5Map(raw);
          v5Require(c['name'] is String &&
              c['phone'] is String &&
              RegExp(r'^1[3-9]\d{9}$').hasMatch(c['phone']));
        }
        return d;
      });
  Future<Map<String, dynamic>> itinerary(String id) =>
      get('/bookings/${key(id)}/itinerary', (d) {
        v5Require(d['booking_id'] == id &&
            d['share']?['mode'] == 'USER_EXPLICIT_SHARE_ONLY' &&
            d['share']?['text'] is String &&
            d['safety']?['continuous_tracking'] == false &&
            d['safety']?['emergency_service_enabled'] == false);
        auditionAppointment(d['appointment']);
        return d;
      });
  void validateBooking(Map<String, dynamic> d, String id) =>
      AuditionRecord(d, id: id, kind: 'BOOKING');
  TradeRecord order(Map<String, dynamic> d) =>
      TradeRecord.parse(d, owner(), kind: 'ORDER');
  void validateRead(Map<String, dynamic> d, String id) {
    v5Require(d['booking_id'] == id);
    v5Ids(d['read_message_ids']);
  }
}
