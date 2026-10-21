import 'package:flutter/material.dart';
import 'account/account_theme.dart';
import 'artists/artists_pages.dart';
import 'artists/artists_forms.dart';
import 'account/account_page.dart';
import 'contracts/contract_page.dart';
import 'supply/supply_page.dart';
import 'supply/supply_form.dart';
import 'supply/supply_record.dart';
import 'navigation/app_shell.dart';
import 'customization/customization_page.dart';
import 'licensing/license_pages.dart';
import 'licensing/license_forms.dart';
import 'licensing/license_models.dart';
import 'trade/trade_pages.dart';
import 'gigs/gig_pages.dart';
import 'gigs/gig_forms.dart';
import 'production/production_pages.dart';
import 'projects/project_pages.dart';
import 'projects/project_forms.dart';
import 'finance/finance_pages.dart';
import 'finance/finance_forms.dart';
import 'operations/operation_pages.dart';
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
      final storyDetail = RegExp(
        r'^/customization/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
      );
      page = path != null && storyDetail.hasMatch(path)
          ? CustomizationPage(requestId: uri.pathSegments.last)
          : switch (path) {
              '/' || '/home' || '/square' => const AppShell(),
              '/audition' => const AppShell(initialTab: 1),
              '/notices' ||
              '/cultivate' ||
              '/endorsement' ||
              '/talent-academy' =>
                const AppShell(initialTab: 2),
              '/messages' => const AppShell(initialTab: 3),
              '/my' || '/profile' => const AppShell(initialTab: 4),
              '/enter' ||
              '/theater' ||
              '/launch' ||
              '/custom-request' ||
              '/customization/new' =>
                const CustomizationPage(createNew: true),
              '/customization' => const CustomizationPage(),
              '/customization/request' => CustomizationPage(
                  requestId: uri.queryParameters['requestId'] ?? '',
                ),
              '/roles' ||
              '/projects' ||
              '/role-market' ||
              '/project-detail' ||
              '/projects/catalogue' =>
                const ProjectsCataloguePage(),
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
        '/wallet' ||
        '/usage-report' ||
        '/finance' =>
          FinanceAgreementsPage(sourceId: uri.queryParameters['sourceId']),
        '/finance/agreement' => FinanceOverviewPage(
            agreementId: uri.queryParameters['agreementId'] ?? ''),
        '/finance/records' => FinanceRecordsPage(
            agreementId: uri.queryParameters['agreementId'] ?? '',
            kind: uri.queryParameters['kind'] ?? 'SETTLEMENT'),
        '/finance/record' =>
          FinanceRecordPage(recordId: uri.queryParameters['recordId'] ?? ''),
        '/finance/entries' => FinanceEntriesPage(
            agreementId: uri.queryParameters['agreementId'] ?? ''),
        '/finance/payout/new' => FinanceFormPage(
            mode: 'PAYOUT', id: uri.queryParameters['agreementId'] ?? ''),
        '/finance/dispute/new' => FinanceFormPage(
            mode: 'DISPUTE', id: uri.queryParameters['recordId'] ?? ''),
        '/finance/notifications' => const FinanceNotificationsPage(),
        '/identity' || '/my-humans' || '/artists' => const ArtistPeoplePage(),
        '/artists/person' => ArtistPersonPage(personId: uri.queryParameters['personId'] ?? ''),
        '/artists/records' => ArtistRecordsPage(personId: uri.queryParameters['personId'] ?? '', kind: uri.queryParameters['kind'] ?? 'CONSENT'),
        '/artists/record' || '/artists/service' => ArtistRecordPage(personId: uri.queryParameters['personId'] ?? '', recordId: uri.queryParameters['recordId'] ?? ''),
        '/artists/form' => ArtistFormPage(mode: uri.queryParameters['mode'] ?? '', personId: uri.queryParameters['personId'], avatarId: uri.queryParameters['avatarId'], recordId: uri.queryParameters['recordId']),
        '/discover' || '/humans' || '/human-detail' || '/artists/catalog' => const ArtistCataloguePage(),
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
        '/my-projects' => const ProjectsListPage(),
        '/projects/list' => const ProjectsListPage(),
        '/projects/role' =>
          ProjectsCataloguePage(roleId: uri.queryParameters['roleId'] ?? ''),
        '/projects/project' =>
          ProjectRecordPage(recordId: uri.queryParameters['projectId'] ?? ''),
        '/projects/record' =>
          ProjectRecordPage(recordId: uri.queryParameters['recordId'] ?? ''),
        '/projects/apply' => ProjectFormPage(
            mode: 'APPLY', id: uri.queryParameters['roleId'] ?? ''),
        '/projects/invitation' => ProjectFormPage(
            mode: 'INVITATION', id: uri.queryParameters['candidateId'] ?? ''),
        '/projects/release/new' => ProjectFormPage(
            mode: 'RELEASE',
            id: uri.queryParameters['projectId'] ?? '',
            priorId: uri.queryParameters['priorId']),
        '/projects/external/new' => ProjectFormPage(
            mode: 'EXTERNAL', id: uri.queryParameters['releaseId'] ?? ''),
        '/production' =>
          ProductionProjectsPage(orderId: uri.queryParameters['orderId']),
        '/production/project' => ProductionProjectPage(
            projectId: uri.queryParameters['projectId'] ?? ''),
        '/production/version' => ProductionVersionPage(
            versionId: uri.queryParameters['versionId'] ?? ''),
        '/production/feedback' => ProductionVersionPage(
            versionId: uri.queryParameters['versionId'] ?? '',
            feedback: true,
            evidence: args is Map<String, dynamic> ? args : null),
        '/my-works' ||
        '/production/works' =>
          const ProductionProjectsPage(works: true),
        '/production/work' =>
          ProductionWorkPage(projectId: uri.queryParameters['projectId'] ?? ''),
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
        '/operations/notifications' =>
          const OperationsNotificationsPage(),
        '/operations/notification' => OperationsNotificationsPage(
            eventId: int.tryParse(uri.queryParameters['eventId'] ?? '') ?? 0),
        '/operations/comments' => OperationsCommentsPage(
            domain: uri.queryParameters['domain'] ?? '',
            recordId: uri.queryParameters['recordId'] ?? ''),
        '/chat' => const OperationsCommentsEntryPage(),
        '/gigs/notifications' => const GigNotificationsPage(),
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
        '/ai-create' => const AppUnavailablePage(
            title: '生成服务',
            description:
                '生成服务按具体制作项目核对本人同意、用途与原约定。未开通时不会创建演示任务或视频，请从“我的—制作与交付”查看项目。'),
        '/video-lib' ||
        '/video-order' ||
        '/sample-library' ||
        '/sample-order-detail' =>
          const AppUnavailablePage(title: '现成视频',
              description: '现成视频商品、购买许可和已购下载正在接入；定制制作请从“把我的故事拍成片”进入。'),
        '/after-sales' || '/review' => const AppUnavailablePage(
            title: '反馈与售后', description: '制作反馈与售后页面暂未开放。反馈会围绕明确的订单或制作版本办理。'),
        _ => const AppUnknownPage(),
      };
    }
    if (page is AppShell) {
      return AppShellRoute(settings: RouteSettings(
          name: ['/square', '/audition', '/notices', '/messages', '/my'][page.initialTab],
          arguments: settings.arguments), shell: page);
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
