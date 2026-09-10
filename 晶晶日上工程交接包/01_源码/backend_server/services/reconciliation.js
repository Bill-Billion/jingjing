// services/reconciliation.js - 资金可对账（不依赖真实支付渠道，先把本地四本账做平）
//
// 守恒恒等式（单位：分，整数）：
//   实收 received = 已退 refunded + 待结/已结给艺人/MCN(net) + 平台收入(platform_fee)
//                    + AI成本(ai_cost) + 税费(tax_amount) + 渠道费(channelFee，未单列，按差额反推)
// 订单内部：amount = platform_fee + ai_cost + tax_amount + net_amount + channelFee(=floor(amount*0.6%))
//
// 四本账：
//   orderBook   业务订单应收（video/endorsement/claims，sample 走分期 payments 另计）
//   payBook     支付实收（payment_transactions(success) + payments(paid)，按 order_no 汇总）
//   refundBook  已退（refunds(success)），且任一单累计退款不得超过实收
//   settleBook  应结给艺人/MCN（net_amount 合计；待结 pending + 已结 settled 之和）
// 只核对、只落表/告警，绝不改业务数据、绝不自动补扣。
const config = require('../config');
const logger = require('../utils/logger');

function n(v) { return Number.isFinite(Number(v)) ? Number(v) : 0; }

// 订单内部费用结构守恒：返回是否平、反推渠道费、差额
function feeSplitOk(o) {
  const amount = n(o.amount);
  const platform = n(o.platform_fee);
  const ai = n(o.ai_cost);
  const tax = n(o.tax_amount);
  const net = n(o.net_amount);
  const impliedChannel = amount - platform - ai - tax - net; // 未单列的渠道费(+可能的取整)
  const expectChannel = Math.floor(amount * config.commission.withdrawal);
  const splitSum = platform + ai + tax + net + impliedChannel;
  return {
    ok: splitSum === amount && impliedChannel >= 0 && impliedChannel <= expectChannel + 1,
    impliedChannel,
    expectChannel,
    diff: splitSum - amount,
  };
}

// 汇总某订单的实收/已退（两张支付表合并）
function moneyForOrder(db, orderNo) {
  // 实收：钱一旦成功收进来就算，即使后来部分/全额退款（退款另计 refundBook），故含 refunded/partially_refunded
  const legacy = db.prepare(
    "SELECT COALESCE(SUM(amount),0) s FROM payment_transactions WHERE order_no=? AND status IN ('success','partially_refunded','refunded')"
  ).get(orderNo).s;
  const v124 = db.prepare(
    "SELECT COALESCE(SUM(amount_fen),0) s FROM payments WHERE order_no=? AND status IN ('paid','refunded')"
  ).get(orderNo).s;
  const refunded = db.prepare(
    "SELECT COALESCE(SUM(amount),0) s FROM refunds WHERE order_no=? AND status='success'"
  ).get(orderNo).s;
  return { received: n(legacy) + n(v124), legacy: n(legacy), v124: n(v124), refunded: n(refunded) };
}

// 业务订单（金额型）统一投影
function moneyOrders(db) {
  const out = [];
  const video = db.prepare("SELECT order_no,amount,platform_fee,ai_cost,tax_amount,net_amount,status,'video' AS kind FROM video_orders WHERE order_no IS NOT NULL").all();
  const endo = db.prepare("SELECT order_no,amount,platform_fee,ai_cost,tax_amount,net_amount,status,'endorsement' AS kind FROM endorsement_orders WHERE order_no IS NOT NULL").all();
  for (const o of video.concat(endo)) out.push(o);
  // 定制剧席位：平台服务费 service_fee，其余为应结
  const claims = db.prepare("SELECT order_no,amount,service_fee,status FROM claims WHERE order_no IS NOT NULL").all();
  for (const c of claims) {
    out.push({
      order_no: c.order_no, amount: n(c.amount), platform_fee: n(c.service_fee), ai_cost: 0,
      tax_amount: 0, net_amount: n(c.amount) - n(c.service_fee), status: c.status, kind: 'claim',
    });
  }
  return out;
}

const PAID_LIKE = {
  video: ['paid', 'delivering', 'delivered', 'completed', 'dispute', 'refunded'],
  endorsement: ['paid', 'in_progress', 'delivered', 'completed', 'cancelled', 'refunded'],
  claim: ['paid', 'signed', 'refunded'],
};

/**
 * 全量对账。返回 summary + diffs（不抛错，差异全部列出）。
 */
function runReconciliation(db) {
  const summary = { orderBook: 0, payBook: 0, refundBook: 0, settleBook: 0, platformBook: 0, feeTaxBook: 0, diffCount: 0 };
  const diffs = [];
  const perOrder = [];
  const addDiff = (type, orderNo, detail) => { summary.diffCount++; diffs.push({ type, orderNo, detail }); };

  for (const o of moneyOrders(db)) {
    if (!o.order_no) continue;
    const money = moneyForOrder(db, o.order_no);
    const fee = feeSplitOk(o);
    const paidLike = PAID_LIKE[o.kind].includes(o.status);

    // 1) 订单内部费用结构守恒（所有单都查）
    if (!fee.ok) addDiff('fee_split_mismatch', o.order_no, { amount: o.amount, impliedChannel: fee.impliedChannel, expectChannel: fee.expectChannel, diff: fee.diff });

    if (paidLike && n(o.amount) > 0) {
      summary.orderBook += n(o.amount);
      summary.settleBook += n(o.net_amount);
      summary.platformBook += n(o.platform_fee);
      summary.feeTaxBook += n(o.ai_cost) + n(o.tax_amount) + fee.impliedChannel;

      // 2) 实收 vs 订单应收
      if (money.received === 0) {
        addDiff('paid_without_payment', o.order_no, { status: o.status, amount: o.amount });
      } else if (money.received !== n(o.amount)) {
        addDiff('payment_order_mismatch', o.order_no, { received: money.received, amount: o.amount });
      }
      // 3) 累计退款不得超过实收
      if (money.refunded > money.received) {
        addDiff('refund_exceed_received', o.order_no, { refunded: money.refunded, received: money.received });
      }
      // 4) 守恒：实收 = 已退 + 剩余分配。退款等比释放下单时的毛分配（平台/AI/税/渠道/应结），
      //    全退时剩余分配=0、已退=实收；部分退时按比例释放，四账恒平。
      const allocated = n(o.platform_fee) + n(o.ai_cost) + n(o.tax_amount) + n(o.net_amount) + fee.impliedChannel;
      const remainRatio = money.received > 0 ? (money.received - money.refunded) / money.received : 0;
      const outstanding = Math.round(allocated * remainRatio);
      const rhs = money.refunded + outstanding;
      if (money.received > 0 && rhs !== money.received) {
        addDiff('conservation_break', o.order_no, { received: money.received, refunded: money.refunded, allocated, outstanding, gap: money.received - rhs });
      }
      summary.payBook += money.received;
      summary.refundBook += money.refunded;
    }
    perOrder.push({ orderNo: o.order_no, kind: o.kind, status: o.status, amount: n(o.amount), ...money, feeOk: fee.ok });
  }

  // 5) 支付侧孤儿：有成功支付但找不到业务订单
  const allOrderNos = new Set(perOrder.map((p) => p.orderNo));
  const orphanPay = db.prepare("SELECT order_no, COALESCE(SUM(amount),0) s FROM payment_transactions WHERE status IN ('success','partially_refunded','refunded') GROUP BY order_no").all();
  for (const p of orphanPay) {
    if (!allOrderNos.has(p.order_no)) addDiff('payment_without_order', p.order_no, { legacyAmount: n(p.s) });
  }

  // 6) 钱包余额非负（pending/frozen/balance 不允许为负）
  const negWallet = db.prepare('SELECT user_id,balance,frozen,pending FROM wallets WHERE balance<0 OR frozen<0 OR pending<0').all();
  for (const w of negWallet) addDiff('negative_wallet', 'user:' + w.user_id, w);

  return { summary, diffs, perOrder, balanced: summary.diffCount === 0 };
}

// 落一次对账运行记录（结构化，供后台/巡检）
function persistRun(db, result, scope = 'daily') {
  const runDate = new Date().toISOString().slice(0, 10);
  const s = result.summary;
  const info = db.prepare(`INSERT INTO reconciliation_runs
    (run_date,scope,order_book,pay_book,refund_book,settle_book,platform_book,fee_tax_book,diff_count,status,detail,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    runDate, scope, s.orderBook, s.payBook, s.refundBook, s.settleBook, s.platformBook, s.feeTaxBook,
    s.diffCount, result.balanced ? 'balanced' : 'diff', JSON.stringify(result.diffs).slice(0, 60000), Date.now()
  );
  return info.lastInsertRowid;
}

// 每日/手动执行一次：对账→落表→结构化日志→（配置 webhook 才外发，否则只落日志）
async function runAndReport(db, { scope = 'daily' } = {}) {
  const result = runReconciliation(db);
  const id = persistRun(db, result, scope);
  logger.info('reconciliation_done', { id, scope, ...result.summary, balanced: result.balanced });
  if (!result.balanced) {
    logger.error('reconciliation_diff', { id, diffCount: result.summary.diffCount, sample: result.diffs.slice(0, 10) });
    try {
      const alert = require('./alert');
      await alert.emit('reconciliation_diff', { id, scope, summary: result.summary, diffs: result.diffs.slice(0, 20) });
    } catch (e) { logger.warn('reconciliation_alert_fail', { error: e.message }); }
  }
  return { id, ...result };
}

module.exports = { feeSplitOk, moneyForOrder, moneyOrders, runReconciliation, persistRun, runAndReport };
