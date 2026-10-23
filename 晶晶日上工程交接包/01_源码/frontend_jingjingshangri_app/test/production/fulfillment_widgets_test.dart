import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/editorial_widgets.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import '../trade/trade_api_test.dart' show buyerSession;
import '../trade/trade_fixtures.dart';
import 'production_widgets_test.dart' show reveal;
import 'production_fixtures.dart';
import 'fulfillment_fixtures.dart';

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
    return 'synthetic-final.mp4';
  }
}

void main() {
  for (final refreshFails in [false, true]) {
    testWidgets('最终原片读取保存后刷新履约，刷新失败=$refreshFails 不误报下载失败', (t) async {
      final oldPicker = FilePickerPlatform.instance, picker = _SavingPicker();
      FilePickerPlatform.instance = picker;
      addTearDown(() => FilePickerPlatform.instance = oldPicker);
      var finalRead = false;
      final a = productionAdapter(
              stage: 'FINAL',
              accepted: true,
              paid: true,
              override: (r) {
                if (r.path ==
                    '/api/v1/production/records/$productionProjectId') {
                  return envelope(
                      fulfillmentProjectData(stage: 'FINAL', accepted: true));
                }
                if (r.path.endsWith('/content')) {
                  expect(r.queryParameters['variant'], 'final');
                  finalRead = true;
                  return binaryReply();
                }
                if (r.path.endsWith('/fulfillment')) {
                  if (finalRead) {
                    expect(picker.saves, 1);
                    if (refreshFails) {
                      return envelope({'code': 'SERVICE_UNAVAILABLE'},
                          status: 503, error: true);
                    }
                  }
                  return envelope(fulfillmentData(
                      state: finalRead ? 'DELIVERED' : 'STARTED',
                      version: finalRead ? 5 : 4));
                }
                return null;
              }),
          s = (await t.runAsync(() => buyerSession(a)))!;
      await nav.openApp(t, s,
          route: '/production/work?projectId=$productionProjectId');
      expect(a.requests.where((r) => r.path.endsWith('/content')), isEmpty);
      await reveal(t, find.text('下载当前原片'));
      await t.tap(find.text('下载当前原片'));
      await nav.frames(t);
      final finalIndex =
          a.requests.indexWhere((r) => r.path.endsWith('/content'));
      expect(finalIndex, greaterThanOrEqualTo(0));
      expect(
          a.requests
              .skip(finalIndex + 1)
              .where((r) => r.path.endsWith('/fulfillment')),
          hasLength(1));
      expect(picker.saves, 1);
      await reveal(t, find.text('当前原片已保存。'));
      expect(find.text('当前原片已保存。'), findsOneWidget);
      expect(find.text('保存未完成，请重试本次受控下载。'), findsNothing);
      if (refreshFails) {
        await reveal(t, find.text('履约状态暂未刷新，请重新核对交付条件。'));
        expect(find.text('履约状态暂未刷新，请重新核对交付条件。'), findsOneWidget);
      } else {
        await reveal(t, find.text('正式成片已交付'));
        expect(find.text('正式成片已交付'), findsOneWidget);
        expect(find.text('制作中'), findsNothing);
      }
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('普通买家原项目显示真实履约与原故事入口，不预读最终文件', (t) async {
    final a = fulfillmentAdapter(),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s,
        route: '/production/project?projectId=$productionProjectId');
    expect(find.byType(EditorialFeature), findsOneWidget);
    expect(t.widget<EditorialFeature>(find.byType(EditorialFeature)).title,
        '私人短片制作');
    await reveal(t, find.text('这笔制作不使用可识别人物，普通买家无需先建立或购买自己的数字人。'));
    await reveal(t, find.text('查看订单固定的原故事'));
    await t.tap(find.text('查看订单固定的原故事'));
    await nav.frames(t);
    expect(find.text('故事的原稿'), findsOneWidget);
    expect(find.text('原订单固定的私人故事，不因重填需求而改变。'), findsOneWidget);
    expect(a.requests.where((r) => r.path.endsWith('/content')), isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets('真实读取失败不开放通知已读或明确收讫，不启动计时', (t) async {
    final a = fulfillmentAdapter(
            stage: 'SAMPLE',
            override: (r) => r.path.endsWith('/content')
                ? envelope({'code': 'PRIVATE_CONTENT_MISMATCH'},
                    status: 503, error: true)
                : null),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s,
        route: '/production/version?versionId=$productionVersionId');
    await reveal(t, find.text('播放预览'));
    await t.tap(find.text('播放预览'));
    await nav.frames(t);
    await reveal(t, find.text('确认本次交付通知已读'));
    final read = find.widgetWithText(OutlinedButton, '确认本次交付通知已读');
    expect(t.widget<OutlinedButton>(read).onPressed, isNull);
    final received = find.widgetWithText(FilledButton, '明确确认本次交付已收到');
    expect(t.widget<FilledButton>(received).onPressed, isNull);
    expect(
        a.requests.where((r) =>
            r.path.endsWith('/read') || r.path.endsWith('/delivery-receipt')),
        isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets('成功阅读、通知已读与明确收讫分开，取消确认框不提交计时', (t) async {
    final a = fulfillmentAdapter(viewed: true),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s,
        route: '/production/version?versionId=$productionVersionId');
    await reveal(t, find.text('完整阅读'));
    await t.tap(find.text('完整阅读'));
    await nav.frames(t);
    await t.tap(find.text('返回审阅'));
    await nav.frames(t);
    await reveal(t, find.text('确认本次交付通知已读'));
    await t.tap(find.text('确认本次交付通知已读'));
    await nav.frames(t);
    expect(a.requests.where((r) => r.path.endsWith('/read')).length, 1);
    expect(
        a.requests.where((r) => r.path.endsWith('/delivery-receipt')), isEmpty);
    await reveal(t, find.text('明确确认本次交付已收到'));
    await t.tap(find.text('明确确认本次交付已收到'));
    await nav.frames(t);
    await t.tap(find.text('返回核对'));
    await nav.frames(t);
    expect(
        a.requests.where((r) => r.path.endsWith('/delivery-receipt')), isEmpty);
    await t.tap(find.text('明确确认本次交付已收到'));
    await nav.frames(t);
    await t.tap(find.text('确认办理'));
    await nav.frames(t);
    expect(
        a.requests
            .where((r) => r.path.endsWith('/delivery-receipt'))
            .single
            .headers['If-Match'],
        '"4"');
    expect(find.text('服务器给出的截止时间'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('问题412保留输入与材料，读取最新并明确重核后才用新版本提交', (t) async {
    var writes = 0;
    final a = fulfillmentAdapter(override: (r) {
          if (r.path.endsWith('/cases') && ++writes == 1) {
            return envelope({'code': 'VERSION_CONFLICT'},
                status: 412, error: true);
          }
          if (r.path.endsWith('/fulfillment') && writes > 0) {
            return envelope(fulfillmentData(version: 9));
          }
          return null;
        }),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s,
        route: '/production/aftercare?projectId=$productionProjectId');
    await reveal(t, find.widgetWithText(TextField, '问题说明 · 必填'));
    await t.enterText(
        find.widgetWithText(TextField, '问题说明 · 必填'), '保留原问题与证据关系');
    await nav.frames(t);
    await reveal(t, find.text('提交原项目问题'));
    await t.tap(find.text('提交原项目问题'));
    await nav.frames(t);
    await t.tap(find.text('确认办理'));
    await nav.frames(t);
    expect(find.text('保留原问题与证据关系'), findsOneWidget);
    expect(writes, 1);
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '提交原项目问题'))
            .onPressed,
        isNull);
    await reveal(t, find.text('读取最新状态并保留输入'));
    await t.tap(find.text('读取最新状态并保留输入'));
    await nav.frames(t);
    await reveal(t, find.text('我已核对最新项目，沿用本页说明办理'));
    await t.tap(find.text('我已核对最新项目，沿用本页说明办理'));
    await nav.frames(t);
    await t.tap(find.text('提交原项目问题'));
    await nav.frames(t);
    await t.tap(find.text('确认办理'));
    await nav.frames(t);
    final requests =
        a.requests.where((r) => r.path.endsWith('/cases')).toList();
    expect(requests.length, 2);
    expect(requests.last.headers['If-Match'], '"9"');
    expect(requests.last.data['reason'], '保留原问题与证据关系');
    expect(requests.last.headers['Idempotency-Key'],
        isNot(requests.first.headers['Idempotency-Key']));
    expect(t.takeException(), isNull);
  });
  testWidgets('退款按原项目独立核定余额，跨付款的待核实申请也扣除', (t) async {
    final o = tradeData('ORDER', status: 'PARTIALLY_PAID');
    o['data']['quote']['customization'] = fulfillmentData()['source'];
    o['data']['quote']['lines'][0]['product_profile'] = {
      'version': 'V5',
      'type': 'PRIVATE_CUSTOMIZATION'
    };
    o['data']['quote']['lines'][0]['specification']['customization_delivery'] =
        fulfillmentTerms();
    final other = tradeData('REFUND', status: 'REQUESTED');
    other['data']['payment_id'] = otherVersionId;
    other['data']['amount_minor'] = 1500;
    other['data']['allocations'] = [
      {'line_id': 'production', 'amount_minor': 1500}
    ];
    final a = fulfillmentAdapter(override: (r) {
          if (r.path == '/api/v1/trade/records/$paymentId') {
            return envelope(tradeData('PAYMENT', status: 'SUCCEEDED'));
          }
          if (r.path == '/api/v1/trade/records/$orderId') return envelope(o);
          if (r.path == '/api/v1/trade/records') {
            return envelope({
              'items': r.queryParameters['kind'] == 'REFUND' ? [other] : [],
              'next_cursor': null
            });
          }
          if (r.path.endsWith('/fulfillment')) {
            return envelope(fulfillmentData(cancelled: true));
          }
          return null;
        }),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s, route: '/trade/refund?paymentId=$paymentId');
    await reveal(t, find.text('可申请 ¥5.00'));
    expect(find.text('可申请 ¥5.00'), findsOneWidget);
    expect(a.requests.where((r) => r.path == '/api/v1/trade/refunds'), isEmpty);
    expect(t.takeException(), isNull);
  });
}
