import 'package:flutter/material.dart';
import '../navigation/app_shell.dart';

/// Historical callers use the current shell too; no old page can be mounted by
/// this compatibility entry. New named routes instantiate AppShell directly.
class MainScaffold extends StatelessWidget {
  const MainScaffold({super.key, this.initialTab = 0});
  final int initialTab;
  @override
  Widget build(BuildContext context) => AppShell(initialTab: initialTab);
}
