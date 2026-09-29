import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'app.dart';
import 'account/account_session.dart';
import 'account/account_theme.dart';
import 'services/user_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  ErrorWidget.builder = (_) => const _AppFailure();
  runApp(
    MultiProvider(
      providers: [
        // Retained only so real login can clear historical local tokens. The
        // current startup does not restore legacy data or initialise its API.
        ChangeNotifierProvider(create: (_) => UserProvider()),
        ChangeNotifierProvider(create: (_) => AccountSession()),
      ],
      child: const JingjingShangriApp(),
    ),
  );
}

class _AppFailure extends StatelessWidget {
  const _AppFailure();
  @override
  Widget build(BuildContext context) {
    final navigator = Navigator.maybeOf(context);
    return Material(
        color: AccountTheme.canvas,
        child: Center(
            child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.cloud_off_outlined,
                      color: AccountTheme.accent, size: 34),
                  const SizedBox(height: 16),
                  const Text('页面暂时无法显示',
                      style: TextStyle(color: AccountTheme.text, fontSize: 20)),
                  const SizedBox(height: 10),
                  Text(navigator == null ? '请重新打开应用后再试。' : '可以返回首页，重新打开这个页面。',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          color: AccountTheme.muted,
                          fontSize: 14,
                          height: 1.6)),
                  if (navigator != null) ...[
                    const SizedBox(height: 20),
                    FilledButton(
                        onPressed: () => navigator.pushNamedAndRemoveUntil(
                            '/', (_) => false),
                        child: const Text('返回首页')),
                  ],
                ]))));
  }
}
