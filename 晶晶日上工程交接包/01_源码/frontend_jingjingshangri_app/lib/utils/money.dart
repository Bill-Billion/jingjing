import 'package:intl/intl.dart';

/// 全局金额工具（唯一入口，禁止在页面里手写 /100 或 toStringAsFixed）。
///
/// 约定（SSOT）：
/// - 后端数据库一律存「分」；
/// - HTTP 边界对前端页面一律返回「元」（human/video/wallet/mcn/endorsement 等）；
/// - 因此页面拿到的金额字段默认都是「元」，统一用 [Money.format]/[Money.rmb] 展示；
/// - fenToYuan/formatFen 仅用于后端明确仍为「分」的少数内部场景；常规 HTTP 字段一律已是「元」。
class Money {
  Money._();

  static final NumberFormat _fmt = NumberFormat('#,##0.00');
  static final NumberFormat _fmtInt = NumberFormat('#,##0');

  /// 容错地把任意值解析为「元」数值。
  static double yuan(dynamic v, {double fallback = 0}) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? fallback;
    return fallback;
  }

  /// 「分」→「元」数值。
  static double fenToYuan(dynamic fen, {double fallback = 0}) {
    if (fen is num) return fen / 100.0;
    if (fen is String) return (double.tryParse(fen) ?? fallback * 100) / 100.0;
    return fallback;
  }

  /// 元 → 千分位两位小数，如 1286.5 → "1,286.50"。
  // 注意：参数不可命名为 yuan，否则会遮蔽同名静态方法 Money.yuan()（历史上曾因此运行期崩溃）。
  static String format(dynamic value, {bool withSign = false}) {
    final n = yuan(value);
    final s = _fmt.format(n);
    if (withSign && n > 0) return '+$s';
    return s;
  }

  /// 元 → 带人民币符号，如 "¥1,286.50"。
  static String rmb(dynamic value, {bool withSign = false}) =>
      '¥${format(value, withSign: withSign)}';

  /// 整数元（无小数），用于热度价签等，如 "¥99"。
  static String rmbInt(dynamic value) {
    final n = yuan(value);
    if (n == n.roundToDouble()) return '¥${_fmtInt.format(n.round())}';
    return rmb(n);
  }

  /// 整数元、无货币符号（千分位、无小数），用于“xx元”口语流程文案，
  /// 如 4901 → "4,901"；非整数回退两位小数 [format]。
  static String formatInt(dynamic value) {
    final n = yuan(value);
    if (n == n.roundToDouble()) return _fmtInt.format(n.round());
    return format(value);
  }

  /// 直接把后端「分」格式化为元字符串（仅用于明确回分的艺人侧接口）。
  static String formatFen(dynamic fen, {bool withSign = false}) =>
      format(fenToYuan(fen), withSign: withSign);

  /// 直接把后端「分」格式化为带符号元。
  static String rmbFen(dynamic fen, {bool withSign = false}) =>
      rmb(fenToYuan(fen), withSign: withSign);
}
