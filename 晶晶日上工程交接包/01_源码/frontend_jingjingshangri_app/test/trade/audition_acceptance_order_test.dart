import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/trade/trade_models.dart';

void main() {
  final record = jsonDecode(
      File('test/trade/fixtures/synthetic_audition_order_v5.json')
          .readAsStringSync()) as Map<String, dynamic>;
  final modern = Map<String, dynamic>.from(
      record['data']['quote']['lines'][0]['specification']['audition']);
  test('隔离后端新合同试镜订单可被买方和卖方读取', () {
    expect(
        () =>
            TradeRecord.parse(record, record['buyer_party_id'], kind: 'ORDER'),
        returnsNormally);
    expect(
        () => TradeRecord.parse(record, record['merchant_party_id'],
            kind: 'ORDER'),
        returnsNormally);
  });
  test('历史七字段和新合同48小时各自保留，不接受未知政策或错误期限', () {
    final legacy = Map<String, dynamic>.from(modern)
      ..remove('acceptance_policy');
    expect(() => validateTradeAuditionTerms(legacy), returnsNormally);
    expect(() => validateTradeAuditionTerms(modern), returnsNormally);
    expect(
        () => validateTradeAuditionTerms({...modern, 'acceptance_hours': 47}),
        throwsA(anything));
    expect(
        () => validateTradeAuditionTerms(
            {...modern, 'acceptance_policy': 'UNKNOWN'}),
        throwsA(anything));
    expect(
        () => validateTradeAuditionTerms({...legacy, 'unexpected': 'ignored'}),
        throwsA(anything));
  });
}
