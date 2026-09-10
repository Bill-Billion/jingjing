// routes/orders.js - V12 统一订单聚合（99元视频 / 品牌代言 / 定制剧 三类合一）
// 统一分组：pending 待付款 · producing 制作中 · completed 已完成
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

// 视频/代言订单状态 → 统一分组
function mediaGroup(status) {
  switch (status) {
    case 'pending':
    case 'pending_payment':
    case 'unpaid':
      return 'pending';
    case 'completed':
    case 'cancelled':
    case 'canceled':
    case 'refunded':
      return 'completed';
    default:
      // paid / delivering / delivered / redoing / dispute / reviewing ...
      return 'producing';
  }
}

// 定制剧（样片）订单状态 → 统一分组
function sampleGroup(status) {
  switch (status) {
    case 'draft':
      return 'pending';
    case 'settled':
    case 'cancelled':
      return 'completed';
    default:
      // intent_escrow / genre_selected / scripting / script_finalized / producing / delivered
      return 'producing';
  }
}

const SAMPLE_STATUS_TEXT = {
  draft: '待付意向金',
  intent_escrow: '意向金担保中',
  genre_selected: '待选剧本',
  scripting: '剧本创作中',
  script_finalized: '待付制作款',
  producing: '制作中',
  delivered: '待验收',
  settled: '已完成',
  cancelled: '已取消',
};

// GET /api/orders/all?group=all|pending|producing|completed
router.get('/all', auth, (req, res) => {
  const uid = req.userId;
  const group = req.query.group || 'all';

  // 1) 99元视频订单
  const videos = db.prepare(`
    SELECT o.*, t.title, h.name AS talent_name
    FROM video_orders o
    LEFT JOIN video_templates t ON o.template_id = t.id
    LEFT JOIN humans h ON o.talent_id = h.id
    WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 200
  `).all(uid).map(o => ({
    kind: 'video',
    orderNo: o.order_no,
    title: o.title || '数字人视频',
    counterparty: o.talent_name || '数字人艺人',
    amount: o.amount / 100,
    rawStatus: o.status,
    statusText: mediaStatusText(o.status),
    group: mediaGroup(o.status),
    canReview: o.status === 'completed',
    canAfterSales: ['delivered', 'completed', 'delivering'].includes(o.status),
    createdAt: o.created_at,
  }));

  // 2) 品牌代言订单
  const endorsements = db.prepare(`
    SELECT e.*, h.name AS talent_name
    FROM endorsement_orders e LEFT JOIN humans h ON e.talent_id = h.id
    WHERE e.user_id = ? ORDER BY e.created_at DESC LIMIT 200
  `).all(uid).map(e => ({
    kind: 'endorsement',
    orderNo: e.order_no,
    title: e.title || (e.brand ? `品牌代言·${e.brand}` : '品牌代言'),
    counterparty: e.talent_name || '数字人艺人',
    amount: e.amount / 100,
    rawStatus: e.status,
    statusText: mediaStatusText(e.status),
    group: mediaGroup(e.status),
    canReview: e.status === 'completed',
    canAfterSales: ['delivered', 'completed', 'delivering'].includes(e.status),
    createdAt: e.created_at,
  }));

  // 3) 定制剧订单
  const samples = db.prepare(`
    SELECT s.*, h.name AS human_name
    FROM sample_orders s LEFT JOIN humans h ON s.human_id = h.id
    WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 200
  `).all(uid).map(s => {
    const g = sampleGroup(s.status);
    return {
      kind: 'sample',
      detailId: s.id,
      orderNo: s.order_no,
      title: '定制剧（普通档）',
      counterparty: s.human_name || '平台制作团队',
      amount: s.amount / 100,
      rawStatus: s.status,
      statusText: SAMPLE_STATUS_TEXT[s.status] || s.status,
      group: g,
      canReview: false,
      canAfterSales: ['delivered', 'settled'].includes(s.status),
      createdAt: s.created_at,
    };
  });

  let list = [...videos, ...endorsements, ...samples];
  if (group !== 'all') list = list.filter(o => o.group === group);
  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const counts = {
    all: videos.length + endorsements.length + samples.length,
    pending: 0,
    producing: 0,
    completed: 0,
  };
  for (const o of [...videos, ...endorsements, ...samples]) {
    counts[o.group] = (counts[o.group] || 0) + 1;
  }

  res.json({ list, counts });
});

function mediaStatusText(status) {
  const map = {
    pending: '待付款',
    pending_payment: '待付款',
    unpaid: '待付款',
    paid: '已付款',
    accepting: '待接单',
    delivering: '制作中',
    delivered: '待验收',
    redoing: '重新制作中',
    dispute: '纠纷处理中',
    reviewing: '审核中',
    completed: '已完成',
    cancelled: '已取消',
    canceled: '已取消',
    refunded: '已退款',
  };
  return map[status] || status || '处理中';
}

module.exports = router;
