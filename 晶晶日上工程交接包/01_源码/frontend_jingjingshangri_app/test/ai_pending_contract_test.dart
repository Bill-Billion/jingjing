// 第83轮 A6 无成片占位统一契约（静态护栏，防回归）：
// AI 任务 succeeded 但成片资源未就位（弱网/尚未取回）时，图片与视频必须共用
// 同一个曜石风 _pendingBox 占位，不得退回旧的纯灰底 _placeholderBox，
// 也不得让视频空分支只叠一层半透明黑而发空。
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final src =
      File('lib/pages/ai_studio/ai_task_page.dart').readAsStringSync();

  test('图片/视频空成片共用统一 _pendingBox 占位', () {
    // 旧的纯灰底占位已移除
    expect(src.contains('_placeholderBox'), isFalse);
    // 统一占位方法存在，且图片、视频两处都调用
    expect(src.contains('Widget _pendingBox('), isTrue);
    final calls = RegExp(r'_pendingBox\(').allMatches(src).length;
    expect(calls, greaterThanOrEqualTo(3)); // 1 处定义 + 图片 + 视频
  });

  test('视频无本地成片时走统一占位而非空黑遮罩', () {
    expect(src.contains('if (local == null)'), isTrue);
    expect(src.contains('movie_creation_outlined'), isTrue);
  });

  test('统一占位提示为 Flutter 叠加文案、图标取克制金', () {
    expect(src.contains('成片即将就位，可稍后在我的作品查看'), isTrue);
    expect(src.contains('AppTheme.goldLight'), isTrue);
  });
}
