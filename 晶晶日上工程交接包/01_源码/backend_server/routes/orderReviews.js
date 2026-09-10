// routes/orderReviews.js - V5.0 订单评价/评分系统API
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { validate, v } = require('../middleware/validate');
const router = express.Router();

// 发表评价（订单完成后7天内）
router.post('/', auth, validate({
  orderNo: [v.required],
  orderType: [v.required, v.enum('video', 'endorsement')],
  qualityRating: [v.required, v.integer],
  speedRating: [v.required, v.integer],
  serviceRating: [v.required, v.integer],
  accuracyRating: [v.required, v.integer],
}), (req, res) => {
  const { orderNo, orderType, qualityRating, speedRating, serviceRating, accuracyRating, content, images } = req.body;

  // 校验评分范围
  for (const r of [qualityRating, speedRating, serviceRating, accuracyRating]) {
    if (r < 1 || r > 5) return res.status(400).json({ message: '评分必须在1-5之间' });
  }

  // 查询订单并验证归属
  const orderTable = orderType === 'video' ? 'video_orders' : 'endorsement_orders';
  const order = db.prepare(`SELECT * FROM ${orderTable} WHERE order_no = ?`).get(orderNo);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.user_id !== req.userId) return res.status(403).json({ message: '无权评价此订单' });
  if (order.status !== 'completed') return res.status(400).json({ message: '订单未完成，无法评价' });

  // 检查是否已评价
  const existing = db.prepare('SELECT id FROM order_reviews WHERE order_no = ?').get(orderNo);
  if (existing) return res.status(400).json({ message: '该订单已评价' });

  // 检查是否在评价期限内（7天）
  const completeTime = order.complete_time || order.deliver_time;
  if (completeTime) {
    const daysSince = (Date.now() - new Date(completeTime).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 7) return res.status(400).json({ message: '订单完成已超过7天，无法评价' });
  }

  // 计算综合评分（加权平均：质量40%、速度20%、服务20%、符合描述20%）
  const overall = Math.round(
    (qualityRating * 0.4 + speedRating * 0.2 + serviceRating * 0.2 + accuracyRating * 0.2) * 10
  ) / 10;

  db.prepare(`INSERT INTO order_reviews
    (order_no, order_type, user_id, talent_id, quality_rating, speed_rating,
     service_rating, accuracy_rating, overall_rating, content, images)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    orderNo, orderType, req.userId, order.talent_id,
    qualityRating, speedRating, serviceRating, accuracyRating, overall,
    content || '', JSON.stringify(images || [])
  );

  // 更新艺人评分（humans表维护平均评分缓存）
  const stats = db.prepare(`SELECT AVG(overall_rating) as avg_rating, COUNT(*) as count
    FROM order_reviews WHERE talent_id = ? AND status = 'active'`).get(order.talent_id);
  if (stats) {
    db.prepare('UPDATE humans SET heat = heat + 1 WHERE id = ?').run(order.talent_id);
  }

  res.json({ message: '评价成功', overallRating: overall });
});

// 获取艺人的评价列表（公开）
router.get('/talent/:talentId', (req, res) => {
  const { talentId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const offset = (page - 1) * pageSize;

  const list = db.prepare(`SELECT r.*, u.nickname as user_nickname, u.avatar as user_avatar
    FROM order_reviews r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.talent_id = ? AND r.status = 'active'
    ORDER BY r.created_at DESC LIMIT ? OFFSET ?`).all(talentId, pageSize, offset);

  const total = db.prepare("SELECT COUNT(*) as c FROM order_reviews WHERE talent_id = ? AND status = 'active'")
    .get(talentId).c;

  // 评分分布
  const distribution = db.prepare(`SELECT
    SUM(CASE WHEN overall_rating >= 4.5 THEN 1 ELSE 0 END) as star5,
    SUM(CASE WHEN overall_rating >= 3.5 AND overall_rating < 4.5 THEN 1 ELSE 0 END) as star4,
    SUM(CASE WHEN overall_rating >= 2.5 AND overall_rating < 3.5 THEN 1 ELSE 0 END) as star3,
    SUM(CASE WHEN overall_rating >= 1.5 AND overall_rating < 2.5 THEN 1 ELSE 0 END) as star2,
    SUM(CASE WHEN overall_rating < 1.5 THEN 1 ELSE 0 END) as star1,
    AVG(overall_rating) as avg_rating
    FROM order_reviews WHERE talent_id = ? AND status = 'active'`).get(talentId);

  res.json({
    list: list.map(r => ({
      id: r.id, orderNo: r.order_no,
      userNickname: r.user_nickname || '匿名用户', userAvatar: r.user_avatar,
      qualityRating: r.quality_rating, speedRating: r.speed_rating,
      serviceRating: r.service_rating, accuracyRating: r.accuracy_rating,
      overallRating: r.overall_rating, content: r.content,
      images: r.images ? JSON.parse(r.images) : [],
      talentReply: r.talent_reply, talentRepliedAt: r.talent_replied_at,
      createdAt: r.created_at,
    })),
    pagination: { page, pageSize, total },
    summary: {
      averageRating: Math.round((distribution.avg_rating || 0) * 10) / 10,
      totalReviews: total,
      distribution: {
        5: distribution.star5 || 0, 4: distribution.star4 || 0,
        3: distribution.star3 || 0, 2: distribution.star2 || 0, 1: distribution.star1 || 0,
      },
    },
  });
});

// 艺人回复评价
router.post('/:id/reply', auth, validate({ reply: [v.required] }), (req, res) => {
  const review = db.prepare('SELECT * FROM order_reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ message: '评价不存在' });

  const human = db.prepare('SELECT user_id FROM humans WHERE id = ?').get(review.talent_id);
  if (!human || human.user_id !== req.userId) return res.status(403).json({ message: '无权回复' });
  if (review.talent_reply) return res.status(400).json({ message: '已回复，不可修改' });

  db.prepare('UPDATE order_reviews SET talent_reply = ?, talent_replied_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(req.body.reply, review.id);
  res.json({ message: '回复成功' });
});

// 获取我的评价（买家视角）
router.get('/my', auth, (req, res) => {
  const list = db.prepare(`SELECT * FROM order_reviews WHERE user_id = ? ORDER BY created_at DESC`).all(req.userId);
  res.json({
    list: list.map(r => ({
      id: r.id, orderNo: r.order_no, orderType: r.order_type, talentId: r.talent_id,
      overallRating: r.overall_rating, content: r.content, createdAt: r.created_at,
    })),
  });
});

module.exports = router;
