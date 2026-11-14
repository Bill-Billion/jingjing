import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/privacy/privacy_pages.dart';
import '../account/fake_account_api.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import '../stock/v5_test_host.dart';

const req = 'c2000000-0000-4000-8000-000000000001',
    file = 'c2000000-0000-4000-8000-000000000002',
    execution = 'c2000000-0000-4000-8000-000000000003';
Map<String, dynamic> target() => {
      'id': file,
      'label': '本人原始素材 · 测试照片',
      'media_type': 'image/jpeg',
      'byte_size': 123,
      'created_at': '2026-10-28T00:00:00.000Z',
      'current_status': 'READY',
      'content_sha256': 'a' * 64,
      'purpose': 'AVATAR_MATERIAL',
      'disposition': 'READY_FOR_REVIEW',
      'dependencies': [],
      'explanation': '仅处理这份当前原始文件，备份和模型分别核对'
    };
void main() {
  for (final readable in [true, false]) {
    testWidgets('删除确认必须先看到具体文件，旧返回不盲删：$readable', (t) async {
      final a = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/privacy/requests/$req') {
          return envelope({
            'id': req,
            'account_id': accountId,
            'object_version': 2,
            'current_status': 'FOLLOW_UP',
            'request': {
              'type': 'DELETE',
              'scopes': ['ARTIST_MATERIALS'],
              'details': '删除本人照片'
            },
            'events': []
          });
        }
        if (r.path.endsWith('/history')) return envelope({'responses': []});
        if (r.path.endsWith('/file-options')) {
          return envelope({
            'items': r.queryParameters['kind'] == 'FILE' ? [target()] : [],
            'next_cursor': null
          });
        }
        if (r.path.endsWith('/executions')) {
          return envelope({
            'items': [
              {
                'id': execution,
                'request_id': req,
                'action': 'FILE_ERASURE',
                'target_id': file,
                'object_version': 2,
                'current_status': 'APPROVED',
                'proposal_sha256': 'b' * 64,
                if (readable) 'target_summary': target()
              }
            ],
            'next_cursor': null
          });
        }
        if (['/model-assets', '/model-creations', '/actions']
            .any(r.path.endsWith)) {
          return envelope({'items': [], 'next_cursor': null});
        }
        if (r.path.endsWith('/execute')) {
          return envelope({'code': 'SERVICE_UNAVAILABLE'},
              status: 503, error: true);
        }
        return FakeAccountAdapter().defaultReply(r);
      });
      final s = (await t.runAsync(() => communitySession(a)))!;
      await host(t, s, const PrivacyPage(view: 'request', recordId: req));
      if (readable) {
        await reveal(t, find.text('本人确认删除这份原始素材'));
        await t.tap(find.text('本人确认删除这份原始素材'));
        await frames(t);
        expect(find.textContaining('123 字节'), findsWidgets);
        expect(a.requests.where((r) => r.path.endsWith('/execute')), isEmpty);
        await t.tap(find.text('本人明确确认'));
        await frames(t);
        final sent = a.requests.singleWhere((r) => r.path.endsWith('/execute'));
        expect(sent.data, {'confirmed': true});
        expect(sent.headers['If-Match'], '"2"');
        expect(sent.headers.containsKey('X-Acting-Party'), false);
      } else {
        expect(find.text('本人确认删除这份原始素材'), findsNothing);
        expect(a.requests.where((r) => r.path.endsWith('/execute')), isEmpty);
      }
      expect(a.requests.where((r) => r.path.endsWith('/data')), isEmpty);
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('被引用素材说明复核原因，不提供直接删除选择', (t) async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/privacy/requests/$req') {
        return envelope({
          'id': req,
          'account_id': accountId,
          'object_version': 1,
          'current_status': 'OPEN',
          'request': {
            'type': 'DELETE',
            'scopes': ['ARTIST_MATERIALS'],
            'details': '删除本人照片'
          },
          'events': []
        });
      }
      if (r.path.endsWith('/history')) return envelope({'responses': []});
      if (r.path.endsWith('/file-options')) {
        return envelope({
          'items': r.queryParameters['kind'] == 'FILE'
              ? [
                  target()
                    ..['disposition'] = 'DEPENDENCY_REVIEW'
                    ..['dependencies'] = [
                      {'code': 'ARTIST_ARCHIVE', 'message': '已用于艺人档案，先核对相关约定'}
                    ]
                ]
              : [],
          'next_cursor': null
        });
      }
      if (['/executions', '/model-assets', '/model-creations', '/actions']
          .any(r.path.endsWith)) {
        return envelope({'items': [], 'next_cursor': null});
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const PrivacyPage(view: 'request', recordId: req));
    await reveal(t, find.text('已用于艺人档案，先核对相关约定'));
    expect(find.text('选择这份素材申请删除'), findsNothing);
    expect(
        a.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('/api/v1/privacy/')),
        isEmpty);
  });
}
