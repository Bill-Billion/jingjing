// Historical screenshot/layout suites still mount MainScaffold. It now uses
// the current AppShell, so supply a real AccountSession backed only by test IO.
// This fixture never translates an old production token into a new login.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/widgets/main_scaffold.dart';
import '../account/fake_account_api.dart';
import '../gigs/gig_fixtures.dart' as gigs;
import '../projects/project_fixtures.dart' as projects;

Future<AccountSession> historicalLayoutSession(WidgetTester tester,
    {required bool loggedIn}) async {
  late FakeAccountAdapter adapter;
  adapter = FakeAccountAdapter(handler: (request) {
    if (request.path == '/api/v1/licensing/records') {
      return envelope({'items': [], 'next_cursor': null});
    }
    if (request.path == '/api/v1/gigs/catalogue') {
      return envelope(gigs.catalogue());
    }
    if (request.path == '/api/v1/projects/catalogue') {
      return envelope(projects.projectCatalogueData());
    }
    return adapter.defaultReply(request);
  });
  final session = AccountSession(api: adapter.createApi());
  if (loggedIn) {
    await tester
        .runAsync(() => session.login('13800000000', invitationId, '123456'));
    session.select(identity(personId));
  }
  expect(session.isLoggedIn, loggedIn);
  addTearDown(session.dispose);
  return session;
}

class HistoricalLayoutProviders extends StatelessWidget {
  const HistoricalLayoutProviders(
      {super.key,
      required this.user,
      required this.session,
      required this.child});
  final UserProvider user;
  final AccountSession session;
  final Widget child;
  @override
  Widget build(BuildContext context) => MultiProvider(providers: [
        ChangeNotifierProvider<UserProvider>.value(value: user),
        ChangeNotifierProvider<AccountSession>.value(value: session),
      ], child: child);
}

void expectCurrentShell(WidgetTester tester, Widget page) {
  expect(tester.takeException(), isNull);
  if (page is! MainScaffold) return;
  final bar = find.byType(NavigationBar);
  expect(bar, findsOneWidget);
  expect(tester.widget<NavigationBar>(bar).selectedIndex, page.initialTab);
  for (final title in ['首页', '入戏', '培育', '成角', '我的']) {
    expect(
        find.descendant(of: bar, matching: find.text(title)), findsOneWidget);
  }
}
