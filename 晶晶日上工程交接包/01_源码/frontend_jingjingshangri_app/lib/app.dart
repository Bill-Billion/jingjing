import 'package:flutter/material.dart';
import 'account/account_theme.dart';
import 'account/account_page.dart';
import 'contracts/contract_page.dart';
import 'supply/supply_page.dart';
import 'supply/supply_form.dart';
import 'supply/supply_record.dart';
import 'navigation/app_shell.dart';
import 'utils/responsive.dart';
import 'pages/login/login_page.dart';
import 'pages/splash/splash_page.dart';
import 'pages/legal/legal_docs.dart';

class JingjingShangriApp extends StatelessWidget {
  const JingjingShangriApp({super.key});

  Route<dynamic> _generate(RouteSettings settings) {
    final uri = Uri.tryParse(settings.name ?? '/');
    final path = uri?.path;
    final args = settings.arguments;
    Widget page;
    // Named navigation is local. A foreign URL is not an authenticated deep link.
    if (uri == null || uri.hasAuthority || uri.hasScheme) {
      page = const AppUnknownPage();
    } else {
      page = switch (path) {
        '/' || '/home' => const AppShell(),
        '/enter' ||
        '/theater' ||
        '/launch' ||
        '/custom-request' =>
          const AppShell(initialTab: 1),
        '/cultivate' ||
        '/mcn' ||
        '/endorsement' ||
        '/talent-academy' =>
          const AppShell(initialTab: 2),
        '/roles' ||
        '/projects' ||
        '/role-market' ||
        '/project-detail' ||
        '/audition' =>
          const AppShell(initialTab: 3),
        '/my' || '/profile' => const AppShell(initialTab: 4),
        '/login' => LoginPage(returnRoute: uri.queryParameters['returnRoute']),
        '/account' => const AccountPage(),
        '/contract' => ContractPage(
            snapshotId: uri.queryParameters['snapshotId'] ??
                (args is Map && args['snapshotId'] is String
                    ? args['snapshotId'] as String
                    : args is String
                        ? args
                        : null)),
        '/supply' => const SupplyPage(),
        '/supply/profile' => SupplyForm(
            work: false, previousId: uri.queryParameters['previousId']),
        '/supply/work/new' =>
          SupplyForm(work: true, previousId: uri.queryParameters['previousId']),
        '/supply/record' =>
          SupplyRecordPage(recordId: uri.queryParameters['recordId'] ?? ''),
        '/settings' => const AppHelpPage(),
        '/agreement' => const AppLegalPage(
            title: '用户协议',
            body: LegalDocs.userAgreement,
            updatedAt: LegalDocs.agreementUpdated),
        '/privacy' => const AppLegalPage(
            title: '隐私政策',
            body: LegalDocs.privacyPolicy,
            updatedAt: LegalDocs.privacyUpdated),
        '/wallet' || '/usage-report' => const AppUnavailablePage(
            title: '我的结算',
            description: '结算与收入查询暂未开放。收付款需要有真实记录与依据，账号资料不会显示为可提现余额。'),
        '/identity' || '/my-humans' => const AppUnavailablePage(
            title: '数字人资料',
            description: '本人脸部、声音与用途授权页面暂未开放。账号身份、本人同意与实名认证是不同事项。'),
        '/humans' || '/human-detail' => const AppUnavailablePage(
            title: '艺人发现', description: '公开人物目录暂未开放。作者及数字人私有材料不会作为公开推荐展示。'),
        '/orders' => const AppUnavailablePage(
            title: '订单与许可', description: '订单与使用许可暂未开放。作品审核通过不代表已购买、获准使用或可以销售。'),
        '/my-projects' => const AppUnavailablePage(
            title: '我的项目', description: '本人参与的项目与发行进度页面暂未开放。你可以先整理作品与权利材料。'),
        '/messages' || '/chat' => const AppUnavailablePage(
            title: '业务通知与留言', description: '订单和项目内的通知、留言暂未开放。这里不会提供通用私信聊天。'),
        '/ai-create' || '/my-works' => const AppUnavailablePage(
            title: '创作工具与历史作品',
            description: '创作任务与历史作品查询暂未开放。作者投稿作品请通过“作者与作品”管理。'),
        '/video-lib' ||
        '/video-order' ||
        '/sample-library' ||
        '/sample-order-detail' =>
          const AppUnavailablePage(
              title: '制作与交付',
              description: '样片与成片页面暂未开放。制作、修改、验收和最终下载会按具体版本与授权条件办理。'),
        '/after-sales' || '/review' => const AppUnavailablePage(
            title: '反馈与售后', description: '制作反馈与售后页面暂未开放。反馈会围绕明确的订单或制作版本办理。'),
        _ => const AppUnknownPage(),
      };
    }
    return MaterialPageRoute<dynamic>(settings: settings, builder: (_) => page);
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: '晶晶日上',
        debugShowCheckedModeBanner: false,
        theme: AccountTheme.data,
        builder: (context, child) =>
            LimitedTextScale(child: child ?? const SizedBox.shrink()),
        onGenerateRoute: _generate,
        // One initial route prevents a delayed root bootstrap from replacing a
        // private deep link. Every child provides its own safe root fallback.
        onGenerateInitialRoutes: (name) => [
          if (name == '/')
            MaterialPageRoute<void>(
                settings: const RouteSettings(name: '/'),
                builder: (_) => const SplashPage())
          else
            _generate(RouteSettings(name: name)),
        ],
        onUnknownRoute: (_) =>
            MaterialPageRoute<void>(builder: (_) => const AppUnknownPage()),
      );
}
