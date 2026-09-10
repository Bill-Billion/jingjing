// routes/messages.js - 平台内私信（IM）
// 设计原则：平台提供买卖双方的沟通工具（用于订单沟通、商务洽谈），
// 不主动提供联系方式交换功能，不屏蔽用户自由输入的内容，
// 但通过敏感词过滤和风险提示履行平台管理义务。
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { validate, v } = require('../middleware/validate');
const { monitorMessage } = require('../utils/abnormalMonitor');
const router = express.Router();

// 敏感词（基础版，生产环境接入阿里云/腾讯云内容安全API）
const SENSITIVE_WORDS = [
  '色情', '卖淫', '嫖娼', '毒品', '枪', '炸弹',
  '银行卡号', '密码', '验证码给我',
];

function containsSensitive(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const w of SENSITIVE_WORDS) {
    if (lower.includes(w.toLowerCase())) return w;
  }
  return null;
}

// 获取我的会话列表
router.get('/conversations', auth, (req, res) => {
  // 买家视角
  const asBuyer = db.prepare(`
    SELECT c.*, h.name as human_name, h.avatar as human_avatar, u.nickname as talent_name
    FROM conversations c
    LEFT JOIN humans h ON c.human_id = h.id
    LEFT JOIN users u ON c.talent_user_id = u.id
    WHERE c.user_id = ?
    ORDER BY c.last_message_at DESC
  `).all(req.userId);

  // 艺人视角
  const asTalent = db.prepare(`
    SELECT c.*, h.name as human_name, h.avatar as human_avatar, u.nickname as buyer_name, u.avatar as buyer_avatar
    FROM conversations c
    LEFT JOIN humans h ON c.human_id = h.id
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.talent_user_id = ?
    ORDER BY c.last_message_at DESC
  `).all(req.userId);

  res.json({
    asBuyer: asBuyer.map(c => ({
      id: c.id, humanId: c.human_id, humanName: c.human_name,
      humanAvatar: c.human_avatar, talentName: c.talent_name,
      lastMessage: c.last_message, lastMessageAt: c.last_message_at,
      unread: c.user_unread, orderNo: c.order_no,
    })),
    asTalent: asTalent.map(c => ({
      id: c.id, humanId: c.human_id, humanName: c.human_name,
      humanAvatar: c.human_avatar, buyerName: c.buyer_name,
      buyerAvatar: c.buyer_avatar, lastMessage: c.last_message,
      lastMessageAt: c.last_message_at, unread: c.talent_unread,
      orderNo: c.order_no,
    })),
  });
});

// 创建/获取会话（需要有订单关系）
router.post('/conversations', auth, validate({
  humanId: [v.required, v.integer],
}), (req, res) => {
  const { humanId, initialMessage } = req.body;
  const human = db.prepare('SELECT id, user_id, name FROM humans WHERE id = ? AND status = ?').get(humanId, 'active');
  if (!human) return res.status(404).json({ message: '艺人不存在或已下架' });
  if (human.user_id === req.userId) return res.status(400).json({ message: '不能和自己对话' });

  // 必须有订单关系才能发起私信（用于订单沟通和售后）
  const order = db.prepare(
    "SELECT order_no FROM video_orders WHERE talent_id = ? AND user_id = ? AND status IN ('paid','delivering','delivered','completed') LIMIT 1"
  ).get(humanId, req.userId);
  if (!order) {
    return res.status(403).json({ message: '下单后可与艺人沟通订单细节' });
  }

  // 获取或创建会话
  let conv = db.prepare('SELECT * FROM conversations WHERE user_id = ? AND human_id = ?').get(req.userId, humanId);
  if (!conv) {
    const result = db.prepare(`INSERT INTO conversations (user_id, talent_user_id, human_id, order_no)
      VALUES (?, ?, ?, ?)`).run(req.userId, human.user_id, humanId, order.order_no);
    conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid);

    // 系统欢迎消息
    db.prepare(`INSERT INTO messages (conversation_id, sender_id, receiver_id, content, msg_type)
      VALUES (?, 0, ?, '会话已建立，您可以与艺人沟通订单细节。平台提醒：为保障您的权益，请通过平台下单完成交易。', 'system')`
    ).run(conv.id, req.userId);
  }

  // 如果有初始消息，发送
  if (initialMessage && initialMessage.trim()) {
    const sensitive = containsSensitive(initialMessage);
    if (sensitive) return res.status(400).json({ message: `消息包含违规内容：${sensitive}` });
    db.prepare(`INSERT INTO messages (conversation_id, sender_id, receiver_id, content)
      VALUES (?, ?, ?, ?)`).run(conv.id, req.userId, human.user_id, initialMessage.trim());
    db.prepare('UPDATE conversations SET last_message = ?, last_message_at = CURRENT_TIMESTAMP, talent_unread = talent_unread + 1 WHERE id = ?')
      .run(initialMessage.trim().slice(0, 100), conv.id);
  }

  res.json({ conversationId: conv.id, message: '会话已建立' });
});

// 获取消息历史
router.get('/conversations/:id/messages', auth, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ message: '会话不存在' });
  if (conv.user_id !== req.userId && conv.talent_user_id !== req.userId) {
    return res.status(403).json({ message: '无权查看' });
  }

  const { before, limit = 50 } = req.query;
  let sql = 'SELECT * FROM messages WHERE conversation_id = ?';
  const params = [conv.id];
  if (before) { sql += ' AND id < ?'; params.push(before); }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(Math.min(Number(limit), 100));

  const list = db.prepare(sql).all(...params).reverse();

  // 标记已读
  if (conv.user_id === req.userId) {
    db.prepare('UPDATE conversations SET user_unread = 0 WHERE id = ?').run(conv.id);
    db.prepare('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0').run(conv.id, req.userId);
  } else {
    db.prepare('UPDATE conversations SET talent_unread = 0 WHERE id = ?').run(conv.id);
    db.prepare('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0').run(conv.id, req.userId);
  }

  res.json({
    list: list.map(m => ({
      id: m.id, senderId: m.sender_id, receiverId: m.receiver_id,
      content: m.content, msgType: m.msg_type, isRead: m.is_read,
      createdAt: m.created_at, isSystem: m.sender_id === 0,
    })),
    hasMore: list.length >= Number(limit),
  });
});

// 发送消息
router.post('/conversations/:id/messages', auth, validate({
  content: [v.required, v.string],
}), (req, res) => {
  const { content } = req.body;
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ message: '会话不存在' });

  const isBuyer = conv.user_id === req.userId;
  const isTalent = conv.talent_user_id === req.userId;
  if (!isBuyer && !isTalent) return res.status(403).json({ message: '无权操作' });

  const text = content.trim();
  if (!text || text.length > 2000) return res.status(400).json({ message: '消息长度1-2000字' });

  // 敏感词过滤
  const sensitive = containsSensitive(text);
  if (sensitive) return res.status(400).json({ message: `消息包含违规内容，请修改后重发` });

  const receiverId = isBuyer ? conv.talent_user_id : conv.user_id;
  const result = db.prepare(`INSERT INTO messages (conversation_id, sender_id, receiver_id, content)
    VALUES (?, ?, ?, ?)`).run(conv.id, req.userId, receiverId, text);

  // 更新会话最后消息和未读数
  if (isBuyer) {
    db.prepare('UPDATE conversations SET last_message = ?, last_message_at = CURRENT_TIMESTAMP, talent_unread = talent_unread + 1 WHERE id = ?')
      .run(text.slice(0, 100), conv.id);
  } else {
    db.prepare('UPDATE conversations SET last_message = ?, last_message_at = CURRENT_TIMESTAMP, user_unread = user_unread + 1 WHERE id = ?')
      .run(text.slice(0, 100), conv.id);
  }

  db.prepare(`INSERT INTO audit_logs (operator_id, action, target_type, target_id)
    VALUES (?, 'send_message', 'conversation', ?)`).run(req.userId, conv.id);

  // V4.0 异常行为监测：联系方式交换频率
  const alert = monitorMessage(conv.id, req.userId, receiverId, text, conv.human_id);

  res.json({
    id: result.lastInsertRowid,
    content: text,
    createdAt: new Date().toISOString(),
    message: '发送成功',
    riskWarning: alert ? alert.message : null,
  });
});

// 未读消息总数
router.get('/unread', auth, (req, res) => {
  const buyerUnread = db.prepare('SELECT COALESCE(SUM(user_unread),0) as n FROM conversations WHERE user_id = ?').get(req.userId).n;
  const talentUnread = db.prepare('SELECT COALESCE(SUM(talent_unread),0) as n FROM conversations WHERE talent_user_id = ?').get(req.userId).n;
  res.json({ totalUnread: buyerUnread + talentUnread });
});

module.exports = router;
