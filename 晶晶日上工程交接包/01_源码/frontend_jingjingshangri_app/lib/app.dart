import 'package:flutter/material.dart';
import 'theme/app_theme.dart';
import 'utils/responsive.dart';
import 'utils/motion.dart';
import 'pages/splash/splash_page.dart';
import 'pages/wallet/wallet_page.dart';
import 'pages/identity/identity_page.dart';
import 'pages/orders/orders_page.dart';
import 'pages/mcn/mcn_page.dart';
import 'pages/theater/theater_page.dart';
import 'pages/launch/launch_page.dart';
import 'pages/audition/audition_page.dart';
import 'pages/video_lib/video_lib_page.dart';
import 'pages/role_market/role_market_page.dart';
import 'pages/endorsement/endorsement_page.dart';
import 'pages/profile/settings_page.dart';
import 'pages/chat/chat_page.dart';
import 'pages/usage_report/usage_report_page.dart';
import 'pages/talent/academy_page.dart';
import 'pages/after_sales/after_sales_page.dart';
import 'pages/review/review_page.dart';
import 'pages/sample_library/sample_library_page.dart';
import 'pages/custom_request/custom_request_page.dart';
import 'pages/video_order/video_order_page.dart';
import 'pages/human_detail/human_detail_page.dart';
import 'pages/project_detail/project_detail_page.dart';
import 'pages/sample_order_detail/sample_order_detail_page.dart';
import 'pages/humans/humans_page.dart';
import 'pages/my_humans/my_humans_page.dart';
import 'pages/ai_studio/ai_create_page.dart';
import 'pages/ai_studio/my_works_page.dart';
import 'pages/legal/legal_doc_page.dart';
import 'pages/legal/legal_docs.dart';

class JingjingShangriApp extends StatelessWidget {
  const JingjingShangriApp({super.key});

  Route<dynamic>? _route(Widget page) =>
      Motion.fadeSlideRoute(page);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '晶晶日上',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const SplashPage(),
      // 限制系统字体放大倍数，避免小屏/折叠屏大字体撑破布局
      builder: (context, child) =>
          LimitedTextScale(child: child ?? const SizedBox.shrink()),
      onGenerateRoute: (settings) {
        final args = settings.arguments;
        switch (settings.name) {
          case '/wallet': return _route(const WalletPage());
          case '/identity': return _route(const IdentityPage());
          case '/orders': return _route(const OrdersPage());
          case '/mcn': return _route(const McnPage());
          case '/theater': return _route(const TheaterPage());
          case '/launch': return _route(const LaunchPage());
          case '/audition': return _route(const AuditionPage());
          case '/video-lib': return _route(const VideoLibPage());
          case '/role-market': return _route(const RoleMarketPage());
          case '/endorsement': return _route(EndorsementPage(human: args is Map<String, dynamic> ? args : const {}));
          case '/settings': return _route(const SettingsPage());
          case '/chat': return _route(ChatPage(human: args is Map<String, dynamic> ? args : const {}));
          case '/my-humans': return _route(const MyHumansPage());
          case '/my-works': return _route(const MyWorksPage());
          case '/ai-create': return _route(AiCreatePage(initialKind: args is String ? args : 'image'));
          case '/usage-report': return _route(UsageReportPage(humanId: args is int ? args : 0));
          case '/talent-academy': return _route(const TalentAcademyPage());
          case '/after-sales': return _route(AfterSalesPage(orderNo: args is String ? args : ''));
          case '/review': return _route(ReviewPage(orderNo: args is String ? args : ''));
          case '/sample-library': return _route(SampleLibraryPage(orderId: args is int ? args : null));
          case '/custom-request': return _route(const CustomRequestPage());
          case '/video-order': return _route(VideoOrderPage(human: args is Map<String, dynamic> ? args : const {}));
          case '/human-detail': return _route(HumanDetailPage(human: args is Map<String, dynamic> ? args : const {}));
          case '/project-detail': return _route(ProjectDetailPage(project: args is Map<String, dynamic> ? args : const {}));
          case '/sample-order-detail': return _route(SampleOrderDetailPage(orderId: args is int ? args : 0));
          case '/humans': return _route(const HumansPage());
          case '/agreement':
            return _route(const LegalDocPage(
                title: '用户协议', body: LegalDocs.userAgreement, updatedAt: LegalDocs.agreementUpdated));
          case '/privacy':
            return _route(const LegalDocPage(
                title: '隐私政策', body: LegalDocs.privacyPolicy, updatedAt: LegalDocs.privacyUpdated));
          default: return null;
        }
      },
      // 未知路由兜底，避免遗漏命名路由导致红屏崩溃（转场同样走 Motion 统一风格）
      onUnknownRoute: (settings) => Motion.fadeSlideRoute(
        _UnknownRoutePage(name: settings.name ?? ''),
      ),
    );
  }
}

class _UnknownRoutePage extends StatelessWidget {
  final String name;
  const _UnknownRoutePage({required this.name});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.liquidBase,
      appBar: AppBar(title: const Text('提示')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.construction, size: 48, color: AppTheme.goldMain),
            const SizedBox(height: 12),
            Text('「$name」功能正在建设中', style: const TextStyle(color: AppTheme.textPrimary)),
            const SizedBox(height: 8),
            const Text('正式版将开放，当前为演示版本', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
