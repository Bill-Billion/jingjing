import 'dart:developer' as developer;
import 'package:flutter/foundation.dart';

/// PerfTrace —— Gate 0「性能真相」统一时间线插桩（见 docs/WORKBUDDY_EXECUTION_PROTOCOL.md 第 3 节）。
///
/// 设计纪律：
/// - 只做测量，绝不改变任何业务行为/返回值/时序；
/// - release 包完全 no-op（kReleaseMode 短路，零字符串拼接、零日志开销），不泄漏任何敏感数据；
/// - debug/profile 下同时输出：① 相对 App 起点的毫秒时间戳日志（便于真机 adb logcat 拉时间线）；
///   ② dart:developer Timeline 标记（Flutter DevTools Timeline 可见，可与 UI/Raster 帧对齐）。
///
/// 关键路径统一打点命名：`tab tap` / `page initState` / `request_start`(拦截器) /
/// `request_end`(拦截器，带耗时) / `meaningful frame`，拼出总纲 3.1 的十段时间线。
class PerfTrace {
  PerfTrace._();

  static final Stopwatch _sw = Stopwatch()..start();

  /// 是否采集：release 关闭，debug/profile 开启。
  static bool get enabled => !kReleaseMode;

  /// 自 App 启动起的相对毫秒（与总纲时间线示例口径一致）。
  static int get elapsedMs => _sw.elapsedMilliseconds;

  /// 单点时间戳，例如 PerfTrace.stamp('messages meaningful frame');
  static void stamp(String tag, {String? meta}) {
    if (kReleaseMode) return;
    developer.Timeline.instantSync('PERF $tag');
    final tail = meta == null || meta.isEmpty ? '' : '  $meta';
    debugPrint('[PERF ${elapsedMs.toString().padLeft(5)}ms] $tag$tail');
  }

  /// 一段同步/异步工作的开始（DevTools Timeline 上形成区间，需与 [end] 配对）。
  static void begin(String tag) {
    if (kReleaseMode) return;
    developer.Timeline.startSync('PERF $tag');
  }

  /// 结束最近一次 [begin]。
  static void end() {
    if (kReleaseMode) return;
    developer.Timeline.finishSync();
  }
}
