// 第19轮 A8：定价 SSOT 纯逻辑测试，锁定金额红线（唯一固定金额来源、接口优先常量兜底、
// 普通档两段式 99 + 4901 = 5000 的恒等关系），防止页面写死或误改数值。
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/utils/pricing.dart';

void main() {
  group('Pricing 常量红线', () {
    test('关键固定金额锁定，改动需显式评审', () {
      expect(Pricing.videoMinPrice, 99);
      expect(Pricing.intentDeposit, 99);
      expect(Pricing.productionFee, 4901);
      expect(Pricing.standardTotal, 5000);
      expect(Pricing.easterEgg, 1000);
      expect(Pricing.extraRevisionFee, 200);
      expect(Pricing.endorsementSingle, 1999);
      expect(Pricing.endorsementQuarter, 19999);
      expect(Pricing.artistDeposit, 500);
    });

    test('普通档两段式：意向金 + 制作款 = 总价起', () {
      expect(
        (Pricing.intentDeposit + Pricing.productionFee),
        Pricing.standardTotal,
      );
    });
  });

  group('Pricing *Of：接口优先、常量兜底、类型安全', () {
    test('null / 空 map 回落 SSOT 常量', () {
      expect(Pricing.intentDepositOf(null), Pricing.intentDeposit);
      expect(Pricing.productionFeeOf(const {}), Pricing.productionFee);
      expect(Pricing.totalOf(const {}), Pricing.standardTotal);
    });

    test('接口数值优先（int 也能转 double）', () {
      const src = {
        'intentDeposit': 120,
        'productionFee': 4880,
        'totalPrice': 5000,
      };
      expect(Pricing.intentDepositOf(src), 120.0);
      expect(Pricing.productionFeeOf(src), 4880.0);
      expect(Pricing.totalOf(src), 5000.0);
    });

    test('字符串金额容错：数字串解析采用、非法串安全回落、不抛类型异常', () {
      expect(Pricing.intentDepositOf(const {'intentDeposit': '99'}), 99.0);
      expect(Pricing.productionFeeOf(const {'productionFee': 'x'}),
          Pricing.productionFee);
      expect(Pricing.totalOf(const {'totalPrice': null}), Pricing.standardTotal);
    });
  });
}
