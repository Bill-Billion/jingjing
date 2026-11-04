import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/offline/demo_app.dart';
import 'package:jingjingshangri_app/offline/demo_flows.dart';
import 'package:jingjingshangri_app/offline/demo_models.dart';
import 'package:jingjingshangri_app/offline/demo_organization.dart';
import 'package:jingjingshangri_app/offline/demo_store.dart';
import '../artists/artists_media_view_test.dart' show MediaPlatform;
// Exercise the existing plugin seam without adding a new production package.
// ignore: depend_on_referenced_packages
import 'package:video_player_platform_interface/video_player_platform_interface.dart';
import 'demo_store_test.dart'
    show MemoryDemoPersistence, orderInput, noticeInput;

Future<void> press(WidgetTester tester, String label) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pumpAndSettle();
  final button = find.ancestor(
      of: find.text(label),
      matching: find.byWidgetPredicate(
          (w) => w is FilledButton || w is OutlinedButton || w is TextButton));
  if (button.evaluate().isEmpty) {
    await tester.scrollUntilVisible(find.text(label), 350,
        scrollable: find.byType(Scrollable).first, maxScrolls: 30);
  }
  await tester.ensureVisible(button.last);
  await tester.pumpAndSettle();
  await tester.tap(button.last);
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
}

void main() {
  late DemoStore store;
  setUp(() async {
    store = DemoStore(MemoryDemoPersistence(),
        clock: () => DateTime.utc(2027, 1, 1));
    await store.load();
    final old = VideoPlayerPlatform.instance;
    VideoPlayerPlatform.instance = MediaPlatform();
    addTearDown(() => VideoPlayerPlatform.instance = old);
  });
  tearDown(() => store.dispose());

  Future<void> page(WidgetTester tester, Widget child) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(home: child));
    await tester.pumpAndSettle();
  }

  testWidgets(
      'five tabs and actual account switch render on narrow Android size',
      (tester) async {
    await page(tester, OfflineDemoApp(store: store));
    for (final title in ['广场', '试镜', '通告', '消息', '我的']) {
      expect(find.text(title), findsOneWidget);
    }
    await tester.tap(find.byTooltip('切换演示账号'));
    await tester.pumpAndSettle();
    expect(find.text('林夏 · 艺人本人'), findsOneWidget);
    await tester.tap(find.text('林夏 · 艺人本人'));
    await tester.pumpAndSettle();
    expect(store.actor, 'artist');
    expect(find.text('我的艺人形象'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('order page completes every stage with a feedback revision',
      (tester) async {
    final id = await store.send('order_create', orderInput('ui-order'));
    await page(tester, demoOrderPage(store, id));
    await press(tester, '模拟平台报价');
    await press(tester, '确认报价与演示约定');
    await press(tester, '确认');
    await press(tester, '模拟付款 ¥300.00');
    await press(tester, '确认');
    await press(tester, '模拟平台提交剧本');
    await press(tester, '提出修改意见');
    await tester.enterText(
        find.byKey(const ValueKey('field_feedback')), '增加温暖的结尾');
    await press(tester, '提交修改意见');
    await press(tester, '模拟平台提交剧本');
    await press(tester, '确认剧本');
    await press(tester, '模拟平台提交样片');
    await press(tester, '确认样片');
    await press(tester, '模拟付款 ¥400.00');
    await press(tester, '确认');
    await press(tester, '模拟平台提交粗剪');
    await press(tester, '确认粗剪');
    await press(tester, '模拟付款 ¥300.00');
    await press(tester, '确认');
    await press(tester, '模拟平台提交成片');
    await press(tester, '确认成片收讫');
    await press(tester, '确认');
    expect(store.find('orders', id)!['status'], 'received');
    expect(store.list('payments'), hasLength(3));
  });

  testWidgets(
      'member accepts invitation, owner grants then removes permissions',
      (tester) async {
    await store.send('switch', {'id': 'owner'});
    await page(tester, demoOrganizationPage(store));
    await press(tester, '邀请许安加入机构');
    await press(tester, '确认');
    await store.send('switch', {'id': 'member'});
    await tester.pumpAndSettle();
    await press(tester, '接受机构邀请');
    await store.send('switch', {'id': 'owner'});
    await tester.pumpAndSettle();
    await press(tester, '设置成员权限');
    await tester.tap(find.text('查看艺人资料'));
    await tester.pumpAndSettle();
    await press(tester, '保存权限');
    expect(store.organization['permissions'], ['查看艺人资料']);
    await press(tester, '移除成员');
    await press(tester, '确认');
    expect(store.organization['permissions'], isEmpty);
  });

  testWidgets(
      'notice published by producer and posted by artist keeps followup boundary',
      (tester) async {
    await store.send('switch', {'id': 'producer'});
    final id = await store.send('notice_create', noticeInput('ui-notice'));
    await page(tester, demoNoticePage(store, id));
    await press(tester, '确认发布条件并提交');
    await press(tester, '确认');
    await press(tester, '模拟审核通过并发布');
    await store.send('switch', {'id': 'artist'});
    await tester.pumpAndSettle();
    await press(tester, '提交我的艺人资料');
    await tester.enterText(find.byKey(const ValueKey('field_note')), '期待参与演出');
    await tester.ensureVisible(find.byType(CheckboxListTile));
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    await press(tester, '确认投稿');
    await store.send('switch', {'id': 'producer'});
    await tester.pumpAndSettle();
    await press(tester, '感兴趣 · 转客服跟进');
    expect(store.list('applications').single['status'], 'interested');
    expect(store.project['status'], 'open');
  });

  testWidgets('audition pages exchange the same booking and local delivery',
      (tester) async {
    final id = await store.send('audition_create', {
      'requestKey': 'ui-audition',
      'date': '2027-01-05T14:00:00Z',
      'brief': '生活短片试镜',
    });
    await page(tester, demoAuditionPage(store, id));
    await press(tester, '模拟支付试镜费用');
    await press(tester, '确认');
    await store.send('switch', {'id': 'artist'});
    await tester.pumpAndSettle();
    await press(tester, '接受试镜预约');
    await press(tester, '提交试镜样照与视频');
    await press(tester, '提交试镜素材');
    await press(tester, '模拟试镜素材审核通过');
    await store.send('switch', {'id': 'customer'});
    await tester.pumpAndSettle();
    await press(tester, '确认试镜交付');
    await press(tester, '确认');
    expect(store.find('auditions', id)!['status'], 'completed');
  });

  testWidgets(
      'artist edits authorizes image and confirms independent participation',
      (tester) async {
    await store.send('switch', {'id': 'artist'});
    await page(tester, demoArtistPage(store));
    await press(tester, '编辑形象资料');
    await tester.enterText(find.byKey(const ValueKey('field_name')), '林夏新形象');
    await press(tester, '保存');
    await press(tester, '本人授权并申请展示');
    await press(tester, '确认');
    await press(tester, '模拟形象审核通过');
    expect(store.artist['status'], 'approved');
    await tester.pumpWidget(MaterialApp(home: demoProjectPage(store)));
    await tester.pumpAndSettle();
    await press(tester, '报名参演');
    await press(tester, '模拟筛选通过并生成约定');
    await press(tester, '本人确认参演约定');
    await press(tester, '确认');
    await press(tester, '模拟出品方付款');
    await press(tester, '模拟更新：开始拍摄');
    await press(tester, '模拟更新：拍摄完成');
    expect(store.project['status'], 'completed');
  });

  testWidgets(
      'reset cancellation preserves progress and confirmation resets all',
      (tester) async {
    await store.send('order_create', orderInput('keep'));
    await page(tester, OfflineDemoApp(store: store));
    await tester.tap(find.text('我的'));
    await tester.pumpAndSettle();
    await press(tester, '重置演示数据');
    await press(tester, '取消');
    expect(store.list('orders'), hasLength(1));
    await press(tester, '重置演示数据');
    await press(tester, '确认');
    expect(store.snapshot, demoSeed());
  });
}
