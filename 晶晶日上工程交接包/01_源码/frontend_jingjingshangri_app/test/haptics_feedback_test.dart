import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jingjingshangri_app/utils/haptics.dart';
import 'package:jingjingshangri_app/widgets/press_scale.dart';
import 'package:jingjingshangri_app/widgets/primary_button.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // 本版 Flutter 的 HapticFeedback 统一发 method 'HapticFeedback.vibrate'，
  // 具体反馈类型由第二个参数 HapticFeedbackType.* 区分，这里记录类型串。
  final List<String> types = [];

  setUp(() {
    types.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'HapticFeedback.vibrate') {
        types.add(call.arguments as String);
      }
      return null;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  group('Haptics SSOT 语义映射', () {
    test('tick/select -> selectionClick', () async {
      await Haptics.tick();
      await Haptics.select();
      expect(types, [
        'HapticFeedbackType.selectionClick',
        'HapticFeedbackType.selectionClick',
      ]);
    });

    test('success -> mediumImpact', () async {
      await Haptics.success();
      expect(types, ['HapticFeedbackType.mediumImpact']);
    });

    test('warn -> lightImpact', () async {
      await Haptics.warn();
      expect(types, ['HapticFeedbackType.lightImpact']);
    });
  });

  testWidgets('PressScale 点按触发一次轻 tick，禁用态不触发', (tester) async {
    var taps = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Column(
          children: [
            PressScale(onTap: () => taps++, child: const Text('enabled')),
            const PressScale(onTap: null, child: Text('disabled')),
          ],
        ),
      ),
    ));

    await tester.tap(find.text('enabled'));
    await tester.pump();
    await tester.pump();
    expect(taps, 1);
    expect(
        types.where((t) => t == 'HapticFeedbackType.selectionClick').length, 1);

    await tester.tap(find.text('disabled'));
    await tester.pump();
    await tester.pump();
    // 禁用态既不执行业务，也不发触感。
    expect(taps, 1);
    expect(
        types.where((t) => t == 'HapticFeedbackType.selectionClick').length, 1);
  });

  testWidgets('PrimaryButton 进入 success 态给一次成功触感', (tester) async {
    ButtonState state = ButtonState.idle;
    late StateSetter hostSetState;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: StatefulBuilder(
          builder: (context, setSt) {
            hostSetState = setSt;
            return PrimaryButton(label: '提交', state: state, onPressed: () {});
          },
        ),
      ),
    ));

    hostSetState(() => state = ButtonState.success);
    await tester.pump();
    await tester.pump();
    expect(types, contains('HapticFeedbackType.mediumImpact'));
    // 排空 success 态 900ms 的 onSuccessShown Timer，避免 pending timer。
    await tester.pump(const Duration(milliseconds: 950));
  });
}
