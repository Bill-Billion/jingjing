// middleware/admin.js - 管理员认证
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

function adminAuth(requiredRole) {
  return (req, res, next) => {
    const token = req.headers['x-admin-token'] || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ code: 401, message: '管理员未登录' });
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      if (!decoded.adminId) return res.status(403).json({ code: 403, message: '无权限' });
      const admin = db.prepare('SELECT id, username, role, status FROM admins WHERE id = ?').get(decoded.adminId);
      if (!admin || admin.status !== 'active') return res.status(403).json({ code: 403, message: '账号不可用' });
      if (requiredRole && admin.role !== 'super' && admin.role !== requiredRole) {
        return res.status(403).json({ code: 403, message: '权限不足' });
      }
      req.admin = admin;
      next();
    } catch (e) {
      return res.status(401).json({ code: 401, message: '登录已过期' });
    }
  };
}

function auditLog(action, targetType) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400 && req.admin) {
        db.prepare(`INSERT INTO audit_logs (operator_id, operator_role, action, target_type, target_id, detail, ip, user_agent)
          VALUES (?,?,?,?,?,?,?,?)`).run(
          req.admin.id, req.admin.role, action, targetType || '',
          req.params.id || req.body?.id || '',
          JSON.stringify(req.body).slice(0, 2000),
          req.ip, req.get('user-agent') || ''
        );
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { adminAuth, auditLog };
