import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/pages/login/login_page.dart';

void main() {
  testWidgets('登录页可正常构建（smoke）', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({'connMode': 'demo'});
    await AppMode.instance.load();
    await ApiService().init();
    await tester.pumpWidget(
      ChangeNotifierProvider<UserProvider>(
        create: (_) => UserProvider(),
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: const LoginPage(),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('登录 / 注册'), findsOneWidget);
  });
}
