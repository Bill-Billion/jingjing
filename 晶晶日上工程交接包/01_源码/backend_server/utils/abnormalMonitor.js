// utils/abnormalMonitor.js - V4.0 异常行为监测
// 依据：电子商务法第38条"知道或应当知道"标准——平台需主动监测
const config = require('../config');
const db = require('../db');

// 联系方式相关敏感词（用于监测私信中交换联系方式的频率）
const CONTACT_PATTERNS = [
  /微\s*信|vx|v\s*x|wechat|加\s*我|私\s*聊|联\s*系\s*方\s*式/i,
  /1\s*[3-9]\d\s*\d{4}\s*\d{4}/,  // 手机号
  /@\w+\.(com|cn|net|qq)/i,        // 邮箱
];

/**
 * 检测消息内容是否包含联系方式类敏感信息
 */
function detectContactExchange(content) {
  if (!content) return false;
  return CONTACT_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * 记录异常事件
 */
function recordEvent(eventType, severity, data = {}) {
  const {
    userId, humanId, conversationId, orderNo,
    description, metadata, actionTaken, actionBy = 'auto'
  } = data;

  db.prepare(`
    INSERT INTO abnormal_events
      (event_type, severity, user_id, human_id, conversation_id, order_no,
       description, metadata, action_taken, action_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventType, severity, userId || null, humanId || null,
    conversationId || null, orderNo || null,
    description || null,
    metadata ? JSON.stringify(metadata) : null,
    actionTaken || null, actionBy
  );
}

/**
 * 处理私信消息：检测联系方式交换频率
 * 当单会话内联系方式敏感词出现次数超过阈值时触发预警
 */
function monitorMessage(conversationId, senderId, receiverId, content, humanId) {
  if (!config.messaging.abnormalMonitor.enabled) return null;

  const hasContact = detectContactExchange(content);
  if (!hasContact) return null;

  // 统计该会话中联系方式出现次数
  const row = db.prepare(`
    SELECT COUNT(*) as cnt FROM messages
    WHERE conversation_id = ? AND created_at >= datetime('now', '-24 hours')
  `).get(conversationId);

  // 加上当前这条
  const contactCount = (row.cnt || 0) + 1;
  const threshold = config.messaging.abnormalMonitor.contactExchangeThreshold;

  if (contactCount >= threshold) {
    // 记录异常事件
    recordEvent('contact_exchange', 'medium', {
      userId: senderId,
      humanId,
      conversationId,
      description: `会话${conversationId}中24小时内联系方式敏感词出现${contactCount}次`,
      metadata: { contactCount, threshold },
      actionTaken: config.messaging.abnormalMonitor.autoActions.warning ? 'warning' : null,
    });

    // 检查该用户日触发次数
    const userAlertRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM abnormal_events
      WHERE user_id = ? AND event_type = 'contact_exchange'
        AND created_at >= datetime('now', '-24 hours')
    `).get(senderId);

    if (userAlertRow.cnt >= config.messaging.abnormalMonitor.dailyContactAlertPerUser) {
      recordEvent('offline_solicit', 'high', {
        userId: senderId,
        humanId,
        description: `用户${senderId}24小时内多次在私信中交换联系方式，疑似引导线下交易`,
        metadata: { alertCount: userAlertRow.cnt },
        actionTaken: 'manual_review',
      });
    }

    return {
      warning: true,
      message: config.messaging.riskTip,
    };
  }

  return null;
}

/**
 * 检查艺人是否处于高风险状态（接单前/提现前调用）
 */
function checkTalentRisk(humanId) {
  const monitor = config.messaging.abnormalMonitor;
  if (!monitor.enabled) return { isHighRisk: false };

  // 近30天投诉率
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const complaintRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM reports
    WHERE target_type = 'human' AND target_id = ? AND created_at >= ?
  `).get(humanId, thirtyDaysAgo);

  const orderRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM video_orders
    WHERE talent_id = ? AND created_at >= ?
  `).get(humanId, thirtyDaysAgo);

  const totalOrders = orderRow.cnt || 0;
  const complaints = complaintRow.cnt || 0;
  const complaintRate = totalOrders > 0 ? complaints / totalOrders : 0;

  // 未解决的高风险事件
  const highRiskEvents = db.prepare(`
    SELECT COUNT(*) as cnt FROM abnormal_events
    WHERE human_id = ? AND severity IN ('high', 'critical')
      AND resolved = 0 AND created_at >= ?
  `).get(humanId, thirtyDaysAgo);

  const isHighRisk = complaintRate > monitor.highRiskTalentComplaintRate
    || highRiskEvents.cnt > 0;

  return {
    isHighRisk,
    complaintRate,
    complaints,
    totalOrders,
    highRiskEventCount: highRiskEvents.cnt,
    actions: isHighRisk ? {
      restrictIM: monitor.autoActions.restrictIM,
      freezeWithdraw: monitor.autoActions.freezeWithdraw,
    } : null,
  };
}

module.exports = {
  detectContactExchange,
  recordEvent,
  monitorMessage,
  checkTalentRisk,
};
