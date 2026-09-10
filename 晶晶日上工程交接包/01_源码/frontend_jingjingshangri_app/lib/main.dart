import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'app.dart';
import 'services/api_service.dart';
import 'services/user_provider.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // 单个子树 build 抛错时显示曜石风友好占位，而不是整屏红/灰错误屏，避免一处数据异常拖垮整页
  ErrorWidget.builder = (FlutterErrorDetails details) {
    return Container(
      alignment: Alignment.center,
      padding: const EdgeInsets.all(24),
      decoration: const BoxDecoration(color: AppTheme.surfaceDark),
      child: const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off_rounded, color: AppTheme.cyanSoft, size: 34),
          SizedBox(height: 10),
          Text('这一块暂时没加载出来，稍后再试',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
        ],
      ),
    );
  };
  await ApiService().init();
  runApp(
    ChangeNotifierProvider(
      create: (_) => UserProvider()..restore(),
      child: const JingjingShangriApp(),
    ),
  );
}
