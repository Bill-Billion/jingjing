// utils/consent.js - V4.0 用户同意管理
// 依据：PIPL单独同意要求、消保法数字商品退货确认、116号令平台规则
const db = require('../db');

const CONSENT_VERSIONS = {
  privacy: { version: '2.0', required: true },
  biometric: { version: '2.0', required: true },      // 人脸数据单独同意
  copyright: { version: '1.0', required: true },       // 版权归属
  digital_goods_return: { version: '1.0', required: true }, // 数字商品不退货
  minor_guardian: { version: '1.0', required: false }, // 监护人同意
  algorithm_personalization: { version: '1.0', required: false }, // 个性化推荐
  platform_rules: { version: '1.0', required: true },  // 平台规则
};

/**
 * 记录用户同意
 */
function recordConsent(userId, consentType, consented = true, extra = {}) {
  const cv = CONSENT_VERSIONS[consentType];
  if (!cv) throw new Error(`Unknown consent type: ${consentType}`);

  const { orderNo, ip, device, consentText } = extra;

  db.prepare(`
    INSERT INTO user_consents
      (user_id, consent_type, consent_version, consented, consent_text, order_no, ip, device)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, consentType, cv.version, consented ? 1 : 0,
    consentText || null, orderNo || null, ip || null, device || null
  );
}

/**
 * 检查用户是否已同意某项
 */
function hasConsent(userId, consentType) {
  const row = db.prepare(`
    SELECT consented FROM user_consents
    WHERE user_id = ? AND consent_type = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(userId, consentType);
  return row && row.consented === 1;
}

/**
 * 检查订单是否已确认数字商品不退货
 */
function hasDigitalGoodsConsent(userId, orderNo) {
  const row = db.prepare(`
    SELECT consented FROM user_consents
    WHERE user_id = ? AND consent_type = 'digital_goods_return' AND order_no = ?
  `).get(userId, orderNo);
  return row && row.consented === 1;
}

module.exports = {
  CONSENT_VERSIONS,
  recordConsent,
  hasConsent,
  hasDigitalGoodsConsent,
};
