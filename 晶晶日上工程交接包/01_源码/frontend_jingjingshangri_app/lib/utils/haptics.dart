import 'package:flutter/services.dart';

/// 全局触觉反馈 SSOT（曜石流光·克制触感）。
///
/// 只使用系统原生 [HapticFeedback]：零音频素材、零新增权限、零包体，
/// 且由操作系统自动遵循用户「系统触感/减弱动态」设置，无需在业务层判断。
///
/// 分层语义（强度递增、严禁滥用，避免震动疲劳）：
/// - [tick]：普通点按（统一挂在 PressScale，按钮/卡片/胶囊点一下的轻 tick）；
/// - [select]：选项切换（分步、Tab、筛选胶囊等状态切换）；
/// - [success]：提交/支付/创建成功的确认触感；
/// - [warn]：表单校验拦截、失败等需要用户察觉的轻警示。
abstract final class Haptics {
  /// 普通点按：最轻的系统 tick。
  static Future<void> tick() => HapticFeedback.selectionClick();

  /// 选项/分步切换：与 tick 同级的轻反馈，语义独立便于后续差异化。
  static Future<void> select() => HapticFeedback.selectionClick();

  /// 成功确认：中等一击。
  static Future<void> success() => HapticFeedback.mediumImpact();

  /// 警示/拦截：轻冲击。
  static Future<void> warn() => HapticFeedback.lightImpact();
}
