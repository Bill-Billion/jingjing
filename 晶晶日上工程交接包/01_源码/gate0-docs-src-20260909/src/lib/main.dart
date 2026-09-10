import 'dart:convert';
import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'app.dart';
import 'services/api_service.dart';
import 'services/user_provider.dart';
import 'theme/app_theme.dart';
import 'utils/perf_isolation.dart';

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
  if (kProfileMode) {
    // Gate0 隔离实验台：VM Service 扩展（ext.flutter.jjsIso）远程切渲染变体，
    // 用于首页 Raster 第二根因逐元素归因。仅 profile 注册；release 不编译。
    developer.registerExtension('ext.flutter.jjsIso', (method, params) async {
      PerfIso.setVariant(int.tryParse(params['v'] ?? '') ?? 0);
      return developer.ServiceExtensionResponse.result(
        jsonEncode({'ok': true, 'variant': PerfIso.variant}),
      );
    });
    // 荣耀真机抑制三方 logcat、拿不到 VM Service 鉴权码，改用自驱轮换：
    // 首帧后自动 V0–V7 各 15s，FrameTiming 直采统计上屏，一轮后自动停。
    PerfIso.startAutoCycle();
  }
  runApp(
    ChangeNotifierProvider(
      create: (_) => UserProvider()..restore(),
      child: const JingjingShangriApp(),
    ),
  );
}
