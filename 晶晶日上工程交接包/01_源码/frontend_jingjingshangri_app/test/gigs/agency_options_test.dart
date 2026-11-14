import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/gigs/gig_api.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import '../navigation/app_navigation_test.dart' as nav;
import 'gig_fixtures.dart';
import 'package:jingjingshangri_app/artists/artists_forms.dart';
import '../artists/artists_fixtures.dart' as af;
import '../artists/artists_widgets_test.dart' as aw;
import 'gig_widget_test.dart' show reveal;

Map<String, dynamic> candidate() => {
      'listing_id': gigRecordId,
      'person_id': personId,
      'avatar_id': avatarId,
      'artist_party_id': personId,
      'display_name': '合成公开艺人',
      'city': '合成城市'
    };
void main() {
  testWidgets('本人委托显示当前合作机构名称，仍由本人选择权限并上传证明', (t) async {
    final relation = gigData('RELATION', status: 'ACTIVE');
    final a = af.artistAdapter(override: (r) {
      if (r.path.endsWith('/gigs/records')) {
        return envelope({
          'items': [relation],
          'next_cursor': null
        });
      }
      if (r.path.endsWith('/gigs/relations/$relationId/parties')) {
        return envelope({
          'record_id': relationId,
          'source': 'CURRENT_DISPLAY_NAME',
          'parties': [
            {
              'party_id': relation['owner_party_id'],
              'display_name': '已接受的合成机构'
            },
            {'party_id': personId, 'display_name': '合成本人'}
          ]
        });
      }
      return null;
    });
    final s = (await t.runAsync(() => af.artistSession(a)))!;
    await aw.host(
        t, s, const ArtistFormPage(mode: 'DELEGATION', personId: af.personKey));
    final field = find.byWidgetPredicate((w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == '已接受的机构合作关系');
    await aw.show(t, field);
    await t.tap(field);
    await t.pumpAndSettle();
    expect(find.text('已接受的合成机构 · 合作至 2099-12-01'), findsWidgets);
    await t.tap(find.text('已接受的合成机构 · 合作至 2099-12-01').last);
    await t.pumpAndSettle();
    expect(find.text('受托机构主体编号'), findsNothing);
    expect(t.takeException(), isNull);
  });

  test('邀请选项严格校验主体、重复记录、游标并遍历过滤空页', () async {
    late FakeAccountAdapter a;
    var mode = 'empty';
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/relation-options')) {
        final cursor = r.queryParameters['cursor'];
        return envelope({
          'party_id': mode == 'wrong' ? orgId : personId,
          'items': mode == 'duplicate'
              ? [candidate(), candidate()]
              : mode == 'empty' && cursor == null
                  ? []
                  : [candidate()],
          'next_cursor': mode == 'loop' || mode == 'empty' && cursor == null
              ? relationId
              : null
        });
      }
      return a.defaultReply(r);
    });
    final s = await buyerSession(a), api = GigApi(s);
    expect((await api.relationOptions()).single['display_name'], '合成公开艺人');
    for (final value in ['wrong', 'duplicate', 'loop']) {
      mode = value;
      await expectLater(api.relationOptions(), throwsA(isA<AccountError>()));
    }
    s.dispose();
  });
  testWidgets('首次机构邀请使用公开姓名选择，不要求客户填写主体编号', (t) async {
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/catalogue')) return envelope(catalogue());
      if (r.path.endsWith('/relation-options')) {
        return envelope({
          'party_id': orgId,
          'items': [candidate()],
          'next_cursor': null
        });
      }
      return a.defaultReply(r);
    });
    final s = (await t.runAsync(() => buyerSession(a)))!;
    final org = identity(orgId);
    org['party']['capabilities'] = [
      {'code': 'MCN', 'current_status': 'ACTIVE'}
    ];
    s.select(org);
    await nav.openApp(t, s, route: '/gigs/relations/new');
    final select = find.byWidgetPredicate((w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == '选择公开展示的艺人');
    await reveal(t, select);
    await t.tap(select);
    await t.pumpAndSettle();
    await t.tap(find.text('合成公开艺人 · 合成城市').last);
    await t.pumpAndSettle();
    expect(find.text('合作本人主体编号'), findsNothing);
    expect(find.text('合成公开艺人 · 合成城市'), findsOneWidget);
    expect(
        a.requests
            .where((r) => r.path.endsWith('/relation-options'))
            .single
            .headers['X-Acting-Party'],
        orgId);
    expect(t.takeException(), isNull);
  });
}
