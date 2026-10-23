// Four independent disposable fixture groups for final design acceptance only. lib/main.dart never imports or restores these sessions.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/app.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!const bool.fromEnvironment('FIGMA_RESTORE_SYNTHETIC_ONLY') ||
      Uri.base.scheme != 'http' ||
      Uri.base.host != '127.0.0.1' ||
      Uri.base.port != 5500) {
    runApp(const _Unavailable());
    return;
  }
  try {
    const files = {
      'r05r12': 'synthetic-access.json',
      'story': 'synthetic-story-access.json',
      'artists': 'synthetic-artists-access.json',
      'delivery': 'synthetic-delivery-access.json'
    };
    final group = Uri.base.queryParameters['fixtureGroup'] ?? 'r05r12';
    final name = files[group];
    if (name == null) throw StateError('Unknown fixture group');
    final source = await Dio().get<dynamic>('http://127.0.0.1:5500/$name');
    final f = Map<String, dynamic>.from(source.data as Map),
        origin = Uri.parse(f['base_url'] as String);
    if (f['synthetic_only'] != true ||
        origin.scheme != 'http' ||
        origin.host != '127.0.0.1' ||
        origin.path != '/api/v1')
      throw StateError('Not a local synthetic fixture');
    final role = Uri.base.queryParameters['fixtureRole'] ?? 'buyer';
    final a = Map<String, dynamic>.from(f['accounts'][role] as Map);
    final token = a['bearer_token'] as String;
    final legacy = UserProvider();
    await legacy.logout();
    final dio = Dio(BaseOptions(
        baseUrl: origin.origin,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        followRedirects: false,
        validateStatus: (_) => true));
    final api = AccountApi(dio: dio),
        account = await api.request('GET', '/api/v1/me', token: token);
    if (account['id'] != a['account_id']) throw StateError('Account mismatch');
    var bootstrap = true;
    dio.interceptors.add(InterceptorsWrapper(onRequest: (options, handler) {
      if (bootstrap &&
          options.method == 'POST' &&
          options.uri == Uri.parse('${origin.origin}/api/v1/auth/sessions')) {
        bootstrap = false;
        handler.resolve(
            Response<dynamic>(requestOptions: options, statusCode: 200, data: {
          'data': {
            'access_token': token,
            'token_type': 'Bearer',
            'account': account
          }
        }));
      } else {
        handler.next(options);
      }
    }));
    final session = AccountSession(api: api);
    await session.login('local-synthetic', 'local-bootstrap', 'local-only');
    await session.loadParties();
    session.select(
        session.parties.singleWhere((r) => r['party']['id'] == a['party_id']));
    if (!session.isLoggedIn || session.partyId == null)
      throw StateError('No synthetic identity');
    runApp(MultiProvider(providers: [
      ChangeNotifierProvider<UserProvider>.value(value: legacy),
      ChangeNotifierProvider<AccountSession>.value(value: session)
    ], child: const JingjingShangriApp()));
  } catch (_) {
    runApp(const _Unavailable());
  }
}

class _Unavailable extends StatelessWidget {
  const _Unavailable();
  @override
  Widget build(BuildContext context) => const MaterialApp(
      home: Scaffold(body: Center(child: Text('本机合成联调服务暂不可用。'))));
}
