// jobs/scheduler.js - 定时任务（V2）
// Historical SQLite routines only. R0.6 scheduling uses MySQL jobs/leases in the independent Worker.
const db = require('../db');
const config = require('../config');
const logger = require('../utils/logger');
const { cleanExpired } = require('../utils/idempotent');
const paymentService = require('../services/paymentService');

const HOUR = 3600000;
const DAY = 86400000;

// 1. 自动验收：交付后7天未操作，自动验收结算
function autoVerify() {
  try {
    const orders = db.prepare(`SELECT * FROM video_orders
      WHERE status = 'delivered' AND verify_deadline < CURRENT_TIMESTAMP
      AND review_status = 'approved'`).all();
    for (const order of orders) {
      logger.info('auto_verify', { orderNo: order.order_no });
      // 调用videos路由的结算逻辑
      const { settleOrderExternal } = require('../routes/videos');
      if (settleOrderExternal) settleOrderExternal(order);
    }
    if (orders.length) logger.info('auto_verify_done', { count: orders.length });
  } catch (e) { logger.error('auto_verify_error', { error: e.message }); }
}

// 2. 自动退款：艺人接单后7天未交付
function autoRefundUndelivered() {
  try {
    const orders = db.prepare(`SELECT * FROM video_orders
      WHERE status = 'delivering' AND accept_time < datetime('now', '-7 days')`).all();
    for (const order of orders) {
      db.prepare("UPDATE video_orders SET status = 'dispute' WHERE id = ?").run(order.id);
      logger.info('auto_mark_dispute', { orderNo: order.order_no });
    }
  } catch (e) { logger.error('auto_refund_error', { error: e.message }); }
}

// 3. 定制剧到期处理
async function customizationExpiry() {
  try {
    // 到期未达标 → 失败 → 通过持牌渠道原路退款（V10.1：不再只插退款单做"假退款"）
    const failed = db.prepare(`SELECT * FROM projects
      WHERE status = 'recruiting' AND end_date < CURRENT_TIMESTAMP
      AND raised_amount < goal_amount * ?`).all(config.customization.successThreshold);
    for (const p of failed) {
      db.prepare("UPDATE projects SET status = 'failed' WHERE id = ?").run(p.id);
      logger.info('customization_failed', { projectId: p.id, title: p.title });
      const claims = db.prepare("SELECT * FROM claims WHERE project_id = ? AND status = 'paid'").all(p.id);
      for (const inv of claims) {
        try {
          await paymentService.refund(inv.order_no, inv.amount, '定制剧未达标自动退款', 0);
          db.prepare("UPDATE claims SET status = 'refunded' WHERE id = ?").run(inv.id);
        } catch (e) {
          // 渠道退款失败：保持 paid 并告警，转人工处理，绝不静默标记为已退
          logger.error('customization_refund_failed', { orderNo: inv.order_no, error: e.message });
        }
      }
    }

    // 到期达标 → 成功
    const success = db.prepare(`SELECT * FROM projects
      WHERE status = 'recruiting' AND end_date < CURRENT_TIMESTAMP
      AND raised_amount >= goal_amount * ?`).all(config.customization.successThreshold);
    for (const p of success) {
      db.prepare("UPDATE projects SET status = 'success' WHERE id = ?").run(p.id);
      // 创建里程碑
      const insertMs = db.prepare('INSERT INTO project_milestones (project_id, name, ratio, amount) VALUES (?,?,?,?)');
      config.customization.milestones.forEach(m => {
        insertMs.run(p.id, m.name, m.ratio, Math.floor(p.raised_amount * m.ratio));
      });
      logger.info('customization_success', { projectId: p.id, title: p.title });
    }
  } catch (e) { logger.error('customization_expiry_error', { error: e.message }); }
}

// 4. 支付超时取消（30分钟未支付）
function cancelExpiredOrders() {
  try {
    db.prepare("UPDATE video_orders SET status = 'cancelled' WHERE status = 'pending' AND created_at < datetime('now', '-30 minutes')").run();
    // V10.1 修复库存重复释放：只处理"本次超时"的未支付认领单，逐条释放一次后置为 cancelled，
    // 不再对全部历史 refunded 单反复扣减（否则 stock_sold 会被扣成负数）
    const expiredClaims = db.prepare("SELECT id, role_id FROM claims WHERE status = 'pending' AND created_at < datetime('now', '-30 minutes')").all();
    const releaseRole = db.prepare('UPDATE project_roles SET stock_sold = MAX(stock_sold - 1, 0) WHERE id = ?');
    const cancelClaim = db.prepare("UPDATE claims SET status = 'cancelled' WHERE id = ? AND status = 'pending'");
    for (const c of expiredClaims) {
      if (c.role_id) releaseRole.run(c.role_id);
      cancelClaim.run(c.id);
    }
  } catch (e) { logger.error('cancel_expired_error', { error: e.message }); }
}

// 5. 清理过期幂等键
function cleanIdempotent() {
  try { cleanExpired(); } catch (e) { /* ignore */ }
}

// 6. 每日资金对账：订单/支付/退款/结算四账勾稽，差异落 reconciliation_runs + 结构化日志 +（配置 webhook 才）外发
async function dailyReconciliation() {
  try {
    const recon = require('../services/reconciliation');
    await recon.runAndReport(db, { scope: 'daily' });
  } catch (e) { logger.error('daily_reconciliation_error', { error: e.message }); }
}

// Deliberately no timer registration or import-time execution.
// These legacy business rules must be migrated/reviewed before becoming Worker handlers.
module.exports = { autoVerify, customizationExpiry, cancelExpiredOrders, dailyReconciliation };
