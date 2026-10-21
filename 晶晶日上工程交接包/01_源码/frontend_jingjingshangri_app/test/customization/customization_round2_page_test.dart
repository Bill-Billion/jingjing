import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/customization/customization_api.dart';
import 'package:jingjingshangri_app/customization/customization_followup.dart';

import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import '../trade/trade_fixtures.dart';
import 'customization_fixtures.dart';
import 'customization_page_test.dart' show host, tapKey;
import 'customization_round2_api_test.dart' show storyTrade;

void main() {
  testWidgets('正式重提成功后补件读取失败，仍显示已提交记录且不能再编辑旧草稿', (tester) async {
    var submitted = false;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '$storyCollection/$requestId') {
        return envelope(story(status: 'INTAKE', version: 3));
      }
      if (r.path.endsWith('/supplement')) {
        return submitted
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope(supplementContext());
      }
      if (r.path.endsWith('/supplement-submissions')) {
        submitted = true;
        return envelope(
            story(status: 'SUBMITTED', version: 5, formalId: nextSubmissionId));
      }
      return adapter.defaultReply(r);
    });
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
        id: requestId);
    await tapKey(tester, 'story-submit');
    await tester.tap(find.text('确认'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('story-submit')), findsNothing);
    expect(find.byKey(const ValueKey('story-field-story')), findsNothing);
    await tester.drag(find.byType(ListView).first, const Offset(0, 1800));
    await tester.pumpAndSettle();
    expect(find.text('平台待查看'), findsOneWidget);
    expect(
        adapter.requests
            .where((r) => r.path.endsWith('/supplement-submissions'))
            .length,
        1);
    expect(tester.takeException(), null);
  });
  testWidgets('受理中开放补充可编辑原故事与逐项回复，保存完整内容但不正式重提', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '$storyCollection/$requestId') {
        return envelope(story(status: 'INTAKE', version: 3));
      }
      if (r.path.endsWith('/supplement')) {
        return envelope(r.method == 'GET'
            ? supplementContext(responses: const {'story': ''})
            : supplementContext(
                version: 5,
                answers: Map<String, String>.from(r.data['answers']),
                responses: Map<String, String>.from(r.data['responses'])));
      }
      return adapter.defaultReply(r);
    });
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
        id: requestId);
    final answer = find.byKey(const ValueKey('story-field-story'));
    final response = find.byKey(const ValueKey('story-response-story'));
    await tester.ensureVisible(response);
    await tester.enterText(response, '补充人物关系');
    await tester.ensureVisible(answer);
    await tester.enterText(answer, '完善后的故事');
    await tapKey(tester, 'story-save');
    expect(adapter.requests.last.headers['If-Match'], '"4"');
    expect(adapter.requests.last.data, {
      'answers': {'story': '完善后的故事', 'style': ''},
      'responses': {'story': '补充人物关系'}
    });
    expect(
        adapter.requests.any((r) => r.path.endsWith('/supplement-submissions')),
        false);
    await tester.drag(find.byType(ListView).first, const Offset(0, 1800));
    await tester.pumpAndSettle();
    expect(find.text('补充草稿已保存，尚未送交平台。'), findsOneWidget);
    expect(tester.takeException(), null);
  });
  testWidgets('两次读取跨过新一轮补件时保留本地输入，重新核对后不能把旧回复套到新要求', (tester) async {
    var detailReads = 0, supplementReads = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '$storyCollection/$requestId') {
        detailReads++;
        return envelope(story(
            status: 'INTAKE',
            version: detailReads < 3 ? 3 : 7,
            formalId: detailReads < 3 ? submissionId : nextSubmissionId));
      }
      if (r.path.endsWith('/supplement')) {
        supplementReads++;
        if (supplementReads == 1) return envelope(supplementContext());
        final next = supplementContext(
            version: 9,
            answers: const {'story': '新一轮的服务器草稿', 'style': ''},
            responses: const {'story': '新一轮的服务器回复'});
        next['supplement']['id'] = secondRequestId;
        next['supplement']['base_submission_id'] = nextSubmissionId;
        return envelope(next);
      }
      return adapter.defaultReply(r);
    });
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
        id: requestId);
    final answer = find.byKey(const ValueKey('story-field-story'));
    final reply = find.byKey(const ValueKey('story-response-story'));
    await tester.ensureVisible(reply);
    await tester.enterText(reply, '本地旧要求的回复');
    await tester.ensureVisible(answer);
    await tester.enterText(answer, '本地未保存的故事');
    await tapKey(tester, 'story-progress-refresh');
    expect(
        tester
            .widget<OutlinedButton>(find.byKey(const ValueKey('story-save')))
            .onPressed,
        null);
    expect(find.byKey(const ValueKey('story-adopt-current')), findsNothing);
    await tester.drag(find.byType(ListView).first, const Offset(0, 3000));
    await tester.pumpAndSettle();
    expect(find.textContaining('读取期间故事的正式版本已有变化'), findsOneWidget);
    await tester.scrollUntilVisible(reply, 180,
        scrollable: find.byType(Scrollable).first);
    expect(tester.widget<TextField>(reply).controller!.text, '本地旧要求的回复');
    await tester.scrollUntilVisible(answer, 180,
        scrollable: find.byType(Scrollable).first);
    expect(tester.widget<TextField>(answer).controller!.text, '本地未保存的故事');
    await tapKey(tester, 'story-read-current');
    expect(find.byKey(const ValueKey('story-keep-local')), findsNothing);
    await tapKey(tester, 'story-adopt-current');
    await tester.drag(find.byType(ListView).first, const Offset(0, 3000));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(reply, 180,
        scrollable: find.byType(Scrollable).first);
    expect(tester.widget<TextField>(reply).controller!.text, '新一轮的服务器回复');
    await tester.scrollUntilVisible(answer, 180,
        scrollable: find.byType(Scrollable).first);
    expect(tester.widget<TextField>(answer).controller!.text, '新一轮的服务器草稿');
    expect(adapter.requests.where((r) => r.method == 'PATCH'), isEmpty);
    expect(tester.takeException(), null);
  });
  testWidgets('重开需求恢复补充草稿；正式重提必须逐项回复并生成新正式提交', (tester) async {
    var submitted = false;
    var saved = supplementContext(responses: const {'story': ''});
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '$storyCollection/$requestId') {
        return envelope(story(
            status: submitted ? 'SUBMITTED' : 'INTAKE',
            formalId: submitted ? nextSubmissionId : submissionId,
            version: submitted ? 6 : 3));
      }
      if (r.path.endsWith('/supplement')) {
        if (r.method == 'PATCH') {
          saved = supplementContext(
              version: 5,
              answers: Map<String, String>.from(r.data['answers']),
              responses: Map<String, String>.from(r.data['responses']));
        }
        return envelope(
            submitted ? supplementContext(version: 6, open: false) : saved);
      }
      if (r.path.endsWith('/supplement-submissions')) {
        submitted = true;
        return envelope(
            story(status: 'SUBMITTED', version: 6, formalId: nextSubmissionId));
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => storySession(adapter)))!;
    await host(tester, session, id: requestId);
    await tapKey(tester, 'story-submit');
    expect(find.text('正式提交这次补充？'), findsNothing);
    final reply = find.byKey(const ValueKey('story-response-story'));
    await tester.ensureVisible(reply);
    await tester.enterText(reply, '说明具体关系');
    await tapKey(tester, 'story-save');
    await tester.pumpWidget(const SizedBox());
    await host(tester, session, id: requestId);
    expect(tester.widget<TextField>(reply).controller!.text, '说明具体关系');
    await tapKey(tester, 'story-submit');
    await tester.tap(find.text('确认'));
    await tester.pumpAndSettle();
    final sent = adapter.requests
        .where((r) => r.path.endsWith('/supplement-submissions'))
        .single;
    expect(sent.data, {});
    expect(sent.headers['If-Match'], '"5"');
    expect(find.textContaining('补充已正式送交'), findsOneWidget);
    expect(find.byKey(const ValueKey('story-submit')), findsNothing);
    expect(tester.takeException(), null);
  });
  testWidgets('补充412同时保留故事和逐项回复，核对新版后使用新版继续保存', (tester) async {
    var reads = 0, writes = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '$storyCollection/$requestId') {
        return envelope(story(status: 'INTAKE', version: 3));
      }
      if (r.path.endsWith('/supplement')) {
        if (r.method == 'GET') {
          return envelope(++reads == 1
              ? supplementContext()
              : supplementContext(
                  version: 7, responses: const {'story': '服务器的回复'}));
        }
        return ++writes == 1
            ? envelope({'code': 'PRECONDITION_FAILED'},
                status: 412, error: true)
            : envelope(supplementContext(
                version: 8,
                answers: Map<String, String>.from(r.data['answers']),
                responses: Map<String, String>.from(r.data['responses'])));
      }
      return adapter.defaultReply(r);
    });
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
        id: requestId);
    final field = find.byKey(const ValueKey('story-field-story'));
    final reply = find.byKey(const ValueKey('story-response-story'));
    await tester.ensureVisible(reply);
    await tester.enterText(reply, '本地回复保留');
    await tester.ensureVisible(field);
    await tester.enterText(field, '本地故事保留');
    await tapKey(tester, 'story-save');
    expect(tester.widget<TextField>(field).controller!.text, '本地故事保留');
    expect(tester.widget<TextField>(reply).controller!.text, '本地回复保留');
    await tapKey(tester, 'story-read-current');
    await tapKey(tester, 'story-keep-local');
    await tapKey(tester, 'story-save');
    expect(adapter.requests.last.headers['If-Match'], '"7"');
    expect(adapter.requests.last.data['responses']['story'], '本地回复保留');
    expect(tester.takeException(), null);
  });
  testWidgets('补充未知保存结果锁住两类输入，只重放原操作与版本', (tester) async {
    var writes = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '$storyCollection/$requestId') {
        return envelope(story(status: 'INTAKE', version: 3));
      }
      if (r.path.endsWith('/supplement')) {
        return envelope(
            r.method == 'GET'
                ? supplementContext()
                : ++writes == 1
                    ? {'code': 'SERVICE_UNAVAILABLE'}
                    : supplementContext(version: 5),
            status: r.method == 'PATCH' && writes == 1 ? 503 : 200,
            error: r.method == 'PATCH' && writes == 1);
      }
      return adapter.defaultReply(r);
    });
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
        id: requestId);
    final reply = find.byKey(const ValueKey('story-response-story'));
    await tester.ensureVisible(reply);
    await tester.enterText(reply, '等待核对');
    await tapKey(tester, 'story-save');
    final first = adapter.requests.last;
    expect(tester.widget<TextField>(reply).enabled, false);
    await tester.drag(find.byType(ListView).first, const Offset(0, 1800));
    await tester.pumpAndSettle();
    await tapKey(tester, 'story-retry-original');
    expect(adapter.requests.last.headers['Idempotency-Key'],
        first.headers['Idempotency-Key']);
    expect(adapter.requests.last.headers['If-Match'], '"4"');
    expect(adapter.requests.last.data, first.data);
    expect(tester.takeException(), null);
  });
  testWidgets('历史正式版本展示当时要求回复与答案，支持分页且没有草稿编辑入口', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/submissions')) {
        return envelope({
          'items': [historySummary(id: nextSubmissionId, number: 2)],
          'next_cursor':
              r.queryParameters['cursor'] == null ? 'history-cursor' : null
        });
      }
      if (r.path.endsWith(nextSubmissionId)) {
        return envelope(submissionVersion());
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => storySession(adapter)))!;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: const MaterialApp(
            home: CustomizationFollowupPage(
                requestId: requestId, history: true))));
    await tester.pumpAndSettle();
    await tapKey(tester, 'story-history-$nextSubmissionId');
    expect(find.text('当时的正式回复'), findsOneWidget);
    expect(find.text('背景不够明确'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    await tapKey(tester, 'story-related-more');
    expect(adapter.requests.last.queryParameters['cursor'], 'history-cursor');
    expect(tester.takeException(), null);
  });
  testWidgets('普通成员只能查看需求内报价摘要，没有机构订单确认入口', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/quotes')
            ? envelope({
                'items': [storyQuoteSummary(quoteId, orderId: orderId)],
                'next_cursor': null
              })
            : adapter.defaultReply(r));
    final session = (await tester.runAsync(() => storySession(adapter)))!;
    session.selected = identity(personId, owner: false);
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: const MaterialApp(
            home: CustomizationFollowupPage(requestId: requestId))));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<OutlinedButton>(
                find.byKey(const ValueKey('story-quote-$quoteId')))
            .onPressed,
        null);
    expect(
        tester
            .widget<FilledButton>(
                find.byKey(const ValueKey('story-order-$orderId')))
            .onPressed,
        null);
    expect(
        adapter.requests.any((r) => r.path.startsWith('/api/v1/trade')), false);
    final logout = session.logout();
    await tester.pumpAndSettle();
    await logout;
    await tester.pumpAndSettle();
    expect(find.textContaining(quoteId.substring(0, 8)), findsNothing);
    expect(tester.takeException(), null);
  });
  testWidgets('从需求找到报价，原trade确认进入同一未付款未签署订单，不出现付款办理', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '$storyCollection/$requestId') {
        return envelope(story(status: 'INTAKE'));
      }
      if (r.path.endsWith('/supplement')) {
        return envelope(supplementContext(empty: true));
      }
      if (r.path.endsWith('/quotes')) {
        return envelope({
          'items': [storyQuoteSummary(quoteId)],
          'next_cursor': null
        });
      }
      if (r.path.endsWith(quoteId)) return envelope(storyTrade('QUOTE'));
      if (r.path.endsWith(orderId) || r.path.endsWith('/acceptance')) {
        return envelope(storyTrade('ORDER'));
      }
      if (r.path == '/api/v1/trade/records') {
        return envelope({'items': [], 'next_cursor': null});
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => storySession(adapter)))!;
    await nav.openApp(tester, session, route: '/customization/$requestId');
    await tapKey(tester, 'story-quotes');
    await tapKey(tester, 'story-quote-$quoteId');
    expect(find.text('确认报价形成订单'), findsOneWidget);
    await tester.tap(find.text('确认报价形成订单'));
    await nav.frames(tester);
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    expect(find.text('订单详情'), findsOneWidget);
    expect(
        adapter.requests
            .where((r) => r.path.endsWith('/acceptance'))
            .single
            .data,
        {'quote_sha256': 'c' * 64});
    expect(find.text('建立付款记录'), findsNothing);
    expect(find.text('办理付款记录'), findsNothing);
    expect(
        adapter.requests
            .any((r) => r.method == 'POST' && r.path.endsWith('/payments')),
        false);
    expect(tester.takeException(), null);
  });
}
