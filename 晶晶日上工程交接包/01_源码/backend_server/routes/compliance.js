// routes/compliance.js - 数字人授权协议与合规（V2新增；V12.5 阿里云人脸核身；V12.6 默认火山visual，可切回阿里云，服务端复验逻辑不变）
const express = require('express');
const db = require('../db');
const config = require('../config');
const auth = require('../middleware/auth');
const { validate, v } = require('../middleware/validate');
const faceVerify = require('../services/providers/faceVerify');
const logger = require('../utils/logger');
const router = express.Router();

// 授权范围定义
const SCOPES = {
  display: { name: '平台展示', desc: '数字人形象在晶晶日上公开展示', version: '1.0' },
  video: { name: '祝福视频', desc: '授权平台及用户基于数字人形象生成祝福类视频', version: '1.0' },
  endorsement: { name: '品牌代言', desc: '授权品牌方通过平台使用数字人形象进行商业代言', version: '1.0' },
  film: { name: '影视主演', desc: '授权定制剧项目使用数字人形象作为主演参与影视制作', version: '1.0' },
};

// 获取授权范围列表
router.get('/scopes', (req, res) => {
  res.json({ scopes: SCOPES });
});

// 签署授权协议（需人脸核身通过；livenessTxnId 即核身流水号 certifyId，服务端只信当前 provider 的云端复验结论）
router.post('/sign', auth, validate({
  humanId: [v.required, v.integer],
  scope: [v.required, v.enum('display', 'video', 'endorsement', 'film')],
  livenessTxnId: [v.required],
}), async (req, res) => {
  const { humanId, scope, livenessTxnId, expireAt } = req.body;
  const human = db.prepare('SELECT id, user_id FROM humans WHERE id = ?').get(humanId);
  if (!human || human.user_id !== req.userId) return res.status(403).json({ message: '无权操作' });

  // 检查是否已签署且未撤回
  const existing = db.prepare("SELECT id FROM authorization_agreements WHERE user_id = ? AND human_id = ? AND scope = ? AND status = 'active'")
    .get(req.userId, humanId, scope);
  if (existing) return res.status(400).json({ message: '已签署该授权' });

  // —— 人脸核身服务端复验（合规关键：不信任客户端回传，只信当前 provider 云端结论；火山 visual / 阿里云 DescribeSmartVerify 同形）——
  if (faceVerify.ready()) {
    const vr = await faceVerify.describeVerify(livenessTxnId);
    if (vr.passed === false) {
      return res.status(403).json({ message: '人脸核身未通过，请重新完成本人验证', subCode: vr.subCode || '' });
    }
    if (vr.passed === null) {
      return res.status(409).json({ message: '暂未获取到有效的人脸核身结论，请重新完成核身后再签署' });
    }
    logger.info('face_verify_sign_pass', { userId: req.userId, humanId, score: vr.score, subCode: vr.subCode || '' });
  } else if (config.env === 'production') {
    // 生产环境但未配置人脸核身能力：安全红线，禁止签署（不允许在缺失本人核验时签肖像授权）
    return res.status(501).json({ message: '人脸核身服务尚未配置，生产环境禁止签署授权' });
  } else if (!livenessTxnId || livenessTxnId.length < 8) {
    // 开发/测试环境且未接云：仅做流水号格式校验（演示）
    return res.status(400).json({ message: '无效的活体检测流水号' });
  }

  const scopeDef = SCOPES[scope];
  db.prepare(`INSERT INTO authorization_agreements
    (user_id, human_id, scope, scope_range, expire_at, liveness_txn_id, ip, device, version)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    req.userId, humanId, scope, scopeDef.desc, expireAt || null,
    livenessTxnId, req.ip, req.get('user-agent') || '', scopeDef.version
  );
  // 核身结论回写人脸素材台账（有记录则更新，无记录不报错）
  try {
    db.prepare("UPDATE face_materials SET liveness_verified=1, liveness_txn_id=? WHERE user_id=? AND human_id=?")
      .run(livenessTxnId, req.userId, humanId);
  } catch (_) { /* 台账缺记录不阻断签署 */ }

  res.json({ message: '授权签署成功', scope: scopeDef });
});

// 我的授权列表
router.get('/my', auth, (req, res) => {
  const list = db.prepare(`
    SELECT a.*, h.name as human_name, h.avatar
    FROM authorization_agreements a
    LEFT JOIN humans h ON a.human_id = h.id
    WHERE a.user_id = ? ORDER BY a.signed_at DESC`).all(req.userId);
  res.json({
    list: list.map(a => ({
      id: a.id, humanId: a.human_id, humanName: a.human_name, avatar: a.avatar,
      scope: a.scope, scopeName: SCOPES[a.scope]?.name || a.scope,
      scopeRange: a.scope_range, status: a.status,
      signedAt: a.signed_at, expireAt: a.expire_at, revokedAt: a.revoked_at,
    })),
  });
});

// 撤回授权
router.post('/revoke/:id', auth, (req, res) => {
  const ag = db.prepare('SELECT * FROM authorization_agreements WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!ag) return res.status(404).json({ message: '授权记录不存在' });
  if (ag.status !== 'active') return res.status(400).json({ message: '授权已失效' });

  // 影视主演授权在定制剧进行中不可撤回
  if (ag.scope === 'film') {
    const activeProject = db.prepare(`
      SELECT p.id FROM projects p
      JOIN claims i ON i.project_id = p.id
      WHERE p.talent_id = ? AND p.status IN ('recruiting','preparing','producing','post')
      AND i.status != 'refunded' LIMIT 1`).get(ag.human_id);
    if (activeProject) return res.status(400).json({ message: '该数字人有进行中的影视项目，暂不可撤回主演授权' });
  }

  db.prepare("UPDATE authorization_agreements SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE id = ?").run(ag.id);
  res.json({ message: '授权已撤回' });
});

// 检查某艺人是否有某范围授权（内部/公开）
router.get('/check/:humanId/:scope', (req, res) => {
  const ag = db.prepare("SELECT id, status, expire_at FROM authorization_agreements WHERE human_id = ? AND scope = ? AND status = 'active'")
    .get(req.params.humanId, req.params.scope);
  const valid = ag && (!ag.expire_at || new Date(ag.expire_at) > new Date());
  res.json({ authorized: !!valid });
});

module.exports = router;
