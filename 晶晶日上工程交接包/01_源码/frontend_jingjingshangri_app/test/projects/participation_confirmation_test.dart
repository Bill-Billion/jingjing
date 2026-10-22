import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/projects/participation_pages.dart';
import 'package:jingjingshangri_app/projects/project_models.dart';
import '../account/fake_account_api.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import 'project_fixtures.dart';

Future<void> frames(WidgetTester tester) async {
  await tester
      .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
  await tester.pumpAndSettle();
}

void main() {
  for (final kind in ['PARTICIPATION', 'INCOME_AGREEMENT']) {
    testWidgets('$kind合法签署方不强读无权项目或全角色，可按原约独立会签', (tester) async {
      final agreement = projectData(kind,
          status: 'APPROVED',
          owner: kind == 'PARTICIPATION' ? personId : orgId);
      agreement['data']['confirmers'].add({
        'party_id': orgId,
        'responsibility': '出品方核对原约定',
        'after_party_ids': <String>[],
      });
      agreement['content_sha256'] = projectDigest(agreement['data']);
      final id = agreement['id'] as String;
      final stem =
          kind == 'PARTICIPATION' ? 'participations' : 'income-agreements';
      var saved = false;
      late FakeAccountAdapter a;
      a = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/projects/records/$id') {
          return envelope(agreement);
        }
        if (r.path == '/api/v1/projects/records/$id/confirmations') {
          return envelope({
            'items': saved
                ? [
                    {
                      'party_id': personId,
                      'account_id': accountId,
                      'content_sha256': agreement['content_sha256'],
                      'decision': 'APPROVED',
                      'reason': '本人确认原约定',
                    }
                  ]
                : <Object>[]
          });
        }
        if (r.path == '/api/v1/projects/participations/$id/progress') {
          return envelope(
              {'agreement_id': id, 'order_id': null, 'milestones': <Object>[]});
        }
        if (r.path == '/api/v1/projects/$stem/$id/confirmation') {
          saved = true;
          return envelope(agreement);
        }
        if (r.path == '/api/v1/projects/projects') {
          return envelope({'items': <Object>[], 'next_cursor': null});
        }
        if (r.path.startsWith('/api/v1/projects/')) {
          return envelope({'code': 'PROJECT_NOT_FOUND'},
              status: 404, error: true);
        }
        return a.defaultReply(r);
      });
      final s = (await tester.runAsync(() => communitySession(a)))!;
      await tester.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
          value: s,
          child: MaterialApp(
              home: kind == 'PARTICIPATION'
                  ? ProjectParticipationPage(view: 'agreement', recordId: id)
                  : ProjectIncomePage(view: 'agreement', recordId: id))));
      await frames(tester);
      expect(s.projectsAccessDenied, isFalse);
      await tester.scrollUntilVisible(find.byType(TextField), 300,
          scrollable: find.byType(Scrollable).first);
      await tester.enterText(find.byType(TextField).first, '本人确认原约定');
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.scrollUntilVisible(find.byType(CheckboxListTile), 200,
          scrollable: find.byType(Scrollable).first);
      await tester.tap(find.byType(CheckboxListTile).first);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('本人同意本次约定'));
      await tester.tap(find.text('本人同意本次约定'));
      await frames(tester);
      expect(saved, isTrue);
      expect(s.projectsPending, isEmpty);
      expect(s.projectsAccessDenied, isFalse);
      expect(
          a.requests
              .any((r) => r.path == '/api/v1/projects/records/$projectKey'),
          isFalse);
      expect(
          a.requests
              .any((r) => r.path.contains('/projects/$projectKey/records')),
          isFalse);
      await tester.scrollUntilVisible(find.text('读取本人项目后续事项'), 300,
          scrollable: find.byType(Scrollable).first);
      await tester.tap(find.text('读取本人项目后续事项'));
      await frames(tester);
      expect(s.projectsAccessDenied, isFalse);
      expect(
          a.requests.any((r) => r.path == '/api/v1/projects/projects'), isTrue);
      expect(
          a.requests
              .any((r) => r.path == '/api/v1/projects/records/$projectKey'),
          isFalse);
      await tester.pumpWidget(const SizedBox.shrink());
      s.dispose();
    });
  }
  testWidgets('无项目上下文的出品方先明确读取本人项目目录，验证owner后才读项目办理后续', (tester) async {
    final agreement = projectData('PARTICIPATION', owner: orgId);
    final id = agreement['id'] as String;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/projects/records/$id') return envelope(agreement);
      if (r.path == '/api/v1/projects/records/$id/confirmations') {
        return envelope({'items': <Object>[]});
      }
      if (r.path == '/api/v1/projects/participations/$id/progress') {
        return envelope(
            {'agreement_id': id, 'order_id': null, 'milestones': <Object>[]});
      }
      if (r.path == '/api/v1/projects/projects') {
        return envelope({
          'items': [projectData('PROJECT')],
          'next_cursor': null
        });
      }
      if (r.path == '/api/v1/projects/records/$projectKey') {
        return envelope(projectData('PROJECT'));
      }
      return a.defaultReply(r);
    });
    final s = (await tester.runAsync(() => communitySession(a)))!;
    await tester.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: s,
        child: MaterialApp(
            home: ProjectParticipationPage(view: 'agreement', recordId: id))));
    await frames(tester);
    expect(
        a.requests.any((r) => r.path == '/api/v1/projects/records/$projectKey'),
        isFalse);
    await tester.scrollUntilVisible(find.text('读取本人项目后续事项'), 300,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('读取本人项目后续事项'));
    await frames(tester);
    final paths = a.requests.map((r) => r.path).toList();
    expect(paths.indexOf('/api/v1/projects/projects'),
        lessThan(paths.indexOf('/api/v1/projects/records/$projectKey')));
    expect(s.projectsAccessDenied, isFalse);
    expect(
        a.requests.any((r) => r.path.contains('/projects/$projectKey/records')),
        isFalse);
    await tester.pumpWidget(const SizedBox.shrink());
    s.dispose();
  });
  testWidgets('会签POST原记录不等于成功，须独立GET核对本人hash和决定；未证实保留原key可恢复', (tester) async {
    final agreement = projectData('INCOME_AGREEMENT', status: 'APPROVED'),
        id = projectData('INCOME_AGREEMENT')['id'] as String;
    var saved = false, proofVisible = false;
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/projects/records/$id') return envelope(agreement);
      if (r.path == '/api/v1/projects/records/$projectKey') {
        return envelope(projectData('PROJECT'));
      }
      if (r.path == '/api/v1/projects/projects/$projectKey/records') {
        return envelope({'items': <Object>[], 'next_cursor': null});
      }
      if (r.path == '/api/v1/projects/records/$id/confirmations') {
        return envelope({
          'items': saved && proofVisible
              ? [
                  {
                    'party_id': personId,
                    'account_id': accountId,
                    'content_sha256': agreement['content_sha256'],
                    'decision': 'APPROVED',
                    'reason': '我确认这份原约定'
                  }
                ]
              : <Object>[]
        });
      }
      if (r.path == '/api/v1/projects/income-agreements/$id/confirmation') {
        saved = true;
        return envelope(agreement);
      }
      return a.defaultReply(r);
    });
    final s = (await tester.runAsync(() => communitySession(a)))!;
    await tester.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: s,
        child: MaterialApp(
            home: ProjectIncomePage(view: 'agreement', recordId: id))));
    await frames(tester);
    await tester.ensureVisible(find.byType(TextField));
    await tester.enterText(find.byType(TextField), '我确认这份原约定');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    await tester.ensureVisible(find.text('本人同意本次约定'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('本人同意本次约定'));
    await frames(tester);
    expect(s.projectsPending, hasLength(1));
    final original = a.requests.lastWhere(
        (r) => r.method == 'POST' && r.path.contains('confirmation'));
    expect(original.data, {
      'content_sha256': projectDigest(agreement['data']),
      'decision': 'APPROVED',
      'reason': '我确认这份原约定'
    });
    proofVisible = true;
    await tester.scrollUntilVisible(find.text('先核对当前记录'), -300,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('先核对当前记录'));
    await frames(tester);
    await tester.ensureVisible(find.text('使用原编号继续核对'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('使用原编号继续核对'));
    await frames(tester);
    expect(s.projectsPending, isEmpty);
    final retried = a.requests.lastWhere(
        (r) => r.method == 'POST' && r.path.contains('confirmation'));
    expect(retried.headers['Idempotency-Key'],
        original.headers['Idempotency-Key']);
    expect(retried.headers['If-Match'], original.headers['If-Match']);
    expect(retried.data, original.data);
    await tester.scrollUntilVisible(find.text('我的原会签说明'), 300,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('我的原会签说明'), findsOneWidget);
  });
}
