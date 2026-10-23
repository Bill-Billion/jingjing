import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/privacy/privacy_pages.dart';
import '../account/fake_account_api.dart';
import '../engagement/community_safety_test.dart' show communitySession;

void main() {
  testWidgets('偏好读取真实false初值，机构身份也按本人读取，不自动打开个性化和营销', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path == '/api/v1/privacy/preferences'
            ? envelope({
                'object_version': 0,
                'personalization': false,
                'marketing': false,
                'rest_reminder_minutes': 0
              })
            : a.defaultReply(r));
    final s = (await tester.runAsync(() => communitySession(a)))!;
    s.select(identity(orgId));
    await tester.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
        value: s,
        child: const MaterialApp(home: PrivacyPage(view: 'preferences'))));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 35)));
    await tester.pumpAndSettle();
    final checks =
        tester.widgetList<SwitchListTile>(find.byType(SwitchListTile)).toList();
    expect(checks, hasLength(2));
    expect(checks.every((x) => x.value == false), true);
    expect(find.text('休息提醒间隔（分钟）'), findsOneWidget);
    final range = find.text('0为关闭；开启时15—240分钟。');
    expect(range, findsOneWidget);
    expect(tester.getRect(range).left, greaterThanOrEqualTo(0));
    expect(tester.getRect(range).right, lessThanOrEqualTo(320));
    final request =
        a.requests.singleWhere((r) => r.path == '/api/v1/privacy/preferences');
    expect(request.headers.containsKey('X-Acting-Party'), false);
    expect(a.requests.where((r) => r.method == 'PATCH'), isEmpty);
  });
}
