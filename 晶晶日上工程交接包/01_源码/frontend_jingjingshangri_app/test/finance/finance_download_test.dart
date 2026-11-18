import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import '../production/production_widgets_test.dart' show reveal;
import '../trade/trade_api_test.dart' show buyerSession;
import 'finance_fixtures.dart';

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
    return 'synthetic-private-file.bin';
  }
}

void main() {
  for (final denied in ['CONTENT_RESTRICTED', 'FINANCE_EVIDENCE_FORBIDDEN']) {
    testWidgets('财务材料 $denied 清除旧成功，主动重读恢复', (t) async {
      final old = FilePickerPlatform.instance, picker = _SavingPicker();
      FilePickerPlatform.instance = picker;
      addTearDown(() => FilePickerPlatform.instance = old);
      var blocked = false;
      final adapter = financeAdapter(override: (r) {
        if (r.path.endsWith('/evidence/$materialKey')) {
          if (blocked) {
            return envelope({'code': denied},
                status: denied == 'CONTENT_RESTRICTED' ? 409 : 403,
                error: true);
          }
          return ResponseBody.fromBytes([65, 66, 67], 200,
              headers: {
                Headers.contentTypeHeader: ['application/octet-stream']
              });
        }
        return null;
      });
      final session = (await t.runAsync(() => buyerSession(adapter)))!;
      await nav.openApp(t, session,
          route: '/finance/record?recordId=$payoutKey');
      final button = find.textContaining('读取材料 ·');
      Future<void> download() async {
        await reveal(t, button);
        await t.tap(button);
        await nav.frames(t);
      }

      await download();
      await reveal(t, find.text('已按当前权限读取材料。'));
      expect(picker.saves, 1);
      blocked = true;
      await download();
      for (final scroll
          in t.stateList<ScrollableState>(find.byType(Scrollable))) {
        scroll.position.jumpTo(scroll.position.minScrollExtent);
      }
      await nav.frames(t);
      expect(find.text('已按当前权限读取材料。'), findsNothing);
      expect(
          find.text(denied == 'CONTENT_RESTRICTED'
              ? '材料当前受到限制，暂不能读取。限制解除后可重新读取。'
              : '记录权限已失效，私有结算内容已清空。请重新核对身份。'),
          findsOneWidget);
      expect(picker.saves, 1);
      blocked = false;
      if (denied != 'CONTENT_RESTRICTED') {
        await t.tap(find.text('重新核对权限'));
        await nav.frames(t);
      }
      await download();
      await reveal(t, find.text('已按当前权限读取材料。'));
      expect(picker.saves, 2);
      expect(t.takeException(), isNull);
    });
  }
}
