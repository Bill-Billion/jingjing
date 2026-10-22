import 'package:crypto/crypto.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_fixtures.dart' show orderId;

const auditionId = 'c1000000-0000-4000-8000-000000000001';
const auditionOfferId = 'c1000000-0000-4000-8000-000000000002';
const auditionPersonId = 'c1000000-0000-4000-8000-000000000003';
const auditionAvatarId = 'c1000000-0000-4000-8000-000000000004';
const auditionConsentId = 'c1000000-0000-4000-8000-000000000005';
const auditionRuleId = 'c1000000-0000-4000-8000-000000000006';
const auditionDate = '2026-10-22T02:00:00.000Z';
const auditionEnd = '2026-10-22T03:00:00.000Z';
final auditionPhotos = List.generate(6,
    (i) => 'c1000000-0000-4000-8000-${(101 + i).toString().padLeft(12, '0')}');
const auditionVideoId = 'c1000000-0000-4000-8000-000000000107';

Map<String, dynamic> auditionOffer() => {
      'person_id': auditionPersonId,
      'avatar_id': auditionAvatarId,
      'public_consent_id': auditionConsentId,
      'rule_id': auditionRuleId,
      'title': '试镜专用合成方案',
      'city': '合成城市',
      'service_area': '合成场地范围',
      'mode': 'ONLINE_MATERIALS',
      'public_booking': true,
      'public_price': true,
      'unit_minor': 2901,
      'slots': [
        {'starts_at': auditionDate, 'ends_at': auditionEnd}
      ],
      'terms': '仅用于原预约的试镜取样，不授予出演权'
    };
Map<String, dynamic> auditionPublic({bool publicPrice = true}) => {
      ...auditionOffer(),
      'id': auditionOfferId,
      'public_price': publicPrice,
      'unit_minor': publicPrice ? 2901 : null,
      'currency': 'CNY',
      'transport_included': true,
      'offer_sha256': 'a' * 64
    };
Map<String, dynamic> auditionRules() => {
      'version': 'test-v1',
      'terms': '6照1视频，明确收讫后48小时，交通包含在一口价',
      'photo_count': 6,
      'video_count': 1,
      'accept_hours': 24,
      'acceptance_hours': 48,
      'payment_window_minutes': 30
    };
Map<String, dynamic> auditionBooking(
        {int version = 4,
        String status = 'DELIVERED',
        List<int> bytes = const [0, 1, 2, 3]}) =>
    {
      'id': auditionId,
      'kind': 'BOOKING',
      'owner_party_id': personId,
      'counterparty_id': orgId,
      'parent_id': auditionOfferId,
      'created_by': accountId,
      'current_status': status,
      'object_version': version,
      'content_sha256': 'b' * 64,
      'performance_rights_granted': false,
      'refund_is_verified': false,
      'conversation_status':
          ['FULFILLED', 'REFUNDED', 'CANCELLED'].contains(status)
              ? 'ARCHIVED'
              : status == 'AWAITING_ACCEPTANCE'
                  ? 'AWAITING_ACCEPTANCE'
                  : 'OPEN',
      'data': {
        'status': status,
        'offer': auditionOffer(),
        'rules': auditionRules(),
        'offer_sha256': 'a' * 64,
        'order_id': orderId,
        'paid_at': auditionDate,
        'accepted_at': status == 'AWAITING_ACCEPTANCE' ? null : auditionDate,
        'accept_by': auditionEnd,
        'departed_at': null,
        'arrived_at': null,
        'fulfilled_at': status == 'FULFILLED' ? auditionDate : null,
        'deadline_at': null,
        'receipt_at': null,
        'viewed_at': null,
        'refund_minor': 0,
        'appointment': {
          'mode': 'ONLINE_MATERIALS',
          'city': '合成城市',
          'venue': '合成正规试镜棚',
          'address': '合成地址',
          'purpose': '影片选角试镜取样',
          'starts_at': auditionDate,
          'ends_at': auditionEnd
        },
        'delivery': ['DELIVERED', 'FULFILLED'].contains(status)
            ? {
                'photos': [...auditionPhotos],
                'videos': [auditionVideoId],
                'consent_id': auditionConsentId,
                'hashes': {
                  for (final id in [...auditionPhotos, auditionVideoId])
                    id: sha256.convert(bytes).toString()
                }
              }
            : null,
        'delivery_review': ['DELIVERED', 'FULFILLED'].contains(status)
            ? {'decision': 'APPROVE', 'reason': '仅合成权限样例'}
            : null,
        'cases': [],
        'dispute': null,
        'reschedule': null,
        'contacts': {},
        'baseplate_id': null
      }
    };
