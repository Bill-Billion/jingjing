// 响应式布局回归：把主要页面分别在 360x780（紧凑手机/折叠外屏）与 840x1100（折叠展开）
// 离屏构建并推进若干帧；任何 RenderFlex 越界/无界约束都会让用例失败。demo 数据、不联网。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/widgets/main_scaffold.dart';
import 'package:jingjingshangri_app/pages/humans/humans_page.dart';
import 'package:jingjingshangri_app/pages/projects/projects_page.dart';
import 'package:jingjingshangri_app/pages/orders/orders_page.dart';
import 'package:jingjingshangri_app/pages/wallet/wallet_page.dart';
import 'package:jingjingshangri_app/pages/checkout/checkout_page.dart';
import 'package:jingjingshangri_app/pages/ai_studio/my_works_page.dart';
import 'package:jingjingshangri_app/pages/messages/messages_page.dart';
import 'package:jingjingshangri_app/pages/profile/profile_page.dart';
import 'package:jingjingshangri_app/pages/custom_request/custom_request_page.dart';
import 'package:jingjingshangri_app/pages/identity/identity_page.dart';
import 'package:jingjingshangri_app/pages/role_market/role_market_page.dart';
import 'package:jingjingshangri_app/pages/theater/theater_page.dart';
import 'package:jingjingshangri_app/pages/video_lib/video_lib_page.dart';
import 'package:jingjingshangri_app/pages/talent/academy_page.dart';
import 'package:jingjingshangri_app/pages/profile/settings_page.dart';
import 'package:jingjingshangri_app/pages/my_humans/my_humans_page.dart';
import 'package:jingjingshangri_app/pages/audition/audition_page.dart';
import 'package:jingjingshangri_app/pages/mcn/mcn_page.dart';
import 'package:jingjingshangri_app/pages/after_sales/after_sales_page.dart';
import 'package:jingjingshangri_app/pages/review/review_page.dart';
import 'package:jingjingshangri_app/pages/usage_report/usage_report_page.dart';
import 'package:jingjingshangri_app/pages/video_order/video_order_page.dart';
import 'package:jingjingshangri_app/pages/endorsement/endorsement_page.dart';
import 'package:jingjingshangri_app/pages/sample_library/sample_library_page.dart';
import 'package:jingjingshangri_app/pages/ai_studio/ai_create_page.dart';
import 'package:jingjingshangri_app/pages/launch/launch_page.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';
import 'package:jingjingshangri_app/pages/onboarding/onboarding_page.dart';
import 'package:jingjingshangri_app/pages/human_detail/human_detail_page.dart';
import 'package:jingjingshangri_app/pages/chat/chat_page.dart';
import 'package:jingjingshangri_app/pages/project_detail/project_detail_page.dart';
import 'package:jingjingshangri_app/pages/sample_order_detail/sample_order_detail_page.dart';
import 'package:jingjingshangri_app/pages/script_reader/script_reader_page.dart';
import 'package:jingjingshangri_app/pages/project_brief/project_brief_page.dart';
import 'package:jingjingshangri_app/pages/legal/legal_doc_page.dart';

Future<void> _boot() async {
  SharedPreferences.setMockInitialValues({'connMode': 'demo'});
  await AppMode.instance.load();
  await ApiService().init();
}

Future<UserProvider> _user() async {
  final up = UserProvider();
  await up.saveLogin({
    'token': 'demo-token',
    'user': {'id': 1, 'nickname': '林晚晴', 'phone': '138****6688', 'role': 'user'},
  });
  return up;
}

void main() {
  setUpAll(_boot);

  // 名称 → 构建器（均为不依赖复杂入参的主页面/表单）
  final pages = <String, Widget Function()>{
    'home_tab0': () => const MainScaffold(initialTab: 0),
    'projects_tab1': () => const MainScaffold(initialTab: 1),
    'messages_tab3': () => const MainScaffold(initialTab: 3),
    'profile_tab4': () => const MainScaffold(initialTab: 4),
    'humans': () => const HumansPage(),
    'projects': () => const ProjectsPage(),
    'orders': () => const OrdersPage(),
    'wallet': () => const WalletPage(),
    'checkout': () => const CheckoutPage(
      orderNo: 'DEMO202609040001',
      bizType: 'video',
      title: '基础祝福视频',
      spec: '基础祝福 · 约15秒',
      talentName: '林沐雪',
      amount: 99,
    ),
    'my_works': () => const MyWorksPage(),
    'messages': () => const MessagesPage(),
    'profile': () => const ProfilePage(),
    'custom_request': () => const CustomRequestPage(),
    'identity': () => const IdentityPage(),
    'role_market': () => const RoleMarketPage(),
    'theater': () => const TheaterPage(),
    'video_lib': () => const VideoLibPage(),
    'academy': () => const TalentAcademyPage(),
    'settings': () => const SettingsPage(),
    'my_humans': () => const MyHumansPage(),
    'audition': () => const AuditionPage(),
    'mcn': () => const McnPage(),
    'after_sales': () => const AfterSalesPage(orderNo: 'VD20260824001'),
    'review': () => const ReviewPage(orderNo: 'VD20260824001', talentName: '苏婉儿'),
    'usage_report': () => const UsageReportPage(humanId: 1, humanName: '林沐雪'),
    'video_order': () => const VideoOrderPage(),
    'endorsement': () => const EndorsementPage(),
    'sample_library': () => const SampleLibraryPage(),
    // 第18轮 A7 扩面：补齐深层页 / 冷启动页 / 项目书双版（ai_task、splash 因内置定时器留专项测试）
    'ai_create': () => const AiCreatePage(),
    'launch': () => const LaunchPage(),
    'login': () => const LoginPage(),
    'onboarding': () => const OnboardingPage(),
    'human_detail': () => HumanDetailPage(
          human: const {
            'id': 1,
            'name': '林沐雪',
            'price': 99,
            'minPrice': 99,
            'avgRating': '4.9',
            'sales': 1280,
            'reviewCount': 326,
            'verifiedLevel': 'gold',
            'qualityGrade': 'S',
            'desc': '温柔治愈系数字人，擅长祝福与陪伴口播',
            'localAvatar': 'assets/images/artist_1.jpg',
          },
        ),
    'chat': () => const ChatPage(human: {'id': 1, 'name': '林沐雪'}),
    'project_detail': () => const ProjectDetailPage(project: {
          'title': '黄帝史诗·天下合',
          'type': '古装史诗',
          'status': 'recruiting',
          'seatsClaimed': 72,
          'seatsTotal': 100,
          'clientCount': 318,
          'days': 23,
          'protagonist': '少年轩辕',
          'localCover': 'assets/images/theater_1.jpg',
          'intro': '上古洪荒，群雄并起，少年轩辕集结百家席位于天下合的宏大史诗。',
        }),
    'sample_order_detail': () => const SampleOrderDetailPage(orderId: 1),
    'script_reader': () => const ScriptReaderPage(orderId: 1),
    'brief_order': () => const ProjectBriefPage(isProject: false, source: {
          'orderNo': 'SP20260904001',
          'title': '我的人生剧',
          'genre': '古装史诗',
        }),
    'brief_project': () => const ProjectBriefPage(isProject: true, source: {
          'title': '黄帝史诗·天下合',
          'type': '古装史诗',
          'genre': '华夏史诗',
          'intro': '上古炎黄合盟、涿鹿定鼎，做自己人生的主角。',
          'protagonist': '少年轩辕',
          'roles': 9,
          'seatsTotal': 100,
          'seatsClaimed': 72,
          'days': 23,
        }),
    'legal_doc': () => const LegalDocPage(
          title: '用户服务协议',
          body: '本协议为演示文本，正式版本将在应用上架前补充完整条款与真实联系方式。',
        ),
  };

  for (final spec in [
    ['360', 360.0, 780.0],
    ['840', 840.0, 1100.0],
  ]) {
    final tag = spec[0] as String;
    final w = spec[1] as double, h = spec[2] as double;
    group('布局不溢出 $tag', () {
      for (final entry in pages.entries) {
        testWidgets(entry.key, (t) async {
          t.view.physicalSize = Size(w, h);
          t.view.devicePixelRatio = 1.0;
          addTearDown(t.view.reset);
          final up = await _user();
          await t.pumpWidget(
            ChangeNotifierProvider<UserProvider>.value(
              value: up,
              child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: AppTheme.darkTheme,
                home: entry.value(),
              ),
            ),
          );
          for (var i = 0; i < 6; i++) {
            await t.pump(const Duration(milliseconds: 120));
          }
          // 能走到这里且框架未抛布局异常即通过；再补一帧收尾动画
          await t.pump(const Duration(milliseconds: 200));
        });
      }
    });
  }
}
