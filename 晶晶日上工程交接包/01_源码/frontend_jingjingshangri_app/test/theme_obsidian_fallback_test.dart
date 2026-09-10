// 第71轮 A1/A8：锁定全局 ThemeData 已对 SnackBar/进度条/TabBar/分隔线/Switch 做曜石兜底，
// 防止回退到 Material 默认深灰 SnackBar、主色蓝进度条。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jingjingshangri_app/theme/app_theme.dart';

void main() {
  final t = AppTheme.darkTheme;

  test('全局 SnackBar 曜石兜底（浮起+曜石底+金描边圆角）', () {
    final sb = t.snackBarTheme;
    expect(sb.behavior, SnackBarBehavior.floating);
    expect(sb.backgroundColor, AppTheme.surfaceDark);
    expect(sb.actionTextColor, AppTheme.goldLight);
    expect(sb.shape, isA<RoundedRectangleBorder>());
  });

  test('全局进度指示器/TabBar/分隔线为克制金与极淡白', () {
    expect(t.progressIndicatorTheme.color, AppTheme.goldMain);
    expect(t.tabBarTheme.labelColor, AppTheme.goldMain);
    expect(t.tabBarTheme.indicatorColor, AppTheme.goldMain);
    expect(t.dividerTheme.color, const Color(0x14FFFFFF));
  });

  test('全局 Switch 选中态为曜石金', () {
    final thumb = t.switchTheme.thumbColor!
        .resolve({WidgetState.selected});
    expect(thumb, AppTheme.goldMain);
  });

  test('输入框全局曜石玻璃（filled + 聚焦金边）', () {
    expect(t.inputDecorationTheme.filled, true);
    expect(t.inputDecorationTheme.focusedBorder, isA<OutlineInputBorder>());
  });
}
