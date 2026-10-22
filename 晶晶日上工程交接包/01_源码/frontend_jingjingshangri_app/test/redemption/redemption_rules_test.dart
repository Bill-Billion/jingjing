import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/redemption/redemption_pages.dart';

void main() {
  test('展示服务器概率并拒绝越界，不补默认概率或价格', () {
    expect(redemptionPercent('0.123456'), '12.3456%');
    expect(redemptionPercent(0), '0.0000%');
    expect(redemptionPercent(1), '100.0000%');
    for (final p in [null, -0.1, 1.01, 'NaN', 'Infinity', '未公布']) {
      expect(() => redemptionPercent(p), throwsA(isA<AccountError>()));
    }
    expect(redemptionKind('PRODUCTION_CREDIT'), '制作金');
    expect(redemptionKind('INTERVIEW'), '面试权益');
  });
}
