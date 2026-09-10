// A8：锁定主行动按钮 PrimaryButton 的"提交防重复"底层契约（铁律：提交按钮防重复）。
// 按钮内部在 loading/disabled/success 时把 onTap 置 null，只有 idle/errorState 可点：
// 这保证任何提交页只要在请求在途把 state 置为 loading，第二次点击物理上不可能再触发 onPressed。
// 纯组件确定性测试，不触网络/文件/插件，补向导提交测试因 multipart 真实文件 IO 无法在
// fakeAsync 驱动而留下的护栏缺口（页面侧门槛已由 audition_name/step_gate 锁定）。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';
import 'package:jingjingshangri_app/widgets/primary_button.dart';

void main() {
  Widget host(ButtonState state, VoidCallback? onPressed) => MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: Scaffold(
          body: Center(
            child: PrimaryButton(
              label: '提交',
              state: state,
              onPressed: onPressed,
            ),
          ),
        ),
      );

  testWidgets('idle 可点；loading/disabled/success 物理屏蔽；errorState 可重试', (t) async {
    var hits = 0;
    void tap() => hits++;

    // idle：正常触发一次
    await t.pumpWidget(host(ButtonState.idle, tap));
    await t.tap(find.text('提交'));
    expect(hits, 1);

    // loading（提交在途）：再点不触发——防重复核心
    await t.pumpWidget(host(ButtonState.loading, tap));
    await t.tap(find.byType(PrimaryButton), warnIfMissed: false);
    await t.pump();
    expect(hits, 1);

    // disabled：不触发
    await t.pumpWidget(host(ButtonState.disabled, tap));
    await t.tap(find.byType(PrimaryButton), warnIfMissed: false);
    await t.pump();
    expect(hits, 1);

    // success：不触发（防成功动画期间重复提交）
    await t.pumpWidget(host(ButtonState.success, tap));
    await t.tap(find.byType(PrimaryButton), warnIfMissed: false);
    await t.pump();
    expect(hits, 1);
    // 排空 success 入场动画 Timer（didUpdateWidget 建 900ms）
    await t.pump(const Duration(milliseconds: 950));

    // errorState：允许点击重试
    await t.pumpWidget(host(ButtonState.errorState, tap));
    await t.tap(find.byType(PrimaryButton));
    expect(hits, 2);

    // onPressed 为 null 时不抛、不可点
    await t.pumpWidget(host(ButtonState.idle, null));
    await t.tap(find.byType(PrimaryButton), warnIfMissed: false);
    await t.pump();
    expect(hits, 2);
    expect(t.takeException(), isNull);
  });
}
