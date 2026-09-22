// Legacy finance routines retained for isolated regression checks; live channels are disabled.
const legacyDb = require('../db');
const {genTxNo} = require('../utils/settlement');
const logger = require('../utils/logger');
const {paymentUnavailable} = require('../src/modules/legacy-safety');

function createPaymentService({database=legacyDb, providerFor=()=>{throw paymentUnavailable();}}={}) {
  const db=database, getProvider=providerFor;
  return {
  /**
   * 创建支付订单
   * @param {object} params: { orderNo, orderType, amount, channel, subject, buyerId, subMchId }
   */
  async createPayment(params) {
    const { orderNo, orderType, amount, channel = 'mock', subject, buyerId, subMchId } = params;
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('金额必须为正整数（分）');

    const txNo = genTxNo();
    const provider = getProvider(channel);
    const result = await provider.createPayment({
      orderNo, amount, subject, subMchId,
      body: orderType,
    });

    db.prepare(`INSERT INTO payment_transactions
      (tx_no, order_no, order_type, channel, channel_txn_no, amount, status, pay_url)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      txNo, orderNo, orderType, channel,
      result.channelTxNo || '', amount, 'pending', result.payUrl || ''
    );

    logger.info('payment_created', { txNo, orderNo, amount, channel });
    return { txNo, ...result };
  },

  /**
   * 处理支付回调（幂等）
   */
  async handleCallback(channel, headers, rawBody) {
    const provider = getProvider(channel);
    const { valid, channelTxNo, amount, outTradeNo } = await provider.verifyCallback(headers, rawBody);
    if (!valid) throw new Error('回调验签失败');

    // 幂等：以 channel_txn_no 去重
    const existing = db.prepare('SELECT * FROM payment_transactions WHERE channel_txn_no = ? AND status = ?')
      .get(channelTxNo, 'success');
    if (existing) return { duplicated: true, txNo: existing.tx_no };

    const txn = db.prepare('SELECT * FROM payment_transactions WHERE channel_txn_no = ? OR tx_no = ?')
      .get(channelTxNo, outTradeNo);
    if (!txn) throw new Error('支付流水不存在');

    // 原子更新状态
    const r = db.prepare(`UPDATE payment_transactions
      SET status = 'success', callback_raw = ?, callback_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'`).run(rawBody.slice(0, 4000), txn.id);
    if (r.changes === 0) return { duplicated: true, txNo: txn.tx_no };

    // 触发业务回调
    await this.onPaymentSuccess(txn);
    return { duplicated: false, txNo: txn.tx_no };
  },

  /**
   * 支付成功后的业务处理（分账 + 订单状态推进）
   */
  async onPaymentSuccess(txn) {
    const provider = getProvider(txn.channel); // Fail before changing any business row.
    const { idempotent } = require('../utils/idempotent');
    await idempotent(`pay_success:${txn.tx_no}`, async () => {
      switch (txn.order_type) {
        case 'video':
          await this._onVideoPaid(txn);
          break;
        case 'endorsement':
          await this._onEndorsementPaid(txn);
          break;
        case 'customization':
        case 'recruiting': // 兼容历史订单类型，新单一律使用 customization
          await this._onCustomizationPaid(txn);
          break;
        case 'sample':
          await this._onSamplePaid(txn);
          break;
      }
      // 只有明确注入的测试/受信调用方可执行；默认服务在任何写入前已拒绝。
      await provider.profitSharing(txn.channel_txn_no, []);
      return { ok: true };
    });
  },

  async _onVideoPaid(txn) {
    const order = db.prepare('SELECT * FROM video_orders WHERE order_no = ?').get(txn.order_no);
    if (!order || order.status !== 'pending') return;
    const now = new Date().toISOString();
    db.prepare('UPDATE video_orders SET status = ?, pay_time = ? WHERE id = ?')
      .run('paid', now, order.id);
    // 待结算金额计入钱包pending（担保中）
    db.prepare('UPDATE wallets SET pending = pending + ? WHERE user_id = ?')
      .run(order.net_amount, (db.prepare('SELECT user_id FROM humans WHERE id = ?').get(order.talent_id) || {}).user_id);
  },

  async _onEndorsementPaid(txn) {
    db.prepare('UPDATE endorsement_orders SET status = ?, pay_time = CURRENT_TIMESTAMP WHERE order_no = ?')
      .run('paid', txn.order_no);
  },

  // 定制剧席位支付成功（V10.1 去投资化命名；保留旧方法名别名兼容）
  async _onCustomizationPaid(txn) {
    const inv = db.prepare('SELECT * FROM claims WHERE order_no = ?').get(txn.order_no);
    if (!inv) return;
    db.prepare('UPDATE claims SET status = ?, payment_tx_no = ? WHERE id = ?')
      .run('paid', txn.tx_no, inv.id);
    // 已定席进度与人数原子更新（防超卖由认领时行锁保证）；此处为"已定席制作费"，非募资
    db.prepare('UPDATE projects SET raised_amount = raised_amount + ?, client_count = client_count + 1 WHERE id = ?')
      .run(inv.amount, inv.project_id);
  },
  async _onCrowdfundingPaid(txn) { return this._onCustomizationPaid(txn); },

  async _onSamplePaid(txn) {
    db.prepare('UPDATE sample_orders SET status = ?, pay_time = CURRENT_TIMESTAMP WHERE order_no = ?')
      .run('producing', txn.order_no);
  },

  /**
   * 退款（严格状态机，工程化整改）
   * 订单/支付/退款/结算状态分离：先建 processing 退款单 → 调渠道 → 成功才置 success 并回写支付，
   * 渠道失败置 rejected 并抛错，绝不"插退款单即已退款"。支持全退/部分退、重复请求幂等。
   * @param {string} orderNo
   * @param {number} amount 退款金额（分），正整数
   * @param {string} reason
   * @param {number} [operatorId]
   * @param {{idemKey?:string}} [opts] idemKey 用于回调/重试去重；缺省按 支付单+金额 生成
   */
  async refund(orderNo, amount, reason, operatorId, opts = {}) {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('退款金额必须为正整数（分）');
    // 已部分退款的支付单状态为 partially_refunded，仍可继续退；全额退过则无 success 之外可退
    const txn = db.prepare(
      "SELECT * FROM payment_transactions WHERE order_no = ? AND status IN ('success','partially_refunded') ORDER BY id DESC LIMIT 1"
    ).get(orderNo);
    if (!txn) throw new Error('无成功支付记录，无法退款');
    const provider = getProvider(txn.channel); // No refund row or balance mutation when the channel is unavailable.

    // 累计已退优先用支付单冗余列，缺省回退按退款单汇总
    let already = Number.isFinite(Number(txn.refunded_amount)) ? Number(txn.refunded_amount) : 0;
    if (!('refunded_amount' in txn)) {
      already = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM refunds WHERE order_no=? AND status='success'").get(orderNo).s;
    }
    if (already + amount > txn.amount) {
      throw new Error('累计退款金额超过支付金额，存在超额退款风险');
    }
    const kind = already + amount === txn.amount ? 'full' : 'partial';
    const idemKey = opts.idemKey || `refund:${txn.tx_no}:${amount}:${already}`;

    // 幂等：同一请求/回调重复到达，直接返回既有结果，不重复出款
    const existed = db.prepare('SELECT * FROM refunds WHERE idem_key = ?').get(idemKey);
    if (existed) {
      if (existed.status === 'success') return { refundNo: existed.refund_no, duplicated: true, kind: existed.refund_kind };
      if (existed.status === 'processing') throw new Error('该退款正在渠道处理中，请勿重复提交');
    }

    const { genRefundNo } = require('../utils/settlement');
    const refundNo = genRefundNo();
    db.prepare(`INSERT INTO refunds
      (refund_no, order_no, order_type, payment_tx_no, amount, reason, status, refund_kind, operator_id, idem_key)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      refundNo, orderNo, txn.order_type, txn.tx_no, amount, reason, 'processing', kind, operatorId, idemKey
    );

    let result;
    try {
      result = await provider.refund(txn.channel_txn_no, amount, reason);
    } catch (e) {
      // 渠道失败：退款单置 rejected（不假退），支付单维持原态，告警转人工
      db.prepare("UPDATE refunds SET status='rejected', channel_status=? WHERE refund_no=?")
        .run('error:' + String(e.message).slice(0, 200), refundNo);
      try { require('./alert').emit('payment_refund_failed', { orderNo, amount, error: e.message }, { severity: 'error' }); } catch (_) {}
      throw e;
    }

    const newRefunded = already + amount;
    const payStatus = newRefunded >= txn.amount ? 'refunded' : 'partially_refunded';
    const tx = db.transaction(() => {
      db.prepare(`UPDATE refunds SET status='success', channel_refund_no=?, channel_status=?, processed_at=CURRENT_TIMESTAMP
        WHERE refund_no=?`).run(result.channelRefundNo || null, result.status || 'success', refundNo);
      db.prepare('UPDATE payment_transactions SET refunded_amount=?, status=? WHERE id=?')
        .run(newRefunded, payStatus, txn.id);
    });
    tx();
    logger.info('refund_success', { orderNo, refundNo, amount, kind, newRefunded, payStatus });
    return { refundNo, kind, ...result };
  },
};

}
// App routes use the closed default. No NODE_ENV, secret or provider flag enables a mock.
module.exports = createPaymentService();
// Trusted composition seam for isolated tests; never selected by an HTTP request or environment flag.
module.exports.createPaymentService = createPaymentService;
