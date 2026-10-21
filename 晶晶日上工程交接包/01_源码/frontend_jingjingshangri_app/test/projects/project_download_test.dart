import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import '../production/production_widgets_test.dart' show reveal;
import '../trade/trade_api_test.dart' show buyerSession;
import 'project_fixtures.dart';

class SavingPicker extends FilePickerPlatform {
  bool fail = false;
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
    if (fail) throw PlatformException(code: 'TEST_SAVE_FAILED');
    saves++;
    return 'test-only-material.bin';
  }
}

void main() {
  for (final mode in ['unavailable', 'corrupt', 'save-failed']) {
    testWidgets('项目材料重读 $mode 清旧提示，恢复后可重试', (t) async {
      final old = FilePickerPlatform.instance, picker = SavingPicker();
      FilePickerPlatform.instance = picker;
      addTearDown(() => FilePickerPlatform.instance = old);
      var failing = false;
      final content = Uint8List.fromList([65, 66, 67]);
      final adapter = projectsAdapter(override: (r) {
        if (r.path == '/api/v1/supply/assets/$assetKey') {
          return envelope({
            'id': assetKey,
            'owner_party_id': personId,
            'purpose': 'RIGHTS_EVIDENCE',
            'media_type': 'text/plain',
            'byte_size': content.length,
            'content_sha256': sha256.convert(content).toString(),
            'current_status': 'READY'
          });
        }
        if (r.path.endsWith('/evidence/$assetKey')) {
          if (failing && mode == 'unavailable') {
            return envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true);
          }
          return ResponseBody.fromBytes(
              failing && mode == 'corrupt' ? [65, 66, 68] : content, 200,
              headers: {
                Headers.contentTypeHeader: ['application/octet-stream']
              });
        }
        return null;
      });
      final session = (await t.runAsync(() => buyerSession(adapter)))!;
      await nav.openApp(t, session,
          route: '/projects/record?recordId=$planKey');
      final button = find.textContaining('读取材料 ·');
      Future<void> download() async {
        await reveal(t, button);
        await t.tap(button);
        await nav.frames(t);
      }

      await download();
      await reveal(t, find.text('已按当前权限读取材料。'));
      expect(find.text('已按当前权限读取材料。'), findsOneWidget);
      expect(picker.saves, 1);
      failing = true;
      picker.fail = mode == 'save-failed';
      await download();
      expect(t.takeException(), isNull);
      for (final scroll
          in t.stateList<ScrollableState>(find.byType(Scrollable))) {
        scroll.position.jumpTo(scroll.position.minScrollExtent);
      }
      await nav.frames(t);
      expect(find.text('已按当前权限读取材料。'), findsNothing);
      if (mode == 'save-failed') {
        expect(find.text('文件保存未完成，请检查设备后重试。'), findsOneWidget);
      }
      expect(picker.saves, 1);
      failing = false;
      picker.fail = false;
      await download();
      await reveal(t, find.text('已按当前权限读取材料。'));
      expect(find.text('已按当前权限读取材料。'), findsOneWidget);
      expect(find.text('文件保存未完成，请检查设备后重试。'), findsNothing);
      expect(picker.saves, 2);
      expect(t.takeException(), isNull);
    });
  }
}
