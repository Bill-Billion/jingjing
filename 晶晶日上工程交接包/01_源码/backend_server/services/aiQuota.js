// services/aiQuota.js - AI 上游调用治理底座（并发额度 / 失败重试 / 成本流水与日熔断 / 余额告警预留）
// 被 smsService、volcSpeech、volcVisual 复用。所有金额单位：分。
const config = require('../config');
const logger = require('../utils/logger');

const Q = config.aiQuota;

// ---------------- 并发信号量（按能力分通道，超额排队） ----------------
const inflight = new Map();   // key -> 当前在途数
const waiters = new Map();    // key -> 等待队列

function release(key) {
  const n = (inflight.get(key) || 0) - 1;
  inflight.set(key, Math.max(0, n));
  const queue = waiters.get(key) || [];
  const next = queue.shift();
  if (next) { inflight.set(key, (inflight.get(key) || 0) + 1); next(); }
}

// 用法：const done = await acquire('video'); try{...}finally{done();}
async function acquire(key) {
  const limit = Q.concurrency[key] ?? 4;
  const cur = inflight.get(key) || 0;
  if (cur < limit) { inflight.set(key, cur + 1); return () => release(key); }
  await new Promise((resolve) => {
    const q = waiters.get(key) || [];
    q.push(resolve); waiters.set(key, q);
  });
  return () => release(key);
}

function inflightCount() {
  const o = {}; for (const [k, v] of inflight) o[k] = v; return o;
}

// ---------------- 失败重试（仅网络错误 / 429 / 5xx；业务 4xx 不重试） ----------------
function isRetryable(err, status) {
  if (status === 429 || (status >= 500 && status < 600)) return true;
  const m = (err && err.message) || '';
  return /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|timeout|aborted|network/i.test(m);
}

async function withRetry(fn, opt = {}) {
  const max = opt.max ?? Q.retry.max;
  let lastErr;
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      const status = e && e.status;
      if (attempt >= max || !isRetryable(e, status)) throw e;
      const delay = Q.retry.baseDelayMs * Math.pow(2, attempt);
      logger.warn('ai_retry', { attempt: attempt + 1, delay, error: e.message });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ---------------- 成本流水 + 每日熔断（滚动 24h） ----------------
const DAY_MS = 24 * 3600 * 1000;

function logCost({ svc, action, model, userId, billedUnits = 0, unit = '', estCostFen = 0, ok = 1, httpCode = null, requestId = null, meta = null }) {
  try {
    dbPrepare().prepare(
      `INSERT INTO ai_cost_log (created_at,svc,action,model,user_id,ok,http_code,billed_units,unit,est_cost_fen,request_id,meta)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      Date.now(), svc, action, model || null, userId ?? null, ok ? 1 : 0, httpCode, billedUnits, unit, estCostFen, requestId, meta ? JSON.stringify(meta).slice(0, 1000) : null
    );
  } catch (e) { logger.error('ai_cost_log_fail', { error: e.message }); }
}

let _db;
function dbPrepare() { if (!_db) _db = require('../db'); return _db; }

function rolling24hCostFen() {
  const row = dbPrepare()
    .prepare(`SELECT COALESCE(SUM(est_cost_fen),0) AS c FROM ai_cost_log WHERE created_at >= ? AND ok=1`)
    .get(Date.now() - DAY_MS);
  return row.c || 0;
}

// 调用前预算闸门：预计本次成本落地后是否超过日上限
function assertBudget(estCostFen = 0) {
  const used = rolling24hCostFen();
  if (Q.dailyCostCapFen > 0 && used + estCostFen > Q.dailyCostCapFen) {
    logger.error('ai_daily_cap_hit', { usedFen: used, estFen: estCostFen, capFen: Q.dailyCostCapFen });
    const e = new Error('今日AI调用额度已达上限，已临时熔断，请联系运营');
    e.code = 'AI_DAILY_CAP'; e.status = 429; throw e;
  }
}

// ---------------- 上游余额告警（预留：接入火山费用/余额API后填充） ----------------
// 目前火山无统一免费余额查询开放接口，先留 hook；后续可定时拉账单，低于阈值告警（短信/邮件/webhook）。
let lastBalanceAlert = 0;
function maybeLowBalanceAlert(balanceFen) {
  if (balanceFen == null) return;
  if (balanceFen <= Q.lowBalanceAlertFen && Date.now() - lastBalanceAlert > 3600 * 1000) {
    lastBalanceAlert = Date.now();
    logger.error('ai_low_balance_alert', { balanceFen, thresholdFen: Q.lowBalanceAlertFen });
    // TODO: 接入运营告警通道（短信/飞书机器人/邮件）
  }
}

module.exports = {
  acquire, release, inflightCount,
  withRetry, isRetryable,
  logCost, rolling24hCostFen, assertBudget,
  maybeLowBalanceAlert,
};
