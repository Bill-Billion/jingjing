// services/smsService.js - 火山引擎短信（手机号验证码）服务层
// 职责：验证码生成/哈希存储、发送限频、错误锁定、上游 SendSms、服务端一次性校验、dev 兜底。
// 密钥只从 config.sms（.env）读取，仅服务端使用；验证码只存 SHA256，日志经 logger 对手机号脱敏。
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const logger = require('../utils/logger');
const quota = require('./aiQuota');

const S = config.sms;
const SMS_COST_FEN = config.aiQuota.unitCostFen.smsPerMessage ?? 5; // 验证码短信约 0.045 元/条，估算 5 分
const DAY_MS = 24 * 3600 * 1000;

let _client = null;
function client() {
  if (_client) return _client;
  if (!S.accessKeyId || !S.secretAccessKey) throw new Error('未配置火山 AccessKey/Secret（VOLC_ACCESS_KEY_ID / VOLC_SECRET_ACCESS_KEY）');
  // 官方 SDK 已内置 host=sms.volcengineapi.com、serviceName=volcSMS 与 V4 签名
  const { SmsService } = require('@volcengine/openapi').sms;
  _client = new SmsService({ accessKeyId: S.accessKeyId, secretKey: S.secretAccessKey, region: S.region });
  return _client;
}

function genCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}
function hashCode(phone, code, purpose) {
  return crypto.createHash('sha256').update(`${phone}:${purpose}:${code}`).digest('hex');
}
function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), 'hex'); const bb = Buffer.from(String(b), 'hex');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// 上游业务错误码 -> 友好提示（HTTP 常为 200，错误在 ResponseMetadata.Error）
function friendlyError(code, message) {
  const map = {
    'RE:0000': '短信鉴权失败，请联系运营检查密钥',
    'RE:0001': '账号短信服务未开通',
    'RE:0002': '短信账号被关停，请联系客服',
    'RE:0003': '消息组不存在，请联系运营检查 SMS_ACCOUNT',
    'RE:0004': '短信签名未审核通过或不存在',
    'RE:0005': '短信模板未审核通过或不存在',
    'RE:0010': '短信账号余额不足，请充值',
    'RE:0013': '短信发送量超阈值',
    'VE:0003': '签名与模板不一致',
  };
  return map[code] || `短信发送失败（${code || '未知'}）`;
}

function latestRow(phone, purpose) {
  return db.prepare('SELECT * FROM sms_verification_codes WHERE phone=? AND purpose=? ORDER BY id DESC LIMIT 1').get(phone, purpose);
}
function countLast24h(phone, purpose) {
  const r = db.prepare('SELECT COUNT(*) AS c FROM sms_verification_codes WHERE phone=? AND purpose=? AND created_at>=?').get(phone, purpose, Date.now() - DAY_MS);
  return r.c;
}

/**
 * 发送登录验证码。
 * @returns {Promise<{sent:boolean, dev:boolean, ttlSeconds:number, resendAfterMs:number}>}
 *  - SMS_ENABLED=true：真实下发；false 且非 production：只入库不下发（配合固定测试码/日志联调）。
 */
async function sendLoginCode(phone, purpose = 'login', ip = '') {
  if (!/^1[3-9]\d{9}$/.test(phone)) { const e = new Error('手机号格式不正确'); e.status = 400; throw e; }

  const last = latestRow(phone, purpose);
  const now = Date.now();
  if (last && last.locked_until > now) {
    const e = new Error('操作过于频繁，请稍后再试'); e.status = 429; throw e;
  }
  if (last && now - last.created_at < S.resendIntervalMs) {
    const left = Math.ceil((S.resendIntervalMs - (now - last.created_at)) / 1000);
    const e = new Error(`请求过于频繁，请 ${left} 秒后再试`); e.status = 429; throw e;
  }
  if (countLast24h(phone, purpose) >= S.dailyMaxPerPhone) {
    const e = new Error('今日获取验证码次数已达上限'); e.status = 429; throw e;
  }

  const code = genCode();
  const expiresAt = now + S.codeTtlSeconds * 1000;

  // 未启用真实通道（签名/模板审核中）时：
  //  - 生产环境直接拒绝（绝不在生产假装发送）；
  //  - 开发/演示环境生成并入库，走固定测试码兜底，保证联调链路完整。
  const channelReady = S.enabled && S.smsAccount && S.signName && S.loginTemplateId;
  if (!channelReady) {
    if (config.env === 'production') {
      logger.error('sms_not_ready_prod', { hasAccount: !!S.smsAccount, hasSign: !!S.signName, hasTpl: !!S.loginTemplateId, enabled: S.enabled });
      const e = new Error('短信通道尚未配置完成，请联系运营'); e.status = 503; throw e;
    }
    db.prepare(`INSERT INTO sms_verification_codes (phone,purpose,code_hash,expires_at,send_ip,created_at) VALUES (?,?,?,?,?,?)`)
      .run(phone, purpose, hashCode(phone, code, purpose), expiresAt, ip, now);
    logger.info('sms_dev_stored', { phone, purpose, ttl: S.codeTtlSeconds, note: '通道未启用,开发环境仅入库未真实下发' });
    return { sent: false, dev: true, ttlSeconds: S.codeTtlSeconds, resendAfterMs: S.resendIntervalMs };
  }

  // 预算闸门（短信按条计成本）
  quota.assertBudget(SMS_COST_FEN);
  const release = await quota.acquire('sms');
  let requestId = null, msgId = null;
  try {
    const resp = await quota.withRetry(() => client().Send({
      SmsAccount: S.smsAccount,
      Sign: S.signName,
      TemplateID: S.loginTemplateId,
      TemplateParam: JSON.stringify({ code }),
      PhoneNumbers: phone,
    }));
    const meta = resp && resp.ResponseMetadata;
    requestId = meta && meta.RequestId;
    const err = meta && meta.Error;
    if (err && err.Code) {
      quota.logCost({ svc: 'sms', action: 'SendSms', ok: 0, http_code: 200, billedUnits: 1, unit: '条', estCostFen: 0, requestId, meta: { code: err.Code } });
      const e = new Error(friendlyError(err.Code, err.Message)); e.status = 502; e.providerCode = err.Code; throw e;
    }
    msgId = (resp.Result && resp.Result.MessageID && resp.Result.MessageID[0]) || null;
    quota.logCost({ svc: 'sms', action: 'SendSms', ok: 1, http_code: 200, billedUnits: 1, unit: '条', estCostFen: SMS_COST_FEN, requestId });
  } finally {
    release();
  }

  db.prepare(`INSERT INTO sms_verification_codes (phone,purpose,code_hash,expires_at,send_ip,provider_msg_id,created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(phone, purpose, hashCode(phone, code, purpose), expiresAt, ip, msgId, now);
  logger.info('sms_sent_ok', { phone, purpose, requestId, msgId });
  return { sent: true, dev: false, ttlSeconds: S.codeTtlSeconds, resendAfterMs: S.resendIntervalMs };
}

/**
 * 服务端校验验证码（一次性、5 分钟有效、连续错误锁定）。
 * @returns {{ok:true}} 校验通过；失败抛错。
 */
function verifyCode(phone, input, purpose = 'login') {
  if (!/^1[3-9]\d{9}$/.test(phone)) { const e = new Error('手机号格式不正确'); e.status = 400; throw e; }
  if (!/^\d{6}$/.test(String(input || ''))) { const e = new Error('请输入 6 位数字验证码'); e.status = 400; throw e; }

  // dev 固定测试码兜底：仅非 production 且显式配置时可用，生产强制失效
  if (config.env !== 'production' && !S.enabled && S.devBackdoorCode && String(input) === String(S.devBackdoorCode)) {
    logger.info('sms_verify_devcode', { phone, purpose });
    return { ok: true, via: 'devcode' };
  }

  const row = latestRow(phone, purpose);
  const now = Date.now();
  const fail = (msg, status = 400) => { const e = new Error(msg); e.status = status; throw e; };
  if (!row) fail('验证码不存在，请先获取');
  if (row.locked_until > now) fail('错误次数过多，请 30 分钟后再试', 429);
  if (row.consumed) fail('验证码已使用，请重新获取');
  if (row.expires_at < now) fail('验证码已过期，请重新获取');

  if (!safeEqualHex(row.code_hash, hashCode(phone, input, purpose))) {
    const fc = row.fail_count + 1;
    if (fc >= S.verifyMaxFail) {
      db.prepare('UPDATE sms_verification_codes SET fail_count=?, locked_until=?, consumed=1 WHERE id=?')
        .run(fc, now + S.lockMinutes * 60 * 1000, row.id);
      fail('验证码错误次数过多，请重新获取并稍后再试', 429);
    }
    db.prepare('UPDATE sms_verification_codes SET fail_count=? WHERE id=?').run(fc, row.id);
    fail(`验证码错误，还可尝试 ${S.verifyMaxFail - fc} 次`);
  }

  db.prepare('UPDATE sms_verification_codes SET consumed=1, consumed_at=? WHERE id=?').run(now, row.id);
  logger.info('sms_verify_ok', { phone, purpose });
  return { ok: true, via: 'sms' };
}

// 通道状态（供健康检查/运维面板）
function channelStatus() {
  return {
    enabled: S.enabled,
    env: config.env,
    region: S.region,
    configured: { account: !!S.smsAccount, sign: !!S.signName, loginTemplate: !!S.loginTemplateId, aksk: !!(S.accessKeyId && S.secretAccessKey) },
    ready: !!(S.enabled && S.smsAccount && S.signName && S.loginTemplateId && S.accessKeyId && S.secretAccessKey),
    devBackdoor: config.env !== 'production' && !!S.devBackdoorCode,
  };
}

module.exports = { sendLoginCode, verifyCode, channelStatus, friendlyError };
