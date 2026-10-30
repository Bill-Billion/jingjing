import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:jingjingshangri_app/account/account_api.dart';

const accountId = '11111111-1111-4111-8111-111111111111';
const personId = '22222222-2222-4222-8222-222222222222';
const orgId = '33333333-3333-4333-8333-333333333333';
const invitedOrgId = '44444444-4444-4444-8444-444444444444';
const invitationId = '55555555-5555-4555-8555-555555555555';

ResponseBody envelope(Map<String, dynamic> data,
        {int status = 200, bool error = false}) =>
    ResponseBody.fromString(
        jsonEncode({error ? 'error' : 'data': data}), status,
        headers: {
          Headers.contentTypeHeader: ['application/json']
        });

Map<String, dynamic> identity(String id,
        {bool owner = true, String name = '测试机构'}) =>
    {
      'party': {
        'id': id,
        'kind': id == personId ? 'PERSON' : 'ORGANIZATION',
        'display_name': id == personId ? '我的个人身份' : name,
        'current_status': id == personId ? 'ACTIVE' : 'PENDING_REVIEW',
        'object_version': 7,
        'capabilities': <Map<String, dynamic>>[],
        'allowed_actions': [
          'READ_PARTY',
          if (owner) 'REQUEST_CAPABILITY',
          if (owner && id != personId) 'MANAGE_MEMBERS'
        ],
      },
      'membership': {
        'id': 'member-$id',
        'account_id': accountId,
        'party_id': id,
        'roles': [owner ? 'OWNER' : 'MEMBER'],
        'object_version': 3,
        'current_status': 'ACTIVE'
      },
    };

class FakeAccountAdapter implements HttpClientAdapter {
  FakeAccountAdapter({this.handler});
  final FutureOr<ResponseBody> Function(RequestOptions)? handler;
  final requests = <RequestOptions>[];
  AccountApi createApi() {
    final dio = Dio(BaseOptions(
        baseUrl: 'http://localhost:3000', validateStatus: (_) => true));
    dio.httpClientAdapter = this;
    return AccountApi(dio: dio);
  }

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    return handler == null ? defaultReply(options) : handler!(options);
  }

  ResponseBody defaultReply(RequestOptions options) {
    if (options.path == '/api/v1/discovery/cities') {
      return envelope({
        'revision': 'quick-cities-v1',
        'scope': 'QUICK_CHOICES',
        'allows_custom_city': true,
        'items': [
          for (final city in [
            ('beijing', '北京'),
            ('shanghai', '上海'),
            ('hangzhou', '杭州'),
            ('guangzhou', '广州'),
            ('shenzhen', '深圳'),
            ('zhengzhou', '郑州')
          ])
            {
              'code': city.$1,
              'name': city.$2,
              'aliases': ['${city.$2}市']
            }
        ]
      });
    }
    if (options.path == '/api/v1/discovery/search') {
      return envelope({
        'kind': options.queryParameters['kind'],
        'city': options.queryParameters['city'],
        'q': options.queryParameters['q'],
        'items': [],
        'next_cursor': null
      });
    }
    if (options.path == '/api/v1/directory/featured-artists') {
      return envelope({'items': [], 'next_cursor': null});
    }
    if (options.path == '/api/v1/me/collections/preferences') {
      return envelope({
        'history_enabled': false,
        'object_version': 1,
        'history_days': 30,
        'history_max_entries': 200
      });
    }
    if (options.path.startsWith('/api/v1/me/collections/targets/')) {
      return envelope({'saved': false, 'visited': false});
    }
    if ([
          '/api/v1/me/collections/favorites',
          '/api/v1/me/collections/history',
          '/api/v1/support/tickets',
          '/api/v1/operations/notifications/feed'
        ].contains(options.path) &&
        options.method == 'GET') {
      return envelope({'items': [], 'next_cursor': null});
    }
    if (options.path == '/api/v1/operations/notifications/unread') {
      return envelope({
        'total': 0,
        'channels': {
          'ORDER_CONVERSATIONS': 0,
          'SUBMISSION_INTENTS': 0,
          'ACTIVITY_VOTING': 0,
          'SYSTEM': 0
        },
        'snapshot_id': invitationId,
        'as_of': '2026-10-30T00:00:00Z',
        'expires_at': '2026-10-30T01:00:00Z',
        'coverage': 'CURRENT_AUTHORIZED_NOTIFICATIONS'
      });
    }

    if (options.path.endsWith('sms-challenges')) {
      return envelope({
        'challenge_id': invitationId,
        'current_status': 'SENT',
        'resend_after': DateTime.now()
            .add(const Duration(seconds: 45))
            .toUtc()
            .toIso8601String(),
        'expires_at': DateTime.now()
            .add(const Duration(minutes: 5))
            .toUtc()
            .toIso8601String()
      });
    }
    if (options.path.endsWith('/auth/sessions')) {
      return envelope({
        'access_token': 'x' * 43,
        'token_type': 'Bearer',
        'account': {
          'id': accountId,
          'display_name': '测试账号',
          'allowed_actions': ['CREATE_ORGANIZATION']
        }
      });
    }
    if (options.path.endsWith('/auth/sessions/current')) {
      return envelope({'current_status': 'REVOKED'});
    }
    if (options.path == '/api/v1/me/parties') {
      return envelope({
        'items': [identity(orgId), identity(personId)],
        'next_cursor': null
      });
    }
    if (options.path == '/api/v1/me/invitations') {
      return envelope({
        'items': [
          {
            'invitation_id': invitationId,
            'party_id': invitedOrgId,
            'inviter_account_id': accountId,
            'current_status': 'INVITED',
            'object_version': 2,
            'expires_at': '2030-01-01T00:00:00.000Z'
          }
        ],
        'next_cursor': null
      });
    }
    if (options.path.endsWith('/members')) {
      return envelope({
        'items': [
          {
            'account_id': accountId,
            'role_code': 'OWNER',
            'current_status': 'ACTIVE',
            'object_version': 3
          },
          {
            'account_id': '66666666-6666-4666-8666-666666666666',
            'role_code': 'MEMBER',
            'current_status': 'ACTIVE',
            'object_version': 4
          },
        ],
        'next_cursor': null
      });
    }
    if (options.path == '/api/v1/parties/$orgId') {
      return envelope(identity(orgId)['party'] as Map<String, dynamic>);
    }
    if (options.path == '/api/v1/parties/$personId') {
      return envelope(identity(personId)['party'] as Map<String, dynamic>);
    }
    if (options.path.endsWith('/capabilities')) {
      return envelope({
        'code': options.data['code'],
        'current_status': 'PENDING_REVIEW',
        'allowed_actions': []
      });
    }
    if (options.path.contains('/gigs/relations/') &&
        options.path.endsWith('/parties')) {
      return envelope({'code': 'NOT_FOUND'}, status: 404, error: true);
    }
    return envelope({});
  }

  @override
  void close({bool force = false}) {}
}
