import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/licensing/license_pages.dart';
import 'package:jingjingshangri_app/licensing/license_forms.dart';
import '../account/fake_account_api.dart';
import '../contracts/contract_fixtures.dart';
import 'license_fixtures.dart';
import 'package:jingjingshangri_app/supply/supply_form.dart';
import '../supply/supply_fixtures.dart' as supply;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';

Future<void> frames(WidgetTester t) async {
  for (var i = 0; i < 12; i++) {
    await t.pump(const Duration(milliseconds: 50));
  }
}

Future<void> pump(WidgetTester t, AccountSession s, Widget w) async {
  await t.binding.setSurfaceSize(const Size(390, 844));
  await t.pumpWidget(
      ChangeNotifierProvider.value(value: s, child: MaterialApp(home: w)));
  await frames(t);
}

Future<void> close(WidgetTester t) async {
  await t.pumpWidget(const SizedBox());
  await frames(t);
  await t.binding.setSurfaceSize(null);
}

void main() {
  testWidgets('成员不读目录或私有记录，匿名入口保持新版门禁', (t) async {
    final adapter = FakeAccountAdapter();
    final s = (await t.runAsync(() => contractSession(adapter, owner: false)))!;
    await pump(t, s, const LicenseCatalog());
    expect(find.textContaining('当前成员没有许可办理'), findsOneWidget);
    expect(
        adapter.requests.where((r) => r.path.contains('/licensing/')), isEmpty);
    expect(t.takeException(), isNull);
    await close(t);
  });
  testWidgets('目录只呈现真商品、精确价格，无虚构搜索排序或销量', (t) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/records')
            ? envelope({
                'items': [licenseData('PRODUCT')],
                'next_cursor': null
              })
            : adapter.defaultReply(r));
    final s = (await t.runAsync(() => contractSession(adapter)))!;
    await pump(t, s, const LicenseCatalog());
    expect(find.text('回到那年夏天'), findsOneWidget);
    expect(find.text('¥123.45'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(t.takeException(), isNull);
    s.select(identity(personId));
    await frames(t);
    expect(t.takeException(), isNull);
    await close(t);
  });
  testWidgets('320窄屏放大文字与长商品标题的目录、金额及用途表单无溢出', (t) async {
    final product = licenseData('PRODUCT');
    product['data']['title'] = List.filled(20, '一个需要完整呈现的故事').join();
    product['data']['preview_text'] =
        List.filled(12, '久别重逢的朋友，在暖光旧车站完成一场迟来的告别。').join();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/records')
            ? envelope({
                'items': [product],
                'next_cursor': null
              })
            : r.path.endsWith(productId)
                ? envelope(product)
                : adapter.defaultReply(r));
    final s = (await t.runAsync(() => contractSession(adapter)))!;
    t.platformDispatcher.textScaleFactorTestValue = 1.6;
    addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
    for (final page in [
      const LicenseCatalog(),
      const LicenseRecordPage(recordId: productId),
      const LicenseProjectForm()
    ]) {
      await pump(t, s, page);
      await t.binding.setSurfaceSize(const Size(320, 693));
      await frames(t);
      expect(t.takeException(), isNull);
      await t.drag(find.byType(ListView), const Offset(0, -1500));
      await frames(t);
      expect(t.takeException(), isNull);
    }
    expect(
        adapter.requests
            .where((r) => r.method == 'POST' && r.path.contains('/licensing/')),
        isEmpty);
    await close(t);
  });

  testWidgets('用途项目空表单没有预设用途、国家、语言或集数', (t) async {
    final adapter = FakeAccountAdapter();
    final s = (await t.runAsync(() => contractSession(adapter)))!;
    await pump(t, s, const LicenseProjectForm());
    final scroll = find.byType(Scrollable).first;
    Future<void> show(Finder target) async {
      if (target.evaluate().isEmpty) {
        await t.scrollUntilVisible(target, 180, scrollable: scroll);
      }
      await t.ensureVisible(target);
      await t.pump();
    }

    Finder field(String label, Type type) => find.descendant(
        of: find.byWidgetPredicate((w) =>
            w is Column &&
            w.children.whereType<Text>().any((text) => text.data == label)),
        matching: find.byType(type));
    final title = field('项目名称（必填）', TextField);
    await show(title);
    expect(t.widget<TextField>(title).controller!.text, isEmpty);
    await t.enterText(title, '本次实际项目');
    FocusManager.instance.primaryFocus?.unfocus();
    await t.pump();
    for (final label in ['用途（必选）', '国家或地区（必选）', '语言（必选）']) {
      final picker = field(label, DropdownButtonFormField<String>);
      await show(picker);
      expect(picker, findsOneWidget);
      expect(t.state<FormFieldState<String>>(picker).value, isNull);
    }
    final episodes = field('集数（必填）', TextField);
    await show(episodes);
    expect(t.widget<TextField>(episodes).controller!.text, isEmpty);
    await t.enterText(episodes, '3');
    FocusManager.instance.primaryFocus?.unfocus();
    await t.pump();
    final save = find.widgetWithText(FilledButton, '保存用途项目');
    await show(save);
    expect(t.widget<FilledButton>(save).onPressed, isNull,
        reason: '填了项目名和集数也不可借用默认用途、地区或语言');

    expect(
        adapter.requests.where((r) => r.path.contains('/licensing/')), isEmpty);
    expect(t.takeException(), isNull);
    await close(t);
  });
  testWidgets('受控阅读到期自动清空正文且不提供原稿下载', (t) async {
    late FakeAccountAdapter adapter;
    final until = DateTime.fromMillisecondsSinceEpoch(
            DateTime.now().millisecondsSinceEpoch,
            isUtc: true)
        .add(const Duration(seconds: 2))
        .toIso8601String();
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/content')
            ? envelope({
                'record_id': readingId,
                'watermarked_text': '仅供阅读 | 水印 | $until\n私有正文',
                'allows_generation': false
              })
            : r.path.endsWith(readingId)
                ? envelope(
                    licenseData('READING')..['data']['valid_until'] = until)
                : adapter.defaultReply(r));
    final s = (await t.runAsync(() => contractSession(adapter)))!;
    await pump(t, s, const LicenseReaderPage(recordId: readingId));
    expect(find.textContaining('私有正文'), findsOneWidget);
    expect(find.text('下载原稿'), findsNothing);
    await t.pump(const Duration(seconds: 3));
    expect(find.textContaining('私有正文'), findsNothing);
    expect(find.text('阅稿授权已到期，正文已清空。'), findsOneWidget);
    expect(t.takeException(), isNull);
    await close(t);
  });
  testWidgets('阅读转入后台立即清空，重新激活被撤销后不能恢复旧正文', (t) async {
    var revoked = false;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/content')
            ? envelope({
                'record_id': readingId,
                'watermarked_text': '水印\n私有正文',
                'allows_generation': false
              })
            : r.path.endsWith(readingId)
                ? envelope(licenseData('READING',
                    status: revoked ? 'REVOKED' : 'APPROVED'))
                : adapter.defaultReply(r));
    final s = (await t.runAsync(() => contractSession(adapter)))!;
    await pump(t, s, const LicenseReaderPage(recordId: readingId));
    expect(find.textContaining('私有正文'), findsOneWidget);
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await frames(t);
    expect(find.textContaining('私有正文'), findsNothing);
    revoked = true;
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await frames(t);
    expect(find.textContaining('私有正文'), findsNothing);
    expect(find.textContaining('正文已清空'), findsOneWidget);
    expect(t.takeException(), isNull);
    await close(t);
  });
  testWidgets('后台定时只核对阅稿授权，正文和布局保持，撤销后清空', (t) async {
    var revoked = false;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/content')
            ? envelope({
                'record_id': readingId,
                'watermarked_text': '水印\n私有正文',
                'allows_generation': false
              })
            : r.path.endsWith(readingId)
                ? envelope(licenseData('READING',
                    status: revoked ? 'REVOKED' : 'APPROVED'))
                : adapter.defaultReply(r));
    final s = (await t.runAsync(() => contractSession(adapter)))!;
    await pump(t, s, const LicenseReaderPage(recordId: readingId));
    await t.pump(const Duration(seconds: 31));
    await frames(t);
    expect(find.textContaining('私有正文'), findsOneWidget);
    expect(adapter.requests.where((r) => r.path.endsWith('/content')),
        hasLength(1));
    revoked = true;
    await t.pump(const Duration(seconds: 31));
    await frames(t);
    expect(find.textContaining('私有正文'), findsNothing);
    expect(find.textContaining('正文已清空'), findsOneWidget);
    expect(t.takeException(), isNull);
    await close(t);
  });
  testWidgets('已过开发期的上架商品不能预留，仍可阅读历史条款', (t) async {
    late FakeAccountAdapter adapter;
    final product = licenseData('PRODUCT');
    product['data']['terms']['development_until'] = '2021-01-01T00:00:00.000Z';
    product['data']['terms']['valid_until'] = '2022-01-01T00:00:00.000Z';
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith(productId)
            ? envelope(product)
            : adapter.defaultReply(r));
    final s = (await t.runAsync(() => contractSession(adapter)))!;
    await pump(t, s, const LicenseRecordPage(recordId: productId));
    await t.drag(find.byType(ListView), const Offset(0, -2400));
    await frames(t);
    expect(find.textContaining('商品已过可开发期限'), findsOneWidget);
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '预留这份许可'))
            .onPressed,
        isNull);
    expect(t.takeException(), isNull);
    await close(t);
  });
  testWidgets('项目改稿来源绑定许可，权利人仍为空白，缺ADAPT拒绝打开表单', (t) async {
    var adapt = true;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/supply/records') {
        return envelope({
          'items': [supply.profileData()],
          'next_cursor': null
        });
      }
      if (r.path.endsWith(bindingId)) return envelope(licenseData('BINDING'));
      if (r.path.endsWith(grantId)) {
        final grant = licenseData('GRANT');
        if (!adapt) grant['data']['terms']['rights'] = ['PRODUCE'];
        return envelope(grant);
      }
      if (r.path.endsWith(projectId)) return envelope(licenseData('PROJECT'));
      return adapter.defaultReply(r);
    });
    final s = (await t.runAsync(() => contractSession(adapter)))!;
    await pump(t, s, const SupplyForm(work: true, bindingId: bindingId));
    expect(find.text('投稿项目改稿'), findsOneWidget);
    expect(find.text(productId), findsOneWidget);
    expect(find.text(projectId), findsOneWidget);
    expect(
        t
            .widgetList<TextFormField>(find.byType(TextFormField))
            .every((w) => w.controller!.text.isEmpty),
        isTrue);
    expect(t.takeException(), isNull);
    await close(t);
    adapt = false;
    await pump(t, s, const SupplyForm(work: true, bindingId: bindingId));
    expect(find.byKey(const Key('supply-title')), findsNothing);
    expect(find.text('重新读取原记录'), findsOneWidget);
    expect(t.takeException(), isNull);
    await close(t);
  });
  testWidgets('许可深链接登录后只恢复记录读取，不自动办理预留或绑定', (t) async {
    SharedPreferences.setMockInitialValues({});
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith(productId)
            ? envelope(licenseData('PRODUCT'))
            : adapter.defaultReply(r));
    final session = AccountSession(api: adapter.createApi());
    String? destination;
    await t.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: session),
          ChangeNotifierProvider(create: (_) => UserProvider())
        ],
        child: MaterialApp(
            home: const LicenseRecordPage(recordId: productId),
            onGenerateRoute: (settings) {
              destination = settings.name;
              return MaterialPageRoute(
                  settings: settings,
                  builder: (_) => const LicenseRecordPage(recordId: productId));
            })));
    await frames(t);
    await t.tap(find.text('前往账号与身份'));
    await frames(t);
    expect(find.byType(LoginPage), findsOneWidget);
    await t.enterText(find.byType(TextField).first, '13800000000');
    await frames(t);
    await t.tap(find.text('获取验证码'));
    await frames(t);
    await t.enterText(find.byType(TextField).last, '123456');
    FocusManager.instance.primaryFocus?.unfocus();
    await frames(t);
    final login = find.byType(LoginPage);
    final checkbox =
        find.descendant(of: login, matching: find.byType(Checkbox));
    final form = find.descendant(of: login, matching: find.byType(ListView));
    await t.dragUntilVisible(
        checkbox.hitTestable(), form, const Offset(0, -140),
        maxIteration: 7);
    expect(t.widget<Checkbox>(checkbox).value, isFalse);
    await t.tap(checkbox.hitTestable());
    await frames(t);
    expect(t.widget<Checkbox>(checkbox).value, isTrue);
    final submit = find.widgetWithText(FilledButton, '登录并继续');
    expect(t.widget<FilledButton>(submit).onPressed, isNotNull);
    const original = '/api/v1/licensing/records/$productId';
    expect(adapter.requests.where((r) => r.path == original), isEmpty);
    await t.tap(submit.hitTestable());
    await frames(t);
    final loginRequest = adapter.requests.singleWhere(
        (r) => r.method == 'POST' && r.path == '/api/v1/auth/sessions');
    final recoveredReads = adapter.requests
        .where(
            (r) => r.method == 'GET' && r.path.startsWith('/api/v1/licensing/'))
        .toList();
    expect(recoveredReads, isNotEmpty);
    expect(
        recoveredReads.every((r) =>
            r.path == original &&
            adapter.requests.indexOf(r) >
                adapter.requests.indexOf(loginRequest)),
        isTrue,
        reason: '只在实际登录成功后读取原许可，不访问其他记录');
    expect(destination, '/licensing/record?recordId=$productId');
    expect(find.byType(LoginPage), findsNothing);
    expect(find.text('回到那年夏天'), findsOneWidget);
    expect(
        adapter.requests
            .where((r) => r.method != 'GET' && r.path.contains('/licensing/')),
        isEmpty);
    expect(t.takeException(), isNull);
    await close(t);
  });
  testWidgets('材料权限失效不会让可读许可页面崩溃，旧文件控件不再请求', (t) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith(reserveId)
            ? envelope(licenseData('RESERVATION'))
            : adapter.defaultReply(r));
    final session = (await t.runAsync(() => contractSession(adapter)))!;
    session.denySupply();
    await pump(t, session, const LicenseEvidenceForm(reservationId: reserveId));
    expect(
        find.descendant(
            of: find.byType(AppBar), matching: find.text('提交外部核验材料')),
        findsOneWidget);
    expect(find.textContaining('私有材料权限已失效'), findsWidgets);
    expect(adapter.requests.where((r) => r.path.contains('/supply/assets')),
        isEmpty);
    expect(t.takeException(), isNull);
    await close(t);
  });
}
