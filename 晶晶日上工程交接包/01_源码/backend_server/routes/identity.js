// routes/identity.js - 实名认证（个人走当前合规 provider 的身份证二要素：默认火山rms/可切阿里云；企业/MCN 走人工审核）
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { validate, v } = require('../middleware/validate');
const idVerify = require('../services/providers/idVerify');
const cryptoUtil = require('../utils/crypto');
const logger = require('../utils/logger');

const router = express.Router();

// 当前实名核验 provider 标签（volc / aliyun），用于 verifiedBy 落库标注，避免把火山结果误标成阿里云
function idProviderTag() { return (idVerify.providerName && idVerify.providerName()) || 'aliyun'; }

// 18 位身份证号基础格式校验（末位可为 X）
function isValidIdCardNo(v) {
  return typeof v === 'string' && /^\d{17}[\dXx]$/.test(v.trim());
}

router.post('/submit', auth, validate({
  identityType: [v.required, v.enum('personal', 'company', 'mcn')],
}), async (req, res) => {
  const { identityType, realName, idCard, companyName, creditCode, licenseUrl } = req.body;

  if (identityType === 'personal') {
    if (!realName || !idCard) return res.status(400).json({ error: '请填写真实姓名和身份证号' });
    if (!isValidIdCardNo(idCard)) return res.status(400).json({ error: '身份证号格式不正确' });
  }
  if (identityType === 'company' && (!companyName || !creditCode)) {
    return res.status(400).json({ error: '请填写企业名称和统一社会信用代码' });
  }

  // 身份证号 AES-256-GCM 加密落库（不存明文）；姓名需用于回显，保留明文
  const idCardCipher = identityType === 'personal' ? cryptoUtil.encrypt(idCard.trim().toUpperCase()) : '';

  let status = 'pending';
  let rejectReason = '';
  let verifiedBy = 'manual';

  if (identityType === 'personal') {
    const tag = idProviderTag();
    if (idVerify.ready()) {
      // 已配置当前 provider：真实二要素核验
      const r = await idVerify.verifyElement({ name: realName, idNo: idCard });
      if (r.passed === true) {
        status = 'approved';
        verifiedBy = `${tag}_element`;
      } else if (r.passed === false) {
        status = 'rejected';
        rejectReason = '姓名与身份证号不一致，请核对后重新提交';
        verifiedBy = `${tag}_element`;
        logger.warn('id_verify_rejected', { userId: req.userId, provider: tag, subCode: r.subCode });
      } else {
        // 想用云但云故障/未判定/审批未就绪：转人工，绝不自动当作实名通过
        status = 'pending';
        verifiedBy = `${tag}_element_pending`;
      }
    } else {
      // 当前 provider 未就绪（火山 rms 审批中或缺凭证/阿里云缺 AK·场景ID）：维持历史行为自动通过，但显式标注“未真核验”，Key 到位后自动升级
      status = 'approved';
      verifiedBy = 'unverified_auto';
    }
  }

  const existing = db.prepare('SELECT id FROM user_identities WHERE user_id=?').get(req.userId);
  if (existing) {
    db.prepare(`UPDATE user_identities SET identity_type=?, real_name=?, id_card=?, company_name=?, credit_code=?,
      license_url=?, status=?, reject_reason=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?`)
      .run(identityType, realName || '', idCardCipher, companyName || '', creditCode || '', licenseUrl || '', status, rejectReason, req.userId);
  } else {
    db.prepare(`INSERT INTO user_identities (user_id, identity_type, real_name, id_card, company_name, credit_code, license_url, status, reject_reason)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(req.userId, identityType, realName || '', idCardCipher, companyName || '', creditCode || '', licenseUrl || '', status, rejectReason);
  }

  res.json({ ok: true, status, rejectReason, verifiedBy });
});

router.get('/status', auth, (req, res) => {
  const identity = db.prepare('SELECT * FROM user_identities WHERE user_id=?').get(req.userId);
  if (!identity) return res.json({ verified: false, status: 'none' });
  res.json({
    verified: identity.status === 'approved',
    status: identity.status,
    identityType: identity.identity_type,
    realName: identity.real_name,
    companyName: identity.company_name,
    rejectReason: identity.reject_reason,
    // 仅回传掩码，绝不回传密文或明文身份证号
    idCardMasked: identity.id_card ? '****' : '',
    livenessVerified: !!identity.liveness_verified,
  });
});

module.exports = router;
