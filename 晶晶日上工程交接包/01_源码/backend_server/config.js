// config.js - 晶晶日上后端配置（V2 安全合规版）
// 所有金额单位：分（整数）
require('dotenv').config();

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  port: parseInt(process.env.PORT || '3000', 10),

  // JWT：生产环境必须通过环境变量注入，无默认值
  jwt: {
    secret: process.env.JWT_SECRET || (env === 'production'
      ? (() => { throw new Error('生产环境必须设置 JWT_SECRET 环境变量'); })()
      : 'dev_only_secret_change_me_in_production_32chars'),
    accessExpiresIn: '2h',
    refreshExpiresIn: '30d',
    issuer: 'jingjingshangri',
  },

  // 数据库
  db: {
    client: process.env.DB_CLIENT || 'sqlite',
    mysql: {
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'jingjingshangri',
      connectionLimit: 10,
    },
    sqlitePath: process.env.SQLITE_PATH || './jingjingshangri.db',
  },

  // Redis（生产环境用于分布式锁、限流、缓存）
  redis: { url: process.env.REDIS_URL || '' },

  // 微信支付（电商收付通 - 分账模式，资金不过平台账户）
  wxPay: {
    appId: process.env.WX_APPID || '',
    mchId: process.env.WX_MCHID || '',
    serialNo: process.env.WX_SERIAL_NO || '',
    privateKeyPath: process.env.WX_PRIVATE_KEY_PATH || './certs/apiclient_key.pem',
    apiV3Key: process.env.WX_API_V3_KEY || '',
    notifyUrl: process.env.WX_NOTIFY_URL || 'https://www.jingjingrishang.com/api/payment/wx/notify',
    ecommerce: { enabled: process.env.WX_ECOMMERCE_ENABLED === 'true' },
  },

  // 支付宝（直付通 - 分账模式）
  alipay: {
    appId: process.env.ALIPAY_APPID || '',
    privateKeyPath: process.env.ALIPAY_PRIVATE_KEY_PATH || './certs/alipay_private.pem',
    publicKeyPath: process.env.ALIPAY_PUBLIC_KEY_PATH || './certs/alipay_public.pem',
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || 'https://www.jingjingrishang.com/api/pay/alipay/notify',
    directPay: { enabled: process.env.ALIPAY_DIRECT_ENABLED === 'true' },
  },

  // 平台费率（小数）
  // 祝福视频99元档：平台0%服务费（引流品），AI成本15元由艺人承担
  // 299元以上档：平台10%服务费，AI成本由艺人承担
  // 品牌代言：平台15%服务费，AI成本500元由艺人承担
  // 定制剧：平台5%服务费
  commission: {
    platform: 0.10,          // 默认10%
    videoBasic: 0.0,         // 99元基础档0%（引流品）
    videoStandard: 0.10,     // 299元以上10%
    endorsement: 0.15,       // 品牌代言15%
    customization: 0.05,     // 定制剧5%
    mcn: 0.03,               // MCN管理费3%
    withdrawal: 0.006,       // 提现/支付通道费0.6%
  },

  // AI 制作成本（单位：分）——由艺人承担，从艺人收入中扣除
  aiCost: {
    video: 1500,             // 祝福视频AI成本15元/条
    endorsement: 50000,      // 品牌代言AI成本500元/单
    passToTalent: true,      // AI成本转嫁给艺人
  },

  // 祝福视频：艺人自主定价（99元起，上不封顶，支持高客单）
  videoPricing: {
    minPrice: 9900,        // 最低价99元（分）
    maxPrice: 0,           // 0=不设硬上限，艺人可自主定6999/19999等高客单价（V10.1放开）
    manualReviewAmount: 1000000, // 单笔≥1万元转平台人工审核（防天价/洗钱/未成年人误购）
    defaultPrice: 9900,    // 默认99元
    // 多档位预设（仅为快捷选项，艺人可在此之上自定义任意价格）
    tiers: [
      { name: '基础祝福', price: 9900, desc: '15秒以内，标准祝福语' },
      { name: '定制祝福', price: 29900, desc: '30秒以内，自定义内容' },
      { name: '商务祝福', price: 69900, desc: '60秒以内，开业/庆典/品牌口播' },
      { name: '深度定制', price: 199900, desc: '90秒以内，剧情化定制' },
      { name: '高端定制', price: 699900, desc: '艺人可自定义，复杂剧情/名人背书，一单一议' },
    ],
  },

  // 平台内私信（IM）
  messaging: {
    requirePurchase: true,    // 必须有订单关系才能发起私信（用于订单沟通/售后）
    sensitiveFilter: true,    // 消息敏感词过滤
    riskTip: '为保障您的权益，请通过平台下单完成交易。',
    // V4.0 异常行为监测
    abnormalMonitor: {
      enabled: true,
      contactExchangeThreshold: 3,   // 单会话内联系方式类敏感词出现≥3次触发预警
      dailyContactAlertPerUser: 5,   // 单用户日触发≥5次标记高风险
      highRiskTalentComplaintRate: 0.05, // 艺人投诉率>5%触发限流
      highRiskTalentRefundRate: 0.15,    // 艺人退款率>15%触发审核
      autoActions: {
        warning: true,    // 发送风险提示
        restrictIM: false, // 高风险艺人自动限制私信（需人工确认后开启）
        freezeWithdraw: false, // 高风险艺人冻结提现（需人工确认）
      },
    },
  },

  // V4.0 艺人保证金制度（依据最高法2026.8典型案例：平台需动态管理保证金）
  deposit: {
    enabled: true,
    baseAmount: 50000,        // 基础保证金500元（分）
    // 动态调增规则：根据近30天成交额和投诉率
    tiers: [
      { monthlyRevenue: 0,       amount: 50000 },    // 0-1000元：500元
      { monthlyRevenue: 100000,  amount: 100000 },   // 1000-5000元：1000元
      { monthlyRevenue: 500000,  amount: 300000 },   // 5000-20000元：3000元
      { monthlyRevenue: 2000000, amount: 500000 },   // 20000元以上：5000元
    ],
    complaintRateSurcharge: 200000,  // 投诉率>5%追加2000元保证金
    refundPeriodDays: 30,            // 退出平台后30天无纠纷可退保证金
  },

  // V4.0 人脸/生物数据安全存储（PIPL+人脸识别管理办法）
  biometricData: {
    enabled: true,
    storageMode: 'oss_private',      // OSS私有Bucket，不公开访问
    encryptAtRest: true,             // 服务端加密AES-256
    encryptInTransit: true,          // HTTPS传输
    storeRawPhoto: false,            // 不存储原始照片，只存特征向量
    featureVectorAlgo: 'facenet',    // 特征向量提取算法
    cdnAuthExpire: 3600,             // CDN签名URL有效期1小时
    retentionDaysAfterRevoke: 180,   // 撤回授权后180天删除
    requireLiveness: true,           // 创建数字人必须活体检测
    requireSeparateConsent: true,    // 人脸数据需单独同意（不能捆绑）
    dataSecurityOfficer: process.env.DSO_EMAIL || 'dpo@jingjingrishang.com',
    piaReportRequired: true,         // 上线前必须完成个人信息保护影响评估
  },

  // V4.0 消费者权益保护
  consumer: {
    // 数字商品退货：定制数字商品不适用7天无理由退货，但需用户购买时确认
    digitalGoodsNoReturn: true,
    requireExplicitConsent: true,    // 必须在订单页勾选确认（不能默认勾选）
    consentText: '本商品为根据您的要求定制的数字内容，属于《消费者权益保护法》第25条规定的定作商品，不适用七日无理由退货。',
    // 质量保障
    qualityRevisionDays: 3,          // 质量问题3日内免费修改
    qualityRefundGuarantee: true,    // 修改后仍不达标可退款
    // 平台规则公示（116号令，2026.2.1施行）
    platformRulesPublished: true,
    rulesAmendmentNoticeDays: 7,     // 规则修改提前7天公示
  },

  // V4.0 版权归属（V5.0修订：版权归艺人所有，平台获非独家授权）
  copyright: {
    // V5.0: 祝福/代言视频版权归艺人所有，平台获得非独家商业使用权
    videoCopyright: 'talent_owned',
    // talent_owned: 艺人所有，平台获非独家授权（V5.0）
    // platform_talent_shared: 平台与艺人共有（V4.0，已废弃）
    // platform_only: 平台所有（需在协议中明确约定）
    platformLicenseScope: 'non-exclusive, term-limited, sublicensable-to-affiliates',
    platformLicenseTermMonths: 36,  // V5.0: 平台授权期限3年（可续期）
    // 定制剧版权
    filmCopyright: 'platform',       // 定制剧成片版权归平台
    filmParticipantRights: 'credit + personal non-commercial use',
    // V10.1 去投资化：禁止任何形式的票房/收益分成，席位只对应内容交付物。
    // 该开关永久关闭，不得重新开启——否则可能被认定为变相集资或承诺货币回报（合规红线）。
    filmBoxOfficeShare: { enabled: false, minTierAmount: 5000000, shareRate: 0 },
    // 样片版权
    sampleCopyright: 'platform',
    requireCopyrightAgreement: true,
  },

  // V4.0 未成年人保护
  minor: {
    enabled: true,
    ageVerificationRequired: true,   // 注册时年龄验证
    under14RequireGuardian: true,    // 不满14岁需监护人同意
    under18Restrictions: {
      maxSingleOrder: 50000,         // 未成年人单笔消费上限500元
      maxMonthlyOrder: 200000,       // 月累计上限2000元
      imDisabled: true,              // 禁用私信
      contentFilter: true,           // 内容过滤
      customDramaDisabled: true,     // 禁止购买定制剧席位
    },
  },

  // V4.0 算法备案（2-4个月周期，上线前必须启动）
  algorithm: {
    filingRequired: true,
    filingTypes: ['generative_synthesis', 'personalized_recommendation', 'ranking'],
    filingNumber: process.env.ALGO_FILING_NUMBER || '', // 备案通过后填入
    displayFilingNumber: true,       // 在产品显著位置公示备案号
    personalizationOptOut: true,     // 提供"一键关闭个性化推荐"选项
    annualVerification: true,        // 年度核验（拟人化办法要求）
  },

  // V4.0 网络安全等级保护
  securityLevel: {
    targetLevel: 3,                  // 等保三级（涉及资金+人脸数据）
    assessmentDeadlineDays: 90,      // 上线后90天内完成测评
  },

  // 税务：劳务报酬所得代扣代缴（个人所得税法）
  // 三级累进：≤2万 20%，2万-5万 30%（速算扣除2000），>5万 40%（速算扣除7000）
  // 每次收入≤4000元减800元，>4000元减20%
  tax: {
    mode: process.env.TAX_MODE || 'withholding', // withholding: 代扣代缴
    type: 'labor_service', // 劳务报酬所得
    brackets: [
      { maxTaxableIncome: 2000000, rate: 0.20, deduction: 0 },      // ≤2万 20%
      { maxTaxableIncome: 5000000, rate: 0.30, deduction: 200000 }, // 2-5万 30%
      { maxTaxableIncome: Infinity, rate: 0.40, deduction: 700000 }, // >5万 40%
    ],
    deductionPerTime: 80000,  // 每次收入≤4000元减800元（分）
    deductionRate: 0.20,      // 每次收入>4000元减20%
  },

  // 担保交易
  escrow: { autoVerifyDays: 7, maxDeliveryDays: 7, modifyLimit: 2 },

  // 定制剧（V5.0修订：45天认领期+快速成团激励）
  customization: {
    durationDays: 45,               // V5.0: 90天缩短为45天
    successThreshold: 0.80,
    oversubscribePct: 0.10,
    refundDays: 3,
    fastGroupBonusDays: 30,         // V5.0: 30天内成团额外赠送彩蛋席位
    milestones: [
      { name: '剧本审核', ratio: 0.20 },  // V5.0: 平台监制四节点
      { name: '开机', ratio: 0.25 },
      { name: '粗剪审核', ratio: 0.25 },
      { name: '成片交付', ratio: 0.30 },
    ],
    productionDays: 60,
    maxClients: 50,
    initialBatchSize: 5,            // V5.0: 首期只做3-5部验证
  },

  // V5.0 艺人扶持政策
  talentPromotion: {
    aiSubsidyDays: 90,              // 新艺人前3个月AI成本补贴
    aiSubsidyEndorsement: false,    // 品牌代言档不补贴（500元AI成本较高）
    newTalentQuota: 100,            // 前100名免佣金
    newTalentCommissionFreeDays: 90,
    trafficBoostDays: 14,           // 新人流量扶持2周
  },

  // V5.0 评价系统
  review: {
    enabled: true,
    allowedDays: 7,                 // 订单完成后7天内可评价
    requireMinOrder: true,          // 必须有真实订单才能评价
    imagesPerReview: 6,             // 每条评价最多6张图
    talentReplyEnabled: true,       // 艺人可回复
  },

  // V5.0 社交分享与优惠券
  share: {
    enabled: true,
    rewardAmount: 500,              // 邀请1人首单奖励5元（分）
    inviteeRewardAmount: 500,       // 被邀请人首单优惠5元
    couponValidDays: 30,
  },

  // V11 样片/定制剧（普通档5000元：99元意向金 + 4901元制作款；意向金可退可抵）
  sample: {
    basePrice: 500000,              // 普通档总价5000元起（分），上不封顶（好编剧/导演/明星一单一议）
    intentDeposit: 9900,            // 意向金99元（下单时付，用于启动选对标剧/剧本对接；可退、可抵款）
    // V11 意向金规则（用户拍板：99元、可退/可抵款）：成交时计入总价；
    // 用户未继续制作可申请原路退回；平台或艺人原因无法交付必须原路退回。
    intentRefundPolicy: {
      deductOnDeal: true,           // 成交时99元计入5000元总价（再付4901元）
      refundableBeforeFinalScript: true, // 剧本定稿前用户放弃可退（已发生的第三方实费可据实扣除）
      nonRefundableAfterStage: null,     // 不再以“进入选剧”为由锁定不退款
      platformFaultRefundable: true,     // 平台/艺人原因无法交付全额原路退回
      userText: '意向金99元可在成交时抵作制作款；未继续制作可申请原路退回，因平台或艺人原因无法交付的全额退回。',
    },
    productionFee: 490100,          // 制作款4901元（剧本定稿、样片确认后付；99意向金已抵扣）
    extraRevisionFee: 20000,        // 超出2轮修改后200元/轮
    freeRevisions: 2,               // 剧本免费修改2轮
    productionDays: 5,              // AI制作宣发片3-5个工作日
    previewReviewDays: 7,           // 交付后7天内可申请1次免费修改
    freeRedoCount: 1,               // 成片免费修改1次
    genres: ['古装逆袭', '都市甜宠', '悬疑推理', '玄幻修仙', '家庭伦理', '青春校园', '职场商战', '军旅谍战'],
  },

  // V6.0 高端定制档（一剧一议，线下签合同）
  customProduction: {
    enabled: true,
    minBudget: 5000000,             // 最低预算5万元
    maxBudget: 500000000,           // 最高500万元
    formats: ['电影', '中剧', '短剧', '网络大电影'],
    milestones: [
      { name: '剧本审核', ratio: 0.20 },
      { name: '开机', ratio: 0.25 },
      { name: '粗剪审核', ratio: 0.25 },
      { name: '成片交付', ratio: 0.30 },
    ],
  },

  // V5.0 99元视频免费重做
  redo: {
    enabled: true,
    freeForBasicTier: true,         // 99元基础档免费重做一次
    applyHours: 48,                 // 交付后48小时内可申请
  },

  // V5.0 B端SaaS服务
  saas: {
    enabled: true,
    tiers: [
      { name: '基础版', price: 5000000, features: ['代言下单9折', '授权书自动生成', '基础数据看板', '专属客服'] },
      { name: '专业版', price: 10000000, features: ['基础版全部', '效果追踪', '多艺人管理', 'API批量下单', '月度数据报告'] },
      { name: '企业版', price: 20000000, features: ['专业版全部', '专属数字人定制', 'SLA保障', '私有化部署', '品牌联合营销'] },
    ],
  },

  // V5.0 内容安全机审（生产环境必须接入）
  // TODO: 生产环境配置 MODERATION_PROVIDER=aliyun/tencent 和 MODERATION_API_KEY
  // 接入步骤：1.开通阿里云内容安全/腾讯云天御 2.获取API Key 3.配置环境变量 4.启用 moderationApi.enabled=true
  contentModeration: {
    enabled: process.env.MODERATION_ENABLED === 'true',
    provider: process.env.MODERATION_PROVIDER || null,  // aliyun | tencent
    apiKey: process.env.MODERATION_API_KEY || '',
    apiSecret: process.env.MODERATION_API_SECRET || '',
    regions: ['cn-shanghai', 'cn-guangzhou'],
    // 机审策略：video视频帧抽检, image图片全量, text文字全量
    policies: { video: 'sample', image: 'all', text: 'all' },
    callbackUrl: process.env.MODERATION_CALLBACK_URL || '',
  },

  // V5.0 Deepfake防护（盲水印+C2PA）
  // TODO: 生产环境接入C2PA盲水印SDK或第三方服务
  deepfakeProtection: {
    enabled: true,
    blindWatermark: {
      enabled: true,
      provider: process.env.WATERMARK_PROVIDER || null,  // C2PA SDK / 第三方
      // 接入步骤：1.集成C2PA SDK 2.视频生成后嵌入内容凭证 3.元数据写入AI生成标识
    },
    scriptPreReview: true,          // 脚本前置审核（文案先审后生成）
    aiMetadataLabel: true,          // 视频元数据写入AI生成标识
  },

  // V5.0 数字人质量分级
  qualityGrade: {
    enabled: true,
    levels: ['S', 'A', 'B', 'C'],
    cGradeHiddenFromSquare: true,   // C级不进入广场推荐
    autoGrade: true,                // AI自动初评
  },

  // V5.0 MCN免管理费
  mcn: {
    freeTrialDays: 90,              // 入驻前3个月免管理费
    managementFeeRate: 0.03,        // 第4个月起3%
  },

  // 风控
  risk: {
    withdraw: {
      minAmount: 1000, dailyLimit: 500000, singleLimit: 500000,
      newAccountCoolHours: 72, firstWithdrawManual: true,
    },
    order: { maxDailyPerUser: 20, maxDailyPerTalent: 50 },
    heatAntiCheat: { sameUserWindowDays: 30 },
  },

  // 内容安全
  content: {
    reviewRequired: true,
    aiWatermark: true,          // 所有AI生成视频强制水印
    aiLabel: 'AI生成',          // AI内容标识文字
    adLabel: true,              // 品牌代言视频强制"广告"标识
    adDisclosure: '本视频为付费商业推广内容',
    bannedCategories: ['医疗', '药品', '保健食品', '金融', '烟草', '彩票'],
    // 数字盲水印（C2PA标准，生产环境接入）
    blindWatermark: { enabled: true, provider: null },
    // 内容安全机审API（生产环境接入阿里云/腾讯云）
    moderationApi: { enabled: false, provider: null },
  },

  // 数字人资产台账
  digitalAsset: {
    registryEnabled: true,      // 记录每个数字人的资产信息
    valuationMethod: 'income',  // 估值方法：income(DCF) / cost / market
    defaultUsefulLife: 5,       // 默认收益年限5年
    discountRate: 0.15,         // 折现率15%
    authorizationRevocable: true, // 授权可撤回
    dataRetentionDays: 180,     // 撤回授权后数据保留180天（合规需要）
  },

  // 反欺诈/反洗钱
  antiFraud: {
    selfPurchaseCheck: true,    // 禁止自买自卖（买家≠艺人所属用户）
    maxDailyOrdersPerUser: 20,  // 单用户日下单上限
    maxDailyOrdersPerTalent: 50,// 单艺人日接单上限
    newAccountCoolHours: 72,    // 新账号72小时冷却
    suspiciousAmount: 1000000,  // 单笔≥1万元触发人工审核
    velocityCheck: true,        // 短时高频下单检测
  },

  // 火山引擎（方舟 LLM/视频 + openspeech 语音）统一配置，密钥只从 .env 读取、不进前端
  volc: {
    arkBaseUrl: process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    arkApiKey: process.env.ARK_API_KEY || '',
    speechKey: process.env.SPEECH_API_KEY || process.env.ARK_API_KEY || '',
    speechBase: 'https://openspeech.bytedance.com',
    llmModel: process.env.ARK_LLM_MODEL || 'doubao-seed-2-1-turbo-260628',
    t2vModel: process.env.ARK_T2V_MODEL || '',
    t2iModel: process.env.ARK_T2I_MODEL || '',
    ttsResource: process.env.ARK_TTS_MODEL || 'seed-tts-2.0',
    cloneResource: process.env.ARK_VOICE_CLONE_MODEL || 'seed-icl-2.0',
    cloneModel: 'seed-icl-2.0-standard',
    defaultSpeaker: process.env.ARK_TTS_SPEAKER || 'zh_female_vv_uranus_bigtts',
    // 视觉异步任务（Seedance 视频）创建后轮询参数
    task: {
      pollIntervalMs: parseInt(process.env.ARK_POLL_INTERVAL_MS || '5000', 10),
      pollTimeoutMs: parseInt(process.env.ARK_POLL_TIMEOUT_MS || '300000', 10),
    },
  },

  // 火山引擎短信 SMS（手机号验证码 / 通知）。AK/SK 走火山 V4 签名，密钥只从 .env 读取、绝不进前端。
  // 控制台路径：短信服务→国内短信→短信签名/短信模板；消息组ID见页面顶部“消息组”。
  sms: {
    enabled: process.env.SMS_ENABLED === 'true', // 签名+模板审核通过并回填后置 true
    accessKeyId: process.env.VOLC_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.VOLC_SECRET_ACCESS_KEY || '',
    region: process.env.SMS_REGION || 'cn-north-1',
    host: process.env.SMS_HOST || 'sms.volcengineapi.com',
    action: 'SendSms',
    version: '2020-01-01',
    smsAccount: process.env.SMS_ACCOUNT || '',              // 消息组ID（当前默认 8d0968fa）
    signName: process.env.SMS_SIGN_NAME || '',             // 已审核通过的“签名内容”
    loginTemplateId: process.env.SMS_LOGIN_TEMPLATE_ID || '', // 验证码模板ID（ST_xxx）
    codeTtlSeconds: 300,          // 验证码 5 分钟有效
    resendIntervalMs: 60000,      // 同一手机号 60s 内不得重发
    dailyMaxPerPhone: 10,         // 同一手机号每天最多 10 条
    verifyMaxFail: 5,             // 同一验证码连续输错 5 次作废
    lockMinutes: 30,              // 触发风控后锁定 30 分钟
    // 开发/演示兜底固定测试码：仅当显式配置且非 production 时可用；生产环境强制忽略
    devBackdoorCode: process.env.SMS_DEV_CODE || '',
  },

  // 阿里云：实人认证（身份证要素核验 + 人脸活体核身）与内容安全2.0，统一走一套 RAM AK/SK。
  // 缺任一凭证/场景ID时相关能力安全降级（实名回退现状并标注、活体生产环境拒绝签署、机审回退本地词库+人工），绝不假装已接通。
  // RAM 子账号建议仅授予 AliyunCloudauthFullAccess + AliyunYundunGreenFullAccess（最小可用），密钥只从 .env 读、不进前端。
  aliyun: {
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || process.env.MODERATION_API_KEY || '',
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || process.env.MODERATION_API_SECRET || '',
    region: process.env.ALIYUN_REGION || 'cn-shanghai',
    // 实人认证 cloudauth20200618
    cloudauth: {
      endpoint: process.env.CLOUDAUTH_ENDPOINT || 'cloudauth.aliyuncs.com',
      regionId: process.env.CLOUDAUTH_REGION || 'cn-shanghai',
      // 控制台「实人认证 → 认证方案」创建后获得的数值型场景 ID（要素核验 / 人脸核身各一个）
      elementSceneId: process.env.CLOUDAUTH_ELEMENT_SCENE_ID ? Number(process.env.CLOUDAUTH_ELEMENT_SCENE_ID) : null,
      faceSceneId: process.env.CLOUDAUTH_FACE_SCENE_ID ? Number(process.env.CLOUDAUTH_FACE_SCENE_ID) : null,
      // 人脸核身通过阈值：DescribeSmartVerify.passedScore ≥ 该值才判定为本人
      facePassScore: Number(process.env.CLOUDAUTH_FACE_PASS_SCORE || '80'),
    },
    // 内容安全2.0 green20220302（service 场景名以控制台已开通为准，可用 .env 覆盖）
    green: {
      endpoint: process.env.GREEN_ENDPOINT || 'green-cip.cn-shanghai.aliyuncs.com',
      regionId: process.env.GREEN_REGION || 'cn-shanghai',
      textService: process.env.GREEN_TEXT_SERVICE || 'comment_detection',
      imageService: process.env.GREEN_IMAGE_SERVICE || 'baselineCheck',
      videoService: process.env.GREEN_VIDEO_SERVICE || 'videoDetection',
    },
  },

  // V12.6 合规三件套（实名二要素 / 人脸活体核身 / 文图视频机审）供应商总开关。
  // 默认走火山引擎（volc）；COMPLIANCE_PROVIDER=aliyun 可一键切回阿里云 V12.5 备用实现（实现完整保留，不删除）。
  // 各 provider 缺凭证 / 缺业务参数时各自 ready=false 安全降级：不抛崩、不误判通过、不伪造。
  compliance: {
    provider: process.env.COMPLIANCE_PROVIDER === 'aliyun' ? 'aliyun' : 'volc',
  },

  // V12.6 火山引擎合规套件（IAM 专用子用户 jjsr-compliance，仅授 CVFullAccess + BusinessSecurityFullAccess）。
  // 凭证环境变量名固定为 VOLC_COMPLIANCE_ACCESS_KEY_ID / VOLC_COMPLIANCE_SECRET_ACCESS_KEY（SK 为 60 位 base64 新格式，勿截断）。
  // 人脸核身走视觉智能 visual（cv，已可真实联调）；实名二要素/内容机审走业务安全 rms（人工审批中，缺 AppID/bizType 即 ready=false）。
  volcCompliance: {
    // 总启用开关：默认 true，但“启用”不等于“就绪”——缺 AK/SK 或业务参数时各能力 ready 仍为 false。
    enabled: process.env.VOLC_COMPLIANCE_ENABLED !== 'false',
    accessKeyId: process.env.VOLC_COMPLIANCE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.VOLC_COMPLIANCE_SECRET_ACCESS_KEY || '',
    region: process.env.VOLC_COMPLIANCE_REGION || 'cn-north-1',
    // 视觉智能 · 人脸核身（有源比对 CertSrcFaceComp，Service=cv，Version=2022-08-31）
    visual: {
      host: process.env.VOLC_VISUAL_HOST || 'visual.volcengineapi.com',
      // protocol 仅在本地 mock 自测时经 config 覆盖为 http:；线上固定 https:
      protocol: process.env.VOLC_VISUAL_PROTOCOL || 'https:',
      service: 'cv',
      version: '2022-08-31',
      action: 'CertSrcFaceComp',
      reqKey: 'cert_src_face_comp',
      // 人脸相似度通过线：source_comp_details.score ≥ 1e-4（官方阈值口径，可用 env 覆盖）
      facePassScore: Number(process.env.VOLC_FACE_PASS_SCORE || '0.0001'),
      // 核身结论本地缓存 TTL（毫秒），对齐阿里云 certifyId 5 分钟一次性有效
      verdictTtlMs: parseInt(process.env.VOLC_FACE_VERDICT_TTL_MS || '300000', 10),
    },
    // 业务安全 rms（身份要素验证 + 文本/图片/视频内容风险识别）——人工审批中（1-2 工作日）。
    // 字段以官方文档调研结论为准，审批通过前全部空占位、相关能力 ready 恒 false，禁止臆造 host/bizType。
    rms: {
      // host 待官方文档调研结论补实（不臆造默认域名）
      host: process.env.VOLC_RMS_HOST || '',
      protocol: process.env.VOLC_RMS_PROTOCOL || 'https:',
      service: 'BusinessSecurity', // 待调研核对，占位不参与 ready 判定
      version: process.env.VOLC_RMS_VERSION || '',
      appId: process.env.VOLC_RMS_APP_ID || '',                  // rms 应用 AppID（审批后下发，空占位）
      idVerifyBizType: process.env.VOLC_RMS_ID_VERIFY_BIZ_TYPE || '', // 实名二要素业务场景 bizType
      textBizType: process.env.VOLC_RMS_TEXT_BIZ_TYPE || '',    // 文本机审 bizType
      imageBizType: process.env.VOLC_RMS_IMAGE_BIZ_TYPE || '',  // 图片机审 bizType
      videoBizType: process.env.VOLC_RMS_VIDEO_BIZ_TYPE || '',  // 视频机审 bizType
    },
  },

  // AI 上游调用治理：并发额度、每日成本熔断、失败重试、余额告警预留。单位：分。
  aiQuota: {
    // 各能力同时在途的上游任务上限（1GiB 小内存服务器，视频/复刻重任务从严）
    concurrency: {
      llm: parseInt(process.env.AI_CONC_LLM || '6', 10),
      tts: parseInt(process.env.AI_CONC_TTS || '6', 10),
      clone: parseInt(process.env.AI_CONC_CLONE || '2', 10),
      t2i: parseInt(process.env.AI_CONC_T2I || '2', 10),
      video: parseInt(process.env.AI_CONC_VIDEO || '2', 10),
      sms: parseInt(process.env.AI_CONC_SMS || '4', 10),
    },
    dailyCostCapFen: parseInt(process.env.AI_DAILY_COST_CAP_FEN || '20000', 10), // 默认 200 元/日熔断
    lowBalanceAlertFen: parseInt(process.env.AI_LOW_BALANCE_ALERT_FEN || '5000', 10), // 预留：上游余额低于该值告警
    retry: { max: parseInt(process.env.AI_RETRY_MAX || '2', 10), baseDelayMs: 600 },
    // 单次估算单价（分），仅用于成本统计与熔断；以火山账单实际口径为准回填（见 08 档案 D-火山）
    unitCostFen: {
      llmPer1kIn: 1, llmPer1kOut: 3,
      ttsPerChar: 0.03,        // 语音合成约 3 元/万字符
      cloneTrain: 13800,       // 后付费声音复刻 138 元/音色（首次正式合成时扣）
      t2iPerImage: 30,         // Seedream 一张估算（按实际 token 账单校准）
      videoPerSecond480p: 20,  // Seedance 480p 每秒估算
      smsPerMessage: 5,        // 验证码短信约 0.045 元/条，估算 5 分
    },
  },

  // AI 交付物版本化与审核（工程化整改）。默认 reviewEnabled=false：成片即可交付（=现状，不改变线上行为）；
  // 置 AI_DELIVERABLE_REVIEW=true 后：新成片先 pending_review，经本地敏感词预审 + 人工/云机审通过才成为可交付物。
  aiDeliverable: {
    reviewEnabled: process.env.AI_DELIVERABLE_REVIEW === 'true',
    localPrescreen: true,
    // 供应商回调验签密钥（HMAC-SHA256）；未配置时回退用 ARK_API_KEY，二者皆无则拒绝回调
    webhookSecret: process.env.ARK_WEBHOOK_SECRET || process.env.ARK_API_KEY || '',
  },

  // 告警外发（没配 ALERT_WEBHOOK_URL 时只写结构化日志，不外发）
  alert: { webhookUrl: process.env.ALERT_WEBHOOK_URL || '' },

    // 上传（经 services/storage 适配层：默认本地磁盘；OSS_ENABLED=true 且凭证齐全才走 OSS，缺凭证自动降级本地）
  upload: {
    dir: './uploads',
    urlPrefix: process.env.UPLOAD_URL_PREFIX || '/uploads', // 转存相对前缀，与 /uploads 静态挂载对齐；OSS化后改CDN域名
    maxSize: 50 * 1024 * 1024,
    allowedMime: ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf'],
    oss: {
      enabled: process.env.OSS_ENABLED === 'true',
      // 仅从 .env 读取，不写默认值/不硬编码：OSS_REGION/OSS_BUCKET/OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET/OSS_ENDPOINT/OSS_CDN_BASE
    },
  },

  // CORS 白名单
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
      : (env === 'production' ? [] : ['http://localhost:3000', 'http://localhost:8080']),
  },
  // 联系方式解锁：购买后申请、艺人同意后展示（合规提示文案）
  contact: {
    disclaimer: '联系方式仅用于已达成订单的正当沟通与售后服务。平台禁止站外私下交易、引导脱离平台支付或任何违规导流行为；因站外联系产生的交易风险与损失，平台不承担责任。',
  },
};

module.exports = config;
