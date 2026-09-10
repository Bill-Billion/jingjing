// V12.5 金额边界 & 我的数字人同步语义回归测试（纯 Dart，不联网）：
// 1) HTTP/Mock 金额一律「元」，页面层禁止再 /100；
// 2) 演示模式 getMyHumans 兜底为空，不把广场艺人混入「我的数字人」；
// 3) syncOnlineHumans 在演示模式不污染本地落盘。
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/utils/money.dart';
import 'package:jingjingshangri_app/services/mock_data.dart';
import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';

Future<void> _bootDemo() async {
  SharedPreferences.setMockInitialValues({'connMode': 'demo'});
  await AppMode.instance.load();
  await ApiService().init();
}

void main() {
  setUp(() async {
    await _bootDemo();
  });

  test('Money：元值直出，不再除100', () {
    expect(Money.format(99), '99.00');
    expect(Money.rmb(1286.5), '¥1,286.50');
    expect(Money.yuan(1999.0), 1999.0);
    // fenToYuan 仅用于明确为分的内部场景
    expect(Money.fenToYuan(9900), 99.0);
  });

  test('Mock 钱包/流水金额单位为元（非分）', () {
    final w = MockData.wallet();
    expect(w['balance'], 1286.50);
    final txns = MockData.transactions();
    for (final t in txns) {
      final amt = t['amount'] as num;
      // 元口径下单笔流水绝对值不会出现「分量级」的巨大数值
      expect(amt.abs() < 100000, true, reason: '${t['txNo']} amount=$amt 疑似分');
    }
  });

  test('Mock 使用报告金额单位为元（V12.5 边界统一）', () {
    final r = MockData.usageReport(1);
    final summary = r['summary'] as Map;
    expect(summary['totalRevenue'], 5682.00);
    final v = (r['recentVideos'] as List).first as Map;
    final e = (r['recentEndorsements'] as List).first as Map;
    expect(v['amount'], 99.00);
    expect(e['amount'], 1999.00);
  });

  test('Mock 定价建议 currentPrice 单位为元', () {
    final p = MockData.pricingSuggest(1);
    expect(p['currentPrice'], 99);
  });

  test('演示模式 getAfterSales 兜底为 timeline 结构且退款为元口径', () async {
    final d = await ApiService().getAfterSales('VD-DEMO-1');
    expect(d.containsKey('afterSalesStatus'), true);
    expect(d['timeline'] is List, true);
    expect(d['refund'], null);
  });

  test('演示模式 getMyHumans 兜底为空，不混入广场数据', () async {
    final mine = await ApiService().getMyHumans();
    expect(mine, isEmpty);
    final market = await ApiService().getHumans();
    expect(market, isNotEmpty); // 广场演示数据依旧存在
  });

  test('syncOnlineHumans 演示模式不污染本地落盘', () async {
    final up = UserProvider();
    await up.saveLogin({'token': 'demo-token', 'user': {'id': 1, 'nickname': '测试用户'}});
    await up.addMyHuman({'id': 9527, 'name': '我的分身', 'status': 'pending', 'scopeVideo': true});
    expect(up.myHumans.length, 1);
    await up.syncOnlineHumans();
    expect(up.myHumans.length, 1);
    expect(up.myHumans.first['name'], '我的分身');
  });
}
