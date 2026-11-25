import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/artists/artists_api.dart';
import 'package:jingjingshangri_app/artists/artists_models.dart';
import 'package:jingjingshangri_app/artists/artists_pages.dart';
import '../account/fake_account_api.dart';
import 'artists_fixtures.dart';
import 'artists_widgets_test.dart' as view;

void main() {
  test('员工读取采用本人的机构身份和服务器交集，不继承机构整份委托', () async {
    final adapter = artistAdapter(
        override: (r) => r.path == '$artistRoot/people/$personKey'
            ? envelope(detailData()..['allowed_actions'] = ['READ_PROFILE'])
            : null);
    final session = await artistSession(adapter);
    session.select(identity(orgId, owner: false));
    final api = ArtistsApi(session);
    expect((await api.people()).items.single.id, personKey);
    final detail = await api.person(personKey);
    expect(await api.actions(detail), {'READ_PROFILE'});
    expect(adapter.requests.last.headers['X-Acting-Party'], orgId);
    expect(adapter.requests.where((r) => r.path.endsWith('/records')), isEmpty);
    session.select(identity(personId));
    expect((await api.person(personKey)).person.owner, personId);
  });

  test('员工遇到旧接口缺少当前权限时不从整份机构委托推断写权限', () async {
    final session = await artistSession(artistAdapter());
    session.select(identity(orgId, owner: false));
    final api = ArtistsApi(session);
    expect(await api.actions(await api.person(personKey)), isEmpty);
  });

  test('当前权限拒绝未知、重复、空值；允许明确的空集合', () {
    for (final actions in [
      null,
      ['OWNER'],
      ['READ_PROFILE', 'READ_PROFILE']
    ]) {
      expect(
          () => ArtistDetail.parse(
              detailData()..['allowed_actions'] = actions, personKey),
          throwsA(isA<AccountError>()));
    }
    expect(
        ArtistDetail.parse(detailData()..['allowed_actions'] = [], personKey)
            .allowedActions,
        isEmpty);
  });

  for (final materials in [false, true]) {
    testWidgets('员工人物页实际读取并按素材权限显示操作：$materials', (t) async {
      final adapter = artistAdapter(
          override: (r) => r.path == '$artistRoot/people/$personKey'
              ? envelope(detailData()
                ..['allowed_actions'] = [
                  'READ_PROFILE',
                  if (materials) 'MANAGE_MATERIALS'
                ])
              : null);
      final session = (await t.runAsync(() => artistSession(adapter)))!;
      session.select(identity(orgId, owner: false));
      await view.host(t, session, const ArtistPersonPage(personId: personKey));
      expect(
          adapter.requests.any((r) =>
              r.path == '$artistRoot/people/$personKey' &&
              r.headers['X-Acting-Party'] == orgId),
          isTrue);
      expect(find.text('从你的本人档案开始'), findsNothing);
      expect(find.text('建立一个数字人档案'), findsNothing);
      expect(find.text('本人确认机构代办范围'), findsNothing);
      final variant = find.text('保存本人的测试数字人的造型或声音版本');
      if (materials) {
        await view.show(t, variant);
        expect(variant, findsOneWidget);
      } else {
        // Force the lazy list to build its later rows before checking absence.
        await t.drag(find.byType(Scrollable).first, const Offset(0, -700));
        await t.pumpAndSettle();
        expect(variant, findsNothing);
      }
    });
  }
}
