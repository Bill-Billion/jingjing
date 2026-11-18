// Local-only entry point: runs the real account page without a test session.
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_page.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/privacy/closure_reference.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (const bool.fromEnvironment('SEED_SYNTHETIC_REFERENCE')) {
    const account = String.fromEnvironment('SYNTHETIC_ACCOUNT_ID');
    const request = String.fromEnvironment('SYNTHETIC_REQUEST_ID');
    if ((await ClosureReferenceStore.read(accountId: account)).isEmpty) {
      await ClosureReferenceStore.begin(account, request);
    }
  }
  runApp(MultiProvider(providers: [
    ChangeNotifierProvider(create: (_) => AccountSession()),
    ChangeNotifierProvider(create: (_) => UserProvider()),
  ], child: const MaterialApp(home: AccountPage())));
}
