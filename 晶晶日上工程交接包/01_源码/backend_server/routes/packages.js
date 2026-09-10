// routes/packages.js - V5.0 年度祝福套餐API
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { validate, v } = require('../middleware/validate');
const router = express.Router();

// 初始化默认套餐
function initDefaultPackages() {
  const count = db.prepare('SELECT COUNT(*) as c FROM packages').get().c;
  if (count === 0) {
    db.prepare(`INSERT INTO packages (name, price, video_count, validity_months, description, benefits)
      VALUES (?,?,?,?,?,?)`).run(
      '年度祝福套餐', 89900, 12, 12,
      '一年12条节日祝福视频，每月1条，均价75元/条',
      JSON.stringify(['春节祝福', '元宵祝福', '情人节祝福', '妇女节祝福', '母亲节祝福', '父亲节祝福',
        '端午祝福', '中秋祝福', '国庆祝福', '圣诞祝福', '生日祝福', '自定义祝福'])
    );
  }
}
initDefaultPackages();

// 获取套餐列表
router.get('/', (req, res) => {
  const list = db.prepare("SELECT * FROM packages WHERE status = 'active'").all();
  res.json({
    list: list.map(p => ({
      id: p.id, name: p.name, price: p.price / 100, videoCount: p.video_count,
      validityMonths: p.validity_months, description: p.description,
      benefits: p.benefits ? JSON.parse(p.benefits) : [],
    })),
  });
});

// 购买套餐（需登录）
router.post('/:id/purchase', auth, async (req, res) => {
  const pkg = db.prepare("SELECT * FROM packages WHERE id = ? AND status = 'active'").get(req.params.id);
  if (!pkg) return res.status(404).json({ message: '套餐不存在' });

  // TODO: 接入支付，此处创建待支付订单
  const orderNo = 'PKG' + Date.now() + Math.floor(Math.random() * 1000);
  const startDate = new Date().toISOString();
  const endDate = new Date(Date.now() + pkg.validity_months * 30 * 86400000).toISOString();

  // 支付成功后创建user_packages记录（由paymentService回调触发）
  // 此处先创建待支付记录，实际用户套餐在支付回调中激活
  res.json({
    message: '套餐订单已创建',
    orderNo,
    amount: pkg.price / 100,
    packageName: pkg.name,
    // 实际环境调用 paymentService.createPayment
  });
});

// 我的套餐
router.get('/my', auth, (req, res) => {
  const list = db.prepare(`SELECT up.*, p.name as package_name, p.benefits
    FROM user_packages up
    LEFT JOIN packages p ON up.package_id = p.id
    WHERE up.user_id = ? ORDER BY up.created_at DESC`).all(req.userId);
  res.json({
    list: list.map(up => ({
      id: up.id, packageId: up.package_id, packageName: up.package_name,
      totalCount: up.total_count, usedCount: up.used_count,
      remaining: up.total_count - up.used_count,
      startDate: up.start_date, endDate: up.end_date, status: up.status,
      benefits: up.benefits ? JSON.parse(up.benefits) : [],
    })),
  });
});

// 使用套餐内一次视频（核销）
router.post('/:id/redeem', auth, (req, res) => {
  const up = db.prepare('SELECT * FROM user_packages WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!up) return res.status(404).json({ message: '套餐不存在' });
  if (up.status !== 'active') return res.status(400).json({ message: '套餐已过期或用完' });
  if (up.used_count >= up.total_count) return res.status(400).json({ message: '套餐次数已用完' });
  if (new Date(up.end_date) < new Date()) return res.status(400).json({ message: '套餐已过期' });

  db.prepare('UPDATE user_packages SET used_count = used_count + 1 WHERE id = ?').run(up.id);
  res.json({ message: '核销成功', remaining: up.total_count - up.used_count - 1 });
});

module.exports = router;
