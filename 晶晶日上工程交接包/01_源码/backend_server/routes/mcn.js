// Legacy MCN records lack member consent and scope evidence. Preserve records, not authority.
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

function unavailable(code, message) {
  return (req, res) => res.status(503).json({ code, status: 'not_enabled', submitted: false, message });
}
const cooperationUnavailable = unavailable('MCN_CONSENT_NOT_READY', '本人确认与合作权限尚未启用，本次未绑定、解除或读取艺人资料');

router.post('/apply', auth, (req, res) => {
  const { name, licenseUrl, contactName, contactPhone } = req.body;
  if (typeof name !== 'string' || !name.trim() || typeof contactPhone !== 'string' || !contactPhone.trim()) {
    return res.status(400).json({ message: '请填写机构名称和联系方式' });
  }
  if ([licenseUrl, contactName].some(value => value !== undefined && typeof value !== 'string')) {
    return res.status(400).json({ message: '材料格式不正确' });
  }
  const existing = db.prepare('SELECT id FROM mcn_agencies WHERE user_id = ?').get(req.userId);
  if (existing) return res.status(400).json({ message: '已提交过申请' });
  // Application only: never replace a person's identity or promise an unapproved fee holiday.
  const result = db.prepare(`INSERT INTO mcn_agencies
    (user_id, name, license_url, contact_name, contact_phone, status)
    VALUES (?,?,?,?,?,'pending')`).run(req.userId, name, licenseUrl || '', contactName || '', contactPhone);
  res.json({ mcnId: result.lastInsertRowid, status: 'pending', submitted: true, verified: false,
    message: '机构材料已提交，等待审核；尚未建立艺人合作关系' });
});

router.get('/info', auth, (req, res) => {
  const mcn = db.prepare('SELECT id,name,status FROM mcn_agencies WHERE user_id = ?').get(req.userId);
  if (!mcn) return res.json({ status: 'none', verified: false, talents: [] });
  res.json({ id: mcn.id, name: mcn.name,
    status: mcn.status === 'rejected' ? 'rejected' : 'pending', recordedStatus: mcn.status,
    verified: false, verificationStatus: 'legacy_unverified',
    talents: [], cooperationStatus: 'not_enabled',
    message: '机构材料不等于合作授权；历史艺人关系需核对本人确认及合作范围' });
});

router.post('/talents/add', auth, cooperationUnavailable);
router.post('/talents/remove', auth, cooperationUnavailable);
for (const route of ['/dashboard', '/artists', '/export', '/ranking']) {
  router.get(route, auth, cooperationUnavailable);
}
router.post('/withdraw/batch', auth, unavailable('MCN_PAYOUT_NOT_READY', '批量出款尚未启用，本次未受理、未转账'));
router.get('/fan-profile', auth, unavailable('MCN_ANALYTICS_NOT_READY', '粉丝统计尚未接入真实数据'));
module.exports = router;
