// Dedicated acceptance build. No fixtures, invitations or upstream tokens are compiled in.
import 'dart:js_interop';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/app.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';

@JS('parent.postMessage')
external void reportRoute(JSAny message, JSString origin);

class TestRouteObserver extends NavigatorObserver {
  void report(Route<dynamic>? route) {
    final name = route?.settings.name;
    if (name != null) {
      reportRoute({'type': 'jx-test-context', 'route': '/app/#$name'}.jsify()!,
          Uri.base.origin.toJS);
    }
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      report(route);
  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      report(previousRoute);
  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) =>
      report(newRoute);
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    if (!const bool.fromEnvironment('CLIENT_TEST_ONLY') ||
        !(Uri.base.scheme == 'https' ||
            (Uri.base.scheme == 'http' && Uri.base.host == '127.0.0.1'))) {
      throw StateError('Test build only');
    }
    final origin = Uri.base.origin;
    final source = await Dio().get<dynamic>('$origin/__test/bootstrap');
    final f = Map<String, dynamic>.from(source.data as Map);
    if (f['synthetic_only'] != true || f['base_url'] != '$origin/api/v1')
      throw StateError('Invalid test context');
    final token = f['bearer_token'] as String;
    final dio = Dio(BaseOptions(
        baseUrl: origin,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        followRedirects: false,
        validateStatus: (_) => true));
    final api = AccountApi(dio: dio);
    final account = await api.request('GET', '/api/v1/me', token: token);
    if (account['id'] != f['account_id']) throw StateError('Account mismatch');
    var bootstrap = true;
    dio.interceptors.add(InterceptorsWrapper(onRequest: (options, handler) {
      if (bootstrap &&
          options.method == 'POST' &&
          options.path == '/api/v1/auth/sessions') {
        bootstrap = false;
        handler.resolve(
            Response<dynamic>(requestOptions: options, statusCode: 200, data: {
          'data': {
            'access_token': token,
            'expires_at': f['expires_at'],
            'token_type': 'Bearer',
            'account': account
          }
        }));
      } else {
        handler.next(options);
      }
    }));
    final session = AccountSession(api: api);
    await session.login('synthetic-only', 'invitation-session', 'not-sms');
    await session.loadParties();
    session.select(
        session.parties.singleWhere((r) => r['party']['id'] == f['party_id']));
    runApp(MultiProvider(providers: [
      ChangeNotifierProvider<UserProvider>(create: (_) => UserProvider()),
      ChangeNotifierProvider<AccountSession>.value(value: session)
    ], child: JingjingShangriApp(navigatorObservers: [TestRouteObserver()])));
  } catch (_) {
    runApp(const MaterialApp(
        home: Scaffold(body: Center(child: Text('本次测试会话暂不可用，请返回测试工作台重新进入。')))));
  }
}
