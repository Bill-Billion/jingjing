// routes/contacts.js - 联系方式双向申请（V3：购买后申请→艺人同意→解锁）
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const config = require('../config');
const { validate, v } = require('../middleware/validate');
const router = express.Router();

// 申请解锁艺人联系方式（需先购买过该艺人视频）
router.post('/apply', auth, validate({
  humanId: [v.required, v.integer],
  disclaimer: [v.required],  // 必须确认免责声明
}), (req, res) => {
  const { humanId, message } = req.body;

  const human = db.prepare('SELECT id, user_id, name FROM humans WHERE id = ?').get(humanId);
  if (!human) return res.status(404).json({ message: '艺人不存在' });

  // 必须购买过该艺人的视频
  const order = db.prepare(
    "SELECT id FROM video_orders WHERE talent_id = ? AND user_id = ? AND status IN ('completed','delivered','delivering','paid') LIMIT 1"
  ).get(humanId, req.userId);
  if (!order) {
    return res.status(403).json({ message: '需先购买该艺人的祝福视频后才能申请联系方式' });
  }

  // 不能给自己申请
  if (human.user_id === req.userId) {
    return res.status(400).json({ message: '不能申请自己的联系方式' });
  }

  // 检查是否已有待处理或已通过的申请
  const existing = db.prepare(
    "SELECT id, status FROM contact_requests WHERE requester_id = ? AND human_id = ? AND status IN ('pending','approved') ORDER BY created_at DESC LIMIT 1"
  ).get(req.userId, humanId);
  if (existing?.status === 'approved') {
    return res.status(400).json({ message: '已获得联系方式' });
  }
  if (existing?.status === 'pending') {
    return res.status(400).json({ message: '申请已提交，等待艺人确认' });
  }

  const result = db.prepare(
    `INSERT INTO contact_requests (requester_id, human_id, talent_user_id, order_no, message, platform_disclaimer)
     VALUES (?, ?, ?, (SELECT order_no FROM video_orders WHERE talent_id = ? AND user_id = ? LIMIT 1), ?, 1)`
  ).run(req.userId, humanId, human.user_id, humanId, req.userId, message || '希望与您建立联系，洽谈后续合作');

  // 审计日志
  db.prepare(`INSERT INTO audit_logs (operator_id, action, target_type, target_id, detail)
    VALUES (?, 'contact_apply', 'human', ?, ?)`).run(req.userId, humanId, message || '');

  res.json({
    id: result.lastInsertRowid,
    status: 'pending',
    message: '申请已提交，等待艺人确认',
    disclaimer: config.contact.disclaimer,
  });
});

// 艺人同意/拒绝联系方式申请
router.post('/handle/:id', auth, (req, res) => {
  const { action } = req.body; // approve | reject
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'action 必须为 approve 或 reject' });
  }

  const cr = db.prepare('SELECT * FROM contact_requests WHERE id = ?').get(req.params.id);
  if (!cr) return res.status(404).json({ message: '申请不存在' });
  if (cr.talent_user_id !== req.userId && req.role !== 'admin') {
    return res.status(403).json({ message: '无权操作' });
  }
  if (cr.status !== 'pending') {
    return res.status(400).json({ message: '该申请已处理' });
  }

  if (action === 'approve') {
    // 获取艺人联系方式并加密存储（简化：直接存JSON，生产环境应AES加密）
    const human = db.prepare('SELECT wechat, phone, email FROM humans WHERE id = ?').get(cr.human_id);
    const contactJson = JSON.stringify({ wechat: human.wechat, phone: human.phone, email: human.email });
    db.prepare("UPDATE contact_requests SET status = 'approved', contact_shared = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(contactJson, cr.id);
    db.prepare(`INSERT INTO audit_logs (operator_id, action, target_type, target_id, detail)
      VALUES (?, 'contact_approve', 'contact_request', ?, '')`).run(req.userId, cr.id);
    res.json({ message: '已同意，对方可查看您的联系方式' });
  } else {
    db.prepare("UPDATE contact_requests SET status = 'rejected', handled_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(cr.id);
    db.prepare(`INSERT INTO audit_logs (operator_id, action, target_type, target_id, detail)
      VALUES (?, 'contact_reject', 'contact_request', ?, '')`).run(req.userId, cr.id);
    res.json({ message: '已拒绝' });
  }
});

// 我收到的联系方式申请（艺人侧）
router.get('/received', auth, (req, res) => {
  const list = db.prepare(`
    SELECT cr.*, u.nickname as requester_name, u.avatar as requester_avatar, h.name as human_name, h.avatar as human_avatar
    FROM contact_requests cr
    LEFT JOIN users u ON cr.requester_id = u.id
    LEFT JOIN humans h ON cr.human_id = h.id
    WHERE cr.talent_user_id = ?
    ORDER BY cr.created_at DESC LIMIT 100
  `).all(req.userId);
  res.json({
    list: list.map(r => ({
      id: r.id,
      requesterName: r.requester_name,
      requesterAvatar: r.requester_avatar,
      humanName: r.human_name,
      humanAvatar: r.human_avatar,
      message: r.message,
      status: r.status,
      orderNo: r.order_no,
      createdAt: r.created_at,
      handledAt: r.handled_at,
    })),
  });
});

// 我发出的申请（买家侧）
router.get('/my', auth, (req, res) => {
  const list = db.prepare(`
    SELECT cr.*, h.name as human_name, h.avatar as human_avatar
    FROM contact_requests cr
    LEFT JOIN humans h ON cr.human_id = h.id
    WHERE cr.requester_id = ?
    ORDER BY cr.created_at DESC LIMIT 100
  `).all(req.userId);
  res.json({
    list: list.map(r => {
      let contact = null;
      if (r.status === 'approved' && r.contact_shared) {
        try { contact = JSON.parse(r.contact_shared); } catch (e) { contact = null; }
      }
      return {
        id: r.id,
        humanName: r.human_name,
        humanAvatar: r.human_avatar,
        message: r.message,
        status: r.status,
        contact,
        disclaimer: config.contact.disclaimer,
        createdAt: r.created_at,
        handledAt: r.handled_at,
      };
    }),
  });
});

module.exports = router;
