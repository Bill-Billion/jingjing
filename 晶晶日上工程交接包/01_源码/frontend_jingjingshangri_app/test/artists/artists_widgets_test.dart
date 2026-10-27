import 'dart:async';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/account/read_failure_widgets.dart';
import 'package:jingjingshangri_app/artists/artists_forms.dart';
import 'package:jingjingshangri_app/artists/artists_pages.dart';
import '../account/fake_account_api.dart';
import '../navigation/app_navigation_test.dart' as nav;
import 'artists_fixtures.dart';

class Picker extends FilePickerPlatform {
  @override
  Future<FilePickerResult?> pickFiles(
          {String? dialogTitle,
          String? initialDirectory,
          FileType type = FileType.any,
          List<String>? allowedExtensions,
          Function(FilePickerStatus)? onFileLoading,
          int compressionQuality = 0,
          bool allowMultiple = false,
          bool withData = false,
          bool withReadStream = false,
          bool lockParentWindow = false,
          bool readSequential = false,
          bool cancelUploadOnWindowBlur = true}) async =>
      FilePickerResult([
        PlatformFile(
            name: 'consent.txt',
            size: artistBytes.length,
            readStream: Stream.value(artistBytes))
      ]);
}

Future<void> host(WidgetTester t, AccountSession s, Widget child) async {
  t.view.physicalSize = const Size(390, 844);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.reset);
  await t.pumpWidget(ChangeNotifierProvider.value(
      value: s,
      child: MaterialApp(
          home: child,
          onGenerateRoute: (r) => MaterialPageRoute(
              settings: r,
              builder: (_) => const Scaffold(body: Text('真实结果页入口'))))));
  await t.pumpAndSettle();
}

Future<void> show(WidgetTester t, Finder f) async {
  if (f.evaluate().isEmpty) {
    await t.scrollUntilVisible(f, 240,
        scrollable: find.byType(Scrollable).first);
  }
  await t.ensureVisible(f);
  await t.pumpAndSettle();
}

Future<void> press(WidgetTester t, Finder f) async {
  await show(t, f);
  await t.tap(f);
  await t.pumpAndSettle();
}

Future<void> input(WidgetTester t, String key, String value) async {
  final f = find.byKey(ValueKey('artist-field-$key'));
  await show(t, f);
  await t.enterText(f, value);
  await t.pumpAndSettle();
}

Future<void> dateInput(WidgetTester t, String key, DateTime value) async {
  final field = find.byKey(ValueKey('artist-field-$key'));
  await show(t, field);
  await t.tap(field);
  await t.pumpAndSettle();
  final localizations =
      MaterialLocalizations.of(t.element(find.byType(DatePickerDialog)));
  await t.tap(find.byTooltip(localizations.inputDateModeButtonLabel));
  await t.pumpAndSettle();
  await t.enterText(
      find.descendant(
          of: find.byType(InputDatePickerFormField),
          matching: find.byType(TextFormField)),
      localizations.formatCompactDate(value));
  await t.tap(find.text('下一步'));
  await t.pumpAndSettle();
  await t.tap(find.byTooltip(localizations.inputTimeModeButtonLabel));
  await t.pumpAndSettle();
  final timeFields = find.descendant(
      of: find.byType(TimePickerDialog), matching: find.byType(TextField));
  await t.enterText(timeFields.at(0), '${value.hour}');
  await t.enterText(timeFields.at(1), '${value.minute}');
  await t.tap(find.text('确定'));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('公开艺人目录503用C06且返回保留城市标签，重读不创建业务', (t) async {
    var failed = true;
    final a = artistAdapter(
        override: (r) => r.path == '$artistRoot/catalog'
            ? failed
                ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                    status: 503, error: true)
                : envelope({'items': [], 'next_cursor': null})
            : null);
    final s = (await t.runAsync(() => artistSession(a)))!;
    await host(
        t, s, const ArtistCataloguePage(initialCity: '杭州', initialTag: '对白'));
    expect(find.byType(ReadFailureContent), findsOneWidget);
    await press(t, find.byKey(const ValueKey('read-failure-back')));
    await press(t, find.byKey(const ValueKey('artist-catalog-filters')));
    expect(
        t
            .widget<TextField>(find.widgetWithText(TextField, '城市'))
            .controller!
            .text,
        '杭州');
    expect(
        t
            .widget<TextField>(find.widgetWithText(TextField, '标签'))
            .controller!
            .text,
        '对白');
    expect(find.text('当前条件下没有已获准公开的艺人。'), findsNothing);
    failed = false;
    await press(t, find.text('按条件查看艺人'));
    await show(t, find.text('当前条件下没有已获准公开的艺人。'));
    expect(find.byType(ReadFailureContent), findsNothing);
    final request =
        a.requests.lastWhere((r) => r.path == '$artistRoot/catalog');
    expect(request.queryParameters['city'], '杭州');
    expect(request.queryParameters['tag'], '对白');
    expect(
        a.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('$artistRoot/')),
        isEmpty);
    expect(t.takeException(), isNull);
  });

  testWidgets('认证补件展示四类提示与实际审核意见，沿用原服务且只提交原申请', (t) async {
    final old = FilePickerPlatform.instance;
    FilePickerPlatform.instance = Picker();
    addTearDown(() => FilePickerPlatform.instance = old);
    final original = artistRecord(kind: 'HALO', status: 'NEEDS_MATERIAL');
    original['data']['level'] = 2;
    original['data']['service_id'] = specKey;
    original['data']['review'] = {'reason': '请补充本人的清晰全身照片，其他原材料继续沿用。'};
    final path = '$artistRoot/people/$personKey/records/$recordKey/supplements';
    final a = artistAdapter(override: (r) {
      if (r.path == '$artistRoot/people/$personKey/records/$recordKey') {
        return envelope(original);
      }
      if (r.path == path) {
        return envelope(
            {...original, 'current_status': 'SUBMITTED', 'object_version': 3});
      }
      return null;
    });
    final s = (await t.runAsync(() => artistSession(a)))!;
    await host(
        t,
        s,
        const ArtistFormPage(
            mode: 'SUPPLEMENT', personId: personKey, recordId: recordKey));
    await show(t, find.text('沿用原认证申请'));
    expect(find.text('L2'), findsOneWidget);
    await show(t, find.text('本次实际补件意见'));
    expect(find.text('请补充本人的清晰全身照片，其他原材料继续沿用。'), findsOneWidget);
    for (final label in ['形象模卡', '生活照', '全身照', '补充材料（选填）']) {
      await show(t, find.text(label));
      expect(find.text(label), findsOneWidget);
    }
    expect(find.byType(CheckboxListTile), findsNothing);
    await input(t, 'reason', '按本次意见补充全身照。');
    await press(t, find.byKey(const ValueKey('artist-upload-REVIEW_EVIDENCE')));
    await press(t, find.byKey(const ValueKey('artist-submit')));
    await press(t, find.text('确认办理'));
    final write = a.requests.singleWhere((r) => r.path == path);
    expect(write.data, {
      'evidence_asset_ids': [assetKey],
      'note': '按本次意见补充全身照。'
    });
    expect(write.headers['If-Match'], '"2"');
    expect(
        a.requests.where((r) =>
            r.method == 'POST' &&
            (r.path.endsWith('/services') || r.path.endsWith('/halos'))),
        isEmpty);
    expect(find.text('真实结果页入口'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('窄屏完整显示授权对象长名称，展开选项也不省略或溢出', (t) async {
    const name = '这是一份用于核对本人授权对象的较长数字人名称，保留结尾以区分不同授权对象';
    final detail = detailData();
    (detail['avatars'][0]['data'] as Map)['display_name'] = name;
    final a = artistAdapter(
            override: (r) => r.path == '$artistRoot/people/$personKey'
                ? envelope(detail)
                : null),
        s = (await t.runAsync(() => artistSession(a)))!;
    await host(
        t,
        s,
        const ArtistFormPage(
            mode: 'CONSENT', personId: personKey, avatarId: avatarKey));
    t.view.physicalSize = const Size(320, 844);
    await t.pumpAndSettle();
    final selected = find.text(name);
    await show(t, selected);
    expect(t.widget<Text>(selected).overflow, isNot(TextOverflow.ellipsis));
    expect(t.getSize(selected).height, greaterThan(48));
    expect(t.takeException(), isNull);
    await press(t, find.byKey(ValueKey('artist-select-具体数字人-$avatarKey')));
    expect(find.text(name), findsWidgets);
    expect(t.takeException(), isNull);
    expect(
        a.requests.where(
            (r) => r.method == 'POST' && r.path.startsWith('$artistRoot/')),
        isEmpty);
  });

  for (final code in ['ARTIST_CONSENT_REQUIRED', 'ARTIST_HOSTING_REQUIRED']) {
    testWidgets('公开预览因$code被拒后清除过期公开资料', (t) async {
      final a = artistAdapter(override: (r) {
        if (r.path == '$artistRoot/catalog') {
          return envelope({
            'items': [
              {
                'listing_id': listingKey,
                'person_id': personKey,
                'avatar_id': avatarKey,
                'display_name': '已撤回的公开名称',
                'city': '测试城市',
                'introduction': '不应继续展示的公开简介',
                'tags': ['测试'],
                'audition_public': true,
                'preview_asset_ids': [assetKey],
                'halo_level': 1,
              }
            ],
            'next_cursor': null,
          });
        }
        if (r.path ==
            '$artistRoot/catalog/$listingKey/assets/$assetKey/content') {
          return envelope({'code': code}, status: 409, error: true);
        }
        return null;
      });
      final s = (await t.runAsync(() => artistSession(a)))!;
      await host(t, s, const ArtistCataloguePage(initialCity: '测试城市'));
      expect(find.text('已撤回的公开名称'), findsNothing);
      expect(find.text('不应继续展示的公开简介'), findsNothing);
      expect(find.text('读取这份获准预览'), findsNothing);
      expect(
          a.requests.where((r) =>
              r.path ==
              '$artistRoot/catalog/$listingKey/assets/$assetKey/content'),
          hasLength(1));
      expect(s.isLoggedIn, true);
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('本人建档不自填核验结果，完整输入才发送并进入结果页', (t) async {
    final a = artistAdapter(), s = await t.runAsync(() => artistSession(a));
    await host(t, s!, const ArtistFormPage(mode: 'PERSON'));
    expect(
        t
            .widget<FilledButton>(find.byKey(const ValueKey('artist-submit')))
            .onPressed,
        isNull);
    await input(t, 'name', '真实输入的档案名');
    await press(t, find.byKey(const ValueKey('artist-submit')));
    await press(t, find.text('确认办理'));
    final r = a.requests.singleWhere(
        (r) => r.method == 'POST' && r.path == '$artistRoot/people');
    expect(r.data, {'display_name': '真实输入的档案名'});
    expect(r.headers['X-Acting-Party'], personId);
    expect(find.text('真实结果页入口'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('未开实名服务只说明不可用，不发送自称实名结果', (t) async {
    final a = artistAdapter(), s = await t.runAsync(() => artistSession(a));
    await host(
        t, s!, const ArtistFormPage(mode: 'IDENTITY', personId: personKey));
    expect(
        t
            .widget<FilledButton>(find.byKey(const ValueKey('artist-submit')))
            .onPressed,
        isNull);
    expect(
        a.requests
            .where((r) => r.method == 'POST' && r.path.endsWith('/identity')),
        isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets('机构只读获托事项，不读取本人同意服务或提供本人授权按钮', (t) async {
    final a = artistAdapter(), s = (await t.runAsync(() => artistSession(a)))!;
    s.select(identity(orgId));
    await host(t, s, const ArtistPersonPage(personId: personKey));
    expect(find.text('当前为机构获托办理'), findsOneWidget);
    expect(
        a.requests.where((r) =>
            r.path.endsWith('/records') &&
            ['CONSENT', 'SERVICE', 'HALO', 'IDENTITY']
                .contains(r.queryParameters['kind'])),
        isEmpty);
    expect(find.textContaining('填写本人同意'), findsNothing);
    await show(t, find.text('本人的测试数字人'));
    expect(find.text('本人的测试数字人'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('未成年人已核验仍不能创建数字人或提交素材', (t) async {
    final a = artistAdapter(
            override: (r) => r.path == '$artistRoot/people/$personKey'
                ? envelope(detailData(age: 'MINOR'))
                : null),
        s = (await t.runAsync(() => artistSession(a)))!;
    await host(t, s, const ArtistFormPage(mode: 'AVATAR', personId: personKey));
    expect(
        t
            .widget<FilledButton>(find.byKey(const ValueKey('artist-submit')))
            .onPressed,
        isNull);
    expect(
        a.requests
            .where((r) => r.method == 'POST' && r.path.endsWith('/avatars')),
        isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets('本人脸声/用途/期限同意携带私有文件引用，未自动选择范围', (t) async {
    final old = FilePickerPlatform.instance;
    FilePickerPlatform.instance = Picker();
    addTearDown(() => FilePickerPlatform.instance = old);
    final a = artistAdapter(
            override: (r) => r.path.endsWith('/consents')
                ? envelope({
                    ...artistRecord(status: 'SUBMITTED'),
                    'data': {
                      ...r.data['consent'],
                      'declared_by': accountId,
                      'declared_at': '2026-10-21T00:00:00.000Z',
                      'review': null
                    }
                  })
                : null),
        s = (await t.runAsync(() => artistSession(a)))!;
    await host(
        t,
        s,
        const ArtistFormPage(
            mode: 'CONSENT', personId: personKey, avatarId: avatarKey));
    expect(
        t
            .widget<FilledButton>(find.byKey(const ValueKey('artist-submit')))
            .onPressed,
        isNull);
    await press(t, find.widgetWithText(CheckboxListTile, '形象 / 脸部'));
    await press(t, find.widgetWithText(CheckboxListTile, '仅私人档案'));
    await input(t, 'territories', 'CN');
    await dateInput(t, 'from', DateTime(2026, 1, 1, 9));
    await dateInput(t, 'until', DateTime(2030, 1, 1, 9));
    await input(t, 'terms', '本人仅同意用于这个私人档案。');
    await press(
        t, find.byKey(const ValueKey('artist-upload-CONSENT_EVIDENCE')));
    await press(t, find.byKey(const ValueKey('artist-submit')));
    await press(t, find.text('确认办理'));
    final r = a.requests.singleWhere((r) => r.path.endsWith('/consents'));
    expect(r.data['avatar_id'], avatarKey);
    expect(r.data['consent']['features'], ['FACE']);
    expect(r.data['consent']['purposes'], ['PRIVATE_ARCHIVE']);
    expect(r.data['consent']['evidence_asset_ids'], [assetKey]);
    expect(r.data['consent']['grantee_party_id'], personId);
    expect(r.data['consent']['valid_from'],
        DateTime(2026, 1, 1, 9).toUtc().toIso8601String());
    expect(r.data['consent']['valid_until'],
        DateTime(2030, 1, 1, 9).toUtc().toIso8601String());
    expect(t.takeException(), isNull);
  });
  testWidgets('412保留原因，显式核对新版本后才按新版本再次提交', (t) async {
    var reads = 0, writes = 0;
    final path = '$artistRoot/people/$personKey/records/$recordKey/withdrawals';
    final a = artistAdapter(
            override: (r) =>
                r.path == '$artistRoot/people/$personKey/records/$recordKey'
                    ? envelope(artistRecord(version: ++reads == 1 ? 2 : 3))
                    : r.path == path
                        ? ++writes == 1
                            ? envelope({'code': 'PRECONDITION_FAILED'},
                                status: 412, error: true)
                            : envelope(
                                artistRecord(status: 'WITHDRAWN', version: 4))
                        : null),
        s = (await t.runAsync(() => artistSession(a)))!;
    await host(
        t,
        s,
        const ArtistFormPage(
            mode: 'WITHDRAW', personId: personKey, recordId: recordKey));
    await input(t, 'reason', '本人撤回这一次用途');
    await press(t, find.byKey(const ValueKey('artist-submit')));
    await press(t, find.text('确认办理'));
    expect(
        t
            .widget<TextField>(
                find.byKey(const ValueKey('artist-field-reason')))
            .controller!
            .text,
        '本人撤回这一次用途');
    expect(writes, 1);
    await press(t, find.text('读取当前艺人记录核对'));
    await press(t, find.text('保留本页输入，按当前版本继续'));
    await press(t, find.byKey(const ValueKey('artist-submit')));
    await press(t, find.text('确认办理'));
    final requests = a.requests.where((r) => r.path == path).toList();
    expect(requests.map((r) => r.headers['If-Match']), ['"2"', '"3"']);
    expect(requests.last.data, {'reason': '本人撤回这一次用途'});
    expect(requests.last.headers['Idempotency-Key'],
        isNot(requests.first.headers['Idempotency-Key']));
    expect(t.takeException(), isNull);
  });
  testWidgets('表单返回先核对未保存输入，取消离开后文字保留', (t) async {
    final a = artistAdapter(), s = (await t.runAsync(() => artistSession(a)))!;
    await host(t, s, const ArtistFormPage(mode: 'PERSON'));
    await input(t, 'name', '尚未交出的姓名');
    await t.tap(find.byType(BackButton));
    await t.pumpAndSettle();
    expect(find.text('离开当前表单？'), findsOneWidget);
    await t.tap(find.text('返回核对'));
    await t.pumpAndSettle();
    expect(
        t
            .widget<TextField>(find.byKey(const ValueKey('artist-field-name')))
            .controller!
            .text,
        '尚未交出的姓名');
    expect(
        a.requests
            .where((r) => r.method == 'POST' && r.path == '$artistRoot/people'),
        isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets('旧入口接艺人新模块，公开目录不读取私有详情', (t) async {
    final a = artistAdapter(), s = (await t.runAsync(() => artistSession(a)))!;
    await nav.openApp(t, s, route: '/my-humans');
    expect(find.byType(ArtistPeoplePage), findsOneWidget);
    await t.pumpWidget(const SizedBox.shrink());
    await nav.openApp(t, s, route: '/discover');
    expect(find.byType(ArtistCataloguePage), findsOneWidget);
    expect(
        a.requests
            .where((r) => r.path == '$artistRoot/catalog')
            .last
            .headers
            .containsKey('X-Acting-Party'),
        false);
    expect(t.takeException(), isNull);
  });
  testWidgets('记录重新读取失权后立即清理私有正文与原因', (t) async {
    var reads = 0;
    final a = artistAdapter(
            override: (r) => r.path ==
                    '$artistRoot/people/$personKey/records/$recordKey'
                ? ++reads == 1
                    ? envelope(artistRecord())
                    : envelope({'code': 'FORBIDDEN'}, status: 403, error: true)
                : null),
        s = (await t.runAsync(() => artistSession(a)))!;
    await host(
        t, s, const ArtistRecordPage(personId: personKey, recordId: recordKey));
    expect(find.text('本人私有同意原约定'), findsOneWidget);
    await press(t, find.text('重新读取当前记录'));
    expect(s.artistsAccessDenied, true);
    expect(find.text('本人私有同意原约定'), findsNothing);
    expect(find.textContaining('私有内容已清空'), findsOneWidget);
    expect(find.byType(ReadAccessDeniedPage), findsOneWidget);
    expect(find.text('当前无法\n读取这页'), findsOneWidget);
    expect(find.byKey(const ValueKey('read-denied-retry')), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('未知提交锁定输入和返回，只恢复原body与请求key', (t) async {
    var writes = 0;
    final a = artistAdapter(
            override: (r) => r.path == '$artistRoot/people' &&
                    r.method == 'POST' &&
                    ++writes == 1
                ? envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                    status: 503, error: true)
                : null),
        s = (await t.runAsync(() => artistSession(a)))!;
    await host(t, s, const ArtistFormPage(mode: 'PERSON'));
    await input(t, 'name', '原始本人档案');
    await press(t, find.byKey(const ValueKey('artist-submit')));
    await press(t, find.text('确认办理'));
    final original = a.requests
        .lastWhere((r) => r.path == '$artistRoot/people' && r.method == 'POST');
    expect(
        t
            .widget<TextField>(find.byKey(const ValueKey('artist-field-name')))
            .enabled,
        false);
    await t.tap(find.byType(BackButton));
    await t.pumpAndSettle();
    expect(find.text('离开当前表单？'), findsNothing);
    expect(find.byType(ArtistFormPage), findsOneWidget);
    await press(t, find.text('恢复原艺人操作'));
    await press(t, find.text('确认办理'));
    final restored = a.requests
        .lastWhere((r) => r.path == '$artistRoot/people' && r.method == 'POST');
    expect(restored.headers['Idempotency-Key'],
        original.headers['Idempotency-Key']);
    expect(restored.data, original.data);
    expect(s.artistsPending, isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets('HALO审核服务不选择数字人、不设提醒，价格来自已审商品', (t) async {
    final offers = servicesData();
    offers['offers']['items'][0]['title'] = '合成L2审核服务';
    offers['offers']['items'][0]['price_minor'] = 1000;
    offers['offers']['items'][0]['specification'] =
        serviceSpec(kind: 'HALO_REVIEW');
    offers['offers']['items'][0]
        ['product_profile'] = {'version': 'V5', 'type': 'HALO_REVIEW'};
    final result = artistRecord(kind: 'SERVICE', status: 'REQUESTED');
    result['avatar_id'] = null;
    result['data']['kind'] = 'HALO_REVIEW';
    result['data']['price_minor'] = 1000;
    result['data']['specification'] = serviceSpec(kind: 'HALO_REVIEW');
    final a = artistAdapter(
            override: (r) => r.path == '$artistRoot/services'
                ? envelope(offers)
                : r.path == '$artistRoot/people/$personKey/services'
                    ? envelope(result)
                    : null),
        s = (await t.runAsync(() => artistSession(a)))!;
    await host(
        t,
        s,
        const ArtistFormPage(
            mode: 'SERVICE', personId: personKey, avatarId: avatarKey));
    await press(t, find.byType(DropdownButtonFormField<String>).first);
    await press(t, find.text('合成L2审核服务 · ¥10.00').last);
    expect(find.text('具体数字人'), findsNothing);
    await press(t, find.byKey(const ValueKey('artist-submit')));
    await press(t, find.text('确认办理'));
    final r = a.requests.singleWhere((r) =>
        r.method == 'POST' &&
        r.path == '$artistRoot/people/$personKey/services');
    expect(r.data,
        {'avatar_id': null, 'spec_id': specKey, 'renewal_reminder': false});
    expect(r.headers.containsKey('If-Match'), false);
    expect(t.takeException(), isNull);
  });
  testWidgets('表单已离页时，迟到档案不再写入已释放的控制器', (t) async {
    final deferred = Completer<ResponseBody>();
    final a = artistAdapter(
            override: (r) => r.path == '$artistRoot/people/$personKey'
                ? deferred.future
                : null),
        s = (await t.runAsync(() => artistSession(a)))!;
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: s,
        child: const MaterialApp(
            home: ArtistFormPage(
                mode: 'CONSENT', personId: personKey, avatarId: avatarKey))));
    await t.pump();
    await t.pumpWidget(const SizedBox.shrink());
    deferred.complete(envelope(detailData()));
    await nav.frames(t);
    expect(t.takeException(), isNull);
  });
}
