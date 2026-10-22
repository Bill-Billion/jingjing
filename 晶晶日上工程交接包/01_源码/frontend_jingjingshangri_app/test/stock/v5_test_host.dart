import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';

Future<void> frames(WidgetTester t) async {
  for (var i = 0; i < 25; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
}

Future<void> host(WidgetTester t, AccountSession s, Widget page) async {
  t.view.physicalSize = const Size(390, 844);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.reset);
  await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
      value: s, child: MaterialApp(home: page)));
  await frames(t);
}

Future<void> reveal(WidgetTester t, Finder f) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await t.pump();
  if (f.evaluate().isEmpty) {
    t.state<ScrollableState>(find.byType(Scrollable).first).position.jumpTo(0);
    await t.pump();
    await t.scrollUntilVisible(f, 250,
        scrollable: find.byType(Scrollable).first);
  }
  await t.ensureVisible(f);
  await t.pump();
}
