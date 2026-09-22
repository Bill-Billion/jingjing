const { rejectUnmarkedDelivery } = require('../utils/watermark');
// routes/endorsement.js - 品牌代言（V2：金额分+越权修复+内容审核）
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const config = require('../config');
const { calculateFees, splitMcn, genOrderNo, genTxNo } = require('../utils/settlement');
const { withLock } = require('../utils/idempotent');
const { checkDepositSufficient } = require('../utils/deposit');
const router = express.Router();
const { submitReview } = require('./review');

function assertTalentOwner(req, talentId) {
  const human = db.prepare('SELECT id, user_id FROM humans WHERE id = ?').get(talentId);
  if (!human) throw Object.assign(new Error('艺人不存在'), { status: 404 });
  if (human.user_id !== req.userId && req.role !== 'admin') {
    throw Object.assign(new Error('无权操作'), { status: 403 });
  }
  return human;
}

// 代言套餐
router.get('/packages', (req, res) => {
  // V11 线④定价：单品口播1999 / 季度代言19999（DB 存分，边界转元）
  res.json({
    list: [
      { id: 1, name: '单品口播', duration: 30, price: 199900, deliverables: '1条口播视频 + 3张精修定妆图', desc: '15-30秒数字人口播，含30天投放授权' },
      { id: 2, name: '季度代言', duration: 90, price: 1999900, deliverables: '6条视频 + 12张图 + 全渠道季度授权', desc: '90天季度代言，分批交付，专属经纪对接' },
    ].map(p => ({ ...p, price: p.price / 100 })),
  });
});

// 违禁类目检查
function checkBannedCategory(category) {
  if (!category) return false;
  return config.content.bannedCategories.some(b => category.includes(b));
}

// 费用试算
router.post('/quote', (req, res) => {
  const amountFen = Math.round(Number(req.body.amount || 5000) * 100);
  const fees = calculateFees(amountFen, req.body.identityType || 'personal', config.aiCost.endorsement, config.commission.endorsement);
  res.json({
    amount: fees.amount / 100, platformFee: fees.platformFee / 100,
    aiCost: fees.aiCost / 100, taxAmount: fees.taxAmount / 100,
    netAmount: fees.netAmount / 100,
  });
});

// 创建代言订单（V5.0：增加反欺诈校验+保证金检查+广告标识）
router.post('/order', auth, (req, res) => {
  const { talentId, title, brand, category, requirements, amount, identityType } = req.body;
  if (!title || !amount) return res.status(400).json({ message: '请填写标题和预算' });
  if (!talentId) return res.status(400).json({ message: '请先选择要代言的数字人' });
  const talentExists = db.prepare('SELECT id FROM humans WHERE id = ?').get(talentId);
  if (!talentExists) return res.status(400).json({ message: '所选数字人不存在' });
  if (checkBannedCategory(category) || checkBannedCategory(requirements)) {
    return res.status(400).json({ message: '该类目暂不支持代言（医疗/药品/金融等）' });
  }

  // V5.0反欺诈：禁止自买自卖
  const talentOwner = db.prepare('SELECT user_id FROM humans WHERE id = ?').get(talentId);
  if (talentOwner && talentOwner.user_id === req.userId) {
    return res.status(403).json({ message: '不能购买自己的代言服务' });
  }

  // V5.0保证金检查
  if (config.deposit.enabled && talentOwner) {
    const depositStatus = checkDepositSufficient(talentOwner.user_id, talentId);
    if (!depositStatus.sufficient) {
      return res.status(403).json({
        message: '该艺人保证金不足，暂无法接单',
        depositRequired: depositStatus.required / 100,
        depositPaid: depositStatus.paid / 100,
      });
    }
  }

  // V5.0反欺诈：新账号冷却期
  const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(req.userId);
  if (user) {
    const ageHours = (Date.now() - new Date(user.created_at).getTime()) / 3600000;
    const amountFenCheck = Math.round(Number(amount) * 100);
    if (ageHours < config.antiFraud.newAccountCoolHours && amountFenCheck >= config.antiFraud.suspiciousAmount) {
      return res.status(403).json({ message: '新账号请先完成小额交易' });
    }
  }

  const amountFen = Math.round(Number(amount) * 100);
  const fees = calculateFees(amountFen, identityType || 'personal', config.aiCost.endorsement, config.commission.endorsement);
  const orderNo = genOrderNo('EN');
  db.prepare(`INSERT INTO endorsement_orders
    (order_no, user_id, talent_id, title, brand, category, requirements, amount,
     platform_fee, ai_cost, tax_amount, tax_rate, net_amount, identity_type, status, is_ad)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(
    orderNo, req.userId, talentId, title, brand || '', category || '', requirements || '',
    fees.amount, fees.platformFee, fees.aiCost, fees.taxAmount, fees.taxRate, fees.netAmount,
    identityType || 'personal', 'pending'
  );
  res.json({ orderNo, amount: fees.amount / 100, isAd: true, adDisclosure: config.content.adDisclosure, fees: {
    platformFee: fees.platformFee / 100, aiCost: fees.aiCost / 100,
    taxAmount: fees.taxAmount / 100, netAmount: fees.netAmount / 100,
  }});
});

// 艺人接单（越权修复）
router.post('/accept/:orderNo', auth, (req, res) => {
  const order = db.prepare('SELECT * FROM endorsement_orders WHERE order_no = ?').get(req.params.orderNo);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  try { assertTalentOwner(req, order.talent_id); } catch (e) { return res.status(e.status || 400).json({ message: e.message }); }
  if (order.status !== 'paid') return res.status(400).json({ message: '订单状态异常' });
  db.prepare("UPDATE endorsement_orders SET status = 'delivering', accept_time = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
  res.json({ message: '已接单' });
});

// 交付（越权修复+内容审核）
router.post('/deliver/:orderNo', auth, rejectUnmarkedDelivery, async (req, res) => {
  const { videoUrl, materialUrls } = req.body;
  const order = db.prepare('SELECT * FROM endorsement_orders WHERE order_no = ?').get(req.params.orderNo);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  try { assertTalentOwner(req, order.talent_id); } catch (e) { return res.status(e.status || 400).json({ message: e.message }); }
  if (order.status !== 'delivering') return res.status(400).json({ message: '订单状态异常' });
  const deadline = new Date(Date.now() + config.escrow.autoVerifyDays * 86400000).toISOString();
  db.prepare("UPDATE endorsement_orders SET status = 'delivered', video_url = ?, material_urls = ?, deliver_time = CURRENT_TIMESTAMP, verify_deadline = ?, review_status = ? WHERE id = ?")
    .run(videoUrl || '', JSON.stringify(materialUrls || []), deadline,
      config.content.reviewRequired ? 'pending' : 'approved', order.id);
  if (config.content.reviewRequired) {
    await submitReview('endorsement', order.id, req.userId, { url: videoUrl }).catch(() => {});
  }
  res.json({ message: '已交付，等待审核和验收' });
});

// 验收
router.post('/verify/:orderNo', auth, (req, res) => {
  const order = db.prepare('SELECT * FROM endorsement_orders WHERE order_no = ? AND user_id = ?').get(req.params.orderNo, req.userId);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.status !== 'delivered') return res.status(400).json({ message: '订单状态异常' });
  if (config.content.reviewRequired && order.review_status !== 'approved') {
    return res.status(400).json({ message: '内容审核中' });
  }
  settleEndorsement(order);
  res.json({ message: '验收成功，已结算' });
});

// 我的订单
router.get('/my', auth, (req, res) => {
  const orders = db.prepare(`
    SELECT e.*, h.name as talent_name, h.avatar
    FROM endorsement_orders e LEFT JOIN humans h ON e.talent_id = h.id
    WHERE e.user_id = ? ORDER BY e.created_at DESC LIMIT 100`).all(req.userId);
  res.json({ list: orders.map(formatEndorsement) });
});

// 艺人收到的订单
router.get('/received', auth, (req, res) => {
  const orders = db.prepare(`
    SELECT e.*, h.name as talent_name, u.nickname as buyer_name
    FROM endorsement_orders e LEFT JOIN humans h ON e.talent_id = h.id
    LEFT JOIN users u ON e.user_id = u.id
    WHERE e.talent_id IN (SELECT id FROM humans WHERE user_id = ?)
    ORDER BY e.created_at DESC LIMIT 100`).all(req.userId);
  res.json({ list: orders.map(formatEndorsement) });
});

// 发布招募任务
router.post('/tasks', auth, (req, res) => {
  const { title, brand, category, requirements, duration, budget } = req.body;
  if (!title) return res.status(400).json({ message: '请填写标题' });
  if (checkBannedCategory(category)) return res.status(400).json({ message: '该类目暂不支持' });
  const taskNo = genOrderNo('TK');
  db.prepare(`INSERT INTO endorsement_tasks (order_no, user_id, title, brand, category, requirements, duration, budget, status)
    VALUES (?,?,?,?,?,?,?,?,'open')`).run(
    taskNo, req.userId, title, brand || '', category || '', requirements || '',
    duration || 30, Math.round(Number(budget || 5000) * 100));
  res.json({ taskNo, message: '招募任务已发布' });
});

router.get('/tasks', (req, res) => {
  const tasks = db.prepare("SELECT * FROM endorsement_tasks WHERE status = 'open' ORDER BY created_at DESC LIMIT 50").all();
  res.json({ list: tasks.map(t => ({ ...t, budget: t.budget / 100 })) });
});

router.post('/tasks/:id/apply', auth, (req, res) => {
  const { quote, message } = req.body;
  const task = db.prepare('SELECT * FROM endorsement_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ message: '任务不存在' });
  const talent = db.prepare('SELECT id FROM humans WHERE user_id = ? LIMIT 1').get(req.userId);
  if (!talent) return res.status(400).json({ message: '请先创建数字人' });
  db.prepare('INSERT INTO endorsement_applications (task_id, talent_id, quote, message) VALUES (?,?,?,?)')
    .run(task.id, talent.id, Math.round(Number(quote || task.budget / 100) * 100), message || '');
  res.json({ message: '报名成功' });
});

function settleEndorsement(order) {
  withLock(`settle:${order.order_no}`, () => {
    if (order.settle_status === 'settled') return;
    const human = db.prepare('SELECT id, user_id FROM humans WHERE id = ?').get(order.talent_id);
    let payeeUserId = human ? human.user_id : null;
    let mcnInfo = null;
    if (human) {
      const identity = db.prepare("SELECT * FROM user_identities WHERE user_id = ? AND status = 'approved'").get(human.user_id);
      if (identity && identity.identity_type === 'mcn' && identity.mcn_id) {
        const mcn = db.prepare('SELECT * FROM mcn_agencies WHERE id = ?').get(identity.mcn_id);
        const rel = db.prepare("SELECT * FROM mcn_talents WHERE mcn_id = ? AND talent_id = ? AND status = 'active'").get(identity.mcn_id, human.id);
        if (mcn && rel) {
          const freeTrial = rel.joined_at
            ? (Date.now() - new Date(rel.joined_at).getTime()) < config.mcn.freeTrialDays * 86400000
            : false;
          mcnInfo = { mcn, rel, freeTrial };
        }
      }
    }
    const now = new Date().toISOString();
    db.prepare("UPDATE endorsement_orders SET settle_status = 'settled', settle_time = ?, status = 'completed' WHERE id = ?").run(now, order.id);
    if (payeeUserId) {
      db.prepare('INSERT OR IGNORE INTO wallets (user_id) VALUES (?)').run(payeeUserId);
      let credit = order.net_amount;
      if (mcnInfo) {
        const split = splitMcn(order.net_amount, {
          freeTrial: mcnInfo.freeTrial,
          managementFeeRate: config.mcn.managementFeeRate,
        });
        credit = split.talentAmount;
        db.prepare('INSERT OR IGNORE INTO wallets (user_id) VALUES (?)').run(mcnInfo.mcn.user_id);
        db.prepare('UPDATE wallets SET balance = balance + ?, total_income = total_income + ? WHERE user_id = ?')
          .run(split.mcnAmount, split.mcnAmount, mcnInfo.mcn.user_id);
        recordTx(mcnInfo.mcn.user_id, 'income', split.mcnAmount, 'endorsement', order.id, `代言MCN管理服务费-${order.order_no}${mcnInfo.freeTrial ? '（免管理费期，实际0抽成）' : ''}`);
      }
      db.prepare('UPDATE wallets SET balance = balance + ?, total_income = total_income + ? WHERE user_id = ?')
        .run(credit, credit, payeeUserId);
      recordTx(payeeUserId, 'income', credit, 'endorsement', order.id, `代言收入-${order.order_no}`);
    }
  });
}

function recordTx(userId, type, amount, orderType, orderId, desc) {
  const wallet = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(userId);
  db.prepare(`INSERT INTO transactions (tx_no, user_id, type, amount, balance_after, order_type, order_id, description)
    VALUES (?,?,?,?,?,?,?,?)`).run(genTxNo(), userId, type, amount, wallet ? wallet.balance : 0, orderType, orderId, desc);
}

function formatEndorsement(e) {
  return {
    id: e.id, orderNo: e.order_no, talentName: e.talent_name, avatar: e.avatar,
    title: e.title, brand: e.brand, category: e.category, requirements: e.requirements,
    amount: e.amount / 100, status: e.status, date: e.created_at,
    videoUrl: e.video_url, materialUrls: e.material_urls ? JSON.parse(e.material_urls) : [],
    fees: { platformFee: e.platform_fee / 100, aiCost: e.ai_cost / 100, netAmount: e.net_amount / 100 },
    reviewStatus: e.review_status,
    isAd: e.is_ad !== 0,
    adDisclosure: e.is_ad !== 0 ? config.content.adDisclosure : '',
    authLetterUrl: e.auth_letter_url,
  };
}

// V5.0 获取品牌代言使用授权书
router.get('/auth-letter/:orderNo', auth, (req, res) => {
  const order = db.prepare('SELECT * FROM endorsement_orders WHERE order_no = ?').get(req.params.orderNo);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.user_id !== req.userId && req.role !== 'admin') {
    return res.status(403).json({ message: '无权下载' });
  }
  if (order.status !== 'completed' && order.status !== 'delivered') {
    return res.status(400).json({ message: '订单未完成，授权书尚未生效' });
  }

  // TODO: 生成PDF授权书（使用pdfkit或puppeteer），当前返回授权书数据
  const talent = db.prepare('SELECT name FROM humans WHERE id = ?').get(order.talent_id);
  res.json({
    message: '授权书信息',
    authLetter: {
      orderNo: order.order_no,
      brand: order.brand,
      category: order.category,
      talentName: talent ? talent.name : '',
      title: order.title,
      amount: order.amount / 100,
      // 默认授权范围和期限（实际从订单扩展字段读取）
      scope: '线上数字媒体（社交媒体/电商平台/品牌官网）',
      duration: '3个月',
      territory: '中国大陆',
      isExclusive: false,
      adLabelRequired: true,
      adDisclosure: config.content.adDisclosure,
      generatedAt: new Date().toISOString(),
      note: '正式PDF授权书将在订单完成后自动生成，含双方电子签名',
    },
  });
});

// V5.0 品牌代言效果数据录入/查询
router.post('/metrics/:orderNo', auth, (req, res) => {
  const { platform, views, likes, comments, shares, clicks } = req.body;
  const order = db.prepare('SELECT * FROM endorsement_orders WHERE order_no = ?').get(req.params.orderNo);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.user_id !== req.userId) return res.status(403).json({ message: '无权操作' });

  db.prepare(`INSERT INTO endorsement_metrics
    (order_no, platform, views, likes, comments, shares, clicks)
    VALUES (?,?,?,?,?,?,?)`).run(
    order.order_no, platform || 'other', views || 0, likes || 0,
    comments || 0, shares || 0, clicks || 0
  );
  res.json({ message: '效果数据已记录' });
});

router.get('/metrics/:orderNo', auth, (req, res) => {
  const order = db.prepare('SELECT * FROM endorsement_orders WHERE order_no = ?').get(req.params.orderNo);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.user_id !== req.userId && req.role !== 'admin') {
    return res.status(403).json({ message: '无权查看' });
  }
  const metrics = db.prepare('SELECT * FROM endorsement_metrics WHERE order_no = ? ORDER BY recorded_at DESC')
    .all(req.params.orderNo);
  const totals = metrics.reduce((acc, m) => ({
    views: acc.views + m.views, likes: acc.likes + m.likes,
    comments: acc.comments + m.comments, shares: acc.shares + m.shares,
  }), { views: 0, likes: 0, comments: 0, shares: 0 });
  res.json({
    list: metrics,
    totals,
    cpm: totals.views > 0 ? Math.round((order.amount / totals.views) * 1000 * 100) / 100 : 0,
  });
});

module.exports = router;
