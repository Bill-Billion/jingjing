import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/auditions/auditions_pages.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'app_navigation_test.dart' show openApp;

void main() {
  for (final entry in [
    ('/auditions/catalog', '郑州'),
    ('/auditions', '郑州市'),
  ]) {
    testWidgets('${entry.$1}承接城市并在目录GET中保持原查询值', (tester) async {
      late FakeAccountAdapter adapter;
      adapter = FakeAccountAdapter(handler: (request) {
        if (request.path == '/api/v1/auditions/catalog') {
          return envelope({'items': [], 'next_cursor': null});
        }
        return adapter.defaultReply(request);
      });
      final session = (await tester.runAsync(() => buyerSession(adapter)))!;
      await openApp(tester, session,
          route: Uri(path: entry.$1, queryParameters: {'city': entry.$2})
              .toString());
      expect(find.byType(AuditionsPage), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      final request = adapter.requests.singleWhere(
          (request) => request.path == '/api/v1/auditions/catalog');
      expect(request.method, 'GET');
      expect(request.queryParameters['city'], entry.$2);
      expect(request.headers['X-Acting-Party'], isNull);
      final field = tester.widget<TextField>(find.byWidgetPredicate((widget) =>
          widget is TextField && widget.decoration?.labelText == '城市筛选'));
      expect(field.controller!.text, entry.$2);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}
