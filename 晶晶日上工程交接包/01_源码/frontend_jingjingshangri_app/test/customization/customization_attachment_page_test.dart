import 'dart:async';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/customization/customization_api.dart';
import 'package:jingjingshangri_app/customization/customization_attachments.dart';
import 'package:jingjingshangri_app/customization/customization_followup.dart';
import 'package:jingjingshangri_app/customization/customization_page.dart';
import '../account/fake_account_api.dart';
import 'customization_attachment_fixtures.dart';
import 'customization_fixtures.dart';
import 'customization_page_test.dart' show host, tapKey;

const attachmentPath = '$storyCollection/$requestId/attachments';

class Picker extends FilePickerPlatform {
  Picker({this.open});
  final Future<FilePickerResult?> Function()? open;
  int opened = 0;
  final saved = <Uint8List>[];
  @override
  Future<FilePickerResult?> pickFiles(
      {String? dialogTitle,
      String? initialDirectory,
      FileType type = FileType.any,
      List<String>? allowedExtensions,
      Function(FilePickerStatus)? onFileLoading,
      int compressionQuality = 0,
      bool allowMultiple = false,
      bool withData = false,
      bool withReadStream = false,
      bool lockParentWindow = false,
      bool readSequential = false,
      bool cancelUploadOnWindowBlur = true}) async {
    opened++;
    return open != null
        ? open!()
        : FilePickerResult([
            PlatformFile(
                name: '合成故事.txt',
                size: attachmentBytes.length,
                readStream: Stream.value(attachmentBytes))
          ]);
  }

  @override
  Future<String?> saveFile(
      {String? dialogTitle,
      String? fileName,
      String? initialDirectory,
      FileType type = FileType.any,
      List<String>? allowedExtensions,
      Uint8List? bytes,
      bool lockParentWindow = false}) async {
    saved.add(Uint8List.fromList(bytes!));
    return '/synthetic/download.txt';
  }
}

Picker usePicker({Future<FilePickerResult?> Function()? open}) {
  final original = FilePickerPlatform.instance;
  addTearDown(() => FilePickerPlatform.instance = original);
  final picker = Picker(open: open);
  FilePickerPlatform.instance = picker;
  return picker;
}

void main() {
  testWidgets('新建先保存草稿再选文件，上传保留文字并不自动保存，重开能读取原附件', (tester) async {
    final picker = usePicker();
    var saved = <String, String>{'story': '保存前的新文字', 'style': '', 'proof': ''};
    var uploaded = false;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/customization-categories') {
        return envelope({
          'items': [category(attachment: true)]
        });
      }
      if (r.path == attachmentPath) {
        if (r.method == 'POST') {
          uploaded = true;
          return envelope(attachment());
        }
        return envelope({
          'items': uploaded ? [attachment()] : [],
          'next_cursor': null
        });
      }
      if (r.path == storyCollection ||
          r.path == '$storyCollection/$requestId') {
        if (r.method != 'GET') {
          saved = Map<String, String>.from(r.data['answers']);
        }
        return envelope(story(
            attachment: true,
            answers: saved,
            version: r.method == 'PATCH' ? 2 : 1));
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => storySession(adapter)))!;
    await host(tester, session, create: true);
    await tapKey(tester, 'customization-category-FAMILY');
    expect(find.byKey(const ValueKey('story-upload-proof')), findsNothing);
    await tester.enterText(
        find.byKey(const ValueKey('story-field-story')), '保存前的新文字');
    await tapKey(tester, 'story-save');
    expect(
        adapter.requests
            .where((r) => r.path == storyCollection && r.method == 'POST')
            .single
            .data['answers']['proof'],
        '');
    await tapKey(tester, 'story-upload-proof');
    expect(picker.opened, 1);
    expect(adapter.requests.where((r) => r.method == 'PATCH'), isEmpty);
    expect(adapter.requests.where((r) => r.path.endsWith('/submissions')),
        isEmpty);
    expect(find.textContaining('附件已上传。'), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('离开当前故事？'), findsOneWidget);
    await tester.tap(find.text('返回继续填写'));
    await tester.pumpAndSettle();
    await tapKey(tester, 'story-save');
    expect(saved['story'], '保存前的新文字');
    expect(saved['proof'], attachmentId);
    await tester.pumpWidget(const SizedBox.shrink());
    await host(tester, session, id: requestId);
    await tapKey(tester, 'story-attachments-refresh');
    expect(find.text('合成故事.txt'), findsWidgets);
    expect(picker.opened, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('实际进度展示，切换身份后迟到上传不回填故事或进度', (tester) async {
    usePicker();
    final response = Completer<ResponseBody>();
    RequestOptions? upload;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == attachmentPath) {
        if (r.method == 'POST') {
          upload = r;
          return response.future;
        }
        return envelope({'items': [], 'next_cursor': null});
      }
      if (r.path == '$storyCollection/$requestId') {
        return envelope(story(attachment: true));
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => storySession(adapter)))!;
    await host(tester, session, id: requestId);
    final button = find.byKey(const ValueKey('story-upload-proof'));
    await tester.scrollUntilVisible(button, 180,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(button);
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(upload, isNotNull);
    upload!.onSendProgress?.call(2, 5);
    await tester.pump();
    expect(find.text('正在传输 2 / 5 字节'), findsOneWidget);
    expect(
        tester
            .widget<OutlinedButton>(find.byKey(const ValueKey('story-save')))
            .onPressed,
        isNull);
    session.select(identity(orgId));
    await tester.pump();
    upload!.onSendProgress?.call(5, 5);
    response.complete(envelope(attachment()));
    await tester.pumpAndSettle();
    expect(find.text('正在传输 2 / 5 字节'), findsNothing);
    expect(find.textContaining('附件已上传。'), findsNothing);
    expect(find.text('合成故事.txt'), findsNothing);
    session.select(identity(personId));
    await tester.pumpAndSettle();
    expect(
        StoryAttachmentApi(CustomizationApi(session), requestId).uploadPending,
        isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('补件可换附件并只保存补件草稿，原正式附件保留且不能撤回', (tester) async {
    usePicker();
    var uploaded = false;
    var draftAnswers = {'story': '补件故事', 'style': '', 'proof': attachmentId};
    var version = 4;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '$storyCollection/$requestId') {
        return envelope(story(
            status: 'INTAKE',
            attachment: true,
            answers: {'story': '正式故事', 'style': '', 'proof': attachmentId}));
      }
      if (r.path.endsWith('/supplement')) {
        if (r.method == 'PATCH') {
          draftAnswers = Map<String, String>.from(r.data['answers']);
          version++;
        }
        final result = supplementContext(
            version: version,
            answers: draftAnswers,
            responses: {'proof': '已补充新附件'});
        result['supplement']['items'] = [
          {'field_key': 'proof', 'reason': '材料不清楚', 'instruction': '请补充清晰附件'}
        ];
        return envelope(result);
      }
      if (r.path == attachmentPath) {
        if (r.method == 'POST') {
          uploaded = true;
          return envelope(attachment(id: nextAttachmentId));
        }
        return envelope({
          'items': [
            attachment(name: '原正式附件.txt'),
            if (uploaded) attachment(id: nextAttachmentId)
          ],
          'next_cursor': null
        });
      }
      return adapter.defaultReply(r);
    });
    await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
        id: requestId);
    await tapKey(tester, 'story-upload-proof');
    expect(find.byKey(const ValueKey('story-attachment-revoke-$attachmentId')),
        findsNothing);
    expect(find.text('原正式附件.txt'), findsWidgets);
    await tapKey(tester, 'story-save');
    final patch = adapter.requests.where((r) => r.method == 'PATCH').single;
    expect(patch.path, '$storyCollection/$requestId/supplement');
    expect(patch.headers['If-Match'], '"4"');
    expect(patch.data['answers']['proof'], nextAttachmentId);
    expect(patch.data['responses'], {'proof': '已补充新附件'});
    expect(
        adapter.requests
            .where((r) => r.path.endsWith('/supplement-submissions')),
        isEmpty);
    expect(tester.takeException(), isNull);
  });

  for (final retained in [false, true]) {
    testWidgets(
        retained ? '保留409不清掉原附件，也不声称撤回成功' : '未提交附件撤回使用附件版本，清本页绑定但仍须另行保存',
        (tester) async {
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(handler: (r) {
        if (r.path.endsWith('/revocations')) {
          return retained
              ? envelope(
                  {'code': 'CUSTOMIZATION_ATTACHMENT_RETENTION_REQUIRED'},
                  status: 409, error: true)
              : envelope(attachment(status: 'REVOKED', version: 8));
        }
        if (r.path == attachmentPath) {
          return envelope({
            'items': [attachment(version: 7)],
            'next_cursor': null
          });
        }
        if (r.path == '$storyCollection/$requestId') {
          return envelope(story(
              attachment: true,
              answers: {'story': '草稿', 'style': '', 'proof': attachmentId}));
        }
        return adapter.defaultReply(r);
      });
      await host(tester, (await tester.runAsync(() => storySession(adapter)))!,
          id: requestId);
      await tapKey(tester, 'story-attachment-revoke-$attachmentId');
      await tester.tap(find.text('确认撤回访问'));
      await tester.pumpAndSettle();
      expect(adapter.requests.last.headers['If-Match'], '"7"');
      expect(adapter.requests.where((r) => r.method == 'PATCH'), isEmpty);
      if (retained) {
        expect(find.textContaining('附件访问没有撤回'), findsOneWidget);
        expect(find.byKey(const ValueKey('story-attachment-value-proof')),
            findsOneWidget);
      } else {
        expect(find.textContaining('附件访问已撤回。'), findsOneWidget);
        expect(find.byKey(const ValueKey('story-attachment-value-proof')),
            findsNothing);
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('平台核对状态可安全返回，重开保留原文件和key而不会另开上传', (tester) async {
    final picker = usePicker();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == attachmentPath) {
        return r.method == 'POST'
            ? envelope({'code': 'ASSET_UPLOAD_RECONCILIATION_REQUIRED'},
                status: 409, error: true)
            : envelope({'items': [], 'next_cursor': null});
      }
      if (r.path == '$storyCollection/$requestId') {
        return envelope(story(attachment: true));
      }
      return adapter.defaultReply(r);
    });
    final session = (await tester.runAsync(() => storySession(adapter)))!;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: MaterialApp(
            home: Builder(
                builder: (context) => Scaffold(
                    body: TextButton(
                        onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => const CustomizationPage(
                                    requestId: requestId))),
                        child: const Text('打开故事')))))));
    await tester.tap(find.text('打开故事'));
    await tester.pumpAndSettle();
    await tapKey(tester, 'story-upload-proof');
    final original = adapter.requests
        .where((r) => r.path == attachmentPath && r.method == 'POST')
        .single;
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('暂时离开，等待平台核对？'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, '确认'));
    await tester.pumpAndSettle();
    expect(find.text('打开故事'), findsOneWidget);
    expect(
        StoryAttachmentApi(CustomizationApi(session), requestId)
            .uploadPending!['bytes'],
        orderedEquals(attachmentBytes));
    await tester.tap(find.text('打开故事'));
    await tester.pumpAndSettle();
    await tapKey(tester, 'story-attachment-retry-upload');
    final requests = adapter.requests
        .where((r) => r.path == attachmentPath && r.method == 'POST')
        .toList();
    expect(requests.length, 2);
    expect(requests.last.headers['Idempotency-Key'],
        original.headers['Idempotency-Key']);
    expect(picker.opened, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('正式历史只显示该版本引用附件并经受控接口下载', (tester) async {
    final picker = usePicker();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/submissions')) {
        return envelope({
          'items': [historySummary(id: nextSubmissionId, number: 2)],
          'next_cursor': null
        });
      }
      if (r.path.endsWith('/submissions/$nextSubmissionId')) {
        final result = submissionVersion();
        result['submission']['template_snapshot'] = template(attachment: true);
        result['submission']
            ['answers'] = {'story': '旧正式故事', 'proof': attachmentId};
        return envelope(result);
      }
      if (r.path == attachmentPath) {
        return envelope({
          'items': [
            attachment(),
            attachment(id: nextAttachmentId, name: '本人尚未提交.txt')
          ],
          'next_cursor': null
        });
      }
      if (r.path.endsWith('/content')) {
        return ResponseBody.fromBytes(attachmentBytes, 200, headers: {
          Headers.contentTypeHeader: ['application/octet-stream']
        });
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
    await tapKey(tester, 'story-attachment-download-$attachmentId');
    expect(picker.saved.single, orderedEquals(attachmentBytes));
    expect(find.text('本人尚未提交.txt'), findsNothing);
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
    expect(find.byKey(const ValueKey('story-attachment-revoke-$attachmentId')),
        findsNothing);
    expect(adapter.requests.last.headers['X-Acting-Party'], personId);
    expect(tester.takeException(), isNull);
  });
}
