import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/support/tickets.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;

class _WebContractPicker extends FilePickerPlatform {
  final saved = <Uint8List>[];
  @override
  Future<String?> saveFile({String? dialogTitle, String? fileName,
      String? initialDirectory, FileType type = FileType.any,
      List<String>? allowedExtensions, Uint8List? bytes,
      bool lockParentWindow = false}) async {
    // FilePicker 11 web rejects names without an extension before downloading.
    if (fileName == null || !RegExp(r'\.[a-zA-Z0-9]+$').hasMatch(fileName)) {
      throw ArgumentError('A file extension is required');
    }
    saved.add(Uint8List.fromList(bytes!));
    return fileName;
  }
}

void main() {
  testWidgets('反馈私有材料按文件保存契约下载，拒绝后不得保存旧字节', (t) async {
    final previous = FilePickerPlatform.instance, picker = _WebContractPicker();
    FilePickerPlatform.instance = picker;
    addTearDown(() => FilePickerPlatform.instance = previous);
    var denied = false;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/support/tickets/$personId') {
        return envelope({'id': personId, 'party_id': personId,
          'kind': 'REPORT', 'title': '合成下载核验',
          'current_status': 'ANSWERED', 'object_version': 2});
      }
      if (r.path.endsWith('/history')) {
        return envelope({'items': [{'object_version': 1,
          'actor_kind': 'APPLICANT', 'action': 'SUBMIT',
          'text': '合成原材料', 'asset_ids': [orgId],
          'created_at': '2026-11-25T00:00:00Z'}], 'next_cursor': null});
      }
      if (r.path.endsWith('/assets/$orgId/content')) {
        expect(r.headers['X-Acting-Party'], personId);
        if (denied) return envelope({'code': 'SUPPORT_TICKET_NOT_FOUND'},
            status: 404, error: true);
        return ResponseBody.fromBytes([65, 0, 66, 255], 200,
            headers: {Headers.contentTypeHeader: ['application/octet-stream']});
      }
      return adapter.defaultReply(r);
    });
    await host(t, (await t.runAsync(() => buyerSession(adapter)))!,
        const SupportPage(ticketId: personId));
    final download = find.textContaining('下载本次材料');
    await reveal(t, download);
    await t.tap(download);
    await frames(t);
    expect(picker.saved, hasLength(1));
    expect(picker.saved.single, [65, 0, 66, 255]);
    denied = true;
    await t.tap(download);
    await frames(t);
    expect(picker.saved, hasLength(1));
    expect(t.takeException(), isNull);
  });
}
