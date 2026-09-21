// routes/faceverify.js - 人脸核身（V12.5 阿里云实人认证；V12.6 默认火山 visual 有源比对，可切回阿里云；路由流程不变）
// 流程：App 采集本人人脸（拍照上传得 URL，或后续接入动作活体 metaInfo）→ POST /init 拿 certifyId
//      → 前端轮询 GET /result/:certifyId → 通过后用 certifyId 作为 livenessTxnId 调 /api/compliance/sign（服务端会再复验一次）
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { validate, v } = require('../middleware/validate');
const faceVerify = require('../services/providers/faceVerify');
const cryptoUtil = require('../utils/crypto');

const router = express.Router();
const {rejectLegacyIdentity} = require('../src/modules/legacy-safety');

// 初始化一次核身，返回 certifyId
router.post('/init', auth, rejectLegacyIdentity, validate({
  humanId: [v.required, v.integer],
}), async (req, res) => {
  const { humanId, facePictureUrl, facePictureBase64, metaInfo, mobile } = req.body;
  if (!facePictureUrl && !facePictureBase64 && !metaInfo) {
    return res.status(400).json({ message: '请提供本人人脸照片或客户端核身采集信息' });
  }

  const human = db.prepare('SELECT id, user_id FROM humans WHERE id=?').get(humanId);
  if (!human || human.user_id !== req.userId) return res.status(403).json({ message: '无权操作该数字人' });

  // 必须先完成实名认证（姓名+身份证号），核身用于证明“是该身份证本人”
  const identity = db.prepare("SELECT real_name, id_card, status FROM user_identities WHERE user_id=?").get(req.userId);
  if (!identity || identity.status !== 'approved' || !identity.id_card) {
    return res.status(400).json({ message: '请先完成实名认证后再进行人脸核身' });
  }
  const idNo = cryptoUtil.decrypt(identity.id_card) || '';
  if (!idNo) return res.status(500).json({ message: '实名信息读取失败，请重新实名认证' });

  if (!faceVerify.ready()) {
    return res.status(503).json({ message: '人脸核身服务尚未配置', ready: false });
  }

  const r = await faceVerify.initVerify({
    name: identity.real_name,
    idNo,
    facePictureUrl: facePictureUrl || '',
    facePictureBase64: facePictureBase64 || '',
    metaInfo: metaInfo || '',
    mobile: mobile || '',
    userId: String(req.userId),
    ip: req.ip,
  });
  if (!r.certifyId) {
    return res.status(502).json({ message: '人脸核身初始化失败，请稍后重试', detail: r.error || '' });
  }
  // 记录到人脸素材台账（certifyId 作为活体流水号）
  try {
    db.prepare(`INSERT INTO face_materials (user_id, human_id, liveness_txn_id, liveness_verified, status)
      VALUES (?,?,?,0,'active')`).run(req.userId, humanId, r.certifyId);
  } catch (_) { /* 台账写入失败不阻断核身流程 */ }

  res.json({ ok: true, certifyId: r.certifyId, outerOrderNo: r.outerOrderNo });
});

// 查询核身结果（前端轮询；签署时服务端仍会独立复验）
router.get('/result/:certifyId', auth, rejectLegacyIdentity, async (req, res) => {
  if (!faceVerify.ready()) return res.status(503).json({ message: '人脸核身服务尚未配置', ready: false });
  const r = await faceVerify.describeVerify(req.params.certifyId);
  // passed: true 通过 / false 未通过 / null 仍在处理中
  res.json({
    ready: true,
    passed: r.passed,
    score: r.score,
    threshold: r.threshold || null,
    subCode: r.subCode || '',
    processing: r.passed === null,
  });
});

module.exports = router;
