import 'package:flutter/material.dart';
import '../../account/account_theme.dart';

/// Cold starts enter the current shell regardless of historical local tokens.
/// Private deep links bypass this page so bootstrap never replaces their route.
class SplashPage extends StatefulWidget {
  const SplashPage({super.key});
  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.pushReplacementNamed(context, '/home');
    });
  }

  @override
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: AccountTheme.canvas,
        body: SafeArea(
            child: Center(
                child: Text('晶晶日上',
                    style: TextStyle(
                        color: AccountTheme.text,
                        fontSize: 28,
                        fontWeight: FontWeight.w700)))),
      );
}
