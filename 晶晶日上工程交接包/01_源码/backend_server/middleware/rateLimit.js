// middleware/rateLimit.js - 速率限制（内存版，生产环境换 Redis）
const config = require('../config');

const buckets = new Map();

function rateLimit(options) {
  const { windowMs, max, keyFn, message } = options;
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const windowStart = now - windowMs;
    const hits = (buckets.get(key) || []).filter(t => t > windowStart);
    if (hits.length >= max) {
      return res.status(429).json({ code: 429, message: message || '操作过于频繁，请稍后再试' });
    }
    hits.push(now);
    buckets.set(key, hits);
    next();
  };
}

const perMinute = (max, keyFn) => rateLimit({ windowMs: 60000, max, keyFn });

const limits = {
  // 登录：同IP每分钟5次
  login: perMinute(5, req => `login:${req.ip}`),
  // 短信验证码：同IP+手机号每分钟1次
  smsCode: perMinute(1, req => `sms:${req.ip}:${req.body?.phone || ''}`),
  // 下单：同用户每分钟10次
  createOrder: perMinute(10, req => `order:${req.userId}`),
  // 支付：同用户每分钟10次
  pay: perMinute(10, req => `pay:${req.userId}`),
  // 提现：同用户每小时5次
  withdraw: rateLimit({ windowMs: 3600000, max: 5, keyFn: req => `wd:${req.userId}`, message: '提现申请过于频繁' }),
  // 通用API：同IP每分钟120次
  api: perMinute(120, req => `api:${req.ip}`),
};

// 定期清理
setInterval(() => {
  const now = Date.now();
  for (const [k, hits] of buckets) {
    const fresh = hits.filter(t => t > now - 3600000);
    if (fresh.length === 0) buckets.delete(k);
    else buckets.set(k, fresh);
  }
}, 300000);

module.exports = limits;
