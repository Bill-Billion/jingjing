// A2/A8：锁定统一动效 SSOT（Motion）的时长与"尊重系统减少动态"契约。
// - 窄屏（<600dp）用基准时长；宽屏（≥600dp，折叠屏/平板 840）同类 +50ms；
// - 系统开启"减少动态效果"（disableAnimations）时，页面/模态时长压到 90/100ms（且优先于宽屏加时）；
// - 转场常量为 SSOT 且离场短于入场、全部远低于开屏 1.6s 上限，防止有人随手改回长动画。
// 纯逻辑 + MediaQuery 轻量测试，不触网络/插件。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jingjingshangri_app/utils/motion.dart';

class MotionProbe {
  bool reduced = false;
  int adjustedPage = -1;
  Duration page = Duration.zero;
  Duration modal = Duration.zero;
}

Future<MotionProbe> probeAt(WidgetTester t, double width,
    {bool disableAnim = false}) async {
  final p = MotionProbe();
  await t.pumpWidget(MediaQuery(
    data: MediaQueryData(size: Size(width, 844), disableAnimations: disableAnim),
    child: Builder(builder: (c) {
      p.reduced = Motion.reduced(c);
      p.adjustedPage = Motion.adjusted(c, Motion.page);
      p.page = Motion.pageDuration(c);
      p.modal = Motion.modalDuration(c);
      return const SizedBox.shrink();
    }),
  ));
  return p;
}

void main() {
  testWidgets('窄屏 390：基准时长、未减弱', (t) async {
    final p = await probeAt(t, 390);
    expect(p.reduced, false);
    expect(p.adjustedPage, Motion.page);
    expect(p.page, const Duration(milliseconds: 340));
    expect(p.modal, const Duration(milliseconds: 420));
  });

  testWidgets('宽屏 840：同类 +50ms', (t) async {
    final p = await probeAt(t, 840);
    expect(p.reduced, false);
    expect(p.adjustedPage, Motion.page + 50);
    expect(p.page, const Duration(milliseconds: 390));
    expect(p.modal, const Duration(milliseconds: 470));
  });

  testWidgets('临界 600dp 恰好触达宽屏加时', (t) async {
    final p = await probeAt(t, 600);
    expect(p.adjustedPage, Motion.page + 50);
    final q = await probeAt(t, 599.9);
    expect(q.adjustedPage, Motion.page);
  });

  testWidgets('系统减弱动效：压到 90/100ms 且优先于宽屏加时', (t) async {
    final narrow = await probeAt(t, 390, disableAnim: true);
    expect(narrow.reduced, true);
    expect(narrow.page, const Duration(milliseconds: 90));
    expect(narrow.modal, const Duration(milliseconds: 100));

    // 即使宽屏，减弱动效时也不 +50ms
    final wide = await probeAt(t, 840, disableAnim: true);
    expect(wide.page, const Duration(milliseconds: 90));
    expect(wide.modal, const Duration(milliseconds: 100));
  });

  test('动效常量 SSOT 契约：离场短于入场、转场远低于 1.6s 上限', () {
    expect(Motion.page, 340);
    expect(Motion.modal, 420);
    expect(Motion.pageOut, 220);
    expect(Motion.tab, 150);
    expect(Motion.shimmer, 1300);
    // 离场比入场短约 1/3
    expect(Motion.pageOut < Motion.page, true);
    // 所有转场时长都在 1.6s 开屏上限之内，且转场本身 ≤0.5s
    const cap = 1600;
    for (final v in [
      Motion.micro,
      Motion.short,
      Motion.sheet,
      Motion.page,
      Motion.modal,
      Motion.pageOut,
      Motion.tab,
    ]) {
      expect(v <= 500, true, reason: '转场时长 $v 应 ≤500ms');
      expect(v < cap, true);
    }
  });
}
