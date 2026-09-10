// routes/review.js - 内容审核（V12.5：submitReview 接入阿里云内容安全机审，命中自动打回，其余进人审）
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const moderation = require('../services/providers/moderation');
const logger = require('../utils/logger');
const router = express.Router();

/**
 * 提交内容审核（内部 await 调用）：建审核记录 → 云机审 → 命中风险自动打回业务表，否则进人审队列。
 * 云不可用时：文本回退本地词库，图片/视频转人审（绝不因云故障直接放行）。
 * @param {string} contentType video | endorsement | human | comment | project
 * @param {number} contentId 业务主键
 * @param {number} submitterId 提交人
 * @param {{url?:string,text?:string}} payload 待审素材（视频/图片URL 或 文本）
 * @returns {Promise<{decision:string,provider:string,reasons:string[]}>}
 */
async function submitReview(contentType, contentId, submitterId, payload = {}) {
  const info = db.prepare(`INSERT INTO content_reviews (content_type, content_id, submitter_id, status)
    VALUES (?,?,?, 'pending')`).run(contentType, contentId, submitterId);
  const reviewId = info.lastInsertRowid;

  let r;
  try {
    if (contentType === 'video' || contentType === 'endorsement') {
      r = await moderation.moderateVideo({ url: payload.url });
    } else if (contentType === 'human') {
      r = await moderation.moderateImage({ url: payload.url });
    } else {
      r = await moderation.moderateText(payload.text || '');
    }
  } catch (e) {
    logger.error('machine_review_error', { contentType, contentId, error: e.message });
    r = { decision: 'review', provider: 'error', reasons: [] };
  }

  const reason = (r.reasons || []).join(';');
  if (r.decision === 'reject') {
    // 命中风险：自动打回业务表，审核记录置机审完成（人审仍可在队列复核/申诉）
    db.prepare("UPDATE content_reviews SET machine_result='reject', reason=?, status='machine_done' WHERE id=?")
      .run(reason, reviewId);
    updateContentStatus(contentType, contentId, 'rejected', reason);
    logger.warn('machine_review_rejected', { contentType, contentId, provider: r.provider, reason });
  } else {
    // pass / review：不自动放行，统一进人审队列（云只做拦截、不做最终放行）
    db.prepare('UPDATE content_reviews SET machine_result=?, reason=?, status=? WHERE id=?')
      .run(r.decision, reason, 'machine_done', reviewId);
  }
  return { decision: r.decision, provider: r.provider, reasons: r.reasons || [] };
}

// 机审回调（第三方异步回调）
router.post('/machine-callback', (req, res) => {
  const { reviewId, result, score, reason } = req.body;
  const review = db.prepare('SELECT * FROM content_reviews WHERE id = ?').get(reviewId);
  if (!review) return res.status(404).json({ message: '审核记录不存在' });
  db.prepare(`UPDATE content_reviews SET machine_result = ?, machine_score = ?, status = ?
    WHERE id = ?`).run(result, score || 0, result === 'reject' ? 'rejected' : 'machine_done', reviewId);
  if (result === 'reject') {
    updateContentStatus(review.content_type, review.content_id, 'rejected', reason);
  }
  res.json({ message: 'ok' });
});

// 获取待人审列表（管理员）
router.get('/pending', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: '无权限' });
  const list = db.prepare(`SELECT * FROM content_reviews WHERE status = 'machine_done'
    ORDER BY created_at DESC LIMIT 50`).all();
  res.json({ list });
});

// 人审结论（管理员）
router.post('/:id/decide', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: '无权限' });
  const { result, reason } = req.body; // approve | reject
  const review = db.prepare('SELECT * FROM content_reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ message: '审核记录不存在' });

  const finalResult = result === 'approve' ? 'approved' : 'rejected';
  db.prepare(`UPDATE content_reviews SET human_result = ?, reviewer_id = ?, reason = ?,
    status = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(finalResult, req.userId, reason || '', finalResult, review.id);
  updateContentStatus(review.content_type, review.content_id, finalResult, reason);

  db.prepare(`INSERT INTO audit_logs (operator_id, action, target_type, target_id, detail)
    VALUES (?, 'content_review', ?, ?, ?)`).run(req.userId, review.content_type, review.content_id, result);
  res.json({ message: '审核完成' });
});

function updateContentStatus(contentType, contentId, result, reason) {
  if (contentType === 'video') {
    db.prepare('UPDATE video_orders SET review_status = ?, review_remark = ? WHERE id = ?')
      .run(result === 'approved' ? 'approved' : 'rejected', reason || '', contentId);
  } else if (contentType === 'endorsement') {
    db.prepare('UPDATE endorsement_orders SET review_status = ? WHERE id = ?')
      .run(result === 'approved' ? 'approved' : 'rejected', contentId);
  } else if (contentType === 'human') {
    db.prepare("UPDATE humans SET status = ?, reject_reason = ? WHERE id = ?")
      .run(result === 'approved' ? 'active' : 'rejected', reason || '', contentId);
  }
}

module.exports = router;
module.exports.submitReview = submitReview;
