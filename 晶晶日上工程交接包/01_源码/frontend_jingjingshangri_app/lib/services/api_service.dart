import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app_mode.dart';
import 'mock_data.dart';
import '../utils/perf_trace.dart';

/// API服务 - 连接晶晶日上后端
///
/// 双模数据层：
/// - 在线（online/auto 且服务器可达）：走真实后端接口；
/// - 演示（demo，或 auto 下连不上服务器）：自动回退 MockData，保证断网也能完整演示。
/// 页面只依赖本服务，无需关心当前是否联网。
class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  // 正式环境：HTTPS 域名（Let's Encrypt 证书，Nginx 443 到 Node 3000）
  static const String baseUrl = 'https://www.jingjingrishang.com';
  static const String emulatorUrl = 'http://10.0.2.2:3000';
  static const String lanUrl = 'http://192.168.1.82:3000';
  static const String tailscaleUrl = 'http://100.119.240.117:3000';
  static const String publicUrl = 'http://8.222.213.43'; // 公网IP直连（应急回退，经Nginx 80）
  static const String defaultUrl = baseUrl; // 默认走正式HTTPS域名；需回退时在设置-服务器地址切到publicUrl

  late Dio _dio;
  String? _token;
  int? _userId;
  String _serverUrl = defaultUrl;

  // 演示模式下的样片/定制剧订单内存态（断网也能走通 7 步状态机）
  Map<String, dynamic>? _demoSample;
  Map<String, dynamic> _demoSampleOrder(int id) =>
      Map<String, dynamic>.from(_demoSample ??= {
            'id': id,
            'orderNo': 'SP-DEMO-$id',
            'status': 'scripting',
            'step': 3,
            'totalPrice': 5000,
            'intentDeposit': 99,
            'productionFee': 4901,
            'genre': '古装逆袭',
            'isDemo': true,
          });
  Map<String, dynamic> _demoAdvance(int id, String status, int step,
      {Map<String, dynamic>? extra}) {
    final o = _demoSampleOrder(id);
    o['status'] = status;
    o['step'] = step;
    if (extra != null) o.addAll(extra);
    return Map<String, dynamic>.from(o);
  }

  int? get userId => _userId;
  String get serverUrl => _serverUrl;
  AppMode get appMode => AppMode.instance;

  String resolveUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return '$_serverUrl$path';
  }

  static String resolve(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return '$defaultUrl$path';
  }

  Future<void> setServerUrl(String url) async {
    _serverUrl = url;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('serverUrl', url);
    _rebuildDio();
  }

  void _rebuildDio() {
    _dio = Dio(BaseOptions(
      baseUrl: _serverUrl,
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 60), // AI(LLM+TTS)生成耗时较长
      headers: {
        'Content-Type': 'application/json',
        'bypass-tunnel-reminder': '1',
      },
    ));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (_token != null) {
          options.headers['Authorization'] = 'Bearer $_token';
        }
        // Gate0 性能时间线：记录请求起点（release 下 PerfTrace 为 no-op，不改变请求行为）
        options.extra['_perfT0'] = Stopwatch()..start();
        PerfTrace.stamp('request_start ${options.method} ${options.path}');
        handler.next(options);
      },
      onResponse: (response, handler) {
        final w = response.requestOptions.extra['_perfT0'] as Stopwatch?;
        PerfTrace.stamp('request_end ${response.requestOptions.method} ${response.requestOptions.path}',
            meta: '${w?.elapsedMilliseconds ?? '-'}ms status=${response.statusCode}');
        handler.next(response);
      },
      onError: (err, handler) {
        final w = err.requestOptions.extra['_perfT0'] as Stopwatch?;
        PerfTrace.stamp('request_error ${err.requestOptions.method} ${err.requestOptions.path}',
            meta: '${w?.elapsedMilliseconds ?? '-'}ms ${err.type}');
        handler.next(err);
      },
    ));
  }

  /// 仅供测试：替换底层 HTTP 适配器，离线模拟远端失败/响应；生产代码路径不调用。
  @visibleForTesting
  void debugInjectHttpAdapter(HttpClientAdapter adapter) {
    _dio.httpClientAdapter = adapter;
  }

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('token');
    _userId = prefs.getInt('userId');
    _serverUrl = prefs.getString('serverUrl') ?? defaultUrl;
    await AppMode.instance.load();
    _rebuildDio();
  }

  void setToken(String token) {
    _token = token;
    SharedPreferences.getInstance().then((p) => p.setString('token', token));
  }

  void clearAuthToken() {
    _token = null;
    SharedPreferences.getInstance().then((p) => p.remove('token'));
  }

  void setUserId(int id) {
    _userId = id;
    SharedPreferences.getInstance().then((p) => p.setInt('userId', id));
  }

  // ───────── 双模兜底核心 ─────────

  /// 读操作：demo 直接本地；online 只走远程并抛错；auto 先远程，失败回退本地。
  Future<T> _guard<T>(
    Future<T> Function() remote,
    FutureOr<T> Function() local,
  ) async {
    final mode = AppMode.instance.mode;
    if (mode == ConnMode.demo) return await local();
    try {
      final r = await remote();
      AppMode.instance.markOnline(true);
      return r;
    } catch (_) {
      if (mode == ConnMode.online) rethrow; // 强制在线：暴露真实错误
      AppMode.instance.markOnline(false); // 自动模式：无缝进入演示
      return await local();
    }
  }

  /// 写操作：demo 本地生效；online 走远程；auto 先远程，失败转本地演示。
  Future<T> _write<T>(
    Future<T> Function() remote,
    FutureOr<T> Function() local,
  ) async {
    final mode = AppMode.instance.mode;
    if (mode == ConnMode.demo) return await local();
    try {
      final r = await remote();
      AppMode.instance.markOnline(true);
      return r;
    } catch (_) {
      if (mode == ConnMode.online) rethrow;
      AppMode.instance.markOnline(false);
      return await local();
    }
  }

  /// 真实连通性探测（设置页“测试连接”用），短超时，不兜底。
  Future<bool> ping({Duration timeout = const Duration(seconds: 3)}) async {
    try {
      final dio = Dio(BaseOptions(
        baseUrl: _serverUrl,
        connectTimeout: timeout,
        receiveTimeout: timeout,
      ));
      await dio.get('/api/humans', queryParameters: {'pageSize': '1'});
      AppMode.instance.markOnline(true);
      return true;
    } catch (e) {
      // 401/404 等也说明服务器在线（只是鉴权/路径问题）
      if (e is DioException &&
          e.type != DioExceptionType.connectionTimeout &&
          e.type != DioExceptionType.connectionError &&
          e.response != null) {
        AppMode.instance.markOnline(true);
        return true;
      }
      AppMode.instance.markOnline(false);
      return false;
    }
  }

  // ====== 认证 ======
  Future<Map<String, dynamic>> sendSmsCode(String phone) =>
      _write(() async {
        final res = await _dio.post('/api/auth/sms', data: {'phone': phone});
        return res.data as Map<String, dynamic>;
      }, () => {'code': 0, 'message': '演示模式：任意验证码均可登录', 'isDemo': true});

  Future<Map<String, dynamic>> loginWithPhone(String phone, String code) async {
    Future<Map<String, dynamic>> remote() async {
      final res = await _dio.post('/api/auth/phone', data: {'phone': phone, 'code': code});
      final d = res.data as Map<String, dynamic>;
      _saveLogin(d);
      return d;
    }

    return _write(remote, () async {
      final d = await AppMode.instance.demoLogin();
      _saveLogin(d);
      return d;
    });
  }

  void _saveLogin(Map<String, dynamic> d) {
    if (d['token'] != null) {
      setToken(d['token'].toString());
      final u = d['user'];
      if (u != null && u['id'] != null) {
        setUserId(u['id'] is int ? u['id'] as int : int.parse(u['id'].toString()));
      }
    }
  }

  /// 一键体验登录（免验证码，直接进入）
  Future<Map<String, dynamic>> demoQuickLogin() async {
    final d = await AppMode.instance.demoLogin();
    _saveLogin(d);
    return d;
  }

  Future<Map<String, dynamic>> devLogin([String phone = '13800138000']) =>
      loginWithPhone(phone, '123456');

  Future<Map<String, dynamic>> login(String code) =>
      loginWithPhone('13800138000', code);

  // ====== 数字人 ======
  Future<List<dynamic>> getHumans({Map<String, dynamic>? params}) =>
      _guard(() async {
        final res = await _dio.get('/api/humans', queryParameters: params);
        return res.data['list'] as List? ?? [];
      }, () => MockData.humans());

  /// 我的数字人（mine=1，含 pending 审核中）；演示/离线兜底为空列表，以本地落盘为准
  Future<List<dynamic>> getMyHumans() =>
      _guard(() async {
        final res = await _dio.get('/api/humans',
            queryParameters: {'mine': '1', 'pageSize': '100'});
        return res.data['list'] as List? ?? [];
      }, () => const []);

  Future<Map<String, dynamic>> getHumanDetail(int id) =>
      _guard(() async {
        final res = await _dio.get('/api/humans/$id');
        return res.data as Map<String, dynamic>;
      }, () => MockData.humanById(id));

  // ====== 视频模板与订单 ======
  Future<List<dynamic>> getVideoTemplates({int? talentId}) =>
      _guard(() async {
        final res = await _dio.get('/api/videos/templates', queryParameters: {
          if (talentId != null) 'talentId': talentId,
        });
        return res.data['list'] as List? ?? [];
      }, () => MockData.videoTemplates());

  Future<Map<String, dynamic>> quoteVideo(int amount, String identityType) =>
      _write(() async {
        final res = await _dio.post('/api/videos/quote',
            data: {'amount': amount, 'identityType': identityType});
        return res.data as Map<String, dynamic>;
      }, () => MockData.quote(amount, identityType));

  Future<Map<String, dynamic>> createVideoOrder(Map<String, dynamic> data) =>
      _write(() async {
        final res = await _dio.post('/api/videos/order', data: data);
        return res.data as Map<String, dynamic>;
      }, () => MockData.instance().addVideoOrder(data));

  Future<List<dynamic>> getMyVideos() =>
      _guard(() async {
        final res = await _dio.get('/api/videos/my');
        return res.data['list'] as List? ?? [];
      }, () => MockData.instance().myVideos());

  Future<List<dynamic>> getReceivedVideos() =>
      _guard(() async {
        final res = await _dio.get('/api/videos/received');
        return res.data['list'] as List? ?? [];
      }, () => MockData.instance().myVideos());

  // ====== 品牌代言 ======
  Future<List<dynamic>> getEndorsementPackages({int? talentId}) =>
      _guard(() async {
        final res = await _dio.get('/api/endorsement/packages', queryParameters: {
          if (talentId != null) 'talentId': talentId,
        });
        return res.data['list'] as List? ?? [];
      }, () => MockData.endorsementPackages());

  Future<Map<String, dynamic>> createEndorsementOrder(Map<String, dynamic> data) =>
      _write(() async {
        final res = await _dio.post('/api/endorsement/order', data: data);
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok());

  Future<List<dynamic>> getMyEndorsements() =>
      _guard(() async {
        final res = await _dio.get('/api/endorsement/my');
        return res.data['list'] as List? ?? [];
      }, () => MockData.myEndorsements());

  // ====== 定制剧场项目 ======
  Future<List<dynamic>> getProjects({Map<String, dynamic>? params}) =>
      _guard(() async {
        final res = await _dio.get('/api/projects', queryParameters: params);
        return res.data['list'] as List? ?? [];
      }, () => MockData.projects());

  // 角色席位市场（单位：元）
  Future<List<dynamic>> getMarketRoles() =>
      _guard(() async {
        final res = await _dio.get('/api/projects/market/roles');
        return res.data['list'] as List? ?? [];
      }, () => [
            {'projectTitle': '黄帝史诗·天下合', 'role': '主角席位', 'price': 5000, 'stockTotal': 20, 'stockSold': 12, 'status': '可定制'},
            {'projectTitle': '黄帝史诗·天下合', 'role': '配角席位', 'price': 2000, 'stockTotal': 30, 'stockSold': 15, 'status': '可定制'},
            {'projectTitle': '少年龙武', 'role': '彩蛋席位', 'price': 1000, 'stockTotal': 50, 'stockSold': 31, 'status': '可定制'},
            {'projectTitle': '边境暗影', 'role': '主角席位', 'price': 5000, 'stockTotal': 20, 'stockSold': 20, 'status': '已锁定'},
            {'projectTitle': '边境暗影', 'role': '客串席位', 'price': 1500, 'stockTotal': 40, 'stockSold': 9, 'status': '可定制'},
          ]);

  Future<Map<String, dynamic>> getProjectDetail(int id) =>
      _guard(() async {
        final res = await _dio.get('/api/projects/$id');
        return res.data as Map<String, dynamic>;
      }, () => MockData.projectById(id));

  Future<Map<String, dynamic>> claimProject(Map<String, dynamic> data) =>
      _write(() async {
        final res = await _dio.post('/api/projects/claim', data: data);
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'orderNo': 'C${DateTime.now().millisecondsSinceEpoch}'}));

  Future<Map<String, dynamic>> submitLaunch(Map<String, dynamic> data) =>
      _write(() async {
        final res = await _dio.post('/api/projects/launch', data: data);
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok());

  // ====== 钱包结算 ======
  Future<Map<String, dynamic>> getWallet() =>
      _guard(() async {
        final res = await _dio.get('/api/settlement/wallet');
        return res.data as Map<String, dynamic>;
      }, () => MockData.wallet());

  Future<List<dynamic>> getTransactions({int page = 1}) =>
      _guard(() async {
        final res = await _dio.get('/api/settlement/transactions',
            queryParameters: {'page': page});
        return res.data['list'] as List? ?? [];
      }, () => MockData.transactions());

  Future<Map<String, dynamic>> getSettlementSummary() =>
      _guard(() async {
        final res = await _dio.get('/api/settlement/summary');
        return res.data as Map<String, dynamic>;
      }, () => MockData.settlementSummary());

  Future<Map<String, dynamic>> withdraw(num amount) =>
      _write(() async {
        final res = await _dio.post('/api/settlement/withdraw', data: {'amount': amount});
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'amount': amount}));

  // ====== 身份认证 ======
  Future<Map<String, dynamic>> submitIdentity(Map<String, dynamic> data) =>
      _write(() async {
        final res = await _dio.post('/api/identity/submit', data: data);
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'status': 'reviewing'}));

  Future<Map<String, dynamic>> getIdentityStatus() =>
      _guard(() async {
        final res = await _dio.get('/api/identity/status');
        return res.data as Map<String, dynamic>;
      }, () => MockData.identityStatus());
  // ====== 人脸核身（阿里云实人认证 cloudauth）======
  /// 初始化核身，返回 certifyId（需已实名 + 本人人脸照片URL或客户端采集 metaInfo）
  Future<Map<String, dynamic>> faceVerifyInit({
    required int humanId,
    String? facePictureUrl,
    String? facePictureBase64,
    String? metaInfo,
  }) =>
      _write(() async {
        final res = await _dio.post('/api/face-verify/init', data: {
          'humanId': humanId,
          if (facePictureUrl != null) 'facePictureUrl': facePictureUrl,
          if (facePictureBase64 != null) 'facePictureBase64': facePictureBase64,
          if (metaInfo != null) 'metaInfo': metaInfo,
        });
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'certifyId': 'DEMO_CERTIFY', 'ready': false}));

  /// 轮询核身结果：passed=true 通过 / false 未通过 / null(processing) 处理中
  Future<Map<String, dynamic>> faceVerifyResult(String certifyId) =>
      _guard(() async {
        final res = await _dio.get('/api/face-verify/result/$certifyId');
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'passed': true, 'processing': false, 'ready': false}));

  /// 签署数字人授权（livenessTxnId 即核身 certifyId；服务端会再做一次云端复验，前端结果不作为最终依据）
  Future<Map<String, dynamic>> signCompliance({
    required int humanId,
    required String scope,
    required String livenessTxnId,
    String? expireAt,
  }) =>
      _write(() async {
        final res = await _dio.post('/api/compliance/sign', data: {
          'humanId': humanId,
          'scope': scope,
          'livenessTxnId': livenessTxnId,
          if (expireAt != null) 'expireAt': expireAt,
        });
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'scope': scope}));


  // ====== MCN ======
  Future<Map<String, dynamic>> getMcnInfo() =>
      _guard(() async {
        final res = await _dio.get('/api/mcn/info');
        return res.data as Map<String, dynamic>;
      }, () => MockData.mcnInfo());

  Future<Map<String, dynamic>> getMcnDashboard() =>
      _guard(() async {
        final res = await _dio.get('/api/mcn/dashboard');
        return res.data as Map<String, dynamic>;
      }, () => MockData.mcnDashboard());

  Future<Map<String, dynamic>> applyMcn(Map<String, dynamic> data) =>
      _write(() async {
        final res = await _dio.post('/api/mcn/apply', data: data);
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok());

  // ====== 晶晶日上 ======
  Future<Map<String, dynamic>> getTheater() =>
      _guard(() async {
        final res = await _dio.get('/api/theater');
        return res.data as Map<String, dynamic>;
      }, () => MockData.theater());

  // ====== AI试镜 ======
  Future<Map<String, dynamic>> submitAudition(Map<String, dynamic> data) =>
      _write(() async {
        final res = await _dio.post('/api/projects/audition', data: data);
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'humanId': 101, 'status': 'demo_created'}));

  // ====== 平台内私信（IM） ======
  Future<Map<String, dynamic>> createConversation(int humanId, {String? initialMessage}) =>
      _write(() async {
        final res = await _dio.post('/api/messages/conversations', data: {
          'humanId': humanId,
          if (initialMessage != null) 'initialMessage': initialMessage,
        });
        return res.data as Map<String, dynamic>;
      }, () => {
            'id': 1,
            'humanId': humanId,
            'list': MockData.conversations()['list'],
            'isDemo': true,
          });

  Future<Map<String, dynamic>> getConversations() =>
      _guard(() async {
        final res = await _dio.get('/api/messages/conversations');
        return res.data as Map<String, dynamic>;
      }, () => MockData.conversations());

  Future<Map<String, dynamic>> getMessages(int conversationId) =>
      _guard(() async {
        final res = await _dio.get('/api/messages/conversations/$conversationId/messages');
        return res.data as Map<String, dynamic>;
      }, () => MockData.messages(conversationId));

  Future<Map<String, dynamic>> sendMessage(int conversationId, String content) =>
      _write(() async {
        final res = await _dio.post(
            '/api/messages/conversations/$conversationId/messages',
            data: {'content': content});
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'content': content, 'from': 'me'}));

  Future<int> getUnreadCount() =>
      _guard(() async {
        final res = await _dio.get('/api/messages/unread');
        return res.data['totalUnread'] as int? ?? 0;
      }, () => 1);

  // ====== 场景模板 ======
  Future<List<dynamic>> getSceneTemplates({String? category}) =>
      _guard(() async {
        final res = await _dio.get('/api/scene-templates', queryParameters: {
          if (category != null) 'category': category,
        });
        return res.data['list'] as List? ?? [];
      }, () => MockData.sceneTemplates());

  // ====== 评价系统 ======
  Future<Map<String, dynamic>> submitReview(Map<String, dynamic> data) =>
      _write(() async {
        final res = await _dio.post('/api/order-reviews', data: data);
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok());

  Future<Map<String, dynamic>> getTalentReviews(int talentId, {int page = 1}) =>
      _guard(() async {
        final res = await _dio.get('/api/order-reviews/talent/$talentId',
            queryParameters: {'page': page});
        return res.data as Map<String, dynamic>;
      }, () => MockData.talentReviews(talentId));

  // ====== 使用报告 / 定价 / 样片 ======
  Future<Map<String, dynamic>> getUsageReport(int humanId) =>
      _guard(() async {
        final res = await _dio.get('/api/humans/$humanId/usage-report');
        return res.data as Map<String, dynamic>;
      }, () => MockData.usageReport(humanId));

  Future<Map<String, dynamic>> getPricingSuggest(int humanId) =>
      _guard(() async {
        final res = await _dio.get('/api/humans/$humanId/pricing-suggest');
        return res.data as Map<String, dynamic>;
      }, () => MockData.pricingSuggest(humanId));

  Future<List<dynamic>> getShowreels(int humanId) =>
      _guard(() async {
        final res = await _dio.get('/api/humans/$humanId/showreels');
        return res.data['showreels'] as List? ?? [];
      }, () => MockData.showreels(humanId));

  Future<Map<String, dynamic>> requestRedo(String orderNo, String reason) =>
      _write(() async {
        final res = await _dio.post('/api/videos/redo/$orderNo', data: {'reason': reason});
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok());

  Future<Map<String, dynamic>> getAfterSales(String orderNo) =>
      _guard(() async {
        final res = await _dio.get('/api/videos/after-sales/$orderNo');
        return res.data as Map<String, dynamic>;
      }, () => {
            'orderNo': orderNo,
            'afterSalesStatus': 'processing',
            'timeline': [
              {'action': 'apply', 'operatorRole': 'user', 'remark': '申请已提交（演示）', 'createdAt': '刚刚'},
              {'action': 'processing', 'operatorRole': 'platform', 'remark': '平台处理中（演示）', 'createdAt': '刚刚'},
            ],
            'refund': null,
            'isDemo': true,
          });

  // ====== 分享 / 套餐 ======
  Future<Map<String, dynamic>> createShare(Map<String, dynamic> data) =>
      _write(() async {
        final res = await _dio.post('/api/share/create', data: data);
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'reward': 0}));

  Future<Map<String, dynamic>> getMyShares() =>
      _guard(() async {
        final res = await _dio.get('/api/share/my');
        return res.data as Map<String, dynamic>;
      }, () => {'list': [], 'isDemo': true});

  Future<List<dynamic>> getPackages() =>
      _guard(() async {
        final res = await _dio.get('/api/packages');
        return res.data['list'] as List? ?? [];
      }, () => MockData.packages());

  Future<List<dynamic>> getMyPackages() =>
      _guard(() async {
        final res = await _dio.get('/api/packages/my');
        return res.data['list'] as List? ?? [];
      }, () => MockData.myPackages());

  // ====== MCN 增强 ======
  Future<List<dynamic>> getMcnArtists({int page = 1}) =>
      _guard(() async {
        final res = await _dio.get('/api/mcn/artists', queryParameters: {'page': page});
        return res.data['list'] as List? ?? [];
      }, () => MockData.mcnArtists());

  Future<Map<String, dynamic>> getMcnFanProfile() =>
      _guard(() async {
        final res = await _dio.get('/api/mcn/fan-profile');
        return res.data as Map<String, dynamic>;
      }, () => {'age': {'18-24': 0.42, '25-34': 0.38}, 'gender': {'female': 0.66}, 'isDemo': true});

  Future<List<dynamic>> getMcnRanking() =>
      _guard(() async {
        final res = await _dio.get('/api/mcn/ranking');
        return res.data['list'] as List? ?? [];
      }, () => MockData.mcnRanking());

  // ====== 品牌代言授权书/效果 ======
  Future<Map<String, dynamic>> getAuthLetter(String orderNo) =>
      _guard(() async {
        final res = await _dio.get('/api/endorsement/auth-letter/$orderNo');
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'orderNo': orderNo, 'authLetterUrl': ''}));

  Future<Map<String, dynamic>> getEndorsementMetrics(String orderNo) =>
      _guard(() async {
        final res = await _dio.get('/api/endorsement/metrics/$orderNo');
        return res.data as Map<String, dynamic>;
      }, () => {'exposure': 0, 'clicks': 0, 'isDemo': true});

  // ====== 剧本方 ======
  Future<Map<String, dynamic>> applyScriptwriter(Map<String, dynamic> data) =>
      _write(() async {
        final res = await _dio.post('/api/scripts/apply', data: data);
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok());

  Future<Map<String, dynamic>> uploadScript(Map<String, dynamic> data) =>
      _write(() async {
        final res = await _dio.post('/api/scripts/upload', data: data);
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok());

  // ====== 定制剧（普通档5000：99意向金担保 + 4901制作款担保，7步） ======
  Future<Map<String, dynamic>> createSampleOrder({int? humanId, required String contactName, required String contactPhone}) =>
      _write(() async {
        final res = await _dio.post('/api/samples/order', data: {
          'humanId': humanId, 'contactName': contactName, 'contactPhone': contactPhone,
        });
        return res.data as Map<String, dynamic>;
      }, () {
        _demoSample = {
          'id': 7001, 'orderNo': 'SP-DEMO-7001', 'status': 'draft', 'step': 0,
          'totalPrice': 5000, 'intentDeposit': 99, 'productionFee': 4901,
          'genre': null, 'isDemo': true,
        };
        return MockData.ok(_demoSampleOrder(7001));
      });

  Future<Map<String, dynamic>> paySampleIntent(int orderId) =>
      _write(() async {
        final res = await _dio.post('/api/samples/$orderId/pay-intent');
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok(_demoAdvance(orderId, 'intent_escrow', 1)));

  Future<Map<String, dynamic>> selectSampleGenre(int orderId, String genre) =>
      _write(() async {
        final res = await _dio.post('/api/samples/$orderId/select-genre', data: {'genre': genre});
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok(_demoAdvance(orderId, 'genre_selected', 2, extra: {'genre': genre})));

  Future<Map<String, dynamic>> getSampleLibrary({String? genre}) =>
      _guard(() async {
        final res = await _dio.get('/api/samples/library',
            queryParameters: genre != null ? {'genre': genre} : null);
        return res.data as Map<String, dynamic>;
      }, () => MockData.sampleLibrary());

  Future<Map<String, dynamic>> pickSampleReference(int orderId, int referenceId) =>
      _write(() async {
        final res = await _dio.post('/api/samples/$orderId/pick-reference',
            data: {'referenceId': referenceId});
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok(_demoAdvance(orderId, 'scripting', 3)));

  Future<Map<String, dynamic>> getSampleScript(int orderId) =>
      _guard(() async {
        final res = await _dio.get('/api/samples/$orderId/script');
        return res.data as Map<String, dynamic>;
      }, () => {'script': '（演示）这是为您生成的定制剧本初稿，可在此基础上修改。', 'isDemo': true});

  Future<Map<String, dynamic>> submitScriptFeedback(int orderId, String feedback) =>
      _write(() async {
        final res = await _dio.post('/api/samples/$orderId/script-feedback',
            data: {'feedback': feedback});
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok(_demoAdvance(orderId, 'scripting', 3)));

  Future<Map<String, dynamic>> finalizeSampleScript(int orderId) =>
      _write(() async {
        final res = await _dio.post('/api/samples/$orderId/finalize-script');
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok(_demoAdvance(orderId, 'script_finalized', 4, extra: {'productionFee': 4901})));

  Future<Map<String, dynamic>> paySampleProduction(int orderId) =>
      _write(() async {
        final res = await _dio.post('/api/samples/$orderId/pay-production');
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok(_demoAdvance(orderId, 'producing', 5, extra: {'paid': true})));

  Future<Map<String, dynamic>> reviewSample(int orderId, String action, {String? reason}) =>
      _write(() async {
        final res = await _dio.post('/api/samples/$orderId/review',
            data: {'action': action, 'reason': reason});
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok(_demoAdvance(orderId, action == 'accept' ? 'settled' : 'producing', action == 'accept' ? 7 : 5, extra: {'action': action})));

  Future<Map<String, dynamic>> getSampleOrder(int orderId) =>
      _guard(() async {
        final res = await _dio.get('/api/samples/$orderId');
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok(_demoSampleOrder(orderId)));

  Future<List<dynamic>> getMySampleOrders() =>
      _guard(() async {
        final res = await _dio.get('/api/samples/my');
        return res.data['list'] as List? ?? [];
      }, () => _demoSample == null ? [] : [
            _demoSampleOrder(7001),
          ]);

  /// 统一订单聚合（99视频 + 品牌代言 + 定制剧），group: all/pending/producing/completed
  Future<Map<String, dynamic>> getAllOrders({String group = 'all'}) =>
      _guard(() async {
        final res = await _dio.get('/api/orders/all', queryParameters: {'group': group});
        return res.data as Map<String, dynamic>;
      }, () {
        // 演示模式：合并三类本地订单
        final videos = MockData.instance().myVideos().map((o) => {
              'kind': 'video',
              'orderNo': o['orderNo'],
              'title': o['title'] ?? '数字人视频',
              'counterparty': o['talentName'] ?? '数字人艺人',
              'amount': o['amount'],
              'rawStatus': o['status'],
              'statusText': _demoMediaStatusText(o['status']?.toString()),
              'group': o['status'] == 'completed' ? 'completed' : 'producing',
              'canReview': o['status'] == 'completed',
              'canAfterSales': true,
              'createdAt': o['createdAt'],
            });
        final endorsements = MockData.myEndorsements().map((o) => {
              'kind': 'endorsement',
              'orderNo': o['orderNo'],
              'title': o['packageName'] ?? (o['brand'] != null ? '品牌代言·${o['brand']}' : '品牌代言'),
              'counterparty': o['talentName'] ?? '数字人艺人',
              // V12.2 起后端金额统一为「元」，前端禁止再 /100
              'amount': o['amount'],
              'rawStatus': o['status'],
              'statusText': _demoMediaStatusText(o['status']?.toString()),
              'group': o['status'] == 'completed' ? 'completed' : 'producing',
              'canReview': o['status'] == 'completed',
              'canAfterSales': true,
              'createdAt': o['createdAt'],
            });
        final samples = _demoSample == null
            ? []
            : [
          {
            'kind': 'sample',
            'detailId': _demoSample!['id'],
            'orderNo': _demoSample!['orderNo'],
            'title': '定制剧（本人主角）',
            'counterparty': '平台制作团队',
            'amount': _demoSample!['totalPrice'],
            'rawStatus': _demoSample!['status'],
            'statusText': _demoSampleStatusText(_demoSample!['status']?.toString()),
            'group': _demoSample!['status'] == 'completed' ? 'completed' : 'producing',
            'canReview': false,
            'canAfterSales': false,
            'createdAt': '演示进行中',
          }
        ];
        var list = [...videos, ...endorsements, ...samples];
        if (group != 'all') list = list.where((o) => o['group'] == group).toList();
        final counts = {'all': 0, 'pending': 0, 'producing': 0, 'completed': 0};
        for (final o in [...videos, ...endorsements, ...samples]) {
          counts[o['group'] as String] = (counts[o['group']] ?? 0) + 1;
        }
        counts['all'] = counts['pending']! + counts['producing']! + counts['completed']!;
        return {'list': list, 'counts': counts, 'isDemo': true};
      });

  static String _demoSampleStatusText(String? status) {
    const map = {
      'draft': '待支付意向金',
      'intent_escrow': '意向金托管中',
      'scripting': '剧本创作中',
      'storyboard': '分镜制作中',
      'shooting': '拍摄制作中',
      'rough_cut': '粗剪审核中',
      'final_deliver': '成片交付中',
      'completed': '已完成',
    };
    return map[status] ?? '推进中';
  }

  static String _demoMediaStatusText(String? status) {
    const map = {
      'pending': '待付款',
      'paid': '已付款',
      'delivering': '制作中',
      'delivered': '待验收',
      'completed': '已完成',
      'cancelled': '已取消',
      'refunded': '已退款',
    };
    return map[status] ?? (status ?? '处理中');
  }

  Future<Map<String, dynamic>> submitCustomRequest(Map<String, dynamic> data) =>
      _write(() async {
        final res = await _dio.post('/api/samples/custom-request', data: data);
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok());

  // ====== 创建数字人（演示模式不真实上传，直接返回成功） ======
  Future<Map<String, dynamic>> createHuman({
    required String name,
    required String style,
    required String photoPath,
    bool scopeVideo = true,
    bool scopeEndorsement = false,
    bool scopeFilm = false,
  }) async {
    return _write(() async {
      FormData formData = FormData.fromMap({
        'name': name,
        'style': style,
        'scopeVideo': scopeVideo ? 1 : 0,
        'scopeEndorsement': scopeEndorsement ? 1 : 0,
        'scopeFilm': scopeFilm ? 1 : 0,
        'photo': await MultipartFile.fromFile(photoPath, filename: 'photo.jpg'),
      });
      final res = await _dio.post('/api/humans', data: formData);
      return res.data as Map<String, dynamic>;
    }, () => MockData.ok({
        'humanId': DateTime.now().millisecondsSinceEpoch ~/ 1000,
        'id': DateTime.now().millisecondsSinceEpoch ~/ 1000,
        'name': name,
        'style': style,
        'tags': [style],
        'scopeVideo': scopeVideo,
        'scopeEndorsement': scopeEndorsement,
        'scopeFilm': scopeFilm,
        'localPhoto': photoPath,
        'status': 'pending',
        'statusText': '审核中（演示）',
      }));
  }
  // ====== AI 文生图 / 文生视频 / 任务轮询（V12.3 闭环） ======
  /// 文生图：POST /api/ai/image，body {prompt, size?}
  Future<Map<String, dynamic>> createAiImage({required String prompt, String size = '1024x1024'}) {
    return _write(() async {
      final res = await _dio.post('/api/ai/image', data: {'prompt': prompt, 'size': size});
      return res.data as Map<String, dynamic>;
    }, () => MockData.aiImageTask(prompt));
  }

  /// 文生视频 / 图生视频：POST /api/ai/video
  Future<Map<String, dynamic>> createAiVideo({
    required String type, // t2v | i2v
    required String prompt,
    String? imageUrl,
    int duration = 5,
    String ratio = '16:9',
    String resolution = '720p',
  }) {
    return _write(() async {
      final res = await _dio.post('/api/ai/video', data: {
        'type': type,
        'prompt': prompt,
        if (imageUrl != null) 'imageUrl': imageUrl,
        'duration': duration,
        'ratio': ratio,
        'resolution': resolution,
      });
      return res.data as Map<String, dynamic>;
    }, () => MockData.aiVideoTask(prompt));
  }

  /// 查询 AI 任务：GET /api/ai/task/:id
  Future<Map<String, dynamic>> getAiTask(String taskId) {
    return _guard(() async {
      final res = await _dio.get('/api/ai/task/$taskId');
      return res.data as Map<String, dynamic>;
    }, () => MockData.aiTaskPolling(taskId));
  }

  /// AI 服务健康状态
  Future<Map<String, dynamic>> getAiStatus() {
    return _guard(() async {
      final res = await _dio.get('/api/ai/status');
      return res.data as Map<String, dynamic>;
    }, () => MockData.ok({'configured': false, 'demo': true, 'queue': 0}));
  }

  // ====== 支付宝 APP 支付（V12.4：金额由服务端订单权威决定，前端不传金额） ======
  /// 创建支付宝 APP 支付单：POST /api/pay/alipay/create
  /// bizType: video | endorsement | dream | sample（sample 需 stage=intent|production）
  /// configured=true 时带 orderString（APP 订单串，用于唤起支付宝）；
  /// configured=false 表示服务端尚未配置密钥，走演示占位，不做假支付。
  Future<Map<String, dynamic>> createAlipayOrder({
    required String orderNo,
    required String bizType,
    String? stage,
  }) =>
      _write(() async {
        final res = await _dio.post('/api/pay/alipay/create', data: {
          'orderNo': orderNo,
          'bizType': bizType,
          if (stage != null) 'stage': stage,
        });
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({
            'configured': false,
            'demo': true,
            'payMode': 'demo',
            'status': 'unconfigured',
            'orderNo': orderNo,
            'bizType': bizType,
          }));

  /// 查询支付状态：GET /api/pay/status/:orderNo（支付返回后轮询对账）
  Future<Map<String, dynamic>> getAlipayStatus(String orderNo) =>
      _guard(() async {
        final res = await _dio.get('/api/pay/status/$orderNo');
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'orderNo': orderNo, 'payments': const []}));
}
