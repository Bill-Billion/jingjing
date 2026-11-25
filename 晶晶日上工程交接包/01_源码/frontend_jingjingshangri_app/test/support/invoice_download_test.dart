import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/support/invoices.dart';
import '../account/fake_account_api.dart';
import '../stock/v5_test_host.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'invoices_test.dart' show invoiceFixture;

class _InvoicePicker extends FilePickerPlatform {
  final saved = <Uint8List>[];
  @override
  Future<String?> saveFile(
      {String? dialogTitle,
      String? fileName,
      String? initialDirectory,
      FileType type = FileType.any,
      List<String>? allowedExtensions,
      Uint8List? bytes,
      bool lockParentWindow = false}) async {
    if (fileName == null || !RegExp(r'\.[a-zA-Z0-9]+$').hasMatch(fileName)) {
      throw ArgumentError('Web file saving requires an extension');
    }
    saved.add(Uint8List.fromList(bytes!));
    return fileName;
  }
}

void main() {
  testWidgets('开票申请材料按保存契约交付原字节，失权后不保存旧内容', (t) async {
    final previous = FilePickerPlatform.instance, picker = _InvoicePicker();
    FilePickerPlatform.instance = picker;
    addTearDown(() => FilePickerPlatform.instance = previous);
    var denied = false;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/invoices/requests/$invitationId') {
        return envelope(invoiceFixture(state: 'NEEDS_INFO', version: 2));
      }
      if (r.path.endsWith('/history')) {
        return envelope({
          'items': [
            {
              'object_version': 1,
              'actor_kind': 'APPLICANT',
              'action': 'SUBMIT',
              'text': '合成申请材料',
              'asset_ids': [orgId],
              'status': 'REQUESTED',
              'amount_minor': 5000,
              'header': invoiceFixture()['header'],
              'created_at': '2026-11-25T00:00:00Z'
            }
          ],
          'next_cursor': null
        });
      }
      if (r.path.endsWith('/documents')) {
        return envelope({'items': [], 'next_cursor': null});
      }
      if (r.path.endsWith('/assets/$orgId/content')) {
        expect(r.headers['X-Acting-Party'], personId);
        if (denied) {
          return envelope({'code': 'INVOICE_NOT_FOUND'},
              status: 404, error: true);
        }
        return ResponseBody.fromBytes([73, 0, 78, 255], 200,
            headers: {
              Headers.contentTypeHeader: ['application/octet-stream']
            });
      }
      return adapter.defaultReply(r);
    });
    await host(t, (await t.runAsync(() => buyerSession(adapter)))!,
        const InvoicePage(invoiceId: invitationId));
    final download = find.textContaining('下载本次材料');
    await reveal(t, download);
    await t.tap(download);
    await frames(t);
    expect(picker.saved, hasLength(1));
    expect(picker.saved.single, [73, 0, 78, 255]);
    denied = true;
    await t.tap(download);
    await frames(t);
    expect(picker.saved, hasLength(1));
    expect(t.takeException(), isNull);
  });
}
