import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/stock/v5_support.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'v5_test_host.dart';

Widget form(V5Api api, {String suffix = '/test', String label = '内容'}) =>
    V5Form(
        api: api,
        title: label,
        action: '提交$label',
        suffix: suffix,
        fields: [V5Field('content', label)],
        buildBody: (values) => {'content': values['content']},
        parse: (_) {});

Future<void> openForms(WidgetTester t, AccountSession session,
    {List<Widget> Function(V5Api)? children}) async {
  t.view.physicalSize = const Size(390, 844);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.reset);
  await t.pumpWidget(ChangeNotifierProvider.value(
      value: session,
      child: MaterialApp(
          home: Builder(
              builder: (context) => Scaffold(
                  body: TextButton(
                      onPressed: () => Navigator.pushNamed(context, '/form'),
                      child: const Text('打开表单')))),
          routes: {
            '/form': (_) => V5Gate(
                domain: 'notices',
                route: '/form',
                builder: (session) {
                  final api = V5Api(session, 'notices');
                  return V5Frame(
                      api: api,
                      title: '业务表单',
                      children: children?.call(api) ?? [form(api)]);
                }),
          })));
  await t.tap(find.text('打开表单'));
  await frames(t);
}

void main() {
  testWidgets('未修改输入直接返回，修改后取消离开保留输入，还原后不再拦截', (t) async {
    final s = (await t.runAsync(() => buyerSession(FakeAccountAdapter())))!;
    await openForms(t, s);
    await t.tap(find.byType(BackButton));
    await frames(t);
    expect(find.text('打开表单'), findsOneWidget);
    await t.tap(find.text('打开表单'));
    await frames(t);
    await t.enterText(find.byType(TextFormField), '尚未提交的内容');
    await frames(t);
    await t.tap(find.byType(BackButton));
    await frames(t);
    expect(find.text('离开当前页面？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    expect(find.text('尚未提交的内容'), findsOneWidget);
    await t.enterText(find.byType(TextFormField), '');
    await frames(t);
    await t.pageBack();
    await frames(t);
    expect(find.text('打开表单'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('系统返回对同页两个脏表单只询问一次，明确放弃后返回', (t) async {
    final s = (await t.runAsync(() => buyerSession(FakeAccountAdapter())))!;
    await openForms(t, s,
        children: (api) => [
              form(api, label: '第一份'),
              form(api, suffix: '/other', label: '第二份')
            ]);
    await t.enterText(find.byType(TextFormField).first, '第一份草稿');
    await t.enterText(find.byType(TextFormField).last, '第二份草稿');
    await frames(t);
    await t.binding.handlePopRoute();
    await frames(t);
    expect(find.byType(AlertDialog), findsOneWidget);
    await t.tap(find.text('放弃填写并离开'));
    await frames(t);
    expect(find.text('打开表单'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('勾选和额外选择也触发保护，恢复初始值后允许离开', (t) async {
    final s = (await t.runAsync(() => buyerSession(FakeAccountAdapter())))!;
    await openForms(t, s,
        children: (api) => [
              V5Form(
                  api: api,
                  title: '选择',
                  action: '提交选择',
                  suffix: '/test',
                  fields: const [V5Field('accepted', '同意条件', type: 'bool')],
                  extra: (values, change, enabled) => [
                        TextButton(
                            onPressed: enabled
                                ? () => change('asset', 'attachment-id')
                                : null,
                            child: const Text('选择附件'))
                      ],
                  buildBody: (v) => v,
                  parse: (_) {})
            ]);
    await t.tap(find.byType(CheckboxListTile));
    await frames(t);
    await t.pageBack();
    await frames(t);
    expect(find.text('离开当前页面？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    await t.tap(find.byType(CheckboxListTile));
    await t.tap(find.text('选择附件'));
    await frames(t);
    await t.pageBack();
    await frames(t);
    expect(find.text('离开当前页面？'), findsOneWidget);
    await t.tap(find.text('放弃填写并离开'));
    await frames(t);
    expect(find.text('打开表单'), findsOneWidget);
  });

  testWidgets('表单滚出屏幕后仍保留输入和离开保护', (t) async {
    final s = (await t.runAsync(() => buyerSession(FakeAccountAdapter())))!;
    await openForms(t, s,
        children: (api) =>
            [form(api), const SizedBox(height: 1800), const Text('页面末尾')]);
    await t.enterText(find.byType(TextFormField), '滚动保留');
    FocusManager.instance.primaryFocus?.unfocus();
    await t.drag(find.byType(ListView), const Offset(0, -1800));
    await frames(t);
    await t.pageBack();
    await frames(t);
    expect(find.text('离开当前页面？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    await t.drag(find.byType(ListView), const Offset(0, 1800));
    await frames(t);
    expect(find.text('滚动保留'), findsOneWidget);
  });

  testWidgets('切换身份清空未提交内容，返回不带上原身份草稿', (t) async {
    final s = (await t.runAsync(() => buyerSession(FakeAccountAdapter())))!;
    await openForms(t, s);
    await t.enterText(find.byType(TextFormField), '个人私有草稿');
    s.select(identity(orgId));
    await frames(t);
    expect(find.text('个人私有草稿'), findsNothing);
    expect(t.widget<TextFormField>(find.byType(TextFormField)).controller!.text,
        '');
    await t.pageBack();
    await frames(t);
    expect(find.text('打开表单'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('无上层页面的深链返回也先确认，确认后回我的', (t) async {
    final s = (await t.runAsync(() => buyerSession(FakeAccountAdapter())))!;
    final api = V5Api(s, 'notices');
    await t.pumpWidget(MaterialApp(
        home: V5Frame(api: api, title: '深链表单', children: [form(api)]),
        routes: {'/my': (_) => const Scaffold(body: Text('我的入口'))}));
    await t.enterText(find.byType(TextFormField), '深链未提交');
    await frames(t);
    await t.tap(find.byType(BackButton));
    await frames(t);
    expect(find.text('我的入口'), findsNothing);
    expect(find.text('离开当前页面？'), findsOneWidget);
    await t.tap(find.text('放弃填写并离开'));
    await frames(t);
    expect(find.text('我的入口'), findsOneWidget);
  });

  testWidgets('更换选择使用同一保护，取消不丢输入，确认不替页面导航', (t) async {
    final s = (await t.runAsync(() => buyerSession(FakeAccountAdapter())))!;
    final key = GlobalKey<V5FormState>();
    await openForms(t, s,
        children: (api) => [
              V5Form(
                  key: key,
                  api: api,
                  title: '选择表单',
                  action: '提交',
                  suffix: '/test',
                  fields: const [V5Field('content', '内容')],
                  buildBody: (v) => v,
                  parse: (_) {})
            ]);
    expect(await key.currentState!.confirmDiscardChanges(), isTrue);
    await t.enterText(find.byType(TextFormField), '切换前保留');
    final first = key.currentState!.confirmDiscardChanges();
    await frames(t);
    expect(find.text('更换当前选择？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    expect(await first, isFalse);
    expect(find.text('切换前保留'), findsOneWidget);
    final second = key.currentState!.confirmDiscardChanges();
    await frames(t);
    await t.tap(find.text('放弃填写并更换'));
    await frames(t);
    expect(await second, isTrue);
    expect(find.text('业务表单'), findsOneWidget);
  });

  testWidgets('离开确认中切身份，不让旧确认关闭新身份表单', (t) async {
    final s = (await t.runAsync(() => buyerSession(FakeAccountAdapter())))!;
    await openForms(t, s);
    await t.enterText(find.byType(TextFormField), '旧身份内容');
    await frames(t);
    await t.pageBack();
    await frames(t);
    s.select(identity(orgId));
    await frames(t);
    await t.tap(find.text('放弃填写并离开'));
    await frames(t);
    expect(find.text('业务表单'), findsOneWidget);
    expect(find.text('旧身份内容'), findsNothing);
    expect(t.widget<TextFormField>(find.byType(TextFormField)).controller!.text,
        '');
  });

  testWidgets('未知写入结果不能放弃，恢复保持正文与幂等键，成功后可离开', (t) async {
    var posts = 0;
    final adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/notices/test') {
        return ++posts == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : envelope({'saved': true});
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(adapter)))!;
    await openForms(t, s);
    await t.enterText(find.byType(TextFormField), '同一份请求');
    await t.tap(find.text('提交内容'));
    await frames(t);
    await t.tap(find.text('确认办理'));
    await frames(t);
    expect(find.text('恢复原请求核对'), findsOneWidget);
    await t.pageBack();
    await frames(t);
    expect(find.text('离开当前页面？'), findsNothing);
    expect(find.text('操作结果尚未确认，请先恢复原请求核对。'), findsOneWidget);
    await t.tap(find.text('恢复原请求核对'));
    await frames(t);
    final writes = adapter.requests
        .where((r) => r.path == '/api/v1/notices/test')
        .toList();
    expect(writes.length, 2);
    expect(writes.last.data, writes.first.data);
    expect(writes.last.headers['Idempotency-Key'],
        writes.first.headers['Idempotency-Key']);
    await t.pageBack();
    await frames(t);
    expect(find.text('打开表单'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
    expect(t.takeException(), isNull);
  });
}
