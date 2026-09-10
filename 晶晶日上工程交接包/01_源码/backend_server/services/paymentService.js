// services/paymentService.js - 支付与分账服务（V9）
// 架构原则：资金不进入平台自有账户（杜绝"二清"风险）。
//
// 【二清风险警告】
// "二清"是指没有支付牌照的平台代收用户资金再结算给商户，属于违规行为。
// 央行明令禁止无证机构从事支付业务，违者可能面临罚款、停业整顿甚至刑事责任。
// 本平台必须通过持牌支付机构（微信电商收付通/支付宝直付通）完成分账：
//   - 用户付款 → 资金进入支付机构备付金账户（非平台账户）
//   - 支付机构根据分账指令直接结算给艺人二级商户账户
//   - 平台仅通过分账接口抽取服务费，资金全程不过平台自有账户
//
// 【生产环境接入步骤】
// 1. 注册微信支付商户号，申请开通"电商收付通"产品
//    https://pay.weixin.qq.com/wiki/doc/apiv3/wxpay/ecommerce/
// 2. 平台入驻为电商平台商户，获取mchid和API证书（apiclient_key.pem）
// 3. 每位艺人入驻时同步注册为二级商户（sub_mchid），提交身份证/银行卡信息
// 4. 配置环境变量：WX_APPID, WX_MCHID, WX_SERIAL_NO, WX_API_V3_KEY, WX_ECOMMERCE_ENABLED=true
// 5. JSAPI下单时传入sub_mchid，资金直接结算给二级商户
// 6. 支付成功后调用profit_sharing接口分账：艺人金额+平台服务费
// 7. 退款时调用分账回退接口
// 8. 支付宝同理：开通"直付通"产品，配置ALIPAY_*环境变量
//
// 【上线前检查清单】
// - [ ] 微信电商收付通商户号已开通
// - [ ] 支付宝直付通已开通
// - [ ] API证书已部署到certs/目录
// - [ ] 所有艺人已完成二级商户入驻
// - [ ] 分账比例在商户协议中明确
// - [ ] 退款分账回退流程已测试
// - [ ] 支付回调验签已实现
// - [ ] 未配置持牌支付机构前，禁止上线生产环境
const db = require('../db');
const config = require('../config');
const { genOrderNo, genTxNo } = require('../utils/settlement');
const logger = require('../utils/logger');

// ============ Provider 接口 ============
class PaymentProvider {
  async createPayment(order) { throw new Error('not implemented'); }
  async verifyCallback(headers, rawBody) { throw new Error('not implemented'); }
  async refund(paymentTxNo, amount, reason) { throw new Error('not implemented'); }
  // 分账：支付成功后，将资金从待分账账户分给各接收方
  async profitSharing(paymentTxNo, receivers) { throw new Error('not implemented'); }
}

// ============ Mock Provider（开发/测试） ============
class MockProvider extends PaymentProvider {
  async createPayment(order) {
    return {
      channelTxNo: 'MOCK' + Date.now(),
      payUrl: '',
      payParams: { mock: true, orderNo: order.orderNo, amount: order.amount },
    };
  }
  async verifyCallback() {
    // V10.1 Mock 回调不验签，仅允许开发/测试环境；生产环境一律拒绝
    if (config.env === 'production') {
      throw new Error('Mock 支付通道禁止在生产环境使用，必须接入持牌机构并完成回调验签');
    }
    return { valid: true, channelTxNo: null };
  }
  async refund() { return { channelRefundNo: 'MOCK_REFUND_' + Date.now(), status: 'success' }; }
  async profitSharing() { return { status: 'success', detail: [] }; }
}

// ============ 微信电商收付通 Provider（生产占位） ============
// 接入文档：https://pay.weixin.qq.com/wiki/doc/apiv3/wxpay/ecommerce/
class WechatEcommerceProvider extends PaymentProvider {
  async createPayment(order) {
    // TODO: 接入微信支付V3 电商收付通 JSAPI下单
    // 实现要点：
    // 1. POST https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi
    // 2. 请求参数：appid, mchid(平台商户号), sub_mchid(艺人二级商户号),
    //    description, out_trade_no(订单号), amount.total(分), payer.openid
    // 3. 关键：sub_mchid 传入艺人的二级商户号，资金直接结算给艺人
    // 4. 平台通过 profit_sharing 接口抽取服务费
    // 5. 需要APIv3密钥和商户证书进行请求签名
    // 6. 返回prepay_id给APP端，APP端调用微信SDK拉起支付
    throw new Error('微信电商收付通待接入。未接入持牌支付机构前禁止上线生产环境，否则构成"二清"违规。');
  }
  async verifyCallback(headers, rawBody) {
    // TODO: 验证微信回调解密（APIv3 AES-GCM）
    // 1. 验证Wechatpay-Signature签名（使用微信平台公钥）
    // 2. 验证Wechatpay-Timestamp时间戳（防重放，5分钟内）
    // 3. 使用APIv3密钥解密resource.ciphertext（AES-256-GCM）
    // 4. 解析解密后的JSON，获取out_trade_no和trade_state
    throw new Error('微信回调验签待实现');
  }
  async refund() {
    // TODO: 调用微信退款API POST /v3/ecommerce/refunds/apply
    // 需要指定sub_mchid和refund_amount
    throw new Error('微信退款待实现');
  }
  async profitSharing() {
    // TODO: 调用分账API POST /v3/ecommerce/profitsharing/orders
    // receivers: [{receiver: sub_mchid, amount: 艺人到账金额, description}]
    // 平台服务费通过分账接收方设置为平台商户号
    throw new Error('微信分账待实现');
  }
}

// ============ 支付宝直付通 Provider（生产占位） ============
// 接入文档：https://opendocs.alipay.com/open/02e7ir
class AlipayDirectProvider extends PaymentProvider {
  async createPayment(order) {
    // TODO: 接入支付宝直付通 trade.precreate + royalty_parameters 分账
    // 1. 调用 alipay.trade.precreate（扫码）或 alipay.trade.create（APP）
    // 2. royalty_parameters 指定分账接收方（艺人支付宝账户）和分账比例
    // 3. 平台收入通过 royalty_info 设置
    // 4. 需要应用私钥签名、支付宝公钥验签
    throw new Error('支付宝直付通待接入。未接入持牌支付机构前禁止上线生产环境。');
  }
  async verifyCallback() {
    // TODO: 验证支付宝异步通知签名（RSA2/SHA256）
    // 1. 验证sign参数（使用支付宝公钥）
    // 2. 验证app_id、out_trade_no、total_amount
    // 3. trade_status=TRADE_SUCCESS 表示支付成功
    throw new Error('支付宝回调验签待实现');
  }
  async refund() {
    // TODO: 调用 alipay.trade.refund
    throw new Error('支付宝退款待实现');
  }
  async profitSharing() {
    // TODO: 调用 alipay.trade.order.settle 分账
    throw new Error('支付宝分账待实现');
  }
}

// ============ Apple IAP Provider（iOS 数字商品，资金由 Apple 代收，无平台二清） ============
class AppleIapProvider extends PaymentProvider {
  async createPayment() {
    // IAP 由客户端向 StoreKit 下单，服务端只做票据校验，不在这里创建支付
    throw new Error('Apple IAP 请走 /api/payment/apple/verify 票据校验');
  }
  async verifyCallback() { throw new Error('Apple IAP 使用 verifyReceipt，不走通用回调'); }
  async refund() { throw new Error('Apple IAP 退款在 App Store Connect 处理，服务端据退款通知核销'); }
  // Apple 已在收款环节完成分成，平台侧无需再次分账指令
  async profitSharing() { return { status: 'success', via: 'apple_iap_noop' }; }
}

function getProvider(channel) {
  if (channel === 'wechat') {
    return config.wxPay.ecommerce.enabled ? new WechatEcommerceProvider() : new MockProvider();
  }
  if (channel === 'alipay') {
    return config.alipay.directPay.enabled ? new AlipayDirectProvider() : new MockProvider();
  }
  if (channel === 'apple_iap') return new AppleIapProvider();
  // V10.1 生产环境兜底：未配置持牌支付机构时，禁止静默回落到 Mock（防止伪造回调/二清）
  if (config.env === 'production') {
    throw new Error('生产环境未配置持牌支付机构（微信电商收付通/支付宝直付通），禁止使用 Mock 支付通道');
  }
  return new MockProvider();
}

// ============ 统一支付服务 ============
const paymentService = {
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
      // 触发分账（Mock环境直接成功；生产环境调用持牌机构分账接口）
      const provider = getProvider(txn.channel);
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
      const provider = getProvider(txn.channel);
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

module.exports = paymentService;
