import 'dart:io';
import 'package:flutter/material.dart';
import 'account/account_theme.dart';
import 'offline/demo_app.dart';
import 'offline/demo_persistence.dart';
import 'offline/demo_store.dart';

/// Defense in depth: this entry never instantiates a production API or session.
class _OfflineNetwork extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) =>
      throw const SocketException(
          'Offline demonstration does not allow network access');
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = _OfflineNetwork();
  if (!const bool.fromEnvironment('JX_OFFLINE_DEMO')) {
    runApp(MaterialApp(
        theme: AccountTheme.data,
        home: const Scaffold(
            body: Center(
          child: Text('请使用离线演示构建配置启动此入口。'),
        ))));
    return;
  }
  runApp(const _OfflineBootstrap());
}

class _OfflineBootstrap extends StatefulWidget {
  const _OfflineBootstrap();
  @override
  State<_OfflineBootstrap> createState() => _OfflineBootstrapState();
}

class _OfflineBootstrapState extends State<_OfflineBootstrap> {
  DemoStore? store;
  bool failed = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final persistence = await SqliteDemoPersistence.open();
      final loaded = DemoStore(persistence);
      try {
        await loaded.load();
      } catch (_) {
        loaded.dispose();
        await persistence.close();
        rethrow;
      }
      if (mounted) {
        setState(() {
          store = loaded;
          failed = false;
        });
      } else {
        loaded.dispose();
        await persistence.close();
      }
    } catch (_) {
      if (mounted) setState(() => failed = true);
    }
  }

  @override
  void dispose() {
    store?.dispose();
    store?.persistence.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (store != null) return OfflineDemoApp(store: store!);
    return MaterialApp(
        theme: AccountTheme.data,
        home: Scaffold(
            body: SafeArea(
                child: Center(
          child: Padding(
              padding: const EdgeInsets.all(24),
              child: failed
                  ? Column(mainAxisSize: MainAxisSize.min, children: [
                      const Text('本机演示资料暂时无法读取'),
                      const SizedBox(height: 12),
                      const Text('原资料已保留。请重试或联系开发者检查设备存储。'),
                      const SizedBox(height: 12),
                      FilledButton(
                          onPressed: () {
                            setState(() => failed = false);
                            load();
                          },
                          child: const Text('重试')),
                    ])
                  : const CircularProgressIndicator()),
        ))));
  }
}
