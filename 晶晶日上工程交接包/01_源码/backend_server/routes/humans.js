// routes/humans.js - 数字人/艺人接口（V3.1：LBS同城+自定价+平台内私信）
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { optionalAuth } = require('../middleware/auth');
const config = require('../config');
const multer = require('multer');
const storage = require('../services/storage');
const router = express.Router();

// 照片上传：内存接收；私密存储与权限未接入前明确拒绝，不退回公开目录
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片文件'));
  },
});

// 检查用户是否购买过某艺人视频（有订单关系才可发起私信）
function hasPurchased(userId, humanId) {
  if (!userId) return false;
  const order = db.prepare(
    "SELECT id FROM video_orders WHERE talent_id = ? AND user_id = ? AND status IN ('completed','delivered','delivering','paid') LIMIT 1"
  ).get(humanId, userId);
  return !!order;
}

// Haversine距离（公里），应用层计算（SQLite不支持radians/acos等函数）
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 艺人列表（支持地区、分类、榜单、附近筛选）
router.get('/', optionalAuth, (req, res) => {
  const { province, city, district, tag, rank, keyword, lat, lng, radius = 50, page = 1, pageSize = 20, mine } = req.query;

  // mine=1：「我的数字人」——登录后返回本人创建的全部状态（含 pending 审核中/rejected），金额对外为元
  if (mine === '1' || mine === 'true') {
    if (!req.userId) return res.status(401).json({ message: '请先登录' });
    const mineList = db.prepare('SELECT * FROM humans WHERE user_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(req.userId);
    const scopeStmt = db.prepare("SELECT scope FROM authorization_agreements WHERE human_id = ? AND status = 'active'");
    return res.json({
      list: mineList.map(h => {
        const scopes = scopeStmt.all(h.id).map(r => r.scope);
        return {
          id: h.id, name: h.name, avatar: h.avatar,
          tags: h.tags ? h.tags.split(',') : [],
          style: h.style, specialty: h.specialty,
          status: h.status,
          heat: h.heat, sales: h.sales,
          service_fee: h.service_fee / 100,
          price: h.price / 100,
          scopeVideo: scopes.includes('video'),
          scopeEndorsement: scopes.includes('endorsement'),
          scopeFilm: scopes.includes('film'),
          province: h.province, city: h.city, district: h.district,
          level: h.level, createdAt: h.created_at, subsidyUntil: h.subsidy_until,
        };
      }),
      page: 1, pageSize: mineList.length,
    });
  }

  let sql = "SELECT * FROM humans WHERE status = 'active'";
  const params = [];

  if (province) { sql += ' AND province = ?'; params.push(province); }
  if (city) { sql += ' AND city = ?'; params.push(city); }
  if (district) { sql += ' AND district = ?'; params.push(district); }
  if (tag && tag !== '推荐') { sql += ' AND tags LIKE ?'; params.push('%' + tag + '%'); }
  if (keyword) { sql += ' AND (name LIKE ? OR specialty LIKE ?)'; params.push('%' + keyword + '%', '%' + keyword + '%'); }

  // 附近查询：先取有经纬度的，在应用层过滤距离（SQLite不支持数学函数）
  const needGeo = lat && lng;
  let latVal, lngVal, radiusVal;
  if (needGeo) {
    latVal = parseFloat(lat); lngVal = parseFloat(lng); radiusVal = parseFloat(radius);
    if (!isNaN(latVal) && !isNaN(lngVal)) {
      sql += ' AND lat IS NOT NULL AND lng IS NOT NULL';
    }
  }

  if (rank === 'new') {
    sql += ' ORDER BY created_at DESC';
  } else if (rank === 'sales') {
    sql += ' ORDER BY sales DESC';
  } else if (rank === 'price_asc') {
    sql += ' ORDER BY price ASC';
  } else {
    sql += ' ORDER BY heat DESC';
  }
  // 附近查询时多取一些用于距离过滤
  sql += ' LIMIT ? OFFSET ?';
  const limit = Math.min(Number(pageSize), 50);
  const fetchLimit = needGeo ? 200 : limit;
  params.push(fetchLimit, (Number(page) - 1) * (needGeo ? 200 : limit));

  let list = db.prepare(sql).all(...params);

  // 应用层距离过滤和排序
  if (needGeo && !isNaN(latVal)) {
    list = list.filter(h => haversineKm(latVal, lngVal, h.lat, h.lng) <= radiusVal);
    list = list.slice(0, limit);
  }

  res.json({
    list: list.map(h => ({
      id: h.id, name: h.name, avatar: h.avatar,
      tags: h.tags ? h.tags.split(',') : [],
      style: h.style, specialty: h.specialty,
      heat: h.heat, sales: h.sales,
      service_fee: h.service_fee / 100,
      province: h.province, city: h.city, district: h.district,
      price: h.price / 100,
      minPrice: config.videoPricing.minPrice / 100,
      level: h.level, films: h.films, schedule: h.schedule,
      canMessage: hasPurchased(req.userId, h.id),
      purchased: hasPurchased(req.userId, h.id),
    })),
    page: Number(page), pageSize: limit,
  });
});

// V5.0 创建数字人（试镜通过后调用，自动设置90天AI成本补贴）
// V10: 支持照片文件上传（multipart/form-data）
router.post('/', auth, upload.single('photo'), async (req, res) => {
  const { name, tags, style, specialty, province, city, district, price, scopeVideo, scopeEndorsement, scopeFilm } = req.body;
  if (!name) return res.status(400).json({ message: '请填写数字人名称' });

  // 头像：文件保存失败必须在创建记录之前返回；旧URL入口另在业务权限任务处理
  let avatar = req.body.avatar || null;
  if (req.file) {
    const ext = (req.file.originalname.match(/\.(\w+)$/) || [, 'jpg'])[1].toLowerCase();
    const key = `avatars/human_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    try {
      const saved = await storage.put({ key, body: req.file.buffer, contentType: req.file.mimetype });
      avatar = saved.url;
    } catch {
      require('../utils/logger').warn('legacy_private_upload_blocked', { error_code:'PRIVATE_STORAGE_UNAVAILABLE' });
      return res.status(503).json({ code:'PRIVATE_STORAGE_UNAVAILABLE', message:'照片存储尚不可用，本次未创建数字人，请稍后重试。' });
    }
  }

  const priceFen = price ? Math.round(Number(price) * 100) : config.videoPricing.minPrice;
  const subsidyDays = config.talentPromotion?.aiSubsidyDays || 90;
  const subsidyUntil = new Date(Date.now() + subsidyDays * 86400000).toISOString();

  const result = db.prepare(`INSERT INTO humans
    (user_id, name, avatar, tags, style, specialty, province, city, district, price, status, subsidy_until, is_new_talent, quality_grade, verified_level)
    VALUES (?,?,?,?,?,?,?,?,?, ?, 'pending', ?, 1, 'B', 'none')`).run( // 10个? + 'pending' + ? + 1/'B'/'none' = 15值，严格对齐15列
    req.userId, name, avatar, tags || null, style || null, specialty || null,
    province || null, city || null, district || null, priceFen, subsidyUntil
  );

  // 自动创建保证金记录（first_income模式）
  const { getOrCreateDeposit } = require('../utils/deposit');
  getOrCreateDeposit(req.userId, result.lastInsertRowid);

  // 记录授权范围
  const scopes = [];
  if (scopeVideo === '1' || scopeVideo === 1 || scopeVideo === true) scopes.push('video');
  if (scopeEndorsement === '1' || scopeEndorsement === 1 || scopeEndorsement === true) scopes.push('endorsement');
  if (scopeFilm === '1' || scopeFilm === 1 || scopeFilm === true) scopes.push('film');
  if (scopes.length === 0) scopes.push('video'); // 默认至少祝福视频
  const insertAuth = db.prepare("INSERT INTO authorization_agreements (human_id, user_id, scope, status, signed_at) VALUES (?, ?, ?, 'active', datetime('now'))");
  scopes.forEach(scope => insertAuth.run(result.lastInsertRowid, req.userId, scope));

  res.json({
    id: result.lastInsertRowid,
    avatar,
    message: '数字人创建成功，等待平台审核',
    subsidyUntil,
    subsidyDays,
    subsidyNote: `新艺人前${subsidyDays}天由平台补贴AI制作成本；99元基础档平台0服务费，实际到手以结算单为准（支付通道费、个人所得税预扣预缴另行计算，年度个税汇算多退少补）。`,
  });
});

// 地区聚合统计（用于筛选器）——必须在/:id之前定义，否则会被拦截
router.get('/meta/regions', (req, res) => {
  const provinces = db.prepare("SELECT province, COUNT(*) as count FROM humans WHERE status='active' AND province IS NOT NULL GROUP BY province ORDER BY count DESC").all();
  res.json({ provinces });
});

// 艺人详情
router.get('/:id', optionalAuth, (req, res) => {
  const h = db.prepare('SELECT * FROM humans WHERE id = ?').get(req.params.id);
  if (!h) return res.status(404).json({ message: '艺人不存在' });

  const purchased = hasPurchased(req.userId, h.id);

  // 授权范围
  const auths = db.prepare("SELECT scope, status FROM authorization_agreements WHERE human_id = ? AND status = 'active'")
    .all(h.id);

  // 该艺人的视频模板（多档位）
  const templates = db.prepare("SELECT id, title, category, duration, price, sold, description FROM video_templates WHERE talent_id = ? AND status = 'active' ORDER BY price ASC")
    .all(h.id).map(t => ({ ...t, price: t.price / 100 }));

  // V5.0 评价统计
  const reviewStats = db.prepare(`SELECT
    COUNT(*) as count,
    COALESCE(AVG(overall_rating), 5.0) as avgRating,
    COALESCE(SUM(CASE WHEN overall_rating >= 4 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 100) as goodRate
    FROM order_reviews WHERE talent_id = ? AND status = 'active'`).get(h.id);

  // V5.0 样片
  const showreels = h.showreel_urls ? JSON.parse(h.showreel_urls) : [];

  res.json({
    id: h.id, name: h.name, avatar: h.avatar,
    tags: h.tags ? h.tags.split(',') : [],
    style: h.style, specialty: h.specialty,
    heat: h.heat, sales: h.sales, service_fee: h.service_fee / 100,
    province: h.province, city: h.city, district: h.district,
    price: h.price / 100,
    minPrice: config.videoPricing.minPrice / 100,
    level: h.level, films: h.films, schedule: h.schedule,
    canMessage: purchased,
    purchased,
    scopes: auths.map(a => a.scope),
    templates,
    // V5.0 新增字段
    qualityGrade: h.quality_grade || 'B',
    verifiedLevel: h.verified_level || 'none',
    avgRating: Math.round((reviewStats.avgRating || 5) * 10) / 10,
    reviewCount: reviewStats.count,
    goodRate: Math.round(reviewStats.goodRate || 100),
    showreels: showreels.map(s => s.url || s),
    subsidyUntil: h.subsidy_until,
  });
});

// 艺人自主定价（最低99元，最高5000元）
router.put('/:id/pricing', auth, (req, res) => {
  const human = db.prepare('SELECT * FROM humans WHERE id = ?').get(req.params.id);
  if (!human) return res.status(404).json({ message: '艺人不存在' });
  if (human.user_id !== req.userId) return res.status(403).json({ message: '无权操作' });

  const { price } = req.body;
  const priceFen = Math.round(Number(price) * 100);
  if (isNaN(priceFen)) return res.status(400).json({ message: '价格格式错误' });
  if (priceFen < config.videoPricing.minPrice) {
    return res.status(400).json({ message: `最低定价${config.videoPricing.minPrice / 100}元` });
  }
  // V10.1 放开高客单：maxPrice=0 表示不设硬上限，艺人可自主定6999/19999等高价
  if (config.videoPricing.maxPrice && priceFen > config.videoPricing.maxPrice) {
    return res.status(400).json({ message: `定价超出上限${config.videoPricing.maxPrice / 100}元` });
  }
  const needManualReview = config.videoPricing.manualReviewAmount
    && priceFen >= config.videoPricing.manualReviewAmount;

  db.prepare('UPDATE humans SET price = ? WHERE id = ?').run(priceFen, human.id);
  res.json({
    message: '定价已更新',
    price: priceFen / 100,
    manualReviewRequired: !!needManualReview,
    reviewTip: needManualReview ? '单笔≥1万元的高客单套餐将由平台人工复核后正式展示' : undefined,
  });
});

// V5.0 艺人定价指导
router.get('/:id/pricing-suggest', (req, res) => {
  const human = db.prepare('SELECT * FROM humans WHERE id = ?').get(req.params.id);
  if (!human) return res.status(404).json({ message: '艺人不存在' });

  // 同类标签艺人的价格统计
  const tag = human.tags ? human.tags.split(',')[0] : null;
  let similar = [];
  if (tag) {
    similar = db.prepare("SELECT price FROM humans WHERE tags LIKE ? AND status = 'active' AND id != ?")
      .all('%' + tag + '%', human.id);
  }
  if (similar.length === 0) {
    similar = db.prepare("SELECT price FROM humans WHERE status = 'active' AND id != ? LIMIT 100").all(human.id);
  }

  const prices = similar.map(h => h.price).sort((a, b) => a - b);
  const median = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 9900;
  const avg = prices.length > 0 ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 9900;

  // 新艺人（订单<10）建议99元起步
  const orderCount = db.prepare("SELECT COUNT(*) as c FROM video_orders WHERE talent_id = ? AND status = 'completed'").get(human.id).c;
  let suggestedMin, suggestedMax, reason;
  if (orderCount < 10) {
    suggestedMin = 9900; suggestedMax = 19900;
    reason = '新艺人建议99元起步积累评价，10单后可上调至199-299元';
  } else if (orderCount < 50) {
    suggestedMin = 19900; suggestedMax = 39900;
    reason = '有一定订单基础，建议199-399元，参考同类艺人定价';
  } else {
    suggestedMin = Math.max(29900, Math.round(median * 0.8));
    suggestedMax = Math.round(avg * 1.2);
    reason = '成熟艺人，参考同类艺人和自身评价定价';
  }

  res.json({
    currentPrice: human.price / 100,
    suggestedMin: suggestedMin / 100,
    suggestedMax: suggestedMax / 100,
    medianPrice: median / 100,
    avgPrice: avg / 100,
    similarCount: prices.length,
    orderCount,
    reason,
    tips: [
      '99元基础档适合新艺人积累首批评价',
      '好评率>95%可逐步提价',
      '品牌代言建议5000元起',
      '节日期间（春节/中秋）可适当上调价格',
    ],
  });
});

// V5.0 数字人使用报告
router.get('/:id/usage-report', auth, (req, res) => {
  const human = db.prepare('SELECT * FROM humans WHERE id = ?').get(req.params.id);
  if (!human) return res.status(404).json({ message: '数字人不存在' });
  if (human.user_id !== req.userId) return res.status(403).json({ message: '无权查看' });

  // 各类视频使用统计
  const videoCount = db.prepare("SELECT COUNT(*) as c FROM video_orders WHERE talent_id = ? AND status IN ('completed','delivered')").get(human.id).c;
  const videoTotal = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM video_orders WHERE talent_id = ? AND status = 'completed'").get(human.id).s;
  const endorsementCount = db.prepare("SELECT COUNT(*) as c FROM endorsement_orders WHERE talent_id = ? AND status = 'completed'").get(human.id).c;
  const endorsementTotal = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM endorsement_orders WHERE talent_id = ? AND status = 'completed'").get(human.id).s;
  const projectCount = db.prepare(`SELECT COUNT(*) as c FROM claims c
    JOIN projects p ON c.project_id = p.id
    WHERE c.status IN ('paid','signed') AND p.talent_id = ?`).get(human.id).c;

  // 最近使用记录
  const recentVideos = db.prepare(`SELECT order_no, amount, status, created_at, deliver_time
    FROM video_orders WHERE talent_id = ? ORDER BY created_at DESC LIMIT 10`).all(human.id);
  const recentEndorsements = db.prepare(`SELECT order_no, brand, amount, status, created_at
    FROM endorsement_orders WHERE talent_id = ? ORDER BY created_at DESC LIMIT 5`).all(human.id);

  res.json({
    humanId: human.id,
    humanName: human.name,
    summary: {
      totalUsage: videoCount + endorsementCount + projectCount,
      videoCount,
      endorsementCount,
      projectCount,
      totalRevenue: (videoTotal + endorsementTotal) / 100,
    },
    recentVideos: recentVideos.map(v => ({
      orderNo: v.order_no, amount: v.amount / 100, status: v.status,
      type: '祝福视频', createdAt: v.created_at, deliveredAt: v.deliver_time,
    })),
    recentEndorsements: recentEndorsements.map(e => ({
      orderNo: e.order_no, brand: e.brand, amount: e.amount / 100, status: e.status,
      type: '品牌代言', createdAt: e.created_at,
    })),
    canRevoke: true,
    reportNote: '如发现异常使用，可立即撤回授权或举报',
  });
});

// V5.0 视频样片预览
router.get('/:id/showreels', (req, res) => {
  const human = db.prepare('SELECT showreel_urls FROM humans WHERE id = ?').get(req.params.id);
  if (!human) return res.status(404).json({ message: '艺人不存在' });
  const urls = human.showreel_urls ? JSON.parse(human.showreel_urls) : [];
  res.json({ showreels: urls });
});

// V5.0 艺人上传样片
router.post('/:id/showreels', auth, (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ message: '缺少视频URL' });
  const human = db.prepare('SELECT * FROM humans WHERE id = ?').get(req.params.id);
  if (!human) return res.status(404).json({ message: '艺人不存在' });
  if (human.user_id !== req.userId) return res.status(403).json({ message: '无权操作' });

  const urls = human.showreel_urls ? JSON.parse(human.showreel_urls) : [];
  if (urls.length >= 5) return res.status(400).json({ message: '最多上传5个样片' });
  urls.push({ url, uploadedAt: new Date().toISOString() });
  db.prepare('UPDATE humans SET showreel_urls = ? WHERE id = ?').run(JSON.stringify(urls), human.id);
  res.json({ message: '样片上传成功', showreels: urls });
});

// V5.0 删除样片
router.delete('/:id/showreels/:index', auth, (req, res) => {
  const human = db.prepare('SELECT * FROM humans WHERE id = ?').get(req.params.id);
  if (!human) return res.status(404).json({ message: '艺人不存在' });
  if (human.user_id !== req.userId) return res.status(403).json({ message: '无权操作' });

  const urls = human.showreel_urls ? JSON.parse(human.showreel_urls) : [];
  const idx = parseInt(req.params.index);
  if (idx < 0 || idx >= urls.length) return res.status(400).json({ message: '索引无效' });
  urls.splice(idx, 1);
  db.prepare('UPDATE humans SET showreel_urls = ? WHERE id = ?').run(JSON.stringify(urls), human.id);
  res.json({ message: '样片已删除' });
});

module.exports = router;
