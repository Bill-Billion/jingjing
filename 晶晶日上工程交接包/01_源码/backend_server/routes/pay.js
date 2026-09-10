// routes/pay.js - 支付宝 APP 支付骨架（V12.4，挂载于 /api/pay）
// ----------------------------------------------------------------------------
// 与既有 routes/payment.js（旧支付占位 + 分账 provider 链路）【相互独立、不改其逻辑】。
// 三条接口：
//   POST /api/pay/alipay/create   需登录；校验业务单归属 + 服务端金额（绝不信前端）+ 幂等；生成 APP 订单串或返回演示标识
//   POST /api/pay/alipay/notify   公开；必须 RSA2 验签 + app_id/金额校验 + 幂等，通过后才把业务单置为已支付并写 payments
//   GET  /api/pay/status/:orderNo 需登录；查询某业务订单的支付状态（配置齐全且 pending 时顺带主动查单一次）
// 金额铁律：amount 只来自服务端业务订单行 / config，单位分；前端传入任何金额字段都只用于「比对并拒绝篡改」，绝不参与下单。
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const auth = require('../middleware/auth');
const alipay = require('../services/alipay');
const logger = require('../utils/logger');
const { genOrderNo } = require('../utils/settlement');

const router = express.Router();

// 业务类型 → 业务订单表 / 归属用户字段 / 金额字段 / 可支付状态
// dream = 定制剧圆梦席位（claims 表）；sample 为两阶段（意向金/制作款），金额取 config.sample
const BIZ = {
  video: { table: 'video_orders', userField: 'user_id', amountField: 'amount', payable: ['pending'] },
  endorsement: { table: 'endorsement_orders', userField: 'user_id', amountField: 'amount', payable: ['pending'] },
  dream: { table: 'claims', userField: 'user_id', amountField: 'amount', payable: ['pending'] },
  sample: { table: 'sample_orders', userField: 'user_id', payable: { intent: ['draft'], production: ['script_finalized'] } },
};
const SAMPLE_STAGES = { intent: 'intent', production: 'production' };

// 分→元（委托 service，保持单一实现）
const fenToYuan = alipay.fenToYuan;

// 金额对账：支付宝回传 total_amount 为元字符串（如 99.00，个别场景可能为 99），统一数值比较；NaN/缺失一律不等（fail-closed）
function yuanEqual(a, b) {
  const x = Number(a), y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
}

// 从请求体里识别前端是否夹带金额（用于识别并拒绝篡改；这些值永远不会被用于下单）
function clientClaimedAmount(body) {
  for (const k of ['amount', 'amountFen', 'amount_fen', 'totalAmount', 'total_amount', 'price']) {
    if (body[k] === undefined || body[k] === null || body[k] === '') continue;
    const n = Number(body[k]);
    // 前端可能传元或分；只要它是正数就纳入比对（元会被 *100 取整）
    if (Number.isFinite(n) && n > 0) {
      // 若带小数点或 <=1000 且字段名暗示“元”，按元换算，否则按分
      const asFen = (!Number.isInteger(n) || /amount$|price$/i.test(k) && n < 100000) ? Math.round(n * 100) : n;
      return { field: k, fen: asFen };
    }
  }
  return null;
}

/**
 * 服务端权威解析业务订单：归属校验 + 金额（分）+ 可支付状态。
 * 返回 { ok, order, amountFen, stage, subject } 或 { ok:false, code, message }
 */
function resolveServerOrder(userId, bizType, orderNo, stageRaw) {
  const conf = BIZ[bizType];
  if (!conf) return { ok: false, code: 400, message: '不支持的业务类型' };
  if (!orderNo) return { ok: false, code: 400, message: '缺少业务订单号' };
  const stage = stageRaw ? String(stageRaw) : '';

  // 归属校验：订单必须属于当前登录用户（SQL 里同时带 order_no 与 user_id）
  const order = db.prepare(
    `SELECT * FROM ${conf.table} WHERE order_no = ? AND ${conf.userField} = ?`
  ).get(orderNo, userId);
  if (!order) return { ok: false, code: 404, message: '订单不存在或不属于当前用户' };

  let amountFen = 0;
  let payableStates = [];
  if (bizType === 'sample') {
    // 样片两阶段：金额永远以 config.sample 为准（意向金 9900 / 制作款 490100），不读订单行里的历史默认值
    if (!SAMPLE_STAGES[stage]) return { ok: false, code: 400, message: '样片订单需指定 stage=intent|production' };
    amountFen = stage === 'intent' ? config.sample.intentDeposit : config.sample.productionFee;
    payableStates = conf.payable[stage];
  } else {
    amountFen = order[conf.amountField];
    payableStates = conf.payable;
  }
  if (!Number.isInteger(amountFen) || amountFen <= 0) {
    return { ok: false, code: 400, message: '服务端订单金额异常，无法支付' };
  }
  if (!payableStates.includes(order.status)) {
    return { ok: false, code: 400, message: `订单当前状态(${order.status})不可支付`, already: order.status };
  }
  const subject = bizType === 'sample'
    ? (stage === 'intent' ? '晶晶日上-样片意向金' : '晶晶日上-样片制作款')
    : `晶晶日上-${bizType}`;
  return { ok: true, order, amountFen, stage, subject };
}

// 支付成功后的业务状态推进（只做与现有演示占位一致的最小状态翻转，幂等、不改任何价格/分账逻辑）
function markBusinessPaid(pay) {
  const orderNo = pay.order_no;
  if (pay.biz_type === 'video') {
    db.prepare("UPDATE video_orders SET status='paid', pay_time=CURRENT_TIMESTAMP WHERE order_no=? AND status='pending'")
      .run(orderNo);
  } else if (pay.biz_type === 'endorsement') {
    db.prepare("UPDATE endorsement_orders SET status='paid', pay_time=CURRENT_TIMESTAMP WHERE order_no=? AND status='pending'")
      .run(orderNo);
  } else if (pay.biz_type === 'dream') {
    // 与既有 paymentService._onCustomizationPaid 口径一致：席位置已支付 + 项目已定席进度累加
    const claim = db.prepare('SELECT * FROM claims WHERE order_no=?').get(orderNo);
    if (claim) {
      // 仅当席位真实地从 pending 翻转为 paid（changes===1）才累加项目进度，杜绝重复支付/重复推进下的双加
      const cr = db.prepare("UPDATE claims SET status='paid', payment_tx_no=? WHERE id=? AND status='pending'")
        .run(pay.pay_no, claim.id);
      if (cr.changes === 1) {
        db.prepare('UPDATE projects SET raised_amount = raised_amount + ?, client_count = client_count + 1 WHERE id=?')
          .run(claim.amount, claim.project_id);
      }
    }
  } else if (pay.biz_type === 'sample') {
    if (pay.stage === 'intent') {
      db.prepare("UPDATE sample_orders SET status='intent_escrow', step=1, intent_paid=1, pay_time=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_no=? AND status='draft'")
        .run(orderNo);
    } else if (pay.stage === 'production') {
      db.prepare("UPDATE sample_orders SET production_paid=1, status='producing', step=5, pay_time=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_no=? AND status='script_finalized'")
        .run(orderNo);
    }
  }
}

// 依据支付宝成功结果，幂等地把 payments 置为 paid 并推进业务单（事务；重复回调 changes=0，不重复推进）
function applyPaid(pay, tradeNo, rawBody) {
  const hash = crypto.createHash('sha256').update(rawBody).digest('hex');
  if (pay.notify_hash === hash && pay.status === 'paid') return 0; // 完全相同的回调，幂等
  const txn = db.transaction(() => {
    const r = db.prepare(`UPDATE payments
      SET status='paid', trade_no=?, notify_hash=?, paid_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='pending'`).run(tradeNo || '', hash, pay.id);
    if (r.changes === 1) {
      const fresh = db.prepare('SELECT * FROM payments WHERE id=?').get(pay.id);
      markBusinessPaid(fresh);
    }
    return r.changes;
  });
  return txn();
}

// ============ 1) 创建支付宝 APP 支付（需登录） ============
router.post('/alipay/create', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const { orderNo, bizType, stage } = body;
    if (!orderNo || !bizType) return res.status(400).json({ message: '参数不完整：需要 orderNo、bizType' });

    // 服务端权威解析（含归属校验、服务端金额、可支付状态）
    const resolved = resolveServerOrder(req.userId, bizType, orderNo, stage);
    if (!resolved.ok) return res.status(resolved.code).json({ message: resolved.message });
    const { amountFen, subject } = resolved;
    const stageKey = resolved.stage || '';

    // 金额防篡改：前端若夹带金额且与服务端金额不一致，直接拒绝（该值绝不用于下单）
    const claimed = clientClaimedAmount(body);
    if (claimed && claimed.fen !== amountFen) {
      logger.warn('pay_amount_tamper_rejected', { orderNo, bizType, field: claimed.field, clientFen: claimed.fen, serverFen: amountFen });
      return res.status(400).json({ message: '金额以服务端订单为准，禁止前端传入或篡改金额' });
    }

    // 幂等：同一业务单+同一分期只保留一条支付单
    const exist = db.prepare('SELECT * FROM payments WHERE order_no=? AND stage=? ORDER BY id DESC LIMIT 1')
      .get(orderNo, stageKey);
    if (exist && exist.status === 'paid') {
      return res.json({
        configured: alipay.isConfigured(), demo: false, payMode: 'alipay', status: 'paid',
        payNo: exist.pay_no, amountFen, amountYuan: fenToYuan(amountFen), orderNo, bizType,
      });
    }

    // 未配置支付宝（缺密钥/开关关）：优雅降级为演示标识，不报错、不阻断，前端继续走现有演示支付占位
    if (!alipay.isConfigured()) {
      const st = alipay.status();
      return res.json({
        configured: false, demo: true, payMode: 'demo', status: 'unconfigured',
        message: '支付宝支付未配置，当前为演示环境（前端继续走演示支付占位）',
        missing: st.missing, amountFen, amountYuan: fenToYuan(amountFen), orderNo, bizType, stage: stageKey,
      });
    }

    // 复用 pending 支付单，否则新建
    let pay = (exist && exist.status === 'pending') ? exist : null;
    const payNo = pay ? pay.pay_no : genOrderNo('AP');
    // out_trade_no 用平台支付单号 pay_no（保证样片两阶段/重复发起各自唯一）
    const orderString = alipay.buildAppOrderString({ outTradeNo: payNo, amountFen, subject });

    if (pay) {
      db.prepare("UPDATE payments SET order_string=?, amount_fen=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(orderString, amountFen, pay.id);
    } else {
      try {
        db.prepare(`INSERT INTO payments
          (pay_no, order_no, biz_type, stage, amount_fen, status, channel, buyer_id, subject, order_string)
          VALUES (?,?,?,?,?, 'pending', 'alipay', ?, ?, ?)`).run(
          payNo, orderNo, bizType, stageKey, amountFen, req.userId, subject, orderString);
        pay = db.prepare('SELECT * FROM payments WHERE pay_no=?').get(payNo);
      } catch (insErr) {
        // 并发双击兜底：部分唯一索引 idx_payments_one_pending 拒绝第二条 pending，回查已存在的 pending 单复用，不向用户报 500
        if (!/UNIQUE|constraint/i.test(insErr.message || '')) throw insErr;
        pay = db.prepare("SELECT * FROM payments WHERE order_no=? AND stage=? AND status='pending' ORDER BY id DESC LIMIT 1")
          .get(orderNo, stageKey);
        if (!pay) throw insErr;
        // 复用单的 out_trade_no 必须以其 pay_no 为准，重新离线签名后落库
        const reusedString = alipay.buildAppOrderString({ outTradeNo: pay.pay_no, amountFen, subject });
        db.prepare("UPDATE payments SET order_string=?, amount_fen=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(reusedString, amountFen, pay.id);
        return res.json({
          configured: true, demo: false, payMode: 'alipay', status: 'pending',
          sandbox: alipay.status().sandbox,
          payNo: pay.pay_no, orderString: reusedString, amountFen, amountYuan: fenToYuan(amountFen),
          orderNo, bizType, stage: stageKey,
        });
      }
    }

    logger.info('alipay_create_ok', { payNo, orderNo, bizType, stage: stageKey, amountFen });
    return res.json({
      configured: true, demo: false, payMode: 'alipay', status: 'pending',
      sandbox: alipay.status().sandbox,
      payNo, orderString, amountFen, amountYuan: fenToYuan(amountFen), orderNo, bizType, stage: stageKey,
    });
  } catch (err) {
    if (err && err.code === 'ALIPAY_NOT_CONFIGURED') {
      return res.json({ configured: false, demo: true, payMode: 'demo', status: 'unconfigured', message: '支付宝支付未配置，当前为演示环境' });
    }
    logger.error('alipay_create_fail', { error: err.message });
    return res.status(500).json({ message: '创建支付失败：' + err.message });
  }
});

// ============ 2) 支付宝异步通知（公开，但必须 RSA2 验签 + 幂等） ============
// 支付宝以 application/x-www-form-urlencoded POST，app.js 全局 urlencoded 已解析为 req.body
router.post('/alipay/notify', (req, res) => {
  const ack = (ok) => res.type('text/plain').send(ok ? 'success' : 'fail');
  try {
    const body = req.body || {};

    // 未配置时一律不接受任何回调（防止伪造入账）
    if (!alipay.isConfigured()) {
      logger.warn('alipay_notify_but_unconfigured');
      return ack(false);
    }
    // ① RSA2 验签（不通过直接 fail）
    if (!alipay.verifyNotify(body)) {
      logger.warn('alipay_notify_badsign', { outTradeNo: body.out_trade_no });
      return ack(false);
    }
    // ② app_id 必须匹配
    if (!alipay.notifyAppIdMatch(body)) {
      logger.warn('alipay_notify_appid_mismatch', { appId: body.app_id });
      return ack(false);
    }
    // ③ 非成功状态（等待买家付款/交易关闭等）：应答 success 但不改状态
    if (!alipay.isSuccessTradeStatus(body.trade_status)) {
      return ack(true);
    }

    // out_trade_no = 平台支付单号 pay_no
    const pay = db.prepare('SELECT * FROM payments WHERE pay_no=?').get(body.out_trade_no);
    if (!pay) {
      // 可能已处理（幂等）：已 paid 也回 success，避免支付宝重复推送
      logger.warn('alipay_notify_pay_notfound', { outTradeNo: body.out_trade_no });
      return ack(false);
    }
    if (pay.status === 'paid') return ack(true);

    // ④ 金额必须与服务端支付单一致（元；数值比对兼容 99 与 99.00，缺失/NaN 一律拒绝），不一致拒绝
    if (!yuanEqual(body.total_amount, fenToYuan(pay.amount_fen))) {
      logger.warn('alipay_notify_amount_mismatch', { payNo: pay.pay_no, notifyAmount: body.total_amount, serverYuan: fenToYuan(pay.amount_fen) });
      return ack(false);
    }
    // ⑤ 验签通过且幂等才置已支付、推进业务单
    const changed = applyPaid(pay, body.trade_no, JSON.stringify(body));
    logger.info('alipay_notify_paid', { payNo: pay.pay_no, orderNo: pay.order_no, changed });
    return ack(true);
  } catch (err) {
    logger.error('alipay_notify_error', { error: err.message });
    return ack(false);
  }
});

// ============ 3) 查询支付状态（需登录，仅能查自己名下业务单） ============
router.get('/status/:orderNo', auth, async (req, res) => {
  try {
    const orderNo = req.params.orderNo;
    const rows = db.prepare('SELECT * FROM payments WHERE order_no=? ORDER BY id DESC').all(orderNo);
    if (!rows.length) return res.status(404).json({ message: '支付单不存在' });
    // 归属校验：任一业务单属于当前用户（或管理员）即可
    const owned = rows.some((p) => p.buyer_id === req.userId) || req.role === 'admin';
    if (!owned) return res.status(403).json({ message: '无权查看该支付单' });

    // 若配置齐全且仍 pending，主动查单一次并对账（网络失败不影响返回本地状态）
    if (alipay.isConfigured()) {
      for (const p of rows) {
        if (p.status !== 'pending') continue;
        try {
          const q = await alipay.queryTrade({ outTradeNo: p.pay_no });
          if (q && alipay.isSuccessTradeStatus(q.trade_status) && yuanEqual(q.total_amount, fenToYuan(p.amount_fen))) {
            applyPaid(p, q.trade_no, JSON.stringify({ source: 'trade.query', q }));
          }
        } catch (e) { /* 主动查单失败忽略，以下次回调/轮询为准 */ }
      }
    }
    const fresh = db.prepare('SELECT * FROM payments WHERE order_no=? ORDER BY id DESC').all(orderNo);
    return res.json({
      orderNo,
      payments: fresh.map((p) => ({
        payNo: p.pay_no, bizType: p.biz_type, stage: p.stage,
        amountFen: p.amount_fen, amountYuan: fenToYuan(p.amount_fen),
        status: p.status, paid: p.status === 'paid',
        hasTradeNo: Boolean(p.trade_no), paidAt: p.paid_at, createdAt: p.created_at,
      })),
    });
  } catch (err) {
    logger.error('pay_status_fail', { error: err.message });
    return res.status(500).json({ message: '查询支付状态失败' });
  }
});

// 导出内部纯函数供本地自验证脚本使用（不影响路由行为）
router._testing = { resolveServerOrder, markBusinessPaid, applyPaid, clientClaimedAmount, fenToYuan, yuanEqual, BIZ };

module.exports = router;
