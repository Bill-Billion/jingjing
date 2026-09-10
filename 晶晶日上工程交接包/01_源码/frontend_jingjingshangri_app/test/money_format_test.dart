// A8：锁定金额展示 SSOT 的最后一环——Money 千分位/符号/容错格式。
// 第25/26轮 launch、project_detail、sample_order_detail 的金额全部改走
// Pricing 常量 + Money.rmbInt/rmb 渲染，其显示字符串必须稳定为：
// 99→¥99、4901→¥4,901、5000→¥5,000，防止 intl/格式规则变动导致金额错位。
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/utils/money.dart';
import 'package:jingjingshangri_app/utils/pricing.dart';

void main() {
  group('Money 整数元千分位（页面价签主用）', () {
    test('整数值不带小数、带人民币符号', () {
      expect(Money.rmbInt(99), '¥99');
      expect(Money.rmbInt(0), '¥0');
    });
    test('千位以上加千分位逗号', () {
      expect(Money.rmbInt(1000), '¥1,000');
      expect(Money.rmbInt(4901), '¥4,901');
      expect(Money.rmbInt(5000), '¥5,000');
      expect(Money.rmbInt(19999), '¥19,999');
    });
    test('非整数回退到两位小数格式', () {
      expect(Money.rmbInt(99.5), '¥99.50');
    });
  });

  group('Money 两位小数 format/rmb', () {
    test('format 千分位两位小数', () {
      expect(Money.format(1286.5), '1,286.50');
      expect(Money.format(0), '0.00');
    });
    test('rmb 带符号', () {
      expect(Money.rmb(1286.5), '¥1,286.50');
    });
    test('withSign 仅正数前加 +', () {
      expect(Money.format(100, withSign: true), '+100.00');
      expect(Money.format(-100, withSign: true), '-100.00');
    });
  });

  group('Money 容错解析', () {
    test('num / 数字字符串 / 非法值', () {
      expect(Money.yuan(4901), 4901.0);
      expect(Money.yuan('4901'), 4901.0);
      expect(Money.yuan('abc', fallback: 7), 7.0);
      expect(Money.yuan(null), 0.0);
    });
    test('分转元', () {
      expect(Money.fenToYuan(10000), 100.0);
      expect(Money.rmbFen(10000), '¥100.00');
    });
  });

  group('Pricing 常量经 Money 渲染（SSOT 展示兜底）', () {
    test('页面价签依赖的组合输出固定', () {
      expect(Money.rmbInt(Pricing.intentDeposit), '¥99');
      expect(Money.rmbInt(Pricing.productionFee), '¥4,901');
      expect(Money.rmbInt(Pricing.standardTotal), '¥5,000');
      expect(Money.rmbInt(Pricing.easterEgg), '¥1,000');
      expect(Money.rmbInt(Pricing.endorsementSingle), '¥1,999');
      expect(Money.rmbInt(Pricing.endorsementQuarter), '¥19,999');
    });
    test('两段式：意向金 + 制作款 = 总价', () {
      expect(Pricing.intentDeposit + Pricing.productionFee,
          Pricing.standardTotal);
    });
  });
}
