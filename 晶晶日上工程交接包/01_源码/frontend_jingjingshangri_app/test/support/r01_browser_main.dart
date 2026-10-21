// Browser acceptance entry only; lib/main.dart never imports this file.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/app.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';

const _synthetic = bool.fromEnvironment('R01_SYNTHETIC_ONLY');
const _apiOrigin = String.fromEnvironment('R01_API_ORIGIN');
const _buyerToken = String.fromEnvironment('R01_BUYER_TOKEN');
const _buyerId = String.fromEnvironment('R01_BUYER_ACCOUNT_ID');
const _buyerPartyId = String.fromEnvironment('R01_BUYER_PARTY_ID');
const _appPort = int.fromEnvironment('R01_APP_PORT', defaultValue: 5000);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final apiOrigin = Uri.tryParse(_apiOrigin);
  if (!_synthetic ||
      Uri.base.scheme != 'http' ||
      !['127.0.0.1', 'localhost'].contains(Uri.base.host) ||
      !const [5000, 5500].contains(_appPort) ||
      Uri.base.port != _appPort ||
      apiOrigin?.scheme != 'http' ||
      apiOrigin?.host != '127.0.0.1' ||
      _buyerToken.isEmpty ||
      _buyerId.isEmpty) {
    runApp(const _FixtureUnavailable());
    return;
  }
  try {
    final legacy = UserProvider();
    await legacy.logout();
    final dio = Dio(BaseOptions(
        baseUrl: _apiOrigin,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        followRedirects: false,
        validateStatus: (_) => true));
    final api = AccountApi(dio: dio);
    final account = await api.request('GET', '/api/v1/me', token: _buyerToken);
    if (account['id'] != _buyerId) throw StateError('Fixture account mismatch');
    var bootstrap = true;
    dio.interceptors.add(InterceptorsWrapper(onRequest: (options, handler) {
      // Inject one existing sandbox session, without issuing SMS or adding a login API.
      if (bootstrap &&
          options.method == 'POST' &&
          options.uri == Uri.parse('$_apiOrigin/api/v1/auth/sessions')) {
        bootstrap = false;
        handler.resolve(
            Response<dynamic>(requestOptions: options, statusCode: 200, data: {
          'data': {
            'access_token': _buyerToken,
            'token_type': 'Bearer',
            'account': account,
          }
        }));
      } else {
        handler.next(options);
      }
    }));
    final session = AccountSession(api: api);
    await session.login(
        'local-synthetic-buyer', 'local-bootstrap', 'local-only');
    await session.loadParties();
    final owner = session.parties
        .singleWhere((row) => row['party']['id'] == _buyerPartyId);
    session.select(owner);
    if (!session.isLoggedIn || session.partyId == null) {
      throw StateError('Fixture has no active identity');
    }
    runApp(MultiProvider(providers: [
      ChangeNotifierProvider<UserProvider>.value(value: legacy),
      ChangeNotifierProvider<AccountSession>.value(value: session),
    ], child: const JingjingShangriApp()));
  } catch (_) {
    runApp(const _FixtureUnavailable());
  }
}

class _FixtureUnavailable extends StatelessWidget {
  const _FixtureUnavailable();
  @override
  Widget build(BuildContext context) => const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(body: Center(child: Text('本机合成联调服务暂不可用。'))));
}
