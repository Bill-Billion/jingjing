import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import '../production/production_fixtures.dart';
import '../production/production_widgets_test.dart' show reveal;
import '../projects/project_fixtures.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../trade/trade_fixtures.dart';
import 'operation_fixtures.dart';

Future<void> press(WidgetTester t, String label,
    {bool outline = false, bool text = false}) async {
  final f = text
      ? find.widgetWithText(TextButton, label)
      : outline
          ? find.widgetWithText(OutlinedButton, label)
          : find.widgetWithText(FilledButton, label);
  await reveal(t, f);
  await t.tap(f);
  await nav.frames(t);
}

Future<void> type(WidgetTester t, String label, String value) async {
  final f = find.widgetWithText(TextField, label);
  await reveal(t, f);
  await t.enterText(f, value);
  await t.pump();
}

void main() {
  testWidgets('header通知接真实列表，未读/全部和本人已读分开且保留五栏目返回', (t) async {
    final a = operationsAdapter(),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s, route: '/roles');
    expect(find.text('项目通知与留言暂未开放。'), findsNothing);
    nav.expectFiveTabs();
    await t.tap(find.byTooltip('通知'));
    await nav.frames(t);
    expect(find.text('业务通知'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('全部已读'), findsNothing);
    expect(find.text('有新的对象留言'), findsOneWidget);
    await press(t, '标记已读', outline: true);
    expect(find.text('有新的对象留言'), findsNothing);
    await t.tap(find.text('全部'));
    await nav.frames(t);
    expect(find.text('已读'), findsOneWidget);
    await t.tap(find.byType(BackButton));
    await nav.frames(t);
    nav.expectFiveTabs();
    expect(t.takeException(), isNull);
  });
  testWidgets('通知空筛选页带游标显示加载更多，单条详情重读对象后进入当前业务', (t) async {
    var count = 0;
    final a = operationsAdapter(
            override: (r) =>
                r.path == '/api/v1/operations/notifications' && ++count == 1
                    ? envelope({'items': [], 'next_cursor': 8})
                    : null),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s, route: '/messages');
    expect(find.text('本页经过权限或已读筛选后为空，可继续读取更早记录。'), findsOneWidget);
    await press(t, '加载更多', outline: true);
    await press(t, '查看通知详情', outline: true);
    expect(find.text('通知详情'), findsOneWidget);
    expect(find.text('风从海边来'), findsOneWidget);
    final before = a.requests
        .where((r) => r.path == '/api/v1/projects/records/$projectKey')
        .length;
    await press(t, '查看对应业务');
    expect(
        a.requests
            .where((r) => r.path == '/api/v1/projects/records/$projectKey')
            .length,
        greaterThan(before));
    expect(find.text('项目工作区'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('同一对象纯文本回复，不提供附件或运营隐藏；自己的撤回需原因且原文消失', (t) async {
    final literal = '<script>只是纯文本</script>';
    final a = operationsAdapter(initial: [
          commentData(text: literal),
          commentData(
              id: secondCommentKey, status: 'HIDDEN', author: invitationId)
        ]),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s,
        route: '/operations/comments?domain=PROJECTS&recordId=$projectKey');
    expect(find.text(literal), findsOneWidget);
    expect(find.text('这条留言已隐藏。'), findsOneWidget);
    expect(find.text('隐藏留言'), findsNothing);
    expect(find.text('选择并上传文件'), findsNothing);
    await press(t, '撤回我的留言', text: true);
    await reveal(t, find.widgetWithText(FilledButton, '确认撤回'));
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '确认撤回'))
            .onPressed,
        isNull);
    await type(t, '撤回原因', '本人撤回本条说明');
    await press(t, '确认撤回');
    expect(find.text(literal), findsNothing);
    expect(find.text('这条留言已撤回。'), findsOneWidget);
    expect(
        a.requests.lastWhere((r) => r.path == actionPath).headers['If-Match'],
        '"1"');
    expect(t.takeException(), isNull);
  });
  testWidgets('回复只选择同对象可见留言，发送真实body/reply_to并清草稿', (t) async {
    final a = operationsAdapter(),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s,
        route: '/operations/comments?domain=PROJECTS&recordId=$projectKey');
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '发送'))
            .onPressed,
        isNull);
    await press(t, '回复这条', text: true);
    await type(t, '留言说明', '这条是同对象的纯文本回复。');
    await press(t, '发送');
    final r = a.requests
        .lastWhere((r) => r.path == commentsPath && r.method == 'POST');
    expect(r.data, {'body': '这条是同对象的纯文本回复。', 'reply_to': commentKey});
    expect(
        t
            .widget<TextField>(find.widgetWithText(TextField, '留言说明'))
            .controller!
            .text,
        isEmpty);
    await reveal(t, find.text('这条是同对象的纯文本回复。'));
    expect(find.text('这条是同对象的纯文本回复。'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('发送503原请求阻止Back，恢复成功消除旧警告且无重复确认弹窗', (t) async {
    var count = 0;
    final a = operationsAdapter(
            override: (r) =>
                r.path == commentsPath && r.method == 'POST' && ++count == 1
                    ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                        status: 503, error: true)
                    : null),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s,
        route: '/operations/comments?domain=PROJECTS&recordId=$projectKey');
    await type(t, '留言说明', '结果未知的原留言');
    await press(t, '发送');
    expect(s.operationsPending, hasLength(1));
    await t.tap(find.byType(BackButton));
    await t.pump(const Duration(milliseconds: 150));
    expect(find.text('操作结果尚未确认，请先恢复原请求核对。'), findsOneWidget);
    await press(t, '恢复原请求核对');
    expect(s.operationsPending, isEmpty);
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.text('操作结果尚未确认，请先恢复原请求核对。'), findsNothing);
    final posts = a.requests
        .where((r) => r.path == commentsPath && r.method == 'POST')
        .toList();
    expect(posts, hasLength(2));
    expect(posts.last.headers['Idempotency-Key'],
        posts.first.headers['Idempotency-Key']);
    expect(t.takeException(), isNull);
  });
  testWidgets('撤回结果未知先隐藏旧正文；412清除旧撤回选择与原因，重读后重新决定', (t) async {
    for (final status in [503, 412]) {
      await t.pumpWidget(const SizedBox.shrink());
      final a = operationsAdapter(
              override: (r) => r.path == actionPath
                  ? envelope({
                      'code': status == 503
                          ? 'SERVICE_UNAVAILABLE'
                          : 'VERSION_CONFLICT'
                    }, status: status, error: true)
                  : null),
          s = (await t.runAsync(() => buyerSession(a)))!;
      await nav.openApp(t, s,
          route: '/operations/comments?domain=PROJECTS&recordId=$projectKey');
      await press(t, '撤回我的留言', text: true);
      await type(t, '撤回原因', '原撤回决定');
      await press(t, '确认撤回');
      if (status == 503) {
        expect(find.text('请核对音乐的使用范围。'), findsNothing);
        expect(find.text('撤回结果待核实，原正文已暂时隐藏。'), findsOneWidget);
        expect(s.operationsPending, hasLength(1));
      } else {
        expect(s.operationsPending, isEmpty);
        expect(find.widgetWithText(TextField, '撤回原因'), findsNothing);
        expect(find.text('请核对音乐的使用范围。'), findsOneWidget);
      }
      expect(t.takeException(), isNull);
    }
  });
  testWidgets('失权/退出清除私有正文、草稿及恢复依据，留言页320宽可用', (t) async {
    var deny = false;
    final a = operationsAdapter(
            override: (r) => deny && r.path == commentsPath
                ? envelope({'code': 'PARTY_ACTION_FORBIDDEN'},
                    status: 403, error: true)
                : null),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s,
        route: '/operations/comments?domain=PROJECTS&recordId=$projectKey');
    t.view.physicalSize = const Size(320, 844);
    await nav.frames(t);
    await type(t, '留言说明', '私有未提交草稿');
    deny = true;
    await press(t, '刷新留言', outline: true);
    expect(find.text('先确认办事身份'), findsOneWidget);
    expect(find.text('请核对音乐的使用范围。'), findsNothing);
    expect(find.widgetWithText(TextField, '留言说明'), findsNothing);
    expect(s.operationsTargets, isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets('四类已有业务详情都衔接准确对象留言，子页返回保持原详情', (t) async {
    for (final x in [
      ('/trade/record?recordId=$orderId', '订单留言', 'TRADE', orderId),
      (
        '/production/project?projectId=$productionProjectId',
        '项目留言',
        'PRODUCTION',
        productionProjectId
      ),
      (
        '/production/version?versionId=$productionVersionId',
        '版本留言',
        'PRODUCTION',
        productionVersionId
      ),
      ('/projects/record?recordId=$projectKey', '项目留言', 'PROJECTS', projectKey)
    ]) {
      await t.pumpWidget(const SizedBox.shrink());
      final a = operationsAdapter(),
          s = (await t.runAsync(() => buyerSession(a)))!;
      await nav.openApp(t, s, route: x.$1);
      await press(t, x.$2, outline: true);
      expect(find.byType(NavigationBar), findsNothing);
      expect(find.widgetWithText(TextField, '留言说明'), findsOneWidget);
      expect(
          a.requests.any((r) =>
              r.path == '/api/v1/operations/objects/${x.$3}/${x.$4}/comments'),
          true);
      await t.tap(find.byType(BackButton));
      await nav.frames(t);
      expect(find.widgetWithText(TextField, '留言说明'), findsNothing);
      expect(t.takeException(), isNull);
    }
  });
}
