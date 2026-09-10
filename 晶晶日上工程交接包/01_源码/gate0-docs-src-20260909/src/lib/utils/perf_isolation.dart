import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';

/// Gate0 第二根因（首页滚动 Raster 超预算，基线 avg≈28ms）隔离实验台。
///
/// 仅 profile 构建生效；release 下所有 getter 恒为默认值、不分配对象、
/// 零运行时成本（kProfileMode 为编译期常量，分支可被 const 折叠）。
///
/// 两种驱动方式：
/// 1. VM Service 扩展 `ext.flutter.jjsIso?=v`（荣耀抑制三方日志时不可用）；
/// 2. [startAutoCycle]：启动后自动按 15s/变体轮换 V0–V7，用 FrameTiming
///    直采每窗 raster/UI avg/max 并写入 [report]（屏幕标签展示），
///    一轮 8 变体跑完自动回 V0 并停止——不依赖 VM Service / logcat。
///
/// 每个变体语义是「在 V0 基线上只关闭一个因素」，用于把 Raster 掉帧
/// 归因到具体元素。测量收尾后本文件与 main.dart 注册点一并移除。
class PerfIso {
  PerfIso._();

  static final ValueNotifier<int>? _v =
      kProfileMode ? ValueNotifier<int>(0) : null;
  static final ValueNotifier<String>? _report =
      kProfileMode ? ValueNotifier<String>('PerfIso: 待启动') : null;

  /// 当前变体 0..7，release 恒 0。
  static int get variant => _v?.value ?? 0;

  /// 屏幕上展示的测量报告（最近一个完成测量窗的统计）。
  static String get reportText => _report?.value ?? '';

  static void setVariant(int v) {
    final ValueNotifier<int>? notifier = _v;
    if (notifier != null && v != notifier.value) {
      notifier.value = v.clamp(0, 10);
    }
  }

  static void addListener(VoidCallback cb) {
    _v?.addListener(cb);
    _report?.addListener(cb);
  }

  static void removeListener(VoidCallback cb) {
    _v?.removeListener(cb);
    _report?.removeListener(cb);
  }

  // —— 单因素开关：每项相对 V0 基线只改一个因素 ——

  /// V1：全屏流光「流动绘制层」静态化（关掉 14s 无限动画 → 每帧全屏
  /// CustomPaint + 28 模糊光带 + 46 微粒的逐帧重绘消失）。
  static bool get backdropStatic => variant == 1;

  /// V2：首页聚光灯 Banner 整块隐藏（照片+阴影+文字层全部不参与）。
  static bool get noBanner => variant == 2;

  /// V3：艺人卡两层模糊 boxShadow 移除（保留封面/渐变/文字）。
  static bool get noArtistShadows => variant == 3;

  /// V4：艺人卡封面照片替换为品牌渐变占位（隔离大图合成成本）。
  static bool get noArtistPhotos => variant == 4;

  /// V5：Banner 两层模糊 boxShadow 移除。
  static bool get noBannerShadows => variant == 5;

  /// V6：Banner 位图照片替换为渐变占位。
  static bool get noBannerPhoto => variant == 6;

  /// V7：艺人卡底部「透明→黑」渐变遮罩移除。
  static bool get noArtistGradients => variant == 7;

  /// V8：背景流动层 30fps 量化重绘（14s 慢漂移视觉无损，重绘次数减半）。
  static bool get backdropHalfRate => variant == 8;

  /// V9：背景光带/光团冻结相位，仅微粒闪烁（保留生命感，消除逐帧大 fill）。
  static bool get backdropDotsOnly => variant == 9;

  /// V10：位图+场景层离屏烘焙为单纹理，每帧 1 张全屏图 + 微粒（结构性减层）。
  static bool get backdropBaked => variant == 10;

  // —— 自驱实验循环（仅 profile）——
  static const int _periodMs = 15000; // 每变体窗口
  static const int _measureStartMs = 2000; // 切换后前 2s 为重建/预热，不计
  static const int _measureEndMs = 12000; // 2–12s 为测量窗（滚动帧）
  static Timer? _timer;
  static int _cycleStart = 0;
  static bool _windowClosed = true;
  static final List<FrameTiming> _buf = <FrameTiming>[];
  static String _lastResult = '';

  /// 启动自驱轮换（幂等）。一轮跑完自动回 V0 并停止，之后行为与正式包一致。
  static void startAutoCycle() {
    if (!kProfileMode || _timer != null) return;
    SchedulerBinding.instance.addTimingsCallback(_onTimings);
    SchedulerBinding.instance.addPostFrameCallback((_) {
      if (_timer != null) return;
      _cycleStart = DateTime.now().millisecondsSinceEpoch;
      _windowClosed = false;
      _buf.clear();
      _setReport('V0 采集中...');
      _timer = Timer.periodic(const Duration(milliseconds: 200), _tick);
    });
  }

  static void _tick(Timer _) {
    final int elapsed = DateTime.now().millisecondsSinceEpoch - _cycleStart;
    if (!_windowClosed && elapsed >= _measureEndMs) {
      _windowClosed = true;
      _finishWindow();
    }
    if (elapsed >= _periodMs) {
      final int next = (variant + 1) % 11;
      if (next == 0) {
        // 一轮完成：回 V0、停止轮换，实验台不再干预渲染
        _timer?.cancel();
        _timer = null;
        SchedulerBinding.instance.removeTimingsCallback(_onTimings);
        setVariant(0);
        _setReport('PerfIso: 一轮完成，已回 V0（重新冷启动可重跑）');
        return;
      }
      setVariant(next);
      _cycleStart = DateTime.now().millisecondsSinceEpoch;
      _windowClosed = false;
      _buf.clear();
      // 保留上一项结果直到本项完成，避免轮换间隙截图扑空
      _setReport('V$next 采集中...${_lastResult.isEmpty ? '' : ' ｜ $_lastResult'}');
    }
  }

  static void _onTimings(List<FrameTiming> timings) {
    if (_timer == null || _windowClosed) return;
    final int now = DateTime.now().millisecondsSinceEpoch;
    if (now - _cycleStart < _measureStartMs) return;
    _buf.addAll(timings);
  }

  static void _finishWindow() {
    if (_buf.isEmpty) {
      _lastResult = 'V$variant 无帧（窗口内无滚动？）';
      _setReport(_lastResult);
      return;
    }
    int rMax = 0, uMax = 0, rSum = 0, uSum = 0;
    for (final FrameTiming t in _buf) {
      final int r = t.rasterDuration.inMicroseconds;
      final int u = t.buildDuration.inMicroseconds;
      if (r > rMax) rMax = r;
      if (u > uMax) uMax = u;
      rSum += r;
      uSum += u;
    }
    final double rAvg = rSum / _buf.length / 1000.0;
    final double uAvg = uSum / _buf.length / 1000.0;
    final double rMaxMs = rMax / 1000.0;
    final double uMaxMs = uMax / 1000.0;
    _lastResult = 'V$variant: raster avg=${rAvg.toStringAsFixed(1)} '
        'max=${rMaxMs.toStringAsFixed(1)}ms | ui avg=${uAvg.toStringAsFixed(1)} '
        'max=${uMaxMs.toStringAsFixed(1)}ms | n=${_buf.length}';
    _setReport(_lastResult);
    _buf.clear();
  }

  static void _setReport(String s) => _report?.value = s;
}
