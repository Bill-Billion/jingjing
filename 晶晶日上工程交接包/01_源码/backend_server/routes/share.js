// routes/share.js - V5.0 社交分享与裂变激励API
const express = require('express');
const db = require('../db');
const config = require('../config');
const auth = require('../middleware/auth');
const { validate, v } = require('../middleware/validate');
const router = express.Router();

// 生成分享海报（记录分享行为）
router.post('/create', auth, validate({
  orderNo: [v.required],
  shareChannel: [v.required],
}), (req, res) => {
  const { orderNo, shareChannel } = req.body;

  // 验证订单归属
  const order = db.prepare('SELECT id, user_id, talent_id, video_url, amount FROM video_orders WHERE order_no = ?')
    .get(orderNo);
  if (!order || order.user_id !== req.userId) {
    return res.status(403).json({ message: '订单不存在或无权分享' });
  }

  // TODO: 接入海报生成服务（Pillow/Canvas/云函数），合成视频缩略图+二维码+文案
  const posterUrl = ''; // 海报生成后填入OSS URL

  const r = db.prepare(`INSERT INTO share_records
    (user_id, order_no, share_channel, share_poster_url, reward_status)
    VALUES (?,?,?,?,'pending')`).run(req.userId, orderNo, shareChannel, posterUrl);

  res.json({
    message: '分享记录已创建',
    shareId: r.lastInsertRowid,
    posterUrl,
    shareText: '我在晶晶日上收到了专属数字人祝福视频，快来看看吧！',
    rewardRule: `好友通过您的链接注册并首单，您将获得${config.share.rewardAmount / 100}元优惠券`,
  });
});

// 被邀请人注册回调（通过分享链接注册时调用）
router.post('/invite-register', auth, (req, res) => {
  const { shareId } = req.body;
  if (!shareId) return res.status(400).json({ message: '缺少分享ID' });

  const share = db.prepare('SELECT * FROM share_records WHERE id = ?').get(shareId);
  if (!share) return res.status(404).json({ message: '分享记录不存在' });
  if (share.invitee_user_id) return res.status(400).json({ message: '该分享已被使用' });
  if (share.user_id === req.userId) return res.status(400).json({ message: '不能邀请自己' });

  // 记录被邀请人
  db.prepare('UPDATE share_records SET invitee_user_id = ? WHERE id = ?')
    .run(req.userId, shareId);

  // 给被邀请人发放首单优惠券
  const until = new Date(Date.now() + config.share.couponValidDays * 86400000).toISOString();
  db.prepare(`INSERT INTO coupons (user_id, amount, min_spend, source, valid_until)
    VALUES (?,?,0,'share_invitee',?)`).run(req.userId, config.share.inviteeRewardAmount, until);

  res.json({
    message: '邀请关系已建立',
    coupon: { amount: config.share.inviteeRewardAmount, validDays: config.share.couponValidDays },
  });
});

// 被邀请人首单成功后，给邀请人发奖励（由paymentService回调）
router.post('/reward-check', auth, (req, res) => {
  // 此接口内部调用：检查用户是否被邀请，如是则给邀请人发券
  const inviteeId = req.userId;
  const share = db.prepare("SELECT * FROM share_records WHERE invitee_user_id = ? AND reward_status = 'pending' LIMIT 1")
    .get(inviteeId);
  if (!share) return res.json({ rewarded: false });

  const until = new Date(Date.now() + config.share.couponValidDays * 86400000).toISOString();
  db.prepare(`INSERT INTO coupons (user_id, amount, min_spend, source, valid_until)
    VALUES (?,?,0,'share_reward',?)`).run(share.user_id, config.share.rewardAmount, until);
  db.prepare("UPDATE share_records SET reward_status = 'rewarded', reward_amount = ? WHERE id = ?")
    .run(config.share.rewardAmount, share.id);

  res.json({ rewarded: true, amount: config.share.rewardAmount });
});

// 我的分享记录和奖励
router.get('/my', auth, (req, res) => {
  const records = db.prepare(`SELECT * FROM share_records WHERE user_id = ? ORDER BY created_at DESC`)
    .all(req.userId);
  const coupons = db.prepare(`SELECT * FROM coupons WHERE user_id = ? ORDER BY created_at DESC`)
    .all(req.userId);
  const totalReward = coupons
    .filter(c => c.source === 'share_reward')
    .reduce((sum, c) => sum + c.amount, 0);

  res.json({
    records: records.map(r => ({
      id: r.id, orderNo: r.order_no, channel: r.share_channel,
      inviteeRegistered: !!r.invitee_user_id,
      rewardAmount: r.reward_amount, rewardStatus: r.reward_status,
      createdAt: r.created_at,
    })),
    coupons: coupons.map(c => ({
      id: c.id, amount: c.amount, minSpend: c.min_spend,
      status: c.status, source: c.source,
      validUntil: c.valid_until, usedAt: c.used_at,
    })),
    totalReward,
  });
});

module.exports = router;
