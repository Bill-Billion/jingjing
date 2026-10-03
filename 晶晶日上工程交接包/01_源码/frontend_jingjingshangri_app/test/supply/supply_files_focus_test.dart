import 'dart:async';
import 'package:file_picker/file_picker.dart';
import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/supply/supply_api.dart';
import 'package:jingjingshangri_app/supply/supply_files.dart';
import '../account/fake_account_api.dart';
import '../contracts/contract_fixtures.dart' show contractSession;
import 'supply_fixtures.dart';

class _Picker extends FilePickerPlatform {
  _Picker(this.open);
  final Future<FilePickerResult?> Function() open;
  @override
  Future<FilePickerResult?> pickFiles({
    String? dialogTitle,
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
    bool cancelUploadOnWindowBlur = true,
  }) =>
      open();
}

class _Host extends StatefulWidget {
  const _Host(
      {required this.api,
      required this.terms,
      required this.platform,
      required this.mcn});
  final SupplyApi api;
  final TextEditingController terms, platform, mcn;
  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  List<String> ids = [];
  @override
  Widget build(BuildContext context) => MaterialApp(
          home: Scaffold(
              body: Column(children: [
        TextField(
            controller: widget.terms,
            decoration: const InputDecoration(labelText: '条款')),
        TextField(
            controller: widget.platform,
            decoration: const InputDecoration(labelText: '平台费用')),
        TextField(
            controller: widget.mcn,
            decoration: const InputDecoration(labelText: 'MCN 分成')),
        SupplyFiles(
            api: widget.api,
            purpose: 'RIGHTS_EVIDENCE',
            ids: ids,
            onChanged: (value) => setState(() => ids = value)),
      ])));
}

void main() {
  for (final cancelled in [false, true]) {
    testWidgets(
        cancelled ? '取消选择文件后保持最后编辑值，且不提交上传' : '选择器开启前结束文本编辑，真实上传回执后保留全部表单值',
        (tester) async {
      final oldPicker = FilePickerPlatform.instance;
      addTearDown(() => FilePickerPlatform.instance = oldPicker);
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(
          handler: (r) => r.path == '/api/v1/supply/assets' ||
                  r.path == '/api/v1/supply/assets/$assetId'
              ? envelope(assetData(purpose: 'RIGHTS_EVIDENCE'))
              : adapter.defaultReply(r));
      final session = (await tester.runAsync(() => contractSession(adapter)))!;
      final terms = TextEditingController(),
          platform = TextEditingController(),
          mcn = TextEditingController();
      addTearDown(terms.dispose);
      addTearDown(platform.dispose);
      addTearDown(mcn.dispose);
      final selected = Completer<FilePickerResult?>();
      var opened = false;
      bool? editingAttachedAtOpen;
      String? valueAtOpen;
      FilePickerPlatform.instance = _Picker(() async {
        opened = true;
        editingAttachedAtOpen = tester.testTextInput.hasAnyClients;
        valueAtOpen = mcn.text;
        return selected.future;
      });
      await tester.pumpWidget(_Host(
          api: SupplyApi(session), terms: terms, platform: platform, mcn: mcn));
      await tester.enterText(find.widgetWithText(TextField, '条款'), '本次双方直接合作');
      await tester.enterText(find.widgetWithText(TextField, '平台费用'), '20');
      await tester.enterText(find.widgetWithText(TextField, 'MCN 分成'), '5');
      expect(tester.testTextInput.hasAnyClients, true);
      // Keep the current editing connection active while initiating upload.
      await tester.tap(find.widgetWithText(OutlinedButton, '选择并上传文件'));
      await tester.pump();
      await tester.pump();
      expect(opened, true);
      expect(editingAttachedAtOpen, false,
          reason: '平台文件输入获得焦点之前须关闭旧 Flutter 编辑连接');
      expect(valueAtOpen, '5');
      selected.complete(cancelled
          ? null
          : FilePickerResult([
              PlatformFile(
                  name: 'proof.txt',
                  size: bytes.length,
                  readStream: Stream.value(bytes))
            ]));
      for (var i = 0; i < 12; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(terms.text, '本次双方直接合作');
      expect(platform.text, '20');
      expect(mcn.text, '5');
      final uploads = adapter.requests.where(
          (r) => r.method == 'POST' && r.path == '/api/v1/supply/assets');
      expect(uploads.length, cancelled ? 0 : 1);
      if (!cancelled) {
        expect(find.textContaining('私有文件已上传'), findsOneWidget);
        expect(uploads.single.headers['X-Acting-Party'], orgId);
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}
