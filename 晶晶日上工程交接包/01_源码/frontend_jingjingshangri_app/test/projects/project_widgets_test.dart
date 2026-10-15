import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/projects/project_api.dart';
import 'package:jingjingshangri_app/projects/project_models.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import '../production/production_widgets_test.dart' show reveal;
import '../trade/trade_api_test.dart' show buyerSession;
import 'project_fixtures.dart';

Future<void> readyDecision(WidgetTester t) async {
  await reveal(t, find.byType(CheckboxListTile));
  await t.tap(find.byType(CheckboxListTile));
  await reveal(t, find.widgetWithText(TextField, '确认意见'));
  await t.enterText(find.widgetWithText(TextField, '确认意见'), '已完整核对本版权利与职责。');
  await reveal(t, find.widgetWithText(FilledButton, '同意本版本'));
}

void main() {
  testWidgets('成角真实目录保留五tab；公开角色详情仅摘要且无底栏', (t) async {
    final a = projectsAdapter(), s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s, route: '/roles');
    nav.expectFiveTabs();
    expect(find.text('让好角色找到合适的你'), findsOneWidget);
    await reveal(t, find.text('查看项目'));
    await t.tap(find.text('查看项目'));
    await nav.frames(t);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('角色总名额'), findsOneWidget);
    expect(a.requests.any((r) => r.path == '/api/v1/projects/records/$roleKey'),
        false);
    await t.tap(find.byType(BackButton));
    await nav.frames(t);
    nav.expectFiveTabs();
    expect(
        t.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 3);
    expect(t.takeException(), isNull);
  });
  testWidgets('本人方案确认需要完整阅读及意见，POST后以列表证明准确决定', (t) async {
    final a = projectsAdapter(), s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s, route: '/projects/record?recordId=$planKey');
    expect(find.text('确认当前方案'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    final button = find.widgetWithText(FilledButton, '同意本版本');
    await reveal(t, button);
    expect(t.widget<FilledButton>(button).onPressed, isNull);
    await readyDecision(t);
    expect(t.widget<FilledButton>(button).onPressed, isNotNull);
    await t.tap(button);
    await nav.frames(t);
    await t.tap(find.text('确认办理'));
    await nav.frames(t);
    await reveal(t, find.text('本人已同意本版本。'));
    expect(find.text('本人已同意本版本。'), findsOneWidget);
    expect(
        a.requests
            .where((r) => r.path == confirmPath && r.method == 'GET')
            .length,
        greaterThanOrEqualTo(2));
    expect(t.takeException(), isNull);
  });
  testWidgets('未知结果拦返回，恢复原请求后过时警告消失且本人证据可见', (t) async {
    var writes = 0;
    final a = projectsAdapter(
            override: (r) =>
                r.path == confirmPath && r.method == 'POST' && ++writes == 1
                    ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                        status: 503, error: true)
                    : null),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await t.runAsync(() async {
      try {
        await ProjectsApi(s).confirm(ProjectRecord.parse(projectData('PLAN')),
            ProjectRecord.parse(projectData('PROJECT')), [], 'APPROVED', '原决定');
      } catch (_) {}
    });
    final original = a.requests
        .lastWhere((r) => r.path == confirmPath && r.method == 'POST');
    await nav.openApp(t, s, route: '/projects/record?recordId=$planKey');
    await t.tap(find.byType(BackButton));
    await t.pump(const Duration(milliseconds: 200));
    expect(find.text('操作结果尚未确认，请先恢复原请求核对。'), findsOneWidget);
    expect(s.projectsPending, hasLength(1));
    await reveal(t, find.text('恢复原请求核对'));
    await t.tap(find.text('恢复原请求核对'));
    await nav.frames(t);
    expect(s.projectsPending, isEmpty);
    expect(find.text('操作结果尚未确认，请先恢复原请求核对。'), findsNothing);
    expect(
        a.requests
            .lastWhere((r) => r.path == confirmPath && r.method == 'POST')
            .headers['Idempotency-Key'],
        original.headers['Idempotency-Key']);
    expect(t.takeException(), isNull);
  });
  testWidgets('412重新读取重置阅读与旧意见，不自动重放确认', (t) async {
    var writes = 0;
    final a = projectsAdapter(
            override: (r) =>
                r.path == confirmPath && r.method == 'POST' && ++writes == 1
                    ? envelope({'code': 'VERSION_CONFLICT'},
                        status: 412, error: true)
                    : null),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s, route: '/projects/record?recordId=$planKey');
    await readyDecision(t);
    await t.tap(find.widgetWithText(FilledButton, '同意本版本'));
    await nav.frames(t);
    await t.tap(find.text('确认办理'));
    await nav.frames(t);
    expect(writes, 1);
    await reveal(t, find.byType(CheckboxListTile));
    expect(
        t.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value, false);
    expect(
        t
            .widget<TextField>(find.widgetWithText(TextField, '确认意见'))
            .controller!
            .text,
        isEmpty);
    expect(s.projectsPending, isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets('撤销身份清理已展示私有方案，不以其他身份继续显示', (t) async {
    final a = projectsAdapter(), s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s, route: '/projects/record?recordId=$planKey');
    expect(find.text('六层权利、角色费用与责任按此完整方案办理。'), findsOneWidget);
    s.select(identity(orgId, owner: false));
    await nav.frames(t);
    expect(find.text('六层权利、角色费用与责任按此完整方案办理。'), findsNothing);
    expect(find.text('先确认办事身份'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('外部登记待核验与内部通过分开展示，不称已发行', (t) async {
    final a = projectsAdapter(), s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s, route: '/projects/record?recordId=$releaseKey');
    expect(find.text('发行进度'), findsOneWidget);
    expect(find.text('内部通过，待外部提交'), findsOneWidget);
    await reveal(t, find.text('独立审核中'));
    expect(find.text('外部发行已核实'), findsNothing);
    expect(find.text('已提交'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('参与项目入口与私人制作保留独立路径；发行只用真实渠道列表', (t) async {
    final a = projectsAdapter(
            override: (r) => r.path == '/api/v1/projects/records/$projectKey'
                ? envelope(projectData('PROJECT', status: 'STARTED'))
                : null),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s,
        route: '/projects/release/new?projectId=$projectKey');
    expect(find.text('提交发行材料'), findsOneWidget);
    await reveal(
        t, find.widgetWithText(DropdownButtonFormField<String>, '发行渠道'));
    await t.tap(find.widgetWithText(DropdownButtonFormField<String>, '发行渠道'));
    await nav.frames(t);
    expect(find.text('已核验渠道'), findsWidgets);
    expect(find.byType(NavigationBar), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('申请表单按真实资料和同意选项提交准确报价，不能默认0', (t) async {
    final a = projectsAdapter(), s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s, route: '/projects/apply?roleId=$roleKey');
    final button = find.widgetWithText(FilledButton, '提交报名');
    await reveal(t, button);
    expect(t.widget<FilledButton>(button).onPressed, isNull);
    for (final entry in [('数字人资料', '本人的登记资料'), ('本人同意', '同意 ·')]) {
      final field =
          find.widgetWithText(DropdownButtonFormField<String>, entry.$1);
      await reveal(t, field);
      await t.tap(field);
      await nav.frames(t);
      await t.tap(entry.$1 == '数字人资料'
          ? find.text(entry.$2).last
          : find.textContaining(entry.$2).last);
      await nav.frames(t);
    }
    await reveal(t, find.widgetWithText(TextField, '本次报价（元）'));
    await t.enterText(find.widgetWithText(TextField, '本次报价（元）'), '100.01');
    await reveal(t, find.widgetWithText(TextField, '申请说明'));
    await t.enterText(find.widgetWithText(TextField, '申请说明'), '希望参与当前角色。');
    await reveal(t, button);
    await t.tap(button);
    await nav.frames(t);
    await t.tap(find.text('确认办理'));
    await nav.frames(t);
    final write =
        a.requests.singleWhere((r) => r.path.endsWith('/applications'));
    expect(write.data['amount_minor'], 10001);
    expect(write.data['consent_id'], consentKey);
    expect(write.headers['If-Match'], '"3"');
    expect(find.text('已报名，待筛选'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('入组确认与邀请接受不同，完整约定阅读后确认准确候选hash', (t) async {
    final a = projectsAdapter(), s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s, route: '/projects/record?recordId=$candidateKey');
    await reveal(t, find.byType(CheckboxListTile));
    await t.tap(find.byType(CheckboxListTile));
    await reveal(t, find.widgetWithText(TextField, '确认说明'));
    await t.enterText(find.widgetWithText(TextField, '确认说明'), '本人同意当前角色及报价。');
    await reveal(t, find.widgetWithText(FilledButton, '确认入组'));
    await t.tap(find.widgetWithText(FilledButton, '确认入组'));
    await nav.frames(t);
    await t.tap(find.text('确认办理'));
    await nav.frames(t);
    final r = a.requests.singleWhere((r) => r.path.endsWith('/decisions'));
    expect(r.data['decision'], 'CONFIRM');
    expect(r.data['content_sha256'],
        ProjectRecord.parse(projectData('CANDIDATE')).hash);
    expect(t.takeException(), isNull);
  });
  testWidgets('本人已退出记录仍能读，不强行读取已失权的父项目', (t) async {
    final a = projectsAdapter(
            override: (r) => r.path == '/api/v1/projects/records/$candidateKey'
                ? envelope(projectData('CANDIDATE', status: 'WITHDRAWN'))
                : r.path == '/api/v1/projects/records/$projectKey'
                    ? envelope({'code': 'PROJECT_NOT_FOUND'},
                        status: 404, error: true)
                    : null),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s, route: '/projects/record?recordId=$candidateKey');
    expect(find.text('已退出'), findsOneWidget);
    expect(s.projectsAccessDenied, false);
    expect(
        a.requests.any((r) => r.path == '/api/v1/projects/records/$projectKey'),
        false);
    expect(find.text('退出本次申请'), findsNothing);
    expect(t.takeException(), isNull);
  });
  testWidgets('本人可仅填写说明谢绝邀请，不要求新增资料或同意', (t) async {
    var responded = false;
    final a = projectsAdapter(override: (r) {
          if (r.path.endsWith('/responses')) responded = true;
          if (r.path == '/api/v1/projects/records/$candidateKey' &&
              !responded) {
            final d = projectData('CANDIDATE', status: 'INVITED');
            d['data']['avatar_id'] = null;
            d['data']['consent_id'] = null;
            d['data']['amount_minor'] = null;
            d['content_sha256'] = projectDigest(d['data']);
            return envelope(d);
          }
          return null;
        }),
        s = (await t.runAsync(() => buyerSession(a)))!;
    await nav.openApp(t, s,
        route: '/projects/invitation?candidateId=$candidateKey');
    await reveal(t, find.widgetWithText(TextField, '申请说明'));
    await t.enterText(find.widgetWithText(TextField, '申请说明'), '此次时间安排不合适。');
    final button = find.widgetWithText(OutlinedButton, '谢绝邀请');
    await reveal(t, button);
    await t.tap(button);
    await nav.frames(t);
    await t.tap(find.text('确认办理'));
    await nav.frames(t);
    final request =
        a.requests.singleWhere((r) => r.path.endsWith('/responses'));
    expect(request.data, {
      'decision': 'DECLINE',
      'avatar_id': null,
      'consent_id': null,
      'amount_minor': null,
      'note': '此次时间安排不合适。'
    });
    expect(find.text('已谢绝邀请'), findsOneWidget);
    expect(s.projectsAccessDenied, false);
    expect(t.takeException(), isNull);
  });
}
