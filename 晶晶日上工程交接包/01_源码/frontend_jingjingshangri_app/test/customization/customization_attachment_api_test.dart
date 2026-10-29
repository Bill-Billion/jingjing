import 'dart:async';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/customization/customization_api.dart';
import 'package:jingjingshangri_app/customization/customization_attachments.dart';
import 'package:jingjingshangri_app/customization/customization_models.dart';
import '../account/fake_account_api.dart';
import 'customization_attachment_fixtures.dart';
import 'customization_fixtures.dart';

const attachmentPath = '$storyCollection/$requestId/attachments';
Matcher code(String value) =>
    isA<AccountError>().having((e) => e.code, 'code', value);

void main() {
  test('附件模板从服务端启用，UUID答案可解析且仅本故事READY可保存', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path == attachmentPath
            ? envelope({
                'items': [attachment()],
                'next_cursor': null
              })
            : adapter.defaultReply(r));
    final api = StoryAttachmentApi(
        CustomizationApi(await storySession(adapter)), requestId);
    final record = StoryRequest(
        story(attachment: true, answers: {'story': '', 'proof': attachmentId}));
    expect(StoryCategory(category(attachment: true)).submissionAvailable, true);
    await api.ensureReady(record.template, record.answers);
    await expectLater(
        api.ensureReady(record.template, {'proof': nextAttachmentId}),
        throwsA(code('CUSTOMIZATION_ATTACHMENT_NOT_READY')));
    expect(
        () => StoryAttachment(attachment(request: secondRequestId), requestId),
        throwsA(isA<AccountError>()));
  });

  test('上传使用原字节、文件名、类型和本人身份，返回摘要核验后才可绑定', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path == attachmentPath
            ? envelope(attachment())
            : adapter.defaultReply(r));
    final api = StoryAttachmentApi(
        CustomizationApi(await storySession(adapter)), requestId);
    final result = await api.upload(attachmentBytes, '合成故事.txt', 'text/plain');
    final request = adapter.requests.last;
    expect(request.data, orderedEquals(attachmentBytes));
    expect(request.queryParameters,
        {'display_name': '合成故事.txt', 'media_type': 'text/plain'});
    expect(request.headers['Content-Type'], 'application/octet-stream');
    expect(request.headers['X-Acting-Party'], personId);
    expect(request.headers['Idempotency-Key'], isNotEmpty);
    expect(result.id, attachmentId);
    expect(api.uploadPending, isNull);
  });

  test('大小类型与文件名边界在发起上传前拦截', () async {
    final adapter = FakeAccountAdapter();
    final api = StoryAttachmentApi(
        CustomizationApi(await storySession(adapter)), requestId);
    for (final args in [
      (Uint8List(0), 'x.txt', 'text/plain', 'INVALID_ASSET_SIZE'),
      (
        Uint8List(storyAttachmentMaxBytes + 1),
        'x.txt',
        'text/plain',
        'INVALID_ASSET_SIZE'
      ),
      (
        attachmentBytes,
        'x.bin',
        'application/octet-stream',
        'INVALID_ASSET_TYPE'
      ),
      (attachmentBytes, 'x\n.txt', 'text/plain', 'INVALID_ATTACHMENT_NAME'),
      (
        attachmentBytes,
        '${'字' * 121}.txt',
        'text/plain',
        'INVALID_ATTACHMENT_NAME'
      ),
    ]) {
      await expectLater(
          api.upload(args.$1, args.$2, args.$3), throwsA(code(args.$4)));
    }
    expect(adapter.requests.where((r) => r.path == attachmentPath), isEmpty);
  });

  test('未知上传冻结原字节与原key，拒绝换文件，重试后才解除', () async {
    var uploads = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path == attachmentPath
            ? ++uploads == 1
                ? envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                    status: 503, error: true)
                : envelope(attachment())
            : adapter.defaultReply(r));
    final api = StoryAttachmentApi(
        CustomizationApi(await storySession(adapter)), requestId);
    final input = Uint8List.fromList(attachmentBytes);
    await expectLater(api.upload(input, '合成故事.txt', 'text/plain'),
        throwsA(isA<AccountError>()));
    input[0] = 0;
    final key = adapter.requests.last.headers['Idempotency-Key'];
    expect(api.uploadPending!['bytes'], orderedEquals(attachmentBytes));
    await expectLater(api.upload(input, '其他故事.txt', 'text/plain'),
        throwsA(code('PENDING_OPERATION_CHANGED')));
    await api.retryUpload();
    expect(adapter.requests.last.headers['Idempotency-Key'], key);
    expect(adapter.requests.last.data, orderedEquals(attachmentBytes));
    expect(uploads, 2);
    expect(api.unresolved, false);
  });

  test('存储需平台核对不会换key或误报READY，原文件保留供恢复', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path == attachmentPath
            ? envelope({'code': 'ASSET_UPLOAD_RECONCILIATION_REQUIRED'},
                status: 409, error: true)
            : adapter.defaultReply(r));
    final api = StoryAttachmentApi(
        CustomizationApi(await storySession(adapter)), requestId);
    await expectLater(api.upload(attachmentBytes, '合成故事.txt', 'text/plain'),
        throwsA(code('ASSET_UPLOAD_RECONCILIATION_REQUIRED')));
    final key = adapter.requests.last.headers['Idempotency-Key'];
    expect(api.needsPlatformReview, true);
    await expectLater(api.retryUpload(),
        throwsA(code('ASSET_UPLOAD_RECONCILIATION_REQUIRED')));
    expect(adapter.requests.last.headers['Idempotency-Key'], key);
    expect(api.uploadPending!['bytes'], orderedEquals(attachmentBytes));
  });

  test('不匹配的成功回包仍为未知，不能绑定别的故事或错误摘要', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path == attachmentPath
            ? envelope({...attachment(), 'content_sha256': 'a' * 64})
            : adapter.defaultReply(r));
    final api = StoryAttachmentApi(
        CustomizationApi(await storySession(adapter)), requestId);
    await expectLater(api.upload(attachmentBytes, '合成故事.txt', 'text/plain'),
        throwsA(code('INVALID_CUSTOMIZATION_RESPONSE')));
    expect(api.uploadPending, isNotNull);
  });

  test('空页有游标继续读取，重复游标阻止无穷分页，重新首读可用', () async {
    var cycle = false;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path == attachmentPath
            ? envelope(r.queryParameters['cursor'] == null
                ? {'items': [], 'next_cursor': 'signed-opaque'}
                : {
                    'items': [attachment()],
                    'next_cursor': cycle ? 'signed-opaque' : null
                  })
            : adapter.defaultReply(r));
    final api = StoryAttachmentApi(
        CustomizationApi(await storySession(adapter)), requestId);
    expect((await api.all()).single.id, attachmentId);
    expect((await api.all()).single.id, attachmentId);
    expect(adapter.requests.last.queryParameters,
        {'limit': 20, 'cursor': 'signed-opaque'});
    cycle = true;
    await expectLater(api.all(), throwsA(isA<AccountError>()));
  });

  test('撤回未知重试用附件版本与同key，正式保留409不假报撤回', () async {
    var attempts = 0, retain = false;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/revocations')
            ? retain
                ? envelope(
                    {'code': 'CUSTOMIZATION_ATTACHMENT_RETENTION_REQUIRED'},
                    status: 409, error: true)
                : ++attempts == 1
                    ? envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                        status: 503, error: true)
                    : envelope(attachment(status: 'REVOKED', version: 8))
            : adapter.defaultReply(r));
    final api = StoryAttachmentApi(
        CustomizationApi(await storySession(adapter)), requestId);
    await expectLater(
        api.revoke(StoryAttachment(attachment(version: 7), requestId)),
        throwsA(isA<AccountError>()));
    final key = adapter.requests.last.headers['Idempotency-Key'];
    expect(adapter.requests.last.headers['If-Match'], '"7"');
    final result = await api.retryRevocation(api.revocationPending.single);
    expect(result.status, 'REVOKED');
    expect(adapter.requests.last.headers['Idempotency-Key'], key);
    expect(adapter.requests.last.data, isEmpty);
    expect(api.revocationPending, isEmpty);
    retain = true;
    await expectLater(api.revoke(StoryAttachment(attachment(), requestId)),
        throwsA(code('CUSTOMIZATION_ATTACHMENT_RETENTION_REQUIRED')));
    expect(api.unresolved, false);
  });

  test('受控下载带本人身份，大小摘要不符拒绝交给保存器', () async {
    var corrupted = false;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/content')
            ? ResponseBody.fromBytes(corrupted ? [0] : attachmentBytes, 200,
                headers: {
                    Headers.contentTypeHeader: ['application/octet-stream']
                  })
            : adapter.defaultReply(r));
    final api = StoryAttachmentApi(
        CustomizationApi(await storySession(adapter)), requestId);
    final file = StoryAttachment(attachment(), requestId);
    expect(await api.download(file), orderedEquals(attachmentBytes));
    expect(adapter.requests.last.path, '$attachmentPath/$attachmentId/content');
    expect(adapter.requests.last.headers['X-Acting-Party'], personId);
    corrupted = true;
    await expectLater(
        api.download(file), throwsA(code('PRIVATE_CONTENT_MISMATCH')));
  });

  test('身份变更后丢弃迟到上传结果和进度，也不重新登记未知文件', () async {
    final deferred = Completer<ResponseBody>();
    RequestOptions? upload;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == attachmentPath) {
        upload = r;
        return deferred.future;
      }
      return adapter.defaultReply(r);
    });
    final session = await storySession(adapter);
    final api = StoryAttachmentApi(CustomizationApi(session), requestId);
    final progress = <int>[];
    final result = api.upload(attachmentBytes, '合成故事.txt', 'text/plain',
        onProgress: (sent, _) => progress.add(sent));
    final failure = expectLater(result, throwsA(code('CONTEXT_CHANGED')));
    while (upload == null) {
      await Future<void>.delayed(Duration.zero);
    }
    upload!.onSendProgress?.call(2, 5);
    expect(progress, contains(2));
    session.select(identity(orgId));
    final count = progress.length;
    upload!.onSendProgress?.call(5, 5);
    expect(progress.length, count);
    deferred.complete(
        envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'}, status: 503, error: true));
    await failure;
    session.select(identity(personId));
    expect(api.uploadPending, isNull);
  });
}
