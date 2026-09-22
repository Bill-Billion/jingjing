const { rejectUnmarkedDelivery } = require('../utils/watermark');
// routes/videos.js - 视频模板与订单（V2：担保交易+越权修复+金额分）
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const config = require('../config');
const { calculateFees, splitMcn, genOrderNo, genTxNo } = require('../utils/settlement');
const { withLock } = require('../utils/idempotent');
const { validate, v } = require('../middleware/validate');
const { recordConsent } = require('../utils/consent');
const { checkDepositSufficient, collectDepositFromIncome } = require('../utils/deposit');
const limits = require('../middleware/rateLimit');
const router = express.Router();
const { submitReview } = require('./review');

// 工具：校验当前用户是某艺人的所属者
function assertTalentOwner(req, talentId) {
  const human = db.prepare('SELECT id, user_id FROM humans WHERE id = ?').get(talentId);
  if (!human) throw Object.assign(new Error('艺人不存在'), { status: 404 });
  if (human.user_id !== req.userId && req.role !== 'admin') {
    throw Object.assign(new Error('无权操作此艺人订单'), { status: 403 });
  }
  return human;
}

// 视频模板列表
router.get('/templates', (req, res) => {
  const { talentId, category } = req.query;
  let sql = "SELECT * FROM video_templates WHERE status = 'active'";
  const params = [];
  if (talentId) { sql += ' AND talent_id = ?'; params.push(talentId); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY sold DESC LIMIT 100';
  const list = db.prepare(sql).all(...params);
  const result = list.map(t => {
    const human = db.prepare('SELECT name, avatar FROM humans WHERE id = ?').get(t.talent_id);
    return {
      id: t.id, talentId: t.talent_id, talentName: human ? human.name : '',
      avatar: human ? human.avatar : '', title: t.title, category: t.category,
      duration: t.duration, price: t.price / 100, sold: t.sold, desc: t.description,
    };
  });
  res.json({ list: result });
});

// 费用试算
router.post('/quote', (req, res) => {
  const amount = Math.round(Number(req.body.amount || 99) * 100);
  // V5.0 佣金分级：99元档0%，299元以上10%
  const rate = amount <= config.videoPricing.minPrice ? config.commission.videoBasic : config.commission.videoStandard;
  const fees = calculateFees(amount, req.body.identityType || 'personal', config.aiCost.video, rate);
  res.json({
    amount: fees.amount / 100, platformFee: fees.platformFee / 100,
    aiCost: fees.aiCost / 100, taxAmount: fees.taxAmount / 100,
    netAmount: fees.netAmount / 100, identityType: fees.identityType,
  });
});

// 创建视频订单（担保交易）
router.post('/order', auth, limits.createOrder, validate({
  talentId: [v.required, v.integer],
}), (req, res) => {
  const { talentId, tplId, recipient, message, email, identityType, agreeNoReturn, amount } = req.body;
  // V11：tplId 选填——优先用传入模板，否则按艺人最接近金额的在售模板兜底
  let tpl = null;
  if (tplId) {
    tpl = db.prepare('SELECT * FROM video_templates WHERE id = ? AND status = ?').get(tplId, 'active');
    if (!tpl) return res.status(404).json({ message: '模板不存在' });
    if (tpl.talent_id !== talentId) return res.status(400).json({ message: '模板与艺人不匹配' });
  } else {
    const candidates = db.prepare("SELECT * FROM video_templates WHERE talent_id = ? AND status = 'active' ORDER BY price ASC").all(talentId);
    if (!candidates.length) return res.status(404).json({ message: '该艺人暂无可购套餐' });
    const wantFen = amount ? Math.round(Number(amount) * 100) : null;
    tpl = wantFen
      ? candidates.reduce((best, c) => Math.abs(c.price - wantFen) < Math.abs(best.price - wantFen) ? c : best, candidates[0])
      : candidates[0];
  }
  const contactEmail = email || '';

  // V4.0 消费者权益：定制数字商品不适用7天无理由退货，需用户明确确认
  if (config.consumer.requireExplicitConsent && !agreeNoReturn) {
    return res.status(400).json({
      message: '请确认定制数字商品不适用七日无理由退货',
      consentRequired: true,
      consentText: config.consumer.consentText,
    });
  }

  // 反欺诈：禁止自买自卖（买家不能是艺人本人）
  const talentOwner = db.prepare('SELECT user_id FROM humans WHERE id = ?').get(talentId);
  if (talentOwner && talentOwner.user_id === req.userId) {
    return res.status(403).json({ message: '不能购买自己的视频服务' });
  }

  // V4.0 艺人保证金检查（最高法2026.8典型案例）
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

  // 反欺诈：单用户日下单上限
  const today = new Date().toISOString().slice(0, 10);
  const userOrderCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM video_orders WHERE user_id = ? AND DATE(created_at) = ?"
  ).get(req.userId, today);
  if (userOrderCount.cnt >= config.antiFraud.maxDailyOrdersPerUser) {
    return res.status(429).json({ message: '今日下单次数已达上限' });
  }

  // 反欺诈：新账号冷却期
  const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(req.userId);
  if (user) {
    const ageHours = (Date.now() - new Date(user.created_at).getTime()) / 3600000;
    if (ageHours < config.antiFraud.newAccountCoolHours && tpl.price >= config.antiFraud.suspiciousAmount) {
      return res.status(403).json({ message: '新账号请先完成小额交易' });
    }
  }

  const idType = identityType || 'personal';
  // V5.0 艺人扶持：新艺人前90天AI成本补贴（99/299元档免AI成本）
  const talentHuman = db.prepare('SELECT subsidy_until FROM humans WHERE id = ?').get(talentId);
  const now = new Date();
  const isSubsidized = talentHuman?.subsidy_until && new Date(talentHuman.subsidy_until) > now;
  const aiCostFen = isSubsidized ? 0 : config.aiCost.video;
  // V5.0 佣金分级：99元基础档0%佣金（引流品），299元以上10%
  const videoRate = tpl.price <= config.videoPricing.minPrice ? config.commission.videoBasic : config.commission.videoStandard;
  const fees = calculateFees(tpl.price, idType, aiCostFen, videoRate);
  const orderNo = genOrderNo('VD');
  const sceneTemplateId = req.body.sceneTemplateId || null;

  db.prepare(`INSERT INTO video_orders
    (order_no, user_id, talent_id, template_id, recipient, message, email, amount,
     platform_fee, ai_cost, tax_amount, tax_rate, net_amount, identity_type, status, scene_template_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    orderNo, req.userId, talentId, tpl.id, recipient || '', message || '', contactEmail,
    fees.amount, fees.platformFee, fees.aiCost, fees.taxAmount, fees.taxRate, fees.netAmount, idType, 'pending', sceneTemplateId
  );

  // V4.0 记录数字商品不退货确认
  if (agreeNoReturn) {
    recordConsent(req.userId, 'digital_goods_return', true, {
      orderNo,
      consentText: config.consumer.consentText,
      ip: req.ip,
    });
  }

  res.json({ orderNo, amount: fees.amount / 100, fees: {
    platformFee: fees.platformFee / 100, aiCost: fees.aiCost / 100,
    taxAmount: fees.taxAmount / 100, netAmount: fees.netAmount / 100,
  }, subsidized: !!isSubsidized });
});

// 艺人接单（越权修复：校验艺人归属）
router.post('/accept/:orderNo', auth, (req, res) => {
  const order = db.prepare('SELECT * FROM video_orders WHERE order_no = ?').get(req.params.orderNo);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  try { assertTalentOwner(req, order.talent_id); } catch (e) { return res.status(e.status || 400).json({ message: e.message }); }
  if (order.status !== 'paid') return res.status(400).json({ message: '订单状态异常' });

  db.prepare('UPDATE video_orders SET status = ?, accept_time = CURRENT_TIMESTAMP WHERE id = ?')
    .run('delivering', order.id);
  res.json({ message: '已接单' });
});

// 艺人交付视频（越权修复 + 内容审核）
router.post('/deliver/:orderNo', auth, rejectUnmarkedDelivery, async (req, res) => {
  const { videoUrl } = req.body;
  if (!videoUrl) return res.status(400).json({ message: '请提供视频地址' });
  const order = db.prepare('SELECT * FROM video_orders WHERE order_no = ?').get(req.params.orderNo);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  try { assertTalentOwner(req, order.talent_id); } catch (e) { return res.status(e.status || 400).json({ message: e.message }); }
  if (order.status !== 'delivering') return res.status(400).json({ message: '订单状态异常' });

  const deadline = new Date(Date.now() + config.escrow.autoVerifyDays * 86400000).toISOString();
  db.prepare('UPDATE video_orders SET status = ?, video_url = ?, deliver_time = CURRENT_TIMESTAMP, verify_deadline = ?, review_status = ? WHERE id = ?')
    .run('delivered', videoUrl, deadline, config.content.reviewRequired ? 'pending' : 'approved', order.id);

  // 提交内容审核（机审+人审）
  if (config.content.reviewRequired) {
    await submitReview('video', order.id, req.userId, { url: videoUrl }).catch(() => {});
  }
  res.json({ message: '已交付，等待审核和验收', verifyDeadline: deadline });
});

// 客户验收确认
router.post('/verify/:orderNo', auth, (req, res) => {
  const order = db.prepare('SELECT * FROM video_orders WHERE order_no = ? AND user_id = ?').get(req.params.orderNo, req.userId);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.status !== 'delivered') return res.status(400).json({ message: '订单状态异常' });
  if (config.content.reviewRequired && order.review_status !== 'approved') {
    return res.status(400).json({ message: '内容审核中，暂不能验收' });
  }
  settleOrder(order);
  res.json({ message: '验收成功，已结算' });
});

// 申请退款/纠纷
router.post('/dispute/:orderNo', auth, (req, res) => {
  const { reason } = req.body;
  const order = db.prepare('SELECT * FROM video_orders WHERE order_no = ? AND user_id = ?').get(req.params.orderNo, req.userId);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (!['paid', 'delivering', 'delivered'].includes(order.status)) {
    return res.status(400).json({ message: '当前状态不可申请纠纷' });
  }
  db.prepare('UPDATE video_orders SET status = ? WHERE id = ?').run('dispute', order.id);
  db.prepare(`INSERT INTO audit_logs (operator_id, action, target_type, target_id, detail)
    VALUES (?, 'dispute', 'video_order', ?, ?)`).run(req.userId, order.id, reason || '');
  res.json({ message: '已提交纠纷，平台将在3个工作日内处理' });
});

// 我的订单（客户）
router.get('/my', auth, (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, t.title, h.name as talent_name, h.avatar
    FROM video_orders o
    LEFT JOIN video_templates t ON o.template_id = t.id
    LEFT JOIN humans h ON o.talent_id = h.id
    WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 100
  `).all(req.userId);
  res.json({ list: orders.map(formatOrder) });
});

// 艺人收到的订单（越权修复：只返回自己艺人的订单）
router.get('/received', auth, (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, t.title, h.name as talent_name, u.nickname as buyer_name
    FROM video_orders o
    LEFT JOIN video_templates t ON o.template_id = t.id
    LEFT JOIN humans h ON o.talent_id = h.id
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.talent_id IN (SELECT id FROM humans WHERE user_id = ?)
    ORDER BY o.created_at DESC LIMIT 100
  `).all(req.userId);
  res.json({ list: orders.map(formatOrder) });
});

// 订单详情
router.get('/order/:orderNo', auth, (req, res) => {
  const order = db.prepare(`
    SELECT o.*, t.title, h.name as talent_name, h.avatar
    FROM video_orders o
    LEFT JOIN video_templates t ON o.template_id = t.id
    LEFT JOIN humans h ON o.talent_id = h.id
    WHERE o.order_no = ?
  `).get(req.params.orderNo);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  // 仅买卖双方和管理员可看
  const human = db.prepare('SELECT user_id FROM humans WHERE id = ?').get(order.talent_id);
  if (order.user_id !== req.userId && human?.user_id !== req.userId && req.role !== 'admin') {
    return res.status(403).json({ message: '无权查看' });
  }
  res.json(formatOrder(order));
});

// ============ 结算（内部函数） ============
function settleOrder(order) {
  withLock(`settle:${order.order_no}`, () => {
    if (order.settle_status === 'settled') return; // 幂等

    const human = db.prepare('SELECT id, user_id FROM humans WHERE id = ?').get(order.talent_id);
    // V10.1 修复资金账不平：收款方始终为艺人本人，与支付成功时 pending 记账账户（_onVideoPaid）保持一致；
    // MCN 管理服务费作为"从艺人净收入中的内部分出"，不再把收款方改成 MCN（否则艺人 pending 虚高、MCN 扣成负数）。
    const payeeUserId = human ? human.user_id : null;
    let mcnInfo = null;

    if (human) {
      const identity = db.prepare("SELECT * FROM user_identities WHERE user_id = ? AND status = 'approved'").get(human.user_id);
      if (identity && identity.identity_type === 'mcn' && identity.mcn_id) {
        const mcn = db.prepare('SELECT * FROM mcn_agencies WHERE id = ?').get(identity.mcn_id);
        const rel = db.prepare("SELECT * FROM mcn_talents WHERE mcn_id = ? AND talent_id = ? AND status = 'active'").get(identity.mcn_id, human.id);
        if (mcn && rel) {
          // 免管理费期：挂靠起 freeTrialDays 天内 MCN 不抽成
          const freeTrial = rel.joined_at
            ? (Date.now() - new Date(rel.joined_at).getTime()) < config.mcn.freeTrialDays * 86400000
            : false;
          mcnInfo = { mcn, freeTrial };
        }
      }
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE video_orders SET settle_status = 'settled', settle_time = ?, status = 'completed', complete_time = ? WHERE id = ?")
      .run(now, now, order.id);

    if (payeeUserId) {
      db.prepare('INSERT OR IGNORE INTO wallets (user_id) VALUES (?)').run(payeeUserId);
      let creditAmount = order.net_amount;

      // V5.0 首笔收入冻结保证金（first_income模式，从艺人本人收入冻结）
      const depositResult = collectDepositFromIncome(payeeUserId, order.talent_id, creditAmount);
      creditAmount = depositResult.remaining;
      if (depositResult.deducted > 0) {
        recordTx(payeeUserId, 'deposit_freeze', depositResult.deducted, 'video_order', order.id,
          `保证金冻结-${order.order_no}（已缴${depositResult.depositPaid / 100}元/${depositResult.depositRequired / 100}元）`);
      }

      // MCN 管理服务费：从艺人净收入内部分出，艺人得剩余，MCN 单独入账（talent + mcn + 保证金 = net，总额守恒）
      if (mcnInfo) {
        const split = splitMcn(creditAmount, {
          freeTrial: mcnInfo.freeTrial,
          managementFeeRate: config.mcn.managementFeeRate,
        });
        creditAmount = split.talentAmount;
        if (split.mcnAmount > 0) {
          db.prepare('INSERT OR IGNORE INTO wallets (user_id) VALUES (?)').run(mcnInfo.mcn.user_id);
          db.prepare('UPDATE wallets SET balance = balance + ?, total_income = total_income + ? WHERE user_id = ?')
            .run(split.mcnAmount, split.mcnAmount, mcnInfo.mcn.user_id);
          recordTx(mcnInfo.mcn.user_id, 'income', split.mcnAmount, 'video_order', order.id,
            `MCN管理服务费-${order.order_no}${mcnInfo.freeTrial ? '（免管理费期，实际0抽成）' : ''}`);
        }
      }
      // pending 扣减额必须等于支付成功时计入的 order.net_amount，保证担保账户结平
      db.prepare('UPDATE wallets SET balance = balance + ?, pending = pending - ?, total_income = total_income + ? WHERE user_id = ?')
        .run(creditAmount, order.net_amount, creditAmount, payeeUserId);
      recordTx(payeeUserId, 'income', creditAmount, 'video_order', order.id, `视频订单收入-${order.order_no}`);
    }

    // 热度与销量（防刷：同一用户30天内对同一艺人只计一次热度）
    const recentBuy = db.prepare(`SELECT id FROM video_orders
      WHERE talent_id = ? AND user_id = ? AND status = 'completed'
      AND complete_time > datetime('now', '-30 days') AND id != ?`).get(order.talent_id, order.user_id, order.id);
    const heatInc = recentBuy ? 0.01 : 0.1;
    // service_fee 字段用于累计该艺人成交额(GMV，单位分)，故累加订单总额 amount 而非艺人净额
    db.prepare('UPDATE humans SET sales = sales + 1, service_fee = service_fee + ?, heat = heat + ? WHERE id = ?')
      .run(order.amount, heatInc, order.talent_id);
    db.prepare('UPDATE video_templates SET sold = sold + 1 WHERE id = ?').run(order.template_id);
  });
}

function recordTx(userId, type, amount, orderType, orderId, desc) {
  const wallet = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(userId);
  db.prepare(`INSERT INTO transactions (tx_no, user_id, type, amount, balance_after, order_type, order_id, description)
    VALUES (?,?,?,?,?,?,?,?)`).run(genTxNo(), userId, type, amount, wallet ? wallet.balance : 0, orderType, orderId, desc);
}

function formatOrder(o) {
  return {
    orderNo: o.order_no, status: o.status, settleStatus: o.settle_status,
    title: o.title, talentName: o.talent_name, avatar: o.avatar,
    amount: o.amount / 100, platformFee: o.platform_fee / 100, aiCost: o.ai_cost / 100,
    netAmount: o.net_amount / 100, videoUrl: o.video_url,
    recipient: o.recipient, message: o.message, email: o.email,
    createdAt: o.created_at, payTime: o.pay_time, deliverTime: o.deliver_time,
    verifyDeadline: o.verify_deadline, reviewStatus: o.review_status,
    redoCount: o.redo_count || 0, redoAvailable: o.redo_available !== 0,
    sceneTemplateId: o.scene_template_id,
    afterSalesStatus: o.after_sales_status,
  };
}

// V5.0 不满意免费重做（99元基础档，交付后48小时内可申请一次）
router.post('/redo/:orderNo', auth, (req, res) => {
  const { reason } = req.body;
  const order = db.prepare('SELECT * FROM video_orders WHERE order_no = ? AND user_id = ?').get(req.params.orderNo, req.userId);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.status !== 'delivered' && order.status !== 'completed') {
    return res.status(400).json({ message: '当前状态不可申请重做' });
  }
  if (!config.redo.enabled || !config.redo.freeForBasicTier || order.amount > 9900) {
    return res.status(400).json({ message: '该订单不享受免费重做' });
  }
  if (order.redo_count >= 1 || order.redo_available === 0) {
    return res.status(400).json({ message: '免费重做次数已用完' });
  }
  // 48小时内
  const deliverTime = order.deliver_time ? new Date(order.deliver_time) : new Date(order.complete_time);
  const hoursSince = (Date.now() - deliverTime.getTime()) / 3600000;
  if (hoursSince > config.redo.applyHours) {
    return res.status(400).json({ message: `交付后${config.redo.applyHours}小时内可申请重做` });
  }

  db.prepare('UPDATE video_orders SET redo_count = redo_count + 1, redo_available = 0, status = ?, after_sales_status = ? WHERE id = ?')
    .run('delivering', 'redoing', order.id);

  // 记录售后时间轴
  db.prepare(`INSERT INTO after_sales_timeline (order_no, order_type, action, operator_role, remark)
    VALUES (?, 'video', 'redo', 'user', ?)`).run(order.order_no, reason || '申请免费重做');

  res.json({ message: '重做申请已提交，艺人将重新制作' });
});

// V5.0 售后进度查询
router.get('/after-sales/:orderNo', auth, (req, res) => {
  // 同时覆盖视频订单与品牌代言订单（refunds/after_sales_timeline 均带 order_type 维度）
  let order = db.prepare('SELECT * FROM video_orders WHERE order_no = ? AND user_id = ?')
    .get(req.params.orderNo, req.userId);
  let orderKind = 'video';
  if (!order) {
    order = db.prepare('SELECT * FROM endorsement_orders WHERE order_no = ? AND user_id = ?')
      .get(req.params.orderNo, req.userId);
    orderKind = 'endorsement';
  }
  if (!order) return res.status(404).json({ message: '订单不存在' });

  const timeline = db.prepare('SELECT * FROM after_sales_timeline WHERE order_no = ? ORDER BY created_at ASC')
    .all(req.params.orderNo);

  // 退款进度
  const refund = db.prepare('SELECT * FROM refunds WHERE order_no = ? ORDER BY created_at DESC LIMIT 1').get(req.params.orderNo);

  res.json({
    orderNo: order.order_no,
    orderType: orderKind,
    afterSalesStatus: order.after_sales_status || order.status,
    timeline: timeline.map(t => ({
      action: t.action, operatorRole: t.operator_role,
      remark: t.remark, createdAt: t.created_at,
    })),
    refund: refund ? {
      refundNo: refund.refund_no, amount: refund.amount / 100,
      status: refund.status, reason: refund.reason, createdAt: refund.created_at,
    } : null,
  });
});

module.exports = router;
module.exports.settleOrderExternal = settleOrder;
