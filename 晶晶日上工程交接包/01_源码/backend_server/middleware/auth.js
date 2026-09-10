// middleware/auth.js - JWT认证中间件（V2）
const jwt = require('jsonwebtoken');
const config = require('../config');

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ code: 401, message: '未登录' });
  try {
    const decoded = jwt.verify(token, config.jwt.secret, { issuer: config.jwt.issuer });
    req.userId = decoded.userId;
    req.openid = decoded.openid;
    req.role = decoded.role || 'user';
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? '登录已过期' : '登录态无效';
    return res.status(401).json({ code: 401, message: msg });
  }
}

// 可选认证：有token则解析，无token也放行
function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret, { issuer: config.jwt.issuer });
      req.userId = decoded.userId;
      req.role = decoded.role || 'user';
    } catch (e) { /* 忽略无效token */ }
  }
  next();
}

function signToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiresIn,
    issuer: config.jwt.issuer,
  });
}

module.exports = auth;
module.exports.auth = auth;
module.exports.optionalAuth = optionalAuth;
module.exports.signToken = signToken;
