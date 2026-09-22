const { rejectUnmarkedDelivery } = require('../utils/watermark');
// routes/samples.js - V12 定制剧（普通档5000元：99元意向金担保 + 4901元制作款担保 + 7步流程 + 高端定制）
// 状态机：draft → intent_escrow → genre_selected → scripting → script_finalized →
//         producing（制作款担保）→ delivered → settled（验收后担保清分）
const express = require('express');
const db = require('../db');
const config = require('../config');
const auth = require('../middleware/auth');
const { genOrderNo } = require('../utils/settlement');
const { validate, v } = require('../middleware/validate');
const router = express.Router();
const { rejectLegacyPayment } = require('../src/modules/legacy-safety');

// 统一安全 JSON 解析：旧库/脏数据（如手工录入的中文纯文本“主角：组长陆衍（可定…”、空值、半截字符串）
// 一律回退到 fallback，绝不抛异常导致接口 500。期望数组时，脏文本按常见分隔符切分以保留原始信息。
function safeParse(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return fallback;
  const text = raw.trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed == null ? fallback : parsed;
  } catch (e) {
    // 非合法 JSON（seed.js 手工录入的中文纯文本/逗号顿号串/半截字符串）：绝不抛异常
    if (Array.isArray(fallback)) {
      // 逗号/顿号/分号/换行分隔串 → 数组；无分隔符的中文纯文本 → 单元素数组原样保留
      const arr = text.split(/[,，、;；\n\r]+/).map(s => s.trim()).filter(Boolean);
      return arr.length ? arr : fallback;
    }
    if (fallback && typeof fallback === 'object') {
      // 期望对象却拿到脏文本：包成 { raw } 保留原文，避免信息丢失，也不污染既有字段
      return { raw: text };
    }
    // 期望字符串/其它：原样返回中文纯文本
    return text;
  }
}

// 步骤定义（APP 7步进度条，与状态机一一对应）
const STEPS = [
  { key: 'intent_escrow', label: '意向金担保', desc: '支付99元意向金到担保（可退可抵）' },
  { key: 'genre_selected', label: '选择类型', desc: '在选剧库选择喜欢的类型' },
  { key: 'scripting', label: '选定剧本并创作', desc: '选定对标剧本，编剧创作初稿（含2轮修改）' },
  { key: 'script_finalized', label: '剧本定稿', desc: '确认定稿并签署制作前电子合同' },
  { key: 'producing', label: '制作款担保·制作中', desc: '支付4901元制作款到担保（99元已抵扣，合计5000元）' },
  { key: 'delivered', label: '成片交付', desc: 'AI制作宣发片并交付，7天内可1次免费修改' },
  { key: 'settled', label: '验收分账', desc: '确认验收后担保清分，项目计划书生成' },
];

// ========== 基础档：创建样片订单（普通档5000元起，意向金99元） ==========
router.post('/order', auth, validate({
  humanId: [v.integer],
  contactName: [v.required],
  contactPhone: [v.required],
}), (req, res) => {
  const { humanId, contactName, contactPhone } = req.body;
  const orderNo = genOrderNo('SP');

  const created = db.prepare(`INSERT INTO sample_orders
    (order_no, user_id, human_id, amount, cost_amount, intent_amount, production_fee,
     status, step, contact_name, contact_phone)
    VALUES (?,?,?,?,?,?,?, 'draft', 0, ?, ?)`).run(
    orderNo, req.userId, humanId || null,
    config.sample.basePrice, 150000,
    config.sample.intentDeposit, config.sample.productionFee,
    contactName, contactPhone
  );

  res.json({
    orderNo,
    id: created.lastInsertRowid,
    status: 'draft',
    totalPrice: config.sample.basePrice / 100,
    intentDeposit: config.sample.intentDeposit / 100,
    productionFee: config.sample.productionFee / 100,
    step: 0,
    nextStep: '支付意向金',
    message: '订单已创建，请支付99元意向金锁档开始选剧（担保托管，可退、可抵制作款）',
  });
});

// ========== 第1步：支付意向金到担保（99元，可退可抵） ==========
router.post('/:id/pay-intent', auth, (req, res) => {
  const order = getOrderOrFail(req, res);
  if (!order) return;
  if (order.status !== 'draft') return res.status(400).json({ message: '订单状态异常，请刷新后重试' });

  return rejectLegacyPayment(req, res);
});

// ========== 第2步：选择类型 ==========
router.post('/:id/select-genre', auth, validate({
  genre: [v.required],
}), (req, res) => {
  const order = getOrderOrFail(req, res);
  if (!order) return;
  if (order.status !== 'intent_escrow') return res.status(400).json({ message: '请先支付意向金（担保托管中）' });
  if (!config.sample.genres.includes(req.body.genre)) {
    return res.status(400).json({ message: '不支持的类型', genres: config.sample.genres });
  }

  db.prepare(`UPDATE sample_orders SET genre=?, status='genre_selected', step=2, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(req.body.genre, order.id);

  // 返回该类型下的对标剧库（编剧推荐2-3部）
  const refs = db.prepare(`SELECT id, title, outline, characters, tags, heat_score FROM sample_library WHERE genre=? AND status='active' ORDER BY heat_score DESC LIMIT 3`).all(req.body.genre);

  res.json({
    message: '类型已选择，编剧将为您推荐对标剧本',
    step: 2,
    genre: req.body.genre,
    references: refs.map(r => ({
      ...r,
      characters: safeParse(r.characters, []),
      tags: safeParse(r.tags, []),
    })),
  });
});

// ========== 选剧库浏览（按类型分类） ==========
router.get('/library', (req, res) => {
  const { genre } = req.query;
  let sql = "SELECT id, genre, title, outline, characters, tags, market_data, heat_score, cover_url, video_url FROM sample_library WHERE status='active'";
  const params = [];
  if (genre) { sql += ' AND genre = ?'; params.push(genre); }
  sql += ' ORDER BY genre, heat_score DESC';
  const list = db.prepare(sql).all(...params);

  // 按类型分组
  const grouped = {};
  for (const item of list) {
    if (!grouped[item.genre]) grouped[item.genre] = [];
    grouped[item.genre].push({
      ...item,
      characters: safeParse(item.characters, []),
      tags: safeParse(item.tags, []),
      market_data: safeParse(item.market_data, {}),
    });
  }

  res.json({ genres: config.sample.genres, library: grouped });
});

// ========== 第3步：选定对标剧本 ==========
router.post('/:id/pick-reference', auth, validate({
  referenceId: [v.required, v.integer],
}), (req, res) => {
  const order = getOrderOrFail(req, res);
  if (!order) return;
  if (order.status !== 'genre_selected') return res.status(400).json({ message: '请先选择类型' });

  const ref = db.prepare('SELECT * FROM sample_library WHERE id = ? AND status = ?').get(req.body.referenceId, 'active');
  if (!ref) return res.status(404).json({ message: '对标剧本不存在' });

  db.prepare(`UPDATE sample_orders
    SET reference_script_id=?, status='scripting', step=3, script_status='writing', updated_at=CURRENT_TIMESTAMP
    WHERE id=?`).run(req.body.referenceId, order.id);

  res.json({
    message: '对标剧本已选定，编剧开始创作初稿（含2轮免费修改）',
    step: 3,
    reference: {
      id: ref.id, title: ref.title, outline: ref.outline,
      characters: safeParse(ref.characters, []),
    },
    freeRevisions: config.sample.freeRevisions,
    extraRevisionFee: config.sample.extraRevisionFee / 100,
  });
});

// ========== 第4步：获取剧本内容 ==========
router.get('/:id/script', auth, (req, res) => {
  const order = getOrderOrFail(req, res);
  if (!order) return;
  if (!['scripting', 'script_finalized', 'producing', 'delivered', 'settled'].includes(order.status)) {
    return res.status(400).json({ message: '剧本尚未开始创作' });
  }

  const ref = order.reference_script_id
    ? db.prepare('SELECT title, outline, characters FROM sample_library WHERE id = ?').get(order.reference_script_id)
    : null;

  res.json({
    orderNo: order.order_no,
    scriptStatus: order.script_status,
    revisionCount: order.revision_count,
    freeRevisions: config.sample.freeRevisions,
    extraRevisionFee: config.sample.extraRevisionFee / 100,
    reference: ref ? {
      title: ref.title, outline: ref.outline,
      characters: safeParse(ref.characters, []),
    } : null,
    scriptTitle: order.script_title,
    outline: order.script_outline,
    characters: safeParse(order.script_characters, []),
    draft: order.script_draft,
    final: order.script_final,
    feedback: safeParse(order.script_feedback, []),
  });
});

// ========== 第4步：提交修改意见 ==========
router.post('/:id/script-feedback', auth, validate({
  feedback: [v.required],
}), (req, res) => {
  const order = getOrderOrFail(req, res);
  if (!order) return;
  if (order.script_status !== 'draft_ready' && order.script_status !== 'revising') {
    return res.status(400).json({ message: '当前状态不可提交修改意见' });
  }

  const revisions = order.revision_count || 0;
  const isExtra = revisions >= config.sample.freeRevisions;
  const feedbackList = safeParse(order.script_feedback, []);
  feedbackList.push({ content: req.body.feedback, at: new Date().toISOString(), extra: isExtra });

  db.prepare(`UPDATE sample_orders
    SET script_feedback=?, revision_count=revision_count+1, script_status='revising', updated_at=CURRENT_TIMESTAMP
    WHERE id=?`).run(JSON.stringify(feedbackList), order.id);

  res.json({
    message: isExtra
      ? `修改意见已提交（超出免费轮次，将收取${config.sample.extraRevisionFee / 100}元/轮）`
      : '修改意见已提交，编剧将尽快修改',
    revisionCount: revisions + 1,
    freeRevisionsLeft: Math.max(0, config.sample.freeRevisions - revisions - 1),
    extraFee: isExtra ? config.sample.extraRevisionFee / 100 : 0,
  });
});

// ========== 第4步：编剧交付初稿（管理员/编剧） ==========
router.post('/:id/deliver-draft', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: '无权限' });
  const order = db.prepare('SELECT * FROM sample_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.script_status !== 'writing' && order.script_status !== 'revising') {
    return res.status(400).json({ message: '当前状态不可交付初稿' });
  }

  const { title, outline, characters, draft } = req.body;
  db.prepare(`UPDATE sample_orders
    SET script_title=?, script_outline=?, script_characters=?, script_draft=?,
        script_status='draft_ready', updated_at=CURRENT_TIMESTAMP
    WHERE id=?`).run(
    title || order.script_title, outline || order.script_outline,
    characters ? JSON.stringify(characters) : order.script_characters,
    draft || order.script_draft, order.id
  );

  res.json({ message: '剧本初稿已交付，请在APP上查看并确认或提出修改意见' });
});

// ========== 第5步：确认剧本定稿 ==========
router.post('/:id/finalize-script', auth, (req, res) => {
  const order = getOrderOrFail(req, res);
  if (!order) return;
  if (order.script_status !== 'draft_ready') {
    return res.status(400).json({ message: '剧本初稿尚未交付' });
  }

  db.prepare(`UPDATE sample_orders
    SET script_final=COALESCE(script_final, script_draft), script_status='finalized',
        status='script_finalized', step=4, updated_at=CURRENT_TIMESTAMP
    WHERE id=?`).run(order.id);

  res.json({
    message: '剧本已定稿，请支付4901元制作款（99元意向金已抵扣，合计5000元）',
    step: 4,
    productionFee: config.sample.productionFee / 100,
  });
});

// ========== 第5步：确认电子合同后支付制作款到担保（4901元，99意向金已抵扣） ==========
router.post('/:id/pay-production', auth, (req, res) => {
  const order = getOrderOrFail(req, res);
  if (!order) return;
  if (order.status !== 'script_finalized') return res.status(400).json({ message: '请先确认剧本定稿' });

  return rejectLegacyPayment(req, res);
});

// ========== 第6步：团队交付成片（管理员/制作团队） ==========
router.post('/:id/deliver', auth, rejectUnmarkedDelivery, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: '无权限' });
  const { sampleUrl, proposalUrl, previewUrl } = req.body;
  const order = db.prepare('SELECT * FROM sample_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.status !== 'producing') {
    return res.status(400).json({ message: '制作款未到担保或订单状态异常' });
  }

  db.prepare(`UPDATE sample_orders
    SET status='delivered', step=6, sample_url=?, proposal_url=?, preview_url=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?`).run(sampleUrl, proposalUrl || null, previewUrl || sampleUrl, order.id);

  res.json({
    message: '成片已交付，请在7天内验收，可申请1次免费修改',
    step: 6,
    reviewDays: config.sample.previewReviewDays,
    freeRedoCount: config.sample.freeRedoCount,
  });
});

// ========== 第6步：验收/申请修改 ==========
router.post('/:id/review', auth, validate({
  action: [v.required], // accept | redo
  reason: [],
}), (req, res) => {
  const order = getOrderOrFail(req, res);
  if (!order) return;
  if (order.status !== 'delivered') return res.status(400).json({ message: '成片尚未交付' });

  if (req.body.action === 'accept') {
    db.prepare(`UPDATE sample_orders SET status='settled', step=7, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(order.id);
    res.json({ message: '验收成功，担保资金已清分，项目计划书已生成，可发起定制剧角色售卖' });
  } else if (req.body.action === 'redo') {
    if ((order.redo_count || 0) >= config.sample.freeRedoCount) {
      return res.status(400).json({ message: '免费修改次数已用完' });
    }
    db.prepare(`UPDATE sample_orders SET redo_count=redo_count+1, status='producing', updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(order.id);
    res.json({ message: '修改申请已提交，团队将重新制作' });
  } else {
    res.status(400).json({ message: '无效操作' });
  }
});

// ========== 我的样片订单 ==========
router.get('/my', auth, (req, res) => {
  const list = db.prepare(`
    SELECT s.*, h.name as human_name, h.avatar
    FROM sample_orders s LEFT JOIN humans h ON s.human_id = h.id
    WHERE s.user_id = ? ORDER BY s.created_at DESC`).all(req.userId);
  res.json({
    list: list.map(s => formatOrder(s)),
  });
});

// ========== 订单详情 ==========
router.get('/:id', auth, (req, res) => {
  const order = db.prepare(`
    SELECT s.*, h.name as human_name, h.avatar
    FROM sample_orders s LEFT JOIN humans h ON s.human_id = h.id
    WHERE s.id = ?`).get(req.params.id);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.user_id !== req.userId && req.role !== 'admin') {
    return res.status(403).json({ message: '无权查看' });
  }
  res.json(formatOrder(order));
});

// ========== 高端定制：提交需求（CRM线索） ==========
router.post('/custom-request', auth, validate({
  name: [v.required],
  phone: [v.required],
  genre: [],
  format: [],
  budgetMin: [v.integer],
  budgetMax: [v.integer],
  specialRequirements: [],
  description: [],
}), (req, res) => {
  const { name, phone, genre, format, budgetMin, budgetMax, specialRequirements, description } = req.body;

  const result = db.prepare(`INSERT INTO custom_requests
    (user_id, name, phone, genre, format, budget_min, budget_max, special_requirements, description)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    req.userId, name, phone, genre || null, format || null,
    budgetMin || null, budgetMax || null,
    specialRequirements || null, description || null
  );

  res.json({
    requestId: result.lastInsertRowid,
    message: '高端定制需求已提交，商务将在24小时内联系您',
    milestones: config.customProduction.milestones,
  });
});

// ========== 高端定制：后台查看需求列表（管理员） ==========
router.get('/custom-requests/list', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: '无权限' });
  const { status } = req.query;
  let sql = 'SELECT * FROM custom_requests';
  const params = [];
  if (status) { sql += ' WHERE status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  const list = db.prepare(sql).all(...params);
  res.json({ list });
});

// ========== 确认样片并发起定制剧（保留原有功能） ==========
router.post('/launch-project/:orderNo', auth, (req, res) => {
  const order = db.prepare('SELECT * FROM sample_orders WHERE order_no = ? AND user_id = ?').get(req.params.orderNo, req.userId);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.status !== 'settled') return res.status(400).json({ message: '成片尚未验收完成（担保未清分）' });
  if (order.project_id) return res.status(400).json({ message: '该样片已关联定制剧项目' });

  const { title, type, goalAmount, intro, roles } = req.body;
  const goalFen = Math.round(Number(goalAmount) * 100);

  const txn = db.transaction(() => {
    const r = db.prepare(`INSERT INTO projects
      (title, cover, type, intro, plan_url, talent_id, goal_amount, raised_amount, status)
      VALUES (?,?,?,?,?,?,?,0,'pending')`).run(
      title, order.sample_url, type, intro, order.proposal_url, order.human_id, goalFen);
    const projectId = r.lastInsertRowid;
    if (roles && Array.isArray(roles)) {
      const insertRole = db.prepare('INSERT INTO project_roles (project_id, name, price, rights, stock_total) VALUES (?,?,?,?,?)');
      roles.forEach(role => {
        insertRole.run(projectId, role.name, Math.round(Number(role.price) * 100), role.rights || '', role.stock || 1);
      });
    }
    db.prepare('UPDATE sample_orders SET project_id = ? WHERE id = ?').run(projectId, order.id);
    return projectId;
  });
  const projectId = txn();
  res.json({ projectId, message: '定制剧项目已创建，等待平台审核' });
});

// ========== 辅助函数 ==========
function getOrderOrFail(req, res) {
  const order = db.prepare('SELECT * FROM sample_orders WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!order) { res.status(404).json({ message: '订单不存在' }); return null; }
  return order;
}

function formatOrder(s) {
  return {
    id: s.id,
    orderNo: s.order_no,
    status: s.status,
    step: s.step || 0,
    steps: STEPS,
    humanName: s.human_name, avatar: s.avatar,
    totalPrice: s.amount / 100,
    intentDeposit: (s.intent_amount || 9900) / 100,
    productionFee: (s.production_fee || 490100) / 100,
    intentEscrow: !!s.intent_paid,
    intentPaid: !!s.intent_paid,
    productionEscrow: !!s.production_paid,
    productionPaid: !!s.production_paid,
    genre: s.genre,
    referenceScriptId: s.reference_script_id,
    scriptTitle: s.script_title,
    scriptStatus: s.script_status,
    revisionCount: s.revision_count || 0,
    freeRevisions: config.sample.freeRevisions,
    sampleUrl: s.sample_url,
    proposalUrl: s.proposal_url,
    previewUrl: s.preview_url,
    redoCount: s.redo_count || 0,
    projectId: s.project_id,
    contactName: s.contact_name,
    contactPhone: s.contact_phone,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

module.exports = router;
