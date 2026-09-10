// 支付宝进件「App 页面截图」专用 harness：
// ①首页 ②商品/服务页（定制视频下单）③支付页（收银台·支付宝选中）
// 390x844 逻辑尺寸、pixelRatio 2 输出 780x1688 高清 PNG 到 build/shots/alipay/。
// 数据走 demo（MockData），确定性、不联网。
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart' show FontLoader;
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/services/mock_data.dart';
import 'package:jingjingshangri_app/widgets/main_scaffold.dart';
import 'package:jingjingshangri_app/pages/video_order/video_order_page.dart';
import 'package:jingjingshangri_app/pages/checkout/checkout_page.dart';

Future<void> _bootDemo() async {
  SharedPreferences.setMockInitialValues({'connMode': 'demo'});
  await AppMode.instance.load();
  await ApiService().init();
  Future<void> inject(String family, String winPath) async {
    final f = File(winPath);
    if (!f.existsSync()) return;
    final raw = await f.readAsBytes();
    final loader = FontLoader(family);
    loader.addFont(Future<ByteData>.value(raw.buffer.asByteData()));
    await loader.load();
  }

  await inject('Roboto', r'C:\Windows\Fonts\NotoSansSC-VF.ttf');
  await inject('serif', r'C:\Windows\Fonts\NotoSerifSC-VF.ttf');
  await inject('MaterialIcons',
      r'C:\src\flutter\bin\cache\artifacts\material_fonts\materialicons-regular.otf');
}

Future<UserProvider> _loggedInUser() async {
  final up = UserProvider();
  await up.saveLogin({
    'token': 'demo-token',
    'user': {
      'id': 1,
      'nickname': '林晚晴',
      'phone': '138****6688',
      'avatar': '',
      'role': 'user',
    },
  });
  return up;
}

Future<void> _shoot(
  WidgetTester tester,
  String name,
  Widget page, {
  double w = 390,
  double h = 844,
  double pixelRatio = 2.0,
  UserProvider? user,
  int fakePumps = 8,
}) async {
  tester.view.physicalSize = Size(w, h);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final up = user ?? UserProvider();
  await tester.pumpWidget(
    ChangeNotifierProvider<UserProvider>.value(
      value: up,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: RepaintBoundary(child: Scaffold(body: page)),
      ),
    ),
  );

  for (var i = 0; i < fakePumps; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }

  // ① 在真实异步区让 AssetImage 完成解码（首页艺人列表首帧后异步加载，需在此解码）
  await tester
      .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 1300)));
  // ② 解码完成后补帧，让 RawImage 真正用上已解码图像（否则截到解码前的黑块）
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }

  final boundary = tester
      .renderObject(find.byType(RepaintBoundary).first) as RenderRepaintBoundary;
  late Uint8List bytes;
  await tester.runAsync(() async {
    final image = await boundary
        .toImage(pixelRatio: pixelRatio)
        .timeout(const Duration(seconds: 15));
    final data = await image
        .toByteData(format: ui.ImageByteFormat.png)
        .timeout(const Duration(seconds: 15));
    bytes = data!.buffer.asUint8List();
    image.dispose();
  });

  final dir = Directory('build/shots/alipay');
  dir.createSync(recursive: true);
  final file = File('${dir.path}/$name.png');
  file.writeAsBytesSync(bytes);
  // ignore: avoid_print
  print('SHOT ${file.path}  ${(w * pixelRatio).toInt()}x${(h * pixelRatio).toInt()}  ${bytes.length}B');
}

void main() {
  setUpAll(_bootDemo);

  testWidgets('① 首页', (tester) async {
    final up = await _loggedInUser();
    await _shoot(tester, 'alipay_1_home', const MainScaffold(initialTab: 0),
        user: up);
  });

  testWidgets('② 商品/服务页（定制祝福视频下单）', (tester) async {
    final human = Map<String, dynamic>.from(MockData.humanById(101));
    await _shoot(tester, 'alipay_2_service', VideoOrderPage(human: human));
  });

  testWidgets('③ 支付页（收银台·支付宝选中）', (tester) async {
    final human = Map<String, dynamic>.from(MockData.humanById(101));
    await _shoot(
      tester,
      'alipay_3_checkout',
      CheckoutPage(
        orderNo: 'VD20260901008',
        bizType: 'video',
        title: '定制祝福视频·生日祝福',
        spec: '基础祝福 · 约15秒',
        talentName: '林沐雪',
        amount: 99,
        human: human,
      ),
    );
  });
}
