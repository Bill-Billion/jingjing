// routes/projects.js - 定制剧项目（V4：主角席位定制服务，合规版）
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { adminAuth } = require('../middleware/admin');
const config = require('../config');
const { genOrderNo } = require('../utils/settlement');
const { withLock } = require('../utils/idempotent');
const { validate, v } = require('../middleware/validate');
const router = express.Router();

// 项目列表
router.get('/', (req, res) => {
  const { status } = req.query;
  // V10.1.1 分页参数强制整数兜底：NaN/负数/非法字符串一律回退默认，避免 better-sqlite3 datatype mismatch
  let pageNum = parseInt(req.query.page, 10);
  if (!Number.isInteger(pageNum) || pageNum < 1) pageNum = 1;
  // 兼容 pageSize / size 两种入参键名
  let sizeNum = parseInt(req.query.pageSize != null ? req.query.pageSize : req.query.size, 10);
  if (!Number.isInteger(sizeNum) || sizeNum < 1) sizeNum = 10;
  let sql = `SELECT p.*, h.name as talent_name, h.avatar as talent_avatar,
             (SELECT COALESCE(SUM(stock_total),0) FROM project_roles WHERE project_id = p.id) as seats_total,
             (SELECT COALESCE(SUM(stock_sold),0) FROM project_roles WHERE project_id = p.id) as seats_claimed
             FROM projects p LEFT JOIN humans h ON p.talent_id = h.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND p.status = ?'; params.push(status); }
  else {
    // V10.1 默认不外露待审核(pending)与失败(failed)项目
    sql += " AND p.status IN ('recruiting','success','preparing','producing','post','released','closed')";
  }
  sql += ' ORDER BY p.raised_amount DESC LIMIT ? OFFSET ?';
  const limit = Math.min(sizeNum, 50);
  params.push(limit, (pageNum - 1) * limit);
  let list;
  try { list = db.prepare(sql).all(...params); } catch (e) { console.error('[SQLDEBUG]', JSON.stringify(sql), 'P=', JSON.stringify(params), e.message); throw e; }
  res.json({
    list: list.map(p => ({
      id: p.id, title: p.title, cover: p.cover, type: p.type,
      talentName: p.talent_name, talentAvatar: p.talent_avatar,
      raised: p.raised_amount / 100, goal: p.goal_amount / 100,
      percent: Math.round(p.raised_amount / p.goal_amount * 100),
      clientCount: p.client_count, status: p.status,
      seatsTotal: p.seats_total, seatsClaimed: p.seats_claimed,
      endDate: p.end_date,
    })),
    page: pageNum, pageSize: limit,
  });
});

// 角色席位市场
router.get('/market/roles', (req, res) => {
  const projects = db.prepare(`
    SELECT p.id, p.title, p.cover, p.status, h.name as talent_name
    FROM projects p LEFT JOIN humans h ON p.talent_id = h.id
    WHERE p.status IN ('recruiting')`).all();
  const roles = [];
  projects.forEach(p => {
    db.prepare('SELECT * FROM project_roles WHERE project_id = ?').all(p.id).forEach(r => {
      roles.push({
        id: r.id, projectId: p.id, projectTitle: p.title, cover: p.cover,
        role: r.name, talent: p.talent_name || '待定',
        price: r.price / 100, stockTotal: r.stock_total, stockSold: r.stock_sold,
        deliverables: r.rights ? r.rights.split(',') : [],
      });
    });
  });
  res.json({ list: roles });
});

// 项目详情
router.get('/:id', (req, res) => {
  const p = db.prepare(`SELECT p.*, h.name as talent_name, h.avatar as talent_avatar,
    (SELECT COALESCE(SUM(stock_total),0) FROM project_roles WHERE project_id = p.id) as seats_total,
    (SELECT COALESCE(SUM(stock_sold),0) FROM project_roles WHERE project_id = p.id) as seats_claimed
    FROM projects p LEFT JOIN humans h ON p.talent_id = h.id WHERE p.id = ?`).get(req.params.id);
  if (!p) return res.status(404).json({ message: '项目不存在' });
  const roles = db.prepare('SELECT * FROM project_roles WHERE project_id = ?').all(p.id);
  const updates = db.prepare('SELECT title, content, created_at as date FROM project_updates WHERE project_id = ? ORDER BY created_at DESC').all(p.id);
  const milestones = db.prepare('SELECT * FROM project_milestones WHERE project_id = ?').all(p.id);
  res.json({
    id: p.id, title: p.title, cover: p.cover, type: p.type, intro: p.intro,
    planUrl: p.plan_url, talentName: p.talent_name, talentAvatar: p.talent_avatar,
    raised: p.raised_amount / 100, goal: p.goal_amount / 100,
    percent: Math.round(p.raised_amount / p.goal_amount * 100),
    clientCount: p.client_count, status: p.status,
    seatsTotal: p.seats_total, seatsClaimed: p.seats_claimed,
    startDate: p.start_date, endDate: p.end_date,
    complianceNotice: '本项目为数字人影视节目定制服务，支付的费用为制作服务费，获得角色出镜、成片、署名等服务交付物，不构成投资，不承诺任何货币回报。',
    roles: roles.map(r => ({
      id: r.id, name: r.name, price: r.price / 100,
      stockTotal: r.stock_total, stockSold: r.stock_sold,
      deliverables: r.rights ? r.rights.split(',') : [],
      isEasterEgg: r.price <= 100000,  // V5.0: 1000元以下为彩蛋档
    })),
    milestones: milestones.map(m => ({
      name: m.name, ratio: m.ratio, amount: m.amount / 100,
      status: m.status, releasedAt: m.released_at,
    })),
    updates,
  });
});

// 认领席位（原"投资/认购"，改为"定制服务认领"；支付成功后才生效）
router.post('/claim', auth, validate({
  projectId: [v.required, v.integer],
  roleId: [v.required, v.integer],
}), (req, res) => {
  const { projectId, roleId } = req.body;

  try {
    const result = withLock(`claim:${projectId}:${roleId}`, () => {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      if (!project) throw Object.assign(new Error('项目不存在'), { status: 404 });
      if (project.status !== 'recruiting') {
        throw Object.assign(new Error('该剧集当前不在认领期'), { status: 400 });
      }

      const roleRow = db.prepare('SELECT * FROM project_roles WHERE id = ? AND project_id = ?').get(roleId, projectId);
      if (!roleRow) throw Object.assign(new Error('角色席位不存在'), { status: 400 });

      // 名额校验（行锁保证不超卖）
      if (roleRow.stock_sold >= roleRow.stock_total) {
        throw Object.assign(new Error('该席位已被认领'), { status: 400 });
      }

      // 超募校验
      if (project.raised_amount + roleRow.price > project.goal_amount * (1 + config.customization.oversubscribePct)) {
        throw Object.assign(new Error('认领金额超出项目制作预算'), { status: 400 });
      }

      // 人数上限校验
      if (project.client_count >= config.customization.maxClients) {
        throw Object.assign(new Error('认领人数已达上限'), { status: 400 });
      }

      // 同一用户同一项目只能认领一次（已退款/已取消的单不计）
      const existing = db.prepare("SELECT id FROM claims WHERE project_id = ? AND user_id = ? AND status NOT IN ('refunded','cancelled')")
        .get(projectId, req.userId);
      if (existing) throw Object.assign(new Error('您已认领该剧集席位，不可重复认领'), { status: 400 });

      const orderNo = genOrderNo('RW');
      db.prepare(`INSERT INTO claims (order_no, user_id, project_id, role_id, role_name, amount, rights, status)
        VALUES (?,?,?,?,?,?,?, 'pending')`).run(
        orderNo, req.userId, projectId, roleId, roleRow.name, roleRow.price, roleRow.rights || ''
      );
      // 预占名额（支付超时释放）
      db.prepare('UPDATE project_roles SET stock_sold = stock_sold + 1 WHERE id = ?').run(roleId);
      return { orderNo, amount: roleRow.price };
    });
    res.json({
      orderNo: result.orderNo,
      amount: result.amount / 100,
      message: '席位认领订单已创建，请完成支付。支付即表示您同意《数字人影视节目定制服务协议》，知悉本服务为定制消费而非投资。'
    });
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
});

// 我的席位
router.get('/claim/my', auth, (req, res) => {
  const list = db.prepare(`
    SELECT i.*, p.title as project_title, p.cover, p.status as project_status
    FROM claims i LEFT JOIN projects p ON i.project_id = p.id
    WHERE i.user_id = ? ORDER BY i.created_at DESC`).all(req.userId);
  res.json({
    list: list.map(i => ({
      id: i.id, projectId: i.project_id, projectTitle: i.project_title, cover: i.cover,
      role: i.role_name, amount: i.amount / 100,
      deliverables: i.rights ? i.rights.split(',') : [],
      status: i.status, projectStatus: i.project_status, date: i.created_at,
    })),
  });
});

// 发起定制需求
router.post('/launch', auth, validate({ name: [v.required], phone: [v.required, v.phone] }), (req, res) => {
  const { name, phone, talentName, description, budget } = req.body;
  const result = db.prepare(`INSERT INTO launch_requests (user_id, name, phone, talent_name, description, budget)
    VALUES (?,?,?,?,?,?)`).run(req.userId, name, phone, talentName || '', description || '', budget || '');
  res.json({ id: result.lastInsertRowid, message: '提交成功，平台经纪人将在24小时内与您联系' });
});

// AI试镜申请
router.post('/audition', auth, validate({ name: [v.required], phone: [v.required, v.phone] }), (req, res) => {
  const { name, style, description, phone } = req.body;
  const result = db.prepare(`INSERT INTO audition_applications (user_id, name, style, description, phone)
    VALUES (?,?,?,?,?)`).run(req.userId, name, style || '', description || '', phone);
  res.json({ id: result.lastInsertRowid, message: 'AI试镜申请已提交，1-3个工作日内完成审核' });
});

// V5.0 平台监制四节点审核（剧本/开机/粗剪/成片）——V10.1 修复越权：仅平台管理员可调用
router.post('/:id/review-node', adminAuth(), (req, res) => {
  const { node, status, remark } = req.body;
  // node: script | shooting | rough_cut | final
  // status: approved | rejected
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ message: '项目不存在' });

  const milestoneName = { script: '剧本审核', shooting: '开机', rough_cut: '粗剪审核', final: '成片交付' }[node];
  if (!milestoneName) return res.status(400).json({ message: '无效的审核节点' });

  const milestone = db.prepare('SELECT * FROM project_milestones WHERE project_id = ? AND name = ?')
    .get(project.id, milestoneName);
  if (!milestone) return res.status(404).json({ message: '里程碑不存在' });

  if (status === 'approved') {
    db.prepare("UPDATE project_milestones SET status = 'released', released_at = CURRENT_TIMESTAMP, proof_url = ? WHERE id = ?")
      .run(remark || '', milestone.id);
  } else {
    db.prepare("UPDATE project_milestones SET status = 'rejected', proof_url = ? WHERE id = ?")
      .run(remark || '', milestone.id);
  }

  res.json({ message: `节点「${milestoneName}」${status === 'approved' ? '已通过' : '已驳回'}` });
});

// V5.0 快速成团检查（30天内成团赠送彩蛋席位）——V10.1：平台运营触发，仅管理员
router.post('/:id/check-fast-group', adminAuth(), (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ message: '项目不存在' });

  const daysSinceStart = project.start_date
    ? (Date.now() - new Date(project.start_date).getTime()) / 86400000
    : 0;

  const isFastGroup = daysSinceStart <= config.customization.fastGroupBonusDays
    && project.status === 'success'
    && project.fast_group_bonus === 0;

  if (isFastGroup) {
    db.prepare('UPDATE projects SET fast_group_bonus = 1 WHERE id = ?').run(project.id);
    // 额外赠送2个彩蛋席位
    const easterEggRole = db.prepare("SELECT * FROM project_roles WHERE project_id = ? AND price <= 100000 LIMIT 1")
      .get(project.id);
    if (easterEggRole) {
      db.prepare('UPDATE project_roles SET stock_total = stock_total + 2 WHERE id = ?').run(easterEggRole.id);
    }
    res.json({ fastGroup: true, bonusSeats: 2, message: '恭喜快速成团！额外赠送2个彩蛋席位' });
  } else {
    res.json({ fastGroup: false });
  }
});

module.exports = router;
