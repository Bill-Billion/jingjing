import 'package:file_picker/file_picker.dart';
import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/finance/finance_models.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import '../production/production_widgets_test.dart' show reveal;
import '../supply/supply_fixtures.dart' show assetData, bytes;
import '../trade/trade_api_test.dart' show buyerSession;
import 'finance_fixtures.dart';

class _Picker extends FilePickerPlatform {
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
          bool cancelUploadOnWindowBlur = true}) async =>
      FilePickerResult([
        PlatformFile(
            name: 'bank-info.txt',
            size: bytes.length,
            readStream: Stream.value(bytes))
      ]);
}

Future<void> press(WidgetTester tester, String label) async {
  final finder = label == '已完整阅读本人份额与本版原约定'
      ? find.widgetWithText(CheckboxListTile, label)
      : label == '选择并上传文件'
          ? find.widgetWithText(OutlinedButton, label)
          : label == '我的结算'
              ? find.text(label).last
              : find.widgetWithText(FilledButton, label);
  await reveal(tester, finder);
  await tester.tap(finder);
  await nav.frames(tester);
}

Future<void> input(WidgetTester tester, String label, String text) async {
  final f = find.widgetWithText(TextField, label);
  await reveal(tester, f);
  await tester.enterText(f, text);
  await tester.pump();
}

Future<void> startConfirm(WidgetTester tester) async {
  await press(tester, '已完整阅读本人份额与本版原约定');
  await input(tester, '确认意见', '本人核对后同意。');
  await press(tester, '确认本次结算');
  await tester.tap(find.text('确认办理'));
  await nav.frames(tester);
}

void main() {
  testWidgets('本人结算无全局钱包，320宽负余额/追回应收与真实到账分开', (tester) async {
    final a = financeAdapter(
            override: (r) => r.path.endsWith('/balances')
                ? envelope(financeBalances(paid: 8101, available: 0))
                : null),
        s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s,
        route: '/finance/agreement?agreementId=$agreementKey');
    tester.view.physicalSize = const Size(320, 844);
    await nav.frames(tester);
    await reveal(tester, find.text('本人金额'));
    expect(find.text('-¥1.01'), findsOneWidget);
    expect(find.text('全局余额'), findsNothing);
    await reveal(tester, find.text('待追回'));
    expect(find.text('¥1.01'), findsOneWidget);
    await reveal(tester, find.text('申请付款'));
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '申请付款'))
            .onPressed,
        isNull);
    expect(tester.takeException(), isNull);
  });
  testWidgets('五栏目保留；我的结算子页无底栏，返回我的仍有商单/项目/许可', (tester) async {
    final a = financeAdapter(),
        s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s, route: '/my');
    nav.expectFiveTabs();
    await press(tester, '我的结算');
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('查看本人结算'), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await nav.frames(tester);
    nav.expectFiveTabs();
    await reveal(tester, find.text('我的许可办理'));
    expect(find.text('我的许可办理'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('结算需阅读和本人意见，准确GET确认后展示本人已同意', (tester) async {
    final a = financeAdapter(),
        s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s,
        route: '/finance/record?recordId=$settlementKey');
    await reveal(tester, find.text('确认本次结算'));
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '确认本次结算'))
            .onPressed,
        isNull);
    await startConfirm(tester);
    await reveal(tester, find.text('本人已同意本版本。'));
    expect(find.text('本人已同意本版本。'), findsOneWidget);
    expect(
        a.requests
            .lastWhere(
                (r) => r.method == 'POST' && r.path == financeConfirmPath)
            .data['content_sha256'],
        financeData('SETTLEMENT')['content_sha256']);
    expect(s.financePending, isEmpty);
    expect(tester.takeException(), isNull);
  });
  testWidgets('未知结果拦截Back并保留原请求，恢复确认成功清除过时警告', (tester) async {
    var count = 0;
    final a = financeAdapter(
            override: (r) => r.method == 'POST' &&
                    r.path == financeConfirmPath &&
                    ++count == 1
                ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                    status: 503, error: true)
                : null),
        s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s,
        route: '/finance/record?recordId=$settlementKey');
    await startConfirm(tester);
    expect(s.financePending, hasLength(1));
    await tester.tap(find.byType(BackButton));
    await tester.pump(const Duration(milliseconds: 150));
    expect(find.text('操作结果尚未确认，请先恢复原请求核对。'), findsOneWidget);
    expect(s.financePending, hasLength(1));
    await press(tester, '恢复原请求核对');
    expect(find.text('操作结果尚未确认，请先恢复原请求核对。'), findsNothing);
    expect(s.financePending, isEmpty);
    await reveal(tester, find.text('本人已同意本版本。'));
    expect(find.text('本人已同意本版本。'), findsOneWidget);
    final posts = a.requests
        .where((r) => r.path == financeConfirmPath && r.method == 'POST')
        .toList();
    expect(posts, hasLength(2));
    expect(posts.last.headers['Idempotency-Key'],
        posts.first.headers['Idempotency-Key']);
    expect(find.byType(AlertDialog), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('412重读后取消旧勾选/意见，新的本人决定才使用新版本', (tester) async {
    var newer = false;
    final a = financeAdapter(
            records: (k) => financeData(k, version: newer ? 3 : 2),
            override: (r) {
              if (r.method == 'POST' &&
                  r.path == financeConfirmPath &&
                  !newer) {
                newer = true;
                return envelope({'code': 'PRECONDITION_FAILED'},
                    status: 412, error: true);
              }
              return null;
            }),
        s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s,
        route: '/finance/record?recordId=$settlementKey');
    await startConfirm(tester);
    expect(s.financePending, isEmpty);
    await reveal(tester, find.text('确认本次结算'));
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '确认本次结算'))
            .onPressed,
        isNull);
    expect(
        tester
            .widget<TextField>(find.widgetWithText(TextField, '确认意见'))
            .controller!
            .text,
        isEmpty);
    await startConfirm(tester);
    expect(
        a.requests
            .lastWhere(
                (r) => r.path == financeConfirmPath && r.method == 'POST')
            .headers['If-Match'],
        '"3"');
    expect(tester.takeException(), isNull);
  });
  testWidgets('付款申请批准不冒充实付，真实PAID/RETURNED展示原事实', (tester) async {
    for (final state in ['APPROVED', 'PAID', 'RETURNED']) {
      await tester.pumpWidget(const SizedBox.shrink());
      final a = financeAdapter(
              records: (k) =>
                  financeData(k, status: k == 'PAYOUT' ? state : null)),
          s = (await tester.runAsync(() => buyerSession(a)))!;
      await nav.openApp(tester, s,
          route: '/finance/record?recordId=$payoutKey');
      expect(
          find.text({
            'APPROVED': '申请已获准，尚未核实付款',
            'PAID': '真实付款已核实',
            'RETURNED': '款项退回已核实'
          }[state]!),
          findsOneWidget);
      expect(find.text('取消付款申请'), findsNothing);
      expect(tester.takeException(), isNull);
    }
  });
  testWidgets('关闭异议只读真实处理记录；未决回复走原接口不冒充退款', (tester) async {
    final closed = financeAdapter(
            records: (k) =>
                financeData(k, status: k == 'DISPUTE' ? 'RESOLVED' : null)),
        cs = (await tester.runAsync(() => buyerSession(closed)))!;
    await nav.openApp(tester, cs,
        route: '/finance/record?recordId=$disputeKey');
    await reveal(tester, find.text('补救依据已核实'));
    expect(find.text('补救依据已核实'), findsOneWidget);
    expect(find.widgetWithText(TextField, '回复'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    var saved = false;
    final a = financeAdapter(override: (r) {
          if (r.method == 'POST' && r.path.endsWith('/responses')) {
            saved = true;
            final d = financeData('RESPONSE');
            d['data']['message'] = r.data['message'];
            d['content_sha256'] = financeDigest(d['data']);
            return envelope(d);
          }
          if (r.method == 'GET' &&
              r.path.endsWith('/records') &&
              r.queryParameters['kind'] == 'RESPONSE' &&
              saved) {
            return envelope({
              'items': [financeData('RESPONSE')],
              'next_cursor': null
            });
          }
          return null;
        }),
        s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s, route: '/finance/record?recordId=$disputeKey');
    await input(tester, '回复', '补充本人的实际核对说明。');
    await press(tester, '提交回复');
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    expect(saved, true);
    expect(s.financePending, isEmpty);
    expect(
        a.requests.any((r) => r.path.contains('/trade/') && r.method == 'POST'),
        false);
    expect(tester.takeException(), isNull);
  });
  testWidgets('申请金额不默认，需精确金额/私有资料/备注，真实上传后提交本人申请', (tester) async {
    final old = FilePickerPlatform.instance;
    addTearDown(() => FilePickerPlatform.instance = old);
    FilePickerPlatform.instance = _Picker();
    final a = financeAdapter(override: (r) {
          if (r.path.startsWith('/api/v1/supply/assets')) {
            return envelope({
              ...assetData(id: materialKey, purpose: 'REVIEW_EVIDENCE'),
              'owner_party_id': personId
            });
          }
          if (r.path == financePayoutPath && r.method == 'POST') {
            final d = financeData('PAYOUT');
            d['data'].addAll(Map<String, dynamic>.from(r.data));
            d['content_sha256'] = financeDigest(d['data']);
            return envelope(d);
          }
          return null;
        }),
        s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s,
        route: '/finance/payout/new?agreementId=$agreementKey');
    await reveal(tester, find.widgetWithText(TextField, '申请金额（元）'));
    expect(
        tester
            .widget<TextField>(find.widgetWithText(TextField, '申请金额（元）'))
            .controller!
            .text,
        isEmpty);
    await input(tester, '申请金额（元）', '30.001');
    await input(tester, '备注', '本次真实本人申请。');
    await reveal(tester, find.text('提交付款申请'));
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '提交付款申请'))
            .onPressed,
        isNull);
    await input(tester, '申请金额（元）', '30.00');
    await press(tester, '选择并上传文件');
    await reveal(tester, find.text('提交付款申请'));
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '提交付款申请'))
            .onPressed,
        isNotNull);
    await press(tester, '提交付款申请');
    await tester.tap(find.text('确认办理'));
    await nav.frames(tester);
    expect(find.text('付款申请详情'), findsOneWidget);
    final post = a.requests
        .singleWhere((r) => r.method == 'POST' && r.path == financePayoutPath);
    expect(post.data['amount_minor'], 3000);
    expect(post.data['recipient_party_id'], personId);
    expect(post.data['destination_asset_id'], materialKey);
    expect(post.headers['If-Match'], '"2"');
    expect(tester.takeException(), isNull);
  });
  testWidgets('退出/切换身份立即移除私有结算和未提交意见', (tester) async {
    final a = financeAdapter(),
        s = (await tester.runAsync(() => buyerSession(a)))!;
    await nav.openApp(tester, s,
        route: '/finance/record?recordId=$settlementKey');
    await input(tester, '确认意见', '私有未提交意见');
    await tester.runAsync(() => s.logout());
    await nav.frames(tester);
    expect(find.text('先确认办事身份'), findsOneWidget);
    expect(find.widgetWithText(TextField, '确认意见'), findsNothing);
    expect(find.text('本人结算以本次原始快照为准。'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
