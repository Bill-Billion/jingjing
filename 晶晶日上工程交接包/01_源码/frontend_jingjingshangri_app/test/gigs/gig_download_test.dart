import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import '../production/production_widgets_test.dart' show reveal;
import '../supply/supply_fixtures.dart' show proofId, assetData, bytes;
import '../trade/trade_api_test.dart' show buyerSession;
import 'gig_fixtures.dart';

class _SavingPicker extends FilePickerPlatform {
  int saves = 0;
  @override
  Future<String?> saveFile(
      {String? dialogTitle,
      String? fileName,
      String? initialDirectory,
      FileType type = FileType.any,
      List<String>? allowedExtensions,
      Uint8List? bytes,
      bool lockParentWindow = false}) async {
    saves++;
    return 'synthetic-commercial-proof.bin';
  }
}

void main() {
  for (final denied in ['CONTENT_RESTRICTED', 'GIG_PARTY_FORBIDDEN']) {
    testWidgets('商单材料 $denied 清旧结果并主动恢复', (t) async {
      final old = FilePickerPlatform.instance, picker = _SavingPicker();
      FilePickerPlatform.instance = picker;
      addTearDown(() => FilePickerPlatform.instance = old);
      var blocked = false;
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(handler: (r) {
        if (r.path == '/api/v1/gigs/records/$gigRecordId') {
          return envelope(gigData('GIG'));
        }
        if (r.path == '/api/v1/supply/assets/$proofId') {
          return envelope({
            ...assetData(id: proofId, purpose: 'RIGHTS_EVIDENCE'),
            'owner_party_id': personId
          });
        }
        if (r.path.endsWith('/evidence/$proofId')) {
          if (blocked) {
            return envelope({'code': denied},
                status: denied == 'CONTENT_RESTRICTED' ? 409 : 403,
                error: true);
          }
          return ResponseBody.fromBytes(bytes, 200, headers: {
            Headers.contentTypeHeader: ['application/octet-stream']
          });
        }
        return adapter.defaultReply(r);
      });
      final session = (await t.runAsync(() => buyerSession(adapter)))!;
      await nav.openApp(t, session,
          route: '/gigs/record?recordId=$gigRecordId');
      final button = find.text('下载证明 $proofId');
      Future<void> download() async {
        await reveal(t, button);
        await t.tap(button);
        await nav.frames(t);
      }

      await download();
      expect(picker.saves, 1);
      blocked = true;
      await download();
      for (final scroll
          in t.stateList<ScrollableState>(find.byType(Scrollable))) {
        scroll.position.jumpTo(scroll.position.minScrollExtent);
      }
      await nav.frames(t);
      expect(find.text('文件已准备保存。'), findsNothing);
      expect(
          find.text(denied == 'CONTENT_RESTRICTED'
              ? '材料当前受到限制，暂不能读取。限制解除后可重新读取。'
              : '当前记录权限已失效，私有内容已清空。请重新核对身份。'),
          findsOneWidget);
      expect(picker.saves, 1);
      blocked = false;
      if (denied != 'CONTENT_RESTRICTED') {
        await t.tap(find.text('重新核对权限'));
        await nav.frames(t);
      }
      await download();
      expect(picker.saves, 2);
      expect(t.takeException(), isNull);
    });
  }
}
