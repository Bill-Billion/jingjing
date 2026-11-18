import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/customization/customization_api.dart';
import 'package:jingjingshangri_app/customization/customization_models.dart';

import '../account/fake_account_api.dart';
import 'customization_fixtures.dart';

void main() {
  test('有效普通成员可办理自己的故事，不要求负责人、数字人或星探资格', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path == '$storyCollection/$requestId'
            ? envelope(story())
            : adapter.defaultReply(r));
    final session = await storySession(adapter);
    session.selected = identity(personId, owner: false);
    final result = await CustomizationApi(session).record(requestId);
    expect(result.id, requestId);
  });
  test('表单按模板动态解析，保留历史与清空值，附件模板遵从服务端提交能力', () {
    expect(StoryCategory(category()).template.fields.first.key, 'story');
    expect(
      StoryCategory(category(second: true)).template.fields.first.key,
      'moment',
    );
    expect(
      StoryCategory(category(attachment: true)).submissionAvailable,
      true,
    );
    final draft = StoryRequest(
      story(answers: const {'story': '', 'style': ''}),
    );
    expect(draft.answers['story'], '');
    expect(draft.template.title, '家庭故事');
    expect(draft.allows('SAVE'), true);
    expect(StoryRequest(story(status: 'INTAKE')).allows('SUBMIT'), false);
  });
  test('未知字段、非法选项、附件伪值和不属于当前主体的响应被拒绝', () async {
    for (final answers in [
      {'unknown': '任意内容'},
      {'style': '任意选项'},
      {'proof': 'https://example.test/file'},
    ]) {
      expect(
        () => StoryRequest(story(answers: answers, attachment: true)),
        throwsA(isA<AccountError>()),
      );
    }
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) => r.path == '$storyCollection/$requestId'
          ? envelope({...story(), 'party_id': orgId})
          : adapter.defaultReply(r),
    );
    final api = CustomizationApi(await storySession(adapter));
    await expectLater(api.record(requestId), throwsA(isA<AccountError>()));
  });
  test('真实读写协议使用Bearer、当前主体、If-Match和整份answers，不回填清空值', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) => r.path == '$storyCollection/$requestId'
          ? envelope(
              story(version: 2, answers: const {'story': '', 'style': ''}),
            )
          : adapter.defaultReply(r),
    );
    final api = CustomizationApi(await storySession(adapter));
    final result = await api.save(StoryRequest(story()), {
      'story': '',
      'style': '',
    });
    expect(result.answers['story'], '');
    final request = adapter.requests.last;
    expect(request.method, 'PATCH');
    expect(request.data, {
      'answers': {'story': '', 'style': ''},
    });
    expect(request.headers['Authorization'], 'Bearer ${'x' * 43}');
    expect(request.headers['X-Acting-Party'], personId);
    expect(request.headers['If-Match'], '"1"');
    expect(request.headers['Idempotency-Key'], isNotEmpty);
  });
  test('字段错误只保留安全标识及固定原因，不接受故事正文或任意details', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) => r.path == '$storyCollection/$requestId'
          ? envelope(
              {
                'code': 'CUSTOMIZATION_VALIDATION_FAILED',
                'details': [
                  {
                    'field': 'answers.story',
                    'reason': 'REQUIRED',
                    'private': '不能反射',
                  },
                  {'field': 'answers', 'reason': 'TOO_LARGE'},
                  {'field': 'answers.secret', 'reason': '故事原文'},
                  {'field': 'token', 'reason': 'REQUIRED'},
                  {'field': 'answers.story\n私人内容', 'reason': 'REQUIRED'},
                ],
              },
              status: 422,
              error: true,
            )
          : adapter.defaultReply(r),
    );
    final api = CustomizationApi(await storySession(adapter));
    await expectLater(
      api.record(requestId),
      throwsA(
        isA<AccountError>().having((e) => e.details, 'safe details', [
          {'field': 'answers.story', 'reason': 'REQUIRED'},
          {'field': 'answers', 'reason': 'TOO_LARGE'},
        ]),
      ),
    );
  });
  test('未知写入结果保留原内容、版本及幂等键；拒绝换内容，重放后才解除', () async {
    late FakeAccountAdapter adapter;
    var writes = 0;
    adapter = FakeAccountAdapter(
      handler: (r) => r.path == '$storyCollection/$requestId'
          ? ++writes == 1
              ? envelope(
                  {'code': 'SERVICE_UNAVAILABLE'},
                  status: 503,
                  error: true,
                )
              : envelope(
                  story(
                    version: 2,
                    answers: const {'story': '原操作', 'style': ''},
                  ),
                )
          : adapter.defaultReply(r),
    );
    final api = CustomizationApi(await storySession(adapter));
    await expectLater(
      api.save(StoryRequest(story()), {'story': '原操作', 'style': ''}),
      throwsA(isA<AccountError>()),
    );
    final key = adapter.requests.last.headers['Idempotency-Key'];
    final pending = api.pending(id: requestId)!;
    expect(pending.operation['body'], {
      'answers': {'story': '原操作', 'style': ''},
    });
    await expectLater(
      api.save(StoryRequest(story()), {'story': '换内容'}),
      throwsA(
        isA<AccountError>().having(
          (e) => e.code,
          'code',
          'PENDING_OPERATION_CHANGED',
        ),
      ),
    );
    final result = await api.retry(pending);
    expect(result.version, 2);
    expect(adapter.requests.last.headers['Idempotency-Key'], key);
    expect(adapter.requests.last.headers['If-Match'], '"1"');
    expect(api.pending(id: requestId), null);
  });
  test('同一写入重复调用共享原请求和幂等键', () async {
    final reply = Completer<ResponseBody>();
    final received = Completer<void>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) {
        if (r.method == 'PATCH') {
          received.complete();
          return reply.future;
        }
        return adapter.defaultReply(r);
      },
    );
    final api = CustomizationApi(await storySession(adapter));
    final first = api.save(StoryRequest(story()), {'story': '同一份'});
    final second = api.save(StoryRequest(story()), {'story': '同一份'});
    await received.future;
    expect(adapter.requests.where((r) => r.method == 'PATCH').length, 1);
    reply.complete(
      envelope(story(version: 2, answers: const {'story': '同一份'})),
    );
    await Future.wait([first, second]);
  });
  test('412为明确失败，读取新版再保存时生成新操作和当前版本', () async {
    late FakeAccountAdapter adapter;
    var writes = 0;
    adapter = FakeAccountAdapter(
      handler: (r) {
        if (r.path == '$storyCollection/$requestId') {
          if (r.method == 'GET') return envelope(story(version: 4));
          return ++writes == 1
              ? envelope(
                  {'code': 'PRECONDITION_FAILED'},
                  status: 412,
                  error: true,
                )
              : envelope(story(version: 5));
        }
        return adapter.defaultReply(r);
      },
    );
    final api = CustomizationApi(await storySession(adapter));
    await expectLater(
      api.save(StoryRequest(story()), {'story': '本页输入'}),
      throwsA(isA<AccountError>()),
    );
    final firstKey = adapter.requests.last.headers['Idempotency-Key'];
    expect(api.pending(id: requestId), null);
    await api.save(await api.record(requestId), {'story': '本页输入'});
    expect(adapter.requests.last.headers['If-Match'], '"4"');
    expect(adapter.requests.last.headers['Idempotency-Key'], isNot(firstKey));
  });
  test('分页原样使用服务器游标，筛选绑定当前主体，不读取其他账号故事', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) => r.path == storyCollection
          ? envelope({
              'items': [summary()],
              'next_cursor':
                  r.queryParameters['cursor'] == null ? 'opaque-cursor' : null,
            })
          : adapter.defaultReply(r),
    );
    final api = CustomizationApi(await storySession(adapter));
    final first = await api.page(status: 'DRAFT');
    await api.page(status: 'DRAFT', cursor: first.cursor);
    expect(adapter.requests.last.queryParameters, {
      'limit': 20,
      'current_status': 'DRAFT',
      'cursor': 'opaque-cursor',
    });
    expect(adapter.requests.last.headers['X-Acting-Party'], personId);
  });
  test('主体切换丢弃延迟响应，并阻止旧响应重新登记私人未确认写入', () async {
    final reply = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
      handler: (r) =>
          r.method == 'PATCH' ? reply.future : adapter.defaultReply(r),
    );
    final session = await storySession(adapter),
        api = CustomizationApi(session);
    final saving = api.save(StoryRequest(story()), {'story': '私有故事'});
    await Future<void>.delayed(Duration.zero);
    session.select(identity(orgId));
    reply.complete(
      envelope({'code': 'SERVICE_UNAVAILABLE'}, status: 503, error: true),
    );
    await expectLater(
      saving,
      throwsA(
        isA<AccountError>().having((e) => e.code, 'code', 'CONTEXT_CHANGED'),
      ),
    );
    session.select(identity(personId));
    expect(api.pending(id: requestId), null);
  });
}
