import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';

const additionalBusinessPrefixes = [
  '/api/v1/stock/',
  '/api/v1/notices/',
  '/api/v1/auditions/',
  '/api/v1/wallet/',
  '/api/v1/engagement/',
  '/api/v1/cocreation/',
  '/api/v1/redemption/',
  '/api/v1/privacy/',
  '/api/v1/media/',
  '/api/v1/directory/',
  '/api/v1/discovery/',
  '/api/v1/me/collections/',
  '/api/v1/me/business/',
  '/api/v1/support/',
];

bool _privateRequestPath(String path) => [
      '/api/v1/customization-requests',
      '/api/v1/artists/',
      '/api/v1/supply/',
      '/api/v1/licensing/',
      '/api/v1/trade/',
      '/api/v1/gigs/',
      '/api/v1/production/',
      '/api/v1/projects/',
      '/api/v1/finance/',
      '/api/v1/operations/',
      ...additionalBusinessPrefixes,
    ].any(path.startsWith);

/// The account API deliberately has no connection to legacy JWT or demo data.
class AccountApi {
  AccountApi({Dio? dio, String? baseUrl})
      : _dio = dio ??
            Dio(BaseOptions(
              baseUrl:
                  baseUrl ?? const String.fromEnvironment('JX_ACCOUNT_API_URL'),
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 20),
              followRedirects: false,
              validateStatus: (_) => true,
            ));

  final Dio _dio;
  int _supplyEpoch = 0;
  void clearSupplyOperations() {
    _supplyEpoch++;
    bool supply(String key) =>
        _privateRequestPath((jsonDecode(key) as List)[3].toString());
    _keys.removeWhere((key, _) => supply(key));
    _pending.removeWhere((key, _) => supply(key));
    _running.removeWhere((key, _) => supply(key));
  }

  final _keys = <String, String>{};
  final _pending = <String, Map<String, dynamic>>{};
  String _scope(String method, String path, String? token, String? party) =>
      jsonEncode([token, party, method, path]);
  Map<String, dynamic>? pending(String method, String path,
          {String? token, String? party}) =>
      _pending[_scope(method, path, token, party)];
  List<Map<String, dynamic>> pendingForPrefix(String prefix,
          {String? token, String? party}) =>
      [
        for (final entry in _pending.entries)
          if ((jsonDecode(entry.key) as List)[0] == token &&
              (jsonDecode(entry.key) as List)[1] == party &&
              (jsonDecode(entry.key) as List)[3].toString().startsWith(prefix))
            {...entry.value, 'path': (jsonDecode(entry.key) as List)[3]}
      ];
  List<Map<String, dynamic>> tradePending({String? token, String? party}) => [
        for (final entry in _pending.entries)
          if ((jsonDecode(entry.key) as List)[0] == token &&
              (jsonDecode(entry.key) as List)[1] == party &&
              (jsonDecode(entry.key) as List)[3]
                  .toString()
                  .startsWith('/api/v1/trade/'))
            {...entry.value, 'path': (jsonDecode(entry.key) as List)[3]}
      ];
  List<Map<String, dynamic>> gigsPending({String? token, String? party}) => [
        for (final entry in _pending.entries)
          if ((jsonDecode(entry.key) as List)[0] == token &&
              (jsonDecode(entry.key) as List)[1] == party &&
              (jsonDecode(entry.key) as List)[3]
                  .toString()
                  .startsWith('/api/v1/gigs/'))
            {...entry.value, 'path': (jsonDecode(entry.key) as List)[3]}
      ];
  void discardPending(String method, String path,
      {String? token, String? party}) {
    final scope = _scope(method, path, token, party);
    final pending = _pending.remove(scope);
    if (pending != null) _keys.remove(pending['fingerprint']);
  }

  final _running = <String, Future<Map<String, dynamic>>>{};
  List<Map<String, dynamic>> productionPending(
          {String? token, String? party}) =>
      [
        for (final entry in _pending.entries)
          if ((jsonDecode(entry.key) as List)[0] == token &&
              (jsonDecode(entry.key) as List)[1] == party &&
              (jsonDecode(entry.key) as List)[3]
                  .toString()
                  .startsWith('/api/v1/production/'))
            {...entry.value, 'path': (jsonDecode(entry.key) as List)[3]}
      ];
  List<Map<String, dynamic>> projectsPending({String? token, String? party}) =>
      [
        for (final entry in _pending.entries)
          if ((jsonDecode(entry.key) as List)[0] == token &&
              (jsonDecode(entry.key) as List)[1] == party &&
              (jsonDecode(entry.key) as List)[3]
                  .toString()
                  .startsWith('/api/v1/projects/'))
            {...entry.value, 'path': (jsonDecode(entry.key) as List)[3]}
      ];
  List<Map<String, dynamic>> financePending({String? token, String? party}) => [
        for (final entry in _pending.entries)
          if ((jsonDecode(entry.key) as List)[0] == token &&
              (jsonDecode(entry.key) as List)[1] == party &&
              (jsonDecode(entry.key) as List)[3]
                  .toString()
                  .startsWith('/api/v1/finance/'))
            {...entry.value, 'path': (jsonDecode(entry.key) as List)[3]}
      ];
  List<Map<String, dynamic>> operationsPending(
          {String? token, String? party}) =>
      [
        for (final entry in _pending.entries)
          if ((jsonDecode(entry.key) as List)[0] == token &&
              (jsonDecode(entry.key) as List)[1] == party &&
              (jsonDecode(entry.key) as List)[3]
                  .toString()
                  .startsWith('/api/v1/operations/'))
            {...entry.value, 'path': (jsonDecode(entry.key) as List)[3]}
      ];
  List<Map<String, dynamic>> artistsPending({String? token, String? party}) => [
        for (final entry in _pending.entries)
          if ((jsonDecode(entry.key) as List)[0] == token &&
              (jsonDecode(entry.key) as List)[1] == party &&
              (jsonDecode(entry.key) as List)[3]
                  .toString()
                  .startsWith('/api/v1/artists/'))
            {...entry.value, 'path': (jsonDecode(entry.key) as List)[3]}
      ];
  final _random = Random.secure();

  String _newKey() =>
      'app-${List.generate(24, (_) => _random.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';

  Future<Map<String, dynamic>> request(
    String method,
    String path, {
    String? token,
    String? party,
    Map<String, dynamic>? body,
    Map<String, dynamic>? query,
    int? version,
    Uint8List? bytes,
    void Function(int sent, int total)? onSendProgress,
    FutureOr<void> Function(Map<String, dynamic>)? validate,
  }) {
    final writing = method != 'GET';
    final supply = _privateRequestPath(path);
    final started = _supplyEpoch;
    bool current() => !supply || started == _supplyEpoch;
    body = body == null
        ? null
        : Map<String, dynamic>.from(jsonDecode(jsonEncode(body)) as Map);
    bytes = bytes == null ? null : Uint8List.fromList(bytes);
    // Includes account, acting identity, original version and original input.
    // An uncertain retry must send exactly the same operation and key.
    final fingerprint = jsonEncode([
      token,
      party,
      method,
      path,
      body,
      version,
      query,
      bytes == null ? null : sha256.convert(bytes).toString()
    ]);
    final scope = _scope(method, path, token, party);
    final unresolved = _pending[scope];
    if (writing &&
        unresolved != null &&
        unresolved['fingerprint'] != fingerprint) {
      return Future.error(const AccountError(409, 'PENDING_OPERATION_CHANGED'));
    }
    if (writing &&
        supply &&
        _running.keys.any((active) =>
            active != fingerprint &&
            jsonEncode((jsonDecode(active) as List).take(4).toList()) ==
                scope)) {
      return Future.error(const AccountError(409, 'PENDING_OPERATION_CHANGED'));
    }
    if (writing && _running.containsKey(fingerprint)) {
      return _running[fingerprint]!;
    }
    final key = writing ? _keys.putIfAbsent(fingerprint, _newKey) : null;
    String? resultId = unresolved?['resultId'];
    final future = _send(method, path,
            token: token,
            party: party,
            body: body,
            query: query,
            version: version,
            key: key,
            bytes: bytes,
            onSendProgress: onSendProgress == null
                ? null
                : (sent, total) {
                    if (current()) onSendProgress(sent, total);
                  })
        .then((data) async {
      if (!current()) throw const AccountError(0, 'CONTEXT_CHANGED');
      if (data['id'] is String) resultId = data['id'];
      await validate?.call(data);
      if (!current()) throw const AccountError(0, 'CONTEXT_CHANGED');
      return data;
    }).then((data) {
      if (writing) {
        _keys.remove(fingerprint);
        _pending.remove(scope);
      }
      return data;
    }, onError: (Object error, StackTrace stack) {
      if (!current()) throw const AccountError(0, 'CONTEXT_CHANGED');
      if (writing && error is AccountError) {
        if (error.uncertain) {
          _pending[scope] = {
            'fingerprint': fingerprint,
            'body': body,
            'version': version,
            'bytes': bytes,
            'query': query,
            'code': error.code,
            'resultId': error.resultId ?? resultId,
          };
        } else {
          _keys.remove(fingerprint);
          _pending.remove(scope);
        }
      }
      Error.throwWithStackTrace(error, stack);
    });
    if (!writing) return future;
    final tracked = future.whenComplete(() {
      if (current()) _running.remove(fingerprint);
    });
    _running[fingerprint] = tracked;
    return tracked;
  }

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    String? token,
    String? party,
    Map<String, dynamic>? body,
    Map<String, dynamic>? query,
    int? version,
    String? key,
    Uint8List? bytes,
    void Function(int sent, int total)? onSendProgress,
  }) async {
    final uri = Uri.tryParse(_dio.options.baseUrl);
    if (uri == null ||
        !uri.hasAuthority ||
        !['http', 'https'].contains(uri.scheme)) {
      throw const AccountError(503, 'ACCOUNT_API_NOT_CONFIGURED');
    }
    try {
      final response = await _dio.request<dynamic>(
        path,
        data: bytes ?? body,
        queryParameters: query,
        onSendProgress: onSendProgress,
        options: Options(method: method, headers: {
          'Content-Type':
              bytes == null ? 'application/json' : 'application/octet-stream',
          if (token != null) 'Authorization': 'Bearer $token',
          if (party != null) 'X-Acting-Party': party,
          if (key != null) 'Idempotency-Key': key,
          if (version != null) 'If-Match': '"$version"',
        }),
      );
      final status = response.statusCode ?? 0;
      final envelope = response.data;
      if (status >= 200 &&
          status < 300 &&
          envelope is Map &&
          envelope['data'] is Map) {
        return Map<String, dynamic>.from(envelope['data'] as Map);
      }
      final error = envelope is Map ? envelope['error'] : null;
      final code = error is Map ? '${error['code']}' : 'INVALID_RESPONSE';
      final retrySeconds =
          int.tryParse(response.headers.value('retry-after') ?? '');
      throw AccountError(status, code,
          details:
              safeAccountErrorDetails(error is Map ? error['details'] : null),
          resultId: error is Map &&
                  error['details'] is Map &&
                  error['details']['record_id'] is String
              ? error['details']['record_id'] as String
              : null,
          retryAt: status == 429 && retrySeconds != null && retrySeconds >= 0
              ? DateTime.now().add(Duration(seconds: retrySeconds))
              : null,
          uncertain: code != 'SMS_CHALLENGE_UNAVAILABLE' &&
              // This endpoint rejects before creating a recharge command.
              !(path == '/api/v1/wallet/recharges' &&
                  status == 503 &&
                  code == 'CUSTODY_PROVIDER_NOT_CONNECTED') &&
              (status == 0 ||
                  status >= 500 ||
                  (status >= 200 && status < 300) ||
                  [
                    'IDEMPOTENCY_IN_PROGRESS',
                    'COMMIT_OUTCOME_UNKNOWN',
                    'UPLOAD_RECONCILIATION_REQUIRED',
                    'ASSET_UPLOAD_RECONCILIATION_REQUIRED'
                  ].contains(code)));
    } on DioException {
      throw const AccountError(0, 'NETWORK_UNKNOWN', uncertain: true);
    }
  }

  Future<Uint8List> readBytes(String path,
      {required String token,
      String? party,
      Map<String, dynamic>? query}) async {
    final uri = Uri.tryParse(_dio.options.baseUrl);
    if (uri == null ||
        !uri.hasAuthority ||
        !['http', 'https'].contains(uri.scheme)) {
      throw const AccountError(503, 'ACCOUNT_API_NOT_CONFIGURED');
    }
    try {
      final response = await _dio.get<List<int>>(path,
          queryParameters: query,
          options: Options(
              responseType: ResponseType.bytes,
              followRedirects: false,
              headers: {
                'Authorization': 'Bearer $token',
                if (party != null) 'X-Acting-Party': party
              }));
      final mediaType =
          response.headers.value('content-type')?.split(';').first;
      final stockVideoPath = RegExp(
        r'^/api/v1/stock/(?:catalog/[a-fA-F0-9-]{36}/preview|listings/[a-fA-F0-9-]{36}/files/(?:full|preview)|purchases/[a-fA-F0-9-]{36}/content)$',
      ).hasMatch(path);
      final stockCoverPath = RegExp(
        r'^/api/v1/stock/catalog/[a-fA-F0-9-]{36}/cover$',
      ).hasMatch(path);
      final directoryCoverPath =
          RegExp(r'^/api/v1/directory/organizations/[a-fA-F0-9-]{36}/cover$')
              .hasMatch(path);
      if (response.statusCode == 200 &&
          response.data != null &&
          (mediaType == 'application/octet-stream' ||
              stockVideoPath && mediaType == 'video/mp4' ||
              stockCoverPath && mediaType == 'image/jpeg' ||
              directoryCoverPath &&
                  ['image/jpeg', 'image/png'].contains(mediaType))) {
        return Uint8List.fromList(response.data!);
      }
      String code = 'INVALID_BINARY_RESPONSE';
      try {
        final decoded = jsonDecode(utf8.decode(response.data ?? []));
        if (decoded is Map && decoded['error'] is Map) {
          code = '${decoded['error']['code']}';
        }
      } catch (_) {}
      final seconds = int.tryParse(response.headers.value('retry-after') ?? '');
      throw AccountError(response.statusCode ?? 0, code,
          retryAt: response.statusCode == 429 && seconds != null && seconds >= 0
              ? DateTime.now().add(Duration(seconds: seconds))
              : null);
    } on DioException {
      throw const AccountError(0, 'NETWORK_UNKNOWN');
    }
  }
}

class AccountError implements Exception {
  const AccountError(this.status, this.code,
      {this.uncertain = false,
      this.retryAt,
      this.resultId,
      this.details = const []});
  final int status;
  final String code;
  final bool uncertain;
  final DateTime? retryAt;
  final String? resultId;
  final List<Map<String, String>> details;
  String get message {
    switch (code) {
      case 'ACCOUNT_API_NOT_CONFIGURED':
        return '账号服务地址尚未配置，请联系开发者配置后再登录。';
      case 'IDEMPOTENCY_IN_PROGRESS':
        return '上次操作还在处理中，请稍后重试原操作核对结果。';
      case 'PENDING_OPERATION_CHANGED':
        return '上次操作的结果尚未确认，请先重试原内容核对结果，再发起新的操作。';
      case 'CONTEXT_CHANGED':
        return '账号或身份已切换，请在当前身份下重新操作。';
      case 'SMS_NOT_READY':
        return '验证码暂不可用，发送结果未确认，请稍后重试核对。';
      case 'SMS_CHALLENGE_UNAVAILABLE':
        return '该次验证码已失效或不可用，请重新获取验证码。';
      case 'NETWORK_UNKNOWN':
        return '网络中断，暂时无法确认结果。请保留原内容重试，系统不会另建同一笔操作。';
      case 'INVITATION_EXPIRED':
        return '邀请已过期，请机构负责人重新邀请。';
      case 'INVITATION_NOT_PENDING':
        return '这份邀请已经处理，请刷新查看当前状态。';
      case 'INVALID_EXPIRY':
        return '请选择有效的邀请截止日期和时间。';
      case 'INVALID_ID':
        return '账号编号格式不正确，请复制对方提供的完整账号编号。';
      case 'INVALID_CREDENTIALS':
      case 'INVALID_CODE':
      case 'INVALID_CHALLENGE':
        return '验证码无效或已过期，请核对后重试。';
    }
    switch (status) {
      case 400:
        return '填写内容不符合要求，请检查手机号、验证码或表单内容。';
      case 401:
        return '登录已失效或验证未通过，请重新验证手机号。';
      case 403:
        return '当前身份没有权限执行此操作。';
      case 404:
        return '内容不存在或当前账号无权查看，请刷新列表。';
      case 409:
        return '这项操作与当前记录冲突，请刷新核对后再操作。';
      case 412:
        return '记录已被更新。请刷新后核对最新内容，再重新提交。';
      case 422:
        return '当前状态无法执行这项操作，请刷新核对。';
      case 428:
        return '缺少记录版本，请刷新页面后重新操作。';
      case 429:
        return '操作过于频繁，请稍后再试。';
      case 503:
        return '服务暂时不可用，结果尚未确认；请保留原内容，稍后重试核对。';
      default:
        return '账号服务暂时无法返回有效结果，请稍后重试。';
    }
  }

  @override
  String toString() => message;
}

/// Only fixed form identifiers and reasons are retained, never raw server text.
List<Map<String, String>> safeAccountErrorDetails(dynamic value) {
  if (value is! List) return const [];
  const reasons = {
    'REQUIRED',
    'INVALID_CHOICE',
    'TOO_LONG',
    'INVALID_TYPE',
    'ATTACHMENT_NOT_SUPPORTED',
    'ATTACHMENT_SUBMISSION_NOT_READY',
    'UNKNOWN_FIELD',
    'TOO_LARGE',
  };
  final field = RegExp(r'^(answers|responses)(\.[a-z][a-z0-9_]{0,63})?$');
  return List.unmodifiable([
    for (final item in value.take(40))
      if (item is Map &&
          item['field'] is String &&
          field.hasMatch(item['field']) &&
          reasons.contains(item['reason']))
        Map<String, String>.unmodifiable({
          'field': item['field'] as String,
          'reason': item['reason'] as String,
        }),
  ]);
}
