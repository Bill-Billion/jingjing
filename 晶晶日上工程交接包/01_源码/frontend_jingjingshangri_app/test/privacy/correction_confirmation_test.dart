import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/privacy/privacy_pages.dart';
import '../account/fake_account_api.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import '../stock/v5_test_host.dart';

const requestId = 'c1000000-0000-4000-8000-000000000001';
const executionId = 'c1000000-0000-4000-8000-000000000002';
void main() {
  for (final readable in [true, false]) {
    testWidgets('本人更正确认必须先看到具体新名称：$readable', (t) async {
      final a = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/privacy/requests/$requestId') {
          return envelope({
            'id': requestId,
            'account_id': accountId,
            'object_version': 2,
            'current_status': 'OPEN',
            'request': {
              'type': 'CORRECT',
              'scopes': ['PROFILE'],
              'details': '请更正本人展示名'
            },
            'events': []
          });
        }
        if (r.path.endsWith('/history')) return envelope({'responses': []});
        if (r.path.endsWith('/executions')) {
          return envelope({
            'items': [
              {
                'id': executionId,
                'request_id': requestId,
                'action': 'PROFILE_CORRECTION',
                'target_id': accountId,
                'object_version': 2,
                'current_status': 'APPROVED',
                'proposal_sha256': 'a' * 64,
                'job_status': null,
                'result': null,
                if (readable) 'proposed_change': {'display_name': '本人确认的新名称'}
              }
            ],
            'next_cursor': null
          });
        }
        if (r.path.endsWith('/execute')) {
          return envelope({'code': 'SERVICE_UNAVAILABLE'},
              status: 503, error: true);
        }
        return FakeAccountAdapter().defaultReply(r);
      });
      final s = (await t.runAsync(() => communitySession(a)))!;
      await host(t, s, const PrivacyPage(view: 'request', recordId: requestId));
      if (readable) {
        await reveal(t, find.text('本人确认更正展示名'));
        expect(find.text('本人确认的新名称'), findsOneWidget);
        await t.tap(find.text('本人确认更正展示名'));
        await frames(t);
        expect(find.textContaining('本次将账号展示名改为：本人确认的新名称'), findsOneWidget);
        expect(a.requests.where((r) => r.path.endsWith('/execute')), isEmpty);
        await t.tap(find.text('本人明确确认'));
        await frames(t);
        final sent = a.requests.singleWhere((r) => r.path.endsWith('/execute'));
        expect(sent.data, {'confirmed': true});
        expect(sent.headers['If-Match'], '"2"');
        expect(sent.headers.containsKey('X-Acting-Party'), false);
      } else {
        expect(find.text('本人确认更正展示名'), findsNothing);
        expect(a.requests.where((r) => r.path.endsWith('/execute')), isEmpty);
      }
      expect(t.takeException(), isNull);
    });
  }
}
