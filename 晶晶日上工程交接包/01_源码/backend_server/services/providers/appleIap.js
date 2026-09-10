// services/providers/appleIap.js - Apple 应用内购买（IAP）服务端票据校验
// iOS 数字商品（祝福视频/数字人/定制剧）依 App Store 3.1.1 必须走 IAP，不能用微信/支付宝。
// 服务端必须用票据向 Apple 校验，禁止只信客户端回调。缺共享密钥即禁用，绝不伪造成功。
const config = require('../../config');
const logger = require('../../utils/logger');

const PROD_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

function sharedSecret() { return process.env.APPLE_IAP_SHARED_SECRET || ''; }
function bundleId() { return process.env.APPLE_BUNDLE_ID || ''; }

async function postVerify(url, receiptData) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'receipt-data': receiptData, password: sharedSecret(), 'exclude-old-transactions': true }),
      signal: ctrl.signal,
    });
    return await r.json();
  } finally { clearTimeout(timer); }
}

/**
 * 校验 App Store 收据。
 * @returns {Promise<{transactionId:string,productId:string,bundleId:string,environment:string,purchaseDateMs:number,raw:object}>}
 * status: 0=成功；21007=这是沙盒票据（自动回退沙盒重放）
 */
async function verifyReceipt(receiptData) {
  if (!receiptData || typeof receiptData !== 'string') throw Object.assign(new Error('缺少 receiptData'), { status: 400 });
  if (!sharedSecret()) {
    throw Object.assign(new Error('Apple IAP 未配置 APPLE_IAP_SHARED_SECRET，禁止放行'), { status: 503 });
  }
  let j = await postVerify(PROD_URL, receiptData);
  if (j.status === 21007) j = await postVerify(SANDBOX_URL, receiptData); // 沙盒票据自动回退
  if (j.status !== 0 || !j.receipt) throw Object.assign(new Error('Apple 票据校验失败 status=' + j.status), { status: 402 });

  const receipt = j.receipt;
  const expectBundle = bundleId();
  if (expectBundle && receipt.bundle_id && receipt.bundle_id !== expectBundle) {
    throw Object.assign(new Error('BundleId 不匹配'), { status: 402 });
  }
  // 取最近一笔内购
  const ins = (j.latest_receipt_info || receipt.in_app || []).slice().sort((a, b) => Number(b.purchase_date_ms) - Number(a.purchase_date_ms));
  const last = ins[0];
  if (!last) throw Object.assign(new Error('收据中无内购记录'), { status: 402 });
  logger.info('apple_iap_verified', { transactionId: last.transaction_id, productId: last.product_id, environment: j.environment });
  return {
    transactionId: String(last.transaction_id),
    productId: last.product_id,
    bundleId: receipt.bundle_id || '',
    environment: j.environment || 'Production',
    purchaseDateMs: Number(last.purchase_date_ms),
    raw: { status: j.status },
  };
}

function ready() { return !!sharedSecret(); }

module.exports = { verifyReceipt, ready, PROD_URL, SANDBOX_URL };
