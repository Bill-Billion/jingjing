// Synthetic-only test entrypoint. Never used by the production application.
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/cocreation/cocreation_pages.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';

const origin = String.fromEnvironment('NATIVE_ORIGIN');
const controlToken = String.fromEnvironment('NATIVE_CONTROL');
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!origin.startsWith('http://127.0.0.1:') || controlToken.isEmpty) {
    throw StateError('SYNTHETIC_LOOPBACK_REQUIRED');
  }
  final client = HttpClient();
  final request = await client.postUrl(Uri.parse('$origin/__native/control'));
  request.headers.set('Authorization', 'Bearer $controlToken');
  request.headers.contentType = ContentType.json;
  request.write(jsonEncode({'action': 'setup', 'role': 'buyer'}));
  final response = await request.close();
  if (response.statusCode != 200) throw StateError('SYNTHETIC_SETUP_FAILED');
  final fixture = jsonDecode(await utf8.decoder.bind(response).join());
  client.close(force: true);
  final a = fixture['account'];
  final dio = Dio(BaseOptions(
      baseUrl: origin, followRedirects: false, validateStatus: (_) => true));
  final api = AccountApi(dio: dio);
  final account =
      await api.request('GET', '/api/v1/me', token: a['bearer_token']);
  var firstLogin = true;
  final prefs = await SharedPreferences.getInstance();
  var loseCreate = prefs.getString('jx.cocreation.invite.pending.v1') == null;
  dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
    if (firstLogin && o.method == 'POST' && o.path == '/api/v1/auth/sessions') {
      firstLogin = false;
      h.resolve(Response<dynamic>(requestOptions: o, statusCode: 200, data: {
        'data': {
          'access_token': a['bearer_token'],
          'token_type': 'Bearer',
          'account': account
        }
      }));
    } else {
      h.next(o);
    }
  }, onResponse: (r, h) {
    if (loseCreate &&
        r.statusCode == 200 &&
        r.requestOptions.method == 'POST' &&
        r.requestOptions.path.endsWith('/invite-links')) {
      loseCreate = false;
      h.reject(DioException(
          requestOptions: r.requestOptions,
          type: DioExceptionType.connectionError,
          message: 'Synthetic response lost after commit'));
    } else {
      h.next(r);
    }
  }));
  final session = AccountSession(api: api);
  await session.login('local-synthetic', 'local-bootstrap', 'local-only');
  await session.loadParties();
  session.select(
      session.parties.singleWhere((r) => r['party']['id'] == a['party_id']));
  runApp(MultiProvider(
      providers: [
        ChangeNotifierProvider<AccountSession>.value(value: session),
        ChangeNotifierProvider<UserProvider>(create: (_) => UserProvider())
      ],
      child: MaterialApp(
          home: CocreationPage(view: 'room', recordId: fixture['room_id']))));
}
