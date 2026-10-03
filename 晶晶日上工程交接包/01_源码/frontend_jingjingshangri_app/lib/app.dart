import 'package:flutter/material.dart';
import 'account/account_theme.dart';
import 'account/account_page.dart';
import 'contracts/contract_page.dart';
import 'supply/supply_page.dart';
import 'supply/supply_form.dart';
import 'supply/supply_record.dart';
import 'navigation/app_shell.dart';
import 'licensing/license_pages.dart';
import 'licensing/license_forms.dart';
import 'licensing/license_models.dart';
import 'trade/trade_pages.dart';
import 'gigs/gig_pages.dart';
import 'gigs/gig_forms.dart';
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
        '/supply/work/new' => SupplyForm(
            work: true,
            previousId: uri.queryParameters['previousId'],
            bindingId: uri.queryParameters['bindingId']),
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
            description: '出款、提现与税务办理暂未开放。商单佣金核算可从我的业务查看；核算金额不代表到账或可提现余额。'),
        '/identity' || '/my-humans' => const AppUnavailablePage(
            title: '数字人资料',
            description: '本人脸部、声音与用途授权页面暂未开放。账号身份、本人同意与实名认证是不同事项。'),
        '/discover' || '/humans' || '/human-detail' => const GigDiscoveryPage(),
        '/orders' => licenseKinds.containsKey(uri.queryParameters['kind'])
            ? LicenseRecordsPage(kind: uri.queryParameters['kind']!)
            : TradeRecordsPage(kind: uri.queryParameters['kind'] ?? 'ORDER'),
        '/trade' =>
          TradeRecordsPage(kind: uri.queryParameters['kind'] ?? 'ORDER'),
        '/trade/record' => TradeRecordPage(
            recordId: uri.queryParameters['recordId'] ?? '',
            section: uri.queryParameters['section']),
        '/trade/refund' =>
          TradeRefundPage(paymentId: uri.queryParameters['paymentId'] ?? ''),
        '/licensing' => LicenseRecordsPage(
            kind: uri.queryParameters['kind'] ?? 'RESERVATION'),
        '/my-projects' => const LicenseRecordsPage(kind: 'PROJECT'),
        '/licensing/catalog' => const LicenseCatalog(),
        '/licensing/record' =>
          LicenseRecordPage(recordId: uri.queryParameters['recordId'] ?? ''),
        '/licensing/evidence' => LicenseEvidenceForm(
            reservationId: uri.queryParameters['reservationId'] ?? ''),
        '/licensing/project/new' => const LicenseProjectForm(),
        '/licensing/bind' =>
          LicenseBindingForm(grantId: uri.queryParameters['grantId'] ?? ''),
        '/licensing/reading' =>
          LicenseReaderPage(recordId: uri.queryParameters['recordId'] ?? ''),
        '/messages' || '/gigs/notifications' => const GigNotificationsPage(),
        '/chat' => const AppUnavailablePage(
            title: '业务留言', description: '当前不提供通用私信。商单暂停与直接合作结束可在商单通知查看。'),
        '/gigs' => const GigCataloguePage(),
        '/gigs/request' =>
          GigPublicRequestPage(gigId: uri.queryParameters['gigId'] ?? ''),
        '/gigs/requests/new' => const GigRequestForm(),
        '/gigs/offers/new' =>
          GigOfferForm(gigId: uri.queryParameters['gigId'] ?? ''),
        '/gigs/relations/new' => const GigRelationForm(),
        '/mcn' => const GigRecordsPage(kind: 'RELATION'),
        '/gigs/records' => GigRecordsPage(
            kind: uri.queryParameters['kind'] ?? 'GIG',
            gigId: uri.queryParameters['gigId']),
        '/gigs/record' =>
          GigRecordPage(recordId: uri.queryParameters['recordId'] ?? ''),
        '/ranking' ||
        '/rankings' ||
        '/leaderboard' ||
        '/gigs/ranking' =>
          GigRankingPage(recordId: uri.queryParameters['recordId']),
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
    if (page is AppShell) {
      return AppShellRoute(settings: settings, shell: page);
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
