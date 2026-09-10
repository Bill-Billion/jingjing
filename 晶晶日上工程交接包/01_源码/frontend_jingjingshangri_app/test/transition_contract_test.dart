// 第82轮 A2 动效架构契约护栏（静态扫描，防回归）：
// ①所有业务页面跳转必须走统一 Motion（fadeSlideRoute/modalRoute），
//   不得退回默认 MaterialPageRoute/CupertinoPageRoute（否则会破坏右进淡入的一致手感）；
// ②统一动效 SSOT（utils/motion.dart）必须持续提供页面/模态/Tab 三类转场；
// ③LiquidScaffold 必须用 PageEnter 包裹 body，保证任意二级页都有进场动效、不硬切。
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final root = Directory('lib');

  String read(String rel) => File('${root.path}/$rel').readAsStringSync();

  test('pages 下不存在默认 Material/Cupertino 页面转场', () {
    final pages = Directory('${root.path}/pages');
    expect(pages.existsSync(), isTrue);
    final offenders = <String>[];
    for (final f in pages.listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      final src = f.readAsStringSync();
      if (src.contains('MaterialPageRoute(') ||
          src.contains('CupertinoPageRoute(')) {
        offenders.add(f.path);
      }
    }
    expect(offenders, isEmpty,
        reason: '以下页面使用了默认转场，应改用 Motion.fadeSlideRoute/modalRoute：'
            '$offenders');
  });

  test('Motion 统一提供页面/模态/Tab 三类转场与时长 SSOT', () {
    final m = read('utils/motion.dart');
    expect(m.contains('fadeSlideRoute'), isTrue);
    expect(m.contains('modalRoute'), isTrue);
    expect(m.contains('tabFade'), isTrue);
    // 整页转场时长必须受控（≤420ms，远小于 1.6s 上限）
    expect(m.contains('static const int page = 340'), isTrue);
    expect(m.contains('static const int modal = 420'), isTrue);
  });

  test('LiquidScaffold 以 PageEnter 包裹 body，二级页统一进场', () {
    final s = read('widgets/liquid_scaffold.dart');
    expect(s.contains('PageEnter(child: body!)'), isTrue);
    expect(s.contains('RepaintBoundary(child: LiquidBackdrop())'), isTrue);
  });

  test('LiquidScaffold 内部 Scaffold 垫曜石底色，AppBar 后方不透白边', () {
    final s = read('widgets/liquid_scaffold.dart');
    // 第84轮修复：底色透明会让 AppBar 后方在测试表面/部分机型透出白边
    expect(s.contains('backgroundColor: AppTheme.background'), isTrue);
    expect(s.contains('backgroundColor: Colors.transparent'), isFalse);
  });
}
