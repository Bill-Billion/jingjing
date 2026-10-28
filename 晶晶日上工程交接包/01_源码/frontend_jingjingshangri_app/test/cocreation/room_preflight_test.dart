import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/cocreation/cocreation_pages.dart';
import '../account/fake_account_api.dart';
import '../customization/customization_fixtures.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import '../stock/v5_test_host.dart';

void main() {
  testWidgets('从本人正式故事进入共创会预选；缺承制目录不猜主体或建房', (t) async {
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path == '/api/v1/customization-requests') {
        return envelope({
          'items': [summary(status: 'SUBMITTED')],
          'next_cursor': null
        });
      }
      if (r.path == '/api/v1/cocreation/rules') {
        return envelope({
          'items': [
            {
              'id': secondTemplateId,
              'rule': {'version': '合成规则', 'participation_terms': '逐人确认'}
            }
          ]
        });
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const CocreationPage(view: 'new', recordId: requestId));
    final selector = find.byWidgetPredicate((w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == '本人已提交故事');
    await reveal(t, selector);
    expect(t.widget<DropdownButtonFormField<String>>(selector).initialValue,
        requestId);
    final title = find.widgetWithText(TextField, '共创名称');
    await reveal(t, title);
    await t.enterText(title, '我们的家庭影片');
    await t.tap(find.byType(BackButton));
    await frames(t);
    expect(find.text('离开未提交的内容？'), findsOneWidget);
    await t.tap(find.text('继续填写'));
    await frames(t);
    expect(t.widget<TextField>(title).controller!.text, '我们的家庭影片');
    await reveal(t, find.text('保存共创房间'));
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '保存共创房间'))
            .onPressed,
        isNull);
    expect(
        a.requests.where((r) =>
            r.method == 'POST' && r.path.startsWith('/api/v1/cocreation/')),
        isEmpty);
    expect(
        a.requests.where((r) =>
            r.path.contains('/engagement/buyers') ||
            r.path.startsWith('/api/v1/parties/')),
        isEmpty);
    expect(t.takeException(), isNull);
  });
}
