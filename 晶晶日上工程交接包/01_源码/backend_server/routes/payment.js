// routes/payment.js - 支付与回调（V2）
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const paymentService = require('../services/paymentService');
const logger = require('../utils/logger');
const appleIap = require('../services/providers/appleIap');
const router = express.Router();
const {rejectLegacyPayment,rejectLegacyCallback,assessLegacyPayment} = require('../src/modules/legacy-safety');

// 发起支付
router.post('/pay', auth, rejectLegacyPayment, async (req, res) => {
  const { orderNo, orderType, channel = 'wechat' } = req.body;
  if (!orderNo || !orderType) return res.status(400).json({ message: '参数不完整' });

  const tableMap = {
    video: { table: 'video_orders', userField: 'user_id', amountField: 'amount' },
    endorsement: { table: 'endorsement_orders', userField: 'user_id', amountField: 'amount' },
    customization: { table: 'claims', userField: 'user_id', amountField: 'amount' },
    sample: { table: 'sample_orders', userField: 'user_id', amountField: 'amount' },
  };
  const cfg = tableMap[orderType];
  if (!cfg) return res.status(400).json({ message: '不支持的订单类型' });

  const order = db.prepare(`SELECT * FROM ${cfg.table} WHERE order_no = ? AND ${cfg.userField} = ?`)
    .get(orderNo, req.userId);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.status !== 'pending') return res.status(400).json({ message: '订单状态异常' });

  try {
    const result = await paymentService.createPayment({
      orderNo, orderType, amount: order[cfg.amountField],
      channel, subject: `晶晶日上-${orderType}`, buyerId: req.userId,
    });
    res.json({ txNo: result.txNo, payParams: result.payParams, payUrl: result.payUrl });
  } catch (err) {
    logger.error('pay_failed', { orderNo, error: err.message });
    res.status(500).json({ message: '支付下单失败：' + err.message });
  }
});

// 微信支付回调
router.post('/wx/notify', rejectLegacyCallback, express.raw({ type: '*/*' }), async (req, res) => {
  try {
    await paymentService.handleCallback('wechat', req.headers, req.body.toString());
    res.json({ code: 'SUCCESS', message: '成功' });
  } catch (err) {
    logger.error('wx_notify_error', { error: err.message });
    res.status(400).json({ code: 'FAIL', message: err.message });
  }
});

// 支付宝回调
router.post('/alipay/notify', rejectLegacyCallback, express.urlencoded({ extended: false }), async (req, res) => {
  try {
    await paymentService.handleCallback('alipay', req.headers, JSON.stringify(req.body));
    res.send('success');
  } catch (err) {
    logger.error('alipay_notify_error', { error: err.message });
    res.send('fail');
  }
});

// 查询支付状态
router.get('/status/:txNo', auth, (req, res) => {
  // Match both the business type and its owning user. No generic admin-role bypass.
  const txn = db.prepare(`SELECT t.tx_no,t.order_no,t.order_type,t.amount,t.status,t.created_at
    FROM payment_transactions t WHERE t.tx_no=? AND (
      (t.order_type='video' AND EXISTS(SELECT 1 FROM video_orders o WHERE o.order_no=t.order_no AND o.user_id=?)) OR
      (t.order_type='endorsement' AND EXISTS(SELECT 1 FROM endorsement_orders o WHERE o.order_no=t.order_no AND o.user_id=?)) OR
      (t.order_type IN ('customization','recruiting') AND EXISTS(SELECT 1 FROM claims o WHERE o.order_no=t.order_no AND o.user_id=?)) OR
      (t.order_type='sample' AND EXISTS(SELECT 1 FROM sample_orders o WHERE o.order_no=t.order_no AND o.user_id=?))
    )`).get(req.params.txNo,req.userId,req.userId,req.userId,req.userId);
  if (!txn) return res.status(404).json({ message: '流水不存在' });
  res.json({ ...txn, ...assessLegacyPayment(txn.status), amount: txn.amount / 100 });
});

// iOS 应用内购买：客户端 StoreKit 支付后把收据交服务端校验（幂等，按 Apple transactionId 去重）
router.post('/apple/verify', auth, rejectLegacyPayment, async (req, res) => {
  const { orderNo, orderType, receiptData, productId } = req.body || {};
  if (!orderNo || !orderType || !receiptData) return res.status(400).json({ message: '参数不完整' });
  const tableMap = {
    video: { table: 'video_orders', userField: 'user_id', amountField: 'amount' },
    endorsement: { table: 'endorsement_orders', userField: 'user_id', amountField: 'amount' },
    customization: { table: 'claims', userField: 'user_id', amountField: 'amount' },
    sample: { table: 'sample_orders', userField: 'user_id', amountField: 'amount' },
  };
  const cfg = tableMap[orderType];
  if (!cfg) return res.status(400).json({ message: '不支持的订单类型' });
  const order = db.prepare(`SELECT * FROM ${cfg.table} WHERE order_no=? AND ${cfg.userField}=?`).get(orderNo, req.userId);
  if (!order) return res.status(404).json({ message: '订单不存在' });

  let v;
  try { v = await appleIap.verifyReceipt(receiptData); }
  catch (e) { logger.error('apple_iap_verify_fail', { orderNo, error: e.message }); return res.status(e.status || 502).json({ message: e.message }); }
  if (productId && v.productId !== productId) return res.status(402).json({ message: '商品不匹配' });

  // 幂等：同一 Apple 交易号已成功则直接返回，不重复推进订单
  const existed = db.prepare("SELECT * FROM payment_transactions WHERE channel_txn_no=? AND status IN ('success','partially_refunded','refunded')").get(v.transactionId);
  if (existed) return res.json({ duplicated: true, txNo: existed.tx_no });

  const { genTxNo } = require('../utils/settlement');
  const txNo = genTxNo();
  db.prepare(`INSERT INTO payment_transactions (tx_no,order_no,order_type,channel,channel_txn_no,amount,status,callback_raw,callback_at)
    VALUES (?,?,?, 'apple_iap',?,?, 'success',?,CURRENT_TIMESTAMP)`)
    .run(txNo, orderNo, orderType, v.transactionId, order[cfg.amountField], JSON.stringify({ environment: v.environment, productId: v.productId }).slice(0, 1000));
  const txn = db.prepare('SELECT * FROM payment_transactions WHERE tx_no=?').get(txNo);
  try {
    await paymentService.onPaymentSuccess(txn);
  } catch (e) {
    logger.error('apple_iap_onpaid_fail', { orderNo, error: e.message });
    return res.status(500).json({ message: '支付已校验但订单推进失败: ' + e.message });
  }
  res.json({ txNo, environment: v.environment, duplicated: false });
});

module.exports = router;
