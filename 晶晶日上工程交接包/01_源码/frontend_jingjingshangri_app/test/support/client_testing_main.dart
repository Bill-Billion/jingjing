// Dedicated acceptance build. No fixtures, invitations or upstream tokens are compiled in.
import 'dart:js_interop';
import 'dart:ui_web' as web;
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/app.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';

@JS('jxSimulate')
external JSPromise<JSString> simulate(JSString kind, JSString record);

@JS('parent.postMessage')
external void reportRoute(JSAny message, JSString origin);

// An embedded acceptance App must not navigate the parent page's joint history.
// Product navigation and the in-app back button still use Navigator normally.
class EmbeddedTestUrlStrategy implements web.UrlStrategy {
  String route = Uri.base.fragment.isEmpty ? '/square' : Uri.base.fragment;
  Object? state;
  @override
  VoidCallback addPopStateListener(web.PopStateListener fn) => () {};
  @override
  String getPath() => route;
  @override
  Object? getState() => state;
  @override
  String prepareExternalUrl(String internalUrl) => internalUrl;
  @override
  void pushState(Object? value, String title, String url) =>
      replaceState(value, title, url);
  @override
  void replaceState(Object? value, String title, String url) {
    state = value;
    if (url.isNotEmpty) route = url;
  }

  @override
  Future<void> go(int count) async {}
}

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
  web.urlStrategy = EmbeddedTestUrlStrategy();
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
    if (f['synthetic_only'] != true || f['base_url'] != '$origin/api/v1') {
      throw StateError('Invalid test context');
    }
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
    // Explicit test build only. Preserve the real API's permissions and state transitions.
    dio.interceptors
        .add(InterceptorsWrapper(onRequest: (options, handler) async {
      if (options.extra['skip_simulation'] == true) {
        handler.next(options);
        return;
      }
      try {
        final identity = options.method == 'POST' &&
            RegExp(r'/artists/people/[^/]+/identity$').hasMatch(options.path);
        final topup = options.method == 'POST' &&
            options.path == '/api/v1/wallet/recharges';
        if (identity || topup) {
          final state =
              (await simulate((identity ? 'identity' : 'payment').toJS, ''.toJS)
                      .toDart)
                  .toDart;
          if (state == 'CANCEL' || (topup && state != 'SUCCEEDED')) {
            handler.reject(DioException(
                requestOptions: options,
                type: DioExceptionType.cancel,
                message: '已取消或模拟未成功，未产生扣款'));
            return;
          }
          if (identity) {
            final sessionRef =
                'synthetic:${options.headers['Idempotency-Key']}';
            final r = await dio.post<dynamic>(
                '/api/v1/testing/identity/outcome',
                data: {
                  'person_id': options.path.split('/')[5],
                  'session_ref': sessionRef,
                  'state': state
                },
                options: Options(
                    headers: options.headers,
                    extra: {'skip_simulation': true}));
            if (r.statusCode != 200) {
              handler.resolve(r);
              return;
            }
            options.data = {'session_ref': sessionRef};
          }
          if (topup) {
            options.path = '/api/v1/testing/wallet/topup';
          }
        }
        final reconcile =
            RegExp(r'/trade/(payments|refunds)/([^/]+)/reconciliation$')
                .firstMatch(options.path);
        if (options.method == 'POST' && reconcile != null) {
          final state = (await simulate(
                      (reconcile.group(1) == 'refunds' ? 'refund' : 'payment')
                          .toJS,
                      reconcile.group(2)!.toJS)
                  .toDart)
              .toDart;
          if (state != 'CANCEL') {
            final r = await dio.post<dynamic>(
                '/api/v1/testing/payments/outcome',
                data: {'record_id': reconcile.group(2), 'state': state},
                options: Options(
                    headers: options.headers,
                    extra: {'skip_simulation': true}));
            if (r.statusCode != 200) {
              handler.resolve(r);
              return;
            }
          }
        }
        handler.next(options);
      } catch (e) {
        handler.reject(DioException(requestOptions: options, error: e));
      }
    }, onResponse: (response, handler) async {
      final request = response.requestOptions;
      if (request.extra['skip_simulation'] == true) {
        handler.next(response);
        return;
      }
      try {
        if (request.path == '/api/v1/testing/wallet/topup' &&
            response.statusCode == 200) {
          response.data = {'data': response.data['data']['record']};
        }
        final payment = request.method == 'POST' &&
            request.path == '/api/v1/trade/payments';
        final refund = request.method == 'POST' &&
            RegExp(r'/trade/refunds/[^/]+/execution$').hasMatch(request.path);
        final data = response.data is Map ? response.data['data'] : null;
        if ((payment || refund) &&
            response.statusCode == 200 &&
            data is Map &&
            ['PENDING', 'UNKNOWN'].contains(data['current_status'])) {
          final id = data['id'] as String;
          final state =
              (await simulate((refund ? 'refund' : 'payment').toJS, id.toJS)
                      .toDart)
                  .toDart;
          if (state != 'CANCEL') {
            final headers = Map<String, dynamic>.from(request.headers);
            final choice = await dio.post<dynamic>(
                '/api/v1/testing/payments/outcome',
                data: {'record_id': id, 'state': state},
                options: Options(
                    headers: headers, extra: {'skip_simulation': true}));
            if (choice.statusCode != 200) {
              handler.next(choice);
              return;
            }
            final reconciled = await dio.post<dynamic>(
                '/api/v1/trade/${refund ? 'refunds' : 'payments'}/$id/reconciliation',
                data: refund ? {} : {'transaction_id': null},
                options: Options(headers: {
                  ...headers,
                  'Idempotency-Key':
                      '${DateTime.now().microsecondsSinceEpoch}-$id'
                }, extra: {
                  'skip_simulation': true
                }));
            handler.next(reconciled);
            return;
          }
        }
        handler.next(response);
      } catch (e) {
        handler.reject(DioException(requestOptions: request, error: e));
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
