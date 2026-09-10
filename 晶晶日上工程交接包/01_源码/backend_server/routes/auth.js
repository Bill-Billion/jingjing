// routes/auth.js - 认证（V12：微信+手机号验证码+Apple登录，火山短信服务端校验，限流+安全校验）
// 手机号验证码：服务端生成、SHA256哈希存储、5分钟有效、一次性、错误锁定；dev兜底码仅非生产且短信总开关关闭时可用。
const express = require('express');
const axios = require('axios');
const db = require('../db');
const config = require('../config');
const { signToken } = require('../middleware/auth');
const limits = require('../middleware/rateLimit');
const { validate, v } = require('../middleware/validate');
const sms = require('../services/smsService');
const router = express.Router();

// 微信登录（APP端微信SDK授权后传code）
router.post('/wechat', limits.login, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: '缺少code' });
  let openid = null, unionid = null;
  if (config.wxPay.appId) {
    try {
      // V5.0安全修复：必须通过code2session接口获取openid，禁止客户端直接传入openid
      // 生产环境必须配置 WX_APPID 和 WX_SECRET，否则无法验证微信身份
      const resp = await axios.get('https://api.weixin.qq.com/sns/oauth2/access_token', {
        params: { appid: config.wxPay.appId, secret: process.env.WX_SECRET, code, grant_type: 'authorization_code' },
      });
      if (!resp.data.openid) {
        return res.status(401).json({ message: '微信登录验证失败：无效的code' });
      }
      openid = resp.data.openid; unionid = resp.data.unionid;
    } catch (err) {
      return res.status(500).json({ message: '微信登录服务暂时不可用' });
    }
  } else {
    // 开发环境Mock：仅在未配置WX_APPID时使用，生产环境必须配置
    if (config.env === 'production') {
      return res.status(500).json({ message: '微信登录未配置，禁止在生产环境使用Mock' });
    }
    openid = 'dev_wx_' + code.slice(0, 10);
  }
  let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
  if (!user) {
    const r = db.prepare('INSERT INTO users (openid, unionid, nickname) VALUES (?,?,?)').run(openid, unionid, '晶晶日上用户');
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  }
  const token = signToken({ userId: user.id, openid, role: user.role });
  res.json({ token, user: { id: user.id, nickname: user.nickname, avatar: user.avatar, phone: user.phone } });
});

// Apple登录（iOS必需）
router.post('/apple', limits.login, async (req, res) => {
  const { identityToken, nickname } = req.body;
  if (!identityToken) return res.status(400).json({ message: '缺少identityToken' });

  let appleSub;
  if (config.env === 'production') {
    // TODO: 生产环境实现Apple JWT验签（拉取 https://appleid.apple.com/auth/keys 公钥，RS256校验iss/aud/exp）
    return res.status(501).json({ message: 'Apple登录验签尚未实现，生产环境禁止登录' });
  } else {
    // 开发环境：从JWT payload中解析sub（不验签，仅开发用）
    try {
      const payload = JSON.parse(Buffer.from(identityToken.split('.')[1], 'base64').toString());
      appleSub = payload.sub || ('apple_dev_' + identityToken.slice(0, 10));
    } catch (e) {
      appleSub = 'apple_dev_' + identityToken.slice(0, 20);
    }
  }

  let user = db.prepare('SELECT * FROM users WHERE apple_sub = ?').get(appleSub);
  if (!user) {
    const r = db.prepare('INSERT INTO users (apple_sub, nickname) VALUES (?,?)').run(appleSub, nickname || 'Apple用户');
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  }
  const token = signToken({ userId: user.id, role: user.role });
  res.json({ token, user: { id: user.id, nickname: user.nickname, avatar: user.avatar } });
});

// 手机号验证码登录（V12：服务端真实验证码校验，开发环境可用 dev 兜底码，生产强制真实短信）
router.post('/phone', limits.login, validate({
  phone: [v.required, v.phone],
  code: [v.required],
}), async (req, res) => {
  const { phone, code, nickname } = req.body;
  try {
    // 统一走服务端校验：5分钟有效 / 一次性 / 错误锁定；dev兜底码在 smsService 内按环境与总开关判定
    const verify = sms.verifyCode(phone, code, 'login');

    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) {
      const r = db.prepare('INSERT INTO users (phone, nickname) VALUES (?,?)').run(phone, nickname || '用户' + phone.slice(-4));
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
    }
    const token = signToken({ userId: user.id, role: user.role });
    res.json({ token, via: verify.via, user: { id: user.id, nickname: user.nickname, avatar: user.avatar, phone: user.phone } });
  } catch (e) {
    return res.status(e.status || 400).json({ message: e.message || '验证码校验失败' });
  }
});

// 发送登录验证码（限流：同IP+号码每分钟1次；服务端另有限频/日上限/锁定）
router.post('/sms', limits.smsCode, validate({ phone: [v.required, v.phone] }), async (req, res) => {
  const { phone } = req.body;
  try {
    const r = await sms.sendLoginCode(phone, 'login', req.ip);
    if (r.dev) {
      // 通道未启用（签名/模板审核中）且为非生产环境：仅入库未真实下发，配合 dev 兜底码联调
      return res.json({ message: '开发环境：验证码已生成（未真实下发）', dev: true, ttlSeconds: r.ttlSeconds, resendAfterMs: r.resendAfterMs });
    }
    res.json({ message: '验证码已发送', ttlSeconds: r.ttlSeconds, resendAfterMs: r.resendAfterMs });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || '验证码发送失败' });
  }
});

// 更新用户信息
router.put('/profile', require('../middleware/auth'), (req, res) => {
  const { nickname, avatar, phone } = req.body;
  db.prepare('UPDATE users SET nickname = COALESCE(?, nickname), avatar = COALESCE(?, avatar), phone = COALESCE(?, phone), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(nickname || null, avatar || null, phone || null, req.userId);
  res.json({ message: '更新成功' });
});

// 账号注销（iOS 5.1.1(v) 要求 App 内可注销）：软注销 + PII 脱敏，保留资金台账不做物理删除
router.delete('/account', require('../middleware/auth'), (req, res) => {
  const uid = req.userId;
  const wallet = db.prepare('SELECT COALESCE(balance,0) b, COALESCE(frozen,0) f, COALESCE(pending,0) p FROM wallets WHERE user_id=?').get(uid);
  if (wallet && (wallet.b > 0 || wallet.f > 0 || wallet.p > 0)) {
    return res.status(409).json({ message: '仍有余额/冻结/在途担保资金，请先结算或提现后再注销' });
  }
  const open = db.prepare("SELECT COUNT(*) c FROM video_orders WHERE user_id=? AND status IN ('pending','paid','delivering','delivered')").get(uid).c;
  if (open > 0) return res.status(409).json({ message: '仍有未完成订单，暂不可注销' });
  const tx = db.transaction(() => {
    // 唯一列置 NULL 允许重新注册；昵称/头像脱敏；状态 deleted
    db.prepare("UPDATE users SET status='deleted', nickname='已注销用户', avatar=NULL, phone=NULL, openid=NULL, unionid=NULL, apple_sub=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(uid);
    db.prepare("UPDATE humans SET status='inactive' WHERE user_id=?").run(uid);
  });
  tx();
  try { require('../utils/logger').info('account_deleted', { userId: uid }); } catch (e) {}
  res.json({ message: '账号已注销' });
});

module.exports = router;
