import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/customization/customization_api.dart';
import 'package:jingjingshangri_app/customization/customization_page.dart';

import '../account/fake_account_api.dart';
import 'customization_fixtures.dart';

Future<void> host(
  WidgetTester tester,
  AccountSession session, {
  String? id,
  bool create = false,
}) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ChangeNotifierProvider.value(
      value: session,
      child: MaterialApp(
        home: CustomizationPage(requestId: id, createNew: create),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> tapKey(WidgetTester tester, String key) async {
  final finder = find.byKey(ValueKey(key));
  if (finder.evaluate().isEmpty) {
    await tester.scrollUntilVisible(finder, 180,
        scrollable: find.byType(Scrollable).first);
  }
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  expect(finder.hitTestable(), findsOneWidget);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('选择品类真的更换问题；新故事保存完整文字答案', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) {
        if (r.path == '/api/v1/customization-categories') {
          return envelope({
            'items': [category(), category(second: true)],
          });
        }
        if (r.path == storyCollection) {
          return envelope({
            ...story(),
            'template_version_id': secondTemplateId,
            'template_snapshot': template(second: true),
            'answers': {'moment': '人生的一段记忆'},
          });
        }
        return adapter.defaultReply(r);
      },
    );
    final session = (await tester.runAsync(() => storySession(adapter)))!;
    await host(tester, session, create: true);
    await tapKey(tester, 'customization-category-FAMILY');
    expect(find.byKey(const ValueKey('story-field-story')), findsOneWidget);
    await tapKey(tester, 'customization-category-LIFE');
    expect(find.byKey(const ValueKey('story-field-story')), findsNothing);
    await tester.ensureVisible(
      find.byKey(const ValueKey('story-field-moment')),
    );
    await tester.enterText(
      find.byKey(const ValueKey('story-field-moment')),
      '人生的一段记忆',
    );
    await tapKey(tester, 'story-save');
    expect(adapter.requests.last.data, {
      'template_version_id': secondTemplateId,
      'answers': {'moment': '人生的一段记忆'},
    });
    expect(find.text('故事草稿已保存，可以从“我的需求”继续填写。'), findsOneWidget);
    expect(tester.takeException(), null);
  });
  testWidgets('恢复使用详情历史快照；清空保存后不恢复旧值', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) => r.path == '$storyCollection/$requestId'
          ? envelope(
              r.method == 'GET'
                  ? story()
                  : story(
                      version: 2,
                      answers: const {'story': '', 'style': ''},
                    ),
            )
          : adapter.defaultReply(r),
    );
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
        id: requestId);
    final field = find.byKey(const ValueKey('story-field-story'));
    expect(tester.widget<TextField>(field).controller!.text, '保存过的文字');
    expect(
      adapter.requests.any((r) => r.path == '/api/v1/customization-categories'),
      false,
    );
    await tester.ensureVisible(field);
    await tester.enterText(field, '');
    await tapKey(tester, 'story-save');
    expect(adapter.requests.last.data, {
      'answers': {'story': '', 'style': ''},
    });
    expect(tester.widget<TextField>(field).controller!.text, '');
    expect(tester.takeException(), null);
  });
  testWidgets('412保留本页输入，必须读取并核对当前版本后才能再次保存', (tester) async {
    late FakeAccountAdapter adapter;
    var reads = 0, writes = 0;
    adapter = FakeAccountAdapter(
      handler: (r) {
        if (r.path == '$storyCollection/$requestId') {
          if (r.method == 'GET') {
            return envelope(
              ++reads == 1
                  ? story()
                  : story(
                      version: 4,
                      answers: const {'story': '服务器新内容', 'style': ''},
                    ),
            );
          }
          return ++writes == 1
              ? envelope(
                  {'code': 'PRECONDITION_FAILED'},
                  status: 412,
                  error: true,
                )
              : envelope(
                  story(
                    version: 5,
                    answers: const {'story': '本页未丢失的内容', 'style': ''},
                  ),
                );
        }
        return adapter.defaultReply(r);
      },
    );
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
        id: requestId);
    final field = find.byKey(const ValueKey('story-field-story'));
    await tester.ensureVisible(field);
    await tester.enterText(field, '本页未丢失的内容');
    await tapKey(tester, 'story-save');
    expect(tester.widget<TextField>(field).controller!.text, '本页未丢失的内容');
    expect(
      tester
          .widget<OutlinedButton>(find.byKey(const ValueKey('story-save')))
          .onPressed,
      null,
    );
    await tapKey(tester, 'story-read-current');
    expect(find.textContaining('服务器新内容'), findsOneWidget);
    expect(tester.widget<TextField>(field).controller!.text, '本页未丢失的内容');
    await tapKey(tester, 'story-keep-local');
    await tapKey(tester, 'story-save');
    expect(adapter.requests.last.headers['If-Match'], '"4"');
    expect(adapter.requests.last.data, {
      'answers': {'story': '本页未丢失的内容', 'style': ''},
    });
    expect(tester.takeException(), null);
  });
  testWidgets('必填附件模板可保存文字，但没有附件伪上传或正式提交', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) => r.path == '$storyCollection/$requestId'
          ? envelope(story(attachment: true))
          : adapter.defaultReply(r),
    );
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
        id: requestId);
    final submit = tester.widget<FilledButton>(
      find.byKey(const ValueKey('story-submit')),
    );
    expect(submit.onPressed, null);
    expect(
      tester
          .widget<OutlinedButton>(find.byKey(const ValueKey('story-save')))
          .onPressed,
      isNotNull,
    );
    expect(find.byType(DropdownButtonFormField<String>), findsOneWidget);
    expect(find.textContaining('附件提交尚未开放'), findsWidgets);
    expect(
      adapter.requests.any(
        (r) => r.method == 'POST' && r.path.endsWith('/submissions'),
      ),
      false,
    );
  });
  testWidgets('服务端逐字段原因显示在对应问题下且输入保留', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) => r.path == '$storyCollection/$requestId'
          ? r.method == 'GET'
              ? envelope(story())
              : envelope(
                  {
                    'code': 'CUSTOMIZATION_VALIDATION_FAILED',
                    'details': [
                      {'field': 'answers.story', 'reason': 'TOO_LONG'},
                    ],
                  },
                  status: 400,
                  error: true,
                )
          : adapter.defaultReply(r),
    );
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
        id: requestId);
    final field = find.byKey(const ValueKey('story-field-story'));
    await tester.ensureVisible(field);
    await tester.enterText(field, '保留这段输入');
    await tapKey(tester, 'story-save');
    expect(find.text('内容超过该项字数上限，请精简后保存。'), findsOneWidget);
    expect(tester.widget<TextField>(field).controller!.text, '保留这段输入');
    expect(tester.takeException(), null);
  });
  testWidgets('未知结果锁定输入，只重试原操作并沿用原key', (tester) async {
    late FakeAccountAdapter adapter;
    var writes = 0;
    adapter = FakeAccountAdapter(
      handler: (r) => r.path == '$storyCollection/$requestId'
          ? r.method == 'GET'
              ? envelope(story())
              : ++writes == 1
                  ? envelope(
                      {'code': 'SERVICE_UNAVAILABLE'},
                      status: 503,
                      error: true,
                    )
                  : envelope(
                      story(
                        version: 2,
                        answers: const {'story': '等待确认的内容', 'style': ''},
                      ),
                    )
          : adapter.defaultReply(r),
    );
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
        id: requestId);
    final field = find.byKey(const ValueKey('story-field-story'));
    await tester.ensureVisible(field);
    await tester.enterText(field, '等待确认的内容');
    await tapKey(tester, 'story-save');
    final original = adapter.requests.last;
    expect(tester.widget<TextField>(field).enabled, false);
    await tapKey(tester, 'story-retry-original');
    expect(
      adapter.requests.last.headers['Idempotency-Key'],
      original.headers['Idempotency-Key'],
    );
    expect(adapter.requests.last.data, original.data);
    expect(tester.widget<TextField>(field).enabled, true);
    expect(tester.takeException(), null);
  });
  testWidgets('正式提交先保存当前内容，再提交当前版本，并显示待查看状态', (tester) async {
    late FakeAccountAdapter adapter;
    var savedAnswers = <String, String>{'story': '保存过的文字', 'style': ''};
    adapter = FakeAccountAdapter(
      handler: (r) {
        if (r.path == '$storyCollection/$requestId/submissions') {
          return envelope(
              story(status: 'SUBMITTED', version: 3, answers: savedAnswers));
        }
        if (r.path == '$storyCollection/$requestId') {
          if (r.method == 'PATCH') {
            savedAnswers = Map<String, String>.from(r.data['answers'] as Map);
          }
          return envelope(story(
              version: r.method == 'PATCH' ? 2 : 1, answers: savedAnswers));
        }
        return adapter.defaultReply(r);
      },
    );
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
        id: requestId);
    final field = find.byKey(const ValueKey('story-field-story'));
    await tester.ensureVisible(field);
    await tester.enterText(field, '保存并正式提交');
    await tapKey(tester, 'story-submit');
    expect(find.text('正式把故事交给平台？'), findsOneWidget);
    await tester.tap(find.text('确认'));
    await tester.pumpAndSettle();
    final writes = adapter.requests
        .where(
          (r) =>
              ['PATCH', 'POST'].contains(r.method) &&
              r.path.startsWith(storyCollection),
        )
        .toList();
    expect(writes.map((r) => r.method), ['PATCH', 'POST']);
    expect(writes.last.headers['If-Match'], '"2"');
    expect(writes.last.data, {});
    expect(find.text('平台待查看'), findsOneWidget);
    expect(find.byKey(const ValueKey('story-submit')), findsNothing);
    final answer = find.byKey(const ValueKey('story-answer-story'));
    await tester.ensureVisible(answer);
    await tester.pumpAndSettle();
    expect(tester.widget<SelectableText>(answer).data, '保存并正式提交');
    expect(tester.widget<SelectableText>(answer).style?.color,
        const Color(0xFF252923));
    expect(
        tester
            .widget<SelectableText>(
                find.byKey(const ValueKey('story-answer-style')))
            .data,
        '（未填写）');
    expect(find.byType(TextField), findsNothing);
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
    expect(tester.takeException(), null);
  });
  testWidgets('列表分页保持游标，换筛选从第一页重新读取', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) => r.path == storyCollection
          ? envelope({
              'items': [
                summary(
                  id: r.queryParameters['cursor'] == null
                      ? requestId
                      : secondRequestId,
                  status: r.queryParameters['current_status'] ?? 'DRAFT',
                ),
              ],
              'next_cursor':
                  r.queryParameters['cursor'] == null ? 'opaque-1' : null,
            })
          : adapter.defaultReply(r),
    );
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!);
    await tapKey(tester, 'story-more');
    expect(
      find.byKey(const ValueKey('story-open-$secondRequestId')),
      findsOneWidget,
    );
    expect(find.textContaining('编号 77777777'), findsOneWidget);
    expect(find.textContaining('编号 88888888'), findsOneWidget);
    await tester.ensureVisible(find.text('平台待查看').first);
    await tester.tap(find.text('平台待查看').first);
    await tester.pumpAndSettle();
    expect(adapter.requests.last.queryParameters, {
      'limit': 20,
      'current_status': 'SUBMITTED',
    });
    expect(
      find.byKey(const ValueKey('story-open-$secondRequestId')),
      findsNothing,
    );
    expect(tester.takeException(), null);
  });
  testWidgets('退出后立即清除已显示的私密故事', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) => r.path == '$storyCollection/$requestId'
          ? envelope(story())
          : adapter.defaultReply(r),
    );
    final session = (await tester.runAsync(() => storySession(adapter)))!;
    await host(tester, session, id: requestId);
    expect(find.byKey(const ValueKey('story-field-story')), findsOneWidget);
    final logout = session.logout();
    await tester.pump();
    expect(find.byKey(const ValueKey('story-field-story')), findsNothing);
    expect(find.text('保存过的文字'), findsNothing);
    for (var i = 0; i < 25; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await logout;
    await tester.pumpAndSettle();
    expect(find.text('前往账号与身份'), findsOneWidget);
    expect(tester.takeException(), null);
  });
  testWidgets('旧身份延迟响应不能覆盖新身份页面', (tester) async {
    final response = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) => r.path == '$storyCollection/$requestId'
          ? r.headers['X-Acting-Party'] == personId
              ? response.future
              : envelope(
                  {'code': 'CUSTOMIZATION_NOT_FOUND'},
                  status: 404,
                  error: true,
                )
          : adapter.defaultReply(r),
    );
    final session = (await tester.runAsync(() => storySession(adapter)))!;
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: session,
        child: const MaterialApp(home: CustomizationPage(requestId: requestId)),
      ),
    );
    await tester.pump();
    session.select(identity(orgId));
    await tester.pump();
    response.complete(envelope(story()));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('story-field-story')), findsNothing);
    expect(find.text('保存过的文字'), findsNothing);
    expect(tester.takeException(), null);
  });
}
