// routes/admin.js - 后台管理（V2新增：提现审核/退款/内容审核/数据看板）
const express = require('express');
const db = require('../db');
const { adminAuth, auditLog } = require('../middleware/admin');
const paymentService = require('../services/paymentService');
const router = express.Router();

// 管理员登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const { verifyPassword } = require('../utils/crypto');
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const admin = db.prepare('SELECT * FROM admins WHERE username = ? AND status = ?').get(username, 'active');
  if (!admin || !verifyPassword(password, admin.password_hash)) {
    return res.status(401).json({ message: '用户名或密码错误' });
  }
  db.prepare('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(admin.id);
  const token = jwt.sign({ adminId: admin.id, role: admin.role }, config.jwt.secret, { expiresIn: '8h' });
  res.json({ token, role: admin.role, username: admin.username });
});

// 数据看板
router.get('/dashboard', adminAuth(), (req, res) => {
  const stat = {
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    humans: db.prepare("SELECT COUNT(*) c FROM humans WHERE status='active'").get().c,
    pendingHumans: db.prepare("SELECT COUNT(*) c FROM humans WHERE status='pending'").get().c,
    videoOrders: db.prepare('SELECT COUNT(*) c FROM video_orders').get().c,
    videoRevenue: db.prepare("SELECT COALESCE(SUM(platform_fee),0) s FROM video_orders WHERE settle_status='settled'").get().s / 100,
    customizationRaised: db.prepare("SELECT COALESCE(SUM(raised_amount),0) s FROM projects WHERE status IN ('recruiting','success','preparing','producing','post','released','sharing','closed')").get().s / 100,
    pendingWithdrawals: db.prepare("SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM withdrawals WHERE status IN ('pending','reviewing')").get(),
    pendingReviews: db.prepare("SELECT COUNT(*) c FROM content_reviews WHERE status IN ('pending','machine_done')").get().c,
    disputes: db.prepare("SELECT COUNT(*) c FROM video_orders WHERE status='dispute'").get().c,
  };
  res.json(stat);
});

// 提现审核列表
router.get('/withdrawals', adminAuth('finance'), (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT w.*, u.phone, u.nickname FROM withdrawals w LEFT JOIN users u ON w.user_id = u.id';
  const params = [];
  if (status) { sql += ' WHERE w.status = ?'; params.push(status); }
  sql += ' ORDER BY w.created_at DESC LIMIT 100';
  const list = db.prepare(sql).all(...params);
  res.json({
    list: list.map(w => ({
      ...w,
      amount: w.amount / 100, fee: w.fee / 100,
      phone: w.phone ? w.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '',
    })),
  });
});

// 提现审批
router.post('/withdrawals/:id/approve', adminAuth('finance'), auditLog('withdraw_approve', 'withdrawal'), async (req, res) => {
  const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ message: '记录不存在' });
  if (!['pending', 'reviewing'].includes(w.status)) return res.status(400).json({ message: '状态异常' });

  try {
    // TODO: 调用银行代付接口/持牌分账机构提现接口
    db.prepare("UPDATE withdrawals SET status = 'success', reviewer_id = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(req.admin.id, w.id);
    db.prepare('UPDATE wallets SET frozen = frozen - ?, total_withdrawn = total_withdrawn + ? WHERE user_id = ?')
      .run(w.amount, w.amount, w.user_id);
    db.prepare("UPDATE transactions SET status = 'done' WHERE user_id = ? AND type = 'withdraw' AND status = 'pending' ORDER BY id DESC LIMIT 1")
      .run(w.user_id);
    res.json({ message: '提现已批准并打款' });
  } catch (err) {
    res.status(500).json({ message: '打款失败：' + err.message });
  }
});

router.post('/withdrawals/:id/reject', adminAuth('finance'), auditLog('withdraw_reject', 'withdrawal'), (req, res) => {
  const { reason } = req.body;
  const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ message: '记录不存在' });
  db.prepare("UPDATE withdrawals SET status = 'rejected', reject_reason = ?, reviewer_id = ? WHERE id = ?")
    .run(reason || '', req.admin.id, w.id);
  // 退回余额
  db.prepare('UPDATE wallets SET balance = balance + ?, frozen = frozen - ? WHERE user_id = ?')
    .run(w.amount, w.amount, w.user_id);
  res.json({ message: '已拒绝并退回余额' });
});

// 退款审批
router.post('/refunds/:id/approve', adminAuth(), auditLog('refund_approve', 'refund'), async (req, res) => {
  const refund = db.prepare('SELECT * FROM refunds WHERE id = ?').get(req.params.id);
  if (!refund) return res.status(404).json({ message: '退款记录不存在' });
  try {
    await paymentService.refund(refund.order_no, refund.amount, refund.reason, req.admin.id);
    // 更新订单状态
    const tableMap = { video: 'video_orders', endorsement: 'endorsement_orders', customization: 'claims' };
    const table = tableMap[refund.order_type];
    if (table) db.prepare(`UPDATE ${table} SET status = 'refunded' WHERE order_no = ?`).run(refund.order_no);
    res.json({ message: '退款成功' });
  } catch (err) {
    res.status(500).json({ message: '退款失败：' + err.message });
  }
});

// 艺人审核
router.post('/humans/:id/approve', adminAuth(), auditLog('human_approve', 'human'), (req, res) => {
  db.prepare("UPDATE humans SET status = 'active' WHERE id = ?").run(req.params.id);
  res.json({ message: '已通过' });
});
router.post('/humans/:id/reject', adminAuth(), auditLog('human_reject', 'human'), (req, res) => {
  db.prepare("UPDATE humans SET status = 'rejected', reject_reason = ? WHERE id = ?").run(req.body.reason || '', req.params.id);
  res.json({ message: '已拒绝' });
});

// 定制剧项目审核
router.post('/projects/:id/approve', adminAuth(), auditLog('project_approve', 'project'), (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ message: '项目不存在' });
  const endDate = new Date(Date.now() + 90 * 86400000).toISOString();
  db.prepare("UPDATE projects SET status = 'recruiting', start_date = CURRENT_TIMESTAMP, end_date = ? WHERE id = ?")
    .run(endDate, p.id);
  res.json({ message: '项目已上架定制剧' });
});

// ========== 资金对账（工程化整改）：只读核对 + 手动跑一次并落表 ==========
// 即时核对（不落表）：返回四本账汇总与差异明细
router.get('/reconciliation', adminAuth(), (req, res) => {
  const recon = require('../services/reconciliation');
  const result = recon.runReconciliation(db);
  res.json({ balanced: result.balanced, summary: result.summary, diffs: result.diffs, orderCount: result.perOrder.length });
});
// 手动执行并落 reconciliation_runs（财务/超管），同时按配置外发告警
router.post('/reconciliation/run', adminAuth('finance'), async (req, res) => {
  try {
    const recon = require('../services/reconciliation');
    const r = await recon.runAndReport(db, { scope: 'manual' });
    res.json({ id: r.id, balanced: r.balanced, summary: r.summary, diffs: r.diffs });
  } catch (e) {
    res.status(500).json({ message: '对账执行失败: ' + e.message });
  }
});
// 历史对账运行记录（最近 30 条）
router.get('/reconciliation/runs', adminAuth('finance'), (req, res) => {
  const rows = db.prepare('SELECT id,run_date,scope,order_book,pay_book,refund_book,settle_book,platform_book,fee_tax_book,diff_count,status,created_at FROM reconciliation_runs ORDER BY id DESC LIMIT 30').all();
  res.json({ list: rows });
});

// ========== AI 交付物人工审核（工程化整改）：待审核→通过/驳回，留版本与审核记录 ==========
router.post('/ai/deliverable/:id/approve', adminAuth(), (req, res) => {
  try {
    const visual = require('../services/volcVisual');
    const t = visual.reviewDeliverable(Number(req.params.id), 'approve', { reviewerId: req.admin.id });
    res.json({ id: t.id, deliverable_status: t.deliverable_status });
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});
router.post('/ai/deliverable/:id/reject', adminAuth(), (req, res) => {
  try {
    const visual = require('../services/volcVisual');
    const t = visual.reviewDeliverable(Number(req.params.id), 'reject', { reviewerId: req.admin.id, reason: req.body.reason || null });
    res.json({ id: t.id, deliverable_status: t.deliverable_status });
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});
// 重做/重生成：新建版本任务行，不覆盖旧交付物（真正上游重跑由业务侧携带原请求再发起）
router.post('/ai/deliverable/:id/regenerate', adminAuth(), (req, res) => {
  try {
    const visual = require('../services/volcVisual');
    const t = visual.regenerateTask(Number(req.params.id), { reason: req.body.reason || '人工重做' });
    res.json({ id: t.id, version_no: t.version_no, parent_task_id: t.parent_task_id, status: t.status });
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

module.exports = router;
