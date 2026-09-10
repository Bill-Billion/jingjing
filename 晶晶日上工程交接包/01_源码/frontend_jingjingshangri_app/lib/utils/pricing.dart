/// 定价/固定业务金额 SSOT（对齐项目档案 01《产品与价格单一事实源》A-04/A-07/A-11/A-20/A-21/线④）。
///
/// 规则：
/// - 这里是前端**唯一**允许出现固定金额的地方；页面禁止再手写 ¥99/¥4901 等字面量。
/// - 运行时一律「接口返回值优先，常量兜底」：`Pricing.intentDepositOf(order)`。
/// - 单位全部为「元」（后端 V12.2 起 HTTP 边界统一返回元），禁止再 /100。
class Pricing {
  Pricing._();

  // ── 线① 祝福视频 ──
  /// 艺人自定价下限【A-04】
  static const double videoMinPrice = 99;

  // ── 线② 个人定制剧（普通档两段式）【A-07/A-20/A-21】──
  /// 意向金：统一 ¥99，可退可抵（全站只允许出现这一个意向金数字）
  static const double intentDeposit = 99;

  /// 普通档制作款（定稿后担保，普通档总价 5000 起）
  static const double productionFee = 4901;

  /// 普通档总价起
  static const double standardTotal = 5000;

  /// 彩蛋档（在线直接下单，限量）
  static const double easterEgg = 1000;

  /// 超出免费轮次后的改本费（元/轮，含 2 轮免费）
  static const double extraRevisionFee = 200;

  // ── 线④ 品牌代言/企业口播 ──
  /// 单品口播
  static const double endorsementSingle = 1999;

  /// 季度代言
  static const double endorsementQuarter = 19999;

  // ── 艺人侧 ──
  /// 保证金：首笔收入冻结起额【A-11】
  static const double artistDeposit = 500;

  /// 从订单/接口体里取意向金，缺省回落 SSOT 常量（元）。
  /// 容错：num 直取；数字字符串尝试解析；其余非法类型安全回落，不抛类型异常。
  static double intentDepositOf(Map<String, dynamic>? src) =>
      _num(src?['intentDeposit'], intentDeposit);

  /// 制作款（元）。
  static double productionFeeOf(Map<String, dynamic>? src) =>
      _num(src?['productionFee'], productionFee);

  /// 普通档总价（元）。
  static double totalOf(Map<String, dynamic>? src) =>
      _num(src?['totalPrice'], standardTotal);

  /// 安全数值转换：num→double、数字字符串→解析、非法/缺失→[fallback]。
  static double _num(dynamic v, double fallback) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v.trim()) ?? fallback;
    return fallback;
  }
}
