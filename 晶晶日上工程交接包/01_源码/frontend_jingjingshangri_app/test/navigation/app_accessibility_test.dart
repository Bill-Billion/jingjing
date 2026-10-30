import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/navigation/app_shell.dart';
import 'package:jingjingshangri_app/utils/responsive.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'app_navigation_test.dart' show openApp, frames, expectFiveTabs;

class SystemTextScaler extends TextScaler {
  const SystemTextScaler();
  @override
  double scale(double fontSize) => fontSize * (fontSize <= 16 ? 2 : 1.5);
  @override
  double get textScaleFactor => 2;
}

void main() {
  testWidgets('保留系统非线性大字曲线，不压回1.15倍', (t) async {
    late TextScaler effective;
    await t.pumpWidget(MaterialApp(
        home: MediaQuery(
            data: const MediaQueryData(textScaler: SystemTextScaler()),
            child: LimitedTextScale(child: Builder(builder: (context) {
              effective = MediaQuery.textScalerOf(context);
              return const SizedBox.shrink();
            })))));
    expect(effective.scale(12), 24);
    expect(effective.scale(24), 36);
  });

  for (final signedIn in [false, true]) {
    testWidgets('320宽2倍大字五个栏目与主要操作可用，登录=$signedIn', (t) async {
      final adapter = FakeAccountAdapter(
          handler: (r) => r.path.endsWith('/catalog')
              ? envelope({'items': [], 'next_cursor': null})
              : FakeAccountAdapter().defaultReply(r));
      final session = signedIn
          ? (await t.runAsync(() => buyerSession(adapter)))!
          : AccountSession(api: adapter.createApi());
      await openApp(t, session);
      t.view.physicalSize = const Size(320, 844);
      t.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
      for (var index = 0; index < 5; index++) {
        await t.tap(find.byKey(Key('app-tab-$index')));
        await frames(t);
        expectFiveTabs();
        expect(
            MediaQuery.textScalerOf(t.element(find.byType(AppShell))).scale(16),
            32);
        expect(t.takeException(), isNull, reason: 'tab $index');
        final title = find.descendant(
            of: find.byType(AppBar),
            matching: find.text(['晶晶日上', '试镜', '通告', '消息', '我的'][index]));
        if (title.evaluate().isNotEmpty) {
          final paragraph = t.renderObject<RenderParagraph>(title);
          for (final box in paragraph.getBoxesForSelection(
              const TextSelection(baseOffset: 0, extentOffset: 2))) {
            expect(box.bottom, lessThanOrEqualTo(paragraph.size.height + 1),
                reason: 'tab $index title is not vertically clipped');
          }
        }
      }
      await t.tap(find.byKey(const Key('app-tab-3')));
      await frames(t);
      if (signedIn) {
        for (final label in ['投稿意向', '活动投票', '系统通知']) {
          await t.ensureVisible(find.textContaining(label));
          await t.tap(find.textContaining(label));
          await frames(t);
          expect(t.takeException(), isNull, reason: label);
        }
      } else {
        expect(find.text('核对账号与身份'), findsOneWidget);
      }
      await t.pumpWidget(const SizedBox.shrink());
    });
  }
}
