/// MockData - 演示模式本地兜底数据（断网/演示时保证完整可点）
///
/// 统一约定（SSOT）：
/// 1. 所有金额字段一律为「元」（与后端 HTTP 边界一致），后端数据库内部才存分；
/// 2. 字段名与后端接口返回保持一致，避免在线/演示两套字段；
/// 3. 全部为真人写实暖光人设，禁止动漫/二次元/赛博卡通描述。
class MockData {
  static Map<String, dynamic> ok([Map<String, dynamic>? extra]) => {
        'code': 0,
        'message': 'success',
        'isDemo': true,
        ...?extra,
      };

  // ───────── 数字人（7 位真人写实风格，本地暖光素材） ─────────
  static List<dynamic> humans() => [
        {
          'id': 101,
          'name': '林沐雪',
          'localAvatar': 'assets/images/artist_1.jpg',
          'tags': ['古风', '温婉', '配音'],
          'style': '古风',
          'specialty': '古装祝福、国风配音、宫廷剧',
          'heat': 9862, 'sales': 328, 'price': 99, 'minPrice': 99,
          'province': '浙江', 'city': '杭州市', 'district': '西湖区',
          'qualityGrade': 'S', 'verifiedLevel': 'gold',
          'avgRating': 4.9, 'reviewCount': 286, 'goodRate': 99,
          'level': '3', 'schedule': 'available',
        },
        {
          'id': 102,
          'name': '苏念卿',
          'localAvatar': 'assets/images/artist_2.jpg',
          'tags': ['现代', '甜系', '祝福'],
          'style': '现代',
          'specialty': '生日祝福、节日问候、甜系口播',
          'heat': 8740, 'sales': 256, 'price': 129, 'minPrice': 99,
          'province': '上海', 'city': '上海市', 'district': '徐汇区',
          'qualityGrade': 'A', 'verifiedLevel': 'gold',
          'avgRating': 4.8, 'reviewCount': 221, 'goodRate': 97,
          'level': '3', 'schedule': 'available',
        },
        {
          'id': 103,
          'name': '顾夜白',
          'localAvatar': 'assets/images/artist_3.jpg',
          'tags': ['现代', '商务', '代言'],
          'style': '现代',
          'specialty': '商务祝福、品牌口播、企业代言',
          'heat': 9120, 'sales': 412, 'price': 199, 'minPrice': 99,
          'province': '广东', 'city': '深圳市', 'district': '南山区',
          'qualityGrade': 'S', 'verifiedLevel': 'gold',
          'avgRating': 4.9, 'reviewCount': 368, 'goodRate': 99,
          'level': '3', 'schedule': 'available',
        },
        {
          'id': 104,
          'name': '沈清辞',
          'localAvatar': 'assets/images/artist_4.jpg',
          'tags': ['青春', '校园', '学长'],
          'style': '现代',
          'specialty': '青春校园、毕业祝福、暖声鼓励',
          'heat': 7655, 'sales': 189, 'price': 159, 'minPrice': 99,
          'province': '江苏', 'city': '南京市', 'district': '鼓楼区',
          'qualityGrade': 'A', 'verifiedLevel': 'silver',
          'avgRating': 4.7, 'reviewCount': 152, 'goodRate': 96,
          'level': '3', 'schedule': 'available',
        },
        {
          'id': 105,
          'name': '江屿川',
          'localAvatar': 'assets/images/artist_5.jpg',
          'tags': ['现代', '御姐', '气场'],
          'style': '现代',
          'specialty': '御姐气场、品牌代言、轻奢口播',
          'heat': 8030, 'sales': 267, 'price': 179, 'minPrice': 99,
          'province': '北京', 'city': '北京市', 'district': '朝阳区',
          'qualityGrade': 'A', 'verifiedLevel': 'gold',
          'avgRating': 4.8, 'reviewCount': 233, 'goodRate': 97,
          'level': '3', 'schedule': 'available',
        },
        {
          'id': 106,
          'name': '温以凡',
          'localAvatar': 'assets/images/artist_6.jpg',
          'tags': ['武侠', '国风', '侠客'],
          'style': '古风',
          'specialty': '国风侠客、武侠短剧、江湖祝福',
          'heat': 8990, 'sales': 523, 'price': 99, 'minPrice': 99,
          'province': '陕西', 'city': '西安市', 'district': '雁塔区',
          'qualityGrade': 'S', 'verifiedLevel': 'gold',
          'avgRating': 4.9, 'reviewCount': 470, 'goodRate': 98,
          'level': '3', 'schedule': 'available',
        },
        {
          'id': 107,
          'name': '陆时衍',
          'localAvatar': 'assets/images/artist_7.jpg',
          'tags': ['现代', '成熟', '沉稳'],
          'style': '现代',
          'specialty': '成熟稳重型、企业开业、长辈祝福',
          'heat': 6540, 'sales': 198, 'price': 149, 'minPrice': 99,
          'province': '四川', 'city': '成都市', 'district': '锦江区',
          'qualityGrade': 'B', 'verifiedLevel': 'silver',
          'avgRating': 4.6, 'reviewCount': 160, 'goodRate': 95,
          'level': '3', 'schedule': 'available',
        },
      ];

  static Map<String, dynamic> humanById(int id) =>
      humans().firstWhere((h) => h['id'] == id, orElse: () => humans().first)
          as Map<String, dynamic>;

  // ───────── 视频模板（三档，单位元） ─────────
  static List<dynamic> videoTemplates() => [
        {'id': 1, 'talentId': 101, 'title': '基础祝福', 'category': '祝福视频', 'duration': 15, 'price': 99, 'sold': 156, 'desc': '15秒以内，适合生日、节日祝福'},
        {'id': 2, 'talentId': 101, 'title': '精品祝福', 'category': '祝福视频', 'duration': 30, 'price': 299, 'sold': 98, 'desc': '30秒精品祝福，可定制台词和场景'},
        {'id': 3, 'talentId': 101, 'title': '豪华定制', 'category': '祝福视频', 'duration': 60, 'price': 699, 'sold': 34, 'desc': '60秒豪华定制，多场景切换，含品牌露出'},
      ];

  // 买家侧不再展示分账/税费，试算仅回显商品金额（元）。
  static Map<String, dynamic> quote(num amount, String identityType) => {
        'amount': amount,
        'platformFee': 0,
        'aiCost': 0,
        'taxAmount': 0,
        'netAmount': amount,
        'identityType': identityType,
        'isDemo': true,
      };

  // ───────── 视频订单（演示态内存累积，金额单位元） ─────────
  static final _instance = MockData._();
  factory MockData.instance() => _instance;
  MockData._();
  final List<Map<String, dynamic>> _videoOrders = [
    {
      'orderNo': 'VD20260824001', 'status': 'completed', 'settleStatus': 'settled',
      'title': '生日祝福视频', 'talentName': '林沐雪', 'amount': 99, 'netAmount': 99,
      'recipient': '小雅', 'message': '生日快乐，愿你岁岁欢愉', 'email': '',
      'createdAt': '2026-08-24 10:22', 'deliverTime': '2026-08-24 16:40',
      'videoUrl': '', 'redoAvailable': true, 'redoCount': 0,
    },
    {
      'orderNo': 'VD20260826002', 'status': 'delivering', 'settleStatus': 'unsettled',
      'title': '婚礼祝福视频', 'talentName': '顾夜白', 'amount': 299, 'netAmount': 299,
      'recipient': '陈先生&林小姐', 'message': '祝新婚快乐，百年好合', 'email': '',
      'createdAt': '2026-08-26 09:05', 'videoUrl': '',
    },
  ];

  Map<String, dynamic> addVideoOrder(Map<String, dynamic> data) {
    final orderNo = 'VD${DateTime.now().millisecondsSinceEpoch}';
    _videoOrders.insert(0, {
      'orderNo': orderNo,
      'status': 'paid',
      'settleStatus': 'unsettled',
      'title': data['scene'] ?? '定制祝福视频',
      'talentName': data['talentName'] ?? '艺人',
      'amount': data['amount'] ?? 99,
      'netAmount': data['amount'] ?? 99,
      'recipient': data['recipient'] ?? '',
      'message': data['message'] ?? data['remark'] ?? '',
      'createdAt': DateTime.now().toString().substring(0, 16),
      'isDemo': true,
    });
    return ok({'orderNo': orderNo, 'amount': data['amount'] ?? 99});
  }

  List<dynamic> myVideos() => _videoOrders;

  // ───────── 品牌代言套餐（线④定价：单品口播1999 / 季度代言19999，单位元） ─────────
  static List<dynamic> endorsementPackages() => [
        {
          'id': 1, 'name': '单品口播', 'price': 1999, 'duration': '15-30秒',
          'deliverables': '1条口播视频 + 3张精修定妆图',
          'rights': ['数字人口播视频1条', '社交媒体投放授权30天', '3张精修宣传图', '可修改1次'],
          'cycle': '5个工作日交付',
        },
        {
          'id': 2, 'name': '季度代言', 'price': 19999, 'duration': '90天',
          'deliverables': '6条视频 + 12张图 + 全渠道季度授权',
          'rights': ['数字人视频6条', '精修宣传图12张', '全渠道投放授权90天', '专属经纪对接', '可修改3次'],
          'cycle': '分批交付，首条7个工作日',
        },
      ];

  static List<dynamic> myEndorsements() => [
        {'orderNo': 'ED20260820001', 'brand': '某茶饮品牌', 'packageName': '单品口播', 'amount': 1999, 'status': 'completed', 'createdAt': '2026-08-20 14:30'},
      ];

  // ───────── 定制剧场项目（自有IP，金额为制作预算，单位元） ─────────
  // 自有 IP 项目（字段对齐后端 /api/projects：席位 seatsTotal/seatsClaimed 为整数名额，非金额）
  static List<dynamic> projects() => [
        {'id': 1, 'title': '黄帝史诗·天下合', 'cover': '/uploads/banners/banner1.jpg', 'localCover': 'assets/images/theater_1.jpg', 'type': '古装史诗', 'genre': '华夏史诗', 'intro': '上古炎黄合盟、涿鹿定鼎，做自己人生的主角。', 'goal_amount': 500000, 'raised_amount': 328000, 'client_count': 26, 'seatsTotal': 100, 'seatsClaimed': 72, 'protagonist': '少年轩辕', 'roles': 9, 'days': 23, 'status': 'recruiting'},
        {'id': 2, 'title': '少年龙武', 'cover': '/uploads/banners/banner3.jpg', 'localCover': 'assets/images/theater_3.jpg', 'type': '热血成长', 'genre': '青春成长', 'intro': '平凡少年习武自强，热血成长由你主演。', 'goal_amount': 300000, 'raised_amount': 189000, 'client_count': 21, 'seatsTotal': 100, 'seatsClaimed': 45, 'protagonist': '龙武', 'roles': 7, 'days': 45, 'status': 'recruiting'},
        {'id': 3, 'title': '边境暗影', 'cover': '/uploads/banners/banner2.jpg', 'localCover': 'assets/images/theater_2.jpg', 'type': '悬疑短剧', 'genre': '军旅谍战', 'intro': '边境缉毒暗流涌动，悬疑动作大戏等你入局。', 'goal_amount': 800000, 'raised_amount': 656000, 'client_count': 34, 'seatsTotal': 100, 'seatsClaimed': 28, 'protagonist': '调查记者', 'roles': 6, 'days': 58, 'status': 'recruiting'},
      ];

  static Map<String, dynamic> projectById(int id) =>
      projects().firstWhere((p) => p['id'] == id, orElse: () => projects().first)
          as Map<String, dynamic>;

  // ───────── 选剧库（字段对齐后端 /api/samples/library：按 genre 分组；video_url 为成片样片直链） ─────────
  // 在线以后端 DB 为准；此为断网/demo 回退，保证样片库闭环可演示。视频/封面均为服务器 /uploads 相对路径。
  static Map<String, dynamic> sampleLibrary() {
    List<dynamic> row(Map<String, dynamic> m) => [m];
    final library = <String, dynamic>{
      '古装逆袭': row({
        'id': 1, 'genre': '古装逆袭', 'title': '黄帝史诗·天下合',
        'outline': '上古炎黄合盟、涿鹿定鼎。以华夏史诗为骨，把用户写成扭转乾坤的少年主角，大气厚重又有强代入感。',
        'characters': [
          {'name': '少年轩辕'}, {'name': '炎帝'}, {'name': '蚩尤'},
        ],
        'tags': ['华夏史诗', '热血逆袭', '宏大叙事'],
        'market_data': {'heat': 9.6, 'rating': '豆瓣风评向好'},
        'heat_score': 95,
        'cover_url': '/uploads/samples/huangdi_ttx_cover.jpg',
        'video_url': '/uploads/samples/huangdi_ttx.mp4',
        'sort_order': 1, 'status': 'active',
      }),
      '悬疑推理': row({
        'id': 4, 'genre': '悬疑推理', 'title': '七宗罪·人性局',
        'outline': '以七宗罪为引的人性悬疑样片：欲望、猜忌与反转层层递进，强情绪钩子，适合定制高张力短剧。',
        'characters': [
          {'name': '局中人'}, {'name': '追查者'},
        ],
        'tags': ['人性悬疑', '强反转', '高张力'],
        'market_data': {'heat': 9.2, 'rating': '节奏紧凑'},
        'heat_score': 88,
        'cover_url': '/uploads/samples/renxingju_7sins_cover.jpg',
        'video_url': '/uploads/samples/renxingju_7sins.mp4',
        'sort_order': 2, 'status': 'active',
      }),
      '青春校园': row({
        'id': 2, 'genre': '青春校园', 'title': '少年龙武',
        'outline': '平凡少年习武自强、逆风成长，热血高燃，由你出演自己的成长主角。',
        'characters': [
          {'name': '龙武'}, {'name': '师父'},
        ],
        'tags': ['热血成长', '青春励志'],
        'market_data': {'heat': 8.8, 'rating': '高燃治愈'},
        'heat_score': 90,
        'cover_url': '/uploads/banners/banner3.jpg',
        'video_url': '',
        'sort_order': 3, 'status': 'active',
      }),
      '军旅谍战': row({
        'id': 3, 'genre': '军旅谍战', 'title': '边境暗影',
        'outline': '边境缉毒暗流涌动，悬疑动作大戏，身份迷局与动作场面交织。',
        'characters': [
          {'name': '调查记者'}, {'name': '暗影'},
        ],
        'tags': ['军旅谍战', '动作悬疑'],
        'market_data': {'heat': 9.0, 'rating': '硬核动作'},
        'heat_score': 86,
        'cover_url': '/uploads/banners/banner2.jpg',
        'video_url': '',
        'sort_order': 4, 'status': 'active',
      }),
    };
    return {
      'genres': ['古装逆袭', '都市甜宠', '悬疑推理', '家庭伦理', '青春校园', '职场商战', '军旅谍战'],
      'library': library,
      'isDemo': true,
    };
  }


  // ───────── 钱包（单位：元；与后端 /settlement/wallet 边界一致） ─────────
  static Map<String, dynamic> wallet() => {
        'balance': 1286.50,
        'frozen': 500.00,
        'pending': 396.00,
        'totalIncome': 8642.00,
        'totalWithdrawn': 6855.50,
        'bankCard': '',
        'alipayAccount': '',
        'idVerified': false,
        'identityType': 'personal',
        'identityStatus': 'none',
        'isDemo': true,
      };

  static List<dynamic> transactions() => [
        {'id': 1, 'txNo': 'TX2026082401', 'type': 'income', 'title': '视频订单收入', 'amount': 89.10, 'balanceAfter': 1286.50, 'description': '视频订单收入-VD20260824001', 'createdAt': '2026-08-24 16:42', 'date': '2026-08-24 16:42'},
        {'id': 2, 'txNo': 'TX2026082301', 'type': 'freeze', 'title': '保证金冻结', 'amount': -500.00, 'balanceAfter': 1197.40, 'description': '保证金冻结', 'createdAt': '2026-08-23 11:08', 'date': '2026-08-23 11:08'},
        {'id': 3, 'txNo': 'TX2026082101', 'type': 'subsidy', 'title': '新人AI成本补贴', 'amount': 30.00, 'balanceAfter': 1697.40, 'description': '前90天AI制作成本补贴', 'createdAt': '2026-08-21 09:00', 'date': '2026-08-21 09:00'},
        {'id': 4, 'txNo': 'TX2026081801', 'type': 'withdraw', 'title': '提现到账', 'amount': -1200.00, 'balanceAfter': 1667.40, 'description': '提现-支付宝', 'createdAt': '2026-08-18 15:26', 'date': '2026-08-18 15:26'},
      ];

  static Map<String, dynamic> settlementSummary() => {
        'video': {'total': 5280.00, 'count': 42},
        'endorsement': {'total': 3362.00, 'count': 3},
        'pending': {'total': 396.00, 'count': 2},
        'isDemo': true,
      };

  static Map<String, dynamic> identityStatus() =>
      {'status': 'none', 'identityType': 'personal', 'isDemo': true};

  // ───────── MCN（字段名对齐后端 /api/mcn/*，金额单位元） ─────────
  static Map<String, dynamic> mcnInfo() => {
        'id': 1, 'name': '星河文化传媒', 'status': 'approved',
        'contact_name': '王经理', 'contact_phone': '138****8888',
        'isFreeTrial': true, 'freeUntil': '2026-11-24',
        'talents': mcnArtists(),
        'isDemo': true,
      };

  static Map<String, dynamic> mcnDashboard() => {
        'mcnId': 1,
        'name': '星河文化传媒',
        'status': 'approved',
        'isFreeTrial': true,
        'freeUntil': '2026-11-24',
        'managementFeeRate': 0,
        'talentCount': 18,
        'totalOrders': 126,
        'monthOrders': 23,
        'totalMcnIncome': 8642.50,      // 元
        'monthMcnIncome': 1986.00,      // 元
        'totalTalentIncome': 28410.00,  // 元
        'pendingWithdraw': 2360.80,     // 元
        'walletBalance': 2360.80,       // 元
        'walletFrozen': 0.0,
        'isDemo': true,
      };

  static List<dynamic> mcnArtists() => [
        {'id': 101, 'name': '林沐雪', 'localAvatar': 'assets/images/artist_1.jpg', 'heat': 9862, 'sales': 328, 'price': 99, 'verifiedLevel': 'gold', 'qualityGrade': 'S', 'status': 'active', 'talentShare': 70, 'completedOrders': 86, 'totalIncome': 9280.00, 'avgRating': 4.9, 'reviewCount': 286},
        {'id': 103, 'name': '顾夜白', 'localAvatar': 'assets/images/artist_3.jpg', 'heat': 9120, 'sales': 412, 'price': 199, 'verifiedLevel': 'gold', 'qualityGrade': 'S', 'status': 'active', 'talentShare': 70, 'completedOrders': 124, 'totalIncome': 12640.00, 'avgRating': 4.9, 'reviewCount': 368},
        {'id': 106, 'name': '温以凡', 'localAvatar': 'assets/images/artist_6.jpg', 'heat': 8990, 'sales': 523, 'price': 99, 'verifiedLevel': 'gold', 'qualityGrade': 'S', 'status': 'active', 'talentShare': 70, 'completedOrders': 156, 'totalIncome': 6490.00, 'avgRating': 4.9, 'reviewCount': 470},
      ];

  static List<dynamic> mcnRanking() => [
        {'rank': 1, 'id': 106, 'name': '温以凡', 'localAvatar': 'assets/images/artist_6.jpg', 'heat': 8990, 'sales': 523, 'orders': 156},
        {'rank': 2, 'id': 103, 'name': '顾夜白', 'localAvatar': 'assets/images/artist_3.jpg', 'heat': 9120, 'sales': 412, 'orders': 124},
        {'rank': 3, 'id': 101, 'name': '林沐雪', 'localAvatar': 'assets/images/artist_1.jpg', 'heat': 9862, 'sales': 328, 'orders': 86},
      ];

  // ───────── 晶晶日上 / 场景 / 套餐 / 评价等 ─────────
  static Map<String, dynamic> theater() => {
        'banners': projects(),
        'recommend': projects(),
        'isDemo': true,
      };

  static List<dynamic> sceneTemplates() => [
        {'id': 1, 'name': '生日祝福', 'category': 'birthday', 'icon': 'cake', 'suggestedPrice': 99, 'suggestedDuration': 15, 'defaultMessage': '祝你生日快乐，万事如意！'},
        {'id': 2, 'name': '婚礼祝福', 'category': 'wedding', 'icon': 'favorite', 'suggestedPrice': 299, 'suggestedDuration': 30, 'defaultMessage': '祝你们新婚快乐，百年好合！'},
        {'id': 3, 'name': '企业开业', 'category': 'business', 'icon': 'business', 'suggestedPrice': 699, 'suggestedDuration': 30, 'defaultMessage': '祝贵公司开业大吉，生意兴隆！'},
        {'id': 4, 'name': '毕业祝福', 'category': 'graduation', 'icon': 'school', 'suggestedPrice': 99, 'suggestedDuration': 15, 'defaultMessage': '祝你毕业快乐，前程似锦！'},
      ];

  static List<dynamic> packages() => [
        {'id': 1, 'name': '基础套餐', 'price': 99, 'desc': '15秒基础祝福视频'},
        {'id': 2, 'name': '精品套餐', 'price': 299, 'desc': '30秒精品定制'},
        {'id': 3, 'name': '豪华套餐', 'price': 699, 'desc': '60秒豪华多场景'},
      ];

  static List<dynamic> myPackages() => const [];

  static Map<String, dynamic> conversations() => {
        'list': [
          {'id': 1, 'humanId': 101, 'humanName': '林沐雪', 'localAvatar': 'assets/images/artist_1.jpg', 'lastMessage': '您好，视频已交付，请查收～', 'unread': 1, 'updatedAt': '2026-08-26 12:30'},
        ],
        'isDemo': true,
      };

  static Map<String, dynamic> messages(int conversationId) => {
        'list': [
          {'id': 1, 'from': 'talent', 'content': '您好，我是林沐雪的经纪，请问需要什么风格？', 'createdAt': '2026-08-26 12:20'},
          {'id': 2, 'from': 'me', 'content': '想要温柔一点的生日祝福', 'createdAt': '2026-08-26 12:25'},
          {'id': 3, 'from': 'talent', 'content': '好的，今天下午交付给您～', 'createdAt': '2026-08-26 12:30'},
        ],
        'isDemo': true,
      };

  static Map<String, dynamic> talentReviews(int talentId) => {
        'list': [
          {'id': 1, 'overallRating': 5, 'content': '效果非常逼真，朋友都以为是真人录的！', 'createdAt': '2026-08-24'},
          {'id': 2, 'overallRating': 5, 'content': '交付很快，台词自然，下次还来。', 'createdAt': '2026-08-22'},
          {'id': 3, 'overallRating': 4, 'content': '整体满意，改了一次很耐心。', 'createdAt': '2026-08-20'},
        ],
        'avgRating': 4.8,
        'isDemo': true,
      };

  static Map<String, dynamic> usageReport(int humanId) => {
        'humanId': humanId,
        'humanName': '林沐雪',
        'summary': {'totalUsage': 48, 'videoCount': 42, 'endorsementCount': 3, 'projectCount': 3, 'totalRevenue': 5682.00}, // 元（与 HTTP 边界一致）
        'recentVideos': [
          {'orderNo': 'VD20260824001', 'amount': 99.00, 'status': 'completed', 'createdAt': '2026-08-24 16:42'}
        ],
        'recentEndorsements': [
          {'orderNo': 'ED20260820001', 'brand': '某茶饮', 'amount': 1999.00, 'status': 'completed', 'createdAt': '2026-08-20'}
        ],
        'isDemo': true,
      };

  static Map<String, dynamic> pricingSuggest(int humanId) => {
        'currentPrice': 99, // 元（与 /api/humans/:id/pricing-suggest 边界一致）
        'suggestedMin': 99, 'suggestedMax': 199, 'medianPrice': 129, 'avgPrice': 149,
        'orderCount': 32, 'reason': '新艺人建议99元起步积累评价',
        'tips': ['99元基础档适合积累首批评价', '好评率>95%可逐步提价'],
        'isDemo': true,
      };

  static List<dynamic> showreels(int humanId) => const [];
  // ───────────────────── AI 文生图/视频 演示任务 ─────────────────────
  static final Map<String, Map<String, dynamic>> _aiTasks = {};
  static int get _aiSeq => DateTime.now().millisecondsSinceEpoch;

  static Map<String, dynamic> _newTask(String type, String prompt) {
    final id = 'demo-ai-$_aiSeq';
    final t = <String, dynamic>{
      'id': id,
      'taskId': id,
      'taskType': type, // image | video
      'prompt': prompt,
      'status': 'pending',
      'progress': 0,
      'stage': 'queued',
      'resultUrl': null,
      'localResult': type == 'image'
          ? 'assets/images/scene_birthday.jpg'
          : null,
      'createdAt': DateTime.now().toIso8601String(),
      '_polls': 0,
    };
    _aiTasks[id] = t;
    return ok({'task': Map<String, dynamic>.from(t)});
  }

  static Map<String, dynamic> aiImageTask(String prompt) => _newTask('image', prompt);
  static Map<String, dynamic> aiVideoTask(String prompt) => _newTask('video', prompt);

  /// 演示轮询：每次推进一个阶段，图片 3 次、视频 5 次后完成。
  static Map<String, dynamic> aiTaskPolling(String taskId) {
    final t = _aiTasks[taskId];
    if (t == null) {
      // 冷启动后内存丢失：直接给一个已完成结果，避免本地作品卡 loading
      return ok({'task': {
        'id': taskId, 'taskId': taskId, 'status': 'succeeded', 'progress': 100,
        'stage': 'done', 'resultUrl': null, 'localResult': 'assets/images/scene_birthday.jpg',
      }});
    }
    final isVideo = t['taskType'] == 'video';
    final need = isVideo ? 5 : 3;
    final polls = (t['_polls'] as int) + 1;
    t['_polls'] = polls;
    if (polls >= need) {
      t['status'] = 'succeeded';
      t['progress'] = 100;
      t['stage'] = 'done';
      t['localResult'] ??= 'assets/images/scene_birthday.jpg';
    } else {
      t['status'] = polls == 1 ? 'pending' : 'running';
      t['progress'] = (polls / need * 100).round();
      t['stage'] = isVideo
          ? const ['queued', 'script', 'shots', 'render', 'compose'][polls.clamp(0, 4).toInt()]
          : const ['queued', 'composing', 'refining', 'done'][polls.clamp(0, 3).toInt()];
    }
    return ok({'task': Map<String, dynamic>.from(t)});
  }
}
