// utils/deposit.js - V5.0 艺人保证金管理
// 依据：最高人民法院2026年8月3日典型案例——平台需动态管理保证金
// V5.0修订：新艺人无需upfront缴纳，首笔收入冻结500元作为保证金
const config = require('../config');
const db = require('../db');

/**
 * 根据艺人近30天经营数据计算应缴保证金
 * @param {number} monthlyRevenue - 近30天成交额（分）
 * @param {number} complaintRate - 投诉率（0-1）
 * @returns {number} 应缴保证金（分）
 */
function calculateRequiredDeposit(monthlyRevenue, complaintRate = 0) {
  const tiers = config.deposit.tiers;
  let required = tiers[0].amount;
  for (const tier of tiers) {
    if (monthlyRevenue >= tier.monthlyRevenue) {
      required = tier.amount;
    }
  }
  // 投诉率超标追加保证金
  if (complaintRate > 0.05) {
    required += config.deposit.complaintRateSurcharge;
  }
  return required;
}

/**
 * 获取或创建艺人保证金记录
 * V5.0：默认collection_mode='first_income'，新艺人无需upfront缴纳
 */
function getOrCreateDeposit(userId, humanId) {
  let record = db.prepare('SELECT * FROM talent_deposits WHERE user_id = ?').get(userId);
  if (!record) {
    const required = config.deposit.baseAmount;
    db.prepare(`
      INSERT INTO talent_deposits (user_id, human_id, required_amount, paid_amount, status, collection_mode)
      VALUES (?, ?, ?, 0, 'active', 'first_income')
    `).run(userId, humanId, required);
    record = db.prepare('SELECT * FROM talent_deposits WHERE user_id = ?').get(userId);
  }
  return record;
}

/**
 * V5.0：从艺人首笔收入中冻结保证金
 * 在订单结算时调用，从艺人到手金额中扣除保证金差额
 * @param {number} userId - 艺人用户ID
 * @param {number} humanId - 数字人ID
 * @param {number} incomeAmount - 本次结算金额（分）
 * @returns {{deducted: number, remaining: number, depositPaid: number, depositRequired: number}}
 */
function collectDepositFromIncome(userId, humanId, incomeAmount) {
  const deposit = getOrCreateDeposit(userId, humanId);
  const shortfall = Math.max(0, deposit.required_amount - deposit.paid_amount);

  if (shortfall <= 0) {
    return { deducted: 0, remaining: incomeAmount, depositPaid: deposit.paid_amount, depositRequired: deposit.required_amount };
  }

  // 从本次收入中扣除保证金差额（不超过本次收入）
  const deduct = Math.min(shortfall, incomeAmount);
  const newPaid = deposit.paid_amount + deduct;

  db.prepare(`
    UPDATE talent_deposits
    SET paid_amount = ?, status = CASE WHEN ? >= required_amount THEN 'active' ELSE 'collecting' END,
        last_adjusted_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(newPaid, newPaid, userId);

  return {
    deducted: deduct,
    remaining: incomeAmount - deduct,
    depositPaid: newPaid,
    depositRequired: deposit.required_amount,
  };
}

/**
 * 更新艺人经营数据并调整保证金
 * 建议每日定时任务调用
 */
function refreshDeposit(userId, humanId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 近30天成交额
  const revenueRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as revenue
    FROM video_orders
    WHERE talent_id = ? AND status = 'completed' AND complete_time >= ?
  `).get(humanId, thirtyDaysAgo);

  // 近30天投诉数和订单数
  const orderRow = db.prepare(`
    SELECT COUNT(*) as total FROM video_orders
    WHERE talent_id = ? AND created_at >= ?
  `).get(humanId, thirtyDaysAgo);

  const complaintRow = db.prepare(`
    SELECT COUNT(*) as complaints FROM reports
    WHERE target_type = 'human' AND target_id = ? AND created_at >= ?
  `).get(humanId, thirtyDaysAgo);

  const refundRow = db.prepare(`
    SELECT COUNT(*) as refunds FROM video_orders
    WHERE talent_id = ? AND status = 'refunded' AND created_at >= ?
  `).get(humanId, thirtyDaysAgo);

  const monthlyRevenue = revenueRow.revenue || 0;
  const totalOrders = orderRow.total || 0;
  const complaintRate = totalOrders > 0 ? (complaintRow.complaints / totalOrders) : 0;
  const refundRate = totalOrders > 0 ? (refundRow.refunds / totalOrders) : 0;

  const required = calculateRequiredDeposit(monthlyRevenue, complaintRate);

  const deposit = getOrCreateDeposit(userId, humanId);
  db.prepare(`
    UPDATE talent_deposits
    SET required_amount = ?, monthly_revenue = ?, complaint_rate = ?, refund_rate = ?,
        last_adjusted_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(required, monthlyRevenue, complaintRate, refundRate, userId);

  return {
    required,
    paid: deposit.paid_amount,
    shortfall: Math.max(0, required - deposit.paid_amount),
    monthlyRevenue,
    complaintRate,
    refundRate,
    collectionMode: deposit.collection_mode || 'first_income',
  };
}

/**
 * 检查艺人保证金是否充足（接单前调用）
 * V5.0：first_income模式下，paid_amount为0也允许接单（首笔收入冻结）
 */
function checkDepositSufficient(userId, humanId) {
  if (!config.deposit.enabled) return { sufficient: true };
  const status = refreshDeposit(userId, humanId);
  const deposit = getOrCreateDeposit(userId, humanId);
  const isFirstIncomeMode = (deposit.collection_mode || 'first_income') === 'first_income';

  // first_income模式：只要保证金已缴足或正在从收入中收缴，都允许接单
  // 但如果required > paid且艺人已有收入记录（非首笔），则需要补缴
  if (isFirstIncomeMode && deposit.paid_amount === 0) {
    return { sufficient: true, firstIncomeMode: true, ...status };
  }

  return {
    sufficient: status.paid >= status.required,
    ...status,
  };
}

module.exports = {
  calculateRequiredDeposit,
  getOrCreateDeposit,
  collectDepositFromIncome,
  refreshDeposit,
  checkDepositSufficient,
};
