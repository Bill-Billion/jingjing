import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_theme.dart';
import 'package:jingjingshangri_app/artists/artists_models.dart';
import 'package:jingjingshangri_app/operations/operation_models.dart';
import 'package:jingjingshangri_app/production/production_models.dart';
import 'package:jingjingshangri_app/stock/v5_support.dart';

void main() {
  test('读取503和断网可重读，写入不确定仍恢复原请求', () {
    for (final error in [
      const AccountError(503, 'SERVICE_UNAVAILABLE', uncertain: true),
      const AccountError(0, 'NETWORK_UNKNOWN', uncertain: true),
    ]) {
      for (final message in [
        v5Error(error),
        artistError(error),
        operationError(error),
        productionError(error),
      ]) {
        expect(message, contains('重新读取'));
        expect(message, isNot(contains('恢复原请求')));
        expect(message, isNot(contains('恢复同一请求')));
      }
      expect(v5Error(error, writing: true), contains('恢复原请求'));
      expect(artistError(error, writing: true), contains('恢复同一请求'));
      expect(operationError(error, writing: true), contains('恢复原请求'));
      expect(productionError(error, writing: true), contains('恢复原请求'));
    }
    const malformed =
        AccountError(502, 'INVALID_ARTIST_RESPONSE', uncertain: true);
    expect(artistError(malformed), contains('重新读取'));
    expect(artistError(malformed, writing: true), contains('恢复同一请求'));
  });

  test('明确业务阻断保留具体含义，畸形写响应仍恢复原请求', () {
    for (final writing in [false, true]) {
      expect(
          v5Error(
              const AccountError(503, 'CUSTODY_PROVIDER_NOT_CONNECTED',
                  uncertain: true),
              writing: writing),
          contains('本次未充值或扣款'));
      expect(
          artistError(
              const AccountError(503, 'HALO_VERIFIED_METRICS_NOT_AVAILABLE',
                  uncertain: true),
              writing: writing),
          contains('当前不能申请'));
      expect(
          operationError(
              const AccountError(503, 'COMMENT_TARGET_NOT_SUPPORTED',
                  uncertain: true),
              writing: writing),
          contains('暂不支持留言'));
      expect(
          productionError(
              const AccountError(503, 'PROVIDER_NOT_ENABLED', uncertain: true),
              writing: writing),
          contains('生成服务尚未开通'));
    }
    expect(
        v5Error(const AccountError(502, 'INVALID_V5_RESPONSE', uncertain: true),
            writing: true),
        contains('恢复原请求'));
    expect(
        operationError(
            const AccountError(502, 'INVALID_OPERATIONS_RESPONSE',
                uncertain: true),
            writing: true),
        contains('恢复原请求'));
    expect(
        productionError(
            const AccountError(502, 'INVALID_PRODUCTION_RESPONSE',
                uncertain: true),
            writing: true),
        contains('恢复原请求'));
  });

  test('403和404不能推断为下架、退款或本人撤回', () {
    for (final status in [403, 404]) {
      final error = AccountError(status, 'NOT_FOUND');
      for (final message in [v5Error(error), artistError(error)]) {
        expect(message, isNot(contains('已下架')));
        expect(message, isNot(contains('已退款')));
        expect(message, isNot(contains('已撤回')));
      }
    }
  });

  testWidgets('年末授权日期可打开，取消日期或时间均保留原ISO值', (t) async {
    final original = DateTime(2200, 12, 31, 9).toUtc().toIso8601String();
    var value = original;
    await t.pumpWidget(MaterialApp(home: AccountTheme(
        child: Scaffold(body: StatefulBuilder(builder: (context, update) {
      return v5DateField(context,
          label: '授权截止',
          value: value,
          onChanged: (next) => update(() => value = next));
    })))));
    await t.pumpAndSettle();
    expect(t.widget<TextField>(find.byType(TextField)).readOnly, isTrue);
    expect(t.widget<TextField>(find.byType(TextField)).controller!.text,
        v5LocalDate(original));
    expect(find.textContaining('UTC'), findsOneWidget);
    await t
        .tapAt(t.getTopLeft(find.byType(TextFormField)) + const Offset(30, 20));
    await t.pumpAndSettle();
    expect(find.byType(DatePickerDialog), findsOneWidget);
    expect(Localizations.localeOf(t.element(find.byType(DatePickerDialog))),
        const Locale('zh', 'CN'));
    expect(t.widget<DatePickerDialog>(find.byType(DatePickerDialog)).lastDate,
        DateTime(2200, 12, 31));
    await t.tap(find.text('返回'));
    await t.pumpAndSettle();
    expect(value, original);

    await t
        .tapAt(t.getTopLeft(find.byType(TextFormField)) + const Offset(30, 20));
    await t.pumpAndSettle();
    await t.tap(find.text('下一步'));
    await t.pumpAndSettle();
    expect(find.byType(TimePickerDialog), findsOneWidget);
    expect(Localizations.localeOf(t.element(find.byType(TimePickerDialog))),
        const Locale('zh', 'CN'));
    expect(
        MediaQuery.of(t.element(find.byType(TimePickerDialog)))
            .alwaysUse24HourFormat,
        isTrue);
    await t.tap(find.text('返回'));
    await t.pumpAndSettle();
    expect(value, original);
    expect(t.takeException(), isNull);
  });

  testWidgets('320宽两倍字体完整显示时区与授权条件，不截断helper', (t) async {
    t.view.physicalSize = const Size(320, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    const condition = '不得超出已接受合作关系的期限；开始与截止由本人明确选择。';
    await t.pumpWidget(MaterialApp(
        home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child:
                AccountTheme(child: Scaffold(body: Builder(builder: (context) {
              return ListView(padding: const EdgeInsets.all(18), children: [
                v5DateField(context,
                    label: '委托截止',
                    value: '',
                    hint: condition,
                    onChanged: (_) {})
              ]);
            }))))));
    await t.pumpAndSettle();
    final helper = t.widget<Text>(find.textContaining(condition));
    expect(helper.maxLines, isNull);
    expect(helper.overflow, isNot(TextOverflow.ellipsis));
    expect(helper.data, contains('本机本地时间（UTC'));
    expect(helper.data, contains('提交时转为UTC'));
    expect(t.takeException(), isNull);
  });
}
