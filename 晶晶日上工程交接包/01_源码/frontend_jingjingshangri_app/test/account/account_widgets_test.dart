import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/account/account_page.dart';
import 'package:jingjingshangri_app/app.dart';
import 'package:jingjingshangri_app/pages/wallet/wallet_page.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';
import 'package:jingjingshangri_app/pages/profile/profile_page.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/utils/auth_guard.dart';
import 'package:jingjingshangri_app/widgets/main_scaffold.dart';
import 'fake_account_api.dart';

Future<void> frames(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> pump(WidgetTester tester, AccountSession session, Widget child,
    {UserProvider? legacy}) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: session),
        ChangeNotifierProvider.value(value: legacy ?? UserProvider()),
      ],
      child: MaterialApp(theme: AppTheme.darkTheme, home: child, routes: {
        '/account': (_) => const AccountPage(),
        '/home': (_) => const MainScaffold(),
        '/enter': (_) => const MainScaffold(initialTab: 1),
        '/cultivate': (_) => const MainScaffold(initialTab: 2),
        '/roles': (_) => const MainScaffold(initialTab: 3),
        '/my': (_) => const MainScaffold(initialTab: 4),
      })));
  await frames(tester);
}

Future<void> close(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(const Duration(seconds: 2));
}

void main() {
  testWidgets('短信503不启动发送成功倒计时，也不进入演示登录', (tester) async {
    final adapter = FakeAccountAdapter(
        handler: (_) =>
            envelope({'code': 'SMS_NOT_READY'}, status: 503, error: true));
    final session = AccountSession(api: adapter.createApi());
    final legacy = UserProvider();
    await pump(tester, session, const LoginPage(), legacy: legacy);
    await tester.enterText(find.byType(TextField).first, '13800000000');
    await tester.pump();
    await tester.tap(find.text('获取验证码'));
    await frames(tester);
    expect(find.textContaining('发送结果未确认'), findsOneWidget);
    expect(find.textContaining('后重发'), findsNothing);
    expect(session.isLoggedIn, isFalse);
    expect(legacy.isLoggedIn, isFalse);
    expect(adapter.requests.single.path, '/api/v1/auth/sms-challenges');
    await close(tester);
  });

  testWidgets('手机号变化使原验证码失效，未获挑战不能登录', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await pump(tester, session, const LoginPage());
    await tester.enterText(find.byType(TextField).first, '13800000000');
    await tester.pump();
    await tester.tap(find.text('获取验证码'));
    await frames(tester);
    expect(find.textContaining('后重发'), findsOneWidget);
    await tester.enterText(find.byType(TextField).first, '13800000001');
    await tester.pump();
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '登录 / 注册'))
            .onPressed,
        isNull);
    expect(adapter.requests.where((r) => r.path.endsWith('/auth/sessions')),
        isEmpty);
    await close(tester);
  });

  testWidgets('未知登录恢复原请求时仍可重试，不因新页面默认未勾选而锁死', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/auth/sessions')
            ? envelope({'code': 'TEMPORARY_FAILURE'}, status: 503, error: true)
            : adapter.defaultReply(r));
    final session = AccountSession(api: adapter.createApi());
    await tester.runAsync(() async {
      try {
        await session.login('13800000000', invitationId, '123456');
      } catch (_) {}
    });
    await pump(tester, session, const LoginPage());
    final button = tester
        .widget<FilledButton>(find.widgetWithText(FilledButton, '登录 / 注册'));
    expect(button.onPressed, isNotNull);
    expect(
        tester
            .widgetList<TextField>(find.byType(TextField))
            .every((field) => field.enabled == false),
        isTrue);
    await tester.tap(find.text('登录 / 注册'));
    await frames(tester);
    final requests = adapter.requests
        .where((r) => r.path.endsWith('/auth/sessions'))
        .toList();
    expect(requests, hasLength(2));
    expect(requests.last.data, requests.first.data);
    expect(requests.last.headers['Idempotency-Key'],
        requests.first.headers['Idempotency-Key']);
    expect(session.isLoggedIn, isFalse);
    await close(tester);
  });

  testWidgets('真实登录进入新版我的并清空旧路由，旧交易和会话不继续', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    final legacy = UserProvider();
    var continued = false;
    await pump(
        tester,
        session,
        Scaffold(
            body: Builder(
                builder: (context) => Center(
                        child: FilledButton(
                      onPressed: () => AuthGuard.ensureLogin(context,
                          onLoggedIn: () => continued = true),
                      child: const Text('旧业务入口'),
                    )))),
        legacy: legacy);
    await tester.tap(find.text('旧业务入口'));
    await frames(tester);
    await tester.enterText(find.byType(TextField).first, '13800000000');
    await tester.pump();
    await tester.tap(find.text('获取验证码'));
    await frames(tester);
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '登录 / 注册'))
            .onPressed,
        isNull);
    await tester.enterText(find.byType(TextField).last, '123456');
    await tester.pump();
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '登录 / 注册'))
            .onPressed,
        isNull);
    await tester.tap(find.byIcon(Icons.radio_button_unchecked_rounded));
    await tester.pump();
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '登录 / 注册'))
            .onPressed,
        isNotNull);
    await tester.tap(find.text('登录 / 注册'));
    await frames(tester);
    expect(session.isLoggedIn, isTrue);
    expect(legacy.isLoggedIn, isFalse);
    expect(continued, isFalse);
    expect(find.byType(LoginPage), findsNothing);
    expect(find.byType(MainScaffold), findsOneWidget);
    expect(find.byType(AccountPage), findsNothing);
    expect(
        ModalRoute.of(tester.element(find.byType(MainScaffold)))?.settings.name,
        '/my');
    expect(find.text('旧业务入口'), findsNothing); // Old private routes are removed.
    expect(find.text('账号与机构'), findsOneWidget);
    expect(continued, isFalse);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('auth_token'), isNull);
    await close(tester);
  });

  testWidgets('我的入口显示新账号、待审核机构及全部五类能力', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await tester
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    await pump(tester, session, const ProfilePage());
    expect(find.text('账号与机构'), findsOneWidget);
    expect(find.text(accountId), findsOneWidget);
    expect(find.text('测试账号'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('角色').first, 200,
        scrollable: find.byType(Scrollable).first);
    await frames(tester);
    expect(find.text('负责人'), findsWidgets);
    expect(find.text('普通成员'), findsNothing);
    await tester.scrollUntilVisible(find.text('申请能力'), 400,
        scrollable: find.byType(Scrollable).first);
    await frames(tester);
    expect(find.text('申请能力'), findsOneWidget);
    expect(find.text('作者'), findsOneWidget);
    expect(find.text('剧本供给方'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('品牌客户'), 250,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('品牌客户'), findsOneWidget);
    expect(find.text('经纪机构'), findsOneWidget);
    expect(find.text('制作方'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await close(tester);
  });

  testWidgets('未确认机构创建锁住原内容，关闭重开仍能重试原键', (tester) async {
    var creates = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/organizations') {
        creates++;
        return creates == 1
            ? envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                status: 503, error: true)
            : envelope({
                'party_id': orgId,
                'current_status': 'PENDING_REVIEW',
                'object_version': 1
              });
      }
      return adapter.defaultReply(r);
    });
    final session = AccountSession(api: adapter.createApi());
    await tester
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    await pump(tester, session, const AccountPage());
    await tester.scrollUntilVisible(find.text('创建机构'), 250,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('创建机构'));
    await frames(tester);
    await tester.enterText(find.byType(TextField), '我的新机构');
    await tester.tap(find.text('提交'));
    await frames(tester);
    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
    expect(find.text('重试原操作'), findsOneWidget);
    await tester.tap(find.text('返回'));
    await frames(tester);
    await tester.tap(find.text('创建机构'));
    await frames(tester);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text,
        '我的新机构');
    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
    await tester.tap(find.text('重试原操作'));
    await frames(tester);
    expect(find.byType(AlertDialog), findsNothing);
    final writes = adapter.requests
        .where((r) => r.path == '/api/v1/organizations')
        .toList();
    expect(writes, hasLength(2));
    expect(writes[0].headers['Idempotency-Key'],
        writes[1].headers['Idempotency-Key']);
    await close(tester);
  });

  testWidgets('接受邀请使用邀请所属机构与原版本，不误用当前机构', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await tester
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    await pump(tester, session, const AccountPage());
    await tester.scrollUntilVisible(find.text('接受'), 400,
        scrollable: find.byType(Scrollable).first);
    await frames(tester);
    await tester.ensureVisible(find.text('接受'));
    await tester.pump();
    await tester.tap(find.text('接受'));
    await frames(tester);
    await tester.tap(find.text('确认'));
    await frames(tester);
    final write =
        adapter.requests.singleWhere((r) => r.path.endsWith('/responses'));
    expect(write.headers['X-Acting-Party'], invitedOrgId);
    expect(write.headers['If-Match'], '"2"');
    expect(write.data, {'decision': 'ACCEPT'});
    expect(session.partyId, orgId);
    await tester.scrollUntilVisible(find.text('移除成员'), 400,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('移除成员'), findsOneWidget); // Owner never has remove button.
    await close(tester);
  });

  testWidgets('邀请弹窗白底，账号或截止时间未填完整时灰置且不发送', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await tester
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    await pump(tester, session, const AccountPage());
    await tester.scrollUntilVisible(find.text('填写账号编号和截止时间'), 400,
        scrollable: find.byType(Scrollable).first);
    await frames(tester);
    await tester.ensureVisible(find.text('填写账号编号和截止时间'));
    await tester.pump();
    await tester.tap(find.text('填写账号编号和截止时间'));
    await frames(tester);
    final context = tester.element(find.byType(AlertDialog));
    expect(Theme.of(context).dialogTheme.backgroundColor, Colors.white);
    FilledButton send() =>
        tester.widget<FilledButton>(find.widgetWithText(FilledButton, '发送邀请'));
    expect(send().onPressed, isNull);
    await tester.enterText(find.byType(TextField), '不是账号编号');
    await tester.pump();
    expect(send().onPressed, isNull);
    await tester.enterText(find.byType(TextField), accountId);
    await tester.pump();
    expect(send().onPressed, isNull);
    expect(
        adapter.requests.where((r) =>
            r.path == '/api/v1/parties/$orgId/invitations' &&
            r.method == 'POST'),
        isEmpty);
    await close(tester);
  });

  testWidgets('未知邀请恢复原内容，即使原截止时间已过仍能原键重试', (tester) async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) =>
            r.path == '/api/v1/parties/$orgId/invitations' && r.method == 'POST'
                ? envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                    status: 503, error: true)
                : adapter.defaultReply(r));
    final session = AccountSession(api: adapter.createApi());
    await tester.runAsync(() async {
      await session.login('13800000000', invitationId, '123456');
      try {
        await session.write('POST', '/api/v1/parties/$orgId/invitations',
            actingParty: orgId,
            body: {
              'invitee_account_id': accountId,
              'expires_at': '2020-01-01T00:00:00.000Z'
            });
      } catch (_) {}
    });
    await pump(tester, session, const AccountPage());
    await tester.scrollUntilVisible(find.text('填写账号编号和截止时间'), 400,
        scrollable: find.byType(Scrollable).first);
    await frames(tester);
    await tester.ensureVisible(find.text('填写账号编号和截止时间'));
    await tester.pump();
    await tester.tap(find.text('填写账号编号和截止时间'));
    await frames(tester);
    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '重试原操作'))
            .onPressed,
        isNotNull);
    await tester.tap(find.text('重试原操作'));
    await frames(tester);
    final requests = adapter.requests
        .where((r) =>
            r.path == '/api/v1/parties/$orgId/invitations' &&
            r.method == 'POST')
        .toList();
    expect(requests, hasLength(2));
    expect(requests.last.data, requests.first.data);
    expect(requests.last.headers['Idempotency-Key'],
        requests.first.headers['Idempotency-Key']);
    await close(tester);
  });

  testWidgets('能力申请未知后刷新出现待审，仍可重试原申请再开放其他能力', (tester) async {
    var writes = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/capabilities')) {
        writes++;
        return writes == 1
            ? envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                status: 503, error: true)
            : envelope({
                'code': 'AUTHOR',
                'current_status': 'PENDING_REVIEW',
                'allowed_actions': []
              });
      }
      if (r.path == '/api/v1/parties/$orgId' && writes > 0) {
        return envelope({
          ...identity(orgId)['party'] as Map<String, dynamic>,
          'capabilities': [
            {'code': 'AUTHOR', 'current_status': 'PENDING_REVIEW'}
          ]
        });
      }
      return adapter.defaultReply(r);
    });
    final session = AccountSession(api: adapter.createApi());
    await tester
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    await pump(tester, session, const AccountPage());
    await tester.scrollUntilVisible(find.text('申请能力'), 400,
        scrollable: find.byType(Scrollable).first);
    await frames(tester);
    await tester.tap(find.text('申请').first);
    await frames(tester);
    await tester.tap(find.byTooltip('刷新'));
    await frames(tester);
    await tester.ensureVisible(find.text('重试原申请'));
    await tester.pump();
    expect(find.text('申请'), findsNothing);
    await tester.tap(find.text('重试原申请'));
    await frames(tester);
    final sent = adapter.requests
        .where((r) => r.path.endsWith('/capabilities'))
        .toList();
    expect(sent, hasLength(2));
    expect(
        sent[0].headers['Idempotency-Key'], sent[1].headers['Idempotency-Key']);
    expect(find.text('重试原申请'), findsNothing);
    expect(find.text('申请'), findsWidgets);
    await close(tester);
  });

  testWidgets('新账号命名路由不能构造旧钱包页面', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await tester
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    final legacy = UserProvider();
    SharedPreferences.setMockInitialValues({});
    await legacy.restore();
    await pump(tester, session, const JingjingShangriApp(), legacy: legacy);
    await frames(tester);
    final nav = tester.state<NavigatorState>(find.byType(Navigator).last);
    nav.pushNamed('/wallet');
    await frames(tester);
    expect(find.byType(WalletPage), findsNothing);
    expect(find.text('先确认办事身份'), findsOneWidget);
    expect(find.text('我的结算'), findsOneWidget);
    await close(tester);
  });

  testWidgets('新账号主导航展示规划入口，退出清空并显示登录', (tester) async {
    final adapter = FakeAccountAdapter();
    final session = AccountSession(api: adapter.createApi());
    await tester
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    await pump(tester, session, const MainScaffold(initialTab: 4));
    await tester.tap(find.text('首页').last);
    await frames(tester);
    expect(find.text('让故事与你有关'), findsOneWidget);
    expect(
        find.descendant(
            of: find.byType(NavigationBar), matching: find.text('入戏')),
        findsOneWidget);
    await tester.tap(find.byKey(const Key('app-tab-4')));
    await frames(tester);
    await tester.tap(find.text('账号与机构'));
    await frames(tester);
    await tester.tap(find.text('退出登录'));
    await frames(tester);
    await tester.tap(find.text('确认'));
    await frames(tester);
    expect(session.isLoggedIn, isFalse);
    expect(find.text(accountId), findsNothing);
    expect(find.text('登录后管理账号与机构'), findsOneWidget);
    expect(find.text('已退出登录。'), findsOneWidget);
    await close(tester);
  });
}
