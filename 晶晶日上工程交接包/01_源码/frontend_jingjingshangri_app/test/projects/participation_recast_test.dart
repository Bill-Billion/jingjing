import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/projects/participation_pages.dart';
import 'package:jingjingshangri_app/projects/project_models.dart';
import '../account/fake_account_api.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import 'project_fixtures.dart';

Map<String, dynamic> candidate() =>
    projectData('CANDIDATE', status: 'CONFIRMED');
Map<String, dynamic> sources(Map<String, dynamic> c) => {
      'candidate_id': c['id'],
      'candidate_version': c['object_version'],
      'candidate_sha256': c['content_sha256'],
      'project_id': c['project_id'],
      'role_id': roleKey,
      'items': [
        {
          'id': assetKey,
          'object_version': 2,
          'content_sha256': 'b' * 64,
          'owner_party_id': orgId
        }
      ],
      'next_cursor': null,
    };
Future<void> settle(WidgetTester t) async {
  await t
      .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
  await t.pumpAndSettle();
}

void main() {
  test('换角来源绑定本人候选及同角色版本，仅接收最小标识', () {
    final c = candidate();
    expect(participationRecastSources(sources(c), c)['items'], hasLength(1));
    for (final change in [
      'candidate_id',
      'candidate_version',
      'candidate_sha256',
      'project_id',
      'role_id',
      'next_cursor',
      'old_terms',
      'duplicate',
      'self_owner',
      'source_version',
      'source_hash',
      'source_terms'
    ]) {
      final d =
          Map<String, dynamic>.from(jsonDecode(jsonEncode(sources(c))) as Map);
      switch (change) {
        case 'candidate_id':
          d[change] = avatarKey;
        case 'candidate_version':
          d[change] = 999;
        case 'candidate_sha256':
          d[change] = 'c' * 64;
        case 'project_id':
          d[change] = avatarKey;
        case 'role_id':
          d[change] = avatarKey;
        case 'next_cursor':
          d[change] = 'invalid';
        case 'old_terms':
          d[change] = 'old private text';
        case 'duplicate':
          d['items'].add(Map<String, dynamic>.from(d['items'][0]));
        case 'self_owner':
          d['items'][0]['owner_party_id'] = c['owner_party_id'];
        case 'source_version':
          d['items'][0]['object_version'] = 0;
        case 'source_hash':
          d['items'][0]['content_sha256'] = 'invalid';
        case 'source_terms':
          d['items'][0]['terms'] = 'old private text';
      }
      expect(
          () => participationRecastSources(d, c), throwsA(isA<AccountError>()),
          reason: change);
    }
  });
  testWidgets('新演员换角表单只读本人候选和最小来源，刷新撤销来源后不保留旧选项', (t) async {
    final c = candidate(),
        p = projectData('PROJECT', owner: orgId, status: 'PREPARING');
    p['data']['current_plan_id'] = null;
    p['data']['current_edition_id'] = null;
    p['content_sha256'] = projectDigest(p['data']);
    var available = true;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/projects/records/$candidateKey')
        return envelope(c);
      if (r.path == '/api/v1/projects/records/$projectKey') return envelope(p);
      if (r.path == '/api/v1/projects/projects/$projectKey/records')
        return envelope({
          'items': r.queryParameters['kind'] == 'ROLE'
              ? [projectData('ROLE', owner: orgId)]
              : [c],
          'next_cursor': null
        });
      if (r.path ==
          '/api/v1/projects/candidates/$candidateKey/recast-sources') {
        final d = sources(c);
        if (!available) d['items'] = <Object>[];
        return envelope(d);
      }
      if (r.path == '/api/v1/artists/people')
        return envelope({'items': <Object>[], 'next_cursor': null});
      if (r.path.contains(assetKey))
        return envelope({
          'error': {'code': 'PROJECT_NOT_FOUND', 'message': 'private'}
        }, status: 404, error: true);
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: s,
        child: const MaterialApp(
            home: ProjectParticipationPage(
                view: 'recast', recordId: candidateKey))));
    await settle(t);
    expect(find.text('待替换的旧参演约定'), findsOneWidget);
    expect(find.textContaining('约定版本2'), findsOneWidget);
    expect(a.requests.any((r) => r.path.contains(assetKey)), isFalse);
    expect(a.requests.any((r) => r.path.endsWith('/progress')), isFalse);
    expect(s.projectsAccessDenied, isFalse);
    expect(find.text('old private text'), findsNothing);
    available = false;
    await t.scrollUntilVisible(find.text('重新核对当前版本'), 500,
        scrollable: find.byType(Scrollable).first);
    await t.tap(find.text('重新核对当前版本'));
    await settle(t);
    expect(a.requests.where((r) => r.path.endsWith('/recast-sources')),
        hasLength(2));
    await t.scrollUntilVisible(find.textContaining('当前没有可办理换角的旧约定'), -500,
        scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('约定版本2'), findsNothing);
    expect(find.textContaining('当前没有可办理换角的旧约定'), findsOneWidget);
    expect(
        a.requests
            .any((r) => r.method == 'POST' && r.path.contains('/amendments')),
        isFalse);
    await t.pumpWidget(const SizedBox.shrink());
    s.dispose();
  });
}
