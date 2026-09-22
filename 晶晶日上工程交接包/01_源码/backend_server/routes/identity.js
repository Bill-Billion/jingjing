// routes/identity.js - 实名认证（个人走当前合规 provider 的身份证二要素：默认火山rms/可切阿里云；企业/MCN 走人工审核）
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { validate, v } = require('../middleware/validate');
const {rejectLegacyIdentity,assessLegacyIdentity} = require('../src/modules/legacy-safety');

const router = express.Router();

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

  // A configured legacy SDK is not a verified provider. Refuse before collecting documents.
  if (identityType === 'personal') return rejectLegacyIdentity(req, res);
  const idCardCipher = '';
  const status = 'pending', rejectReason = '', verifiedBy = 'manual_pending';

  const existing = db.prepare('SELECT id FROM user_identities WHERE user_id=?').get(req.userId);
  if (existing) {
    db.prepare(`UPDATE user_identities SET identity_type=?, real_name=?, id_card=?, company_name=?, credit_code=?,
      license_url=?, status=?, reject_reason=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?`)
      .run(identityType, realName || '', idCardCipher, companyName || '', creditCode || '', licenseUrl || '', status, rejectReason, req.userId);
  } else {
    db.prepare(`INSERT INTO user_identities (user_id, identity_type, real_name, id_card, company_name, credit_code, license_url, status, reject_reason)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(req.userId, identityType, realName || '', idCardCipher, companyName || '', creditCode || '', licenseUrl || '', status, rejectReason);
  }

  res.json({ ok: true, submitted: true, verified: false, status, rejectReason, verifiedBy });
});

router.get('/status', auth, (req, res) => {
  const identity = db.prepare('SELECT * FROM user_identities WHERE user_id=?').get(req.userId);
  if (!identity) return res.json({ verified: false, status: 'none' });
  res.json({
    ...assessLegacyIdentity(identity),
    identityType: identity.identity_type,
    realName: identity.real_name,
    companyName: identity.company_name,
    rejectReason: identity.reject_reason,
    // 仅回传掩码，绝不回传密文或明文身份证号
    idCardMasked: identity.id_card ? '****' : '',
    livenessVerified: false, // Legacy flags do not contain independently verifiable evidence.
  });
});

module.exports = router;
