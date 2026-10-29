import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/artists/artists_forms.dart';
import '../account/fake_account_api.dart';
import 'artists_fixtures.dart';
import 'artists_widgets_test.dart' as forms;

Finder field(String label) => find.byWidgetPredicate((w) =>
    w is DropdownButtonFormField<String> &&
    w.key is ValueKey<String> &&
    (w.key as ValueKey<String>).value.startsWith('artist-select-$label-'));
DropdownButton<String> dropdown(WidgetTester t, String label) =>
    t.widget<DropdownButton<String>>(find.descendant(
        of: field(label), matching: find.byType(DropdownButton<String>)));
Future<void> choose(WidgetTester t, String label, String value) async {
  await forms.show(t, field(label));
  final option = dropdown(t, label).items!.firstWhere((o) => o.value == value);
  final text = ((option.child as Padding).child as Text).data!;
  await forms.press(t, field(label));
  await t.tap(find.text(text).last);
  await t.pumpAndSettle();
}

void main() {
  for (final delegated in [false, true]) {
    testWidgets('${delegated ? '受托' : '本人'}公开申请只选同批JPEG/PNG且随原请求恢复', (t) async {
      final old = FilePickerPlatform.instance;
      FilePickerPlatform.instance = forms.Picker(name: 'portrait.png');
      addTearDown(() => FilePickerPlatform.instance = old);
      final assets = <String, Map<String, dynamic>>{};
      var writes = 0;
      final a = artistAdapter(override: (r) {
        if (r.path.endsWith('/records')) {
          final kind = r.queryParameters['kind'];
          final record = artistRecord(
              kind: kind,
              status: kind == 'DELEGATION'
                  ? 'ACTIVE'
                  : kind == 'LOOK'
                      ? 'RECORDED'
                      : 'APPROVED');
          if (kind == 'DELEGATION') {
            record['data']['actions'] = [
              'READ_PROFILE',
              'MANAGE_MATERIALS',
              'SUBMIT_LISTING'
            ];
          }
          return envelope({
            'items': kind == 'VOICE' ? [] : [record],
            'next_cursor': null
          });
        }
        if (r.path.endsWith('/assets') && r.method == 'POST') {
          final id = assets.isEmpty ? assetKey : specKey;
          final data = assetData(bytes: r.data, purpose: 'AVATAR_MATERIAL')
            ..['id'] = id
            ..['media_type'] = r.queryParameters['media_type'];
          assets[id] = data;
          return envelope(data);
        }
        for (final asset in assets.entries) {
          if (r.path == '$artistRoot/assets/${asset.key}') {
            return envelope(asset.value);
          }
        }
        if (r.path.endsWith('/listings')) {
          writes++;
          if (writes == 1) {
            return envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                status: 503, error: true);
          }
          final record = artistRecord(kind: 'LISTING', status: 'SUBMITTED');
          record['data'] = r.data['listing'];
          return envelope(record);
        }
        return null;
      });
      final s = (await t.runAsync(() => artistSession(a)))!;
      if (delegated) s.select(identity(orgId));
      await forms.host(
          t,
          s,
          const ArtistFormPage(
              mode: 'LISTING', personId: personKey, avatarId: avatarKey));
      await forms.input(t, 'name', '待审公开名');
      await forms.input(t, 'city', '杭州');
      await forms.input(t, 'intro', '仅本次独立审核后展示');
      await forms.input(t, 'tags', '表演');
      if (delegated) {
        await forms.input(t, 'consent', recordKey);
      } else {
        await choose(t, '本人已批准且有效的同意', recordKey);
      }
      await choose(t, '已记录造型版本', recordKey);
      await forms.press(t, find.text('选择并上传私有材料'));
      const portraitLabel = '选择本次预览中的照片';
      await forms.show(t, field(portraitLabel));
      expect(dropdown(t, portraitLabel).items!.map((o) => o.value),
          ['', assetKey]);
      await choose(t, portraitLabel, assetKey);
      FilePickerPlatform.instance = forms.Picker(name: 'voice.mp3');
      await forms.press(t, find.text('选择并上传私有材料'));
      await forms.show(t, field(portraitLabel));
      expect(dropdown(t, portraitLabel).items!.map((o) => o.value),
          ['', assetKey]);
      expect(dropdown(t, portraitLabel).value, '');
      await choose(t, portraitLabel, assetKey);
      await choose(t, portraitLabel, '');
      expect(dropdown(t, portraitLabel).value, '');
      await choose(t, portraitLabel, assetKey);
      await forms.press(t, find.byKey(const ValueKey('artist-submit')));
      await forms.press(t, find.text('确认办理'));
      final first = a.requests.lastWhere((r) => r.path.endsWith('/listings'));
      expect(first.data['listing']['primary_portrait_asset_id'], assetKey);
      expect(first.data['listing']['preview_asset_ids'], [assetKey, specKey]);
      expect(first.headers['X-Acting-Party'], delegated ? orgId : personId);
      expect(s.artistsPending, isNotEmpty);
      t
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .jumpTo(0);
      await t.pumpAndSettle();
      await forms.press(t, find.text('恢复原艺人操作'));
      await forms.press(t, find.text('确认办理'));
      final last = a.requests.lastWhere((r) => r.path.endsWith('/listings'));
      expect(last.data, first.data);
      expect(last.headers['Idempotency-Key'], first.headers['Idempotency-Key']);
      expect(s.artistsPending, isEmpty);
      expect(find.text('真实结果页入口'), findsOneWidget);
      expect(a.requests.where((r) => r.path.contains('/catalog')), isEmpty);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('仅公开提交委托不猜材料类型，也不越权读取照片', (t) async {
    final a = artistAdapter(override: (r) {
      if (r.path.endsWith('/records') &&
          r.queryParameters['kind'] == 'DELEGATION') {
        final record = artistRecord(kind: 'DELEGATION', status: 'ACTIVE');
        record['data']['actions'] = ['READ_PROFILE', 'SUBMIT_LISTING'];
        return envelope({
          'items': [record],
          'next_cursor': null
        });
      }
      return null;
    });
    final s = (await t.runAsync(() => artistSession(a)))!;
    s.select(identity(orgId));
    await forms.host(
        t,
        s,
        const ArtistFormPage(
            mode: 'LISTING', personId: personKey, avatarId: avatarKey));
    await forms.input(t, 'existingMaterials', assetKey);
    await forms.show(t, find.textContaining('当前委托仅允许提交指定材料编号'));
    expect(a.requests.where((r) => r.path.startsWith('$artistRoot/assets/')),
        isEmpty);
    expect(find.text('不设置主肖像'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
