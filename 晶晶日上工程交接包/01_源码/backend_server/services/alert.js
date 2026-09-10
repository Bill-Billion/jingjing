// services/alert.js - 告警通道抽象（健康/对账/支付异常 → 事件）
// 永远先写结构化日志；仅当配置 ALERT_WEBHOOK_URL（钉钉/飞书/企业微信机器人或自建网关）时外发。
// 未配置不外发、不报错、不阻塞主流程；密钥/地址只从 .env 读取，不硬编码。
const logger = require('../utils/logger');

const SEV = { info: 'info', warn: 'warn', error: 'error', critical: 'critical' };

function webhookUrl() { return process.env.ALERT_WEBHOOK_URL || ''; }

// 简单内存去重：同 type+指纹 5 分钟内只发一次，避免告警风暴
const recent = new Map();
function shouldThrottle(fingerprint, windowMs = 5 * 60 * 1000) {
  const now = Date.now();
  const last = recent.get(fingerprint);
  if (last && now - last < windowMs) return true;
  recent.set(fingerprint, now);
  if (recent.size > 500) for (const [k, t] of recent) if (now - t > windowMs) recent.delete(k);
  return false;
}

/**
 * 发送一个告警事件。
 * @param {string} type 事件类型，如 reconciliation_diff / payment_abnormal / health_down
 * @param {object} [payload] 结构化内容（避免敏感明文，手机号等已在 logger 脱敏）
 * @param {{severity?:string, throttle?:boolean}} [opts]
 */
async function emit(type, payload = {}, opts = {}) {
  const severity = SEV[opts.severity] || 'warn';
  const event = { type, severity, payload, at: new Date().toISOString(), env: process.env.NODE_ENV || 'development' };
  const fp = type + ':' + (payload.fingerprint || JSON.stringify(payload).slice(0, 120));
  const throttled = opts.throttle !== false && shouldThrottle(fp);

  if (severity === 'error' || severity === 'critical') logger.error('alert:' + type, { severity, throttled, ...payload });
  else logger.warn('alert:' + type, { severity, throttled, ...payload });

  const url = webhookUrl();
  if (!url || throttled) return { sent: false, throttled, reason: !url ? 'no_webhook' : 'throttled' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: `[晶晶日上][${severity}] ${type}` }, event }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) { logger.warn('alert_webhook_http', { status: r.status }); return { sent: false, http: r.status }; }
    return { sent: true };
  } catch (e) {
    // 外发失败只落日志，不影响业务
    logger.warn('alert_webhook_fail', { error: e.message });
    return { sent: false, error: e.message };
  }
}

module.exports = { emit, SEV, shouldThrottle };
